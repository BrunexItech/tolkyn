"""Tenant-facing Veo 3.1 video generation — request validation, governance
(model access + budget, both set by the super admin), and job bookkeeping.
Actual generation is asynchronous; see advance_pending_jobs() at the bottom,
called by the background scheduler, for the part that talks to Gemini."""
import logging
from pathlib import Path
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.limits import enforce_daily_limit
from app.core.video_models import (
    ALLOWED_ASPECT_RATIOS,
    DEFAULT_DURATIONS,
    NATIVE_MAX_DURATION,
    SELECTABLE_DURATIONS,
    VEO_MODELS,
    VeoModel,
    catalog_payload,
    duration_plan,
    estimate_cost_usd,
    get_model,
    video_pixel_width,
)
from app.models.user import User
from app.models.video_job import VideoJob, VideoJobStatus
from app.schemas.video import BrandUpdateRequest, VideoGenerateRequest, VideoModelsResponse
from app.services import gemini_video_client as gemini
from app.services.video_ffmpeg import concat_videos, extract_last_frame
from app.services.watermark import apply_watermark

logger = logging.getLogger(__name__)

_MEDIA_ROOT = Path(__file__).resolve().parents[2] / "media"
_VIDEO_DIR = _MEDIA_ROOT / "videos"


class VideoService:
    def __init__(self, db: AsyncSession, user: User):
        self.db = db
        self.user = user
        self.workspace_id = user.id

    # ------------------------------------------------------------- models
    def _allowed_durations(self) -> list[int]:
        """The clip lengths this workspace may choose from — the super admin's
        per-user list, intersected with what's actually selectable; falls back
        to the platform default when the admin hasn't set anything."""
        picked = [d for d in (self.user.allowed_video_durations or []) if d in SELECTABLE_DURATIONS]
        return sorted(picked) if picked else list(DEFAULT_DURATIONS)

    async def models_response(self) -> VideoModelsResponse:
        catalog = catalog_payload()
        allowed = self.user.allowed_video_models or []
        if allowed:
            catalog = [m for m in catalog if m["key"] in allowed]
        spent = await self._spent_usd()
        return VideoModelsResponse(
            models=catalog,
            budget_usd=self.user.video_budget_usd,
            spent_usd=spent,
            configured=bool(settings.GEMINI_API_KEY),
            brand_logo_url=self.user.brand_logo_url,
            brand_colors=self.user.brand_colors,
            allowed_durations=self._allowed_durations(),
        )

    # ------------------------------------------------------------- brand
    async def set_brand(self, data: BrandUpdateRequest) -> None:
        self.user.brand_logo_url = data.logo_url
        self.user.brand_colors = [c.strip() for c in data.colors if c.strip()][:6] or None
        await self.db.commit()

    async def clear_brand(self) -> None:
        self.user.brand_logo_url = None
        self.user.brand_colors = None
        await self.db.commit()

    async def _spent_usd(self) -> float:
        q = select(func.coalesce(func.sum(VideoJob.cost_usd), 0.0)).where(
            VideoJob.workspace_id == self.workspace_id, VideoJob.status != VideoJobStatus.FAILED
        )
        return float((await self.db.execute(q)).scalar() or 0.0)

    # --------------------------------------------------------------- jobs
    async def create_job(self, data: VideoGenerateRequest) -> VideoJob:
        if not settings.GEMINI_API_KEY:
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "Video generation isn't set up yet — ask the platform admin to add a Gemini API key.",
            )

        await enforce_daily_limit(self.db, self.user, "video")

        allowed = self.user.allowed_video_models or []
        if allowed and data.model_key not in allowed:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "You don't have access to this video model. Ask the platform admin to enable it for you.",
            )
        if data.model_key not in VEO_MODELS:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown video model")
        allowed_durations = self._allowed_durations()
        if data.duration_seconds not in allowed_durations:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"This workspace can generate {', '.join(f'{d}s' for d in allowed_durations)} clips. "
                "Ask the platform administrator to enable other lengths.",
            )
        if data.aspect_ratio not in ALLOWED_ASPECT_RATIOS:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Aspect ratio must be one of {ALLOWED_ASPECT_RATIOS}")

        model = get_model(data.model_key)
        if model.price_per_second.get(data.resolution) is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{model.label} doesn't support {data.resolution}")

        cost = estimate_cost_usd(data.model_key, data.resolution, data.duration_seconds)
        if self.user.video_budget_usd is not None:
            spent = await self._spent_usd()
            if spent + cost > self.user.video_budget_usd:
                raise HTTPException(
                    status.HTTP_402_PAYMENT_REQUIRED,
                    f"This would exceed your video budget (${self.user.video_budget_usd:.2f}). "
                    f"Used ${spent:.2f} so far — ask the platform admin to raise it.",
                )

        job = VideoJob(
            owner_id=self.user.id,
            workspace_id=self.workspace_id,
            model_key=data.model_key,
            prompt=data.prompt.strip(),
            negative_prompt=(data.negative_prompt or "").strip() or None,
            aspect_ratio=data.aspect_ratio,
            resolution=data.resolution,
            duration_seconds=data.duration_seconds,
            # Audio isn't a toggle — Gemini rejects the parameter outright on
            # every Veo 3.1 model. Whether the clip has sound is fixed by the
            # model itself (Standard/Fast: yes, Lite: no).
            generate_audio=model.supports_audio,
            reference_image_url=data.reference_image_url,
            # Brand is a persistent per-account setting (see set_brand/clear_brand),
            # not something re-uploaded per generation — applied automatically.
            brand_logo_url=self.user.brand_logo_url,
            brand_colors=self.user.brand_colors,
            hero_logo_where=(
                (data.hero_logo_where or "").strip()[:200] or None
                if self.user.brand_logo_url
                else None
            ),
            status=VideoJobStatus.QUEUED,
            cost_usd=cost,
        )
        self.db.add(job)
        await self.db.commit()
        await self.db.refresh(job)
        return job

    async def list_jobs(self, limit: int = 40) -> List[VideoJob]:
        q = (
            select(VideoJob)
            .where(VideoJob.workspace_id == self.workspace_id)
            .order_by(VideoJob.created_at.desc())
            .limit(limit)
        )
        return list((await self.db.execute(q)).scalars().all())

    async def get_job(self, job_id: str) -> VideoJob:
        q = select(VideoJob).where(VideoJob.id == job_id, VideoJob.workspace_id == self.workspace_id)
        job = (await self.db.execute(q)).scalar_one_or_none()
        if not job:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Video job not found")
        return job

    async def delete_job(self, job_id: str) -> None:
        job = await self.get_job(job_id)
        await self.db.delete(job)
        await self.db.commit()


# ==========================================================================
# Background processing — polled by services/scheduler.py. Not workspace
# scoped: this walks every in-flight job across every tenant.
# ==========================================================================

def _resolve_media_path(url: Optional[str]) -> Optional[Path]:
    if not url or not url.startswith("/media/"):
        return None
    p = (_MEDIA_ROOT / url[len("/media/"):]).resolve()
    if _MEDIA_ROOT.resolve() in p.parents and p.is_file():
        return p
    return None


async def advance_pending_jobs(db: AsyncSession) -> int:
    """Starts QUEUED jobs and polls RUNNING ones. Returns how many jobs
    changed state, for logging."""
    q = select(VideoJob).where(VideoJob.status.in_([VideoJobStatus.QUEUED, VideoJobStatus.RUNNING]))
    jobs = list((await db.execute(q)).scalars().all())
    changed = 0

    for job in jobs:
        try:
            if job.status == VideoJobStatus.QUEUED:
                changed += await _start_job(db, job)
            else:
                changed += await _poll_job(db, job)
        except Exception as exc:  # noqa: BLE001 — one bad job must not block the rest
            logger.exception("video job %s failed", job.id)
            job.status = VideoJobStatus.FAILED
            job.error_message = str(exc)[:2000]
            await db.commit()
            changed += 1

    return changed


_NO_INVENTED_BRANDING = (
    "Do not render any logo, wordmark, emblem, brand name or invented branding on any "
    "sign, screen, poster, billboard, product, packaging, wall, garment or label — keep "
    "every such surface plain, clean and unbranded."
)
_NEG_BRANDING = "logos, wordmarks, brand names, invented signage, text on products, watermarks"

# Used instead of _NO_INVENTED_BRANDING whenever this segment carries the real
# logo as a Veo reference image ("ingredient") — see _segment_uses_logo_asset.
# Here the goal flips: get Veo to actually feature the provided asset, the way
# it's meant to be used, rather than forbidding all branding.
_FEATURE_LOGO_ASSET = (
    "One of the attached reference images is this brand's real logo. Feature it naturally "
    "wherever it would really appear in this shot — a sign, screen, package, banner, "
    "garment or similar surface — matching that surface's lighting, angle and material. Do "
    "not invent any OTHER logo, wordmark or brand name anywhere in the shot."
)


def _prompt_with_brand(
    prompt: str, brand_colors: Optional[List[str]], has_logo: bool, using_logo_asset: bool = False
) -> str:
    """Veo has no colour-palette parameter, so (1) fold the brand colours into
    the prompt text — the part that's guaranteed to work. Branding text then
    depends on whether this segment is passing the real logo as a Veo
    reference image: if so, ask Veo to feature it; if not (Lite, or a segment
    too short for reference images — see _segment_uses_logo_asset), forbid
    Veo from inventing its own logo so the corner watermark is the only mark."""
    parts = [prompt]
    if brand_colors:
        parts.append(
            f"Colour palette to reflect in lighting, props and colour grading: "
            f"{', '.join(brand_colors)}."
        )
    if using_logo_asset:
        parts.append(_FEATURE_LOGO_ASSET)
    elif has_logo:
        parts.append(_NO_INVENTED_BRANDING)
    return " ".join(parts)


def _negative_with_brand(
    negative_prompt: Optional[str], has_logo: bool, using_logo_asset: bool = False
) -> Optional[str]:
    if using_logo_asset or not has_logo:
        return negative_prompt
    base = (negative_prompt or "").strip()
    return f"{base}, {_NEG_BRANDING}".strip(" ,") if base else _NEG_BRANDING


def _segment_uses_logo_asset(model: VeoModel, seg_seconds: int, has_logo: bool) -> bool:
    """Whether a segment of this length can carry the logo through Veo's own
    reference-image branding: needs a logo, a model that supports it (not
    Lite), and — per Google's API — an 8-second segment exactly. Shared by
    _start_segment (to decide what to send Veo) and _finish_job (to decide
    what the fallback watermark still needs to cover) so the two can't drift."""
    return has_logo and model.supports_reference_images and seg_seconds == NATIVE_MAX_DURATION


def _image_mime(path: Path) -> str:
    return "image/jpeg" if path.suffix.lower() in (".jpg", ".jpeg") else "image/png"


_HERO_SIZE = {"16:9": "1536x1024", "9:16": "1024x1536", "1:1": "1024x1024"}


async def _build_hero_frame(job: VideoJob) -> Optional[str]:
    """Opt-in: render the opening still of the shot with the real brand logo
    composited onto the surface the user named, and hand it to Veo as the
    first frame. Best path to 'our logo, on that object, in the video' for a
    static/slow shot. Returns a /media/... url or None (fall back to plain)."""
    logo_path = _resolve_media_path(job.brand_logo_url)
    if not logo_path:
        return None
    from app.services.content_ai import generate_image
    from app.services.logo_scene import place_logo_in_scene

    try:
        frame = await generate_image(
            f"{job.prompt}. This is the opening still frame of a live-action video shot — "
            "photographic, realistic lighting and texture.",
            size=_HERO_SIZE.get(job.aspect_ratio, "1536x1024"),
            quality="high",
        )
        placed = await place_logo_in_scene(frame["url"], job.brand_logo_url, job.hero_logo_where or "")
        return placed or frame["url"]
    except Exception as exc:  # noqa: BLE001 — never block the video on this
        logger.warning("hero frame build failed: %s", exc)
        return None


async def _start_segment(db: AsyncSession, job: VideoJob) -> None:
    """Kick off the Veo generation for job.segment_index."""
    model = get_model(job.model_key)
    logo_path = _resolve_media_path(job.brand_logo_url)
    has_logo = bool(logo_path)
    plan = job.segment_plan or [job.duration_seconds]
    seg_seconds = plan[job.segment_index]

    # segment 0 → the user's/hero starting frame; later segments → the last
    # frame of the previous segment, so the clips flow into each other.
    ref_url = job.reference_image_url if job.segment_index == 0 else job.continuation_frame_url
    ref_path = _resolve_media_path(ref_url)
    ref_bytes = ref_path.read_bytes() if ref_path else None

    using_logo_asset = _segment_uses_logo_asset(model, seg_seconds, has_logo)
    asset_images = [{"bytes": logo_path.read_bytes(), "mime": _image_mime(logo_path)}] if using_logo_asset else None

    job.operation_name = await gemini.start_generation(
        model_id=model.model_id,
        prompt=_prompt_with_brand(job.prompt, job.brand_colors, has_logo, using_logo_asset),
        aspect_ratio=job.aspect_ratio,
        resolution=job.resolution,
        duration_seconds=seg_seconds,
        negative_prompt=_negative_with_brand(job.negative_prompt, has_logo, using_logo_asset),
        reference_image_bytes=ref_bytes,
        asset_images=asset_images,
    )
    job.status = VideoJobStatus.RUNNING
    await db.commit()


async def _start_job(db: AsyncSession, job: VideoJob) -> int:
    has_logo = bool(_resolve_media_path(job.brand_logo_url))

    if job.hero_logo_where and not job.reference_image_url and has_logo:
        hero = await _build_hero_frame(job)
        if hero:
            job.reference_image_url = hero
            await db.commit()

    if not job.segment_plan:
        job.segment_plan = duration_plan(job.duration_seconds)
        job.segment_index = 0
        job.segment_paths = []
        await db.commit()

    await _start_segment(db, job)
    return 1


async def _finish_job(db: AsyncSession, job: VideoJob) -> None:
    """All segments done — stitch, watermark, publish."""
    _VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    seg_paths = [
        _resolve_media_path(u) for u in (job.segment_paths or [])
    ]
    seg_paths = [Path(p) for p in seg_paths if p]
    if not seg_paths:
        job.status = VideoJobStatus.FAILED
        job.error_message = "No video segments were produced"
        await db.commit()
        return

    raw_path = _VIDEO_DIR / f"{job.id}.raw.mp4"
    if not await concat_videos(seg_paths, raw_path):
        job.status = VideoJobStatus.FAILED
        job.error_message = "Could not stitch the video segments together"
        await db.commit()
        return

    final_path = _VIDEO_DIR / f"{job.id}.mp4"
    logo_path = _resolve_media_path(job.brand_logo_url)
    watermarked = False
    if logo_path:
        # Only the segment(s) that couldn't carry the logo through Veo's own
        # reference-image branding (see _segment_uses_logo_asset) still need
        # the flat corner watermark — segments that already got the real logo
        # woven into the scene must not also get a sticker slapped over them.
        model = get_model(job.model_key)
        plan = job.segment_plan or [job.duration_seconds]
        unbranded_windows: list[tuple[float, float]] = []
        cursor = 0.0
        for seg_seconds in plan:
            if not _segment_uses_logo_asset(model, seg_seconds, True):
                unbranded_windows.append((cursor, cursor + seg_seconds))
            cursor += seg_seconds

        if unbranded_windows:
            width, height = video_pixel_width(job.resolution, job.aspect_ratio)
            full_video = len(unbranded_windows) == len(plan)
            watermarked = await apply_watermark(
                raw_path, logo_path, final_path,
                video_width=width, video_height=height,
                time_windows=None if full_video else unbranded_windows,
            )
    if not watermarked:
        raw_path.replace(final_path)
    else:
        raw_path.unlink(missing_ok=True)

    for p in seg_paths:
        p.unlink(missing_ok=True)
    if job.continuation_frame_url:
        cf = _resolve_media_path(job.continuation_frame_url)
        if cf:
            Path(cf).unlink(missing_ok=True)

    job.video_url = f"/media/videos/{job.id}.mp4"
    job.status = VideoJobStatus.SUCCEEDED
    await db.commit()


async def _poll_job(db: AsyncSession, job: VideoJob) -> int:
    if not job.operation_name:
        job.status = VideoJobStatus.FAILED
        job.error_message = "Lost track of the generation operation"
        await db.commit()
        return 1

    operation = await gemini.poll_operation(job.operation_name)
    if not operation.get("done"):
        return 0  # still generating, nothing to do yet

    result = gemini.extract_result(operation)
    if result["error"] or not result["video_uri"]:
        job.status = VideoJobStatus.FAILED
        job.error_message = result["error"] or "No video returned"
        await db.commit()
        return 1

    _VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    seg_path = _VIDEO_DIR / f"{job.id}.seg{job.segment_index}.mp4"
    seg_path.write_bytes(await gemini.download_video(result["video_uri"]))
    job.segment_paths = list(job.segment_paths or []) + [f"/media/videos/{seg_path.name}"]

    plan = job.segment_plan or [job.duration_seconds]
    if job.segment_index + 1 < len(plan):
        # more to go — seed the next segment with this one's last frame
        cont_png = _VIDEO_DIR / f"{job.id}.cont{job.segment_index}.png"
        if await extract_last_frame(seg_path, cont_png):
            job.continuation_frame_url = f"/media/videos/{cont_png.name}"
        job.segment_index += 1
        job.operation_name = None
        await db.commit()
        await _start_segment(db, job)
        return 1

    await _finish_job(db, job)
    return 1
    return 1

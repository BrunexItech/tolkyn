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
    ALLOWED_DURATIONS,
    VEO_MODELS,
    catalog_payload,
    estimate_cost_usd,
    get_model,
    video_pixel_width,
)
from app.models.user import User
from app.models.video_job import VideoJob, VideoJobStatus
from app.schemas.video import BrandUpdateRequest, VideoGenerateRequest, VideoModelsResponse
from app.services import gemini_video_client as gemini
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
        if data.duration_seconds not in ALLOWED_DURATIONS:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Duration must be one of {ALLOWED_DURATIONS} seconds")
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


def _prompt_with_brand(prompt: str, brand_colors: Optional[List[str]], has_logo: bool) -> str:
    """Veo has no colour-palette parameter and can't reliably paint an exact
    logo into a scene, so: (1) fold the brand colours into the prompt text —
    the part that's guaranteed to work — and (2) when a brand logo exists,
    explicitly forbid Veo from inventing its own logos, so the real one (the
    corner watermark, or a branded first frame) is the only mark in the clip."""
    parts = [prompt]
    if brand_colors:
        parts.append(
            f"Colour palette to reflect in lighting, props and colour grading: "
            f"{', '.join(brand_colors)}."
        )
    if has_logo:
        parts.append(_NO_INVENTED_BRANDING)
    return " ".join(parts)


def _negative_with_brand(negative_prompt: Optional[str], has_logo: bool) -> Optional[str]:
    if not has_logo:
        return negative_prompt
    base = (negative_prompt or "").strip()
    return f"{base}, {_NEG_BRANDING}".strip(" ,") if base else _NEG_BRANDING


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


async def _start_job(db: AsyncSession, job: VideoJob) -> int:
    model = get_model(job.model_key)
    has_logo = bool(_resolve_media_path(job.brand_logo_url))

    if job.hero_logo_where and not job.reference_image_url and has_logo:
        hero = await _build_hero_frame(job)
        if hero:
            job.reference_image_url = hero
            await db.commit()

    ref_bytes = None
    ref_path = _resolve_media_path(job.reference_image_url)
    if ref_path:
        ref_bytes = ref_path.read_bytes()

    operation_name = await gemini.start_generation(
        model_id=model.model_id,
        prompt=_prompt_with_brand(job.prompt, job.brand_colors, has_logo),
        aspect_ratio=job.aspect_ratio,
        resolution=job.resolution,
        duration_seconds=job.duration_seconds,
        negative_prompt=_negative_with_brand(job.negative_prompt, has_logo),
        reference_image_bytes=ref_bytes,
    )
    job.operation_name = operation_name
    job.status = VideoJobStatus.RUNNING
    await db.commit()
    return 1


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

    video_bytes = await gemini.download_video(result["video_uri"])
    _VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    raw_path = _VIDEO_DIR / f"{job.id}.raw.mp4"
    raw_path.write_bytes(video_bytes)

    final_path = _VIDEO_DIR / f"{job.id}.mp4"
    logo_path = _resolve_media_path(job.brand_logo_url)
    watermarked = False
    if logo_path:
        width, _ = video_pixel_width(job.resolution, job.aspect_ratio)
        watermarked = await apply_watermark(raw_path, logo_path, final_path, video_width=width)
    if not watermarked:
        raw_path.replace(final_path)
    else:
        raw_path.unlink(missing_ok=True)

    job.video_url = f"/media/videos/{job.id}.mp4"
    job.status = VideoJobStatus.SUCCEEDED
    await db.commit()
    return 1

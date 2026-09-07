"""Background image generation for the Content Studio.

An HTTP request only *creates* an ImageJob and returns; a worker task (kicked
off immediately, with the scheduler as a safety net for orphans) does the slow
part — generate, then optionally composite the brand logo — and writes the
result back. The frontend polls the job. This keeps a 60–150s generation off
the request path entirely, so nginx / Cloudflare never time it out.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.limits import enforce_daily_limit
from app.db.base import AsyncSessionLocal
from app.models.generated_asset import AssetKind
from app.models.image_job import ImageJob, ImageJobStatus
from app.models.user import User
from app.services.content_ai import generate_image
from app.services.image_chat import run_turn
from app.services.logo_overlay import (
    composite_logo,
    detect_logo_request,
    normalize_position,
)
from app.services.logo_scene import place_logo_in_scene
from app.services.studio_service import StudioService

_MEDIA_ROOT = Path(__file__).resolve().parents[2] / "media"
_STALE_QUEUED = timedelta(seconds=25)
_STALE_PROCESSING = timedelta(minutes=8)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def resolve_media(url: Optional[str]) -> Optional[str]:
    if not url or not url.startswith("/media/"):
        return None
    p = (_MEDIA_ROOT / url[len("/media/"):]).resolve()
    if _MEDIA_ROOT.resolve() in p.parents and p.is_file():
        return str(p)
    return None


# --- brand-logo helpers (shared by both modes) ---------------------------
def _resolve_logo_request(brand_logo: Optional[str], prompt: str) -> Optional[dict]:
    opt = (brand_logo or "").strip().lower()
    if not opt or opt == "off":
        return None
    if opt == "auto":
        return detect_logo_request(prompt)
    return {"mode": "corner", "value": normalize_position(opt) or "bottom-right"}


def reserve_directive(req: dict) -> str:
    """Just the branding instruction (no prompt prefix) — appended to a
    generation prompt so the model leaves room for the real logo and draws
    none of its own."""
    if req["mode"] == "scene":
        where = req["value"]
        return (
            "IMPORTANT — branding: do NOT draw, invent or include ANY logo, emblem, "
            "wordmark, brand name or invented text anywhere in this image. In "
            f"particular render {where} completely plain and blank — no logo, no "
            "text, no markings — because the real brand logo will be added onto it "
            "afterwards. Keep that surface clearly visible and well lit."
        )
    spot = str(req["value"]).replace("-", " ")
    return (
        "IMPORTANT — branding: do NOT draw, invent or include ANY logo, emblem, "
        "badge, icon, monogram, wordmark, watermark, brand name, or the literal "
        "word \"brand\" anywhere in this image. The artwork must carry no branding "
        "of its own. In particular keep the "
        f"{spot} of the frame completely clean, empty and unobstructed — plain "
        "background only, with generous negative space — because a real brand "
        "logo will be composited into that exact spot afterwards."
    )


def reserve_space_hint(prompt: str, req: dict) -> str:
    return f"{prompt}\n\n{reserve_directive(req)}"


async def apply_brand_logo(
    owner: User, result: dict, brand_logo: Optional[str], source_prompt: str
) -> tuple[Optional[str], Optional[str]]:
    """corner -> deterministic Pillow overlay; scene -> a gpt-image-1 edit.
    Returns (what_was_applied, note). Never raises."""
    req = _resolve_logo_request(brand_logo, source_prompt)
    if not req:
        return None, None
    logo_path = resolve_media(getattr(owner, "brand_logo_url", None))
    if not logo_path:
        return None, "No brand logo on file — add one in Content Studio to place it on images."
    img_path = resolve_media(result.get("url"))
    if not img_path:
        return None, None

    if req["mode"] == "scene":
        placed = await place_logo_in_scene(img_path, logo_path, req["value"])
        if placed:
            new_path = resolve_media(placed)
            if new_path:
                Path(new_path).replace(img_path)
            return f"on {req['value']}", None
        return None, "Couldn't place the logo in the scene — the image is unchanged."

    tmp = Path(img_path).with_suffix(".logo.png")
    if composite_logo(Path(img_path), Path(logo_path), tmp, position=req["value"]):
        tmp.replace(img_path)
        return req["value"], None
    return None, "Couldn't place the logo on this image — the image is unchanged."


# --- the service -------------------------------------------------------
class ImageJobService:
    def __init__(self, db: AsyncSession, user_id: str):
        self.db = db
        self.user_id = user_id
        self.workspace_id = user_id

    async def _owner(self) -> User:
        u = (
            await self.db.execute(select(User).where(User.id == self.workspace_id))
        ).scalar_one_or_none()
        if not u:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Workspace not found")
        return u

    async def create(self, mode: str, prompt: str, params: Dict[str, Any]) -> ImageJob:
        owner = await self._owner()
        await enforce_daily_limit(self.db, owner, "image")  # 429 now, not later
        job = ImageJob(
            owner_id=owner.id,
            workspace_id=self.workspace_id,
            mode=mode,
            prompt=prompt,
            params=params or {},
            status=ImageJobStatus.QUEUED,
        )
        self.db.add(job)
        await self.db.commit()
        await self.db.refresh(job)
        # start now; the scheduler will also pick it up if this worker dies
        asyncio.create_task(run_job(job.id))
        return job

    async def get(self, job_id: str) -> ImageJob:
        job = (
            await self.db.execute(
                select(ImageJob).where(
                    ImageJob.id == job_id, ImageJob.workspace_id == self.workspace_id
                )
            )
        ).scalar_one_or_none()
        if not job:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Image job not found")
        return job


async def _claim(db: AsyncSession, job_id: str) -> Optional[ImageJob]:
    """Atomically move a queued job to processing. Returns the job if this
    caller won the claim, else None."""
    res = await db.execute(
        update(ImageJob)
        .where(ImageJob.id == job_id, ImageJob.status == ImageJobStatus.QUEUED)
        .values(status=ImageJobStatus.PROCESSING, started_at=_now())
        .returning(ImageJob.id)
    )
    if res.scalar_one_or_none() is None:
        return None
    await db.commit()
    return (
        await db.execute(select(ImageJob).where(ImageJob.id == job_id))
    ).scalar_one_or_none()


async def run_job(job_id: str) -> None:
    """Do the actual generation for one job. Opens its own session; never
    raises (failures are recorded on the row)."""
    async with AsyncSessionLocal() as db:
        job = await _claim(db, job_id)
        if job is None:
            return
        try:
            owner = (
                await db.execute(select(User).where(User.id == job.workspace_id))
            ).scalar_one_or_none()
            if owner is None:
                raise RuntimeError("workspace not found")

            p = job.params or {}
            brand_logo = p.get("brand_logo")

            if job.mode == "chat":
                attachment = resolve_media(p.get("attachment_url"))
                previous = resolve_media(p.get("previous_image_url"))
                # if a logo will go on a fresh image, tell the model to leave
                # room for it and invent none of its own
                logo_req = _resolve_logo_request(brand_logo, job.prompt)
                extra = (
                    reserve_directive(logo_req)
                    if logo_req
                    and not attachment
                    and not previous
                    and resolve_media(getattr(owner, "brand_logo_url", None))
                    else None
                )
                result = await run_turn(
                    job.prompt.strip(),
                    has_attachment=attachment is not None,
                    has_previous=previous is not None,
                    attachment_path=attachment,
                    previous_path=previous,
                    history=p.get("history") or [],
                    extra_prompt=extra,
                )
                logo_applied, logo_note = await apply_brand_logo(
                    owner, result, brand_logo, job.prompt
                )
                asset = await StudioService(db, job.workspace_id).save(
                    AssetKind.IMAGE,
                    result["prompt"],
                    title=result["prompt"][:120],
                    image_url=result["url"],
                    payload={
                        "size": result["size"],
                        "quality": result["quality"],
                        "operation": result["operation"],
                    },
                )
                job.asset_id = asset.id
                job.reply = result.get("reply") or ""
                job.operation = result.get("operation")
                job.used_base = result.get("used_base")
            else:
                req = _resolve_logo_request(brand_logo, job.prompt)
                gen_prompt = job.prompt
                if req and resolve_media(getattr(owner, "brand_logo_url", None)):
                    gen_prompt = reserve_space_hint(job.prompt, req)
                result = await generate_image(
                    gen_prompt,
                    size=p.get("size", "1024x1024"),
                    quality=p.get("quality", "medium"),
                    style=p.get("style", ""),
                    draft=bool(p.get("draft")),
                    input_image_path=resolve_media(p.get("input_image_url")),
                    as_logo=bool(p.get("as_logo")),
                )
                result["prompt"] = job.prompt
                logo_applied, logo_note = await apply_brand_logo(
                    owner, result, brand_logo, job.prompt
                )
                if p.get("save", True):
                    asset = await StudioService(db, job.workspace_id).save(
                        AssetKind.IMAGE,
                        job.prompt,
                        title=job.prompt[:120],
                        image_url=result["url"],
                        payload={
                            "size": result["size"],
                            "quality": result["quality"],
                            "style": result["style"],
                        },
                    )
                    job.asset_id = asset.id

            job.result_url = result["url"]
            job.logo_applied = logo_applied
            job.logo_note = logo_note
            job.status = ImageJobStatus.SUCCEEDED
            job.finished_at = _now()
            await db.commit()
        except Exception as exc:  # noqa: BLE001
            await db.rollback()
            job.status = ImageJobStatus.FAILED
            job.error = _friendly_error(str(exc))
            job.finished_at = _now()
            try:
                await db.commit()
            except Exception:  # pragma: no cover
                pass


def _friendly_error(msg: str) -> str:
    low = msg.lower()
    if "insufficient_quota" in low or "credit" in low or "billing" in low:
        return "The OpenAI account is out of credits. Add credits, then try again."
    if "rate limit" in low or "429" in low:
        return "OpenAI is rate-limiting right now — wait a moment and try again."
    if "must be verified" in low or ("organization" in low and "verif" in low):
        return "The OpenAI organisation needs to be verified for image generation."
    if "content_policy" in low or "safety" in low:
        return "That request was blocked by OpenAI's content policy — try rephrasing it."
    return msg[:400]


async def advance_stale_jobs() -> int:
    """Scheduler safety net: re-run jobs that were left queued (the creating
    worker died before it could start them) or stuck processing (it died
    mid-run)."""
    async with AsyncSessionLocal() as db:
        cutoff_q = _now() - _STALE_QUEUED
        cutoff_p = _now() - _STALE_PROCESSING
        rows = (
            await db.execute(
                select(ImageJob.id, ImageJob.status).where(
                    ((ImageJob.status == ImageJobStatus.QUEUED) & (ImageJob.created_at < cutoff_q))
                    | ((ImageJob.status == ImageJobStatus.PROCESSING) & (ImageJob.started_at < cutoff_p))
                )
            )
        ).all()
    for jid, st in rows:
        if st == ImageJobStatus.PROCESSING:
            # let _claim fail (it's not QUEUED); reset it first
            async with AsyncSessionLocal() as db:
                await db.execute(
                    update(ImageJob)
                    .where(ImageJob.id == jid, ImageJob.status == ImageJobStatus.PROCESSING)
                    .values(status=ImageJobStatus.QUEUED, started_at=None)
                )
                await db.commit()
        await run_job(jid)
    return len(rows)

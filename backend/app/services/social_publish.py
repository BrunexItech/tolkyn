"""Publish a Post to connected platforms through Upload-Post.

`publish_post` makes ONE call per media-kind (text / photos / video) with every
valid target platform, then normalises the response into a per-platform result
map compatible with the rest of the app.
"""
from __future__ import annotations

import mimetypes
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple
from urllib.parse import urlparse

import httpx

from app.models.post import Post
from app.services.upload_post_client import (
    PHOTO_PLATFORMS,
    TEXT_PLATFORMS,
    VIDEO_PLATFORMS,
    UploadPostError,
    upload_post,
)

_MEDIA_ROOT = Path(__file__).resolve().parents[2] / "media"
_VIDEO_EXT = {".mp4", ".mov", ".webm", ".m4v", ".avi", ".mkv"}
_IMAGE_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ext(url: str) -> str:
    return os.path.splitext(urlparse(url).path)[1].lower()


def _classify(media: Sequence[Dict[str, Any]]) -> str:
    if not media:
        return "text"
    for m in media:
        t = (m.get("type") or "").lower()
        if t.startswith("video") or _ext(m.get("url", "")) in _VIDEO_EXT:
            return "video"
    return "photos"


def _caption(post: Post) -> str:
    parts: List[str] = []
    if post.body:
        parts.append(post.body.strip())
    tags = [h for h in (post.hashtags or []) if h]
    if tags:
        parts.append(" ".join(t if t.startswith("#") else f"#{t}" for t in tags))
    if post.link:
        parts.append(post.link.strip())
    return "\n\n".join(p for p in parts if p)


async def _resolve_media(item: Dict[str, Any]) -> Tuple[str, bytes, str]:
    """Return (filename, bytes, content_type) for a media item, reading local
    uploads from disk and fetching remote URLs."""
    url = item.get("url") or ""
    if not url:
        raise UploadPostError("A media item has no URL")

    parsed = urlparse(url)
    filename = os.path.basename(parsed.path) or "upload"
    content_type = item.get("type") or mimetypes.guess_type(filename)[0] or "application/octet-stream"

    # local media mount  (/media/... served from backend/media)
    if not parsed.scheme or parsed.scheme == "file" or "/media/" in url:
        rel = url.split("/media/", 1)[-1] if "/media/" in url else parsed.path.lstrip("/")
        disk = (_MEDIA_ROOT / rel).resolve()
        if _MEDIA_ROOT in disk.parents and disk.is_file():
            return filename, disk.read_bytes(), content_type
        raise UploadPostError(f"Media file not found: {filename}")

    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
        r = await client.get(url)
        r.raise_for_status()
    return filename, r.content, r.headers.get("content-type", content_type)


def _parse_sync(results: Dict[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for platform, r in (results or {}).items():
        ok = bool(r.get("success"))
        out[platform] = {
            "status": "published" if ok else "failed",
            "url": r.get("url"),
            "post_id": r.get("post_id") or r.get("publish_id"),
            "error": r.get("error") if not ok else None,
            "published_at": _now_iso() if ok else None,
            "simulated": False,
        }
    return out


async def publish_post(
    username: str,
    platforms: Sequence[str],
    post: Post,
    *,
    scheduled_date: Optional[str] = None,
    timezone_name: Optional[str] = None,
) -> Dict[str, Any]:
    """Returns {"per_platform": {...}, "provider": {...}, "unsupported": [...]}"""
    if not platforms:
        return {"per_platform": {}, "provider": {}, "unsupported": []}

    kind = _classify(post.media or [])
    allowed = {"text": TEXT_PLATFORMS, "photos": PHOTO_PLATFORMS, "video": VIDEO_PLATFORMS}[kind]
    targets = [p for p in platforms if p in allowed]
    unsupported = [p for p in platforms if p not in allowed]
    caption = _caption(post)

    per_platform: Dict[str, Any] = {}
    for p in unsupported:
        per_platform[p] = {
            "status": "failed",
            "error": f"{p} can't receive a {kind} post",
            "simulated": False,
        }
    if not targets:
        return {"per_platform": per_platform, "provider": {}, "unsupported": unsupported}

    try:
        if kind == "text":
            resp = await upload_post.upload_text(
                username, targets, caption or (post.title or ""),
                scheduled_date=scheduled_date, timezone=timezone_name,
            )
        elif kind == "photos":
            files = [await _resolve_media(m) for m in (post.media or []) if (m.get("type") or "").lower().startswith("image") or _ext(m.get("url", "")) in _IMAGE_EXT or _ext(m.get("url", "")) == ""]
            if not files:  # fall back to everything that isn't a video
                files = [await _resolve_media(m) for m in (post.media or []) if _ext(m.get("url", "")) not in _VIDEO_EXT]
            resp = await upload_post.upload_photos(
                username, targets, files, caption=caption,
                scheduled_date=scheduled_date, timezone=timezone_name,
            )
        else:  # video
            first = (post.media or [])[0]
            url = first.get("url", "")
            parsed = urlparse(url)
            if parsed.scheme in ("http", "https") and "/media/" not in url:
                resp = await upload_post.upload_video(
                    username, targets, video_url=url, caption=caption,
                    scheduled_date=scheduled_date, timezone=timezone_name,
                )
            else:
                vf = await _resolve_media(first)
                resp = await upload_post.upload_video(
                    username, targets, video_file=vf, caption=caption,
                    scheduled_date=scheduled_date, timezone=timezone_name,
                )
    except UploadPostError as exc:
        for p in targets:
            per_platform[p] = {"status": "failed", "error": exc.message, "simulated": False}
        return {"per_platform": per_platform, "provider": {"error": exc.message}, "unsupported": unsupported}

    provider: Dict[str, Any] = {}
    job_id = resp.get("job_id")
    request_id = resp.get("request_id")

    if scheduled_date:
        # a future post — Upload-Post's worker runs it; job_id is our handle
        provider = {
            "mode": "scheduled",
            "job_id": job_id,
            "request_id": request_id,
            "scheduled_date": resp.get("scheduled_date") or scheduled_date,
        }
        for p in targets:
            per_platform[p] = {"status": "scheduled", "error": None, "simulated": False}
    elif resp.get("results"):
        per_platform.update(_parse_sync(resp["results"]))
        provider = {"mode": "sync"}
        if resp.get("usage"):
            provider["usage"] = resp["usage"]
    elif job_id or request_id:
        # immediate publish that Upload-Post queued — poll it to completion
        provider = {"mode": "async", "job_id": job_id, "request_id": request_id}
        for p in targets:
            per_platform[p] = {"status": "publishing", "error": None, "simulated": False}
    else:
        provider = {"mode": "unknown", "raw": resp}

    return {"per_platform": per_platform, "provider": provider, "unsupported": unsupported}


async def poll_status(provider_jobs: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Fetch fresh status for an async/scheduled post.

    Returns {"aggregate": "pending|in_progress|completed", "per_platform": {...}}
    or None when there's nothing to poll. Callers must not treat a *pending*
    scheduled job as failed — only apply per-platform results once the row
    actually reports one.
    """
    if not provider_jobs:
        return None
    job_id = provider_jobs.get("job_id")
    request_id = provider_jobs.get("request_id")
    if not request_id and not job_id:
        return None
    try:
        st = await upload_post.status(job_id=job_id) if job_id else await upload_post.status(request_id=request_id)
    except UploadPostError:
        return None

    _PENDING = {"queued", "pending", "processing", "in_progress", "running", "scheduled", "retrying"}
    _DONE = {"success", "completed", "published", "ok", "done"}

    aggregate = (st.get("status") or "").lower() or ("pending" if job_id else "in_progress")
    out: Dict[str, Any] = {}
    for row in st.get("results", []) or []:
        platform = row.get("platform")
        if not platform:
            continue
        rs = (row.get("status") or "").lower()
        if rs in _DONE or (not rs and row.get("success") is True):
            out[platform] = {
                "status": "published",
                "url": row.get("post_url") or row.get("url"),
                "published_at": row.get("upload_timestamp"),
                "error": None,
                "simulated": False,
            }
        elif rs in ("failed", "error"):
            out[platform] = {
                "status": "failed",
                "error": row.get("message") or row.get("error"),
                "simulated": False,
            }
        # queued / pending / unknown -> skip, poll again later
    return {"aggregate": aggregate, "per_platform": out}

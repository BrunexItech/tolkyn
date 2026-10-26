"""Thin REST wrapper around the Gemini API's Interactions endpoint for video
generation (gemini-omni-1.1-flash) — the replacement for Veo 3.1, which
Google shut down on 2026-10-22. Confirmed via Google's own docs
(ai.google.dev/gemini-api/docs/omni) pasted directly by the user, not
guessed.

Unlike Veo's predictLongRunning (start, then poll an operation), this is a
single synchronous call (background=false) that returns the finished result
directly — Google's own best-practice recommendation for faster unary
generation. The only polling left is for the Files API, and only when the
video is delivered by URI (used here to avoid the 4MB inline-payload limit)."""
import asyncio
import base64
from typing import Any, Dict, List, Optional

import httpx

from app.core.config import settings


class GeminiVideoError(RuntimeError):
    pass


def _headers() -> Dict[str, str]:
    if not settings.GEMINI_API_KEY:
        raise GeminiVideoError("GEMINI_API_KEY is not configured")
    return {"x-goog-api-key": settings.GEMINI_API_KEY, "Content-Type": "application/json"}


def _build_prompt(
    prompt: str,
    duration_seconds: int,
    negative_prompt: Optional[str],
    has_first_frame: bool,
    asset_count: int,
) -> str:
    """Omni has no structured duration/negative-prompt fields (confirmed:
    not in the request schema) -- both are requested through the prompt
    text instead, per Google's own prompting guide. Role tags for any
    attached images are prepended using the "simple tags" pattern the guide
    recommends for straightforward cases (one first-frame image, a handful
    of reference images) over the more verbose [# Sources ...] syntax."""
    tags = []
    if has_first_frame:
        tags.append("<FIRST_FRAME>")
    tags.extend(f"<IMAGE_REF_{i}>" for i in range(asset_count))
    tag_prefix = " ".join(tags) + " " if tags else ""

    parts = [
        f"{tag_prefix}{prompt}",
        f"Duration: exactly {duration_seconds} seconds. In a single continuous shot, no scene cuts.",
    ]
    if negative_prompt:
        parts.append(f"Avoid: {negative_prompt}.")
    return " ".join(parts)


async def generate_video(
    *,
    model_id: str,
    prompt: str,
    aspect_ratio: str,
    resolution: str,
    duration_seconds: int,
    negative_prompt: Optional[str] = None,
    reference_image_bytes: Optional[bytes] = None,
    reference_image_mime: str = "image/png",
    asset_images: Optional[List[Dict[str, Any]]] = None,
) -> bytes:
    """Generates one video segment and returns its raw MP4 bytes.

    `reference_image_bytes` — the hero/continuation frame (this segment's
    starting image), tagged <FIRST_FRAME>.
    `asset_images` — e.g. a brand logo, up to 3: [{"bytes": b"...", "mime": "image/png"}],
    tagged <IMAGE_REF_0>, <IMAGE_REF_1>, ... and referenced in the prompt so
    the model features them, same intent as Veo's "asset" reference images.
    """
    asset_images = asset_images[:3] if asset_images else []

    input_parts: List[Dict[str, Any]] = []
    if reference_image_bytes:
        input_parts.append({
            "type": "image",
            "data": base64.b64encode(reference_image_bytes).decode(),
            "mime_type": reference_image_mime,
        })
    for a in asset_images:
        input_parts.append({
            "type": "image",
            "data": base64.b64encode(a["bytes"]).decode(),
            "mime_type": a.get("mime", "image/png"),
        })
    input_parts.append({
        "type": "text",
        "text": _build_prompt(
            prompt, duration_seconds, negative_prompt,
            has_first_frame=bool(reference_image_bytes), asset_count=len(asset_images),
        ),
    })

    body = {
        "model": model_id,
        "input": input_parts,
        "response_format": {
            "type": "video",
            "aspect_ratio": aspect_ratio,
            "resolution": resolution,
            # URI delivery avoids the inline-payload size limit for
            # anything above 720p; the trade-off (a Files-API poll before
            # download) is handled below.
            "delivery": "uri",
        },
        # Google's own best practice for faster synchronous generation.
        # store=false means no previous_interaction_id editing later, which
        # we don't use (each segment is a standalone call).
        "background": False,
        "store": False,
        "stream": False,
    }

    url = f"{settings.GEMINI_API_BASE}/interactions"
    async with httpx.AsyncClient(timeout=300) as client:
        resp = await client.post(url, headers=_headers(), json=body)
        if resp.status_code >= 400:
            raise GeminiVideoError(f"Video generation failed ({resp.status_code}): {resp.text[:500]}")
        data = resp.json()
        if data.get("status") == "failed":
            raise GeminiVideoError(f"Video generation failed: {data}")

        video = _extract_video_content(data)
        if video.get("data"):
            return base64.b64decode(video["data"])
        uri = video.get("uri")
        if not uri:
            raise GeminiVideoError(f"No video returned in completed interaction: {data}")
        return await _download_when_ready(client, uri)


def _extract_video_content(interaction: Dict[str, Any]) -> Dict[str, Any]:
    for step in interaction.get("steps", []):
        if step.get("type") != "model_output":
            continue
        for item in step.get("content", []):
            if item.get("type") == "video":
                return item
    raise GeminiVideoError(f"No video content in interaction response: {interaction}")


async def _download_when_ready(client: httpx.AsyncClient, uri: str, *, timeout_s: float = 240) -> bytes:
    """Polls the Files API until the video's state is ACTIVE, then downloads
    it. `uri` is the download URL Google returns
    (".../files/<id>:download?alt=media"); the status-check URL is the same
    path without the :download suffix."""
    file_id = uri.split("/files/")[-1].split(":")[0]
    status_url = f"{settings.GEMINI_API_BASE}/files/{file_id}"

    waited = 0.0
    while waited < timeout_s:
        resp = await client.get(status_url, headers=_headers())
        if resp.status_code >= 400:
            raise GeminiVideoError(f"Failed to check video file status ({resp.status_code}): {resp.text[:300]}")
        state = resp.json().get("state")
        if state == "ACTIVE":
            break
        if state == "FAILED":
            raise GeminiVideoError("Video file processing failed")
        await asyncio.sleep(5)
        waited += 5
    else:
        raise GeminiVideoError("Timed out waiting for the generated video file to become ready")

    dl = await client.get(uri, headers=_headers())
    if dl.status_code >= 400:
        raise GeminiVideoError(f"Failed to download generated video ({dl.status_code})")
    return dl.content

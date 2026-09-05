"""Thin REST wrapper around the Gemini API's Veo 3.1 video generation.
Generation is a long-running operation (~1-2 minutes) — start it, then poll
it; see services/video_service.py for the job orchestration that uses this."""
from typing import Any, Dict, List, Optional

import httpx

from app.core.config import settings


class GeminiVideoError(RuntimeError):
    pass


def _headers() -> Dict[str, str]:
    if not settings.GEMINI_API_KEY:
        raise GeminiVideoError("GEMINI_API_KEY is not configured")
    return {"x-goog-api-key": settings.GEMINI_API_KEY, "Content-Type": "application/json"}


async def start_generation(
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
) -> str:
    """Kicks off a Veo generation. Returns the operation name to poll.

    `asset_images` — e.g. a brand logo/product shot — are passed as Veo's
    "ingredients to video" reference images: [{"bytes": b"...", "mime": "image/png"}],
    up to 3. Veo tries to preserve the asset's appearance in the output;
    Google's own docs don't guarantee pixel-accurate logo reproduction, so
    this is a best-effort visual cue, not a guaranteed overlay.
    """
    import base64

    instance: Dict[str, Any] = {"prompt": prompt}
    if reference_image_bytes:
        instance["image"] = {
            "bytesBase64Encoded": base64.b64encode(reference_image_bytes).decode(),
            "mimeType": reference_image_mime,
        }
    if asset_images:
        instance["referenceImages"] = [
            {
                "image": {
                    "bytesBase64Encoded": base64.b64encode(a["bytes"]).decode(),
                    "mimeType": a.get("mime", "image/png"),
                },
                "referenceType": "asset",
            }
            for a in asset_images[:3]
        ]

    parameters: Dict[str, Any] = {
        "aspectRatio": aspect_ratio,
        "resolution": resolution,
        "durationSeconds": duration_seconds,
        # "allow_adult" 400s on this account/region; "allow_all" is the value
        # that's actually accepted right now.
        "personGeneration": "allow_all",
    }
    # NOTE: `generateAudio` is not an accepted parameter on this API version —
    # every model we tested (Standard, Fast, Lite) 400s if it's present at
    # all, sound or silent. Whether a clip has sound is purely a property of
    # the model (Standard/Fast: yes, Lite: no) — see video_models.supports_audio.
    if negative_prompt:
        parameters["negativePrompt"] = negative_prompt

    url = f"{settings.GEMINI_API_BASE}/models/{model_id}:predictLongRunning"
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(url, headers=_headers(), json={"instances": [instance], "parameters": parameters})
    if resp.status_code >= 400:
        raise GeminiVideoError(f"Veo generation failed to start ({resp.status_code}): {resp.text[:500]}")
    data = resp.json()
    name = data.get("name")
    if not name:
        raise GeminiVideoError(f"Veo did not return an operation name: {data}")
    return name


async def poll_operation(operation_name: str) -> Dict[str, Any]:
    """Returns the raw operation JSON. Check `done` before reading `response`."""
    url = f"{settings.GEMINI_API_BASE}/{operation_name}"
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(url, headers=_headers())
    if resp.status_code >= 400:
        raise GeminiVideoError(f"Failed to poll Veo operation ({resp.status_code}): {resp.text[:500]}")
    return resp.json()


def extract_result(operation: Dict[str, Any]) -> Dict[str, Any]:
    """Pulls {video_uri, error} out of a completed operation's JSON."""
    if operation.get("error"):
        return {"video_uri": None, "error": operation["error"].get("message", "Video generation failed")}
    samples = (
        operation.get("response", {})
        .get("generateVideoResponse", {})
        .get("generatedSamples", [])
    )
    if not samples:
        return {"video_uri": None, "error": "Veo returned no video in the completed operation"}
    uri = samples[0].get("video", {}).get("uri")
    if not uri:
        return {"video_uri": None, "error": "Veo response had no video URI"}
    return {"video_uri": uri, "error": None}


async def download_video(uri: str) -> bytes:
    async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
        resp = await client.get(uri, headers=_headers())
    if resp.status_code >= 400:
        raise GeminiVideoError(f"Failed to download generated video ({resp.status_code})")
    return resp.content

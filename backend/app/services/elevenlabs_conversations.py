"""Pulls a finished Conversational AI call's transcript directly from
ElevenLabs' own API, instead of relying on their post-call webhook.

The webhook (see api/v1/endpoints/elevenlabs.py's /post-call route) is the
"official" push-based path and is kept as-is, but it's proven unreliable in
practice -- ElevenLabs' own dashboard reports it as correctly configured and
firing, yet nothing has ever actually arrived (checked: our endpoint is
reachable and validates signatures correctly, Cloudflare has zero blocked/
challenged requests logged for the path, ever). Rather than keep guessing at
their dashboard, this polls the same data their own "Conversation History"
UI shows, pull-based, the same "ask until it's ready" shape already proven
for Veo video generation (see video_service.py's advance_pending_jobs).
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_CONVERSATION_URL = "https://api.elevenlabs.io/v1/convai/conversations/{conversation_id}"


async def fetch_conversation(conversation_id: str) -> Optional[Dict[str, Any]]:
    """Returns {"transcript": [...], "summary": str|None, "status": str} or
    None on any failure (not-yet-ready, network error, bad id) -- the caller
    just tries again on the next sweep, same as a video job still
    generating."""
    if not settings.ELEVENLABS_API_KEY:
        return None
    url = _CONVERSATION_URL.format(conversation_id=conversation_id)
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(url, headers={"xi-api-key": settings.ELEVENLABS_API_KEY})
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:  # noqa: BLE001 — best-effort, retried next sweep
        logger.warning("fetch_conversation(%s) failed: %r", conversation_id, exc)
        return None

    turns = [
        {
            "role": t.get("role"),
            "message": t.get("message"),
            "time_in_call_secs": t.get("time_in_call_secs"),
        }
        for t in (data.get("transcript") or [])
        if isinstance(t, dict) and t.get("message")
    ]
    analysis = data.get("analysis") or {}
    return {
        "status": data.get("status"),
        "transcript": turns,
        "summary": analysis.get("transcript_summary") or None,
    }

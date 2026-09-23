"""Renders IVR menu prompt text to 8kHz mono WAV audio the Asterisk host can
play with STREAM FILE, via ElevenLabs' plain Text-to-Speech API (a separate,
simpler endpoint from the Conversational AI agent used elsewhere).

Cached on disk by a hash of (text, voice, model) — the same prompt is heard
on every call until an admin edits it, so this avoids re-billing ElevenLabs
and re-rendering on every single ring. Conversion to telephony format goes
through ffmpeg rather than betting on a specific ElevenLabs `output_format`
value, since that part of their API wasn't verified against real docs.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import shutil
from pathlib import Path
from typing import Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_MEDIA_DIR = Path(__file__).resolve().parents[2] / "media" / "ivr-audio"
_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"


def _cache_key(text: str) -> str:
    raw = f"{settings.ELEVENLABS_IVR_VOICE_ID}|{settings.ELEVENLABS_TTS_MODEL}|{text}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


async def render_and_cache(text: str) -> Optional[str]:
    """Returns the media-relative path (e.g. "ivr-audio/<hash>.wav") for this
    prompt's audio, rendering + caching it first if needed. None if TTS isn't
    configured or rendering fails — callers should fall back to silence
    (still collecting DTMF) rather than breaking the call."""
    text = (text or "").strip()
    if not text:
        return None
    if not settings.ELEVENLABS_API_KEY:
        logger.warning("ELEVENLABS_API_KEY not set — IVR prompts won't have audio")
        return None

    key = _cache_key(text)
    _MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    wav_path = _MEDIA_DIR / f"{key}.wav"
    rel_path = f"ivr-audio/{key}.wav"
    if wav_path.is_file() and wav_path.stat().st_size > 0:
        return rel_path

    try:
        mp3_bytes = await _fetch_tts_mp3(text)
        wav_bytes = await _mp3_to_wav8k(mp3_bytes)
    except Exception as e:  # noqa: BLE001 — a bad render shouldn't break the call
        logger.warning("IVR TTS render failed: %s", e)
        return None

    wav_path.write_bytes(wav_bytes)
    return rel_path


async def _fetch_tts_mp3(text: str) -> bytes:
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(
            _TTS_URL.format(voice_id=settings.ELEVENLABS_IVR_VOICE_ID),
            headers={
                "xi-api-key": settings.ELEVENLABS_API_KEY,
                "Content-Type": "application/json",
                "Accept": "audio/mpeg",
            },
            json={
                "text": text,
                "model_id": settings.ELEVENLABS_TTS_MODEL,
                # Never sent before -- ElevenLabs then falls back to a flat,
                # neutral default (style=0, no expressiveness), which is
                # exactly what reads as "robotic" on a monotone IVR prompt.
                # stability slightly below their own 0.5 default adds natural
                # variation without drifting off-voice; style>0 is the actual
                # expressiveness knob. Confirmed via ElevenLabs' own docs on
                # what these parameters do, not guessed.
                "voice_settings": {
                    "stability": 0.42,
                    "similarity_boost": 0.8,
                    "style": 0.35,
                    "use_speaker_boost": True,
                },
            },
        )
        resp.raise_for_status()
        return resp.content


async def _mp3_to_wav8k(mp3_bytes: bytes) -> bytes:
    if not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg not found on PATH")
    import tempfile

    with tempfile.NamedTemporaryFile(suffix=".mp3") as src, tempfile.NamedTemporaryFile(suffix=".wav") as dst:
        src.write(mp3_bytes)
        src.flush()
        # Explicit codec + bit depth -- Asterisk's STREAM FILE expects plain
        # 16-bit signed linear PCM in the WAV container. Without -acodec,
        # ffmpeg's own default for .wav can vary by build/version; leaving
        # it ambiguous risks a file that "converts successfully" but that
        # Asterisk can't actually play (silently, with no error either side).
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg", "-y", "-i", src.name,
            "-ar", "8000", "-ac", "1", "-acodec", "pcm_s16le", "-f", "wav", dst.name,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()
        if proc.returncode != 0:
            raise RuntimeError(f"ffmpeg failed: {stderr.decode(errors='replace')[:300]}")
        return Path(dst.name).read_bytes()

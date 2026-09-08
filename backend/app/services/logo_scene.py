"""Put the real brand logo onto a surface *inside* a generated scene — a
laptop lid, a wall sign, a mug, a shirt — using a gpt-image-1 edit that takes
the scene and the logo as two inputs. Unlike the deterministic corner overlay
(logo_overlay.py) this can follow the scene's perspective and lighting, at the
cost of a second image call and being best-effort rather than pixel-exact.
"""
from __future__ import annotations

import base64
import logging
import uuid
from pathlib import Path
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

MEDIA_DIR = Path(__file__).resolve().parents[2] / "media" / "generated"

_EDIT_INSTRUCTION = (
    "The FIRST image is a photo. The SECOND image is the real company brand logo on a "
    "transparent background — not a placeholder. Composite that exact logo onto {where} in "
    "the first image so it looks physically printed / applied there — follow the surface's "
    "angle, perspective, curvature and lighting, with realistic scale and a natural amount "
    "of wear. The ENTIRE logo must sit fully within the photo frame and fully on that "
    "surface — never cropped, cut off, running past an edge, or clipped by the surface's "
    "border; if it won't fit at a natural size, make it smaller. Reproduce the logo's exact "
    "shapes, proportions, colours and any lettering pixel-faithfully; do NOT redraw, "
    "restyle, recolour, re-letter or simplify it, and do NOT add any other logo, badge or "
    "text anywhere. Keep everything else in the first image — the subject, composition, "
    "colours, background and every other detail — exactly as it is."
)


def _model_takes_input_fidelity(model: str) -> bool:
    m = (model or "").lower()
    return m in ("gpt-image-1", "gpt-image-1-mini", "gpt-image-1.5", "gpt-image-1.5-mini")


def _resolve(url_or_path: str) -> Optional[Path]:
    p = Path(url_or_path)
    if p.is_file():
        return p
    root = Path(__file__).resolve().parents[2] / "media"
    if url_or_path.startswith("/media/"):
        cand = (root / url_or_path[len("/media/"):]).resolve()
        if root.resolve() in cand.parents and cand.is_file():
            return cand
    return None


async def place_logo_in_scene(
    base_image: str,
    logo_image: str,
    where: str,
    *,
    quality: str = "high",
) -> Optional[str]:
    """Returns a new `/media/generated/<id>.png` URL with the logo composited
    onto `where` in `base_image`, or None on any failure (caller keeps the
    original). Runs the OpenAI call on a worker thread."""
    if not settings.OPENAI_API_KEY:
        return None
    base_path = _resolve(base_image)
    logo_path = _resolve(logo_image)
    if not base_path or not logo_path:
        logger.warning("place_logo_in_scene: missing base(%s) or logo(%s)", base_image, logo_image)
        return None

    where = (where or "the most prominent branded surface").strip()
    prompt = _EDIT_INSTRUCTION.format(where=where)

    import asyncio

    from openai import OpenAI

    def _run() -> Optional[str]:
        client = OpenAI(api_key=settings.OPENAI_API_KEY, timeout=420.0, max_retries=1)
        model = settings.OPENAI_IMAGE_MODEL
        try:
            with open(base_path, "rb") as b, open(logo_path, "rb") as l:
                kw: dict = dict(
                    model=model, image=[b, l], prompt=prompt, size="auto", quality=quality
                )
                if _model_takes_input_fidelity(model):
                    kw["input_fidelity"] = "high"
                res = client.images.edit(**kw)
            item = res.data[0]
            if getattr(item, "b64_json", None):
                return item.b64_json
            import httpx

            return base64.b64encode(httpx.get(item.url, timeout=60).content).decode()
        except Exception as exc:  # noqa: BLE001
            logger.warning("place_logo_in_scene edit failed: %s", exc)
            return None

    b64 = await asyncio.to_thread(_run)
    if not b64:
        return None
    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    asset_id = uuid.uuid4().hex
    (MEDIA_DIR / f"{asset_id}.png").write_bytes(base64.b64decode(b64))
    return f"/media/generated/{asset_id}.png"

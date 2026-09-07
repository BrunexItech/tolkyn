"""Composites a brand logo onto a generated image at a requested position,
with Pillow. Deterministic — the mark is the actual logo file (crisp, exact
colours), placed exactly where asked — rather than something the image model
tried to draw and usually gets wrong.

Positions understood: top-left, top-center, top-right, center-left, center,
center-right, bottom-left, bottom-center, bottom-right (hyphen or space, and
common synonyms like "top right corner" / "middle").
"""
from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Optional, Tuple

logger = logging.getLogger(__name__)

# logo width as a fraction of the base image's width, and the gap kept from
# the nearest edge (also a fraction of width).
_DEFAULT_SCALE = 0.16
_DEFAULT_MARGIN = 0.045
_CENTER_SCALE = 0.28  # a centred logo can be a bit larger

VALID_POSITIONS = (
    "top-left", "top-center", "top-right",
    "center-left", "center", "center-right",
    "bottom-left", "bottom-center", "bottom-right",
)

_VERTICAL = {"top": "top", "upper": "top", "bottom": "bottom", "lower": "bottom"}
_HORIZONTAL = {"left": "left", "right": "right"}
_CENTERISH = {"middle", "centre", "center", "centered", "centred"}


def normalize_position(raw: Optional[str]) -> Optional[str]:
    """Map free-text ('top right corner', 'middle', 'bottomleft') to one of
    VALID_POSITIONS. Returns None if nothing usable is found."""
    if not raw:
        return None
    s = raw.strip().lower().replace("_", "-")
    if s in VALID_POSITIONS:
        return s
    # glued forms like "topright", "bottomleft"
    for p in VALID_POSITIONS:
        if s == p.replace("-", ""):
            return p

    words = set(re.findall(r"[a-z]+", s))
    v = next((_VERTICAL[w] for w in words if w in _VERTICAL), None)
    h = next((_HORIZONTAL[w] for w in words if w in _HORIZONTAL), None)
    centerish = bool(words & _CENTERISH)

    if v is None and h is None:
        return "center" if centerish else None
    cand = f"{v or 'center'}-{h or 'center'}"
    return cand if cand in VALID_POSITIONS else None


def _anchor(pos: str, base: Tuple[int, int], logo: Tuple[int, int], margin: int) -> Tuple[int, int]:
    bw, bh = base
    lw, lh = logo
    v, h = (pos.split("-") + ["center"])[:2] if "-" in pos else ("center", "center")

    if h == "left":
        x = margin
    elif h == "right":
        x = bw - lw - margin
    else:
        x = (bw - lw) // 2

    if v == "top":
        y = margin
    elif v == "bottom":
        y = bh - lh - margin
    else:
        y = (bh - lh) // 2
    return x, y


def composite_logo(
    base_path: Path,
    logo_path: Path,
    out_path: Path,
    *,
    position: str = "bottom-right",
    scale: Optional[float] = None,
    opacity: float = 1.0,
) -> bool:
    """Write `out_path` = base image with the logo composited at `position`.
    Returns True on success; on any failure returns False and leaves the base
    untouched (a broken overlay must never lose the user their image)."""
    try:
        from PIL import Image
    except Exception:  # pragma: no cover
        logger.warning("Pillow not available — skipping logo overlay")
        return False

    position = normalize_position(position) or "bottom-right"
    try:
        base = Image.open(base_path).convert("RGBA")
        logo = Image.open(logo_path).convert("RGBA")

        bw, bh = base.size
        frac = scale if scale is not None else (_CENTER_SCALE if position == "center" else _DEFAULT_SCALE)
        target_w = max(24, round(bw * frac))
        ratio = target_w / logo.width
        logo = logo.resize((target_w, max(1, round(logo.height * ratio))), Image.LANCZOS)

        if opacity < 1.0:
            alpha = logo.split()[3].point(lambda a: round(a * max(0.0, min(1.0, opacity))))
            logo.putalpha(alpha)

        margin = round(bw * _DEFAULT_MARGIN) if position != "center" else 0
        x, y = _anchor(position, (bw, bh), logo.size, margin)

        canvas = Image.new("RGBA", base.size)
        canvas.paste(base, (0, 0))
        canvas.alpha_composite(logo, (x, y))
        canvas.convert("RGB").save(out_path, format="PNG")
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("logo overlay failed (%s): %s", position, exc)
        out_path.unlink(missing_ok=True)
        return False


# --- deciding whether the prompt asked for a logo, and where ---------------

_LOGO_WORDS = ("logo", "watermark", "brand mark", "brandmark", "our brand", "company mark")
_CTR = r"(?:centre|center|centered|centred|middle)"
_POS_PATTERNS = [
    (r"(?:top|upper)[\s-]*left", "top-left"),
    (r"(?:top|upper)[\s-]*right", "top-right"),
    (rf"(?:top|upper)[\s-]*{_CTR}|{_CTR}[\s-]*top", "top-center"),
    (r"(?:bottom|lower)[\s-]*left", "bottom-left"),
    (r"(?:bottom|lower)[\s-]*right", "bottom-right"),
    (rf"(?:bottom|lower)[\s-]*{_CTR}|{_CTR}[\s-]*bottom", "bottom-center"),
    (rf"{_CTR}[\s-]*left|left[\s-]*{_CTR}", "center-left"),
    (rf"{_CTR}[\s-]*right|right[\s-]*{_CTR}", "center-right"),
    (rf"\b(?:dead[\s-]*)?{_CTR}\b", "center"),
    (r"\btop\b|\bhead(?:er)?\b", "top-center"),
    (r"\bbottom\b|\bfoot(?:er)?\b", "bottom-center"),
    (r"\bleft\b", "center-left"),
    (r"\bright\b", "center-right"),
]


def detect_logo_placement(prompt: str) -> Optional[str]:
    """If the prompt asks for the brand logo, return the requested position
    (defaulting to bottom-right when a spot isn't named). Return None if the
    prompt doesn't mention a logo at all."""
    if not prompt:
        return None
    low = prompt.lower()
    if not any(w in low for w in _LOGO_WORDS):
        return None
    # look for a position near the logo mention first, then anywhere
    idx = min((low.find(w) for w in _LOGO_WORDS if w in low), default=-1)
    window = low[max(0, idx - 60): idx + 120] if idx >= 0 else low
    for pat, pos in _POS_PATTERNS:
        if re.search(pat, window):
            return pos
    for pat, pos in _POS_PATTERNS:
        if re.search(pat, low):
            return pos
    return "bottom-right"

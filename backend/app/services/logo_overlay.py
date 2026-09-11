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
        margin = round(bw * _DEFAULT_MARGIN) if position != "center" else 0

        # Size the logo, then make sure it physically fits inside the frame
        # minus the margins on both sides — a wide/tall logo or a small image
        # can never get cropped.
        max_w = max(1, bw - 2 * margin)
        max_h = max(1, round(bh * 0.42) - (2 * margin if position == "center" else 0))
        target_w = min(max(24, round(bw * frac)), max_w)
        ratio = target_w / logo.width
        target_h = max(1, round(logo.height * ratio))
        if target_h > max_h:
            target_h = max_h
            target_w = max(1, round(logo.width * (target_h / logo.height)))
        logo = logo.resize((target_w, target_h), Image.LANCZOS)

        if opacity < 1.0:
            alpha = logo.split()[3].point(lambda a: round(a * max(0.0, min(1.0, opacity))))
            logo.putalpha(alpha)

        x, y = _anchor(position, (bw, bh), logo.size, margin)
        # final guard: clamp fully on-canvas
        x = max(0, min(x, bw - logo.width))
        y = max(0, min(y, bh - logo.height))

        canvas = Image.new("RGBA", base.size)
        canvas.paste(base, (0, 0))
        canvas.alpha_composite(logo, (x, y))
        canvas.convert("RGB").save(out_path, format="PNG")
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("logo overlay failed (%s): %s", position, exc)
        out_path.unlink(missing_ok=True)
        return False


# --- deciding whether / where a logo goes ---------------------------------
#
# The rule: a logo is composited only when the prompt *directs* a placement
# ("logo in the top-right", "logo on the storefront sign"). Merely describing
# a brand ("use our official logo and brand identity") is NOT a direction —
# that text is about the look, and slapping a flat PNG onto a photo because
# the word "logo" appeared is exactly what used to wreck these images.

_LOGO_WORDS = ("logo", "watermark", "brand mark", "brandmark", "wordmark", "company mark")

# compound nouns that merely CONTAIN "center/centre" — a product/place name,
# never an instruction to centre the logo ("command center", "call centre").
_FALSE_CENTER_RE = re.compile(
    r"\b(?:command|call|contact|data|help|service|resource|learning|distribution|"
    r"fulfil?ment|control|message|notification|action|operations?|support|business|"
    r"town|shopping|convention|media|wellness|fitness|garden|welcome|customer|"
    r"experience|innovation|research|training|day\s?care|child\s?care|nerve|"
    r"epi|profit|cost|revenue)\s+cent(?:er|re)s?\b",
    re.I,
)

# an EXPLICIT corner instruction, matched only in a tight window around the
# logo word — no loose "there's a 'left' somewhere in the prompt" guessing.
_EXPLICIT_POS = [
    (r"\b(?:top|upper)[\s-]*left\b", "top-left"),
    (r"\b(?:top|upper)[\s-]*right\b", "top-right"),
    (r"\b(?:bottom|lower)[\s-]*left\b", "bottom-left"),
    (r"\b(?:bottom|lower)[\s-]*right\b", "bottom-right"),
    (r"\b(?:top|upper)[\s-]*cent(?:er|re)\b|\bcent(?:er|re)[\s-]*top\b", "top-center"),
    (r"\b(?:bottom|lower)[\s-]*cent(?:er|re)\b|\bcent(?:er|re)[\s-]*bottom\b", "bottom-center"),
    (r"\bdead[\s-]*cent(?:er|re)\b|\bcent(?:er|re)(?:ed|red)?\s+(?:in|on|of)\s+the\s+"
     r"(?:image|frame|picture|canvas|composition|shot)\b|\bin\s+the\s+(?:middle|cent(?:er|re))"
     r"\s+of\s+the\s+(?:image|frame|picture|shot)\b", "center"),
]
# Bare "top"/"bottom"/"left"/"right" are deliberately NOT patterns — "a banner
# across the top of her stall" describes the scene, it is not "put the logo at
# the top". Only unambiguous placements above count.


def _pos_near_logo(prompt: str) -> Optional[str]:
    """An explicit corner instruction phrased right around the word 'logo'
    ('...logo in the top-right', 'a bottom-right watermark'). Returns None for a
    scene mention that merely happens to contain 'top' / 'left' / etc."""
    low = _FALSE_CENTER_RE.sub(" ", (prompt or "").lower())
    idx = min((low.find(w) for w in _LOGO_WORDS if w in low), default=-1)
    if idx < 0:
        return None
    # a short span each side of the logo word — real placement phrasing sits
    # tight against it, scene description does not
    for span in (low[max(0, idx - 26): idx], low[idx: idx + 40]):
        for pat, pos in _EXPLICIT_POS:
            if re.search(pat, span):
                return pos
    return None


def detect_logo_placement(prompt: str) -> Optional[str]:
    """Explicit corner instruction for the logo, or None. (No default — a bare
    mention of a logo is not a placement.) This is the ONLY text-guessing left
    in this module: it exists solely to catch a deliberate flat watermark ask
    ("logo in the bottom-right"), which is a Pillow overlay job. Any other
    placement — "on the laptop lid", "on her apron", or nothing explicit at
    all — is handled by the image model itself, which is given the real logo
    as a reference image and reads the user's own words directly. See
    image_job_service._resolve_logo_request."""
    return _pos_near_logo(prompt)

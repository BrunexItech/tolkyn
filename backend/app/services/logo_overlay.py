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
    (r"\btop\b", "top-center"),
    (r"\bbottom\b|\bfooter\b", "bottom-center"),
]


def _pos_near_logo(prompt: str) -> Optional[str]:
    """An explicit corner instruction sitting next to the word 'logo', or None."""
    low = _FALSE_CENTER_RE.sub(" ", (prompt or "").lower())
    idx = min((low.find(w) for w in _LOGO_WORDS if w in low), default=-1)
    if idx < 0:
        return None
    window = low[max(0, idx - 40): idx + 90]
    for pat, pos in _EXPLICIT_POS:
        if re.search(pat, window):
            return pos
    return None


def detect_logo_placement(prompt: str) -> Optional[str]:
    """Explicit corner instruction for the logo, or None. (No default — a bare
    mention of a logo is not a placement.)"""
    return _pos_near_logo(prompt)


_ON_SURFACE_RE = re.compile(
    r"\b(?:on|onto|across|over)\s+"
    r"(?:the\s+|a\s+|an\s+|his\s+|her\s+|their\s+|its\s+|my\s+|our\s+)?"
    r"([a-z][a-z' \-]{2,40}?)"
    r"(?=[.,;!?]|\s+(?:and|with|in|at|for|so|then|that|which|while)\b|$)",
    re.I,
)

_NOT_A_SURFACE = {
    "screen", "frame", "image", "picture", "background", "right", "left",
    "top", "bottom", "side", "corner", "logo", "brand", "brand identity",
    "everything", "it", "them", "product", "products",
    # photo / camera boilerplate that trails many prompts ("...logo. Shot on a
    # full-frame camera...") — never a real surface for the mark
    "full-frame camera", "full frame camera", "camera", "a full-frame camera",
    "dslr", "mirrorless camera", "lens", "prime lens", "tripod", "location",
    "set", "shoot", "shot", "display", "canvas",
}

# Real, printable surfaces to look for in a described scene, most-preferred
# first. Screens (laptop/phone/monitor) are deliberately absent — a logo
# fighting live UI reads worse than a clean image corner, which is what real
# ad campaigns use anyway.
_SCENE_SURFACES = [
    ("the storefront sign", r"store\s?front|shop\s?front|shop sign|store sign|\bsignage\b|"
                            r"sign\s?board|\bstorefront\b|\bawning\b|shop window|fa[cç]ade|marquee"),
    ("the billboard", r"\bbillboard\b|\bhoarding\b"),
    ("the banner behind them", r"\bbanner\b|\bbackdrop\b|step[\s-]and[\s-]repeat|press wall|"
                               r"pop[\s-]?up stand|exhibition stand|trade[\s-]?show booth"),
    ("the poster on the wall", r"\bposter\b|framed print|wall art"),
    ("the feature wall behind them", r"feature wall|accent wall|wall behind|brand(?:ed)? wall|"
                                     r"lobby wall|reception wall|\bmural\b"),
    ("the coffee cup", r"coffee cup|paper cup|take\s?away cup|to-go cup|disposable cup|\bmug\b"),
    ("the t-shirt", r"t-?shirt|\btee\b|polo shirt|\bhoodie\b|\bjersey\b|staff (?:shirt|uniform)|\bapron\b"),
    ("the tote bag", r"tote bag|shopping bag|paper bag|gift bag|canvas bag|carrier bag"),
    ("the packaging", r"\bpackaging\b|product box|shipping box|\bcarton\b|gift box|\bpackage\b|pouch"),
    ("the bottle", r"water bottle|\bbottle\b|\bflask\b|\btumbler\b"),
    ("the can", r"soda can|beverage can|drink can|alumin[iu]m can"),
    ("the cap", r"baseball cap|\bsnapback\b|\bbeanie\b|trucker cap"),
    ("the delivery van", r"delivery van|company van|box truck|delivery truck|company car|branded vehicle"),
    ("the business card", r"business card|name card|calling card"),
]


def pick_scene_surface(prompt: str) -> Optional[str]:
    """For 'auto' mode with no explicit instruction: the most natural real
    surface in the described scene to carry the brand mark, or None when the
    scene has no obvious spot (portrait, landscape, screen-only) — the caller
    then falls back to a small, discreet corner mark."""
    low = (prompt or "").lower()
    for where, pat in _SCENE_SURFACES:
        if re.search(pat, low):
            return where
    return None


def detect_logo_request(prompt: str) -> Optional[dict]:
    """The user's EXPLICIT logo direction, if there is one:
        {"mode": "scene",  "value": "the laptop lid"}   ("... logo on the laptop lid")
        {"mode": "corner", "value": "top-right"}        ("... logo in the top-right")
    Returns None when the prompt only *describes* a brand rather than directing
    where its mark goes."""
    if not prompt:
        return None
    low = prompt.lower()
    if not any(w in low for w in _LOGO_WORDS):
        return None
    idx = min((low.find(w) for w in _LOGO_WORDS if w in low), default=-1)
    # only the SAME clause as the logo word — stop at the first sentence break so
    # trailing camera/lighting boilerplate ("...logo. Shot on a full-frame
    # camera...") can never be read as "put the logo on the camera".
    tail = prompt[idx: idx + 160] if idx >= 0 else prompt
    tail = re.split(r"[.!?;\n]", tail, maxsplit=1)[0]
    m = _ON_SURFACE_RE.search(tail)
    if m:
        surface = m.group(1).strip(" -'").lower()
        if surface and not normalize_position(surface) and surface not in _NOT_A_SURFACE:
            article = "" if surface.startswith(("the ", "a ", "an ")) else "the "
            return {"mode": "scene", "value": f"{article}{surface}".strip()}
    pos = _pos_near_logo(prompt)
    if pos:
        return {"mode": "corner", "value": pos}
    return None

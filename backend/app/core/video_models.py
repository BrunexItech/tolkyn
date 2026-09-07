"""Catalog of Veo 3.1 models available through the Gemini API — the single
source of truth for model ids, pricing, and capabilities. Everything else
(cost estimation, super-admin governance, the tenant picker) reads from here
instead of hard-coding numbers, so a Google price change means editing one
file."""
from dataclasses import dataclass, field
from typing import Dict, Optional


@dataclass(frozen=True)
class VeoModel:
    key: str                       # our stable identifier (used in the DB, the API, the UI)
    model_id: str                  # the actual Gemini API model id
    label: str
    description: str
    price_per_second: Dict[str, Optional[float]] = field(default_factory=dict)  # resolution -> USD/sec
    max_resolution: str = "1080p"
    supports_audio: bool = True  # Lite's API rejects the generateAudio param outright


VEO_MODELS: Dict[str, VeoModel] = {
    "veo-3.1-standard": VeoModel(
        key="veo-3.1-standard",
        model_id="veo-3.1-generate-preview",
        label="Veo 3.1 Standard",
        description="Best quality — sharpest detail and the most accurate sound/dialogue sync.",
        price_per_second={"720p": 0.40, "1080p": 0.40, "4k": 0.60},
        max_resolution="4k",
    ),
    "veo-3.1-fast": VeoModel(
        key="veo-3.1-fast",
        model_id="veo-3.1-fast-generate-preview",
        label="Veo 3.1 Fast",
        description="Faster, cheaper, still full quality with native audio — the default for most jobs.",
        price_per_second={"720p": 0.10, "1080p": 0.12, "4k": 0.30},
        max_resolution="4k",
    ),
    "veo-3.1-lite": VeoModel(
        key="veo-3.1-lite",
        model_id="veo-3.1-lite-generate-preview",
        label="Veo 3.1 Lite",
        description="Cheapest option, silent (no audio), no 4K — good for quick drafts and iteration.",
        price_per_second={"720p": 0.05, "1080p": 0.08},
        max_resolution="1080p",
        supports_audio=False,
    ),
}

DEFAULT_MODEL_KEY = "veo-3.1-fast"

# Veo generates at most ~8s in one call; anything longer is produced as
# back-to-back segments and stitched. SELECTABLE_DURATIONS is the full menu a
# super admin may expose to a workspace; DEFAULT_DURATIONS is what a workspace
# gets when the admin hasn't set anything.
NATIVE_MAX_DURATION = 8
SELECTABLE_DURATIONS = (4, 8, 16, 30, 45, 60)
DEFAULT_DURATIONS = (4, 8)
# kept for anything importing the old name (validation now uses the per-user set)
ALLOWED_DURATIONS = SELECTABLE_DURATIONS
ALLOWED_RESOLUTIONS = ("720p", "1080p", "4k")
ALLOWED_ASPECT_RATIOS = ("16:9", "9:16")


def duration_plan(total_seconds: int) -> list[int]:
    """Split a target duration into Veo-native segments (<= NATIVE_MAX each,
    each at least 4s)."""
    total = max(4, int(total_seconds))
    if total <= NATIVE_MAX_DURATION:
        return [total]
    segs: list[int] = []
    remaining = total
    while remaining > NATIVE_MAX_DURATION:
        segs.append(NATIVE_MAX_DURATION)
        remaining -= NATIVE_MAX_DURATION
    segs.append(max(4, remaining))
    return segs


def get_model(key: str) -> VeoModel:
    model = VEO_MODELS.get(key)
    if not model:
        raise ValueError(f"Unknown video model '{key}'")
    return model


def estimate_cost_usd(model_key: str, resolution: str, duration_seconds: int) -> float:
    model = get_model(model_key)
    per_second = model.price_per_second.get(resolution)
    if per_second is None:
        raise ValueError(f"{model.label} does not support {resolution}")
    return round(per_second * duration_seconds, 4)


_PIXEL_DIMENSIONS = {
    ("16:9", "720p"): (1280, 720),
    ("16:9", "1080p"): (1920, 1080),
    ("16:9", "4k"): (3840, 2160),
    ("9:16", "720p"): (720, 1280),
    ("9:16", "1080p"): (1080, 1920),
    ("9:16", "4k"): (2160, 3840),
}


def video_pixel_width(resolution: str, aspect_ratio: str) -> tuple[int, int]:
    """(width, height) for a given resolution+aspect combo — used to size the
    brand watermark relative to the actual output frame."""
    return _PIXEL_DIMENSIONS.get((aspect_ratio, resolution), (1280, 720))


def catalog_payload() -> list[dict]:
    """JSON-friendly listing for API responses."""
    return [
        {
            "key": m.key,
            "label": m.label,
            "description": m.description,
            "max_resolution": m.max_resolution,
            "price_per_second": m.price_per_second,
            "supports_audio": m.supports_audio,
        }
        for m in VEO_MODELS.values()
    ]

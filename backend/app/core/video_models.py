"""Catalog of Gemini Omni Flash video models — the single source of truth
for model ids, pricing, and capabilities. Everything else (cost estimation,
super-admin governance, the tenant picker) reads from here instead of
hard-coding numbers, so a Google price change means editing one file.

Migrated from Veo 3.1 (3 tiers: Standard/Fast/Lite) after Google shut down
the Veo 3.1 preview models on 2026-10-22 -- gemini-omni-1.1-flash is a
single model, not a tiered family, confirmed via a real 404 from the old
endpoint naming it as the replacement and Google's own docs for it."""
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
    supports_audio: bool = True
    supports_reference_images: bool = True


VEO_MODELS: Dict[str, VeoModel] = {
    "gemini-omni-1.1-flash": VeoModel(
        key="gemini-omni-1.1-flash",
        model_id="gemini-omni-1.1-flash",
        label="Gemini Omni Flash",
        description="Google's current video generation model (replaced Veo 3.1 on 2026-10-22) — "
        "native audio, reference images, and up to 4K.",
        # Confirmed from Google's own pricing page: $17.50/1M output tokens,
        # 5,792 tokens/sec of 720p video -> ~$0.10/sec. Google's pricing page
        # doesn't break this out per resolution the way the old Veo page did,
        # so the same rate is applied across tiers here as the only
        # confirmed figure -- update this if Google publishes per-resolution
        # pricing for this model.
        price_per_second={"720p": 0.10, "1080p": 0.10, "4k": 0.10},
        max_resolution="4k",
    ),
}

DEFAULT_MODEL_KEY = "gemini-omni-1.1-flash"

# Omni's standard/default generation length -- there's no structured duration
# parameter any more (confirmed: not in Google's request schema for this
# model), so duration is requested via an instruction appended to the prompt
# text instead (see gemini_video_client.py). Anything longer than this is
# still produced as back-to-back segments and stitched, exactly like before.
# SELECTABLE_DURATIONS is the full menu a super admin may expose to a
# workspace; DEFAULT_DURATIONS is what a workspace gets when the admin
# hasn't set anything.
NATIVE_MAX_DURATION = 10
SELECTABLE_DURATIONS = (5, 10, 20, 30, 40, 60)
DEFAULT_DURATIONS = (5, 10)
# kept for anything importing the old name (validation now uses the per-user set)
ALLOWED_DURATIONS = SELECTABLE_DURATIONS
ALLOWED_RESOLUTIONS = ("720p", "1080p", "4k")
ALLOWED_ASPECT_RATIOS = ("16:9", "9:16")


def duration_plan(total_seconds: int) -> list[int]:
    """Split a target duration into Omni-native segments (<= NATIVE_MAX each,
    each at least 5s)."""
    total = max(5, int(total_seconds))
    if total <= NATIVE_MAX_DURATION:
        return [total]
    segs: list[int] = []
    remaining = total
    while remaining > NATIVE_MAX_DURATION:
        segs.append(NATIVE_MAX_DURATION)
        remaining -= NATIVE_MAX_DURATION
    segs.append(max(5, remaining))
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
            "supports_reference_images": m.supports_reference_images,
        }
        for m in VEO_MODELS.values()
    ]

"""Composites a brand logo onto a finished video as a bottom-right corner
watermark, via ffmpeg. This is deliberately a post-processing step, not
something asked of Veo itself — Google's video model doesn't reliably render
an exact logo even where the feature exists (confirmed unavailable on this
account anyway, see gemini_video_client.py), so a real image composite is
the only way to guarantee the mark actually looks like the logo."""
import asyncio
import logging
import shutil
from pathlib import Path

logger = logging.getLogger(__name__)

_LOGO_WIDTH_FRACTION = 0.14   # watermark width as a fraction of the video's width
_MARGIN_PX = 24
_OPACITY = 0.85


async def apply_watermark(
    video_path: Path,
    logo_path: Path,
    out_path: Path,
    *,
    video_width: int,
    video_height: int = 0,
) -> bool:
    """Writes `out_path` with the logo composited bottom-right. Returns True
    on success; False (with the original left untouched) on any failure —
    a broken watermark step should never break the whole generation."""
    if not shutil.which("ffmpeg"):
        logger.warning("ffmpeg not found on PATH — skipping watermark")
        return False

    box_w = max(24, round(video_width * _LOGO_WIDTH_FRACTION))
    box_h = round((video_height or round(video_width * 9 / 16)) * 0.25)
    # Fit the logo inside box_w x box_h keeping aspect, so a wide OR tall logo
    # can never overflow the frame; overlay math is clamped on-frame too.
    filter_complex = (
        f"[1:v]scale=w={box_w}:h={box_h}:force_original_aspect_ratio=decrease,"
        f"format=rgba,colorchannelmixer=aa={_OPACITY}[wm];"
        f"[0:v][wm]overlay="
        f"x='max(0\\,main_w-overlay_w-{_MARGIN_PX})':"
        f"y='max(0\\,main_h-overlay_h-{_MARGIN_PX})'[out]"
    )
    cmd = [
        "ffmpeg", "-y",
        "-i", str(video_path),
        "-i", str(logo_path),
        "-filter_complex", filter_complex,
        "-map", "[out]", "-map", "0:a?",
        "-c:a", "copy",
        str(out_path),
    ]

    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0 or not out_path.is_file():
        logger.warning("watermark compositing failed: %s", stderr.decode(errors="replace")[-800:])
        out_path.unlink(missing_ok=True)
        return False
    return True

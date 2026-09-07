"""ffmpeg helpers for the multi-segment video path: grab the last frame of a
clip (to seed the next segment for visual continuity) and concatenate the
finished segments into one file."""
import asyncio
import logging
import shutil
from pathlib import Path
from typing import List

logger = logging.getLogger(__name__)


def _ffmpeg() -> bool:
    return shutil.which("ffmpeg") is not None


async def _run(cmd: List[str]) -> bool:
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        logger.warning("ffmpeg failed: %s", stderr.decode(errors="replace")[-600:])
        return False
    return True


async def extract_last_frame(video_path: Path, out_png: Path) -> bool:
    """Write the final frame of `video_path` as a PNG — used as the first
    frame of the next segment so the two clips flow together."""
    if not _ffmpeg():
        return False
    ok = await _run([
        "ffmpeg", "-y", "-sseof", "-0.2", "-i", str(video_path),
        "-frames:v", "1", "-q:v", "2", str(out_png),
    ])
    return ok and out_png.is_file()


async def concat_videos(paths: List[Path], out_path: Path) -> bool:
    """Join clips in order into `out_path`. Tries a stream copy first; falls
    back to a re-encode if the segments' parameters don't line up."""
    if not _ffmpeg() or not paths:
        return False
    if len(paths) == 1:
        shutil.copyfile(paths[0], out_path)
        return out_path.is_file()

    listing = out_path.with_suffix(".concat.txt")
    listing.write_text("".join(f"file '{p.as_posix()}'\n" for p in paths))
    try:
        ok = await _run([
            "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(listing),
            "-c", "copy", str(out_path),
        ])
        if not ok or not out_path.is_file():
            ok = await _run([
                "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(listing),
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
                "-c:a", "aac", "-movflags", "+faststart", str(out_path),
            ])
        return ok and out_path.is_file()
    finally:
        listing.unlink(missing_ok=True)

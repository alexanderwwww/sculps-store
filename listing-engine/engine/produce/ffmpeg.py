"""ffmpeg/ffprobe location and invocation.

Prefers a system ffmpeg; falls back to the binary shipped with ``imageio-ffmpeg``
so the pipeline works on a machine without a system install.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from functools import lru_cache
from pathlib import Path


class FfmpegError(RuntimeError):
    pass


@lru_cache(maxsize=1)
def ffmpeg_bin() -> str:
    found = shutil.which("ffmpeg")
    if found:
        return found
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception as exc:
        raise FfmpegError(
            "no ffmpeg found. Install ffmpeg, or `pip install imageio-ffmpeg`."
        ) from exc


@lru_cache(maxsize=1)
def ffprobe_bin() -> str | None:
    """ffprobe is optional — image dimensions fall back to an ffmpeg parse."""
    return shutil.which("ffprobe")


def run(args: list[str], *, quiet: bool = True) -> str:
    cmd = [ffmpeg_bin(), "-hide_banner", "-nostdin"]
    if quiet:
        cmd += ["-loglevel", "error"]
    cmd += args
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise FfmpegError(
            f"ffmpeg failed ({proc.returncode}):\n"
            f"  cmd: {' '.join(cmd)}\n"
            f"  stderr: {proc.stderr.strip()[-2000:]}"
        )
    return proc.stderr


def image_size(path: str | Path) -> tuple[int, int]:
    """Return (width, height) of an image."""
    p = str(path)
    probe = ffprobe_bin()
    if probe:
        proc = subprocess.run(
            [probe, "-v", "error", "-select_streams", "v:0",
             "-show_entries", "stream=width,height", "-of", "json", p],
            capture_output=True, text=True,
        )
        if proc.returncode == 0:
            streams = json.loads(proc.stdout).get("streams") or []
            if streams:
                return int(streams[0]["width"]), int(streams[0]["height"])

    # Fallback: ffmpeg prints "Stream #0:0: Video: ... 1920x1080 ..." to stderr.
    proc = subprocess.run(
        [ffmpeg_bin(), "-hide_banner", "-i", p], capture_output=True, text=True)
    import re
    m = re.search(r"Video:.*?,\s*(\d{2,5})x(\d{2,5})", proc.stderr)
    if not m:
        raise FfmpegError(f"could not read dimensions of {p}")
    return int(m.group(1)), int(m.group(2))


def has_filter(name: str) -> bool:
    proc = subprocess.run([ffmpeg_bin(), "-hide_banner", "-filters"],
                          capture_output=True, text=True)
    return f" {name} " in proc.stdout

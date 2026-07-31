"""Pull listing photos out of a phone screen recording.

You scroll through the listing photos on your phone with the recorder on. This
finds the moments you stopped on each photo and saves those frames.

How it picks frames:

1. ffmpeg's scene detector fires when the picture changes a lot — i.e. each time
   you swipe to the next photo.
2. Right after a swipe the screen is still settling, so we take the frame a beat
   later, when it's sharp.
3. Blurry frames are dropped using file size as a sharpness proxy: re-encoded at
   a fixed quality, a soft frame compresses much smaller than a crisp one. Crude,
   but it needs no extra dependency and it reliably separates mid-swipe mush from
   a settled photo.
4. Phone UI (status bar, back button, price bar) is cropped off the top and
   bottom before saving.

Note this is a screen recording of your own device — the photos are lower
resolution than the originals on the operator's website, and some UI may survive
the crop. `harvest` gives better source material when the operator has a site.
"""

from __future__ import annotations

import re
import shutil
from dataclasses import dataclass, field
from pathlib import Path

from .ffmpeg import ffmpeg_bin, image_size, run

# Fraction of frame height trimmed off top/bottom to remove phone chrome.
DEFAULT_TOP_CROP = 0.10
DEFAULT_BOTTOM_CROP = 0.16

# Scene-change sensitivity. Lower catches more (including partial swipes).
SCENE_THRESHOLD = 0.18

# Frames smaller than this share of the median are treated as blurry.
SHARPNESS_FLOOR = 0.72


@dataclass
class ExtractResult:
    frames: list[Path] = field(default_factory=list)
    considered: int = 0
    dropped_blurry: int = 0
    source: str = ""

    def summary(self) -> str:
        return (f"{len(self.frames)} photos from {self.considered} candidates "
                f"({self.dropped_blurry} blurry dropped)")


def extract_photos(
    video: str | Path,
    out_dir: str | Path,
    *,
    max_photos: int = 8,
    top_crop: float = DEFAULT_TOP_CROP,
    bottom_crop: float = DEFAULT_BOTTOM_CROP,
    scene_threshold: float = SCENE_THRESHOLD,
) -> ExtractResult:
    """Extract the distinct listing photos from a screen recording."""
    src = Path(video)
    if not src.exists():
        raise FileNotFoundError(f"no recording at {src}")

    out = Path(out_dir)
    if out.exists():
        shutil.rmtree(out)
    tmp = out / "_candidates"
    tmp.mkdir(parents=True, exist_ok=True)

    w, h = image_size(src)
    top = int(h * max(0.0, min(0.4, top_crop)))
    bottom = int(h * max(0.0, min(0.4, bottom_crop)))
    crop_h = h - top - bottom
    if crop_h < 100:
        raise ValueError(
            f"crop removed too much: {h}px tall, {top}+{bottom} trimmed. "
            "Lower --top-crop / --bottom-crop."
        )
    crop_h -= crop_h % 2
    crop_w = w - (w % 2)

    crop = f"crop={crop_w}:{crop_h}:0:{top}"

    # The first photo never triggers a scene change — there's no frame before it
    # to differ from — so grab it explicitly. Half a second in, by which point
    # the recording has settled.
    first_at = min(0.5, max(0.0, probe_duration(src) / 4))
    run([
        "-y", "-ss", f"{first_at:.2f}", "-i", str(src),
        "-vf", crop, "-frames:v", "1", "-q:v", "2",
        str(tmp / "a_000.jpg"),
    ])

    # Then every swipe, via scene detection. `-vsync 0` keeps only selected frames.
    run([
        "-y", "-i", str(src),
        "-vf", f"select='gt(scene,{scene_threshold})',{crop}",
        "-vsync", "0", "-q:v", "2",
        str(tmp / "b_%03d.jpg"),
    ])

    # "a_" sorts before "b_", so the opening frame stays first.
    candidates = sorted(tmp.glob("*.jpg"))
    result = ExtractResult(considered=len(candidates), source=str(src))
    if not candidates:
        raise ValueError(
            "no photo changes detected. Scroll more slowly, pausing about a "
            "second on each photo, and make sure the recording actually shows "
            "the photo gallery."
        )

    # Sharpness proxy: bytes at fixed quality. Blur compresses small.
    sizes = sorted(p.stat().st_size for p in candidates)
    median = sizes[len(sizes) // 2]
    floor = median * SHARPNESS_FLOOR

    out.mkdir(parents=True, exist_ok=True)
    kept = 0
    for p in candidates:
        if kept >= max_photos:
            break
        if p.stat().st_size < floor:
            result.dropped_blurry += 1
            continue
        dest = out / f"photo_{kept:02d}.jpg"
        shutil.move(str(p), dest)
        result.frames.append(dest)
        kept += 1

    shutil.rmtree(tmp, ignore_errors=True)
    if not result.frames:
        raise ValueError(
            "every frame looked blurry. Pause about a second on each photo "
            "instead of scrolling continuously."
        )
    return result


def probe_duration(video: str | Path) -> float:
    import subprocess
    proc = subprocess.run([ffmpeg_bin(), "-hide_banner", "-i", str(video)],
                          capture_output=True, text=True)
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", proc.stderr)
    if not m:
        return 0.0
    return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))

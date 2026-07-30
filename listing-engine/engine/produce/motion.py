"""Truthful camera movement over real photographs.

Every output frame is a crop-and-scale of the source photograph. Nothing is
generated, inferred, or filled in. That is the whole point: the result reads as
cinematic while remaining a faithful representation of the room that was
photographed (COMPLIANCE.md §1).

Deliberately *not* implemented here, and refused if requested:

* generating a continuous walkthrough that implies a floor plan
* generating rooms, views, or amenities not present in the source
* outpainting / uncropping beyond the photograph's real edges

Method: pre-scale the photo for resolution headroom, crop to the delivery aspect
around a focal anchor, then apply an eased ``zoompan`` move. Easing is a
smoothstep, so moves start and end at rest rather than snapping — that difference
is most of what separates a "cinematic" push from a slideshow effect.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from ..models import Shot
from .ffmpeg import image_size, run

ASPECTS: dict[str, tuple[int, int]] = {
    "9:16": (9, 16),
    "4:5": (4, 5),
    "1:1": (1, 1),
    "16:9": (16, 9),
}

# Zoom travel per move. Kept modest on purpose — a 16% push over 4s reads as
# expensive; a 60% push reads as a PowerPoint transition.
ZOOM_TRAVEL = 0.16
PAN_ZOOM = 1.12

MOVES = (
    "push_in", "pull_out",
    "pan_left", "pan_right",
    "tilt_up", "tilt_down",
    "push_in_left", "push_in_right",
    "hold",
)

# Anything in this set would require inventing image content.
REFUSED_MOVES = {
    "walkthrough": "implies a floor plan that a single photo cannot support",
    "orbit": "requires geometry not present in a single photograph",
    "dolly_through_doorway": "requires generating the space beyond the doorway",
    "outpaint": "extends beyond the real edges of the photograph",
    "uncrop": "extends beyond the real edges of the photograph",
}


class FabricationRefused(Exception):
    """Raised when a requested move would misrepresent the property."""


@dataclass
class RenderSettings:
    aspect: str = "9:16"
    width: int = 1080
    fps: int = 30
    headroom: float = 2.0   # pre-scale factor over output size, for crisp zooms
    crf: int = 18

    @property
    def out_size(self) -> tuple[int, int]:
        if self.aspect not in ASPECTS:
            raise ValueError(f"unsupported aspect {self.aspect!r}; "
                             f"choose from {sorted(ASPECTS)}")
        aw, ah = ASPECTS[self.aspect]
        w = self.width - (self.width % 2)
        h = int(round(w * ah / aw))
        return w, h - (h % 2)


def _smoothstep(d: int) -> str:
    """ffmpeg expression for eased progress in [0,1] over ``d`` output frames."""
    if d <= 1:
        return "0"
    t = f"(on/{d - 1})"
    return f"({t}*{t}*(3-2*{t}))"


def _zoompan_args(move: str, d: int, anchor_x: float, anchor_y: float) -> tuple[str, str, str]:
    """Return (z_expr, x_expr, y_expr) for a move.

    Inside zoompan, ``iw``/``ih`` are the *input* dimensions and the visible
    region is ``iw/zoom`` x ``ih/zoom`` positioned at (x, y). So a region anchored
    at normalised position ``a`` is ``x = (iw - iw/zoom) * a``.
    """
    e = _smoothstep(d)
    ax, ay = _clamp01(anchor_x), _clamp01(anchor_y)

    if move == "hold":
        return "1.0", "0", "0"

    if move == "push_in":
        z = f"(1.0+{ZOOM_TRAVEL}*{e})"
    elif move == "pull_out":
        z = f"({1.0 + ZOOM_TRAVEL}-{ZOOM_TRAVEL}*{e})"
    elif move in ("pan_left", "pan_right", "tilt_up", "tilt_down"):
        z = f"{PAN_ZOOM}"
    elif move in ("push_in_left", "push_in_right"):
        z = f"(1.0+{ZOOM_TRAVEL}*{e})"
    else:
        raise ValueError(f"unknown move {move!r}")

    # Horizontal / vertical travel across the full available slack.
    slack_x = f"(iw-iw/zoom)"
    slack_y = f"(ih-ih/zoom)"

    if move == "pan_right":
        x, y = f"{slack_x}*{e}", f"{slack_y}*{ay}"
    elif move == "pan_left":
        x, y = f"{slack_x}*(1-{e})", f"{slack_y}*{ay}"
    elif move == "tilt_down":
        x, y = f"{slack_x}*{ax}", f"{slack_y}*{e}"
    elif move == "tilt_up":
        x, y = f"{slack_x}*{ax}", f"{slack_y}*(1-{e})"
    elif move == "push_in_right":
        x, y = f"{slack_x}*(0.5+0.5*{e})", f"{slack_y}*{ay}"
    elif move == "push_in_left":
        x, y = f"{slack_x}*(0.5-0.5*{e})", f"{slack_y}*{ay}"
    else:  # push_in / pull_out, anchored
        x, y = f"{slack_x}*{ax}", f"{slack_y}*{ay}"

    return z, x, y


def _clamp01(v: float) -> float:
    return max(0.0, min(1.0, float(v)))


def build_filter(shot: Shot, settings: RenderSettings, src_w: int, src_h: int) -> str:
    ow, oh = settings.out_size
    d = max(2, int(round(shot.seconds * settings.fps)))

    # 1. Pre-scale for headroom so the zoom crops from more pixels than it needs.
    #    Cover the output box, then keep scaling until we have `headroom` slack.
    target_w = int(ow * settings.headroom)
    target_h = int(oh * settings.headroom)
    scale_factor = max(target_w / src_w, target_h / src_h)
    sw = max(target_w, int(round(src_w * scale_factor)))
    sh = max(target_h, int(round(src_h * scale_factor)))
    sw -= sw % 2
    sh -= sh % 2

    # 2. Crop to the delivery aspect around the focal anchor. This is a genuine
    #    reframe of the photograph, not an extension of it.
    crop_w = min(sw, int(round(sh * ow / oh)))
    crop_h = min(sh, int(round(crop_w * oh / ow)))
    crop_w -= crop_w % 2
    crop_h -= crop_h % 2
    cx = int(round((sw - crop_w) * _clamp01(shot.anchor_x)))
    cy = int(round((sh - crop_h) * _clamp01(shot.anchor_y)))

    z, x, y = _zoompan_args(shot.move, d, shot.anchor_x, shot.anchor_y)

    parts = [
        f"scale={sw}:{sh}:flags=lanczos",
        f"crop={crop_w}:{crop_h}:{cx}:{cy}",
        (f"zoompan=z='{z}':x='{x}':y='{y}':d={d}:s={ow}x{oh}:fps={settings.fps}"),
        "format=yuv420p",
    ]
    return ",".join(parts)


def render_shot(shot: Shot, out_path: str | Path,
                settings: RenderSettings | None = None) -> Path:
    """Render one shot to an mp4 clip. Returns the output path."""
    settings = settings or RenderSettings()
    src = Path(shot.source_image)
    if not src.exists():
        raise FileNotFoundError(f"source photo not found: {src}")

    if shot.move in REFUSED_MOVES:
        raise FabricationRefused(
            f"refusing move {shot.move!r} on {src.name}: "
            f"{REFUSED_MOVES[shot.move]}. This would misrepresent the property "
            "and can get the client's listing suspended (COMPLIANCE.md §1)."
        )
    if shot.move not in MOVES:
        raise ValueError(f"unknown move {shot.move!r}; choose from {MOVES}")

    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)

    src_w, src_h = image_size(src)
    vf = build_filter(shot, settings, src_w, src_h)

    run([
        "-y", "-i", str(src),
        "-vf", vf,
        "-frames:v", str(max(2, int(round(shot.seconds * settings.fps)))),
        "-c:v", "libx264", "-preset", "medium", "-crf", str(settings.crf),
        "-pix_fmt", "yuv420p", "-r", str(settings.fps),
        "-movflags", "+faststart",
        str(out),
    ])
    return out


def render_shots(shots: list[Shot], out_dir: str | Path,
                 settings: RenderSettings | None = None) -> list[Path]:
    out_dir = Path(out_dir)
    return [
        render_shot(s, out_dir / f"shot_{i:02d}.mp4", settings)
        for i, s in enumerate(shots)
    ]


def suggest_moves(n: int) -> list[str]:
    """A varied, non-repeating move order.

    Alternating direction and zoom sense is what stops a 5-shot reel feeling like
    the same effect applied five times.
    """
    cycle = ["push_in", "pan_right", "pull_out", "tilt_down",
             "push_in_left", "pan_left", "push_in", "tilt_up"]
    return [cycle[i % len(cycle)] for i in range(n)]

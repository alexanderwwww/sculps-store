"""Assemble rendered shots into a finished vertical reel.

Chains shots with crossfades, optionally lays music underneath, burns captions,
and appends an end card. Audio is trimmed to the video length so the reel never
ends on a dangling music tail.

If any shot is marked ``virtually_staged``, a ``Virtually staged`` label is burned
onto that shot's frames and cannot be switched off — the disclosure obligation is
not a preference (COMPLIANCE.md §1).
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from ..models import Shot
from .ffmpeg import has_filter, run

STAGED_LABEL = "Virtually staged"


class TextRenderUnavailable(RuntimeError):
    """ffmpeg was built without drawtext, so text cannot be burned in."""


_DRAWTEXT_HINT = (
    "this ffmpeg build has no 'drawtext' filter (it needs --enable-libfreetype). "
    "Install a full ffmpeg (e.g. `apt install ffmpeg` or `brew install ffmpeg`) — "
    "the imageio-ffmpeg fallback binary is often built without it."
)


def _require_drawtext(what: str) -> None:
    if not has_filter("drawtext"):
        raise TextRenderUnavailable(f"cannot render {what}: {_DRAWTEXT_HINT}")


@dataclass
class ReelSettings:
    width: int = 1080
    height: int = 1920
    fps: int = 30
    crossfade: float = 0.5
    music_gain_db: float = -18.0
    font: str = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    crf: int = 19
    end_card_seconds: float = 2.0


def _esc(text: str) -> str:
    """Escape text for ffmpeg drawtext."""
    out = text.replace("\\", "\\\\").replace(":", "\\:").replace("'", "’")
    return out.replace("%", "\\%")


def _drawtext(text: str, settings: ReelSettings, *, y: str, size: int,
              box: bool = True, enable: str | None = None) -> str:
    parts = [
        f"drawtext=fontfile={settings.font}",
        f"text='{_esc(text)}'",
        f"fontsize={size}",
        "fontcolor=white",
        "x=(w-text_w)/2",
        f"y={y}",
        "shadowcolor=black@0.5", "shadowx=2", "shadowy=2",
    ]
    if box:
        parts += ["box=1", "boxcolor=black@0.35", "boxborderw=18"]
    if enable:
        parts.append(f"enable='{enable}'")
    return ":".join(parts)


def assemble_reel(
    clips: list[Path],
    out_path: str | Path,
    *,
    shots: list[Shot] | None = None,
    settings: ReelSettings | None = None,
    music: str | Path | None = None,
    end_card: str = "",
    clip_seconds: float | None = None,
) -> Path:
    """Crossfade ``clips`` into one reel.

    ``clip_seconds`` is the per-clip duration; when omitted it's taken from the
    shots list, defaulting to 4.0s.
    """
    settings = settings or ReelSettings()
    if not clips:
        raise ValueError("no clips to assemble")

    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)

    durations = [
        (shots[i].seconds if shots and i < len(shots) else (clip_seconds or 4.0))
        for i in range(len(clips))
    ]
    xf = settings.crossfade
    if any(d <= xf for d in durations):
        raise ValueError(
            f"crossfade ({xf}s) must be shorter than every shot; got {durations}"
        )

    args: list[str] = ["-y"]
    for c in clips:
        args += ["-i", str(c)]
    music_idx = None
    if music:
        args += ["-i", str(music)]
        music_idx = len(clips)

    chains: list[str] = []
    labels: list[str] = []

    # Per-shot labels and mandatory staging disclosure.
    text_ok = has_filter("drawtext")
    for i, c in enumerate(clips):
        filters = [f"scale={settings.width}:{settings.height}", "setsar=1",
                   f"fps={settings.fps}"]
        shot = shots[i] if shots and i < len(shots) else None
        if shot and shot.label:
            # A cosmetic caption is worth dropping rather than failing the render.
            if text_ok:
                filters.append(_drawtext(shot.label, settings, y="h*0.82", size=52))
            else:
                print(f"warning: dropping caption on shot {i} — {_DRAWTEXT_HINT}")
        if shot and shot.virtually_staged:
            # Non-negotiable disclosure, top of frame, for the whole shot. If we
            # can't burn the label we must not ship the shot at all.
            _require_drawtext(f"the mandatory '{STAGED_LABEL}' disclosure on shot {i}")
            filters.append(_drawtext(STAGED_LABEL, settings, y="h*0.06", size=40))
        lbl = f"v{i}"
        chains.append(f"[{i}:v]{','.join(filters)}[{lbl}]")
        labels.append(lbl)

    # Crossfade chain. Each xfade's offset is the running length minus the
    # accumulated overlap.
    if len(labels) == 1:
        video_label = labels[0]
        total = durations[0]
    else:
        acc = durations[0]
        current = labels[0]
        for i in range(1, len(labels)):
            offset = acc - xf
            nxt = f"x{i}"
            chains.append(
                f"[{current}][{labels[i]}]"
                f"xfade=transition=fade:duration={xf}:offset={offset:.3f}[{nxt}]"
            )
            acc = acc + durations[i] - xf
            current = nxt
        video_label = current
        total = acc

    # End card, drawn over the tail of the last shot rather than as a black slate,
    # so the reel doesn't die on a blank frame.
    if end_card:
        # Explicitly requested, so fail loudly rather than silently dropping it.
        _require_drawtext("the end card")
        start = max(0.0, total - settings.end_card_seconds)
        chains.append(
            f"[{video_label}]"
            + _drawtext(end_card, settings, y="(h-text_h)/2", size=64,
                        enable=f"gte(t,{start:.3f})")
            + "[vout]"
        )
        video_label = "vout"

    filter_complex = ";".join(chains)
    maps = ["-map", f"[{video_label}]"]

    if music_idx is not None:
        filter_complex += (
            f";[{music_idx}:a]volume={settings.music_gain_db}dB,"
            f"afade=t=out:st={max(0.0, total - 1.5):.3f}:d=1.5,"
            f"atrim=0:{total:.3f},asetpts=N/SR/TB[aout]"
        )
        maps += ["-map", "[aout]", "-c:a", "aac", "-b:a", "128k", "-shortest"]

    run(args + [
        "-filter_complex", filter_complex,
        *maps,
        "-c:v", "libx264", "-preset", "medium", "-crf", str(settings.crf),
        "-pix_fmt", "yuv420p", "-r", str(settings.fps),
        "-movflags", "+faststart",
        "-t", f"{total:.3f}",
        str(out),
    ])
    return out

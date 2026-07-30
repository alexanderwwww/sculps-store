"""Batch production across many properties — the "box of listings" run.

Layout expected under ``--inbox``::

    inbox/
      nashville-2br-downtown/     <- property_ref is the folder name
        photo1.jpg
        photo2.jpg
      austin-loft-e6th/
        ...

Each folder becomes one reel. A folder without a recorded rights grant is skipped
with a reason rather than silently produced.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from pathlib import Path

from ..config import Config
from ..db import Store
from ..models import PhotoGrant
from .assemble import ReelSettings, assemble_reel
from .intake import build_job, grant_from_row
from .motion import RenderSettings, render_shots


@dataclass
class BatchResult:
    produced: list[str] = field(default_factory=list)
    skipped: list[tuple[str, str]] = field(default_factory=list)
    failed: list[tuple[str, str]] = field(default_factory=list)

    def summary(self) -> str:
        return (f"produced={len(self.produced)} skipped={len(self.skipped)} "
                f"failed={len(self.failed)}")


def produce_one(
    grant: PhotoGrant,
    cfg: Config,
    property_dir: Path,
    out_dir: Path,
    *,
    client: str,
    music: str | None = None,
    end_card: str = "",
) -> Path:
    """Produce one property's reel.

    Takes a resolved ``grant`` rather than a Store: this runs on a worker thread,
    and sqlite connections cannot cross threads.
    """
    property_ref = property_dir.name
    job = build_job(
        grant=grant,
        property_ref=property_ref,
        client=client,
        photo_dir=property_dir,
        aspect=cfg.produce.aspect,
        shot_seconds=cfg.produce.shot_seconds,
        music=music,
        end_card=end_card,
    )

    rs = RenderSettings(aspect=job.aspect, width=cfg.produce.width,
                        fps=cfg.produce.fps)
    work = cfg.work_dir / property_ref
    clips = render_shots(job.shots, work, rs)

    ow, oh = rs.out_size
    reel = assemble_reel(
        clips,
        out_dir / f"{property_ref}_{job.aspect.replace(':', 'x')}.mp4",
        shots=job.shots,
        settings=ReelSettings(width=ow, height=oh, fps=cfg.produce.fps,
                              crossfade=cfg.produce.crossfade_seconds,
                              font=cfg.produce.font),
        music=job.music,
        end_card=job.end_card,
    )
    return reel


def run_batch(
    store: Store,
    cfg: Config,
    inbox: str | Path,
    out_dir: str | Path,
    *,
    client: str = "",
    music: str | None = None,
    end_card: str = "",
    workers: int = 2,
) -> BatchResult:
    inbox_p, out_p = Path(inbox), Path(out_dir)
    if not inbox_p.is_dir():
        raise NotADirectoryError(f"{inbox_p} is not a directory")
    out_p.mkdir(parents=True, exist_ok=True)

    dirs = sorted(d for d in inbox_p.iterdir() if d.is_dir())
    result = BatchResult()
    if not dirs:
        return result

    # Resolve every grant up front, on this thread, before any worker starts.
    granted: list[tuple[Path, PhotoGrant]] = []
    for d in dirs:
        row = store.get_grant(d.name)
        if not row:
            result.skipped.append(
                (d.name, "no photo-rights grant on file (run record-grant)"))
            continue
        granted.append((d, grant_from_row(row)))

    # x264 already threads well; a small pool avoids oversubscribing CPU.
    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        futures = {}
        for d, grant in granted:
            futures[pool.submit(
                produce_one, grant, cfg, d, out_p,
                client=client or d.name, music=music, end_card=end_card,
            )] = d.name

        for fut in as_completed(futures):
            name = futures[fut]
            try:
                path = fut.result()
                result.produced.append(str(path))
            except Exception as exc:
                result.failed.append((name, str(exc)))

    return result

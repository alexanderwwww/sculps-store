"""Photo intake and the rights record that has to exist before production.

The free-first-video offer means the client sends us their photos — and that
handover is the permission we need. This module makes it a recorded fact rather
than an assumption, and builds the job from the folder they sent.
"""

from __future__ import annotations

from pathlib import Path

from ..db import Store
from ..models import Job, PhotoGrant, Shot
from .motion import suggest_moves

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".heic"}

CONFIRMATION_ASK = """\
Before I start, one line back confirming this for the file:

  "I own or control the rights to these photos and I'm authorising you to edit
   them into video for my listing."

That's all I need.
"""


def record_grant(
    store: Store,
    *,
    property_ref: str,
    supplied_by: str,
    supplied_via: str,
    confirmation_note: str,
    portfolio_permission: bool = False,
) -> PhotoGrant:
    """Record that the client supplied photos and confirmed rights.

    ``confirmation_note`` should be the client's actual words (or a pointer to the
    email), not a paraphrase — it's the evidence.
    """
    if not confirmation_note.strip():
        raise ValueError(
            "confirmation_note is empty. Record what the client actually said "
            "confirming rights; do not produce on an assumption "
            "(COMPLIANCE.md §4)."
        )
    grant = PhotoGrant(
        property_ref=property_ref,
        supplied_by=supplied_by,
        supplied_via=supplied_via,
        rights_confirmed=True,
        confirmation_note=confirmation_note.strip(),
        portfolio_permission=portfolio_permission,
    )
    store.record_grant(grant)
    return grant


def find_photos(folder: str | Path) -> list[Path]:
    d = Path(folder)
    if not d.is_dir():
        raise NotADirectoryError(f"{d} is not a directory")
    photos = sorted(p for p in d.iterdir()
                    if p.is_file() and p.suffix.lower() in IMAGE_EXTS)
    if not photos:
        raise ValueError(f"no images found in {d}")
    return photos


def grant_from_row(row: dict) -> PhotoGrant:
    return PhotoGrant(
        property_ref=row["property_ref"],
        supplied_by=row["supplied_by"],
        supplied_via=row["supplied_via"],
        rights_confirmed=bool(row["rights_confirmed"]),
        confirmation_note=row["confirmation_note"],
        portfolio_permission=bool(row["portfolio_permission"]),
        received_at=row["received_at"],
    )


def load_grant(store: Store, property_ref: str) -> PhotoGrant:
    """Fetch the rights grant, or explain why production can't proceed."""
    row = store.get_grant(property_ref)
    if not row:
        raise ValueError(
            f"no photo-rights grant on file for {property_ref!r}. Run "
            "`record-grant` first — we do not produce from photos we weren't "
            "given (COMPLIANCE.md §4)."
        )
    return grant_from_row(row)


def build_job(
    store: Store | None = None,
    *,
    property_ref: str,
    client: str,
    photo_dir: str | Path,
    aspect: str = "9:16",
    shot_seconds: float = 4.0,
    max_shots: int = 6,
    music: str | None = None,
    end_card: str = "",
    labels: list[str] | None = None,
    grant: PhotoGrant | None = None,
) -> Job:
    """Assemble a Job from an intake folder.

    Refuses to build without a rights grant. Pass ``grant`` directly to build a
    job off-thread — sqlite connections are not shareable across threads, so batch
    workers resolve the grant on the main thread and hand it in.
    """
    if grant is None:
        if store is None:
            raise ValueError("build_job needs either a store or a grant")
        grant = load_grant(store, property_ref)

    photos = find_photos(photo_dir)[:max_shots]
    moves = suggest_moves(len(photos))
    shots = [
        Shot(
            source_image=str(p),
            move=moves[i],
            seconds=shot_seconds,
            # Interiors read better anchored slightly below centre: it favours
            # the floor and furniture over ceiling.
            anchor_y=0.55,
            label=(labels[i] if labels and i < len(labels) else ""),
        )
        for i, p in enumerate(photos)
    ]

    job = Job(
        property_ref=property_ref,
        client=client,
        shots=shots,
        grant=grant,
        aspect=aspect,
        music=music,
        end_card=end_card,
    )
    job.validate()
    return job

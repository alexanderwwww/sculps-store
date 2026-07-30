"""Core records that move through the pipeline."""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from enum import Enum
from typing import Any


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Segment(str, Enum):
    PROPERTY_MANAGER = "property_manager"
    AGENT = "agent"
    HOST = "host"
    UNKNOWN = "unknown"


class LeadStage(str, Enum):
    NEW = "new"
    ENRICHED = "enriched"
    QUEUED = "queued"
    CONTACTED = "contacted"
    REPLIED = "replied"
    WON = "won"
    LOST = "lost"
    SUPPRESSED = "suppressed"


@dataclass
class Lead:
    """A prospect business.

    ``source`` and ``source_url`` are mandatory: a lead with no auditable
    provenance is rejected at ingest (see COMPLIANCE.md §2).
    """

    business_name: str
    source: str
    source_url: str
    email: str | None = None
    phone: str | None = None
    website: str | None = None
    city: str | None = None
    state: str | None = None
    unit_count: int | None = None
    segment: Segment = Segment.UNKNOWN
    stage: LeadStage = LeadStage.NEW
    dedupe_key: str = ""
    touches: int = 0
    notes: str = ""
    created_at: str = field(default_factory=utcnow)

    def validate(self) -> None:
        if not self.business_name.strip():
            raise ValueError("lead has no business_name")
        if not self.source.strip() or not self.source_url.strip():
            raise ValueError(
                f"lead {self.business_name!r} has no provenance; "
                "source and source_url are required (COMPLIANCE.md §2)"
            )

    def to_row(self) -> dict[str, Any]:
        d = asdict(self)
        d["segment"] = self.segment.value
        d["stage"] = self.stage.value
        return d


@dataclass
class PhotoGrant:
    """Record that the client supplied photos and holds the rights.

    Required before any deliverable is produced (COMPLIANCE.md §4).
    """

    property_ref: str
    supplied_by: str
    supplied_via: str          # "email" | "upload" | "drive-link" | ...
    rights_confirmed: bool
    confirmation_note: str
    received_at: str = field(default_factory=utcnow)
    portfolio_permission: bool = False

    def validate(self) -> None:
        if not self.rights_confirmed:
            raise ValueError(
                f"cannot produce for {self.property_ref!r}: supplier has not confirmed "
                "they hold or control rights to the photos (COMPLIANCE.md §4)"
            )
        if not self.supplied_by.strip():
            raise ValueError("photo grant needs supplied_by")


@dataclass
class Shot:
    """One camera move over one real photograph."""

    source_image: str
    move: str = "push_in"      # see produce/motion.py MOVES
    seconds: float = 4.0
    anchor_x: float = 0.5      # focal point, normalised
    anchor_y: float = 0.5
    label: str = ""            # optional on-screen caption

    # Truthfulness flags. Anything that would fabricate geometry is refused
    # by produce.motion; these exist so the refusal is explicit and testable.
    virtually_staged: bool = False


@dataclass
class Job:
    """A production job: one property, N shots, one or more output reels."""

    property_ref: str
    client: str
    shots: list[Shot] = field(default_factory=list)
    grant: PhotoGrant | None = None
    aspect: str = "9:16"
    music: str | None = None
    end_card: str = ""
    created_at: str = field(default_factory=utcnow)

    def validate(self) -> None:
        if not self.shots:
            raise ValueError(f"job {self.property_ref!r} has no shots")
        if self.grant is None:
            raise ValueError(
                f"job {self.property_ref!r} has no PhotoGrant; "
                "photos must be supplied by the client (COMPLIANCE.md §4)"
            )
        self.grant.validate()

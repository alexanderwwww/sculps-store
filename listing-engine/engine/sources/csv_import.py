"""Manual CSV import — referrals, conference lists, your own research.

Provenance still applies: the CSV must carry a ``source_url`` column, or you must
pass ``--source-url`` describing where the list came from. A list you can't
account for doesn't get imported.
"""

from __future__ import annotations

import csv
from collections.abc import Iterator
from pathlib import Path

from ..models import Lead, Segment
from .base import LeadSource

ALIASES = {
    "business_name": ("business_name", "business", "company", "name", "operator"),
    "email": ("email", "email_address", "e-mail"),
    "phone": ("phone", "phone_number", "telephone", "tel"),
    "website": ("website", "url", "site", "domain"),
    "city": ("city", "town"),
    "state": ("state", "st", "region"),
    "unit_count": ("unit_count", "units", "properties", "listings"),
    "segment": ("segment", "type", "category"),
    "source_url": ("source_url", "source", "provenance"),
}


def _pick(row: dict[str, str], field: str) -> str | None:
    lowered = {(k or "").strip().lower(): v for k, v in row.items()}
    for alias in ALIASES[field]:
        v = lowered.get(alias)
        if v and str(v).strip():
            return str(v).strip()
    return None


class CsvSource(LeadSource):
    name = "csv"
    basis = "Manually assembled list; provenance supplied by the operator."

    def __init__(self, path: str | Path, default_source_url: str = ""):
        self.path = Path(path)
        self.default_source_url = default_source_url

    def fetch(self, **_) -> Iterator[Lead]:
        with self.path.open(newline="", encoding="utf-8-sig") as fh:
            for i, row in enumerate(csv.DictReader(fh), start=2):
                name = _pick(row, "business_name")
                if not name:
                    continue
                src_url = _pick(row, "source_url") or self.default_source_url
                if not src_url:
                    raise ValueError(
                        f"{self.path}:{i} has no source_url and no --source-url was "
                        "given. Every lead needs auditable provenance "
                        "(COMPLIANCE.md §2)."
                    )
                seg_raw = (_pick(row, "segment") or "unknown").lower()
                try:
                    seg = Segment(seg_raw)
                except ValueError:
                    seg = Segment.UNKNOWN
                units = _pick(row, "unit_count")
                yield Lead(
                    business_name=name,
                    source=f"{self.name}:{self.path.name}",
                    source_url=src_url,
                    email=_pick(row, "email"),
                    phone=_pick(row, "phone"),
                    website=_pick(row, "website"),
                    city=_pick(row, "city"),
                    state=(_pick(row, "state") or "")[:2].upper() or None,
                    unit_count=int(units) if units and units.isdigit() else None,
                    segment=seg,
                )

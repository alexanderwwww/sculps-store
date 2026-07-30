"""Lead source interface.

Every source must return leads carrying auditable provenance (``source`` and
``source_url``). Airbnb / Vrbo / Booking.com scrapers are not implementable here
by policy — see COMPLIANCE.md §2.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Iterator

from ..models import Lead


class LeadSource(ABC):
    #: short identifier stored on every lead this source produces
    name: str = "unknown"

    #: human-readable statement of why this source is permitted to be automated
    basis: str = ""

    @abstractmethod
    def fetch(self, **kwargs) -> Iterator[Lead]:
        """Yield leads. Implementations should be lazy where the upstream paginates."""
        raise NotImplementedError


BLOCKED_HOSTS = (
    "airbnb.com", "airbnb.co.uk", "vrbo.com", "booking.com", "homeaway.com",
)


class BlockedSourceError(RuntimeError):
    pass


def assert_source_allowed(url: str) -> None:
    """Refuse to fetch from platforms whose terms prohibit automated collection.

    Called by every source implementation before making a request, so a
    mis-configured endpoint can't quietly point the pipeline at Airbnb.
    """
    lowered = url.lower()
    for host in BLOCKED_HOSTS:
        if host in lowered:
            raise BlockedSourceError(
                f"refusing to fetch {url!r}: {host} prohibits automated data "
                "collection in its Terms of Service (COMPLIANCE.md §2). Use a "
                "public registry, a licensed API, or manual CSV import instead."
            )

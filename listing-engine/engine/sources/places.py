"""Google Places (New) — property managers and vacation-rental managers by metro.

This is the highest-value segment (see PLAN.md §2): one sale covers many
properties and they renew. Places is a licensed API; usage is governed by Google
Maps Platform terms, which permit this kind of business lookup.

Note on caching: Google's terms restrict how long Places content may be stored.
Treat contact details as refresh-on-use rather than a permanent database, and
re-query before a campaign rather than mailing a year-old pull.

Docs: https://developers.google.com/maps/documentation/places/web-service/text-search
"""

from __future__ import annotations

from collections.abc import Iterator

import requests

from ..models import Lead, Segment
from .base import LeadSource, assert_source_allowed

SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
TIMEOUT = 30

FIELD_MASK = ",".join((
    "places.displayName",
    "places.formattedAddress",
    "places.nationalPhoneNumber",
    "places.websiteUri",
    "places.id",
    "nextPageToken",
))

DEFAULT_QUERIES = (
    "vacation rental management company",
    "short term rental property management",
    "property management company",
    "Airbnb management service",
)


class PlacesSource(LeadSource):
    name = "google_places"
    basis = "Licensed API (Google Maps Platform), used within its terms."

    def __init__(self, api_key: str):
        if not api_key:
            raise ValueError(
                "Google Places key missing. Set LISTING_ENGINE_GOOGLE_PLACES_KEY."
            )
        self.api_key = api_key

    def fetch(self, metro: str, state: str, queries: tuple[str, ...] = DEFAULT_QUERIES,
              max_per_query: int = 60) -> Iterator[Lead]:
        assert_source_allowed(SEARCH_URL)
        for q in queries:
            yield from self._search(f"{q} in {metro}, {state}", state, max_per_query)

    def _search(self, text_query: str, state: str, cap: int) -> Iterator[Lead]:
        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": self.api_key,
            "X-Goog-FieldMask": FIELD_MASK,
        }
        page_token: str | None = None
        got = 0
        while got < cap:
            body: dict[str, object] = {"textQuery": text_query, "pageSize": 20}
            if page_token:
                body["pageToken"] = page_token
            resp = requests.post(SEARCH_URL, json=body, headers=headers, timeout=TIMEOUT)
            resp.raise_for_status()
            data = resp.json()
            places = data.get("places", [])
            if not places:
                return
            for p in places:
                name = (p.get("displayName") or {}).get("text")
                if not name:
                    continue
                got += 1
                yield Lead(
                    business_name=name,
                    source=self.name,
                    source_url=f"https://places.googleapis.com/v1/places/{p.get('id','')}",
                    phone=p.get("nationalPhoneNumber"),
                    website=p.get("websiteUri"),
                    city=_city_from_address(p.get("formattedAddress", "")),
                    state=state.upper()[:2],
                    # These queries specifically target management companies, so
                    # the segment is known rather than inferred.
                    segment=Segment.PROPERTY_MANAGER,
                    notes="Places lookup; email not provided by API — resolve from website.",
                )
            page_token = data.get("nextPageToken")
            if not page_token:
                return


def _city_from_address(addr: str) -> str | None:
    # "123 Main St, Nashville, TN 37201, USA" -> "Nashville"
    parts = [p.strip() for p in addr.split(",")]
    return parts[1] if len(parts) >= 3 else None

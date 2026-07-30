"""US city short-term-rental permit registries, via Socrata open data.

Many US cities publish their STR licence roster as an open dataset. These are
public government records, served by an API built for programmatic access — so
unlike scraping a booking platform, pulling them is exactly the intended use.

Dataset IDs differ per city and do change. Rather than shipping a hardcoded list
that silently rots, ``discover()`` queries the Socrata catalog so you can find
the current dataset for a city, and you then pin it in ``config.toml``.

Docs: https://dev.socrata.com/docs/endpoints.html
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import requests

from ..models import Lead, Segment
from .base import LeadSource, assert_source_allowed

CATALOG_URL = "https://api.us.socrata.com/api/catalog/v1"
TIMEOUT = 30

# Column names vary a lot between cities. These are the candidates we try, in
# order, when mapping a row onto a Lead.
NAME_FIELDS = ("business_name", "businessname", "operator_name", "owner_name",
               "applicant_name", "licensee", "dba", "name", "owner")
EMAIL_FIELDS = ("email", "email_address", "contact_email", "applicant_email")
PHONE_FIELDS = ("phone", "phone_number", "telephone", "contact_phone")
CITY_FIELDS = ("city", "property_city", "mailing_city")
STATE_FIELDS = ("state", "property_state", "mailing_state")


def _first(row: dict[str, Any], keys: tuple[str, ...]) -> str | None:
    for k in keys:
        v = row.get(k)
        if v and str(v).strip():
            return str(v).strip()
    return None


def discover(query: str = "short term rental", limit: int = 20) -> list[dict[str, str]]:
    """Search the Socrata catalog for candidate STR datasets.

    Returns dicts with ``domain``, ``id``, ``name`` — feed the ones you want into
    ``config.toml`` under ``[[sources.registry]]``.
    """
    r = requests.get(
        CATALOG_URL,
        params={"q": query, "only": "dataset", "limit": limit},
        timeout=TIMEOUT,
    )
    r.raise_for_status()
    out = []
    for item in r.json().get("results", []):
        res = item.get("resource", {})
        out.append({
            "domain": item.get("metadata", {}).get("domain", ""),
            "id": res.get("id", ""),
            "name": res.get("name", ""),
            "url": item.get("permalink", ""),
        })
    return out


class RegistrySource(LeadSource):
    name = "str_registry"
    basis = ("Public government record published as open data via an API intended "
             "for programmatic access.")

    def __init__(self, domain: str, dataset_id: str, state: str,
                 city_label: str | None = None):
        self.domain = domain.replace("https://", "").replace("http://", "").strip("/")
        self.dataset_id = dataset_id
        self.state = state.upper()
        self.city_label = city_label

    @property
    def endpoint(self) -> str:
        return f"https://{self.domain}/resource/{self.dataset_id}.json"

    def fetch(self, limit: int = 1000, page_size: int = 1000,
              where: str | None = None) -> Iterator[Lead]:
        assert_source_allowed(self.endpoint)
        fetched = 0
        offset = 0
        while fetched < limit:
            params: dict[str, Any] = {
                "$limit": min(page_size, limit - fetched),
                "$offset": offset,
            }
            if where:
                params["$where"] = where
            resp = requests.get(self.endpoint, params=params, timeout=TIMEOUT)
            resp.raise_for_status()
            rows = resp.json()
            if not rows:
                return
            for row in rows:
                lead = self._to_lead(row)
                if lead is not None:
                    yield lead
            fetched += len(rows)
            offset += len(rows)
            if len(rows) < params["$limit"]:
                return

    def _to_lead(self, row: dict[str, Any]) -> Lead | None:
        business = _first(row, NAME_FIELDS)
        if not business:
            return None
        return Lead(
            business_name=business,
            source=f"{self.name}:{self.domain}/{self.dataset_id}",
            source_url=self.endpoint,
            email=_first(row, EMAIL_FIELDS),
            phone=_first(row, PHONE_FIELDS),
            city=_first(row, CITY_FIELDS) or self.city_label,
            state=(_first(row, STATE_FIELDS) or self.state).upper()[:2],
            # A registry row is one permit. Whether the operator manages many is
            # something enrichment decides; don't guess a segment here.
            segment=Segment.UNKNOWN,
        )

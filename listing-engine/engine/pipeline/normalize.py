"""Normalisation, deduplication and segment inference.

Runs between a source and the database. Cheap, deterministic, no network.
"""

from __future__ import annotations

import hashlib
import re

from ..models import Lead, LeadStage, Segment

US_STATES = {
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL",
    "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT",
    "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI",
    "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
}

# Suffixes stripped before building a dedupe key, so "Acme Rentals LLC" and
# "Acme Rentals, Inc." collapse to one lead.
SUFFIXES = (
    "llc", "l l c", "inc", "incorporated", "corp", "corporation", "co",
    "company", "ltd", "limited", "lp", "llp", "pllc", "trust", "properties",
    "property", "management", "mgmt", "group", "holdings", "realty", "rentals",
)

PM_HINTS = ("management", "mgmt", "property", "properties", "hospitality",
            "co-host", "cohost", "stays", "rentals", "lodging", "vacation")
AGENT_HINTS = ("realty", "real estate", "realtor", "brokerage", "broker",
               "homes", "sotheby", "compass", "keller", "re/max", "remax")

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s.]+\.[^@\s]+$")

# Addresses that are never a prospect: role accounts nobody reads, and known
# no-reply patterns.
ROLE_PREFIXES = ("noreply", "no-reply", "donotreply", "do-not-reply", "postmaster",
                 "abuse", "spam", "unsubscribe", "mailer-daemon")


def clean_email(raw: str | None) -> str | None:
    if not raw:
        return None
    e = raw.strip().lower()
    # Registry exports often cram several addresses into one cell.
    for sep in (";", ",", " "):
        if sep in e:
            e = e.split(sep)[0].strip()
    if not EMAIL_RE.match(e):
        return None
    local = e.split("@", 1)[0]
    if any(local.startswith(p) for p in ROLE_PREFIXES):
        return None
    return e


def clean_phone(raw: str | None) -> str | None:
    if not raw:
        return None
    digits = re.sub(r"\D", "", raw)
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    if len(digits) != 10:
        return None
    return f"({digits[:3]}) {digits[3:6]}-{digits[6:]}"


def clean_website(raw: str | None) -> str | None:
    if not raw:
        return None
    w = raw.strip().lower()
    if not w:
        return None
    if not w.startswith(("http://", "https://")):
        w = "https://" + w
    return w.rstrip("/")


def normalize_name(name: str) -> str:
    n = name.lower()
    n = re.sub(r"[^a-z0-9\s]", " ", n)
    tokens = [t for t in n.split() if t]
    while tokens and tokens[-1] in SUFFIXES:
        tokens.pop()
    return " ".join(tokens) or name.lower().strip()


def infer_segment(lead: Lead) -> Segment:
    if lead.segment is not Segment.UNKNOWN:
        return lead.segment
    haystack = f"{lead.business_name} {lead.website or ''}".lower()
    if any(h in haystack for h in AGENT_HINTS):
        return Segment.AGENT
    if any(h in haystack for h in PM_HINTS):
        return Segment.PROPERTY_MANAGER
    return Segment.HOST


def dedupe_key(lead: Lead) -> str:
    """Stable identity for a lead.

    Email wins when present — it's the thing we actually contact. Otherwise fall
    back to normalised name + state, which catches the common registry case of the
    same operator appearing once per permit.
    """
    if lead.email:
        basis = f"email:{lead.email}"
    else:
        basis = f"name:{normalize_name(lead.business_name)}|{(lead.state or '').upper()}"
    return hashlib.sha1(basis.encode()).hexdigest()[:20]


def normalize(lead: Lead, target_states: list[str] | None = None) -> Lead | None:
    """Clean a lead in place and return it, or None if it should be dropped."""
    lead.business_name = re.sub(r"\s+", " ", lead.business_name).strip()
    lead.email = clean_email(lead.email)
    lead.phone = clean_phone(lead.phone)
    lead.website = clean_website(lead.website)
    if lead.city:
        lead.city = re.sub(r"\s+", " ", lead.city).strip().title()
    if lead.state:
        st = lead.state.strip().upper()[:2]
        lead.state = st if st in US_STATES else None

    # US only, per the brief.
    if lead.state is None:
        return None
    if target_states and lead.state not in target_states:
        return None

    lead.segment = infer_segment(lead)
    lead.dedupe_key = dedupe_key(lead)
    lead.stage = LeadStage.ENRICHED if lead.email else LeadStage.NEW
    return lead

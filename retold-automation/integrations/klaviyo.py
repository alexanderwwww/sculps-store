#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
klaviyo.py — RETOLD ↔ Klaviyo status emails (Component 4).

RETOLD keeps the family warmly informed at every milestone. Rather than hardcode
email copy here, we send a Klaviyo *event* at each pipeline status; a Klaviyo
Flow (built once in the Klaviyo UI, triggered by "Metric = RETOLD Status") sends
the on-brand email. This keeps copy in the marketer's hands, code in ours.

Status values we emit (keep these stable — the Klaviyo Flow filters on them):
  order_received, intake_sent, interview_scheduled, recording_received,
  book_drafted, proof_ready, proof_approved, printing, film_ready, shipped

Public functions:
  track_status(email, status, order, extra)  — the one call n8n makes each stage.
  identify(email, props)                      — upsert a profile (optional).

Auth: KLAVIYO_API_KEY (private key, 'pk_...'). Uses the current (2024+) JSON:API
with the required 'revision' header. Nothing hardcoded.

Manual smoke test (needs a real key + a real profile email):

    python -m integrations.klaviyo --track you@example.com proof_ready
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from typing import Any, Dict, Optional


KLAVIYO_REVISION = "2024-10-15"
METRIC_NAME = "RETOLD Status"

# Human-friendly labels — handy if a Flow wants a ready-made subject fragment.
STATUS_LABELS = {
    "order_received": "Order received",
    "intake_sent": "Tell us about your loved one",
    "interview_scheduled": "Interview scheduled",
    "recording_received": "We have the recording",
    "book_drafted": "The first draft is written",
    "proof_ready": "Your proof is ready to review",
    "proof_approved": "Proof approved — off to print",
    "printing": "Your book is being printed",
    "film_ready": "Your memory film is ready",
    "shipped": "On its way to you",
}


def _env(name: str, required: bool = True, default: Optional[str] = None) -> str:
    val = os.environ.get(name, default)
    if required and not val:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return val or ""


def _headers() -> Dict[str, str]:
    return {
        "Authorization": f"Klaviyo-API-Key {_env('KLAVIYO_API_KEY')}",
        "revision": KLAVIYO_REVISION,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def _request(method: str, url: str, body: Optional[bytes] = None) -> Dict[str, Any]:
    req = urllib.request.Request(url, data=body, headers=_headers(), method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")
        raise RuntimeError(f"Klaviyo {method} {url}: HTTP {e.code} — {detail}") from e


def identify(email: str, properties: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Create or update a Klaviyo profile for this customer."""
    payload = {
        "data": {
            "type": "profile",
            "attributes": {
                "email": email,
                "properties": properties or {},
            },
        }
    }
    url = "https://a.klaviyo.com/api/profiles/"
    try:
        return _request("POST", url, json.dumps(payload).encode())
    except RuntimeError as e:
        # A 409 means the profile already exists — that's fine for our purposes.
        if "409" in str(e):
            return {"status": "exists", "email": email}
        raise


def track_status(email: str, status: str, order: Optional[Dict[str, Any]] = None,
                 extra: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Emit a 'RETOLD Status' event that a Klaviyo Flow turns into an email.

    Parameters
    ----------
    email  : the customer's email (from the Shopify order).
    status : one of STATUS_LABELS keys above.
    order  : the RETOLD order/book dict; we attach a few useful fields so the
             email can personalise (subject name, order number, links).
    extra  : any per-status extras (e.g. proof_url, film_url, tracking_url).
    """
    order = order or {}
    subject = order.get("subject", {}) or {}
    props: Dict[str, Any] = {
        "status": status,
        "status_label": STATUS_LABELS.get(status, status),
        "order_id": order.get("order_id"),
        "order_number": order.get("order_number"),
        "sku": order.get("sku"),
        "subject_name": subject.get("name"),
        "subject_relation": subject.get("relation"),
    }
    if extra:
        props.update(extra)
    # Drop empties to keep the event tidy.
    props = {k: v for k, v in props.items() if v is not None}

    payload = {
        "data": {
            "type": "event",
            "attributes": {
                "properties": props,
                "time": time.strftime("%Y-%m-%dT%H:%M:%S%z") or None,
                "metric": {"data": {"type": "metric",
                                    "attributes": {"name": METRIC_NAME}}},
                "profile": {"data": {"type": "profile",
                                     "attributes": {"email": email}}},
                "unique_id": f"{order.get('order_id', 'na')}-{status}",
            }
        }
    }
    url = "https://a.klaviyo.com/api/events/"
    return _request("POST", url, json.dumps(payload).encode())


if __name__ == "__main__":
    if "--track" in sys.argv and len(sys.argv) >= 4:
        i = sys.argv.index("--track")
        email, status = sys.argv[i + 1], sys.argv[i + 2]
        print(track_status(email, status, {"order_id": "1001",
                                           "order_number": "#1001",
                                           "subject": {"name": "Rosa"}}))
    else:
        print(__doc__)

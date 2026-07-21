#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
shopify.py — RETOLD ↔ Shopify integration (Component 4).

Two jobs, both used by the n8n pipeline:

  1. verify_webhook_hmac(...)   — prove an incoming "orders/paid" webhook really
     came from Shopify (so nobody can fake a paid order and trigger a real,
     money-spending production run).

  2. mark_fulfilled(...)        — after the book (and film) ship, flip the
     Shopify order to "fulfilled" and attach the tracking number so the
     customer gets Shopify's shipping-confirmation email automatically.

Everything reads secrets from environment variables (see the repo-root .env).
NOTHING is hardcoded. Written to be readable by a non-technical owner.

Manual test (from repo root, with a .env present):

    python -m integrations.shopify --selftest
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import sys
import urllib.error
import urllib.request
from typing import Any, Dict, Optional


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------
def _env(name: str, required: bool = True, default: Optional[str] = None) -> str:
    """Read an environment variable. Fail loudly if a required one is missing —
    better a clear error now than a silent, half-finished order later."""
    val = os.environ.get(name, default)
    if required and not val:
        raise RuntimeError(
            f"Missing required environment variable: {name}. "
            f"Add it to the repo-root .env file."
        )
    return val or ""


def _api_base() -> str:
    """The base URL for the Shopify Admin REST API for this store.
    SHOPIFY_STORE is the myshopify domain, e.g. 'retold-family.myshopify.com'."""
    store = _env("SHOPIFY_STORE")
    # Allow the owner to paste either the bare domain or a full https URL.
    store = store.replace("https://", "").replace("http://", "").strip("/")
    version = os.environ.get("SHOPIFY_API_VERSION", "2024-07")
    return f"https://{store}/admin/api/{version}"


def _admin_headers() -> Dict[str, str]:
    return {
        "X-Shopify-Access-Token": _env("SHOPIFY_ADMIN_TOKEN"),
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def _request(method: str, url: str, headers: Dict[str, str],
             body: Optional[bytes] = None) -> Dict[str, Any]:
    """Tiny JSON HTTP helper built on the standard library (no extra installs)."""
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")
        raise RuntimeError(
            f"Shopify API {method} {url} failed: HTTP {e.code} — {detail}"
        ) from e


# ---------------------------------------------------------------------------
# 1) Webhook authenticity — HMAC verification
# ---------------------------------------------------------------------------
def verify_webhook_hmac(raw_body: bytes, hmac_header: str,
                        secret: Optional[str] = None) -> bool:
    """Return True only if `raw_body` was signed by Shopify with our shared secret.

    Shopify signs the EXACT raw request body (bytes, before any JSON parsing)
    with HMAC-SHA256 using SHOPIFY_WEBHOOK_SECRET, then base64-encodes it and
    sends it in the 'X-Shopify-Hmac-Sha256' header. We recompute and compare in
    constant time.

    IMPORTANT for n8n: pass the *unparsed* body. In the Webhook node enable
    "Raw Body" (binary/raw) so the bytes are byte-for-byte what Shopify sent —
    re-serialising parsed JSON will change whitespace and break the signature.
    """
    if isinstance(raw_body, str):
        raw_body = raw_body.encode("utf-8")
    secret = (secret or _env("SHOPIFY_WEBHOOK_SECRET")).encode("utf-8")

    digest = hmac.new(secret, raw_body, hashlib.sha256).digest()
    computed = base64.b64encode(digest).decode("utf-8")

    # Constant-time comparison defeats timing attacks.
    return hmac.compare_digest(computed, (hmac_header or "").strip())


# ---------------------------------------------------------------------------
# Order-shape helper — turn a raw Shopify order into RETOLD's order object
# ---------------------------------------------------------------------------
def order_to_retold(shopify_order: Dict[str, Any]) -> Dict[str, Any]:
    """Map a Shopify 'orders/paid' payload into the minimal RETOLD order object
    that engine/produce.py expects. Line-item SKUs decide book vs book_film.

    We keep this intentionally forgiving: the human proof gate later catches
    anything the customer left blank in the Tally intake form.
    """
    line_items = shopify_order.get("line_items", []) or []
    skus = {(li.get("sku") or "").lower() for li in line_items}
    is_film = any("film" in s for s in skus)

    # Note attributes / properties carry the intake answers if Tally wrote them
    # back onto the order; otherwise the n8n intake step fills them in.
    props: Dict[str, str] = {}
    for li in line_items:
        for p in li.get("properties", []) or []:
            if p.get("name"):
                props[p["name"]] = p.get("value")
    for na in shopify_order.get("note_attributes", []) or []:
        if na.get("name"):
            props[na["name"]] = na.get("value")

    def _first(*keys, default=None):
        for k in keys:
            if props.get(k):
                return props[k]
        return default

    birth_year = _first("birth_year", "Birth year")
    try:
        birth_year = int(birth_year) if birth_year else None
    except (TypeError, ValueError):
        birth_year = None

    grandchildren = _first("grandchildren", "Grandchildren")
    if isinstance(grandchildren, str):
        grandchildren = [g.strip() for g in grandchildren.split(",") if g.strip()]

    return {
        "order_id": str(shopify_order.get("id") or shopify_order.get("order_id")),
        "order_number": shopify_order.get("name"),  # e.g. "#1001"
        "sku": "book_film" if is_film else "book",
        "customer_email": (shopify_order.get("email")
                           or (shopify_order.get("customer") or {}).get("email")),
        "subject": {
            "name": _first("subject_name", "Name", "Parent name", default=""),
            "relation": _first("relation", "Relation", default=""),
            "birth_year": birth_year,
        },
        "grandchildren": grandchildren or [],
        "notes": _first("notes", "Notes", default=""),
        "shipping_address": shopify_order.get("shipping_address", {}),
    }


# ---------------------------------------------------------------------------
# 2) Fulfillment — mark the order shipped + attach tracking
# ---------------------------------------------------------------------------
def _get_fulfillment_order_ids(order_id: str) -> list[str]:
    """Modern Shopify fulfillment uses 'fulfillment orders'. Fetch the open ones
    for this order so we can fulfil them in a single call."""
    url = f"{_api_base()}/orders/{order_id}/fulfillment_orders.json"
    data = _request("GET", url, _admin_headers())
    fos = data.get("fulfillment_orders", [])
    return [str(fo["id"]) for fo in fos
            if fo.get("status") in ("open", "in_progress", "scheduled")]


def mark_fulfilled(order_id: str,
                   tracking_number: Optional[str] = None,
                   tracking_url: Optional[str] = None,
                   tracking_company: str = "Lulu / Peecho",
                   notify_customer: bool = True) -> Dict[str, Any]:
    """Create a fulfillment for the whole order and (optionally) attach tracking.

    Returns the created fulfillment object. `notify_customer=True` lets Shopify
    send its standard shipping-confirmation email — the final happy touch.
    """
    fo_ids = _get_fulfillment_order_ids(order_id)
    if not fo_ids:
        raise RuntimeError(
            f"No open fulfillment orders for Shopify order {order_id}. "
            f"It may already be fulfilled."
        )

    payload: Dict[str, Any] = {
        "fulfillment": {
            "notify_customer": bool(notify_customer),
            "line_items_by_fulfillment_order": [
                {"fulfillment_order_id": fo_id} for fo_id in fo_ids
            ],
        }
    }
    if tracking_number:
        payload["fulfillment"]["tracking_info"] = {
            "number": tracking_number,
            "url": tracking_url,
            "company": tracking_company,
        }

    url = f"{_api_base()}/fulfillments.json"
    body = json.dumps(payload).encode("utf-8")
    return _request("POST", url, _admin_headers(), body)


def add_order_note(order_id: str, note: str) -> Dict[str, Any]:
    """Append an internal note to the Shopify order (handy audit trail for the
    owner: 'book.json produced', 'proof approved', 'Lulu job 123 created')."""
    url = f"{_api_base()}/orders/{order_id}.json"
    body = json.dumps({"order": {"id": order_id, "note": note}}).encode("utf-8")
    return _request("PUT", url, _admin_headers(), body)


# ---------------------------------------------------------------------------
# CLI self-test (no network) — proves the HMAC logic round-trips.
# ---------------------------------------------------------------------------
def _selftest() -> int:
    secret = "test-secret"
    body = b'{"id":1001,"email":"nonna@example.com"}'
    digest = hmac.new(secret.encode(), body, hashlib.sha256).digest()
    header = base64.b64encode(digest).decode()

    assert verify_webhook_hmac(body, header, secret) is True, "valid sig rejected"
    assert verify_webhook_hmac(body, "deadbeef", secret) is False, "bad sig accepted"
    assert verify_webhook_hmac(body + b"x", header, secret) is False, "tamper accepted"

    sample = {
        "id": 1001, "name": "#1001", "email": "mia@example.com",
        "line_items": [{"sku": "RETOLD-BOOK-FILM",
                        "properties": [{"name": "subject_name", "value": "Rosa"},
                                       {"name": "relation", "value": "grandmother"},
                                       {"name": "birth_year", "value": "1941"},
                                       {"name": "grandchildren",
                                        "value": "Mia, Luca, Sofia"}]}],
    }
    retold = order_to_retold(sample)
    assert retold["sku"] == "book_film"
    assert retold["subject"]["name"] == "Rosa"
    assert retold["subject"]["birth_year"] == 1941
    assert retold["grandchildren"] == ["Mia", "Luca", "Sofia"]
    print("shopify.py self-test passed ✓")
    return 0


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        raise SystemExit(_selftest())
    print(__doc__)

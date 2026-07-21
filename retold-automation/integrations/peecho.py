#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
peecho.py — RETOLD ↔ Peecho integration (Component 4).

Peecho prints the SMALL items: the personalised grandchild "voice cards" — the
little cards each grandchild gets with their own QR that opens the memory page
already greeting them by name (…/f/<token>?from=Mia).

The main book is printed by Lulu (see lulu.py); Peecho is perfect for short-run
postcard / greeting-card style prints and drop-ships them too.

This module:
  1. create_card_order(...) — one Peecho order containing every grandchild card
     PDF (public R2 URLs) for a book, shipped to the customer.
  2. get_order(id)          — poll status / tracking.

Peecho authenticates each request with an API key in the 'X-Api-Key' header
(env PEECHO_API_KEY). Sandbox vs production is chosen by PEECHO_ENV.

Nothing hardcoded. Manual smoke test (needs a real key):

    python -m integrations.peecho --ping
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional


# Peecho "offering" ids encode product + size + finish. A square greeting card
# is a good fit for a grandchild voice card. Override via PEECHO_OFFERING_ID.
DEFAULT_OFFERING_ID = os.environ.get("PEECHO_OFFERING_ID", "greeting-card-square")


def _env(name: str, required: bool = True, default: Optional[str] = None) -> str:
    val = os.environ.get(name, default)
    if required and not val:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return val or ""


def _api_base() -> str:
    env = os.environ.get("PEECHO_ENV", "live").lower()
    if env in ("test", "sandbox", "stage"):
        return "https://test.print-api.com/v2"
    return "https://www.print-api.com/v2"


def _headers() -> Dict[str, str]:
    # Peecho's Print API uses HTTP Basic with the API key as the username.
    import base64
    key = _env("PEECHO_API_KEY")
    basic = base64.b64encode(f"{key}:".encode()).decode()
    return {
        "Authorization": f"Basic {basic}",
        "X-Api-Key": key,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def _request(method: str, url: str, body: Optional[bytes] = None) -> Dict[str, Any]:
    req = urllib.request.Request(url, data=body, headers=_headers(), method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")
        raise RuntimeError(f"Peecho API {method} {url}: HTTP {e.code} — {detail}") from e


def _peecho_address(addr: Dict[str, Any]) -> Dict[str, Any]:
    """Shopify shipping_address -> Peecho recipient shape."""
    return {
        "name": addr.get("name") or (
            f"{addr.get('first_name', '')} {addr.get('last_name', '')}".strip()),
        "address": addr.get("address1", ""),
        "addressLine2": addr.get("address2", "") or "",
        "city": addr.get("city", ""),
        "state": addr.get("province", "") or "",
        "zipCode": addr.get("zip", ""),
        "country": addr.get("country_code", "") or addr.get("country", ""),
        "email": addr.get("email", "") or "",
        "telephone": addr.get("phone", "") or "",
    }


def build_card_items(grandchildren: List[Dict[str, Any]],
                     r2_public_base: Optional[str] = None,
                     offering_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Turn book.json['grandchildren'] into Peecho order items.

    Each grandchild has 'card_file' like 'assets/card-mia.pdf'. We resolve that
    to a public R2 URL Peecho can download. Skips any without a card file.
    """
    base = (r2_public_base or _env("R2_PUBLIC_BASE")).rstrip("/")
    offering = offering_id or DEFAULT_OFFERING_ID
    items: List[Dict[str, Any]] = []
    for gc in grandchildren:
        card = gc.get("card_file")
        if not card:
            continue
        items.append({
            "offeringId": offering,
            "quantity": 1,
            "title": f"RETOLD voice card — {gc.get('name', 'grandchild')}",
            "files": {
                # A single-page card: same PDF is the whole print file.
                "content": f"{base}/{card.lstrip('/')}",
            },
            "metadata": {"grandchild": gc.get("name")},
        })
    return items


def create_card_order(order: Dict[str, Any],
                      r2_public_base: Optional[str] = None) -> Dict[str, Any]:
    """Create ONE Peecho order holding every grandchild card for this book.

    Reads:
      order['order_id']            -> merchantOrderId (idempotency key)
      order['grandchildren']       -> list w/ 'name' + 'card_file'
      order['shipping_address']    -> ship-to (Shopify shape)
    Returns Peecho's created-order object (id + status).
    """
    grandchildren = order.get("grandchildren", []) or []
    items = build_card_items(grandchildren, r2_public_base)
    if not items:
        # No cards to print (e.g. book had zero named grandchildren) — the
        # caller / n8n treats an empty result as "skip, nothing to do".
        return {"skipped": True, "reason": "no grandchild cards to print"}

    payload = {
        "merchantOrderId": f"retold-{order['order_id']}-cards",
        "email": order.get("customer_email", ""),
        "items": items,
        "recipient": _peecho_address(order.get("shipping_address", {})),
        "environment": os.environ.get("PEECHO_ENV", "live"),
    }
    url = f"{_api_base()}/orders"
    body = json.dumps(payload).encode()
    return _request("POST", url, body)


def get_order(order_id: str) -> Dict[str, Any]:
    url = f"{_api_base()}/orders/{order_id}"
    return _request("GET", url)


def extract_tracking(order: Dict[str, Any]) -> Dict[str, Optional[str]]:
    """Best-effort tracking extraction from a Peecho order object."""
    status = order.get("status")
    shipment = (order.get("shipments") or [{}])[0] if order.get("shipments") else {}
    return {
        "status": status,
        "tracking_number": shipment.get("trackingCode") or order.get("trackingCode"),
        "tracking_url": shipment.get("trackingUrl") or order.get("trackingUrl"),
        "carrier": shipment.get("carrier"),
    }


if __name__ == "__main__":
    if "--ping" in sys.argv:
        # Cheapest read that proves auth works.
        try:
            print(_request("GET", f"{_api_base()}/account"))
        except Exception as e:  # noqa: BLE001
            print(f"Peecho ping failed: {e}")
    else:
        print(__doc__)

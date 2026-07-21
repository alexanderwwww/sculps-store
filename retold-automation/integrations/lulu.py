#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
lulu.py — RETOLD ↔ Lulu Print API integration (Component 4).

Lulu prints and drop-ships the physical memory book. This module:

  1. get_access_token()   — OAuth2 client-credentials login (sandbox or prod).
  2. calculate_cost(...)  — (optional) preview the print + shipping cost.
  3. create_print_job(...) — submit the actual print job pointing at our
     interior.pdf + cover.pdf (public R2 URLs), with the right trim/spine.
  4. get_print_job(id)    — poll status until SHIPPED + grab tracking.

Lulu needs a "pod_package_id" that encodes trim size, binding, paper and colour.
RETOLD prints an 8.5"×8.5" premium square photo book. Set the exact package id
in the env var LULU_POD_PACKAGE_ID (Lulu gives you this string in their catalog);
we ship a sensible default constant you can override.

The cover PDF must be a single full-wrap (back+spine+front) sized to the page
count — our engine already computes print.spine_width_in into cover.pdf, and the
book.json 'print' block carries page_count so Lulu's math and ours agree.

Secrets come from env (LULU_CLIENT_KEY / LULU_CLIENT_SECRET / LULU_SANDBOX).
Nothing hardcoded.

Manual smoke test (needs real sandbox keys in .env):

    python -m integrations.lulu --token
"""

from __future__ import annotations

import base64
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, Optional


# Default POD package for an 8.5x8.5 premium colour photo book, perfect bound.
# Override in .env with LULU_POD_PACKAGE_ID if your Lulu catalog differs.
DEFAULT_POD_PACKAGE_ID = "0850X0850FCPRECW080CW444GXX"


def _env(name: str, required: bool = True, default: Optional[str] = None) -> str:
    val = os.environ.get(name, default)
    if required and not val:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return val or ""


def _is_sandbox() -> bool:
    return _env("LULU_SANDBOX", required=False, default="true").lower() in (
        "1", "true", "yes")


def _api_base() -> str:
    return ("https://api.sandbox.lulu.com" if _is_sandbox()
            else "https://api.lulu.com")


def _request(method: str, url: str, headers: Dict[str, str],
             body: Optional[bytes] = None) -> Dict[str, Any]:
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")
        raise RuntimeError(f"Lulu API {method} {url}: HTTP {e.code} — {detail}") from e


# ---------------------------------------------------------------------------
# 1) OAuth2 — client credentials
# ---------------------------------------------------------------------------
def get_access_token() -> str:
    """Log in with the client key/secret and return a bearer token.

    Lulu expects HTTP Basic auth (base64 'key:secret') on the token endpoint
    with grant_type=client_credentials.
    """
    key = _env("LULU_CLIENT_KEY")
    secret = _env("LULU_CLIENT_SECRET")
    basic = base64.b64encode(f"{key}:{secret}".encode()).decode()

    url = f"{_api_base()}/auth/realms/glasstree/protocol/openid-connect/token"
    body = urllib.parse.urlencode({"grant_type": "client_credentials"}).encode()
    headers = {
        "Authorization": f"Basic {basic}",
        "Content-Type": "application/x-www-form-urlencoded",
    }
    data = _request("POST", url, headers, body)
    token = data.get("access_token")
    if not token:
        raise RuntimeError(f"Lulu token response missing access_token: {data}")
    return token


def _auth_headers(token: Optional[str] = None) -> Dict[str, str]:
    token = token or get_access_token()
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


# ---------------------------------------------------------------------------
# 2) Cost preview (optional but nice before spending real money in prod)
# ---------------------------------------------------------------------------
def calculate_cost(page_count: int, shipping_address: Dict[str, Any],
                   pod_package_id: Optional[str] = None,
                   quantity: int = 1, token: Optional[str] = None) -> Dict[str, Any]:
    """Return Lulu's cost breakdown (line + shipping + total) for one book."""
    pod = pod_package_id or _env("LULU_POD_PACKAGE_ID", required=False,
                                 default=DEFAULT_POD_PACKAGE_ID)
    payload = {
        "line_items": [{
            "page_count": int(page_count),
            "pod_package_id": pod,
            "quantity": int(quantity),
        }],
        "shipping_address": _lulu_address(shipping_address),
        "shipping_option": os.environ.get("LULU_SHIPPING_LEVEL", "MAIL"),
    }
    url = f"{_api_base()}/print-job-cost-calculations/"
    body = json.dumps(payload).encode()
    return _request("POST", url, _auth_headers(token), body)


# ---------------------------------------------------------------------------
# 3) Create the print job
# ---------------------------------------------------------------------------
def _lulu_address(addr: Dict[str, Any]) -> Dict[str, Any]:
    """Translate a Shopify shipping_address into Lulu's expected shape."""
    return {
        "name": addr.get("name") or (
            f"{addr.get('first_name', '')} {addr.get('last_name', '')}".strip()),
        "street1": addr.get("address1", ""),
        "street2": addr.get("address2", "") or "",
        "city": addr.get("city", ""),
        "state_code": addr.get("province_code", "") or addr.get("province", ""),
        "postcode": addr.get("zip", ""),
        "country_code": addr.get("country_code", "") or addr.get("country", ""),
        "phone_number": addr.get("phone", "") or "0000000000",
    }


def create_print_job(order: Dict[str, Any],
                     interior_pdf_url: str,
                     cover_pdf_url: str,
                     token: Optional[str] = None) -> Dict[str, Any]:
    """Submit a real print + drop-ship job to Lulu.

    Parameters
    ----------
    order : dict
        The RETOLD order/book context. We read:
          order['order_id']                      -> external_id (idempotency)
          order['order_number'] or order_id      -> title on the job
          order['print']['page_count']           -> page count (interior)
          order['shipping_address']              -> ship-to (Shopify shape)
    interior_pdf_url, cover_pdf_url : str
        PUBLIC https URLs (our R2 public base) Lulu can download. Lulu fetches
        these itself, so they must be reachable without auth.

    Returns Lulu's print-job object (contains the job id + initial status).
    """
    print_block = order.get("print", {})
    page_count = int(print_block.get("page_count") or 60)
    pod = _env("LULU_POD_PACKAGE_ID", required=False,
               default=DEFAULT_POD_PACKAGE_ID)

    title = (order.get("cover", {}) or {}).get("title") \
        or f"RETOLD {order.get('order_number') or order.get('order_id')}"

    payload = {
        # external_id makes retries idempotent — Lulu rejects a duplicate.
        "external_id": f"retold-{order['order_id']}",
        "contact_email": _env("LULU_CONTACT_EMAIL", required=False,
                              default=os.environ.get("KLAVIYO_FROM_EMAIL",
                                                     "orders@retold.family")),
        "line_items": [{
            "external_id": f"retold-{order['order_id']}-book",
            "title": title[:255],
            "page_count": page_count,
            "pod_package_id": pod,
            "quantity": 1,
            "printable_normalization": {
                "cover": {"source_url": cover_pdf_url},
                "interior": {"source_url": interior_pdf_url},
            },
        }],
        "shipping_address": _lulu_address(order.get("shipping_address", {})),
        "shipping_level": os.environ.get("LULU_SHIPPING_LEVEL", "MAIL"),
    }

    url = f"{_api_base()}/print-jobs/"
    body = json.dumps(payload).encode()
    return _request("POST", url, _auth_headers(token), body)


# ---------------------------------------------------------------------------
# 4) Poll status + tracking
# ---------------------------------------------------------------------------
def get_print_job(job_id: str, token: Optional[str] = None) -> Dict[str, Any]:
    url = f"{_api_base()}/print-jobs/{job_id}/"
    return _request("GET", url, _auth_headers(token))


def extract_tracking(job: Dict[str, Any]) -> Dict[str, Optional[str]]:
    """Pull tracking id/url/carrier out of a print-job object once shipped."""
    status = (job.get("status", {}) or {}).get("name")
    tracking_id = tracking_url = carrier = None
    for li in job.get("line_items", []) or []:
        tr = li.get("tracking_id") or li.get("tracking_number")
        if tr:
            tracking_id = tr
            tracking_url = (li.get("tracking_urls") or [None])[0] \
                if isinstance(li.get("tracking_urls"), list) else li.get("tracking_url")
            carrier = li.get("carrier_name")
            break
    return {"status": status, "tracking_number": tracking_id,
            "tracking_url": tracking_url, "carrier": carrier}


def wait_until_shipped(job_id: str, poll_seconds: int = 3600,
                       timeout_seconds: int = 14 * 24 * 3600) -> Dict[str, Any]:
    """Block-poll until the job SHIPS (mainly for scripts; n8n uses its own Wait
    loop instead so it doesn't tie up a worker)."""
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        job = get_print_job(job_id)
        info = extract_tracking(job)
        if info["status"] in ("SHIPPED", "REJECTED", "CANCELED"):
            return job
        time.sleep(poll_seconds)
    raise TimeoutError(f"Lulu job {job_id} did not ship within timeout.")


if __name__ == "__main__":
    if "--token" in sys.argv:
        print(get_access_token()[:24] + "…  (token OK)")
    else:
        print(__doc__)

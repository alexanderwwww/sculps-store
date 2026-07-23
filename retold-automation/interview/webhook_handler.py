# -*- coding: utf-8 -*-
"""
webhook_handler.py — receive "the call just finished" from the voice provider.

In production you don't want to sit and poll for a phone call to end. Instead,
Vapi (or Bland/Retell) POSTs a small JSON "end-of-call report" to a URL you own
the moment a call wraps up. n8n's webhook node can receive it directly — but if
you'd rather run a tiny standalone listener, this is it.

It does exactly one job: take the provider's payload, pull out the order id +
recording URL, and hand that back so the next step (transcribe → engine) can run.

Run as a tiny server (optional):
    python interview/webhook_handler.py           # listens on :8787/vapi

Or import parse_end_of_call() / handle_payload() from n8n's Function node.
"""

from __future__ import annotations

import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

_HERE = Path(__file__).resolve().parent
_ENGINE = _HERE.parent / "engine"
for p in (_HERE, _ENGINE):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

from common import env, log  # noqa: E402
import vapi  # noqa: E402


def handle_payload(body: dict) -> dict | None:
    """Turn a raw provider webhook body into RETOLD's little handoff record.

    Returns None for events we don't care about (Vapi sends many message types;
    we only act on the final 'end-of-call-report')."""
    msg = body.get("message", body)
    kind = msg.get("type") or body.get("type")
    if kind and kind not in ("end-of-call-report", "status-update"):
        return None
    if kind == "status-update" and msg.get("status") != "ended":
        return None

    info = vapi.parse_end_of_call(body)
    if not info.get("recording_url"):
        log(f"Call {info.get('call_id')} ended ({info.get('ended_reason')}) with "
            f"no recording URL yet.", "WARN")
    else:
        log(f"Call {info.get('call_id')} for order {info.get('order_id')} finished — "
            f"recording ready.")
    return info


class _Handler(BaseHTTPRequestHandler):
    def do_POST(self):  # noqa: N802
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw or b"{}")
        except json.JSONDecodeError:
            self.send_response(400); self.end_headers(); return

        # Optional shared-secret check (set VAPI_WEBHOOK_SECRET on both sides).
        secret = env("VAPI_WEBHOOK_SECRET")
        if secret and self.headers.get("x-vapi-secret") != secret:
            self.send_response(401); self.end_headers(); return

        result = handle_payload(body)
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(result or {"ignored": True}).encode("utf-8"))

    def log_message(self, *a):  # keep the console clean
        pass


def serve(port: int = 8787) -> None:
    log(f"RETOLD interview webhook listening on http://0.0.0.0:{port}/vapi")
    HTTPServer(("0.0.0.0", port), _Handler).serve_forever()


if __name__ == "__main__":
    serve(int(env("INTERVIEW_WEBHOOK_PORT", "8787")))

# -*- coding: utf-8 -*-
"""
vapi.py — a thin, well-commented client for the AI voice-agent provider.

RETOLD makes real outbound phone calls to the parent using a hosted voice-agent
platform. The default here is **Vapi** (vapi.ai) because it does the three hard
things for us in one call: it dials a real phone number over a carrier, runs the
live conversation with a chosen Text-to-Speech voice + speech recognition, and
hands back a **recording** of the call plus a transcript when it's done.

You could swap this for Bland.ai or Retell with the same shape — everything else
in RETOLD only ever calls the four functions at the bottom, so the rest of the
system doesn't care which provider you use.

NOTHING here clones or fakes the parent's voice. The agent has its OWN neutral
voice for asking questions; the parent's real answers are simply recorded.

--mock: every function returns a believable fake so the whole pipeline runs with
no account and no phone call at all.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

_HERE = Path(__file__).resolve().parent
_ENGINE = _HERE.parent / "engine"
if str(_ENGINE) not in sys.path:
    sys.path.insert(0, str(_ENGINE))

from common import env, log  # noqa: E402

VAPI_BASE = "https://api.vapi.ai"


def _headers() -> dict:
    key = env("VAPI_API_KEY")
    return {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}


# ---------------------------------------------------------------------------
# 1. Build the assistant for one call (persona + voice + recording ON).
# ---------------------------------------------------------------------------
def build_assistant(system_prompt: str, first_line: str, order: dict) -> dict:
    """The JSON that defines HOW the agent behaves on a single call.

    - model: Claude drives the conversation (warm, patient, follows the plan).
    - voice: a gentle, clear TTS voice — override with VAPI_VOICE_ID.
    - transcriber: turns the parent's speech into text live.
    - recordingEnabled: keeps the audio we later turn into the book's voice.
    - endCallPhrases / silenceTimeout: tuned kindly for an elderly speaker who
      pauses a lot — we do NOT hang up on a long, thoughtful silence.
    """
    subject = order.get("subject", {}) or {}
    return {
        "name": f"RETOLD interview — {subject.get('name', 'guest')}",
        "firstMessage": first_line,
        "model": {
            "provider": "anthropic",
            "model": env("ANTHROPIC_MODEL", "claude-opus-4-20250514"),
            "messages": [{"role": "system", "content": system_prompt}],
            "temperature": 0.7,
        },
        "voice": {
            "provider": env("VAPI_VOICE_PROVIDER", "11labs"),
            "voiceId": env("VAPI_VOICE_ID", "sarah"),
            "speed": 0.92,  # a touch slower, easier to follow
        },
        "transcriber": {"provider": "deepgram", "model": "nova-2", "language": "en"},
        "recordingEnabled": True,
        "silenceTimeoutSeconds": 30,   # let them think — don't cut a pause short
        "maxDurationSeconds": 1800,    # a call caps at ~30 gentle minutes
        "endCallPhrases": ["goodbye", "that's all for now", "I need to go"],
        "metadata": {"order_id": str(order.get("order_id", "")), "product": "retold"},
    }


# ---------------------------------------------------------------------------
# 2. Place the outbound call.
# ---------------------------------------------------------------------------
def place_call(order: dict, assistant: dict, session_number: int, mock: bool = False) -> dict:
    """Dial the parent. Returns {'call_id': ..., 'status': 'queued'|...}."""
    phone = (order.get("subject", {}) or {}).get("phone")
    if mock or not env("VAPI_API_KEY"):
        fake_id = f"mock-call-{order.get('order_id','x')}-{session_number}"
        log(f"Vapi (MOCK): would call {phone or 'the parent'} — session "
            f"{session_number}. call_id={fake_id}")
        return {"call_id": fake_id, "status": "mock", "mock": True}

    import requests  # lazy so --mock needs no dependency

    payload = {
        "phoneNumberId": env("VAPI_PHONE_NUMBER_ID"),
        "customer": {"number": phone, "name": (order.get("subject", {}) or {}).get("name")},
        "assistant": assistant,
    }
    r = requests.post(f"{VAPI_BASE}/call", headers=_headers(), json=payload, timeout=30)
    r.raise_for_status()
    data = r.json()
    log(f"Vapi: placed call {data.get('id')} to {phone} (session {session_number}).")
    return {"call_id": data.get("id"), "status": data.get("status", "queued"), "raw": data}


# ---------------------------------------------------------------------------
# 3. Fetch a finished call (recording URL + transcript).
# ---------------------------------------------------------------------------
def get_call(call_id: str, mock: bool = False) -> dict:
    """Return {'status', 'recording_url', 'transcript', 'ended'} for a call."""
    if mock or call_id.startswith("mock-") or not env("VAPI_API_KEY"):
        return {
            "status": "ended",
            "ended": True,
            "recording_url": None,       # mock: orchestrator uses the sample wav
            "transcript": "",
            "mock": True,
        }

    import requests

    r = requests.get(f"{VAPI_BASE}/call/{call_id}", headers=_headers(), timeout=30)
    r.raise_for_status()
    d = r.json()
    status = d.get("status")
    return {
        "status": status,
        "ended": status == "ended",
        "recording_url": d.get("recordingUrl") or d.get("artifact", {}).get("recordingUrl"),
        "transcript": d.get("transcript") or d.get("artifact", {}).get("transcript", ""),
        "raw": d,
    }


# ---------------------------------------------------------------------------
# 4. Parse a Vapi end-of-call webhook body (used by webhook_handler.py).
# ---------------------------------------------------------------------------
def parse_end_of_call(body: dict) -> dict:
    """Vapi POSTs an 'end-of-call-report' when a call finishes. Pull out the
    bits RETOLD cares about, tolerating a couple of payload shapes."""
    msg = body.get("message", body)
    call = msg.get("call", {}) or {}
    artifact = msg.get("artifact", {}) or {}
    meta = call.get("metadata", {}) or {}
    return {
        "call_id": call.get("id") or msg.get("callId"),
        "order_id": meta.get("order_id"),
        "recording_url": (
            msg.get("recordingUrl")
            or artifact.get("recordingUrl")
            or msg.get("stereoRecordingUrl")
        ),
        "transcript": msg.get("transcript") or artifact.get("transcript", ""),
        "ended_reason": msg.get("endedReason"),
    }


if __name__ == "__main__":  # tiny manual check: python interview/vapi.py
    demo = {"order_id": "1001", "subject": {"name": "Rosa", "relation": "grandmother",
            "birth_year": 1941, "phone": "+10000000000"}}
    a = build_assistant("SYSTEM…", "Hello Rosa…", demo)
    print(json.dumps(a, indent=2)[:600])
    print(place_call(demo, a, 1, mock=True))

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
shotstack.py — RETOLD ↔ Shotstack film renderer (Component 4).

For the 'book_film' SKU we produce a short memory film: the parent's REAL voice
clips (never cloned) play over gentle Ken-Burns pans across the same painterly
illustrations from the book, with on-screen captions of their own words.

This module builds a Shotstack "edit" JSON from book.json + the rendered assets
and submits it to the Shotstack render API, then polls until the MP4 is done.

HONESTY: audio tracks here are ONLY the real trimmed voice clips
(ch['audio_clip']['clip_file']) — we never synthesise the parent's voice. A soft
licensed music bed (optional, env MUSIC_URL) sits far under the voice.

We start from film/shotstack_template.json (brand-styled) and fill in per-chapter
clips programmatically, so a non-technical owner can tweak look-and-feel in the
template without touching Python.

Secrets/env: SHOTSTACK_API_KEY, SHOTSTACK_ENV (stage|prod), R2_PUBLIC_BASE.

Manual smoke test (renders nothing, just builds + prints the edit JSON):

    python -m integrations.shotstack --build samples/sample_order.json
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional


_HERE = Path(__file__).resolve().parent
_FILM_DIR = _HERE.parent / "film"
TEMPLATE_PATH = _FILM_DIR / "shotstack_template.json"

# Brand palette (kept in sync with the shared build contract).
CREAM = "#F4EDDB"
FOREST = "#1F4934"
GOLD = "#C7A44B"


def _env(name: str, required: bool = True, default: Optional[str] = None) -> str:
    val = os.environ.get(name, default)
    if required and not val:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return val or ""


def _api_base() -> str:
    env = os.environ.get("SHOTSTACK_ENV", "stage").lower()
    stage = "v1" if env in ("prod", "production", "v1") else "stage"
    return f"https://api.shotstack.io/{stage}"


def _headers() -> Dict[str, str]:
    return {
        "x-api-key": _env("SHOTSTACK_API_KEY"),
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
        raise RuntimeError(f"Shotstack {method} {url}: HTTP {e.code} — {detail}") from e


def _public(url_or_path: str, base: str) -> str:
    """Resolve an asset reference to a public https URL Shotstack can fetch.
    Already-absolute URLs pass through; relative paths join the R2 public base."""
    if url_or_path.startswith("http://") or url_or_path.startswith("https://"):
        return url_or_path
    return f"{base.rstrip('/')}/{url_or_path.lstrip('/')}"


def _clip_seconds(audio_clip: Dict[str, Any]) -> float:
    """Length of a chapter's real-voice clip, in seconds, from its ms markers.
    Falls back to a pleasant 8s if markers are missing."""
    start = audio_clip.get("start_ms")
    end = audio_clip.get("end_ms")
    if isinstance(start, (int, float)) and isinstance(end, (int, float)) and end > start:
        return round((end - start) / 1000.0, 3)
    return 8.0


def build_edit(book: Dict[str, Any],
               r2_public_base: Optional[str] = None,
               template_path: Path = TEMPLATE_PATH) -> Dict[str, Any]:
    """Compose the full Shotstack edit JSON for one book's film.

    Timeline layout (three tracks, top wins visually):
      track 0  — captions (the parent's own words, per chapter)
      track 1  — a soft title card at the head + brand lower-thirds
      track 2  — Ken-Burns illustration images (one per chapter)
    Soundtrack   — sequential REAL voice clips (never synthesized) + optional bed.
    """
    base = r2_public_base or _env("R2_PUBLIC_BASE")
    template = json.loads(Path(template_path).read_text(encoding="utf-8"))

    subject = book.get("subject", {})
    cover = book.get("cover", {})
    chapters = book.get("chapters", [])

    image_clips: List[Dict[str, Any]] = []
    caption_clips: List[Dict[str, Any]] = []
    audio_clips: List[Dict[str, Any]] = []

    # 2.5s branded opening title card before the first chapter.
    TITLE_LEN = 2.5
    cursor = TITLE_LEN

    # Alternating Ken-Burns moves keep it feeling handmade, not mechanical.
    kb_moves = ["zoomIn", "zoomOut", "slideLeft", "slideRight"]

    for i, ch in enumerate(chapters):
        clip = ch.get("audio_clip", {}) or {}
        dur = _clip_seconds(clip)

        # ---- Illustration (Ken-Burns) ----
        img = _public(ch.get("illustration_file", ""), base)
        if img:
            image_clips.append({
                "asset": {"type": "image", "src": img},
                "start": round(cursor, 3),
                "length": dur,
                "effect": kb_moves[i % len(kb_moves)],
                "transition": {"in": "fade", "out": "fade"},
                "fit": "cover",
            })

        # ---- Real-voice audio clip (sequential, gapless) ----
        voice = _public(clip.get("clip_file", ""), base)
        if voice:
            audio_clips.append({
                "asset": {"type": "audio", "src": voice},
                "start": round(cursor, 3),
                "length": dur,
                # tiny fades avoid clicks between clips
                "effect": "fadeInFadeOut",
            })

        # ---- Caption: the parent's own memorable line ----
        line = ch.get("pull_quote") or ch.get("title", "")
        if line:
            caption_clips.append({
                "asset": {
                    "type": "html",
                    "html": (f"<p style=\"font-family:Georgia,serif;"
                             f"color:{CREAM};font-size:34px;line-height:1.4;"
                             f"text-align:center;\">&ldquo;{line}&rdquo;</p>"),
                    "width": 900, "height": 220,
                    "background": "transparent",
                },
                "start": round(cursor + 0.4, 3),
                "length": max(dur - 0.8, 1.0),
                "position": "bottom",
                "offset": {"y": 0.12},
                "transition": {"in": "fade", "out": "fade"},
            })

        cursor += dur

    total = round(cursor, 3)

    # ---- Opening title card (chapter-0 branded intro) ----
    title_card = {
        "asset": {
            "type": "html",
            "html": (f"<div style=\"text-align:center;font-family:Georgia,serif;\">"
                     f"<p style=\"color:{GOLD};font-size:26px;letter-spacing:4px;\">RETOLD</p>"
                     f"<h1 style=\"color:{CREAM};font-size:56px;margin:14px 0;\">"
                     f"{cover.get('title', 'A Life Remembered')}</h1>"
                     f"<p style=\"color:{CREAM};font-size:24px;\">"
                     f"in {subject.get('name', '')}'s own voice</p></div>"),
            "width": 1000, "height": 420, "background": "transparent",
        },
        "start": 0,
        "length": TITLE_LEN,
        "position": "center",
        "transition": {"in": "fade", "out": "fade"},
    }

    # ---- Assemble tracks into the template's timeline ----
    timeline = template.setdefault("timeline", {})
    timeline.setdefault("background", FOREST)

    # Optional soft music bed under everything (env-provided, licensed).
    music_url = os.environ.get("MUSIC_URL")
    if music_url:
        timeline["soundtrack"] = {
            "src": music_url, "effect": "fadeInFadeOut", "volume": 0.12,
        }

    timeline["tracks"] = [
        {"clips": caption_clips},          # top: words
        {"clips": [title_card]},           # brand intro / lower-thirds
        {"clips": image_clips},            # bottom: imagery
        {"clips": audio_clips},            # real voice (audio track)
    ]

    # Output settings live in the template but we stamp resolution/format safely.
    output = template.setdefault("output", {})
    output.setdefault("format", "mp4")
    output.setdefault("resolution", "hd")   # 720p feed-friendly per economy rule
    output.setdefault("fps", 25)

    # Carry the order id for our own traceability (Shotstack echoes it back).
    template["merge"] = template.get("merge", [])
    template.setdefault("callback", os.environ.get("SHOTSTACK_CALLBACK_URL"))
    template["_retold_meta"] = {
        "order_id": book.get("order_id"),
        "duration_s": total,
        "chapters": len(chapters),
    }
    return template


def render_film(book: Dict[str, Any],
                r2_public_base: Optional[str] = None) -> Dict[str, Any]:
    """Build the edit + submit it to Shotstack. Returns {'id': render_id, ...}."""
    edit = build_edit(book, r2_public_base)
    # Shotstack rejects unknown top-level keys — strip our private metadata.
    edit.pop("_retold_meta", None)
    if not edit.get("callback"):
        edit.pop("callback", None)
    url = f"{_api_base()}/render"
    body = json.dumps(edit).encode()
    resp = _request("POST", url, body)
    return resp.get("response", resp)


def get_render(render_id: str) -> Dict[str, Any]:
    url = f"{_api_base()}/render/{render_id}"
    resp = _request("GET", url)
    return resp.get("response", resp)


def wait_for_url(render_id: str, poll_seconds: int = 15,
                 timeout_seconds: int = 1800) -> str:
    """Block-poll until the render is 'done' and return the MP4 URL.
    (n8n uses its own Wait loop in production; this is for scripts/tests.)"""
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        r = get_render(render_id)
        status = r.get("status")
        if status == "done":
            return r.get("url")
        if status == "failed":
            raise RuntimeError(f"Shotstack render {render_id} failed: {r.get('error')}")
        time.sleep(poll_seconds)
    raise TimeoutError(f"Shotstack render {render_id} timed out.")


if __name__ == "__main__":
    if "--build" in sys.argv:
        # Build an edit from a sample and print it — no API key, no network.
        idx = sys.argv.index("--build")
        order_path = sys.argv[idx + 1] if len(sys.argv) > idx + 1 else None
        demo = {
            "order_id": "1001",
            "subject": {"name": "Rosa"},
            "cover": {"title": "The Life of Rosa"},
            "chapters": [
                {"n": 1, "title": "A Life Rooted in Love",
                 "pull_quote": "We had nothing, and we had everything.",
                 "illustration_file": "assets/ch1.png",
                 "audio_clip": {"clip_file": "audio/ch1.mp3",
                                "start_ms": 12000, "end_ms": 59000}},
                {"n": 2, "title": "Crossing the Water",
                 "pull_quote": "I kept my mother's ring in my shoe.",
                 "illustration_file": "assets/ch2.png",
                 "audio_clip": {"clip_file": "audio/ch2.mp3",
                                "start_ms": 0, "end_ms": 41000}},
            ],
        }
        os.environ.setdefault("R2_PUBLIC_BASE", "https://cdn.retold.family/1001")
        print(json.dumps(build_edit(demo), indent=2, ensure_ascii=False))
    else:
        print(__doc__)

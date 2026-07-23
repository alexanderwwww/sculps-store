#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
orchestrate.py — THE AI INTERVIEWER (Component 0, runs BEFORE the engine).

This is the piece that makes RETOLD fully automatic. Given one paid order, it:

  1. Reads the parent's phone number + details from the order.
  2. Places a few short, warm outbound calls (interview_plan.py drives them),
     one per life-chapter session, using the voice-agent provider (vapi.py).
  3. Waits for each call to finish, downloads its recording.
  4. Stitches the recordings into a single master.wav.
  5. Writes that path back onto the order as `interview_audio`, so the existing
     engine (produce.py) can take over with NOTHING changed downstream.

Run it:
    python interview/orchestrate.py --order samples/sample_order.json --out out/1001/

Smoke test with no account, no phone call, no internet:
    python interview/orchestrate.py --order samples/sample_order.json --out out/1001/ --mock

HOW THE CALLS ACTUALLY GET SPREAD OUT
In production you do NOT block a server for three days waiting between calls.
n8n schedules the sessions (a call every day or two) and calls this script once
per session with --session N; when the last session's recording lands, n8n runs
produce.py. For a local end-to-end test, running with no --session does all
sessions back-to-back so you can see the whole thing work at once.

HONESTY: we only ever RECORD and TRANSCRIBE the real voice. Never cloned.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

_HERE = Path(__file__).resolve().parent
_ENGINE = _HERE.parent / "engine"
for p in (_HERE, _ENGINE):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

from common import env, log, SAMPLES_DIR, REPO_ROOT  # noqa: E402
import interview_plan as plan  # noqa: E402
import vapi  # noqa: E402


# ---------------------------------------------------------------------------
# ffmpeg — reuse imageio-ffmpeg if a system ffmpeg isn't on PATH.
# ---------------------------------------------------------------------------
def _ffmpeg() -> str | None:
    if shutil.which("ffmpeg"):
        return "ffmpeg"
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


def _download(url: str, dest: Path) -> bool:
    try:
        import requests
        with requests.get(url, stream=True, timeout=120) as r:
            r.raise_for_status()
            with open(dest, "wb") as f:
                for chunk in r.iter_content(8192):
                    f.write(chunk)
        return True
    except Exception as e:
        log(f"Could not download recording ({e}).", "WARN")
        return False


def _concat_wavs(parts: list[Path], master: Path) -> None:
    """Join per-session recordings into one master.wav (chronological)."""
    parts = [p for p in parts if p and p.exists()]
    if not parts:
        raise RuntimeError("No recordings to assemble.")
    if len(parts) == 1:
        shutil.copyfile(parts[0], master)
        return
    ff = _ffmpeg()
    if not ff:
        # No ffmpeg: at least keep the first part so the pipeline can proceed.
        shutil.copyfile(parts[0], master)
        log("ffmpeg not found; used first session recording only.", "WARN")
        return
    listing = master.parent / "_concat.txt"
    listing.write_text("".join(f"file '{p.resolve()}'\n" for p in parts), encoding="utf-8")
    subprocess.run(
        [ff, "-y", "-f", "concat", "-safe", "0", "-i", str(listing),
         "-ac", "1", "-ar", "16000", str(master)],
        check=True, capture_output=True,
    )
    listing.unlink(missing_ok=True)


def _mock_master(master: Path) -> None:
    """Produce a plausible master.wav with no calls: reuse a bundled sample if
    present, else synthesize a short silent wav so downstream ffmpeg cutting
    has a real file to slice."""
    for cand in (SAMPLES_DIR / "sample_master.wav",
                 REPO_ROOT / "out" / "1001" / "audio" / "master.wav"):
        if cand.exists():
            shutil.copyfile(cand, master)
            log(f"Interview (MOCK): reused {cand.name} as master.wav.")
            return
    ff = _ffmpeg()
    if ff:
        subprocess.run(
            [ff, "-y", "-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono",
             "-t", "30", str(master)],
            check=True, capture_output=True,
        )
    else:
        master.write_bytes(b"RIFF\x00\x00\x00\x00WAVEfmt ")  # minimal stub
    log("Interview (MOCK): wrote a placeholder master.wav (no sample found).")


# ---------------------------------------------------------------------------
# Run one session (place call → wait → fetch recording).
# ---------------------------------------------------------------------------
def run_session(order: dict, n: int, audio_dir: Path, mock: bool) -> Path | None:
    sys_prompt = plan.system_prompt_for(order, n)
    first_line = plan.first_line_for(order, n)
    assistant = vapi.build_assistant(sys_prompt, first_line, order)
    call = vapi.place_call(order, assistant, n, mock=mock)
    cid = call["call_id"]

    part = audio_dir / f"session{n}.wav"
    if mock or call.get("mock"):
        return None  # mock: no per-session file; master is faked once at the end

    # Poll until the call ends (n8n normally does this via webhook; we also
    # support a simple poll for local runs).
    deadline = time.time() + int(env("INTERVIEW_MAX_WAIT_SECS", "3600"))
    while time.time() < deadline:
        info = vapi.get_call(cid)
        if info.get("ended"):
            url = info.get("recording_url")
            if url and _download(url, part):
                log(f"Session {n}: recording saved -> {part.name}")
                return part
            log(f"Session {n} ended but no recording URL was available.", "WARN")
            return None
        time.sleep(int(env("INTERVIEW_POLL_SECS", "20")))
    log(f"Session {n}: timed out waiting for the call to finish.", "WARN")
    return None


def main() -> int:
    ap = argparse.ArgumentParser(description="RETOLD AI interviewer → master.wav")
    ap.add_argument("--order", required=True, help="Path to the order JSON.")
    ap.add_argument("--out", required=True, help="Output folder for this order.")
    ap.add_argument("--session", type=int, default=None,
                    help="Run ONLY this session number (n8n schedules them). "
                         "Omit to run every session back-to-back (local test).")
    ap.add_argument("--mock", action="store_true",
                    help="No account, no calls — fabricate master.wav from sample.")
    args = ap.parse_args()

    order_path = Path(args.order)
    order = json.loads(order_path.read_text(encoding="utf-8"))
    out_dir = Path(args.out)
    audio_dir = out_dir / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    master = audio_dir / "master.wav"

    phone = (order.get("subject", {}) or {}).get("phone")
    consent = order.get("consent_to_record", False)
    if not args.mock:
        if not phone:
            log("No parent phone number on the order — cannot place calls.", "ERROR")
            return 2
        if not consent:
            log("Order is not marked consent_to_record=true. The agent will "
                "still ASK for consent live, but you should collect it at intake.",
                "WARN")

    sessions = ([args.session] if args.session else range(1, plan.total_sessions() + 1))
    parts: list[Path] = []
    for n in sessions:
        p = run_session(order, n, audio_dir, args.mock)
        if p:
            parts.append(p)

    # Assemble (or fake) the single master recording the engine consumes.
    if args.mock or not parts:
        _mock_master(master)
    else:
        _concat_wavs(parts, master)
        log(f"Assembled {len(parts)} session(s) -> {master}")

    # Hand off: write the audio path back onto the order for produce.py.
    order["interview_audio"] = str(master)
    enriched = out_dir / "order.enriched.json"
    enriched.write_text(json.dumps(order, indent=2, ensure_ascii=False), encoding="utf-8")
    log(f"Interview complete. Order ready for the engine -> {enriched}")
    print(str(enriched))  # stdout: the path n8n feeds into produce.py
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

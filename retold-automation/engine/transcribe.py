# -*- coding: utf-8 -*-
"""
transcribe.py — turn the raw interview audio into a diarized transcript.

REAL MODE (ASSEMBLYAI_API_KEY present, not --mock):
    Uploads the parent's master.wav to AssemblyAI, asks for speaker
    diarization, polls until done, and returns the transcript text with
    "Speaker A:" / "Speaker B:" style labels — plus the word-level timing we
    later use to cut each chapter's audio clip.

MOCK MODE (--mock, or no key):
    Reads samples/sample_transcript.txt and returns it unchanged, with a
    synthetic timing map, so the whole engine runs with zero API keys.

HONESTY NOTE: we only ever TRANSCRIBE the real recording. The parent's voice is
never cloned or synthesised anywhere in this pipeline.
"""

from __future__ import annotations

import time
from pathlib import Path

from common import env, log, SAMPLES_DIR

ASSEMBLYAI_BASE = "https://api.assemblyai.com/v2"


def transcribe(audio_path: str | Path | None, mock: bool = False) -> dict:
    """Return {'text': <diarized transcript>, 'words': [...], 'audio_path': ...}.

    In mock mode `audio_path` may be None; we fall back to the sample transcript.
    """
    if mock or not env("ASSEMBLYAI_API_KEY"):
        return _mock_transcript()

    if not audio_path or not Path(audio_path).exists():
        log("No audio file found for real transcription; using sample.", "WARN")
        return _mock_transcript()

    return _assemblyai_transcript(Path(audio_path))


# ---------------------------------------------------------------------------
# Mock
# ---------------------------------------------------------------------------
def _mock_transcript() -> dict:
    sample = SAMPLES_DIR / "sample_transcript.txt"
    text = sample.read_text(encoding="utf-8") if sample.exists() else "Speaker A: ..."
    log(f"Transcription (MOCK): loaded {sample.name} ({len(text.split())} words).")
    # A rough synthetic timing map: assume ~2.2 words/sec of speech, so the
    # audio-range picker in write_book.py has something plausible to slice.
    words = []
    t = 0
    for w in text.split():
        start = t
        dur = 450  # ms per word, deliberately coarse for the mock
        words.append({"text": w, "start": start, "end": start + dur})
        t += dur
    return {"text": text, "words": words, "audio_path": None, "mock": True}


# ---------------------------------------------------------------------------
# Real AssemblyAI
# ---------------------------------------------------------------------------
def _assemblyai_transcript(audio_path: Path) -> dict:
    import requests  # imported lazily so --mock needs no dependency

    key = env("ASSEMBLYAI_API_KEY")
    headers = {"authorization": key}

    log(f"Uploading {audio_path.name} to AssemblyAI...")
    with open(audio_path, "rb") as f:
        up = requests.post(
            f"{ASSEMBLYAI_BASE}/upload", headers=headers, data=f, timeout=600
        )
    up.raise_for_status()
    upload_url = up.json()["upload_url"]

    log("Requesting diarized transcript...")
    create = requests.post(
        f"{ASSEMBLYAI_BASE}/transcript",
        headers=headers,
        json={"audio_url": upload_url, "speaker_labels": True},
        timeout=60,
    )
    create.raise_for_status()
    tid = create.json()["id"]

    # Poll.
    while True:
        poll = requests.get(
            f"{ASSEMBLYAI_BASE}/transcript/{tid}", headers=headers, timeout=60
        )
        poll.raise_for_status()
        data = poll.json()
        status = data["status"]
        if status == "completed":
            break
        if status == "error":
            raise RuntimeError(f"AssemblyAI error: {data.get('error')}")
        log(f"  ...transcription {status}, waiting 5s")
        time.sleep(5)

    # Build a "Speaker X: ..." transcript from the diarized utterances.
    lines = []
    for utt in data.get("utterances", []) or []:
        lines.append(f"Speaker {utt['speaker']}: {utt['text']}")
    text = "\n".join(lines) if lines else data.get("text", "")

    words = [
        {"text": w["text"], "start": w["start"], "end": w["end"]}
        for w in data.get("words", []) or []
    ]
    log(f"Transcription complete: {len(text.split())} words, {len(words)} timed.")
    return {"text": text, "words": words, "audio_path": str(audio_path), "mock": False}

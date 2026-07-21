# -*- coding: utf-8 -*-
"""
voicecode.py — the "hear the parent's real voice" plumbing.

Two jobs:

  1) AUDIO CLIPS: cut each chapter's short clip out of the master recording
     (audio/master.wav) using the start/end timestamps write_book.py chose.
     * Real path uses ffmpeg -> MP3 (only trims the real recording — never
       clones or synthesises; that's the honesty rule).
     * If ffmpeg is missing (e.g. bare Phase-1 box), we fall back to a pure-
       Python WAV slice written to the .mp3 path so the pipeline still
       completes end to end. A clear warning is logged.
     * In --mock with no master present, we first synthesise a quiet placeholder
       master.wav so there is something to slice.

  2) QR CODES: a gold RETOLD-styled SVG QR per chapter (points at that chapter's
     anchor on the family voice page) and one per grandchild "card" (a small
     printable PDF with a personalised QR).
     * Real path uses `segno`. If segno isn't installed, we emit a clean
       placeholder SVG so nothing breaks.

Everything is driven by the paths already written into book.json.
"""

from __future__ import annotations

import math
import shutil
import struct
import subprocess
import wave
from pathlib import Path

from common import env, log, GOLD, CREAM, FOREST
from pdf_fallback import MiniPDF


def build_voice_assets(book: dict, out_dir: Path, mock: bool = False) -> None:
    audio_dir = out_dir / "audio"
    assets_dir = out_dir / "assets"
    audio_dir.mkdir(parents=True, exist_ok=True)
    assets_dir.mkdir(parents=True, exist_ok=True)

    master = audio_dir / "master.wav"
    if not master.exists():
        # Size the placeholder master so every chapter's clip range is covered.
        max_end_ms = max(
            [int(ch.get("audio_clip", {}).get("end_ms", 0))
             for ch in book.get("chapters", [])] or [0]
        )
        seconds = max(200, int(max_end_ms / 1000) + 10)
        if mock or not env("ASSEMBLYAI_API_KEY"):
            log(f"No master.wav found — synthesising a placeholder master (MOCK, {seconds}s).")
        else:
            log("No master.wav present; audio clips will be placeholders.", "WARN")
        _synth_master(master, seconds=seconds)

    _cut_clips(book, master, audio_dir)
    _write_qrs(book, assets_dir)
    _write_grandchild_cards(book, assets_dir)


# ---------------------------------------------------------------------------
# Audio
# ---------------------------------------------------------------------------
def _have_ffmpeg() -> bool:
    return shutil.which("ffmpeg") is not None


def _synth_master(path: Path, seconds: int = 180) -> None:
    """Write a quiet mono WAV so the clip-cutter has real audio to slice.
    (Placeholder tone only — the shipping product uses the real recording.)"""
    framerate = 16000
    amp = 1200  # quiet
    with wave.open(str(path), "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(framerate)
        frames = bytearray()
        for i in range(int(seconds * framerate)):
            # a soft low tone so the file is valid, audible, non-silent
            val = int(amp * math.sin(2 * math.pi * 110 * (i / framerate)))
            frames += struct.pack("<h", val)
        w.writeframes(bytes(frames))


def _cut_clips(book: dict, master: Path, audio_dir: Path) -> None:
    use_ffmpeg = _have_ffmpeg()
    if not use_ffmpeg:
        log("ffmpeg not found — writing WAV-slice placeholders at .mp3 paths.", "WARN")

    for ch in book.get("chapters", []):
        clip = ch["audio_clip"]
        out = audio_dir / Path(clip["clip_file"]).name
        start_ms = int(clip.get("start_ms", 0))
        end_ms = int(clip.get("end_ms", start_ms + 30000))
        if use_ffmpeg:
            _ffmpeg_cut(master, out, start_ms, end_ms)
        else:
            _wav_slice(master, out, start_ms, end_ms)
    log(f"Audio: produced {len(book.get('chapters', []))} chapter clips.")


def _ffmpeg_cut(master: Path, out: Path, start_ms: int, end_ms: int) -> None:
    ss = start_ms / 1000.0
    to = end_ms / 1000.0
    cmd = [
        "ffmpeg", "-y", "-i", str(master),
        "-ss", f"{ss:.3f}", "-to", f"{to:.3f}",
        "-c:a", "libmp3lame", "-q:a", "4", str(out),
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True)
    except subprocess.CalledProcessError as e:  # pragma: no cover
        log(f"  ffmpeg failed on {out.name}: {e.stderr[:200]!r}; WAV slice.", "WARN")
        _wav_slice(master, out, start_ms, end_ms)


def _wav_slice(master: Path, out: Path, start_ms: int, end_ms: int) -> None:
    """Pure-Python slice of the master WAV written to the (nominal) .mp3 path.
    Not a real MP3 — a valid WAV placeholder so downstream steps still run."""
    with wave.open(str(master), "r") as w:
        fr = w.getframerate()
        nchan = w.getnchannels()
        sw = w.getsampwidth()
        total = w.getnframes()
        start_f = max(0, min(total, int(start_ms / 1000.0 * fr)))
        end_f = max(start_f, min(total, int(end_ms / 1000.0 * fr)))
        w.setpos(start_f)
        frames = w.readframes(end_f - start_f)
    with wave.open(str(out), "w") as o:
        o.setnchannels(nchan)
        o.setsampwidth(sw)
        o.setframerate(fr)
        o.writeframes(frames)


# ---------------------------------------------------------------------------
# QR codes
# ---------------------------------------------------------------------------
def _write_qrs(book: dict, assets_dir: Path) -> None:
    for ch in book.get("chapters", []):
        out = assets_dir / Path(ch["qr_file"]).name
        _qr_svg(ch["qr_target"], out)
    log(f"QR: wrote {len(book.get('chapters', []))} chapter codes (gold SVG).")


def _qr_svg(target: str, out: Path) -> None:
    """Gold-on-transparent SVG QR via segno; placeholder SVG if segno absent."""
    try:
        import segno

        qr = segno.make(target, error="h")
        qr.save(str(out), kind="svg", scale=8, border=2,
                dark=GOLD, light=None)  # transparent background, gold modules
    except Exception as e:
        log(f"  segno unavailable ({e}); writing placeholder QR SVG.", "WARN")
        _placeholder_qr_svg(target, out)


def _placeholder_qr_svg(target: str, out: Path) -> None:
    svg = f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
  <rect x="0" y="0" width="240" height="240" fill="none"/>
  <rect x="10" y="10" width="220" height="220" fill="none" stroke="{GOLD}" stroke-width="6" rx="12"/>
  <rect x="30" y="30" width="50" height="50" fill="{GOLD}"/>
  <rect x="160" y="30" width="50" height="50" fill="{GOLD}"/>
  <rect x="30" y="160" width="50" height="50" fill="{GOLD}"/>
  <text x="120" y="128" font-family="Georgia, serif" font-size="13" fill="{FOREST}"
        text-anchor="middle">RETOLD</text>
  <text x="120" y="150" font-family="Georgia, serif" font-size="8" fill="{FOREST}"
        text-anchor="middle">QR placeholder</text>
</svg>"""
    out.write_text(svg, encoding="utf-8")


# ---------------------------------------------------------------------------
# Grandchild cards (small printable PDF, one per grandchild)
# ---------------------------------------------------------------------------
def _write_grandchild_cards(book: dict, assets_dir: Path) -> None:
    gcs = book.get("grandchildren", []) or []
    for gc in gcs:
        out = assets_dir / Path(gc["card_file"]).name
        _grandchild_card_pdf(gc, book, out, assets_dir)
    if gcs:
        log(f"Cards: wrote {len(gcs)} personalised grandchild card PDF(s).")


def _grandchild_card_pdf(gc: dict, book: dict, out: Path, assets_dir: Path) -> None:
    """A 4x6in keepsake card: 'For <name>' + line to the parent's voice page."""
    # First make sure the personalised QR SVG exists (nice for other components);
    # the PDF itself just prints the target text + a gold frame via MiniPDF.
    slug = Path(gc["card_file"]).stem.replace("card-", "")
    _qr_svg(gc["card_qr_target"], assets_dir / f"card-qr-{slug}.svg")

    pdf = MiniPDF(width_in=4, height_in=6)
    p = pdf.new_page()
    p.fill_rect(0, 0, pdf.width, pdf.height, CREAM)
    p.fill_rect(0, pdf.height - 60, pdf.width, 60, FOREST)
    p.text(28, pdf.height - 38, "Retold", size=18, font="F2", hex_color=GOLD)

    name = gc["name"]
    subj = book.get("subject", {})
    p.paragraph(28, pdf.height - 120, f"For {name}", size=24, leading=28,
                font="F3", hex_color=FOREST, max_chars=18)
    p.paragraph(28, pdf.height - 170,
                f"Scan to hear {subj.get('name','your loved one')}'s voice, "
                f"just for you.", size=12, leading=16, font="F1",
                hex_color=FOREST, max_chars=34)
    # a gold placeholder QR block (the real SVG sits beside this file)
    p.fill_rect(28, 60, 150, 150, GOLD)
    p.text(30, 40, gc["card_qr_target"][:46], size=6, font="F2", hex_color=FOREST)
    pdf.save(out)

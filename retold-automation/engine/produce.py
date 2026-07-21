#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
produce.py — THE RETOLD PRODUCTION ENGINE (Component 1).

One command turns a paid Shopify order + the parent's interview into a complete,
print-ready memory book (and everything the film + web + worker need):

    python engine/produce.py --order samples/sample_order.json --out out/<order_id>/

Add --mock to run the WHOLE pipeline with ZERO API keys and no external binaries
(uses the bundled sample transcript + placeholder art) — this is the Phase-1
smoke test:

    python engine/produce.py --order samples/sample_order.json --out out/1001/ --mock

WHAT IT DOES (in order):
  1. Load the order (and its transcript / audio references).
  2. transcribe.py  -> diarized transcript (+ word timings). Skipped in --mock.
  3. write_book.py  -> Claude prompt chain (extract -> outline -> write ->
                       SEPARATE honesty QC) producing the book.json object.
  4. illustrate.py  -> one style anchor + per-chapter FLUX illustrations
                       (placeholders in --mock).
  5. voicecode.py   -> cut each chapter's real-voice audio clip (ffmpeg) +
                       gold QR SVGs + grandchild cards.
  6. PDF render     -> interior.pdf + cover.pdf via ../templates if present,
                       otherwise the engine's built-in proof renderer.
  7. Write book.json + voice_page.json into the output folder.

Every step is commented for a non-technical owner and degrades gracefully so the
run always finishes with a complete, openable proof book.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Make sibling modules importable whether you run this as a script or a module.
_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

from common import load_env, log, REPO_ROOT, TEMPLATES_DIR  # noqa: E402
import transcribe as transcribe_mod  # noqa: E402
import write_book as write_book_mod  # noqa: E402
import illustrate as illustrate_mod  # noqa: E402
import voicecode as voicecode_mod  # noqa: E402


# ---------------------------------------------------------------------------
# Step 6 helper — use the real template renderer if the templates component is
# present; otherwise fall back to the engine's built-in proof PDF renderer.
# ---------------------------------------------------------------------------
def _render_pdfs(book: dict, out_dir: Path) -> None:
    interior = out_dir / "interior.pdf"
    cover = out_dir / "cover.pdf"

    renderer = _load_template_renderer(out_dir)
    if renderer is not None:
        try:
            renderer(book, out_dir)
            log(f"PDF: rendered via templates component -> {interior.name}, {cover.name}")
            return
        except Exception as e:
            log(f"templates renderer failed ({e}); using built-in proof renderer.", "WARN")

    # Built-in fallback (pure Python, no reportlab needed).
    from pdf_fallback import render_interior_pdf, render_cover_pdf

    render_interior_pdf(book, interior)
    render_cover_pdf(book, cover)
    log(f"PDF: built-in proof renderer -> {interior.name}, {cover.name}")


def _load_template_renderer(out_dir: Path):
    """Look for ../templates exposing a render interface. We integrate through a
    small, documented contract and never assume the template's internals.

    Returns a callable ``render(book, out_dir)`` that writes interior.pdf +
    cover.pdf into out_dir, or None if the templates component isn't usable
    (e.g. WeasyPrint isn't installed on this box — then we fall back).

    Accepted shapes (first match wins):
      1. templates.render_pdf.render(book_json_path, assets_dir, out_dir)
         -> the real WeasyPrint template component (Component 2). It reads the
         book.json that produce.py has ALREADY written into out_dir.
      2. templates(.render).render_interior_pdf(book, path)
         + render_cover_pdf(book, path)  -> a book-dict based interface.
    """
    if not TEMPLATES_DIR.exists():
        return None
    parent = str(REPO_ROOT)
    if parent not in sys.path:
        sys.path.insert(0, parent)

    import importlib

    # --- Shape 1: the real render_pdf.render(book_json_path, assets, out) -----
    try:
        mod = importlib.import_module("templates.render_pdf")
        render_fn = getattr(mod, "render", None)
        if callable(render_fn):
            def _adapter(book, od, _fn=render_fn):
                # book.json + assets/ already exist in od (produce writes them
                # before calling us). The template reads book.json directly.
                _fn(od / "book.json", od / "assets", od)
            return _adapter
    except Exception as e:
        # Most commonly WeasyPrint/jinja2 not installed on this box.
        log(f"templates.render_pdf unavailable ({e}); trying alternatives.", "WARN")

    # --- Shape 2: an explicit render_interior_pdf / render_cover_pdf pair -----
    try:
        for modname in ("templates.render", "templates"):
            try:
                mod = importlib.import_module(modname)
            except Exception:
                continue
            i = getattr(mod, "render_interior_pdf", None)
            c = getattr(mod, "render_cover_pdf", None)
            if callable(i) and callable(c):
                def _adapter(book, od, _i=i, _c=c):
                    _i(book, od / "interior.pdf")
                    _c(book, od / "cover.pdf")
                return _adapter
    except Exception:
        return None
    return None


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------
def produce(order_path: Path, out_dir: Path, mock: bool = False) -> dict:
    load_env()
    order = json.loads(order_path.read_text(encoding="utf-8"))
    order_id = str(order.get("order_id") or order.get("id") or "unknown")

    out_dir = out_dir.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "assets").mkdir(exist_ok=True)
    (out_dir / "audio").mkdir(exist_ok=True)

    log(f"=== RETOLD engine starting for order {order_id} "
        f"({'MOCK' if mock else 'LIVE'}) ===")

    # --- 1/6 audio source: copy an existing master.wav into place if the order
    #     points at one; --mock will synthesise one later if absent.
    _stage_master_audio(order, order_path, out_dir, mock)

    # --- 2/6 transcribe ---
    log("Step 2/6: transcribe")
    master = out_dir / "audio" / "master.wav"
    transcript = transcribe_mod.transcribe(master if master.exists() else None, mock=mock)

    # --- 3/6 write the book (Claude chain + honesty QC) ---
    log("Step 3/6: write book (life-events -> outline -> prose -> honesty QC)")
    book = write_book_mod.build_book(order, transcript, mock=mock)

    # --- 4/6 illustrations ---
    log("Step 4/6: illustrate (style anchor + chapter scenes)")
    illustrate_mod.illustrate(book, out_dir, mock=mock)

    # --- 5/6 voice clips + QR + cards ---
    log("Step 5/6: voicecode (audio clips + gold QR + grandchild cards)")
    voicecode_mod.build_voice_assets(book, out_dir, mock=mock)

    # --- write book.json + voice_page.json BEFORE rendering so the template can
    #     read them if it wants to. ---
    (out_dir / "book.json").write_text(
        json.dumps(book, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    _write_voice_page(book, out_dir)

    # --- 6/6 PDFs ---
    log("Step 6/6: render interior.pdf + cover.pdf")
    _render_pdfs(book, out_dir)

    # rewrite book.json in case rendering annotated anything
    (out_dir / "book.json").write_text(
        json.dumps(book, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    log(f"=== DONE. Output in {out_dir} ===")
    _print_manifest(out_dir)
    return book


def _stage_master_audio(order: dict, order_path: Path, out_dir: Path, mock: bool) -> None:
    """If the order references an interview audio file, copy it to
    out/audio/master.wav so transcribe/voicecode can find it."""
    import shutil

    ref = order.get("audio_master") or order.get("interview_audio")
    if not ref:
        return
    src = Path(ref)
    if not src.is_absolute():
        src = (order_path.parent / ref).resolve()
    if src.exists():
        dest = out_dir / "audio" / "master.wav"
        try:
            shutil.copyfile(src, dest)
            log(f"Staged interview audio: {src.name} -> audio/master.wav")
        except Exception as e:
            log(f"Could not stage audio ({e}); continuing.", "WARN")


def _write_voice_page(book: dict, out_dir: Path) -> None:
    """The compact object the Cloudflare Worker serves at retold.family/f/<token>.
    Lists each chapter's clip + the personalised grandchild links."""
    vp = {
        "token": book["voice_page"]["token"],
        "base_url": book["voice_page"]["base_url"],
        "subject": book.get("subject", {}),
        "cover": book.get("cover", {}),
        "chapters": [
            {
                "n": ch["n"],
                "title": ch["title"],
                "anchor": f"chapter-{ch['n']}",
                "clip_file": Path(ch["audio_clip"]["clip_file"]).name,
                "pull_quote": ch.get("pull_quote"),
            }
            for ch in book.get("chapters", [])
        ],
        "grandchildren": [
            {"name": gc["name"], "from_link": gc["card_qr_target"]}
            for gc in book.get("grandchildren", [])
        ],
    }
    (out_dir / "voice_page.json").write_text(
        json.dumps(vp, indent=2, ensure_ascii=False), encoding="utf-8"
    )


def _print_manifest(out_dir: Path) -> None:
    log("Produced files:")
    for p in sorted(out_dir.rglob("*")):
        if p.is_file():
            size = p.stat().st_size
            print(f"    {p.relative_to(out_dir)}  ({size} bytes)", file=sys.stderr)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def main(argv=None) -> int:
    ap = argparse.ArgumentParser(
        description="RETOLD production engine — order -> print-ready memory book."
    )
    ap.add_argument("--order", required=True, help="Path to the order JSON.")
    ap.add_argument("--out", required=True, help="Output folder, e.g. out/1001/")
    ap.add_argument(
        "--mock", action="store_true",
        help="Run end-to-end with NO API keys (sample transcript + placeholders).",
    )
    args = ap.parse_args(argv)

    order_path = Path(args.order)
    if not order_path.is_absolute():
        order_path = (Path.cwd() / order_path).resolve()
    if not order_path.exists():
        # also try relative to repo root for convenience
        alt = (REPO_ROOT / args.order).resolve()
        if alt.exists():
            order_path = alt
        else:
            log(f"Order file not found: {args.order}", "ERROR")
            return 2

    out_dir = Path(args.out)
    if not out_dir.is_absolute():
        out_dir = (Path.cwd() / out_dir).resolve()

    try:
        produce(order_path, out_dir, mock=args.mock)
    except Exception as e:
        log(f"FATAL: {e}", "ERROR")
        import traceback

        traceback.print_exc()
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

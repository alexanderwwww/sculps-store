#!/usr/bin/env python3
# =============================================================================
# RETOLD — COMPONENT 2 : PRINT-READY PDF TEMPLATE (WeasyPrint)
# -----------------------------------------------------------------------------
# WHAT THIS FILE DOES (for the non-technical owner)
#   It turns one order's `book.json` into two press-ready PDFs:
#       interior.pdf  -> the inside pages of the memory book
#       cover.pdf     -> the full wrap (back + spine + front), one flat sheet
#   Both are sized for a print-on-demand press (Lulu / Peecho): correct trim,
#   0.125" bleed on every edge, a mirrored gutter near the spine, embedded
#   fonts, and QR codes that link to the parent's REAL voice recordings.
#
# HOW IT FITS THE PIPELINE
#   The engine (Component 1) writes out/<order_id>/book.json + assets/*.
#   We read that book.json, render both PDFs into the same folder, done.
#   We never invent data — everything comes from book.json and the files it
#   points at. Integration happens through book.json + the shared file layout.
#
# PUBLIC API
#   render(book_json_path, assets_dir, out_dir) -> (interior_pdf, cover_pdf)
#   compute_spine_width(page_count, paper="80_coated") -> spine width in inches
#
# RUN IT STANDALONE (no engine, no API keys needed):
#   python templates/render_pdf.py            # builds a bundled sample + renders
#   python templates/render_pdf.py path/to/book.json   # render a real book.json
#
# PREFLIGHT / PRESS NOTES  (see PREFLIGHT_NOTE at the bottom):
#   * Page size = trim + bleed baked in (no crop marks by default; pass
#     marks=True to render a proof with crop/cross marks).
#   * Fonts are embedded by WeasyPrint automatically. We ask for Georgia (the
#     RETOLD brand serif); if it is not installed on the machine we fall back to
#     a metric-compatible serif so line breaks stay stable. Install Georgia (or
#     a licensed equivalent) on the production box for an exact brand match.
#   * Raster illustrations should be supplied at 300 dpi at final print size
#     (>=2550 px across for an 8.5" page). QR codes are vector SVG => infinite dpi.
# =============================================================================

from __future__ import annotations

import base64
import json
import os
import sys
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape
from markupsafe import Markup
from weasyprint import HTML

# --- Paths ------------------------------------------------------------------
TEMPLATES_DIR = Path(__file__).resolve().parent
BOOK_CSS = TEMPLATES_DIR / "book.css"
COVER_CSS = TEMPLATES_DIR / "cover.css"

# The RETOLD brand serif is Georgia. These fallbacks are metric-compatible
# serifs so that if Georgia is missing the book still lays out identically.
SERIF_STACK = "Georgia, 'Liberation Serif', 'Times New Roman', 'DejaVu Serif', serif"

# =============================================================================
# LULU SPINE-WIDTH FORMULA
# -----------------------------------------------------------------------------
# A book's spine gets wider the more pages it has. Lulu (and most POD presses)
# compute spine width as:  page_count * per_page_caliper(paper stock).
# The values below are Lulu's published page-thickness (caliper) figures, in
# inches per single page. Pick the stock that matches the interior print job.
# Cream uncoated is the classic "book" feel; coated stocks are for colour /
# illustrated interiors like ours.
# =============================================================================
PAGE_CALIPER_IN = {
    "60_white":   0.002252,   # 60# white uncoated  (standard B&W)
    "60_cream":   0.0025,     # 60# cream uncoated   (classic novel feel)
    "70_white":   0.002744,   # 70# white uncoated   (premium)
    "80_coated":  0.002347,   # 80# coated white     (premium colour — our default)
    "100_coated": 0.003533,   # 100# coated          (heavy photo stock)
}
# Presses will not bind a spine title on very thin books; keep a sane floor.
MIN_SPINE_IN = 0.06


def compute_spine_width(page_count: int, paper: str = "80_coated") -> float:
    """Return the spine width in inches for a given interior page count + stock.

    Uses Lulu's caliper-per-page formula: spine = page_count * caliper(paper).
    `paper` is one of PAGE_CALIPER_IN's keys (default "80_coated", the premium
    colour stock RETOLD prints illustrated interiors on). Rounded to 3 decimals,
    which is the precision Lulu's cover templates expect.
    """
    if page_count is None or page_count < 1:
        raise ValueError("page_count must be a positive integer")
    caliper = PAGE_CALIPER_IN.get(paper)
    if caliper is None:
        raise ValueError(
            f"Unknown paper stock '{paper}'. Choose one of: {', '.join(PAGE_CALIPER_IN)}"
        )
    return round(max(page_count * caliper, MIN_SPINE_IN), 3)


# =============================================================================
# ASSET HELPERS (made available inside the templates as asset() / embed_qr())
# =============================================================================
def _resolve_asset(rel_path: str, base_dir: Path, assets_dir: Path) -> Path | None:
    """Find a file referenced by book.json (paths are relative to book.json).

    Tries, in order: the path as-is under book.json's folder, the file by name
    inside the given assets_dir, and an assets/ subfolder next to book.json.
    Returns the first that exists, or None.
    """
    rel = Path(rel_path)
    candidates = [
        base_dir / rel,
        assets_dir / rel.name,
        base_dir / "assets" / rel.name,
    ]
    for c in candidates:
        if c.exists():
            return c.resolve()
    return None


def _make_asset_fn(base_dir: Path, assets_dir: Path):
    """asset('assets/ch1.png') -> a file:// URI WeasyPrint can load."""
    def asset(rel_path: str) -> str:
        p = _resolve_asset(rel_path, base_dir, assets_dir)
        if p is None:
            # Non-fatal: render continues, the image simply won't appear.
            sys.stderr.write(f"[render_pdf] WARNING: asset not found: {rel_path}\n")
            return ""
        return p.as_uri()
    return asset


def _make_embed_qr_fn(base_dir: Path, assets_dir: Path):
    """embed_qr('assets/qr1.svg') -> inline SVG (crisp vector) or a PNG <img>.

    QR codes are inlined so they always print vector-sharp regardless of dpi.
    """
    def embed_qr(rel_path: str) -> Markup:
        p = _resolve_asset(rel_path, base_dir, assets_dir)
        if p is None:
            sys.stderr.write(f"[render_pdf] WARNING: QR not found: {rel_path}\n")
            return Markup("")
        if p.suffix.lower() == ".svg":
            svg = p.read_text(encoding="utf-8")
            # Strip XML prolog / doctype so it embeds cleanly inside HTML flow.
            for tag in ("<?xml", "<!DOCTYPE"):
                while tag in svg:
                    start = svg.index(tag)
                    end = svg.index(">", start) + 1
                    svg = svg[:start] + svg[end:]
            return Markup(svg.strip())
        # Raster fallback (PNG/JPG): embed as a data URI.
        data = base64.b64encode(p.read_bytes()).decode("ascii")
        mime = "image/png" if p.suffix.lower() == ".png" else "image/jpeg"
        return Markup(f'<img src="data:{mime};base64,{data}" alt="QR code">')
    return embed_qr


def _jinja_env(base_dir: Path, assets_dir: Path) -> Environment:
    env = Environment(
        loader=FileSystemLoader(str(TEMPLATES_DIR)),
        autoescape=select_autoescape(["html", "xml"]),
    )
    env.globals["asset"] = _make_asset_fn(base_dir, assets_dir)
    env.globals["embed_qr"] = _make_embed_qr_fn(base_dir, assets_dir)
    return env


# =============================================================================
# GEOMETRY  — derive every inch measurement from book.json["print"]
# =============================================================================
def _geometry(book: dict) -> dict:
    """Compute page + cover dimensions (inches) from book.json's print block."""
    pr = book.get("print", {}) or {}

    # Trim, e.g. "8.5x8.5" -> (8.5, 8.5). Square book, but handle w x h generally.
    trim_raw = str(pr.get("trim", "8.5x8.5")).lower().replace(" ", "")
    if "x" in trim_raw:
        tw, th = trim_raw.split("x", 1)
        trim_w, trim_h = float(tw), float(th)
    else:
        trim_w = trim_h = float(trim_raw)

    bleed = float(pr.get("bleed_in", 0.125))
    page_count = int(pr.get("page_count", len(book.get("chapters", [])) * 4 or 32))

    # Spine: trust the engine's value if present, else compute it (Lulu formula).
    spine = pr.get("spine_width_in")
    spine = float(spine) if spine else compute_spine_width(page_count)

    # Safe margins. Outer/top/bottom keep text off the trim edge; the gutter is
    # larger so the binding doesn't swallow words near the spine.
    outer = 0.75          # includes the 0.125 bleed + ~0.625 safety
    gutter = 0.95

    # Interior printed sheet = trim + bleed on all four sides.
    page_w = round(trim_w + 2 * bleed, 4)
    page_h = round(trim_h + 2 * bleed, 4)

    # Cover wrap laid out left->right: [bleed][back trim][spine][front trim][bleed]
    cover_w = round(2 * bleed + trim_w + spine + trim_w, 4)
    cover_h = round(trim_h + 2 * bleed, 4)
    back_x = round(bleed, 4)
    spine_x = round(bleed + trim_w, 4)
    front_x = round(bleed + trim_w + spine, 4)

    return {
        "trim_in": trim_w,               # square book: width used for panels
        "trim_h_in": trim_h,
        "bleed_in": bleed,
        "page_count": page_count,
        "spine_in": spine,
        "outer_in": outer,
        "gutter_in": gutter,
        "page_w_in": page_w,
        "page_h_in": page_h,
        "cover_w_in": cover_w,
        "cover_h_in": cover_h,
        "back_x_in": back_x,
        "spine_x_in": spine_x,
        "front_x_in": front_x,
    }


# =============================================================================
# PUBLIC ENTRYPOINT
# =============================================================================
def render(book_json_path, assets_dir=None, out_dir=None, marks: bool = False):
    """Render interior.pdf + cover.pdf from a book.json.

    Args:
        book_json_path: path to the order's book.json (engine output).
        assets_dir:     folder with illustrations/QRs. Defaults to the
                        'assets' folder next to book.json.
        out_dir:        where to write the PDFs. Defaults to book.json's folder.
        marks:          True to draw crop/cross marks for an internal proof;
                        False (default) for the clean press-ready file.

    Returns:
        (interior_pdf_path, cover_pdf_path) as Path objects.
    """
    book_json_path = Path(book_json_path).resolve()
    base_dir = book_json_path.parent
    assets_dir = Path(assets_dir).resolve() if assets_dir else (base_dir / "assets")
    out_dir = Path(out_dir).resolve() if out_dir else base_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    book = json.loads(book_json_path.read_text(encoding="utf-8"))
    geo = _geometry(book)
    env = _jinja_env(base_dir, assets_dir)

    # ---- INTERIOR ----------------------------------------------------------
    interior_html = env.get_template("book.html").render(
        book=book,
        serif_stack=SERIF_STACK,
        book_css=BOOK_CSS.as_uri(),
        marks=marks,
        **geo,
    )
    interior_pdf = out_dir / "interior.pdf"
    # base_url lets any relative refs resolve against the book's folder.
    HTML(string=interior_html, base_url=str(base_dir)).write_pdf(str(interior_pdf))

    # ---- COVER -------------------------------------------------------------
    cover_html = env.get_template("cover.html").render(
        book=book,
        serif_stack=SERIF_STACK,
        cover_css=COVER_CSS.as_uri(),
        marks=marks,
        **geo,
    )
    cover_pdf = out_dir / "cover.pdf"
    HTML(string=cover_html, base_url=str(base_dir)).write_pdf(str(cover_pdf))

    sys.stderr.write(
        f"[render_pdf] Interior: {interior_pdf}  "
        f"({geo['page_w_in']}x{geo['page_h_in']}in, {geo['page_count']}pp)\n"
        f"[render_pdf] Cover:    {cover_pdf}  "
        f"({geo['cover_w_in']}x{geo['cover_h_in']}in, spine {geo['spine_in']}in)\n"
    )
    return interior_pdf, cover_pdf


# =============================================================================
# SAMPLE BUILDER  — lets this file run with NO engine and NO API keys.
# Creates a self-contained book.json + placeholder illustrations + QR codes,
# then renders both PDFs so the owner can eyeball the RETOLD look immediately.
# =============================================================================
def _build_sample(sample_dir: Path) -> Path:
    import qrcode
    import qrcode.image.svg
    from PIL import Image, ImageDraw

    assets = sample_dir / "assets"
    assets.mkdir(parents=True, exist_ok=True)

    cream = (244, 237, 219)
    forest = (31, 73, 52)
    gold = (199, 164, 75)

    def placeholder_illustration(path: Path, seed: int):
        """A warm, painterly, NON-photoreal placeholder (brand honesty rule:
        never a photoreal real face — figures are distant / stylized)."""
        w = h = 1650  # ~300dpi over ~5.5in printed width
        img = Image.new("RGB", (w, h), cream)
        d = ImageDraw.Draw(img)
        # Soft horizontal wash from cream to forest (a horizon).
        for y in range(h):
            t = y / h
            r = int(cream[0] * (1 - t) + forest[0] * t)
            g = int(cream[1] * (1 - t) + forest[1] * t)
            b = int(cream[2] * (1 - t) + forest[2] * t)
            d.line([(0, y), (w, y)], fill=(r, g, b))
        # A stylized sun and two distant figures (from behind, no faces).
        d.ellipse([w * 0.62, h * 0.16, w * 0.62 + 260, h * 0.16 + 260], fill=gold)
        for i, fx in enumerate((0.30, 0.40)):
            cx = int(w * fx)
            base = int(h * 0.82)
            d.ellipse([cx - 55, base - 260, cx + 55, base - 120], fill=forest)  # head/torso
            d.polygon([(cx - 70, base), (cx + 70, base), (cx + 45, base - 150),
                       (cx - 45, base - 150)], fill=forest)                      # body
        img.save(path, "PNG", dpi=(300, 300))

    def qr_svg(path: Path, target: str):
        factory = qrcode.image.svg.SvgPathImage
        img = qrcode.make(target, image_factory=factory, box_size=10, border=1)
        img.save(str(path))

    token = "demo-token-7fk39ab21"
    base_url = "https://retold.family/f/"

    chapters = []
    ch_meta = [
        ("A Life Rooted in Love",
         "Calabria, 1961 — the lemon grove",
         "I was born in a small house at the edge of the village, where the "
         "hills fell away toward the sea and the lemon trees my father planted "
         "were taller than the roof.\n\n"
         "My mother used to say that a house without noise is a house without "
         "love, and ours was never quiet. There were seven of us, and every "
         "meal was an argument and every argument ended in laughter.\n\n"
         "I did not know then that we were poor. I only knew that the bread was "
         "warm and the door was always open, and that seemed to me like every "
         "kind of riches a person could want.",
         "A house without noise is a house without love."),
        ("Crossing the Water",
         "The passage to America, 1958",
         "When I was seventeen we sold the goats and bought the tickets, and I "
         "stood on the deck of that ship watching the only country I had ever "
         "known slide under the horizon.\n\n"
         "I had one suitcase and my grandmother's ring sewn into the hem of my "
         "coat. For eleven days I was sick and frightened and certain I had made "
         "a terrible mistake. And then one morning there was the harbour, grey "
         "and enormous, and I understood that frightened and hopeful are very "
         "nearly the same feeling.",
         "Frightened and hopeful are very nearly the same feeling."),
        ("The Kitchen on Mulberry Street",
         "Our first restaurant, 1972",
         "We opened the restaurant with money we did not have and a recipe book "
         "that lived entirely in my head. The first winter we nearly lost it "
         "twice.\n\n"
         "But people came back. They came back for the sauce, they said, though "
         "I think really they came back because we remembered their names and we "
         "were glad to see them. That is the whole secret, if you want it: feed "
         "people as if they are family and they will make you a family in return.",
         "Feed people as if they are family, and they will make you a family in return."),
    ]
    for i, (title, caption, prose, pq) in enumerate(ch_meta, start=1):
        illo = assets / f"ch{i}.png"
        qr = assets / f"qr{i}.svg"
        placeholder_illustration(illo, seed=i)
        qr_svg(qr, f"{base_url}{token}#chapter-{i}")
        chapters.append({
            "n": i,
            "title": title,
            "prose": prose,
            "pull_quote": pq,
            "photo_caption": caption,
            "illustration_brief": "warm painterly memory scene, NO photoreal face",
            "illustration_file": f"assets/ch{i}.png",
            "audio_clip": {"source_master": "audio/master.wav",
                           "start_ms": 12000, "end_ms": 59000,
                           "clip_file": f"audio/ch{i}.mp3"},
            "qr_target": f"{base_url}{token}#chapter-{i}",
            "qr_file": f"assets/qr{i}.svg",
        })

    grandchildren = []
    for name in ("Mia", "Luca", "Sofia"):
        qr_svg(assets / f"card-{name.lower()}.svg", f"{base_url}{token}?from={name}")
        grandchildren.append({
            "name": name,
            "card_qr_target": f"{base_url}{token}?from={name}",
            "card_file": f"assets/card-{name.lower()}.pdf",
        })

    page_count = 60
    book = {
        "order_id": "SAMPLE-1001",
        "sku": "book_film",
        "subject": {"name": "Rosa", "relation": "grandmother", "birth_year": 1941},
        "cover": {"title": "The Life of Rosa", "wordmark": "Retold",
                  "spine_title": "The Life of Rosa"},
        "voice_page": {"token": token, "base_url": base_url},
        "chapters": chapters,
        "grandchildren": grandchildren,
        "print": {
            "trim": "8.5x8.5",
            "bleed_in": 0.125,
            "page_count": page_count,
            # Show the Lulu formula in action for the sample:
            "spine_width_in": compute_spine_width(page_count, "80_coated"),
        },
    }
    book_path = sample_dir / "book.json"
    book_path.write_text(json.dumps(book, indent=2), encoding="utf-8")
    return book_path


PREFLIGHT_NOTE = """
RETOLD PDF PREFLIGHT (read before sending to the press)
-------------------------------------------------------
[✓] Page size = trim + 0.125" bleed on all sides (baked into the PDF page box).
[✓] No crop marks in the press file (render(..., marks=True) makes a proof copy).
[✓] Fonts embedded automatically by WeasyPrint. Brand serif = Georgia; a metric
    fallback is used if Georgia is not installed — install it on the prod box.
[✓] Mirrored gutter (0.95") so text clears the binding; outer safe margin 0.75".
[✓] Spine width from Lulu's caliper formula (compute_spine_width) OR the value
    the engine already wrote into book.json['print']['spine_width_in'].
[!] Supply raster illustrations at 300 dpi at final size (>=2550px across an
    8.5" page). QR codes are vector SVG, so they are resolution-independent.
[!] Colour is RGB in this PDF; Lulu/Peecho convert to their press profile. If a
    strict CMYK deliverable is required, post-process with Ghostscript.
""".strip()


# =============================================================================
# CLI
# =============================================================================
def main(argv):
    if len(argv) > 1:
        # Render a real book.json the engine emitted.
        book_json = argv[1]
        render(book_json)
    else:
        # No argument -> build + render the bundled sample (works offline).
        sample_dir = TEMPLATES_DIR / "_sample_out"
        sample_dir.mkdir(parents=True, exist_ok=True)
        print("[render_pdf] No book.json given — building bundled RETOLD sample…")
        book_json = _build_sample(sample_dir)
        render(book_json)
        print(f"[render_pdf] Sample PDFs written next to {book_json}")
    print("\n" + PREFLIGHT_NOTE)


if __name__ == "__main__":
    main(sys.argv)

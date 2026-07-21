# -*- coding: utf-8 -*-
"""
pdf_fallback.py — a tiny, dependency-free PDF writer.

WHY THIS EXISTS
---------------
The "real" beautiful book interior + cover are rendered by the PDF template
component that lives in ../templates. produce.py always tries to use that first.
But so the engine can run END TO END with nothing installed (the Phase-1 --mock
promise), we keep this fallback: a minimal but 100%-valid PDF generator written
in pure Python (no reportlab, no external binaries).

It supports exactly what we need for a legible proof copy:
  * multiple pages
  * a page background fill (for the cream book pages / forest cover)
  * word-wrapped serif text (Times-Roman) and sans body (Helvetica)
  * simple filled rectangles (cover spine block etc.)

The output is a normal PDF you can open in any reader. It is deliberately plain
— it is a stand-in, not the shipping product.
"""

from __future__ import annotations

from pathlib import Path

from common import _hex_to_rgb01

# US-friendly default page = 8.5in square at 72pt/in = 612 x 612 pt.
PT_PER_IN = 72.0


# Map common Unicode punctuation to WinAnsi-safe equivalents so the pure-Python
# proof PDF (which uses latin-1 text) reads cleanly instead of showing "?".
_TRANSLIT = {
    "—": "--", "–": "-",           # em / en dash
    "‘": "'", "’": "'",             # curly single quotes
    "“": '"', "”": '"',             # curly double quotes
    "…": "...", " ": " ",           # ellipsis, nbsp
}


def _esc(text: str) -> str:
    """Escape a string for a PDF literal ( ) string (and transliterate)."""
    for bad, good in _TRANSLIT.items():
        text = text.replace(bad, good)
    return (
        text.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")
    )


def _wrap(text: str, max_chars: int):
    """Very small greedy word-wrap by character count (good enough for a
    proof copy; the real template does proper typography)."""
    out = []
    for paragraph in text.split("\n"):
        if not paragraph.strip():
            out.append("")
            continue
        line = ""
        for word in paragraph.split():
            if len(line) + len(word) + 1 <= max_chars:
                line = f"{line} {word}".strip()
            else:
                out.append(line)
                line = word
        if line:
            out.append(line)
    return out


class _Page:
    def __init__(self, width, height):
        self.width = width
        self.height = height
        self.ops = []  # list of content-stream fragments

    def fill_rect(self, x, y, w, h, hex_color):
        r, g, b = _hex_to_rgb01(hex_color)
        self.ops.append(f"{r:.3f} {g:.3f} {b:.3f} rg")
        self.ops.append(f"{x:.2f} {y:.2f} {w:.2f} {h:.2f} re f")

    def text(self, x, y, text, size=12, font="F1", hex_color="#1F4934"):
        r, g, b = _hex_to_rgb01(hex_color)
        self.ops.append("BT")
        self.ops.append(f"{r:.3f} {g:.3f} {b:.3f} rg")
        self.ops.append(f"/{font} {size} Tf")
        self.ops.append(f"{x:.2f} {y:.2f} Td")
        self.ops.append(f"({_esc(text)}) Tj")
        self.ops.append("ET")

    def paragraph(self, x, top_y, text, size=11, leading=15,
                  font="F1", hex_color="#1F4934", max_chars=70):
        """Draw wrapped text downward from top_y. Returns the y of the next line."""
        y = top_y
        for line in _wrap(text, max_chars):
            if line:
                self.text(x, y, line, size=size, font=font, hex_color=hex_color)
            y -= leading
        return y

    def _stream(self) -> bytes:
        return ("\n".join(self.ops)).encode("latin-1", "replace")


class MiniPDF:
    """Build a small multi-page PDF and write it to disk."""

    def __init__(self, width_in=8.5, height_in=8.5):
        self.width = width_in * PT_PER_IN
        self.height = height_in * PT_PER_IN
        self.pages: list[_Page] = []

    def new_page(self) -> _Page:
        p = _Page(self.width, self.height)
        self.pages.append(p)
        return p

    def save(self, path: str | Path) -> None:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)

        objects: list[bytes] = []

        def add(obj: bytes) -> int:
            objects.append(obj)
            return len(objects)  # 1-based object number

        # Standard fonts (no embedding needed).
        font_times = add(
            b"<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>"
        )
        font_helv = add(
            b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
        )
        font_bold = add(
            b"<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>"
        )

        # We need the Pages object number up front for each Page's /Parent.
        pages_obj_num = len(objects) + 2 * len(self.pages) + 1
        # Layout of remaining objects:
        #   for each page: [content-stream obj][page obj]
        #   then the Pages tree obj
        #   then the Catalog obj
        page_obj_nums = []
        for pg in self.pages:
            stream = pg._stream()
            content = (
                b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n"
                + stream + b"\nendstream"
            )
            content_num = add(content)
            page_dict = (
                "<< /Type /Page /Parent {parent} 0 R "
                "/MediaBox [0 0 {w:.2f} {h:.2f}] "
                "/Resources << /Font << /F1 {ftimes} 0 R /F2 {fhelv} 0 R "
                "/F3 {fbold} 0 R >> >> "
                "/Contents {content} 0 R >>"
            ).format(
                parent=pages_obj_num,
                w=self.width,
                h=self.height,
                ftimes=font_times,
                fhelv=font_helv,
                fbold=font_bold,
                content=content_num,
            ).encode()
            page_num = add(page_dict)
            page_obj_nums.append(page_num)

        kids = " ".join(f"{n} 0 R" for n in page_obj_nums)
        pages_dict = (
            f"<< /Type /Pages /Count {len(page_obj_nums)} /Kids [{kids}] >>"
        ).encode()
        real_pages_num = add(pages_dict)
        assert real_pages_num == pages_obj_num, (
            "PDF object numbering drifted; check MiniPDF.save layout"
        )
        catalog_num = add(
            f"<< /Type /Catalog /Pages {real_pages_num} 0 R >>".encode()
        )

        # ---- assemble file with a correct xref table ----
        out = bytearray()
        out += b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"
        offsets = [0] * (len(objects) + 1)
        for i, obj in enumerate(objects, start=1):
            offsets[i] = len(out)
            out += f"{i} 0 obj\n".encode() + obj + b"\nendobj\n"

        xref_pos = len(out)
        n = len(objects) + 1
        out += f"xref\n0 {n}\n".encode()
        out += b"0000000000 65535 f \n"
        for i in range(1, n):
            out += f"{offsets[i]:010d} 00000 n \n".encode()
        out += (
            b"trailer\n<< /Size " + str(n).encode()
            + b" /Root " + str(catalog_num).encode() + b" 0 R >>\n"
            + b"startxref\n" + str(xref_pos).encode() + b"\n%%EOF"
        )

        path.write_bytes(bytes(out))


# ---------------------------------------------------------------------------
# The two fallback documents produce.py asks for.
# ---------------------------------------------------------------------------
def render_interior_pdf(book: dict, out_path: str | Path) -> None:
    """A legible proof interior: title page + one page per chapter."""
    trim = (book.get("print") or {}).get("trim", "8.5x8.5")
    try:
        w_in, h_in = (float(x) for x in trim.lower().split("x"))
    except Exception:
        w_in, h_in = 8.5, 8.5

    pdf = MiniPDF(w_in, h_in)
    cream = "#F4EDDB"
    forest = "#1F4934"
    gold = "#C7A44B"

    # --- title page ---
    p = pdf.new_page()
    p.fill_rect(0, 0, pdf.width, pdf.height, cream)
    cover = book.get("cover", {})
    p.text(pdf.width * 0.12, pdf.height * 0.62,
           cover.get("wordmark", "Retold"), size=20, font="F2", hex_color=gold)
    p.paragraph(pdf.width * 0.12, pdf.height * 0.55,
                cover.get("title", "A Life"), size=30, leading=34,
                font="F3", hex_color=forest, max_chars=22)
    subj = book.get("subject", {})
    if subj:
        line = f"{subj.get('name','')} — {subj.get('relation','')}"
        p.text(pdf.width * 0.12, pdf.height * 0.30, line,
               size=13, font="F1", hex_color=forest)

    # --- chapter pages ---
    for ch in book.get("chapters", []):
        p = pdf.new_page()
        p.fill_rect(0, 0, pdf.width, pdf.height, cream)
        margin = pdf.width * 0.12
        p.text(margin, pdf.height - margin,
               f"Chapter {ch.get('n','')}", size=11, font="F2", hex_color=gold)
        y = pdf.height - margin - 26
        p.paragraph(margin, y, ch.get("title", ""), size=20, leading=24,
                    font="F3", hex_color=forest, max_chars=32)
        y -= 34
        prose = ch.get("prose", "")
        # cap prose on the proof page so it doesn't overflow
        p.paragraph(margin, y, prose[:1600], size=10.5, leading=14,
                    font="F1", hex_color="#20301f", max_chars=78)
        pq = ch.get("pull_quote")
        if pq:
            p.paragraph(margin, margin + 20, f"“{pq}”",
                        size=12, leading=16, font="F3", hex_color=gold,
                        max_chars=60)

    pdf.save(out_path)


def render_cover_pdf(book: dict, out_path: str | Path) -> None:
    """A single wrap cover: back | spine | front, forest with gold wordmark."""
    print_meta = book.get("print", {})
    try:
        w_in, h_in = (float(x) for x in print_meta.get("trim", "8.5x8.5").lower().split("x"))
    except Exception:
        w_in, h_in = 8.5, 8.5
    spine = float(print_meta.get("spine_width_in", 0.35))
    bleed = float(print_meta.get("bleed_in", 0.125))

    full_w = w_in * 2 + spine + bleed * 2
    full_h = h_in + bleed * 2
    pdf = MiniPDF(full_w, full_h)
    forest = "#1F4934"
    gold = "#C7A44B"
    cream = "#F4EDDB"

    p = pdf.new_page()
    p.fill_rect(0, 0, pdf.width, pdf.height, forest)

    cover = book.get("cover", {})
    front_left_in = bleed + w_in + spine
    front_left = front_left_in * 72.0
    # wordmark
    p.text(front_left + w_in * 72 * 0.12, pdf.height * 0.75,
           cover.get("wordmark", "Retold"), size=20, font="F2", hex_color=gold)
    p.paragraph(front_left + w_in * 72 * 0.12, pdf.height * 0.66,
                cover.get("title", "A Life"), size=30, leading=34,
                font="F3", hex_color=cream, max_chars=20)

    # spine
    spine_x = (bleed + w_in) * 72 + (spine * 72) / 2 - 5
    p.text(spine_x, pdf.height * 0.42,
           cover.get("spine_title", ""), size=10, font="F3", hex_color=gold)

    pdf.save(out_path)

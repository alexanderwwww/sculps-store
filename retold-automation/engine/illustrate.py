# -*- coding: utf-8 -*-
"""
illustrate.py — paint one warm memory illustration per chapter.

REAL MODE (FAL_KEY present, not --mock):
    Uses FLUX via fal.ai. We first render ONE "style anchor" image that defines
    the book's painterly look, then generate every chapter scene referencing
    that same style so the whole book feels like one artist made it. Every
    prompt is wrapped with strict NO-PHOTOREAL-FACE discipline. Failed renders
    auto-retry a few times.

MOCK MODE (--mock or no key):
    Writes solid-colour placeholder PNGs (brand cream/forest/gold, with the
    chapter number) so the engine produces a complete, openable proof book with
    zero API keys and no image model.

HONESTY RULE: illustrations must NEVER render a photoreal real face. The style
anchor and every scene prompt enforce "figures from behind / at a distance /
stylised", and we append a hard negative-prompt guard.
"""

from __future__ import annotations

import time
from pathlib import Path

from common import env, log, CREAM, FOREST, GOLD

# The single style that ties the whole book together.
STYLE_ANCHOR = (
    "warm painterly memory illustration, soft golden-hour light, gentle "
    "impressionistic brushwork, muted cream and forest-green and gold palette, "
    "nostalgic storybook feeling, no text"
)

# Hard guard appended to every prompt. This is the honesty rule in code.
NO_FACE_GUARD = (
    "figures shown from behind, at a distance, or stylised; faces never clearly "
    "visible; absolutely no photorealistic human face"
)
NEGATIVE = (
    "photorealistic face, close-up face, portrait, recognizable person, "
    "identifiable face, text, watermark, logo, deformed"
)

FAL_MODEL = "fal-ai/flux/dev"
MAX_RETRIES = 3


def illustrate(book: dict, out_dir: Path, mock: bool = False) -> None:
    """Render assets/style_anchor.png + assets/ch{n}.png for every chapter."""
    assets = out_dir / "assets"
    assets.mkdir(parents=True, exist_ok=True)

    if mock or not env("FAL_KEY"):
        _mock_illustrations(book, assets)
        return

    _fal_illustrations(book, assets)


# ---------------------------------------------------------------------------
# MOCK: solid-colour placeholders (PIL if available, else raw PNG bytes)
# ---------------------------------------------------------------------------
def _mock_illustrations(book: dict, assets: Path) -> None:
    palette = [CREAM, FOREST, GOLD]
    _placeholder_png(assets / "style_anchor.png", FOREST, "STYLE ANCHOR")
    for ch in book.get("chapters", []):
        color = palette[(ch["n"] - 1) % len(palette)]
        _placeholder_png(assets / f"ch{ch['n']}.png", color, f"Ch {ch['n']}")
    log(f"Illustrations (MOCK): wrote {len(book.get('chapters', []))} placeholders.")


def _placeholder_png(path: Path, hex_color: str, label: str) -> None:
    try:
        from PIL import Image, ImageDraw

        img = Image.new("RGB", (1024, 1024), hex_color)
        d = ImageDraw.Draw(img)
        # readable label colour = cream on dark, forest on light
        text_color = CREAM if hex_color in (FOREST,) else FOREST
        d.rectangle([40, 40, 984, 984], outline=text_color, width=6)
        d.text((70, 70), f"RETOLD placeholder\n{label}", fill=text_color)
        img.save(path)
    except Exception:
        # Absolute fallback: a valid 1x1 PNG of the chosen colour.
        path.write_bytes(_one_px_png(hex_color))


def _one_px_png(hex_color: str) -> bytes:
    """Return a minimal valid 1x1 PNG in the given colour (no PIL needed)."""
    import struct
    import zlib

    h = hex_color.lstrip("#")
    r, g, b = (int(h[i : i + 2], 16) for i in (0, 2, 4))

    def chunk(typ: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data)) + typ + data
            + struct.pack(">I", zlib.crc32(typ + data) & 0xFFFFFFFF)
        )

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)  # 1x1, 8-bit RGB
    raw = b"\x00" + bytes((r, g, b))  # filter byte + pixel
    idat = zlib.compress(raw)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


# ---------------------------------------------------------------------------
# REAL: FLUX via fal.ai
# ---------------------------------------------------------------------------
def _fal_illustrations(book: dict, assets: Path) -> None:
    import requests  # lazy

    key = env("FAL_KEY")

    # 1) style anchor — establishes the look every scene will echo.
    log("Illustrations: rendering the style anchor (book look)...")
    anchor_prompt = (
        f"{STYLE_ANCHOR}. A quiet establishing scene: an old family home at "
        f"golden hour. {NO_FACE_GUARD}."
    )
    _fal_one(requests, key, anchor_prompt, assets / "style_anchor.png")

    # 2) each chapter, echoing the anchor style.
    for ch in book.get("chapters", []):
        brief = ch.get("illustration_brief", "a warm memory scene")
        prompt = (
            f"{STYLE_ANCHOR}. {brief}. Consistent with the book's established "
            f"painterly style. {NO_FACE_GUARD}."
        )
        out = assets / f"ch{ch['n']}.png"
        log(f"Illustrations: chapter {ch['n']} — {ch.get('title','')[:40]}")
        _fal_one(requests, key, prompt, out)


def _fal_one(requests, key: str, prompt: str, out_path: Path) -> None:
    """Submit one FLUX render with auto-retry, then download the PNG."""
    headers = {"Authorization": f"Key {key}", "Content-Type": "application/json"}
    payload = {
        "prompt": prompt,
        "image_size": "square_hd",
        "num_images": 1,
        "enable_safety_checker": True,
        # FLUX supports a negative-ish steer via prompt; we also pass it plainly.
        "negative_prompt": NEGATIVE,
    }

    last_err = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            r = requests.post(
                f"https://fal.run/{FAL_MODEL}",
                headers=headers,
                json=payload,
                timeout=180,
            )
            r.raise_for_status()
            data = r.json()
            url = data["images"][0]["url"]
            img = requests.get(url, timeout=180)
            img.raise_for_status()
            out_path.write_bytes(img.content)
            return
        except Exception as e:  # pragma: no cover - network
            last_err = e
            log(f"  render attempt {attempt}/{MAX_RETRIES} failed: {e}", "WARN")
            time.sleep(2 * attempt)

    # Never leave a hole in the book — drop in a brand placeholder and warn.
    log(f"  giving up on {out_path.name}; writing placeholder. ({last_err})", "ERROR")
    _placeholder_png(out_path, FOREST, out_path.stem)

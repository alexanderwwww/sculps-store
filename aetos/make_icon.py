"""Generate icon.ico / icon.png — glassy X on a dark squircle (Pillow).
If the user drops their own icon.png in this folder, we convert that instead."""

import os
import sys

BASE = os.path.dirname(os.path.abspath(__file__))

try:
    from PIL import Image, ImageDraw, ImageFilter
except Exception:
    print("[icon] Pillow missing — skipping icon (app works fine without it)")
    sys.exit(0)


def rounded_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m


def build(size=512):
    custom = os.path.join(BASE, "icon.png")
    if os.path.exists(custom):
        try:
            img = Image.open(custom).convert("RGBA").resize((size, size))
            return img
        except Exception:
            pass

    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    # background: deep blue->violet vertical gradient inside a squircle
    bg = Image.new("RGBA", (size, size))
    for y in range(size):
        t = y / size
        r = int(10 + 70 * t)
        g = int(12 + 20 * t)
        b = int(38 + 140 * t)
        for_row = Image.new("RGBA", (size, 1), (r, g, b, 255))
        bg.paste(for_row, (0, y))
    mask = rounded_mask(size, size // 4)
    img.paste(bg, (0, 0), mask)

    # glassy X
    x = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(x)
    w = size // 7
    pad = size // 5
    d.line([(pad, pad), (size - pad, size - pad)], fill=(210, 235, 255, 235), width=w)
    d.line([(size - pad, pad), (pad, size - pad)], fill=(140, 200, 255, 235), width=w)
    glow = x.filter(ImageFilter.GaussianBlur(size // 28))
    img.alpha_composite(glow)
    img.alpha_composite(x)

    # top gloss
    gloss = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(gloss)
    gd.ellipse([-size * 0.2, -size * 0.55, size * 1.2, size * 0.45], fill=(255, 255, 255, 26))
    img.alpha_composite(Image.composite(gloss, Image.new("RGBA", (size, size), (0, 0, 0, 0)), mask))
    return img


def main():
    img = build(512)
    png = os.path.join(BASE, "icon_app.png")
    ico = os.path.join(BASE, "icon.ico")
    img.save(png)
    img.save(ico, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print(f"[icon] wrote {ico}")


if __name__ == "__main__":
    main()

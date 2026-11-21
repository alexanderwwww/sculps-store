"""Draws the supercomputer icon: a dark glass tile with a blue price line running into a dot.
    python3 design/icon.py <outDir>"""
import sys, os
from PIL import Image, ImageDraw, ImageFilter

out = sys.argv[1]; os.makedirs(out, exist_ok=True)
S = 1024
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
# tile with a soft vertical gradient
tile = Image.new("RGBA", (S, S))
g = ImageDraw.Draw(tile)
for y in range(S):
    k = y / S
    g.line([(0, y), (S, y)], fill=(int(44 - 22 * k), int(46 - 22 * k), int(54 - 26 * k), 255))
mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.225), fill=255)
img.paste(tile, (0, 0), mask)
d = ImageDraw.Draw(img)
d.rounded_rectangle([3, 3, S - 4, S - 4], radius=int(S * 0.225), outline=(255, 255, 255, 40), width=6)
# the line: a calm rise with one dip, ending in the "now" dot
pts = [(150, 700), (260, 640), (360, 680), (470, 560), (560, 600), (660, 450), (760, 400), (840, 330)]
def smooth(p, n=24):
    res = []
    for i in range(len(p) - 1):
        p0, p1, p2, p3 = p[max(0, i - 1)], p[i], p[i + 1], p[min(len(p) - 1, i + 2)]
        for t in [j / n for j in range(n)]:
            t2, t3 = t * t, t * t * t
            res.append(tuple(0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3) for k in (0, 1)))
    res.append(p[-1]); return res
line = smooth(pts)
glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
ImageDraw.Draw(glow).line(line, fill=(10, 132, 255, 150), width=70, joint="curve")
glow = glow.filter(ImageFilter.GaussianBlur(40))
img = Image.alpha_composite(img, Image.composite(glow, Image.new("RGBA", (S, S), (0, 0, 0, 0)), mask))
d = ImageDraw.Draw(img)
dense = smooth(pts, 200)
for x, y in dense: d.ellipse([x - 32, y - 32, x + 32, y + 32], fill=(10, 132, 255, 255))
for x, y in [line[0]]:
    d.ellipse([x - 32, y - 32, x + 32, y + 32], fill=(10, 132, 255, 255))
x, y = pts[-1]
d.ellipse([x - 70, y - 70, x + 70, y + 70], fill=(255, 255, 255, 255))
d.ellipse([x - 44, y - 44, x + 44, y + 44], fill=(10, 132, 255, 255))
for n in (16, 32, 48, 128):
    img.resize((n, n), Image.LANCZOS).save(os.path.join(out, f"icon-{n}.png"))
img.resize((256, 256), Image.LANCZOS).save(os.path.join(out, "icon-preview.png"))
print("icons ->", out)

#!/usr/bin/env python3
"""Burn the captions onto the finished clip. Env CAPTIONS = [{"text","start","end","pos"}].
The video model cannot draw reliable text, so text is always added here, after the picture exists.
Each caption is drawn as a transparent PNG with Pillow and laid over the video with ffmpeg's overlay
filter (which every ffmpeg has; drawtext needs freetype and is missing from some builds)."""
import json, os, subprocess, sys, textwrap
from PIL import Image, ImageDraw, ImageFont

clip, height, width = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]) if len(sys.argv) > 3 else 0
caps = json.loads(os.environ["CAPTIONS"])
FONTS = ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf")
fp = next((f for f in FONTS if os.path.exists(f)), None)
size = max(24, int(height * 0.034))
font = ImageFont.truetype(fp, size) if fp else ImageFont.load_default()
tmp = os.path.dirname(clip) or "."
maxw = int((width or height * 0.55) * 0.86)
pngs = []
for i, c in enumerate(caps):
    words, lines, cur = str(c["text"]).split(), [], ""
    probe = ImageDraw.Draw(Image.new("RGBA", (10, 10)))
    for w in words:
        t = (cur + " " + w).strip()
        if probe.textlength(t, font=font) <= maxw or not cur: cur = t
        else: lines.append(cur); cur = w
    lines.append(cur)
    pad, gap = int(size * 0.5), int(size * 0.25)
    wmax = max(int(probe.textlength(l, font=font)) for l in lines)
    img = Image.new("RGBA", (wmax + pad * 2, len(lines) * (size + gap) + pad * 2 - gap), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    news = str(c["text"]).upper().startswith("BREAKING")
    d.rounded_rectangle([0, 0, img.width - 1, img.height - 1], radius=int(size * 0.25), fill=(214, 0, 0, 245) if news else (0, 0, 0, 158))
    for k, l in enumerate(lines):
        lw = d.textlength(l, font=font)
        d.text(((img.width - lw) / 2, pad + k * (size + gap)), l, font=font, fill=(255, 255, 255, 255))
    p = os.path.join(tmp, f"cap{i}.png"); img.save(p); pngs.append(p)
ffmpeg = os.environ.get("FFMPEG", "ffmpeg")
args, chain, prev = [ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", clip], [], "0:v"
for i, (c, p) in enumerate(zip(caps, pngs)):
    args += ["-i", p]
    y = "H*0.68" if c.get("pos") == "bottom" else "H*0.13"
    nxt = f"v{i}"
    chain.append(f"[{prev}][{i + 1}:v]overlay=x=(W-w)/2:y={y}:enable='between(t,{float(c['start'])},{float(c['end'])})'[{nxt}]")
    prev = nxt
out = clip + ".cap.mp4"
args += ["-filter_complex", ";".join(chain), "-map", f"[{prev}]", "-map", "0:a?", "-c:v", "libx264", "-crf", "17", "-preset", "fast", "-pix_fmt", "yuv420p", "-c:a", "copy", out]
subprocess.run(args, check=True)
os.replace(out, clip)
print("captions burned:", len(caps))

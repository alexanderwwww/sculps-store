/**
 * The app's mark, built by hand.
 *
 * macOS builds an .icns with `iconutil`, which does not exist on Linux — so
 * this writes the container itself: the magic, a big-endian total length, and
 * then one typed chunk per size, each a whole PNG. Apple's own tools read it
 * back without complaint because that is all an .icns is.
 *
 * The source art is squared and inset by 10% first. Apple's icon grid expects
 * that margin; without it the icon sits fat and crowded next to every other
 * thing in the Dock, which is the tell of an icon somebody made themselves.
 *
 * Usage: node make-icon.mjs <source.png> [out.icns]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const source = process.argv[2];
const out = process.argv[3] || "app/Flip.app/Contents/Resources/AppIcon.icns";
if (!source) {
  console.error("usage: node make-icon.mjs <source.png> [out.icns]");
  process.exit(1);
}

/* The types Apple reads, largest first. Retina variants carry the same pixels
   as the size above them, which is exactly what iconutil produces. */
const SIZES = [
  ["ic10", 1024], // 512@2x
  ["ic14", 512],  // 256@2x
  ["ic13", 256],  // 128@2x
  ["ic12", 64],   // 32@2x
  ["ic11", 32],   // 16@2x
  ["ic09", 512],
  ["ic08", 256],
  ["ic07", 128],
  ["icp5", 32],
  ["icp4", 16],
];

const wanted = [...new Set(SIZES.map(([, px]) => px))];
const made = new Map();
for (const px of wanted) {
  const file = `/tmp/flip-icon-${px}.png`;
  execFileSync("python3", ["-c", `
from PIL import Image, ImageDraw, ImageFilter
px = ${px}
src = Image.open(${JSON.stringify(source)}).convert("RGBA")

# Square on the bounding box, so the tag is centred on what is actually drawn
# rather than on whatever transparent space the export left around it.
box = src.getbbox() or (0, 0, src.width, src.height)
art = src.crop(box)
side = max(art.size)
square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
square.paste(art, ((side - art.width) // 2, (side - art.height) // 2))

# A white squircle, at Apple's own proportion: the rounded body fills about
# 82% of the canvas and the rest is the margin the icon grid expects. Drawn at
# 4x and scaled down, because a rounded corner drawn straight at 16px is a
# staircase.
S = 4
body = round(px * 0.82) * S
radius = round(body * 0.225)   # macOS corner, not iOS's rounder one
plate = Image.new("RGBA", (body, body), (0, 0, 0, 0))
ImageDraw.Draw(plate).rounded_rectangle([0, 0, body - 1, body - 1], radius=radius, fill=(255, 255, 255, 255))

# The tag sits inside the white, not on top of the whole canvas.
inner = round(body * 0.74)
glass = square.resize((inner, inner), Image.LANCZOS)
plate.alpha_composite(glass, ((body - inner) // 2, (body - inner) // 2))
plate = plate.resize((round(px * 0.82), round(px * 0.82)), Image.LANCZOS)

canvas = Image.new("RGBA", (px, px), (0, 0, 0, 0))
# A soft drop shadow, so a white plate does not disappear into a light Dock.
if px >= 64:
    shade = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shade)
    off = max(1, round(px * 0.018))
    pad = (px - plate.width) // 2
    sd.rounded_rectangle(
        [pad, pad + off, pad + plate.width - 1, pad + off + plate.height - 1],
        radius=round(plate.width * 0.225), fill=(0, 0, 0, 64))
    canvas.alpha_composite(shade.filter(ImageFilter.GaussianBlur(max(1, px * 0.012))))

canvas.alpha_composite(plate, ((px - plate.width) // 2, (px - plate.height) // 2))
canvas.save("/tmp/flip-icon-" + str(px) + ".png")
`]);
  made.set(px, readFileSync(file));
}

const chunks = [];
for (const [type, px] of SIZES) {
  const png = made.get(px);
  const header = Buffer.alloc(8);
  header.write(type, 0, 4, "ascii");
  header.writeUInt32BE(png.length + 8, 4);
  chunks.push(header, png);
}

const body = Buffer.concat(chunks);
const head = Buffer.alloc(8);
head.write("icns", 0, 4, "ascii");
head.writeUInt32BE(body.length + 8, 4);
writeFileSync(out, Buffer.concat([head, body]));
console.log(`  ok  ${out}  ${(body.length / 1024 / 1024).toFixed(2)}MB, ${SIZES.length} entries`);

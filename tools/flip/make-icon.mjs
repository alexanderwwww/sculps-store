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
from PIL import Image
src = Image.open(${JSON.stringify(source)}).convert("RGBA")
# Square it on its own bounding box, so the art is centred on what is actually
# drawn rather than on whatever transparent space the export left around it.
box = src.getbbox() or (0, 0, src.width, src.height)
art = src.crop(box)
side = max(art.size)
square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
square.paste(art, ((side - art.width) // 2, (side - art.height) // 2))
# Apple's 10% margin.
px = ${px}
inner = round(px * 0.80)
square = square.resize((inner, inner), Image.LANCZOS)
canvas = Image.new("RGBA", (px, px), (0, 0, 0, 0))
canvas.paste(square, ((px - inner) // 2, (px - inner) // 2))
canvas.save(${JSON.stringify("/tmp/flip-icon-")} + str(px) + ".png")
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

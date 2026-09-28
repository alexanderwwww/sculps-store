/**
 * The app's mark, written as a real .icns.
 *
 * macOS builds these with `iconutil`, which does not exist here — so this
 * writes the container itself. An .icns is nothing but a magic word, a
 * big-endian total length, and then one typed chunk per size, each holding a
 * whole PNG. Apple's own tools read it back without complaint.
 *
 * The source is squared and inset by 10% first. Apple's icon grid expects that
 * margin, and without it the icon sits fat and crowded next to everything else
 * in the Dock — the tell of an icon somebody made themselves.
 *
 * Transparency is kept. plug's mark is a piece of glass and the holes in it are
 * the point; flattening them onto white would make it a sticker.
 *
 * Usage: node make-icon.mjs <source.png> [out.icns]
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const source = process.argv[2];
const out = process.argv[3] || "app/Plug.app/Contents/Resources/AppIcon.icns";
if (!source) {
  console.error("usage: node make-icon.mjs <source.png> [out.icns]");
  process.exit(1);
}

/*
 * The types Apple reads, largest first.
 *
 * The retina entries carry the same pixels as the size above them, which is
 * exactly what iconutil produces — ic14 is 256@2x, so it is a 512 image.
 */
const SIZES = [
  ["ic10", 1024], // 512@2x
  ["ic14", 512],  // 256@2x
  ["ic13", 256],  // 128@2x
  ["ic09", 512],
  ["ic08", 256],
  ["ic07", 128],
  ["ic12", 64],   // 32@2x
  ["ic11", 32],   // 16@2x
];

const work = mkdtempSync(join(tmpdir(), "icns-"));

/*
 * Square it, inset it, and resize — in Pillow, because it is here and it keeps
 * the alpha channel. LANCZOS on the way down: a glass mark resized with a
 * cheaper filter comes out with stair-stepped highlights at 32 points, which is
 * the size that decides whether an icon looks made or bought.
 */
const script = `
import sys
from PIL import Image

src, work = sys.argv[1], sys.argv[2]
sizes = [int(n) for n in sys.argv[3:]]

im = Image.open(src).convert("RGBA")
w, h = im.size
side = max(w, h)
square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
square.paste(im, ((side - w) // 2, (side - h) // 2))

# Apple's margin: the art fills 80% of the tile, centred.
for n in sorted(set(sizes), reverse=True):
    art = round(n * 0.8)
    tile = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    tile.paste(square.resize((art, art), Image.LANCZOS), ((n - art) // 2, (n - art) // 2))
    tile.save(f"{work}/{n}.png")
print("sized", ", ".join(str(n) for n in sorted(set(sizes), reverse=True)))
`;

console.log(execFileSync("python3", ["-c", script, source, work, ...SIZES.map(([, n]) => String(n))])
  .toString().trim());

/** One chunk: four ASCII bytes of type, a length that includes its own header, the PNG. */
function chunk(type, png) {
  const head = Buffer.alloc(8);
  head.write(type, 0, 4, "ascii");
  head.writeUInt32BE(png.length + 8, 4);
  return Buffer.concat([head, png]);
}

const chunks = SIZES.map(([type, n]) => chunk(type, readFileSync(`${work}/${n}.png`)));
const body = Buffer.concat(chunks);
const header = Buffer.alloc(8);
header.write("icns", 0, 4, "ascii");
header.writeUInt32BE(body.length + 8, 4);
writeFileSync(out, Buffer.concat([header, body]));
rmSync(work, { recursive: true, force: true });

console.log(`wrote ${out}  (${SIZES.length} sizes, ${(body.length / 1024).toFixed(0)}K)`);

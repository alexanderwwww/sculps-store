/**
 * Mysterious Archive photo ad: every in-stock piece on one white picture with the logo.
 * Uses the cropped catalogue thumbnails (scripts/ma-thumbs.mjs makes them).
 * Run: node scripts/ma-ad.mjs [out.png]     Needs DATABASE_URL and ImageMagick (convert, montage).
 * 4:5 feed size 2160x2700; 6 columns; logo on top; one quiet line at the bottom. No prices, no codes.
 */
import { neon } from "@neondatabase/serverless";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const OUT = process.argv[2] || "design/mysterious-archive/ads/all-pieces-4x5.png";
const BASE = "https://mysteriousarchive.com";
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`select p.handle, p.title, p.images->0->>'thumb' as thumb, p.images->0->>'url' as url, v.available, v.label from products p join variants v on v.product_id=p.id and v.is_default join stores s on s.id=p.store_id where s.slug='mysterious-archive' and p.status='active' order by p.created_at`;
const isBag = (t) => /\bbag|tote|pouch|backpack|clutch|duffle|duffel|crossbody/i.test(t);
const isClothing = (t) => !isBag(t) && !/beanie|\bhat\b|\bcap\b|trucker/i.test(t) && /hoodie|sweatshirt|henley|t-shirt|\btee\b|shirt|knit|sweater|cardigan|blazer|jacket|coat|dress|skirt|trouser|pants|jeans|shorts/i.test(t);
const items = rows.filter((x) => !isBag(x.title) && !isClothing(x.title) && x.available > 0 && !/not for sale/i.test(x.label || ""));
const dir = mkdtempSync(path.join(tmpdir(), "ma-ad-"));
const COLS = 6, W = 2160, H = 2700, CELL_W = 330, CELL_H = 326, GRID_X = 90, GRID_Y = 540;
const files = [];
for (const it of items) {
  const src = it.thumb || it.url;
  const res = await fetch(src.startsWith("http") ? src : BASE + src);
  const f = path.join(dir, it.handle + ".in"), g = path.join(dir, it.handle + ".png");
  writeFileSync(f, Buffer.from(await res.arrayBuffer()));
  execFileSync("convert", [f, "-background", "white", "-alpha", "remove", "-alpha", "off", "-fuzz", "5%", "-trim", "+repage", "-resize", "296x290", "-background", "white", "-gravity", "center", "-extent", `${CELL_W}x${CELL_H}`, g]);
  files.push(g);
}
const rowsN = Math.ceil(files.length / COLS);
const grid = path.join(dir, "grid.png");
execFileSync("montage", [...files, "-tile", `${COLS}x${rowsN}`, "-geometry", `${CELL_W}x${CELL_H}+0+0`, "-background", "white", grid]);
execFileSync("convert", ["-size", `${W}x${H}`, "xc:white",
  grid, "-geometry", `+${GRID_X}+${GRID_Y}`, "-composite",
  "(", "sites/mysterious-archive/assets/logo_black.png", "-background", "white", "-alpha", "remove", "-alpha", "off", "-trim", "+repage", "-resize", "1180x", ")", "-gravity", "north", "-geometry", "+0+150", "-composite",
  "-gravity", "south", "-font", "Liberation-Sans", "-pointsize", "34", "-kerning", "7", "-fill", "#777777", "-annotate", "+0+95", "CHROME HEARTS   ·   AUTHENTICATED   ·   MYSTERIOUSARCHIVE.COM",
  "-colorspace", "sRGB", OUT]);
console.log("pieces in the ad:", files.length, "->", OUT);

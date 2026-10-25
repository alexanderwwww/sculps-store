/**
 * Mysterious Archive catalogue thumbnails.
 *
 * For every active product whose first photo has no `thumb` yet: download the
 * cover, cut away the empty white around the piece, scale it to fill about 88%
 * of a 4:5 white tile, save it as webp in R2 (gardenbuddy-media, served at
 * /media/<key>) and write the URL to products.images[0].thumb. The product page
 * gallery keeps the original photos; only the catalogue cards use the thumb.
 *
 * Run: node scripts/ma-thumbs.mjs            (new products only)
 *      node scripts/ma-thumbs.mjs --all      (redo every product)
 * Needs DATABASE_URL, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID and ImageMagick (convert).
 */
import { neon } from "@neondatabase/serverless";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";

const BASE = process.env.MA_BASE || "https://mysteriousarchive.com";
const all = process.argv.includes("--all");
const sql = neon(process.env.DATABASE_URL);
const dir = mkdtempSync(path.join(tmpdir(), "ma-thumbs-"));
const rows = await sql`select p.id, p.handle, p.images from products p join stores s on s.id=p.store_id where s.slug='mysterious-archive' and p.status='active'`;
let done = 0;
for (const r of rows) {
  const first = r.images?.[0];
  if (!first?.url || (first.thumb && !all)) continue;
  const src = first.url.startsWith("http") ? first.url : BASE + first.url;
  const res = await fetch(src);
  if (!res.ok) { console.log("skip", r.handle, res.status); continue; }
  const inFile = path.join(dir, r.handle + ".in"), outFile = path.join(dir, r.handle + ".webp");
  writeFileSync(inFile, Buffer.from(await res.arrayBuffer()));
  // flatten any transparency onto white, trim the white margin, fit into 880x1100 on a 1000x1250 white tile
  execFileSync("convert", [inFile, "-background", "white", "-alpha", "remove", "-alpha", "off", "-fuzz", "5%", "-trim", "+repage",
    "-resize", "880x1100", "-background", "white", "-gravity", "center", "-extent", "1000x1250", "-quality", "86", outFile]);
  const hash = createHash("sha1").update(readFileSync(outFile)).digest("hex").slice(0, 8);
  const key = `ma-t-${r.handle}-${hash}.webp`;
  execFileSync("npx", ["wrangler", "r2", "object", "put", `gardenbuddy-media/${key}`, "--file", outFile, "--content-type", "image/webp", "--remote"], { stdio: "pipe" });
  const check = await fetch(`${BASE}/media/${key}`);
  if (!check.ok) { console.log("NOT SERVED", key, check.status); continue; }
  await sql`update products set images = jsonb_set(images, '{0,thumb}', to_jsonb(${"/media/" + key}::text)) where id=${r.id}`;
  done++;
  console.log("ok", r.handle, key);
}
console.log("thumbnails made:", done);

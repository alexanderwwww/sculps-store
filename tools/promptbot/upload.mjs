/**
 * Puts a folder of images into the store's media library.
 *
 * Saves them to R2 under a readable key, registers each one in the media
 * table so the admin's picker can see it, and prints the /media path to drop
 * into a section. Re-running with the same prefix overwrites rather than
 * piling up copies.
 *
 * Run it from the repo root with .dev.vars loaded:
 *   set -a; . ./.dev.vars; set +a
 *   node tools/promptbot/upload.mjs --dir ./images --store reaper --prefix scream
 */
import { neon } from "@neondatabase/serverless";
import { readdir, readFile, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join, extname } from "node:path";

const run = promisify(execFile);
const BUCKET = "gardenbuddy-media";
const TYPES = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

const opt = { dir: "./images", store: "reaper", prefix: "img" };
for (let i = 2; i < process.argv.length; i += 2) opt[process.argv[i].slice(2)] = process.argv[i + 1];

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL isn't set. Run `set -a; . ./.dev.vars; set +a` first.");
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);
const [store] = await sql`select id, slug from stores where slug = ${opt.store}`;
if (!store) { console.error(`No store with slug "${opt.store}".`); process.exit(1); }

const files = (await readdir(opt.dir)).filter((f) => TYPES[extname(f).toLowerCase()]).sort();
if (!files.length) { console.error(`No images in ${opt.dir}.`); process.exit(1); }

/** PNG and WebP both carry their size in the first few dozen bytes. */
function dimensions(buf) {
  if (buf.slice(1, 4).toString() === "PNG") return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf.slice(0, 4).toString() === "RIFF" && buf.slice(8, 12).toString() === "WEBP" && buf.slice(12, 16).toString() === "VP8X")
    return { w: buf.readUIntLE(24, 3) + 1, h: buf.readUIntLE(27, 3) + 1 };
  return { w: null, h: null };
}

let n = 0;
for (const file of files) {
  n++;
  const path = join(opt.dir, file);
  const ext = extname(file).toLowerCase();
  const key = `${opt.prefix}-${String(n).padStart(2, "0")}${ext}`;
  const buf = await readFile(path);
  const { size } = await stat(path);

  await run("npx", ["wrangler", "r2", "object", "put", `${BUCKET}/${key}`,
    `--file=${path}`, `--content-type=${TYPES[ext]}`, "--remote"], { env: process.env });

  const { w, h } = dimensions(buf);
  await sql`insert into media (store_id, key, filename, mime, size_bytes, width, height)
    values (${store.id}, ${key}, ${file}, ${TYPES[ext]}, ${size}, ${w}, ${h})
    on conflict (key) do update set size_bytes = excluded.size_bytes,
      width = excluded.width, height = excluded.height`;

  console.log(`/media/${key}`);
}
console.log(`\n${n} image${n === 1 ? "" : "s"} in ${store.slug}'s media library.`);

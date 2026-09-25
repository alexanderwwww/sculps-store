/**
 * Take a Magic Wand run and put it on the cryo page.
 *
 * The wand saves pictures on Alex's Mac and uploads them to the Worker under a
 * job name. This fetches that run, writes each picture into the media bucket in
 * the three sizes the storefront asks for (original, -w640, -t200 — the missing
 * derivatives are what made the thumbnails 404 last time), records it in the
 * media table, and then points the right block at it.
 *
 * Nothing is invented: a slot whose shot did not come back is left empty, which
 * on this storefront draws nothing at all rather than a grey box.
 */
import { neon } from "@neondatabase/serverless";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

const ROOT = "/home/user/sculps-store";
const env = Object.fromEntries(
  fs.readFileSync(`${ROOT}/.dev.vars`, "utf8").split("\n").filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]),
);
const sql = neon(env.DATABASE_URL);
const BUCKET = "gardenbuddy-media";

/** Where each prompt in the run belongs. Index is the prompt number, 1-based. */
const PLAN = {
  1:  { where: "showcase", at: 0, title: "cryo — brushed aluminium, clear dome lid" },
  2:  { where: "showcase", at: 1, title: "The whole silhouette — it is a lunchbox on its side" },
  3:  { where: "showcase", at: 2, title: "A bottle on the rollers, under the dome" },
  4:  { where: "showcase", at: 3, title: "The box it turns up in" },
  5:  { where: "showcase", at: 4, title: "Everything inside, laid out" },
  6:  { where: "showcase", at: 5, title: "One person carries it" },
  7:  { where: "steps",    at: 0 },
  8:  { where: "steps",    at: 1 },
  9:  { where: "steps",    at: 2 },
  10: { where: "banner" },
  11: { where: "still" },
  12: { where: "faq",      at: "What if I don't like it?" },
  13: { where: "faq",      at: "Will it freeze my water solid?" },
  14: { where: "faq",      at: "How big is it?" },
};

const job = process.argv[2];
if (!job) throw new Error("usage: node cryo-place.mjs <job-name>");

/* ------------------------------------------------------------ the pictures */

/* The run's file list comes in on disk rather than being fetched here: the
 * download links carry the wand's own token and that token is not a secret this
 * repo keeps. The caller writes the tool's answer to a file and names it. */
const from = process.argv[3] ?? `${ROOT}/scratchpad/wand-shots.json`;
const list = JSON.parse(fs.readFileSync(from, "utf8"));
const shots = (list.shots ?? list).filter((s) => (s.job ?? "") === job);
if (!shots.length) throw new Error(`nothing uploaded under "${job}" yet`);
shots.sort((a, b) => String(a.name).localeCompare(String(b.name)));
console.log(`${shots.length} pictures in "${job}"`);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cryo-"));
const [store] = await sql`select id from stores where slug='cryo'`;

/** Put one picture in the bucket in all three sizes and return its /media path. */
async function land(buf, stem) {
  const key = `${stem}.webp`;
  const sizes = [
    [key, null],
    [`${stem}-w640.webp`, 640],
    [`${stem}-t200.webp`, 200],
  ];
  for (const [name, width] of sizes) {
    const img = sharp(buf).rotate();
    const out = width ? img.resize({ width, withoutEnlargement: true }) : img;
    const file = path.join(tmp, name);
    await out.webp({ quality: width ? 82 : 90 }).toFile(file);
    execFileSync("npx", ["wrangler", "r2", "object", "put", `${BUCKET}/${name}`, "--file", file, "--remote"], {
      cwd: ROOT, stdio: "pipe",
      env: { ...process.env, CLOUDFLARE_API_TOKEN: env.CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID },
    });
  }
  const meta = await sharp(buf).metadata();
  await sql`
    insert into media (store_id, key, filename, mime, size_bytes, width, height)
    values (${store.id}, ${key}, ${key}, 'image/webp', ${buf.length}, ${meta.width ?? null}, ${meta.height ?? null})
    on conflict do nothing`;
  return `/media/${key}`;
}

/* --------------------------------------------------------------- placement */

const [page] = await sql`select p.id from pages p join stores s on s.id=p.store_id where s.slug='cryo' and p.kind='product' limit 1`;
const secs = await sql`select id, type, values from sections where page_id=${page.id}`;
const sec = (type) => secs.find((s) => s.type === type);

const placed = [];
for (const [i, shot] of shots.entries()) {
  const plan = PLAN[i + 1];
  if (!plan) { console.log(`no slot for picture ${i + 1} — left in the bucket`); continue; }
  const buf = Buffer.from(await fetch(shot.url).then((r) => r.arrayBuffer()));
  const url = await land(buf, `cryo-${job.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${String(i + 1).padStart(2, "0")}`);

  if (plan.where === "showcase" || plan.where === "steps") {
    const s = sec(plan.where === "showcase" ? "product_grid" : "three_steps");
    const blocks = await sql`select id, position, values from blocks where section_id=${s.id} order by position`;
    const b = blocks[plan.at];
    if (!b) {
      await sql`insert into blocks (section_id, position, values) values (${s.id}, ${plan.at}, ${JSON.stringify({ image: url, title: plan.title ?? "" })})`;
    } else {
      await sql`update blocks set values = ${JSON.stringify({ ...b.values, image: url, ...(plan.title ? { title: plan.title } : {}) })} where id=${b.id}`;
    }
  } else if (plan.where === "banner") {
    const s = sec("photo_banner");
    await sql`update sections set values = ${JSON.stringify({ ...s.values, image: url })}, hidden = false where id=${s.id}`;
  } else if (plan.where === "still") {
    const s = sec("video_faq");
    await sql`update sections set values = ${JSON.stringify({ ...s.values, still: url })} where id=${s.id}`;
  } else if (plan.where === "faq") {
    const s = sec("video_faq");
    const blocks = await sql`select id, values from blocks where section_id=${s.id}`;
    const b = blocks.find((x) => (x.values?.question ?? "") === plan.at);
    if (b) await sql`update blocks set values = ${JSON.stringify({ ...b.values, image: url })} where id=${b.id}`;
  }
  placed.push(`${i + 1} → ${plan.where}${plan.at !== undefined ? ` ${plan.at}` : ""}  ${url}`);
}

console.log(placed.join("\n"));

import { neon } from "@neondatabase/serverless";
import fs from "node:fs";
const env = Object.fromEntries(fs.readFileSync("/home/user/sculps-store/.dev.vars","utf8").split("\n").filter(l=>l.includes("=")).map(l=>[l.slice(0,l.indexOf("=")).trim(), l.slice(l.indexOf("=")+1).trim().replace(/^["']|["']$/g,"")]));
const sql = neon(env.DATABASE_URL);

const [page] = await sql`select p.id from pages p join stores s on s.id=p.store_id where s.slug='cryo' and p.kind='product' limit 1`;
if (!page) throw new Error("no cryo product page");

// His order: carousel/buy box, then the UGC film, then the questions, then the
// pictures, then the reviews, then whatever the strategy work earned a place.
// Everything that was a column of prose is switched off rather than deleted:
// the words are still there for the day one of them has a picture to sit next to.
const order = [
  "buy_box",
  "video_clips",
  "video_faq",
  "product_grid",
  "reviews",
  "photo_banner",
  "three_steps",
  "whats_in_the_box",
  "trust_icons",
  "closing_cta",
];
const off = new Set(["social_proof_images", "benefits", "features", "comparison_table", "specifications", "who_its_for", "ugc_wall"]);
// Nothing here has film or a real review yet. A section that would render an
// empty frame stays hidden until the thing it shows exists.
const notYet = new Set(["video_clips", "reviews"]);

const rows = await sql`select id, type from sections where page_id=${page.id}`;
const byType = new Map(rows.map((r) => [r.type, r.id]));

// photo_banner does not exist on this page yet — one full-bleed photograph
// with the line laid over it in real type, which is the opposite of a column.
if (!byType.has("photo_banner")) {
  const [made] = await sql`
    insert into sections (page_id, type, position, values, hidden)
    values (${page.id}, 'photo_banner', 900, ${JSON.stringify({
      heading: "It sits on the counter and it is always ready.",
      subheading: "No fridge. No ice tray. No bag of ice on the way home.",
      ctaLabel: "Get one",
      ctaHref: "#buy",
    })}, true)
    returning id`;
  byType.set("photo_banner", made.id);
}

// The (page, position) pair is unique, so everything is parked out of the
// way before anything is given its real number.
await sql`update sections set position = position + 1000 where page_id=${page.id}`;

let pos = 0;
for (const type of order) {
  const id = byType.get(type);
  if (!id) { console.log("missing", type); continue; }
  await sql`update sections set position=${pos}, hidden=${notYet.has(type) || (type === "photo_banner")} where id=${id}`;
  pos += 1;
}
for (const type of off) {
  const id = byType.get(type);
  if (id) await sql`update sections set position=${pos++}, hidden=true where id=${id}`;
}

const after = await sql`select position, type, hidden from sections where page_id=${page.id} order by position`;
console.log(after.map((r) => `${r.position} ${r.type}${r.hidden ? " (hidden)" : ""}`).join("\n"));

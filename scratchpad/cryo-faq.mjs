import { neon } from "@neondatabase/serverless";
import fs from "node:fs";
const env = Object.fromEntries(fs.readFileSync("/home/user/sculps-store/.dev.vars","utf8").split("\n").filter(l=>l.includes("=")).map(l=>[l.slice(0,l.indexOf("=")).trim(), l.slice(l.indexOf("=")+1).trim().replace(/^["']|["']$/g,"")]));
const sql = neon(env.DATABASE_URL);

/* The answers were paragraphs. The section draws them as text messages, and
 * nobody sends four sentences in a text message — the shape was arguing with
 * the words. Same facts, said the way a person says them. Nothing that was
 * refused before is claimed now: the unmeasured numbers are still unmeasured,
 * they are just refused in one line instead of five. */
const short = {
  "How long does it take?":
    "Not saying until we have measured it on the real machine. Everyone else's number was written by a marketing team. Ours will be a measurement.",
  "Do I need a special bottle?":
    "No. Any sealed bottle that fits on the rollers — the one you already own.",
  "Does it need a fridge or a freezer?":
    "No. It makes its own ice. A plug is all it needs.",
  "How many bottles can it do in a row?":
    "Several, then it needs a bit to build its ice back. Exact count goes here once we have measured it.",
  "Will it freeze my water solid?":
    "No. It spins the bottle so the water stays moving, and a sensor stops it at your temperature.",
  "Does it have to stay plugged in?":
    "Yes — that is how it is always ready. Any outlet: desk, dorm, workshop, RV.",
  "Can I chill soda, beer, or a can?":
    "Yes, anything sealed. Nothing open.",
  "How big is it?":
    "A lunchbox on its side. 28 × 14 × 14 cm.",
  "Is it loud?":
    "There is a motor and a pump, so no, not silent. No decibel number until we have measured one.",
  "What if I don't like it?":
    "30 days. Send it back, get your money back.",
};

const rows = await sql`
  select b.id, b.values from blocks b
  join sections sec on sec.id = b.section_id
  join pages p on p.id = sec.page_id
  join stores s on s.id = p.store_id
  where s.slug = 'cryo' and sec.type = 'video_faq'`;

let n = 0;
for (const r of rows) {
  const q = r.values?.question;
  const a = short[q];
  if (!a) { console.log("no shorter answer for:", q); continue; }
  await sql`update blocks set values = ${JSON.stringify({ ...r.values, answer: a })} where id = ${r.id}`;
  n += 1;
}
console.log("rewrote", n, "answers");

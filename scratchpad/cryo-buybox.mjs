import { neon } from "@neondatabase/serverless";
import fs from "node:fs";
const env = Object.fromEntries(fs.readFileSync("/home/user/sculps-store/.dev.vars","utf8").split("\n").filter(l=>l.includes("=")).map(l=>[l.slice(0,l.indexOf("=")).trim(), l.slice(l.indexOf("=")+1).trim().replace(/^["']|["']$/g,"")]));
const sql = neon(env.DATABASE_URL);
const [sec] = await sql`
  select sec.id, sec.values from sections sec
  join pages p on p.id = sec.page_id join stores s on s.id = p.store_id
  where s.slug='cryo' and sec.type='buy_box'`;

const values = {
  ...sec.values,
  /* The badge row was never filled in, so it never drew — which is why the
     only thing under the price was a paragraph. Four facts, four words each. */
  badges: ["Makes its own ice", "No fridge", "Nothing to refill", "Any bottle fits"].join("\n"),
  /* Four sentences under the price is a paragraph asking to be skipped. The
     machine is explained by the pictures and the three steps; here it only has
     to say what it is. */
  subheading: "It makes its own ice. Put a bottle in, close the lid, walk away.",
  /* "Both ship free" was written when there were two bundles. There is one. */
  bundleNote: "Ships free from the US. cryo stays plugged in — that is how it keeps its ice ready.",
};
await sql`update sections set values = ${JSON.stringify(values)} where id = ${sec.id}`;
console.log("buy box updated");

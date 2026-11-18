import { db } from "./src/db.mjs";
const d = db({ DATABASE_URL: process.env.DATABASE_URL });
const sql = process.argv[2];
const r = await d.q(sql);
console.log(JSON.stringify(r, null, 0).replace(/\},\{/g, "},\n{"));

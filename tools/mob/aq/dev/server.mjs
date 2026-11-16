// Tiny local server for the dev loop: page, /aq/app.js, /aq/assets/*, /api/aq/state (fixture), POST stubs. Dev only.
import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { fixture } from "./fixture.mjs";
const here = dirname(fileURLToPath(import.meta.url)), aq = join(here, "..");
const port = Number(process.env.PORT || 8787);
let kill = false; const bots = [];
const types = { ".js": "text/javascript", ".glb": "model/gltf-binary", ".png": "image/png", ".txt": "text/plain" };
http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  const B = await import(join(aq, "../src/aq-bundle.mjs") + "?t=" + Date.now());
  if (u.pathname === "/aq" || u.pathname === "/") { res.writeHead(200, { "content-type": "text/html" }); return res.end(B.AQ_PAGE); }
  if (u.pathname === "/aq/app.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(B.AQ_JS); }
  if (u.pathname.startsWith("/aq/assets/")) { const f = join(aq, "assets", u.pathname.slice(11)); if (existsSync(f)) { res.writeHead(200, { "content-type": types[extname(f)] || "application/octet-stream" }); return res.end(readFileSync(f)); } res.writeHead(404); return res.end(); }
  if (u.pathname === "/api/aq/state") { const s = fixture(); s.killSwitch = kill; for (const b of bots) s.departments.find((d) => d.id === b.dept)?.workers.push(b); if (process.env.EMPTY) { for (const k of ["equitySol", "pnlTodaySol", "market", "council"]) s[k] = null; s.xfeed = []; s.helpers = { grok: "not connected", chatgpt: "not connected" }; } res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify(s)); }
  if (req.method === "POST") { let b = ""; for await (const c of req) b += c; const j = JSON.parse(b || "{}");
    if (u.pathname === "/api/aq/kill") kill = !!j.on; if (u.pathname === "/api/aq/rebuild") process.env.STAGE = "thriving";
    if (u.pathname === "/api/aq/bots") bots.push({ id: "ceo-" + bots.length, name: j.name, job: j.job, rules: j.rules, skills: j.skills, power: j.power, status: "idle", note: "new, paper", dept: j.dept });
    res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ ok: true })); }
  res.writeHead(404); res.end();
}).listen(port, () => console.log("aq dev on http://localhost:" + port + "/aq"));

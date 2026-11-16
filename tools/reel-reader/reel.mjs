#!/usr/bin/env node
// reel-reader: open an Instagram (or any) reel link in Aquarius's logged-in Chrome, read the caption/comments,
// and save N screenshots spread across the video so the on-screen text and visuals can be read.
//   node tools/reel-reader/reel.mjs <url> [frames=8] [gapSeconds=4] [outDir]
// Needs the Aquarius link key: env AQ_LINK_KEY, or tools/aquarius/.keys.json (gitignored).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const [url, framesArg, gapArg, outArg] = process.argv.slice(2);
if (!url) { console.error("usage: reel.mjs <url> [frames] [gapSeconds] [outDir]"); process.exit(2); }
const frames = Math.max(1, Math.min(20, Number(framesArg) || 8));
const gap = Math.max(1, Number(gapArg) || 4);
let key = process.env.AQ_LINK_KEY;
if (!key) { try { key = JSON.parse(fs.readFileSync(path.join(HERE, "../aquarius/.keys.json"), "utf8")).linkKey; } catch {} }
if (!key) { console.error("no Aquarius link key (AQ_LINK_KEY or tools/aquarius/.keys.json)"); process.exit(2); }
const MCP = `https://mob.gardenbuddystore.workers.dev/api/aquarius/link/${key}/mcp`;
const id = (url.match(/\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/) || [])[1] || String(Date.now());
const out = outArg || path.join("/tmp", "reels", id);
fs.mkdirSync(out, { recursive: true });
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
let n = 0;
async function act(args) {
  const r = await fetch(MCP, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name: "aquarius_act", arguments: args } }) });
  const j = await r.json();
  return j.result?.content || [];
}
const text = (c) => c.filter((x) => x.type === "text").map((x) => x.text).join("\n");

const nav = text(await act({ action: "navigate", url, why: "read reel for Alex" }));
if (/ok: false/.test(nav)) { console.error(nav); process.exit(1); }
await sleep(6);
// caption + comments
let body = text(await act({ action: "read_text", why: "caption and comments" }));
body = body.split("Meta\nAbout")[0];
const login = /Log in|Log In|Create new account/.test(body.slice(0, 600)) && !/\bFollow\b/.test(body.slice(0, 600));
fs.writeFileSync(path.join(out, "caption.txt"), body);
// Instagram reels in a background-opened tab start paused: a space key press starts playback (tested 2026-11-16).
await act({ action: "press", key: " ", why: "play the reel" });
await sleep(1);
const saved = [];
for (let i = 0; i < frames; i++) {
  const c = await act({ action: "screenshot", why: `reel frame ${i + 1}/${frames}` });
  const img = c.find((x) => x.type === "image");
  if (img?.data) { const f = path.join(out, `frame-${String(i + 1).padStart(2, "0")}.png`); fs.writeFileSync(f, Buffer.from(img.data, "base64")); saved.push(f); }
  if (i < frames - 1) await sleep(gap);
}
const summary = { url, id, out, loginWall: login, frames: saved.length, captionChars: body.length };
fs.writeFileSync(path.join(out, "meta.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
console.log("--- caption (first 900 chars) ---\n" + body.slice(0, 900));

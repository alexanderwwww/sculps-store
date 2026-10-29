import test from "node:test"; import assert from "node:assert/strict";
import { startLink } from "../src/lib/link.mjs";
test("link posts status, applies orders, refuses unsafe keys", async () => {
  const posts = []; let order = { cmd: "set", cfg: { volSpike: 1.2, stakeFrac: 9 } };
  const eng = { paused: false, cfg: { volSpike: 1.5, stakeFrac: 0.12 }, flatten: async () => { eng.flat = true; } };
  const fetchImpl = async (url, o) => {
    if (o.method === "POST") { posts.push(JSON.parse(o.body)); return { ok: true, text: async () => "" }; }
    const out = order; order = null; return { ok: true, text: async () => JSON.stringify(out) };
  };
  const l = startLink({ base: "http://x/ultra/k", getState: () => ({ build: "t", running: true }), getEngine: () => eng, fetchImpl, statusMs: 20, orderMs: 20 });
  await new Promise((r) => setTimeout(r, 120));
  assert.ok(posts.length >= 1 && posts[0].build === "t");
  assert.equal(eng.cfg.volSpike, 1.2); assert.equal(eng.cfg.stakeFrac, 0.12);   // stake is not a safe key
  order = { cmd: "pause" }; await new Promise((r) => setTimeout(r, 60)); assert.equal(eng.paused, true);
  order = { cmd: "flatten" }; await new Promise((r) => setTimeout(r, 60)); assert.equal(eng.flat, true);
  l.stop();
});

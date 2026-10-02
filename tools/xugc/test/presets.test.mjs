import test from "node:test"; import assert from "node:assert/strict"; import { createRequire } from "node:module";
const require = createRequire(import.meta.url); const P = require("../presets.js"); const g = require("../google.js");
const GOLD = g.goldenTimes(8);
const sample = { product: { title: "Zorbo Sunrise Lamp", features: ["touch dimmer", "warm glow"] }, avatarText: "A friendly woman in her late twenties with a grey sweatshirt", scene: "a tidy kitchen", seconds: 16 };
const ids = Object.keys(P.PRESETS);
test("required presets exist", () => { for (const id of ["review", "product-only", "unboxing", "try-on", "tutorial", "breaking-news-start", "demo-in-motion", "before-after"]) assert.ok(P.PRESETS[id], id); assert.equal(P.list().length, ids.length); assert.throws(() => P.get("nope")); });
test("shape and golden points", () => { for (const id of ids) { const p = P.get(id); assert.equal(p.id, id); assert.equal(p.defaultSeconds, 16); assert.ok(["lite", "fast"].includes(p.tier)); assert.ok(["selfie", "propped", "pov", "friend-holds"].includes(p.capture)); for (const b of p.beats) { assert.ok(GOLD.includes(b.at), id + " at " + b.at); if (b.say) assert.ok(b.say.split(/\s+/).length <= 14, id + " say"); } } });
test("fill: title exactly once, deterministic, refs, hand rule", () => { for (const id of ids) { const a = P.fill(id, sample), b = P.fill(id, sample); assert.deepEqual(a, b); assert.equal(a.scene.split(sample.product.title).length - 1, 1, id); assert.equal(a.seconds, 16); assert.ok(a.refsPlan.some((r) => r.role === "product")); assert.match(a.scene, /five fingers visible, holding the product by its \w+/); assert.match(a.scene, /exact product/); } });
test("no forbidden words outside avoid", () => { const bad = /cinematic|\b8K\b|\bepic\b|beauty filter|flawless|studio lighting/i; for (const id of ids) { const p = { ...P.get(id), avoid: [] }; assert.doesNotMatch(JSON.stringify(p), bad, id); assert.doesNotMatch(P.fill(id, sample).scene, bad, id); } });
test("breaking news: street first, no text", () => { const a = P.fill("breaking-news-start", sample); assert.match(a.beatsText, /street/i); assert.match(a.scene, /No text, no captions/); });

test("per-clip prompts survive the filter: every action kept, nothing blocked, for real product titles", async () => {
  const { createRequire } = await import("node:module"); const req = createRequire(import.meta.url);
  const P = req("../presets.js"), F = req("../filter.js");
  const titles = ["Garden Kneeler Seat - Foldable, 2 in 1", 'Kids Art Easel 24" Deluxe', "Baby Pink Hair Clip", "Crowd Control Cones"];
  for (const t of titles) for (const id of P.list().map((x) => x.id)) for (const n of [1, 2, 3]) {
    const r = P.clips(id, { product: { title: t } }, n);
    r.clips.forEach((c, i) => {
      const k = F.check(c.split(t.replace(/"/g, "\u2033")).join("the product item"), "veo");
      assert.ok(k.ok, `${id} n=${n} clip ${i + 1} blocked for "${t}": ${k.problems.map((q) => q.code).join(",")}`);
      const actions = (c.match(/\d:\d\d\.\d\d [^,."]+/g) || []);
      for (const a of actions) assert.ok(k.prompt.includes(a), `${id} n=${n} clip ${i + 1}: action cut by the filter: ${a}`);
    });
  }
});

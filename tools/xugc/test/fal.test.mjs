// Every body we send to fal is checked against fal's own OpenAPI schema (saved 2026-10-02): field names, types, enums, required.
import test from "node:test"; import assert from "node:assert/strict"; import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module";
const require = createRequire(import.meta.url); const F = require("../fal.js");
const DIR = path.resolve("../../design/xugc/real-life/fal-openapi");
function schemaFor(endpoint) {
  const d = JSON.parse(fs.readFileSync(path.join(DIR, endpoint.replace(/\//g, "__") + ".json"), "utf8"));
  const s = d.components.schemas; const name = Object.keys(s).find((k) => /Input$/.test(k)); assert.ok(name, "no Input schema for " + endpoint); return s[name];
}
const typeOk = (v, p) => { const ts = [p.type, ...((p.anyOf || []).map((x) => x.type))].filter(Boolean); if (!ts.length) return true; return ts.some((t) => (t === "string" && typeof v === "string") || (t === "integer" && Number.isInteger(v)) || (t === "number" && typeof v === "number") || (t === "boolean" && typeof v === "boolean") || (t === "array" && Array.isArray(v)) || t === "null" && v === null); };
const enumOf = (p) => p.enum || (p.anyOf || []).flatMap((x) => x.enum || []);
function check(endpoint, body) {
  const sc = schemaFor(endpoint);
  for (const r of sc.required || []) assert.ok(body[r] !== undefined, `${endpoint}: required ${r} missing`);
  for (const [k, v] of Object.entries(body)) {
    const p = sc.properties[k]; assert.ok(p, `${endpoint}: field ${k} does not exist in fal's schema`);
    assert.ok(typeOk(v, p), `${endpoint}: ${k}=${JSON.stringify(v)} has the wrong type`);
    const en = enumOf(p); if (en.length) assert.ok(en.includes(v), `${endpoint}: ${k}=${JSON.stringify(v)} not in ${JSON.stringify(en)}`);
  }
}
const o = { prompt: "p", first: "https://x/a.png", last: "https://x/b.png", seconds: 8 };
for (const [eng, m] of Object.entries(F.MODELS)) for (const tier of ["lite", "fast"]) for (const res of ["480p", "720p"]) {
  test(`${eng} ${tier} ${res}: body matches fal's schema`, () => { const x = { ...o, tier, res }; check(m.id(x), m.body(x)); });
}
test("hidden-frame image body matches nano-banana-2/edit", () => check(F.IMAGE.id, { prompt: "p", image_urls: ["https://x/a.png"], aspect_ratio: "9:16", num_images: 1, output_format: "png" }));
test("estimate: 16 s Seedance 720p = 2 clips + 3 frames", () => { const e = F.estimate({ engine: "seedance", seconds: 16 }); assert.equal(e.clips, 2); assert.equal(e.usd, Math.round((2 * 0.473 * 8 + 3 * 0.08) * 100) / 100); });

// the queue flow against a fake fal: uses the RETURNED urls, uploads pictures first, counts as started once queued
test("clip: uploads both frames, submits, polls the returned status_url, downloads video.url", async () => {
  const calls = []; let polls = 0;
  const f = async (url, init = {}) => {
    calls.push({ url, init }); const j = (x, st = 200) => ({ ok: st < 300, status: st, text: async () => JSON.stringify(x), arrayBuffer: async () => Buffer.from("MP4") });
    if (url.includes("storage/upload/initiate")) return j({ upload_url: "https://up/" + calls.length, file_url: "https://cdn/f" + calls.length });
    if (url.startsWith("https://up/")) return j({});
    if (url.startsWith("https://queue.fal.run/bytedance/seedance-2.5/image-to-video")) return j({ request_id: "r1", status_url: "https://queue.fal.run/bytedance/seedance-2.5/requests/r1/status", response_url: "https://queue.fal.run/bytedance/seedance-2.5/requests/r1" });
    if (url.endsWith("/requests/r1/status")) return j({ status: ++polls < 2 ? "IN_PROGRESS" : "COMPLETED" });
    if (url.endsWith("/requests/r1")) return j({ video: { url: "https://v3b.fal.media/v.mp4" } });
    if (url === "https://v3b.fal.media/v.mp4") return j({});
    throw new Error("unrouted " + url);
  };
  const fal = new F.Fal({ key: () => "falkey123", fetchImpl: f, sleep: async () => {} });
  let started = 0;
  const r = await fal.clip({ engine: "seedance", prompt: "p", first: { bytes: Buffer.from([0x89, 0x50, 1]) }, last: { bytes: Buffer.from([0xff, 0xd8, 1]) }, onStarted: () => started++ });
  assert.equal(r.bytes.toString(), "MP4"); assert.equal(started, 1);
  const sub = calls.find((c) => c.url.startsWith("https://queue.fal.run/bytedance/seedance-2.5/image-to-video"));
  assert.equal(sub.init.headers.Authorization, "Key falkey123");
  const b = JSON.parse(sub.init.body); assert.match(b.image_url, /^https:\/\/cdn\//); assert.match(b.end_image_url, /^https:\/\/cdn\//); assert.equal(b.duration, "8");
  check("bytedance/seedance-2.5/image-to-video", b);
  assert.equal(JSON.parse(calls[0].init.body).content_type, "image/png");
});
test("a fal 422 is shown with fal's own reason; no key = clear message and nothing sent", async () => {
  const f = async () => ({ ok: false, status: 422, text: async () => JSON.stringify({ detail: [{ loc: ["body", "duration"], msg: "bad value" }] }) });
  await assert.rejects(() => new F.Fal({ key: () => "k", fetchImpl: f }).run("x/y", {}), /body.duration: bad value/);
  let n = 0; await assert.rejects(() => new F.Fal({ key: () => "", fetchImpl: async () => { n++; } }).run("x/y", {}), /fal.ai key/); assert.equal(n, 0);
});
test("COMPLETED with an error is a failure, not a video", async () => {
  const f = async (url) => ({ ok: true, status: 200, text: async () => JSON.stringify(url.endsWith("/status") ? { status: "COMPLETED", error: "blocked", error_type: "content_policy_violation" } : { status_url: "https://q/s/status", response_url: "https://q/s" }) });
  await assert.rejects(() => new F.Fal({ key: () => "k", fetchImpl: f, sleep: async () => {} }).run("x/y", {}), /blocked/);
});

function fakeFal(over = {}) {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url, init }); const j = (x, st = 200) => ({ ok: st < 300, status: st, text: async () => JSON.stringify(x), arrayBuffer: async () => Buffer.from([0x89, 0x50, 0x4e, 0x47]) });
    if (over[url]) return j(over[url]());
    if (url.includes("storage/upload/initiate")) return j({ upload_url: "https://up/" + calls.length, file_url: "https://cdn/" + calls.length });
    if (url.startsWith("https://up/")) return j({});
    if (url.startsWith("https://queue.fal.run/") && init.method === "POST") return j({ request_id: "r", status_url: "https://q/r/status", response_url: "https://q/r", cancel_url: "https://q/r/cancel" });
    if (url === "https://q/r/status") return j({ status: "COMPLETED" });
    if (url === "https://q/r") return j({ images: [{ url: "https://img/x.png" }] });
    if (url === "https://q/r/cancel") return j({ status: "CANCELLATION_REQUESTED" });
    return j({});
  };
  return { f, calls };
}
test("a hidden frame with no pictures uses the text model, and its body matches that schema", async () => {
  const { f, calls } = fakeFal(); await new F.Fal({ key: () => "k", fetchImpl: f, sleep: async () => {} }).image("a woman on a street", []);
  const sub = calls.find((c) => c.url.startsWith("https://queue.fal.run/"));
  assert.equal(sub.url, "https://queue.fal.run/fal-ai/nano-banana-2"); check("fal-ai/nano-banana-2", JSON.parse(sub.init.body));
});
test("the same picture is uploaded once", async () => {
  const { f, calls } = fakeFal(); const fal = new F.Fal({ key: () => "k", fetchImpl: f, sleep: async () => {} });
  const p = { bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]) };
  await fal.image("x", [p]); await fal.image("y", [p, p]);
  assert.equal(calls.filter((c) => c.url.includes("upload/initiate")).length, 1);
});
test("a job that takes too long is cancelled at fal (not left running and billed)", async () => {
  const { f, calls } = fakeFal({ "https://q/r/status": () => ({ status: "IN_PROGRESS" }) });
  await assert.rejects(() => new F.Fal({ key: () => "k", fetchImpl: f, sleep: async () => {} }).run("x/y", {}, { maxPolls: 3 }), /cancelled/);
  assert.ok(calls.some((c) => c.url === "https://q/r/cancel" && c.init.method === "PUT"));
});

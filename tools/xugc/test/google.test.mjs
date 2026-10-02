import test from "node:test"; import assert from "node:assert/strict"; import { createRequire } from "node:module";
const require = createRequire(import.meta.url); const g = require("../google.js");
const png = Buffer.from("PNGDATA");
function fake(routes) { const calls = []; const f = async (url, init = {}) => { calls.push({ url, init }); for (const [m, fn] of routes) if (url.includes(m)) { const r = fn(url, init, calls); return { ok: r.ok !== false, status: r.status || 200, text: async () => JSON.stringify(r.json || {}), arrayBuffer: async () => r.buf || Buffer.from("x") }; } throw new Error("unrouted " + url); }; f.calls = calls; return f; }
test("golden times for 8 s", () => assert.deepEqual(g.goldenTimes(8), [0, 1.17, 3.06, 4.94, 6.11, 8]));
test("estimate: 16 s lite = 2 clips + 3 pictures", () => { const e = g.estimate({ seconds: 16, tier: "lite" }); assert.equal(e.clips, 2); assert.equal(e.images, 3); assert.equal(e.usd, 1.0); });
test("beat prompt is deterministic and carries the golden times", () => { const a = g.beatPrompt("A woman films a mug."); assert.equal(a, g.beatPrompt("A woman films a mug.")); assert.match(a, /0:03/); assert.match(a, /0:04/); });
test("landmark prompt forbids text and copying layouts", () => assert.match(g.landmarkPrompt("x", "the hook"), /NO text.*NO captions/s));
test("image: right url, header, body, parses steps", async () => {
  const f = fake([["/interactions", () => ({ json: { steps: [{ type: "model_output", content: [{ type: "text", text: "hi" }, { type: "image", data: png.toString("base64"), mime_type: "image/png" }] }] } })]]);
  const G = new g.Google({ key: () => "KEY123456789", fetchImpl: f });
  const r = await G.image("p", [{ bytes: png, mime: "image/jpeg" }]);
  assert.equal(r.bytes.toString(), "PNGDATA");
  const c = f.calls[0]; assert.equal(c.init.headers["x-goog-api-key"], "KEY123456789");
  const b = JSON.parse(c.init.body); assert.equal(b.model, "gemini-3.1-flash-image"); assert.equal(b.response_format.aspect_ratio, "9:16"); assert.equal(b.input[1].type, "image");
});
test("image: no picture in reply is a loud error", async () => {
  const G = new g.Google({ key: () => "KEY123456789", fetchImpl: fake([["/interactions", () => ({ json: { steps: [] } })]]) });
  await assert.rejects(() => G.image("p"), /no picture/);
});
test("clip: frames mode sends image+lastFrame, polls, downloads", async () => {
  let n = 0;
  const f = fake([[":predictLongRunning", () => ({ json: { name: "operations/abc" } })], ["operations/abc", () => (++n < 2 ? { json: { done: false } } : { json: { done: true, response: { generateVideoResponse: { generatedSamples: [{ video: { uri: "https://x/v.mp4" } }] } } } })], ["x/v.mp4", () => ({ buf: Buffer.from("MP4") })]]);
  const G = new g.Google({ key: () => "KEY123456789", fetchImpl: f, sleep: async () => {} });
  const r = await G.clip({ prompt: "p", tier: "lite", first: { bytes: png }, last: { bytes: png } });
  assert.equal(r.bytes.toString(), "MP4");
  const sub = f.calls[0]; assert.match(sub.url, /veo-3\.1-lite-generate-preview:predictLongRunning/);
  const b = JSON.parse(sub.init.body); assert.ok(b.instances[0].image.inlineData.data); assert.ok(b.instances[0].lastFrame.inlineData.data);
  assert.equal(b.parameters.aspectRatio, "9:16"); assert.equal(b.parameters.resolution, "720p"); assert.equal(b.parameters.durationSeconds, "8"); assert.equal(b.parameters.personGeneration, "allow_adult");
});
test("clip: reference mode and filtered result", async () => {
  const f = fake([[":predictLongRunning", () => ({ json: { name: "operations/z" } })], ["operations/z", () => ({ json: { done: true, response: { generateVideoResponse: { raiMediaFilteredReasons: ["face"] } } } })]]);
  const G = new g.Google({ key: () => "KEY123456789", fetchImpl: f, sleep: async () => {} });
  await assert.rejects(() => G.clip({ prompt: "p", refs: [{ bytes: png }, { bytes: png }] }), /refused.*face/);
  assert.equal(JSON.parse(f.calls[0].init.body).instances[0].referenceImages[0].referenceType, "asset");
});
test("no key = clear message, nothing sent", async () => {
  const f = fake([]); const G = new g.Google({ key: () => "", fetchImpl: f });
  await assert.rejects(() => G.image("p"), /Google key/); assert.equal(f.calls.length, 0);
});

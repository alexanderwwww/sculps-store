/**
 * Google side of XUGC: landmark pictures (Gemini image model) and the video itself (Veo), straight from Google's API, no middleman.
 * Every request shape below was read from Google's own pages (ai.google.dev/gemini-api/docs/veo and /image-generation), 2026-10-02:
 *   - Veo:   POST /v1beta/models/{model}:predictLongRunning  body {instances:[{prompt, image?, lastFrame?, referenceImages?}], parameters}
 *            poll GET /v1beta/{operation.name} until done; video at response.generateVideoResponse.generatedSamples[0].video.uri; download with the key header.
 *   - Image: POST /v1beta/interactions  body {model, input:[{type:"text"},{type:"image",mime_type,data}], response_format:{type:"image",aspect_ratio}}
 *            answer: steps[] of type "model_output" holding content[] blocks of type "image" with base64 "data".
 * The key lives in main only (secrets.js); it is sent as the x-goog-api-key header and never logged.
 */
const BASE = "https://generativelanguage.googleapis.com/v1beta";
const IMAGE_MODEL = "gemini-3.1-flash-image";
const IMAGE_USD = 0.067;
// $ per second of video, with sound, at 720p (Google's pricing page). Alex renders 720p: Veo has no 480p.
const VEO = {
  lite: { id: "veo-3.1-lite-generate-preview", perSec: 0.05, label: "Veo 3.1 Lite" },
  fast: { id: "veo-3.1-fast-generate-preview", perSec: 0.1, label: "Veo 3.1 Fast" },
  standard: { id: "veo-3.1-generate-preview", perSec: 0.4, label: "Veo 3.1" },
};
const CLIP = 8; // frames and reference modes need 8 s; a longer ad is several 8 s clips joined

const r2 = (n) => Math.round(n * 100) / 100;
/** the real type of a picture, from its first bytes (Shopify serves .webp under .jpg names) */
function sniff(b) {
  b = Buffer.from(b);
  if (b[0] === 0x89 && b[1] === 0x50) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (b.slice(0, 4).toString() === "RIFF" && b.slice(8, 12).toString() === "WEBP") return "image/webp";
  return "image/jpeg";
}

/** Alex's rule: golden-ratio landmark times inside a clip of L seconds. For 8 s: 0, 1.17, 3.06, 4.94, 6.11, 8.00 */
function goldenTimes(L = CLIP) {
  const a = 0.382 * L, b = 0.618 * L;
  return [0, 0.382 * a, a, b, b + 0.382 * (L - b), L].map((t) => Math.round(t * 100) / 100);
}
const clipsFor = (seconds) => Math.max(1, Math.ceil(Number(seconds) / CLIP));

function estimate({ seconds = 16, tier = "lite", landmarks = true } = {}) {
  const v = VEO[tier] || VEO.lite, clips = clipsFor(seconds);
  const images = landmarks ? clips + 1 : 0;
  const usd = r2(clips * CLIP * v.perSec + images * IMAGE_USD);
  return { usd, clips, images, video: r2(clips * CLIP * v.perSec) };
}

const mmss = (t) => `0:${String(Math.floor(t)).padStart(2, "0")}`;
/** The shot as timed beats at the golden points (setup, build, hook at 4.94, settle). Plain text, same input = same output. */
function beatPrompt(scene, extra = "") {
  const t = goldenTimes();
  return [
    String(scene).trim(),
    `Timing: ${mmss(0)}-${mmss(t[2])} set-up, steady handheld; ${mmss(t[2])}-${mmss(t[3])} the action builds; the main moment lands at ${mmss(t[3])}; ${mmss(t[4])}-${mmss(CLIP)} settles and holds on the final pose.`,
    extra,
  ].filter(Boolean).join(" ");
}

/** Raw product photos (carousels, infographics, spec sheets) NEVER go to the video model: it copies their text and graphics into the ad.
 *  They go to the image model only, which makes a clean still of the scene; only that still reaches Veo. */
const CLEAN = "Photorealistic frame from a real vertical phone video, natural unretouched look, handheld iPhone quality. The picture contains NO text, NO captions, NO letters, NO numbers, NO logos or graphics added on top, NO infographic, NO collage, NO borders, NO watermark. Use the reference photos only to learn what the product and the person look like, never copy their layout or any writing on them.";
function landmarkPrompt(scene, moment) { return `${String(scene).trim()} This single frame is: ${moment}. ${CLEAN}`; }

class Google {
  /** @param {{key: ()=>string, fetchImpl?: Function, sleep?: (ms:number)=>Promise<void>}} o */
  constructor({ key, fetchImpl, sleep }) { this.key = key; this.f = fetchImpl || globalThis.fetch; this.sleep = sleep || ((ms) => new Promise((r) => setTimeout(r, ms))); }
  hdr() { const k = this.key(); if (!k) { const e = new Error("Paste your Google key in Settings first."); e.code = "nogoogle"; throw e; } return { "x-goog-api-key": k, "Content-Type": "application/json" }; }
  async call(url, init) {
    const r = await this.f(url, init);
    const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch { /* not json */ }
    if (!r.ok) {
      const msg = (j && j.error && j.error.message) || text.slice(0, 300);
      const e = new Error(`Google said no (${r.status}): ${msg}`); e.code = r.status === 401 || r.status === 403 ? "googleauth" : r.status === 429 ? "googlerate" : "google"; throw e;
    }
    return j || {};
  }
  /** free call: proves the key works */
  async test() { const j = await this.call(`${BASE}/models?pageSize=100`, { headers: this.hdr() }); const names = (j.models || []).map((m) => m.name); return { models: names.length, veo: names.filter((n) => /veo/.test(n)) }; }

  /** one 9:16 picture. refs = [{bytes: Buffer, mime}] (product, avatar...). Returns {bytes, mime} */
  async image(prompt, refs = []) {
    const input = [{ type: "text", text: prompt }, ...refs.map((r) => ({ type: "image", mime_type: sniff(r.bytes), data: Buffer.from(r.bytes).toString("base64") }))];
    const j = await this.call(`${BASE}/interactions`, { method: "POST", headers: this.hdr(), body: JSON.stringify({ model: IMAGE_MODEL, input, response_format: { type: "image", aspect_ratio: "9:16" } }) });
    for (const s of j.steps || (j.interaction && j.interaction.steps) || []) {
      if (s.type !== "model_output") continue;
      for (const c of s.content || []) if (c.type === "image" && c.data) return { bytes: Buffer.from(c.data, "base64"), mime: c.mime_type || "image/png" };
    }
    const direct = (j.output_image || (j.interaction && j.interaction.output_image));
    if (direct && direct.data) return { bytes: Buffer.from(direct.data, "base64"), mime: direct.mime_type || "image/png" };
    const e = new Error("Google answered but sent no picture. Its reply began: " + JSON.stringify(j).slice(0, 300)); e.code = "noimage"; throw e;
  }

  /** one 8 s clip. first/last = {bytes, mime} (frames mode) or refs = up to 3 (reference mode). Returns {bytes, uri, op} */
  async clip({ prompt, tier = "lite", first, last, refs = [], seed, onProgress, onStarted, signal, pollMs = 10000, maxPolls = 60 }) {
    const v = VEO[tier] || VEO.lite;
    const b64 = (x) => ({ inlineData: { mimeType: sniff(x.bytes), data: Buffer.from(x.bytes).toString("base64") } });
    const inst = { prompt };
    if (first) inst.image = b64(first);
    if (last) inst.lastFrame = b64(last);
    if (!first && refs.length) inst.referenceImages = refs.slice(0, 3).map((x) => ({ image: b64(x), referenceType: "asset" }));
    const parameters = { aspectRatio: "9:16", resolution: "720p", durationSeconds: String(CLIP), personGeneration: first || refs.length ? "allow_adult" : "allow_all", ...(Number.isFinite(seed) ? { seed } : {}) };
    const op = await this.call(`${BASE}/models/${v.id}:predictLongRunning`, { method: "POST", headers: this.hdr(), body: JSON.stringify({ instances: [inst], parameters }) });
    if (!op.name) { const e = new Error("Google did not start the video: " + JSON.stringify(op).slice(0, 300)); e.code = "google"; throw e; }
    if (onStarted) onStarted(op.name); // Google bills from here, whatever happens next
    for (let i = 0; i < maxPolls; i++) {
      if (signal && signal.cancelled) { const e = new Error("Cancelled."); e.code = "cancelled"; throw e; }
      const s = await this.call(`${BASE}/${op.name}`, { headers: this.hdr() });
      if (onProgress) onProgress({ polls: i + 1 });
      if (s.done) {
        if (s.error) { const e = new Error("Google could not make it: " + (s.error.message || JSON.stringify(s.error))); e.code = "google"; throw e; }
        const gv = s.response && s.response.generateVideoResponse;
        const sample = gv && gv.generatedSamples && gv.generatedSamples[0];
        const uri = sample && sample.video && sample.video.uri;
        if (!uri) { const e = new Error("Google refused this one" + (gv && gv.raiMediaFilteredReasons ? ": " + [].concat(gv.raiMediaFilteredReasons).join("; ") : ". Reply: " + JSON.stringify(s.response || s).slice(0, 300))); e.code = "rejected"; throw e; }
        const r = await this.f(uri, { headers: this.hdr(), redirect: "follow" });
        if (!r.ok) { const e = new Error(`Could not download the video (${r.status}).`); e.code = "google"; throw e; }
        return { bytes: Buffer.from(await r.arrayBuffer()), uri, op: op.name };
      }
      await this.sleep(pollMs);
    }
    const e = new Error("Google took too long on this clip."); e.code = "google"; throw e;
  }
}

module.exports = { Google, VEO, CLIP, IMAGE_MODEL, IMAGE_USD, sniff, goldenTimes, clipsFor, estimate, beatPrompt, landmarkPrompt, CLEAN };

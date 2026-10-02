/**
 * fal.ai: ONE key for every rented model (Seedance, Kling, Veo, Wan) and for the hidden frames (Nano Banana 2).
 * Every endpoint, field and price below is copied from fal's own OpenAPI schemas and model pages, fetched 2026-10-02:
 * design/xugc/real-life/08-fal-api.md (+ fal-openapi/*.json). Nothing here is from memory.
 *   - auth header      Authorization: Key <FAL_KEY>
 *   - local pictures   POST rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3 {content_type,file_name} -> PUT upload_url -> use file_url
 *   - queue            POST queue.fal.run/<endpoint> -> {request_id,status_url,response_url}; ALWAYS use the returned urls
 *                      status: IN_QUEUE | IN_PROGRESS | COMPLETED (COMPLETED may carry error/error_type); result: GET response_url
 *   - result           video.url / images[0].url, public CDN links (no key needed to download)
 */
const { sniff } = require("./google.js");

const QUEUE = "https://queue.fal.run";
const STORAGE = "https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3";
const IMAGE = { id: "fal-ai/nano-banana-2/edit", usd: 0.08 };

/** price per second with sound, at the resolution we send (fal's pages). Each model's body is built from its own schema. */
const MODELS = {
  seedance: {
    label: "Seedance 2.5", id: () => "bytedance/seedance-2.5/image-to-video",
    perSec: (o) => (o.res === "480p" ? 0.2205 : 0.473),
    body: (o) => ({ image_url: o.first, ...(o.last ? { end_image_url: o.last } : {}), prompt: o.prompt, resolution: o.res === "480p" ? "480p" : "720p", duration: String(o.seconds), generate_audio: true }),
  },
  kling: {
    label: "Kling 3.0 Pro", id: () => "fal-ai/kling-video/v3/pro/image-to-video",
    perSec: () => 0.168,
    body: (o) => ({ start_image_url: o.first, ...(o.last ? { end_image_url: o.last } : {}), prompt: o.prompt, duration: String(o.seconds), generate_audio: true }),
  },
  fal_veo: {
    label: "Veo 3.1", id: (o) => (o.tier === "fast" ? "fal-ai/veo3.1/fast/first-last-frame-to-video" : "fal-ai/veo3.1/lite/first-last-frame-to-video"),
    perSec: (o) => (o.tier === "fast" ? 0.15 : 0.05),
    body: (o) => ({ prompt: o.prompt, first_frame_url: o.first, last_frame_url: o.last || o.first, duration: o.seconds + "s", aspect_ratio: "9:16", resolution: "720p", generate_audio: true }),
  },
  fal_wan: {
    label: "Wan 3.0", id: () => "alibaba/wan-3.0/image-to-video",
    perSec: (o) => (o.res === "480p" ? 0.05 : 0.1),
    body: (o) => ({ start_image_url: o.first, ...(o.last ? { end_image_url: o.last } : {}), prompt: o.prompt, resolution: o.res === "480p" ? "480p" : "720p", aspect_ratio: "9:16", duration: o.seconds, audio: true }),
  },
};
const isFal = (engine) => Object.prototype.hasOwnProperty.call(MODELS, engine);
const r2 = (n) => Math.round(n * 100) / 100;
const CLIP = 8;

function clipUsd(engine, o = {}) { const m = MODELS[engine]; return r2(m.perSec({ ...o }) * CLIP); }
function estimate({ engine, seconds = 16, tier = "lite", res = "720p" }) {
  const clips = Math.max(1, Math.ceil(Number(seconds) / CLIP)), images = clips + 1;
  return { usd: r2(clips * MODELS[engine].perSec({ tier, res }) * CLIP + images * IMAGE.usd), clips, images };
}

class Fal {
  /** @param {{key: ()=>string, fetchImpl?: Function, sleep?: (ms:number)=>Promise<void>}} o */
  constructor({ key, fetchImpl, sleep }) { this.key = key; this.f = fetchImpl || globalThis.fetch; this.sleep = sleep || ((ms) => new Promise((r) => setTimeout(r, ms))); }
  auth() { const k = this.key(); if (!k) { const e = new Error("Add your fal.ai key in Settings first."); e.code = "nofal"; throw e; } return { Authorization: "Key " + k }; }
  async json(url, init = {}) {
    const r = await this.f(url, { ...init, headers: { ...this.auth(), ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers || {}) } });
    const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch { /* not json */ }
    if (!r.ok) {
      const d = j && j.detail; const msg = Array.isArray(d) ? d.map((x) => (x.loc ? x.loc.join(".") + ": " : "") + x.msg).join("; ") : d || text.slice(0, 300);
      const e = new Error(`fal said no (${r.status}): ${msg}`);
      e.code = r.status === 401 || r.status === 403 ? "falauth" : /content_policy/.test(text) ? "rejected" : "fal"; throw e;
    }
    return j || {};
  }
  /** free call that needs a valid key: start an upload of 1 byte (nothing is billed for storage) */
  async test() { const up = await this.json(STORAGE, { method: "POST", body: JSON.stringify({ content_type: "text/plain", file_name: "xugc-key-test.txt" }) }); return { ok: !!up.upload_url }; }
  /** local picture -> public fal CDN url */
  async upload(bytes, name = "frame") {
    const mime = sniff(bytes), ext = mime.split("/")[1];
    const up = await this.json(STORAGE, { method: "POST", body: JSON.stringify({ content_type: mime, file_name: `${name}.${ext}` }) });
    if (!up.upload_url || !up.file_url) throw new Error("fal did not give an upload address: " + JSON.stringify(up).slice(0, 200));
    const r = await this.f(up.upload_url, { method: "PUT", headers: { "Content-Type": mime }, body: Buffer.from(bytes) });
    if (!r.ok) throw new Error(`Could not upload a picture to fal (${r.status}).`);
    return up.file_url;
  }
  /** submit -> poll the returned status_url -> GET response_url. onStarted fires once fal accepted the job. */
  async run(endpoint, input, { signal, onStarted, onProgress, pollMs = 4000, maxPolls = 225 } = {}) {
    const sub = await this.json(`${QUEUE}/${endpoint}`, { method: "POST", body: JSON.stringify(input) });
    if (!sub.status_url || !sub.response_url) throw new Error("fal did not queue the job: " + JSON.stringify(sub).slice(0, 300));
    if (onStarted) onStarted(sub.request_id);
    for (let i = 0; i < maxPolls; i++) {
      if (signal && signal.cancelled) { try { await this.json(sub.cancel_url || sub.status_url.replace(/\/status$/, "/cancel"), { method: "PUT" }); } catch { /* best effort */ } const e = new Error("Cancelled."); e.code = "cancelled"; throw e; }
      const s = await this.json(sub.status_url);
      if (onProgress) onProgress({ status: s.status, position: s.queue_position });
      if (s.status === "COMPLETED") {
        if (s.error) { const e = new Error("fal could not make it: " + s.error + (s.error_type ? ` (${s.error_type})` : "")); e.code = /content_policy/.test(String(s.error_type)) ? "rejected" : "fal"; throw e; }
        return this.json(sub.response_url);
      }
      await this.sleep(pollMs);
    }
    const e = new Error("fal took too long on this job."); e.code = "fal"; throw e;
  }
  async download(url) { const r = await this.f(url); if (!r.ok) throw new Error(`Could not download from fal (${r.status}).`); return Buffer.from(await r.arrayBuffer()); }

  /** one 9:16 still from the product/person pictures (same contract as google.image) */
  async image(prompt, refs = [], o = {}) {
    const urls = [];
    for (let k = 0; k < refs.length; k++) urls.push(await this.upload(refs[k].bytes, "ref" + (k + 1)));
    const out = await this.run(IMAGE.id, { prompt, ...(urls.length ? { image_urls: urls } : {}), aspect_ratio: "9:16", num_images: 1, output_format: "png" }, o);
    const u = out.images && out.images[0] && out.images[0].url;
    if (!u) { const e = new Error("fal answered but sent no picture: " + JSON.stringify(out).slice(0, 300)); e.code = "noimage"; throw e; }
    const bytes = await this.download(u); return { bytes, mime: sniff(bytes) };
  }
  /** one 8 s clip between two pictures (same contract as google.clip, plus the engine) */
  async clip({ engine, prompt, tier = "lite", res = "720p", first, last, signal, onStarted }) {
    const m = MODELS[engine]; if (!m) throw new Error("Unknown fal model " + engine);
    const firstUrl = await this.upload(first.bytes, "first"), lastUrl = last ? await this.upload(last.bytes, "last") : null;
    const o = { prompt, tier, res, first: firstUrl, last: lastUrl, seconds: CLIP };
    const out = await this.run(m.id(o), m.body(o), { signal, onStarted });
    const u = out.video && out.video.url;
    if (!u) { const e = new Error("fal answered but sent no video: " + JSON.stringify(out).slice(0, 300)); e.code = "fal"; throw e; }
    return { bytes: await this.download(u), uri: u };
  }
}

module.exports = { Fal, MODELS, IMAGE, isFal, estimate, clipUsd, CLIP };

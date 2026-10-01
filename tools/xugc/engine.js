/**
 * The engine: what happens when he presses Generate. Real GPU, real money.
 *
 * Money rules live here and nowhere else, so no screen (and no remote caller) can forget them:
 *
 *   - A job whose estimate is over the per-job cap is REFUSED before anything is rented.
 *   - A job that would take the day past the daily cap is REFUSED before anything is rented.
 *   - The job's own cap is passed down to runpod.js, which stops the job and deletes the GPU when reached.
 *   - One GPU job at a time.
 *   - Whatever a job cost, even a failed one, is added to today's spending.
 *
 * Estimates assume the dearest GPU RunPod could give us ($4.00 an hour; a real H100 came at $3.49), so they are a ceiling, not a hope.
 * The render minutes below are GUESSES until the first real run measures them.
 */
const fs = require("node:fs");
const path = require("node:path");
const { RunPod, WORST_HOURLY } = require("./runpod.js");
const { QUALITY, SECONDS } = require("./compose.js");

const today = () => new Date().toISOString().slice(0, 10);
const r2 = (n) => Math.round(n * 100) / 100;
const RENDER_MIN = { 5: 1.5, 10: 3, 15: 5, 20: 7 }; // H100, HD: a guess

function estimateGenerate({ seconds = 15, quality = "hd", volume = false } = {}) {
  const q = QUALITY[quality] || QUALITY.hd;
  const setup = volume ? 4 : 22; // without a saved volume: 66 GB of model to download first
  const minutes = Math.ceil(setup + (RENDER_MIN[seconds] || 5) * q.cost);
  return { usd: r2((minutes / 60) * WORST_HOURLY), minutes };
}

/** Why a job may not start, or null. Pure: easy to test, impossible to forget. */
function checkCaps(settings, spent, usd) {
  if (usd > settings.capJob) return `This video is estimated at up to $${usd.toFixed(2)}, over your per-video limit of $${settings.capJob.toFixed(2)}. Raise the limit in Settings if you want it.`;
  const used = spent.day === today() ? spent.usd : 0;
  if (used + usd > settings.capDay) return `Today you have used $${used.toFixed(2)} of your $${settings.capDay.toFixed(2)} daily limit. This would take you over it.`;
  return null;
}

const STAGES = [["install", 8], ["download", 25], ["making", 45], ["retry", 45], ["finishing", 92]];
function pctFor(mark, log) {
  const m = String(mark || "").toLowerCase();
  let pct = 3; for (const [k, v] of STAGES) if (m.includes(k)) pct = v;
  if (m.includes("making")) { const s = /(\d{1,3})%\|/.exec(String(log || "")); if (s) pct = 45 + Math.round(0.45 * Math.min(100, Number(s[1]))); }
  return pct;
}

async function fetchImage(url, f = globalThis.fetch) {
  const r = await f(url, { headers: { "User-Agent": "Mozilla/5.0 XUGC" } });
  if (!r.ok) throw new Error(`Could not download a product photo (${r.status}).`);
  const b = Buffer.from(await r.arrayBuffer());
  if (b.length < 1000 || b.length > 12 * 1024 * 1024) throw new Error("A product photo was empty or too big.");
  return b;
}

class Engine {
  /** @param {{store, dir: string, secrets: {get():string}, hf: {get():string}, makeRunPod?: (o:object)=>RunPod}} o */
  constructor({ store, dir, secrets, hf, makeRunPod, fetchImpl }) {
    this.store = store; this.dir = dir; this.secrets = secrets; this.hf = hf;
    this.makeRunPod = makeRunPod || ((o) => new RunPod(o));
    this.job = null; this.fetchImpl = fetchImpl;
    for (const d of ["takes", "work"]) fs.mkdirSync(path.join(dir, d), { recursive: true });
  }
  rp() { const apiKey = this.secrets.get(); if (!apiKey) { const e = new Error("Paste your RunPod key in Settings first."); e.code = "nokey"; throw e; } return this.makeRunPod({ apiKey, volumeId: this.store.read().settings.volumeId }); }
  cancel() { if (this.job) this.job.signal.cancelled = true; return !!this.job; }
  status() { return this.job ? { kind: this.job.kind } : null; }
  addSpend(usd) { const day = today(); this.store.update((s) => { s.spent = { day, usd: r2((s.spent.day === day ? s.spent.usd : 0) + (usd || 0)) }; }); }
  async testKey() { return this.rp().check(); }
  async sweep() { return this.rp().sweep(); }

  /** @param {{prompt: string, seconds: number, quality: string, meta?: object}} job */
  async generate(job, emit) {
    const st = this.store.read();
    if (this.job) { const e = new Error("A GPU job is already running. Wait for it, or press Stop."); e.code = "busy"; throw e; }
    const prompt = String(job.prompt || "").trim();
    if (prompt.length < 20) throw new Error("Write what happens in the video (a sentence or two).");
    const seconds = Number(job.seconds), q = QUALITY[job.quality];
    if (!SECONDS[seconds] || !q) throw new Error("Pick a length (5, 10, 15 or 20 seconds) and a quality.");
    const hf = this.hf.get();
    if (!hf) { const e = new Error("Paste your Hugging Face token in Settings first. The LTX model is free but you have to accept its terms once."); e.code = "nohf"; throw e; }
    const est = estimateGenerate({ seconds, quality: job.quality, volume: !!st.settings.volumeId });
    const why = checkCaps(st.settings, st.spent, est.usd);
    if (why) { const e = new Error(why); e.code = "cap"; throw e; }
    const rp = this.rp();
    const id = `take-${Date.now()}`;
    const used = st.spent.day === today() ? st.spent.usd : 0;
    this.job = { kind: "generate", signal: { cancelled: false } };
    let spent = 0;
    const onProgress = (p) => { spent = p.costUsd || spent; emit({ id, stage: p.stage, pct: p.gone !== undefined ? 100 : pctFor(p.stage, p.log), costUsd: p.costUsd, minutes: p.minutes, log: p.log }); };
    try {
      const dest = path.join(this.dir, "work", id);
      const frames = SECONDS[seconds], inputs = {}, refEnv = [];
      const refs = (job.refs || []).slice(0, 3);
      for (let k = 0; k < refs.length; k++) {
        const buf = refs[k].bytes || (await fetchImage(refs[k].url, this.fetchImpl));
        const ext = (/\.(png|jpe?g|webp)(?:$|\?)/i.exec(refs[k].url || "") || [, "jpg"])[1].toLowerCase();
        const name = `ref${k + 1}.${ext}`; inputs[name] = buf;
        // first photo opens the video, the others are spread through it; frame numbers sit on the model's 8-frame grid
        const idx = k === 0 ? 0 : Math.round(((k / refs.length) * (frames - 1)) / 8) * 8;
        refEnv.push(`${name}:${idx}:${k === 0 ? 1.0 : 0.7}`);
      }
      const r = await rp.run({
        label: "gen", script: "generate.sh", inputs, extraScripts: (job.captions || []).length ? ["burn_captions.py"] : [],
        env: { ...(refEnv.length ? { REFS: refEnv.join(",") } : {}), ...((job.captions || []).length ? { CAPTIONS: JSON.stringify(job.captions) } : {}), PROMPT: prompt, HF_TOKEN: hf, FRAMES: String(SECONDS[seconds]), WIDTH: String(q.w), HEIGHT: String(q.h), SEED: String(Math.floor(Math.random() * 1e9)) },
        outputs: ["clip.mp4", "info.txt", "help.txt"], required: ["clip.mp4"], destDir: dest,
        capUsd: Math.min(st.settings.capJob, st.settings.capDay - used), maxMinutes: est.minutes * 2, signal: this.job.signal, onProgress,
      });
      const video = path.join(this.dir, "takes", `${id}.mp4`);
      fs.copyFileSync(path.join(dest, "clip.mp4"), video);
      let info = ""; try { info = fs.readFileSync(path.join(dest, "info.txt"), "utf8"); } catch {}
      fs.rmSync(dest, { recursive: true, force: true });
      return { id, at: Date.now(), cost: r2(r.costUsd), minutes: r.minutes, prompt, ...(job.meta || {}), seconds, quality: job.quality, model: "XUGC", audio: /codec_type=audio/.test(info), video, poster: null, verdict: null };
    } catch (e) { if (spent) e.costUsd = spent; throw e; }
    finally { this.addSpend(spent); this.job = null; }
  }
}

module.exports = { Engine, estimateGenerate, checkCaps, pctFor, today, RENDER_MIN };

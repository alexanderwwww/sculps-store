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
const { estimate: adEstimate } = require("./google.js");
const { makeAd } = require("./ad.js");
const falLib = require("./fal.js");

const today = () => new Date().toISOString().slice(0, 10);
const r2 = (n) => Math.round(n * 100) / 100;
const RENDER_MIN = { 5: 1.5, 10: 3, 15: 5, 20: 7 }; // H100, HD: a guess

function estimateGenerate({ seconds = 15, quality = "hd", volume = false } = {}) {
  const q = QUALITY[quality] || QUALITY.hd;
  const setup = volume ? 4 : 22; // without a saved volume: 66 GB of model to download first
  const minutes = Math.ceil(setup + (RENDER_MIN[seconds] || 5) * q.cost);
  return { usd: r2((minutes / 60) * WORST_HOURLY), minutes };
}

// Training: minutes on an H100, a GUESS until the first dry run measures them. "dry" = 3 clips, a few steps: proves the pipeline.
const TRAIN_MIN = { ltx: 150, hunyuan: 120, wan: 150 }, DRY_MIN = 45;
function estimateTrain({ model = "wan", dry = true, volume = false, budget = 0 } = {}) {
  if (budget && !dry) return { usd: r2(budget), minutes: Math.floor((budget / WORST_HOURLY) * 60), setup: volume ? 15 : 30 };
  const minutes = Math.ceil((dry ? DRY_MIN : TRAIN_MIN[model] || 150) + (volume ? 0 : 15));
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

// open models the app can run; "ltx" (distilled) is the default
const SCRIPTS = { ltx: "generate.sh", ltx_full: "gen_ltx_full.sh", hunyuan: "gen_hunyuan.sh", wan: "gen_wan.sh" };

class Engine {
  /** @param {{store, dir: string, secrets: {get():string}, hf: {get():string}, makeRunPod?: (o:object)=>RunPod}} o */
  constructor({ store, dir, secrets, hf, makeRunPod, fetchImpl, backupDir, google, fal, ffmpeg }) {
    this.google = google; this.fal = fal; this.ffmpeg = ffmpeg;
    this.backupDir = backupDir || "";
    this.store = store; this.dir = dir; this.secrets = secrets; this.hf = hf;
    this.makeRunPod = makeRunPod || ((o) => new RunPod(o));
    this.job = null; this.fetchImpl = fetchImpl;
    for (const d of ["takes", "work"]) fs.mkdirSync(path.join(dir, d), { recursive: true });
  }
  rp() { const apiKey = this.secrets.get(); if (!apiKey) { const e = new Error("Paste your RunPod key in Settings first."); e.code = "nokey"; throw e; } return this.makeRunPod({ apiKey, volumeId: this.store.read().settings.volumeId }); }
  /** stop training gracefully and keep the checkpoint trained so far */
  finish() { if (this.job && this.job.kind === "train") { this.job.signal.finish = true; return true; } return false; }
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
    if (!hf && (!job.engine || /^ltx/.test(job.engine))) { const e = new Error("Paste your Hugging Face token in Settings first. The LTX model is free but you have to accept its terms once."); e.code = "nohf"; throw e; }
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
        const at = Number.isFinite(refs[k].at) ? Math.min(1, Math.max(0, refs[k].at)) : k === 0 ? 0 : k / refs.length;
        const idx = Math.round((at * (frames - 1)) / 8) * 8;
        const strength = Number.isFinite(refs[k].strength) ? Math.min(1, Math.max(0.1, refs[k].strength)) : k === 0 ? 1.0 : 0.7;
        refEnv.push(`${name}:${idx}:${strength}`);
      }
      // XUGC Real Life: the trained LoRA rides along (LTX engines only for now) and its trigger word leads the prompt
      let useLora = null;
      if (job.lora && /^ltx/.test(job.engine || "ltx")) { useLora = (st.loras || []).find((l) => l.id === job.lora && l.model === "ltx" && fs.existsSync(l.file)); if (useLora) inputs["lora.safetensors"] = useLora.file; }
      const r = await rp.run({
        label: "gen", script: SCRIPTS[job.engine] || "generate.sh", inputs, extraScripts: (job.captions || []).length ? ["burn_captions.py"] : [],
        env: { ...(refEnv.length ? { REFS: refEnv.join(",") } : {}), ...((job.captions || []).length ? { CAPTIONS: JSON.stringify(job.captions) } : {}), PROMPT: useLora ? "xugciphone. " + prompt : prompt, ...(useLora ? { LORA: "1" } : {}), HF_TOKEN: hf || "", FRAMES: String(SECONDS[seconds]), WIDTH: String(q.w), HEIGHT: String(q.h), SEED: String(Math.floor(Math.random() * 1e9)) },
        outputs: ["clip.mp4", "info.txt", "help.txt"], required: ["clip.mp4"], destDir: dest,
        capUsd: Math.min(st.settings.capJob, st.settings.capDay - used), maxMinutes: job.engine && job.engine !== "ltx" ? 45 : est.minutes * 2, signal: this.job.signal, onProgress,
      });
      const video = path.join(this.dir, "takes", `${id}.mp4`);
      fs.copyFileSync(path.join(dest, "clip.mp4"), video);
      let info = ""; try { info = fs.readFileSync(path.join(dest, "info.txt"), "utf8"); } catch {}
      fs.rmSync(dest, { recursive: true, force: true });
      return { id, at: Date.now(), cost: r2(r.costUsd), minutes: r.minutes, prompt, ...(job.meta || {}), seconds, quality: job.quality, model: "XUGC", audio: /codec_type=audio/.test(info), video, poster: null, verdict: null };
    } catch (e) { if (spent) e.costUsd = spent; throw e; }
    finally { this.addSpend(spent); this.job = null; }
  }
  /**
   * An ad on Google's API (Veo + landmark pictures). Same money rules as the GPU: caps checked before anything is paid, spend always counted.
   * @param {{scene: string, seconds: number, tier?: string, refs?: {bytes: Buffer, mime?: string}[], meta?: object}} job
   */
  async generateAd(job, emit) {
    const st = this.store.read();
    if (this.job) { const e = new Error("A job is already running. Wait for it, or press Stop."); e.code = "busy"; throw e; }
    const onFal = falLib.isFal(job.engine);
    const provider = onFal ? this.fal : this.google;
    if (!provider) throw new Error("This model is not set up in this build.");
    const scene = String(job.scene || "").trim();
    if (scene.length < 20) throw new Error("Write what happens in the video (a sentence or two).");
    const seconds = Number(job.seconds) || 16, tier = job.tier || "lite";
    const res = job.res === "480p" ? "480p" : "720p";
    const est = onFal ? falLib.estimate({ engine: job.engine, seconds, tier, res }) : adEstimate({ seconds, tier });
    const why = checkCaps(st.settings, st.spent, est.usd);
    if (why) { const e = new Error(why); e.code = "cap"; throw e; }
    if (onFal) this.fal.auth(); else this.google.hdr(); // no key = clear message before anything starts
    const id = `take-${Date.now()}`;
    this.job = { kind: "generate", signal: { cancelled: false } };
    let spent = 0;
    try {
      const dir = path.join(this.dir, "work", id);
      const pct = { pictures: 10, making: 40, finishing: 92 };
      const r = await makeAd({ google: this.google, ffmpeg: this.ffmpeg, dir, ...(onFal ? { images: this.fal, video: { clip: (o) => this.fal.clip({ ...o, engine: job.engine, res }) }, imageUsd: falLib.IMAGE.usd, clipCost: falLib.MODELS[job.engine].perSec({ tier, res }) * falLib.CLIP } : {}), scene, imageScene: job.imageScene, clipPrompts: job.clipPrompts, seconds, tier, refs: job.refs || [], signal: this.job.signal,
        onStage: (p) => { spent = p.usd || spent; if (emit) emit({ id, stage: p.stage === "pictures" ? `making hidden frame ${p.step} of ${p.of}` : p.stage === "making" ? `making clip ${p.step} of ${p.of}` : "finishing", pct: pct[p.stage] + (p.step ? Math.round(((p.step - 1) / p.of) * 40) : 0), costUsd: spent }); } });
      spent = r.usd;
      const video = path.join(this.dir, "takes", `${id}.mp4`);
      fs.copyFileSync(r.file, video);
      return { id, at: Date.now(), cost: r2(r.usd), prompt: scene, ...(job.meta || {}), seconds: r.clips * 8, quality: "720p", model: onFal ? "Real Life · " + falLib.MODELS[job.engine].label + (job.engine === "fal_veo" ? " " + tier : "") : "Real Life · Veo " + tier, audio: true, video, poster: null, verdict: null, landmarks: r.landmarks };
    } catch (e) { spent = Math.max(spent, e.costUsd || 0); e.costUsd = spent; throw e; }
    finally { this.addSpend(spent); this.job = null; }
  }
  /**
   * Train one "XUGC Real Life" LoRA from the pile. Same money rules: day cap checked first, GPU deleted at the end, whatever it cost is counted.
   * @param {{model: "ltx"|"hunyuan"|"wan", dry?: boolean, pieces: {file: string, meta: object}[]}} job
   */
  async train(job, emit) {
    const st = this.store.read();
    if (this.job) { const e = new Error("A GPU job is already running. Wait for it, or press Stop."); e.code = "busy"; throw e; }
    const model = job.model;
    if (!TRAIN_MIN[model]) throw new Error("Pick a model to train: ltx, hunyuan or wan.");
    const pieces = (job.pieces || []).slice(0, job.dry ? 3 : job.budget ? 100 : 160); // captioning every piece costs GPU minutes, so a budgeted run takes 100
    if (pieces.length < 3) throw new Error("The training pile has fewer than 3 pieces. Press Collect first.");
    const hf = this.hf.get();
    if (model === "ltx" && !hf) { const e = new Error("Paste your Hugging Face token in Settings first (LTX needs it)."); e.code = "nohf"; throw e; }
    const est = estimateTrain({ model, dry: !!job.dry, volume: !!st.settings.volumeId, budget: Number(job.budget) || 0 });
    const used = st.spent.day === today() ? st.spent.usd : 0;
    if (used + est.usd > st.settings.capDay) { const e = new Error(`Today you have used $${used.toFixed(2)} of your $${st.settings.capDay.toFixed(2)} daily limit. This training is estimated at up to $${est.usd.toFixed(2)}.`); e.code = "cap"; throw e; }
    const rp = this.rp();
    const id = `lora-${model}-${job.dry ? "dry-" : ""}${Date.now()}`;
    this.job = { kind: "train", signal: { cancelled: false } };
    let spent = 0;
    const onProgress = (p) => { spent = p.costUsd || spent; emit && emit({ id, stage: p.stage, pct: p.gone !== undefined ? 100 : 5, costUsd: p.costUsd, minutes: p.minutes, log: p.log }); };
    try {
      const inputs = {};
      pieces.forEach((p, i) => { const n = "c" + String(i + 1).padStart(3, "0"); inputs[n + ".mp4"] = p.file; inputs[n + ".json"] = Buffer.from(JSON.stringify(p.meta || {})); });
      const dest = path.join(this.dir, "work", id);
      const r = await rp.run({
        label: "train", script: "train_lora.sh", inputs, extraScripts: ["caption_clips.py"],
        env: { MODEL: model, DRY: job.dry ? "1" : "0", BUDGET: job.budget ? "1" : "0", TRIGGER: "xugciphone", ...(hf ? { HF_TOKEN: hf } : {}) },
        outputs: ["lora.safetensors", "train.log", "caption.log", "help.txt", "layout.txt"], required: ["lora.safetensors"], destDir: dest,
        capUsd: Math.min(est.usd * (job.budget ? 1 : 1.3), st.settings.capDay - used), maxMinutes: job.budget ? undefined : est.minutes * 2, signal: this.job.signal, onProgress,
      });
      fs.mkdirSync(path.join(this.dir, "loras"), { recursive: true });
      const file = path.join(this.dir, "loras", id + ".safetensors");
      fs.copyFileSync(path.join(dest, "lora.safetensors"), file);
      let log = ""; try { log = fs.readFileSync(path.join(dest, "caption.log"), "utf8").split("\n").slice(0, 3).join("\n"); } catch {}
      fs.rmSync(dest, { recursive: true, force: true });
      // the money is paid once: a second copy outside the app's folder, so no app update or reinstall can lose it
      let backup = "";
      try { if (this.backupDir) { fs.mkdirSync(this.backupDir, { recursive: true }); backup = path.join(this.backupDir, id + ".safetensors"); fs.copyFileSync(file, backup); } } catch { backup = ""; }
      const entry = { id, model, dry: !!job.dry, at: Date.now(), clips: pieces.length, cost: r2(r.costUsd), file, backup, name: "XUGC Real Life" };
      this.store.update((s) => { s.loras = [...(s.loras || []), entry]; });
      this.store.update((x) => { x.lastTrain = { at: Date.now(), model, ok: true, error: "", tail: String(r.log || "").trim().split("\n").slice(-12).join("\n").slice(-1500), cost: r2(r.costUsd) }; });
      return { ...entry, sample: log };
    } catch (e) {
      if (spent) e.costUsd = spent;
      // the reason is kept and shown, never lost: the last lines of what the GPU printed, or the error itself
      const tail = String(e.log || e.message || "").trim().split("\n").slice(-40).join("\n");
      this.store.update((x) => { x.lastTrain = { at: Date.now(), model, ok: false, error: String(e.message || e).split("\n")[0].slice(0, 300), tail: tail.slice(-3500), cost: r2(spent) }; });
      throw e;
    }
    finally { this.addSpend(spent); this.job = null; }
  }
}

module.exports = { Engine, adEstimate, fetchImage, estimateTrain, estimateGenerate, checkCaps, pctFor, today, RENDER_MIN };

/**
 * The engine: what happens when he presses Generate or Train. Real GPUs, real money.
 *
 * Money rules live here and nowhere else, so no screen can forget them:
 *
 *   - A job whose estimate is over the per-job cap is REFUSED before anything is rented.
 *   - A job that would take the day past the daily cap is REFUSED before anything is rented.
 *   - The job's own cap is passed down to runpod.js, which stops the job and deletes the GPU when reached.
 *   - Full training is REFUSED until a cheap test run (3 clips, 1 epoch) has produced a model once.
 *   - One GPU job at a time.
 *   - Whatever a job cost, even a failed one, is added to today's spending.
 *
 * Estimates use the dearest GPU RunPod could give us, so they are a ceiling, not a hope.
 */
const fs = require("node:fs");
const path = require("node:path");
const { RunPod, WORST_HOURLY } = require("./runpod.js");

// The same words are put in front of every training caption and every generation prompt,
// so the trained model recognises the style it was taught.
const STYLE = "Handheld smartphone UGC video, vertical 9:16, natural light, slight camera shake.";
const LOOKS = {
  Selfie: "The person films themselves selfie-style, talking to the camera.",
  Unboxing: "The person unboxes the product on a table and shows it to the camera.",
  Demo: "The person demonstrates the product and points at what it does.",
  Testimonial: "The person talks to the camera like a friend recommending the product.",
};
const CLIPS_PER_VIDEO = 3; // a typical 15-second UGC video; used only for the estimate
const SECONDS_PER_STEP = 12; // an A100 estimate for 14B at 480x832x81; UNPROVEN until the first real run

const today = () => new Date().toISOString().slice(0, 10);
const r2 = (n) => Math.round(n * 100) / 100;

function setupMinutes(volume) { return volume ? 5 : 18; } // downloading ~60 GB of model, unless a saved volume has it
function estimateGenerate({ volume = false } = {}) {
  const minutes = setupMinutes(volume) + 10;
  return { usd: r2((minutes / 60) * WORST_HOURLY), minutes };
}
function epochsFor(clips) { return Math.min(30, Math.max(6, Math.ceil(1500 / Math.max(1, clips)))); }
function estimateTrain({ videos = 1, dry = false, volume = false } = {}) {
  const clips = videos * CLIPS_PER_VIDEO;
  const epochs = dry ? 1 : epochsFor(clips);
  const steps = (dry ? 3 : clips) * epochs;
  const minutes = setupMinutes(volume) + 12 + Math.ceil((steps * SECONDS_PER_STEP) / 60);
  return { usd: r2((minutes / 60) * WORST_HOURLY), minutes, hours: Math.round((minutes / 60) * 10) / 10, epochs, clips };
}

/** Why a job may not start, or null. Pure: easy to test, impossible to forget. */
function checkCaps(settings, spent, usd, kind = "generate") {
  const cap = kind === "train" ? settings.capTrain : settings.capJob;
  if (usd > cap) return `This ${kind === "train" ? "training run" : "video"} is estimated at up to $${usd.toFixed(2)}, over your ${kind === "train" ? "training" : "per-video"} limit of $${cap.toFixed(2)}. Raise the limit in Settings if you want it.`;
  const used = spent.day === today() ? spent.usd : 0;
  if (used + usd > settings.capDay) return `Today you have used $${used.toFixed(2)} of your $${settings.capDay.toFixed(2)} daily limit. This would take you over it.`;
  return null;
}

const GEN_STAGES = [["install", 12], ["download", 28], ["making", 55], ["done", 94]];
const TRAIN_STAGES = [["install", 6], ["models", 20], ["preparing", 30], ["caching", 38], ["training", 40], ["done", 96]];
function pctFor(table, mark, log) {
  const m = String(mark || "").toLowerCase();
  let pct = 3; for (const [k, v] of table) if (m.includes(k)) pct = v;
  if (m.includes("training")) { const s = /(\d{1,3})%\|/.exec(String(log || "")); if (s) pct = 40 + Math.round(0.55 * Math.min(100, Number(s[1]))); }
  return pct;
}

class Engine {
  /** @param {{store, dir: string, secrets: {get():string}, makeRunPod?: (o:object)=>RunPod}} o */
  constructor({ store, dir, secrets, makeRunPod }) {
    this.store = store; this.dir = dir; this.secrets = secrets;
    this.makeRunPod = makeRunPod || ((o) => new RunPod(o));
    this.job = null;
    for (const d of ["takes", "models", "work"]) fs.mkdirSync(path.join(dir, d), { recursive: true });
  }

  rp() { const apiKey = this.secrets.get(); if (!apiKey) { const e = new Error("Paste your RunPod key in Settings first."); e.code = "nokey"; throw e; } return this.makeRunPod({ apiKey, volumeId: this.store.read().settings.volumeId }); }
  begin(kind) { if (this.job) { const e = new Error("A GPU job is already running. Wait for it, or press Stop."); e.code = "busy"; throw e; } this.job = { kind, signal: { cancelled: false } }; return this.job; }
  cancel() { if (this.job) this.job.signal.cancelled = true; return !!this.job; }
  status() { return this.job ? { kind: this.job.kind } : null; }

  addSpend(usd) { const day = today(); this.store.update((s) => { s.spent = { day, usd: r2((s.spent.day === day ? s.spent.usd : 0) + (usd || 0)) }; }); }

  async testKey() { return this.rp().check(); }
  async sweep() { return this.rp().sweep(); }

  /** Run on a job object with a progress sink; adds up what was spent no matter how it ends. */
  async guarded(kind, table, emit, id, body) {
    const job = this.begin(kind); let spent = 0;
    const onProgress = (p) => { spent = p.costUsd || spent; emit({ id, stage: p.stage, pct: p.gone !== undefined ? 100 : pctFor(table, p.stage, p.log), costUsd: p.costUsd, minutes: p.minutes, log: p.log }); };
    try { return await body(job, onProgress); }
    catch (e) { if (spent) e.costUsd = spent; throw e; }
    finally { this.addSpend(spent); this.job = null; }
  }

  async generate(job, emit) {
    const st = this.store.read();
    if (this.job) { const e = new Error("A GPU job is already running. Wait for it, or press Stop."); e.code = "busy"; throw e; }
    if (!job || !job.frame) throw new Error("Pick a start frame first: a picture of your person holding your product.");
    const frame = Buffer.from(String(job.frame), "base64");
    if (frame.length < 2000 || frame.length > 12 * 1024 * 1024) throw new Error("That start frame image is empty or too big.");
    const prompt = String(job.prompt || "").trim();
    if (prompt.length < 10) throw new Error("Write what happens in the video (a sentence or two).");
    const model = st.models.find((m) => m.id === job.modelId) || st.models[0];
    if (model.kind === "lora" && !fs.existsSync(model.file)) throw new Error(`The file for ${model.name} is missing from this Mac.`);
    const est = estimateGenerate({ volume: !!st.settings.volumeId });
    const why = checkCaps(st.settings, st.spent, est.usd, "generate");
    if (why) { const e = new Error(why); e.code = "cap"; throw e; }
    const rp = this.rp();
    const id = `take-${Date.now()}`;
    const used = st.spent.day === today() ? st.spent.usd : 0;
    const full = `${STYLE} ${LOOKS[job.look] || ""} ${prompt}`.replace(/\s+/g, " ").trim();
    return this.guarded("generate", GEN_STAGES, emit, id, async (j, onProgress) => {
      const dest = path.join(this.dir, "work", id);
      const inputs = { "first.png": frame };
      if (model.kind === "lora") inputs["lora.safetensors"] = model.file;
      const r = await rp.run({ label: "gen", script: "generate.sh", inputs, env: { PROMPT: full }, outputs: ["clip.mp4"], required: ["clip.mp4"], destDir: dest, capUsd: Math.min(st.settings.capJob, st.settings.capDay - used), maxMinutes: est.minutes * 2, signal: j.signal, onProgress });
      const video = path.join(this.dir, "takes", `${id}.mp4`), poster = path.join(this.dir, "takes", `${id}.jpg`);
      fs.copyFileSync(path.join(dest, "clip.mp4"), video); fs.writeFileSync(poster, frame);
      fs.rmSync(dest, { recursive: true, force: true });
      const take = { id, at: Date.now(), cost: r2(r.costUsd), minutes: r.minutes, prompt, look: job.look || "", model: model.name, modelId: model.id, seconds: 5, video, poster, verdict: null };
      this.store.update((s) => { s.proof.firstClip = true; });
      return take;
    });
  }

  async train(opts, emit) {
    const st = this.store.read();
    if (this.job) { const e = new Error("A GPU job is already running. Wait for it, or press Stop."); e.code = "busy"; throw e; }
    const dry = !!opts.dry;
    if (!st.dataset.length) throw new Error("Add at least one video first.");
    for (const c of st.dataset) if (!fs.existsSync(c.file)) throw new Error(`${c.name} is no longer on this Mac. Remove it from the list.`);
    if (!dry && !st.proof.dryTrain) { const e = new Error("Run the test first (3 clips, 1 round). It proves the whole chain for about $2 before the real training spends real money."); e.code = "needtest"; throw e; }
    const videos = dry ? st.dataset.slice(0, 2) : st.dataset;
    const est = estimateTrain({ videos: videos.length, dry, volume: !!st.settings.volumeId });
    const why = checkCaps(st.settings, st.spent, est.usd, "train");
    if (why) { const e = new Error(why); e.code = "cap"; throw e; }
    const rp = this.rp();
    const n = st.models.filter((m) => m.kind === "lora").length + 1;
    const mid = `ugc-${n}`;
    const used = st.spent.day === today() ? st.spent.usd : 0;
    return this.guarded("train", TRAIN_STAGES, emit, mid, async (j, onProgress) => {
      const inputs = {}, caps = {};
      videos.forEach((c, i) => { const ext = (path.extname(c.file) || ".mp4").toLowerCase(); const nm = `v-${String(i + 1).padStart(4, "0")}${ext}`; inputs[nm] = c.file; if (c.caption && c.caption.trim()) caps[nm] = c.caption.trim(); });
      inputs["captions.json"] = Buffer.from(JSON.stringify(caps));
      const dest = path.join(this.dir, "work", mid);
      const file = `${mid}.safetensors`;
      const r = await rp.run({ label: dry ? "test" : "train", script: "train.sh", inputs, env: { LORA_NAME: mid, EPOCHS: String(est.epochs), DRY: dry ? "1" : "0", CAPTION_PREFIX: STYLE }, outputs: [file, "manifest.json", "captions-sample.txt"], required: [file], destDir: dest, capUsd: Math.min(st.settings.capTrain, st.settings.capDay - used), maxMinutes: Math.ceil(est.minutes * 1.6), signal: j.signal, onProgress });
      const keep = path.join(this.dir, "models");
      fs.copyFileSync(path.join(dest, file), path.join(keep, file));
      for (const x of ["manifest.json", "captions-sample.txt"]) if (fs.existsSync(path.join(dest, x))) fs.copyFileSync(path.join(dest, x), path.join(keep, `${mid}.${x}`));
      let sample = ""; try { sample = fs.readFileSync(path.join(dest, "captions-sample.txt"), "utf8").slice(0, 600); } catch {}
      fs.rmSync(dest, { recursive: true, force: true });
      const model = { id: mid, name: dry ? `${opts.name || "UGC"}-test` : opts.name || `UGC-0${n}`, kind: "lora", file: path.join(keep, file), clips: est.clips, epochs: est.epochs, test: dry, cost: r2(r.costUsd), at: Date.now(), sample };
      this.store.update((s) => { s.models.push(model); if (dry) s.proof.dryTrain = true; });
      return model;
    });
  }
}

module.exports = { Engine, estimateGenerate, estimateTrain, checkCaps, epochsFor, STYLE, LOOKS, today, pctFor, GEN_STAGES, TRAIN_STAGES };

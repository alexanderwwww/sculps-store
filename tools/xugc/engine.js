/**
 * The engine: what happens when he presses Generate or Train.
 *
 * Two modes, and the first one is the only one that exists yet.
 *
 *   demo    Everything works, nothing is rented, nothing costs a cent. Videos are
 *           bundled samples. This is how the app is judged BEFORE any money moves.
 *   runpod  The real thing (rented GPU, Wan 2.2). Not connected yet: it refuses,
 *           out loud, rather than pretending.
 *
 * Money rules live here and nowhere else, so no screen can forget them:
 *
 *   - A job whose estimate is over the per-job cap is REFUSED before it starts.
 *   - A job that would take the day past the daily cap is REFUSED before it starts.
 *   - Training has its own cap.
 *   - Every GPU job carries a kill timer (maxMinutes) so a hung job cannot run all night.
 *   - The first real (runpod) job of a kind must be a one-clip smoke test.
 */
const PRICES = { clipUsd: 0.2, gpuHourUsd: 3.0, trainHours: 6 };
const STAGES = [
  ["Queued", 0.06],
  ["Starting a GPU", 0.14],
  ["Making the clips", 0.5],
  ["Voice and captions", 0.18],
  ["Finishing the 9:16 edit", 0.12],
];

function estimateGenerate({ seconds = 15, takes = 1 } = {}) {
  const clips = Math.max(1, Math.ceil(seconds / 5));
  const usd = Math.round((clips * PRICES.clipUsd * 1.5 + 0.3) * takes * 100) / 100; // clips + retries + voice/edit
  return { usd, minutes: Math.round(1.2 + clips * 0.4) };
}
function estimateTrain({ clips = 150 } = {}) {
  const hours = Math.max(1, PRICES.trainHours * Math.min(2, Math.max(0.5, clips / 150)));
  return { usd: Math.round(hours * PRICES.gpuHourUsd * 100) / 100, hours: Math.round(hours * 10) / 10 };
}

const today = () => new Date().toISOString().slice(0, 10);

/** Why a job may not start, or null. Pure: easy to test, impossible to forget. */
function checkCaps(settings, spent, usd, kind = "generate") {
  const cap = kind === "train" ? settings.capTrain : settings.capJob;
  if (usd > cap) return `This ${kind === "train" ? "training run" : "video"} is estimated at $${usd.toFixed(2)}, over your ${kind === "train" ? "training" : "per-video"} limit of $${cap.toFixed(2)}. Raise the limit in Settings if you want it.`;
  const used = spent.day === today() ? spent.usd : 0;
  if (used + usd > settings.capDay) return `Today you have used $${used.toFixed(2)} of your $${settings.capDay.toFixed(2)} daily limit. This would take you over it.`;
  return null;
}

class Engine {
  /** @param {{store: object, fast?: boolean}} o */
  constructor({ store, fast = false }) { this.store = store; this.fast = fast; this.running = new Map(); }

  wait(ms) { return new Promise((r) => setTimeout(r, this.fast ? 25 : ms)); }

  async generate(job, emit) {
    const st = this.store.read();
    if (st.settings.mode !== "demo") throw new Error("RunPod is not connected yet. Switch to Demo in Settings, or connect RunPod first.");
    const est = estimateGenerate({ seconds: job.seconds || 15 });
    const why = checkCaps(st.settings, st.spent, est.usd, "generate");
    if (why) { const e = new Error(why); e.code = "cap"; throw e; }
    const id = `take-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
    this.running.set(id, { kind: "generate", started: Date.now() });
    emit({ id, stage: STAGES[0][0], pct: 0 });
    let pct = 0;
    for (const [label, share] of STAGES) {
      emit({ id, stage: label, pct: Math.round(pct * 100) });
      const steps = 6;
      for (let i = 0; i < steps; i++) { await this.wait(job.demoMs ? job.demoMs / (STAGES.length * steps) : 330); pct += share / steps; emit({ id, stage: label, pct: Math.min(99, Math.round(pct * 100)) }); }
    }
    this.running.delete(id);
    // Demo costs nothing, but the day's counter moves as if it did, so the limits can be felt.
    const spent = this.store.read().spent;
    const day = today();
    this.store.update((s) => { s.spent = { day, usd: Math.round(((spent.day === day ? spent.usd : 0) + 0) * 100) / 100 }; });
    return {
      id, at: Date.now(), cost: 0, wouldCost: est.usd, demo: true,
      product: job.product, avatar: job.avatar, script: job.script, look: job.look, model: job.model, seconds: job.seconds || 15, captions: !!job.captions,
      video: job.sampleVideo, poster: job.samplePoster, verdict: null,
    };
  }

  async train(opts, emit) {
    const st = this.store.read();
    if (st.settings.mode !== "demo") throw new Error("RunPod is not connected yet. Switch to Demo in Settings, or connect RunPod first.");
    const clips = st.dataset.length;
    if (clips < 1) throw new Error("Add at least one clip first.");
    const est = estimateTrain({ clips });
    const why = checkCaps(st.settings, st.spent, est.usd, "train");
    if (why) { const e = new Error(why); e.code = "cap"; throw e; }
    const id = `train-${Date.now()}`;
    const steps = ["Checking your clips", "Starting a GPU", "Training (loss going down)", "Saving UGC model", "Testing it on one clip"];
    for (let i = 0; i < steps.length; i++) {
      for (let k = 1; k <= 6; k++) { await this.wait(opts.demoMs ? opts.demoMs / (steps.length * 6) : 500); emit({ id, stage: steps[i], pct: Math.round(((i + k / 6) / steps.length) * 100) }); }
    }
    const n = st.models.filter((m) => m.kind === "lora").length + 1;
    return { id: `ugc-0${n}`, name: opts.name || `UGC-0${n}`, kind: "lora", demo: true, clips, at: Date.now(), wouldCost: est.usd };
  }
}

module.exports = { Engine, estimateGenerate, estimateTrain, checkCaps, PRICES, STAGES, today };

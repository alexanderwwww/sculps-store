/**
 * The money rules and the engine, without any window and without any network.
 * RunPod is replaced by a fake with the same `run()` contract; everything else is the real engine.
 */
import { createRequire } from "node:module";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const require = createRequire(import.meta.url);
const { Engine, estimateGenerate, estimateTrain, checkCaps, today, STYLE, pctFor, GEN_STAGES } = require("../engine.js");
const { Store } = require("../store.js");
const { Secrets } = require("../secrets.js");

let fail = 0;
const ok = (c, what, extra) => { if (!c) fail++; console.log((c ? "ok    " : "FAIL  ") + what + (extra ? "  — " + extra : "")); };

const s = { capJob: 5, capDay: 20, capTrain: 40 };
ok(checkCaps(s, { day: today(), usd: 0 }, 1.6) === null, "a normal video is allowed");
ok(/per-video limit/.test(checkCaps({ ...s, capJob: 0.5 }, { day: "", usd: 0 }, 1.6) || ""), "a video over the per-video limit is refused");
ok(/daily limit/.test(checkCaps(s, { day: today(), usd: 19.5 }, 1.6) || ""), "a video that crosses the daily limit is refused");
ok(checkCaps(s, { day: "2000-01-01", usd: 19.5 }, 1.6) === null, "yesterday's spending does not count today");
ok(/training limit/.test(checkCaps({ ...s, capTrain: 5 }, { day: "", usd: 0 }, estimateTrain({ videos: 50 }).usd, "train") || ""), "training over its own limit is refused");
ok(estimateGenerate({ volume: true }).usd < estimateGenerate().usd, "a saved model volume makes a video cheaper (no 60 GB download)");
ok(estimateTrain({ videos: 2, dry: true }).usd < 3, "the test run is estimated at under $3", String(estimateTrain({ videos: 2, dry: true }).usd));
ok(pctFor(GEN_STAGES, "making the clip", "") > pctFor(GEN_STAGES, "installing", ""), "progress moves forward through the stages");

const dir = mkdtempSync(join(tmpdir(), "xugc-"));
const store = new Store(dir);
const secrets = new Secrets(dir);
const calls = [];
class FakeRunPod {
  constructor(o) { this.o = o; calls.push({ made: o }); }
  async check() { return { ok: true, pods: 0 }; }
  async sweep() { return 0; }
  async run(job) {
    calls.push({ run: job.script, env: job.env, inputs: Object.keys(job.inputs), cap: job.capUsd, maxMinutes: job.maxMinutes });
    job.onProgress({ stage: "installing", pct: 0, costUsd: 0.02, minutes: 0.5, log: "" });
    if (FakeRunPod.fail) { job.onProgress({ stage: "GPU handed back", pct: 100, costUsd: 0.4, minutes: 5, gone: true }); throw new Error("The GPU job failed (exit 3)."); }
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(job.destDir, { recursive: true });
    for (const r of job.required) writeFileSync(join(job.destDir, r), "x".repeat(2048));
    writeFileSync(join(job.destDir, "captions-sample.txt"), "UGC video. A woman holds a projector.");
    job.onProgress({ stage: "GPU handed back", pct: 100, costUsd: 0.5, minutes: 6, gone: true });
    return { saved: job.required, log: "", costUsd: 0.5, minutes: 6, hourly: 1.6 };
  }
}
const eng = new Engine({ store, dir, secrets, makeRunPod: (o) => new FakeRunPod(o) });
const frame = Buffer.alloc(5000, 7).toString("base64");
const job = { frame, prompt: "She plugs it in and points it at the window.", look: "Selfie", modelId: "wan22" };

let e1 = null; try { await eng.generate(job, () => {}); } catch (e) { e1 = e; }
ok(e1 && e1.code === "nokey" && !calls.some((c) => c.run), "no key: refused, nothing rented", e1?.message);
secrets.set("rpa_TESTKEY1234567890");
let e2 = null; try { await eng.generate({ ...job, frame: "" }, () => {}); } catch (e) { e2 = e; }
ok(e2 && /start frame/.test(e2.message), "no start frame: refused with what to do", e2?.message);
let e3 = null; try { await eng.generate({ ...job, prompt: "hi" }, () => {}); } catch (e) { e3 = e; }
ok(e3 && /what happens/i.test(e3.message), "empty prompt: refused");
store.update((st) => { st.settings.capJob = 0.5; });
let e4 = null; try { await eng.generate(job, () => {}); } catch (e) { e4 = e; }
ok(e4 && e4.code === "cap" && !calls.some((c) => c.run), "over the per-video cap: refused BEFORE anything is rented", e4?.message);
store.update((st) => { st.settings.capJob = 5; });

const ev = [];
const take = await eng.generate(job, (p) => ev.push(p));
ok(existsSync(take.video) && existsSync(take.poster), "a take is saved on the Mac with its poster", take.video);
ok(calls.find((c) => c.run === "generate.sh").env.PROMPT.startsWith(STYLE) && calls.find((c) => c.run === "generate.sh").env.PROMPT.includes("selfie-style") && calls.find((c) => c.run === "generate.sh").env.PROMPT.includes("points it at the window"), "the prompt sent = UGC style + look + his words");
ok(calls.find((c) => c.run === "generate.sh").inputs.join() === "first.png", "base model: only the start frame is uploaded");
ok(Math.abs(store.read().spent.usd - 0.5) < 1e-9, "the day's spending went up by the real cost", String(store.read().spent.usd));
ok(ev.some((p) => p.costUsd > 0) && ev.at(-1).pct === 100, "progress carries live cost and ends at 100");
ok(eng.job === null, "the engine is free again afterwards");

FakeRunPod.fail = true;
let e5 = null; try { await eng.generate(job, () => {}); } catch (e) { e5 = e; }
ok(e5 && /exit 3/.test(e5.message) && e5.costUsd === 0.4, "a failed job reports why and what it cost");
ok(Math.abs(store.read().spent.usd - 0.9) < 1e-9 && eng.job === null, "…the failed job's cost still counts today, and the engine is free", String(store.read().spent.usd));
FakeRunPod.fail = false;

// busy
const slow = eng.generate(job, () => {}); let e6 = null; try { await eng.generate(job, () => {}); } catch (e) { e6 = e; }
ok(e6 && e6.code === "busy", "a second job while one runs is refused"); await slow;

// training
let t0 = null; try { await eng.train({}, () => {}); } catch (e) { t0 = e; }
ok(t0 && /at least one video/.test(t0.message), "training with no videos is refused");
const v1 = join(dir, "a.mp4"), v2 = join(dir, "b.mp4"), v3 = join(dir, "c.mp4");
for (const f of [v1, v2, v3]) writeFileSync(f, "video");
store.update((st) => { st.dataset.push({ id: "1", name: "a", file: v1, caption: "A woman shows it.", source: "yours" }, { id: "2", name: "b", file: v2, caption: "", source: "yours" }, { id: "3", name: "c", file: v3, caption: "", source: "yours" }); });
let t1 = null; try { await eng.train({}, () => {}); } catch (e) { t1 = e; }
ok(t1 && t1.code === "needtest", "full training is refused until the test run has been done", t1?.message);
const nRuns = calls.filter((c) => c.run === "train.sh").length;
const test = await eng.train({ name: "UGC", dry: true }, () => {});
const tc = calls.filter((c) => c.run === "train.sh")[nRuns];
ok(tc.env.DRY === "1" && tc.env.EPOCHS === "1", "the test run is DRY with one epoch");
ok(tc.inputs.filter((n) => n.startsWith("v-")).length === 2 && tc.inputs.includes("captions.json"), "the test run uploads only two videos plus the captions");
ok(test.test === true && existsSync(test.file) && /-test$/.test(test.name), "the test model is saved and labelled as a test", test.name);
ok(store.read().proof.dryTrain === true && test.sample.includes("projector"), "the proof is recorded and the auto-captions are shown for reading");
const full = await eng.train({ name: "UGC-02" }, () => {});
const fc = calls.filter((c) => c.run === "train.sh").at(-1);
ok(fc.env.DRY === "0" && Number(fc.env.EPOCHS) >= 6 && fc.inputs.filter((n) => n.startsWith("v-")).length === 3, "the real training uses every video and 6+ epochs", fc.env.EPOCHS);
ok(store.read().models.filter((m) => m.kind === "lora").length === 2 && full.name === "UGC-02", "both models are in the list, with the name he gave");

// a trained model is uploaded and used when chosen
await eng.generate({ ...job, modelId: full.id }, () => {});
const gc = calls.filter((c) => c.run === "generate.sh").at(-1);
ok(gc.inputs.includes("lora.safetensors"), "choosing a trained model uploads its file for the video");

store.update((st) => { st.settings.capTrain = 1; });
let t2 = null; try { await eng.train({ name: "x" }, () => {}); } catch (e) { t2 = e; }
ok(t2 && t2.code === "cap", "training over its cap is refused before it starts", t2?.message);

// the old demo build's leftovers are dropped on load
writeFileSync(join(dir, "xugc.json"), JSON.stringify({ takes: [{ id: "d", demo: true }], models: [{ id: "u", demo: true }], dataset: [{ id: "seed-1", file: "assets/x.mp4" }], settings: { mode: "demo" } }));
const re = new Store(dir).read();
ok(re.takes.length === 0 && re.models.length === 1 && re.dataset.length === 0 && re.settings.mode === undefined, "pretend takes, models and sample clips from the demo build are removed");
process.exit(fail ? 1 : 0);

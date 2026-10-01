/** The money rules and the engine, without any window. A job over a limit must be refused BEFORE it starts. */
import { createRequire } from "node:module";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const require = createRequire(import.meta.url);
const { Engine, estimateGenerate, estimateTrain, checkCaps, today } = require("../engine.js");
const { Store } = require("../store.js");

let fail = 0;
const ok = (c, what, extra) => { if (!c) fail++; console.log((c ? "ok    " : "FAIL  ") + what + (extra ? "  — " + extra : "")); };

const s = { capJob: 5, capDay: 20, capTrain: 40 };
ok(estimateGenerate({ seconds: 15 }).usd === 1.2, "15s video is estimated at $1.20", String(estimateGenerate({ seconds: 15 }).usd));
ok(estimateGenerate({ seconds: 30 }).usd > estimateGenerate({ seconds: 15 }).usd, "30s costs more than 15s");
ok(checkCaps(s, { day: today(), usd: 0 }, 1.2) === null, "a normal video is allowed");
ok(/per-video limit/.test(checkCaps({ ...s, capJob: 0.5 }, { day: "", usd: 0 }, 1.2) || ""), "a video over the per-video limit is refused");
ok(/daily limit/.test(checkCaps(s, { day: today(), usd: 19.5 }, 1.2) || ""), "a video that crosses the daily limit is refused");
ok(checkCaps(s, { day: "2000-01-01", usd: 19.5 }, 1.2) === null, "yesterday's spending does not count today");
ok(/training limit/.test(checkCaps({ ...s, capTrain: 5 }, { day: "", usd: 0 }, estimateTrain({ clips: 150 }).usd, "train") || ""), "training over its own limit is refused");

const store = new Store(mkdtempSync(join(tmpdir(), "xugc-")));
const eng = new Engine({ store, fast: true });
const events = [];
const take = await eng.generate({ product: "P", avatar: "Maya", script: "hi", look: "Selfie", model: "Wan 2.2", seconds: 15, captions: true, sampleVideo: "assets/samples/ugc-projector.mp4", samplePoster: "assets/samples/hp-ip-s02.webp" }, (e) => events.push(e));
ok(take.demo === true && take.cost === 0, "demo generate costs nothing and says it is demo");
ok(take.video === "assets/samples/ugc-projector.mp4", "the take carries a playable video");
ok(events.length > 10 && events.at(-1).pct < 100, "progress is reported all the way", `${events.length} events`);
ok(new Set(events.map((e) => e.stage)).size === 5, "all five stages are shown");

store.update((st) => { st.settings.capJob = 0.5; });
let refused = null; try { await eng.generate({ seconds: 15 }, () => {}); } catch (e) { refused = e; }
ok(refused && refused.code === "cap", "engine refuses a job over the cap and never starts it", refused?.message);

store.update((st) => { st.settings.capJob = 5; st.settings.mode = "runpod"; });
let rp = null; try { await eng.generate({ seconds: 15 }, () => {}); } catch (e) { rp = e; }
ok(rp && /not connected/.test(rp.message), "runpod mode says it is not connected instead of pretending", rp?.message);

store.update((st) => { st.settings.mode = "demo"; st.dataset.push({ id: "a", name: "a", file: "x", caption: "c", source: "yours" }); });
const m = await eng.train({ name: "UGC-02" }, () => {});
ok(m.kind === "lora" && m.name === "UGC-02", "training returns a new model with the name asked for");
store.update((st) => { st.settings.capTrain = 1; });
let tr = null; try { await eng.train({}, () => {}); } catch (e) { tr = e; }
ok(tr && tr.code === "cap", "training over the cap is refused before it starts", tr?.message);
store.update((st) => { st.dataset = []; st.settings.capTrain = 40; });
let nc = null; try { await eng.train({}, () => {}); } catch (e) { nc = e; }
ok(nc && /at least one clip/.test(nc.message), "training with no clips is refused", nc?.message);
process.exit(fail ? 1 : 0);

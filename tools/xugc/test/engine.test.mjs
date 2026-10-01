/**
 * The money rules, the engine, the prompt builder, the Style Bible and the product reader,
 * without any window and without any network. RunPod is replaced by a fake with the same run() contract.
 */
import { createRequire } from "node:module";
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import http from "node:http";
const require = createRequire(import.meta.url);
const { Engine, estimateGenerate, checkCaps, today, pctFor } = require("../engine.js");
const { Store } = require("../store.js");
const { Secrets } = require("../secrets.js");
const { Style, compose, sections } = require("../compose.js");
const { fetchProduct } = require("../product.js");

let fail = 0;
const ok = (c, what, extra) => { if (!c) fail++; console.log((c ? "ok    " : "FAIL  ") + what + (extra ? "  — " + extra : "")); };

// ---- money
const s = { capJob: 5, capDay: 20 };
ok(checkCaps(s, { day: today(), usd: 0 }, 1.6) === null, "a normal video is allowed");
ok(/per-video limit/.test(checkCaps({ ...s, capJob: 0.5 }, { day: "", usd: 0 }, 1.6) || ""), "a video over the per-video limit is refused");
ok(/daily limit/.test(checkCaps(s, { day: today(), usd: 19.5 }, 1.6) || ""), "a video that crosses the daily limit is refused");
ok(checkCaps(s, { day: "2000-01-01", usd: 19.5 }, 1.6) === null, "yesterday's spending does not count today");
ok(estimateGenerate({ seconds: 15, quality: "hd", volume: true }).usd < estimateGenerate({ seconds: 15, quality: "hd" }).usd, "a saved model volume makes a video cheaper");
ok(estimateGenerate({ seconds: 20, quality: "full" }).usd > estimateGenerate({ seconds: 5, quality: "draft" }).usd, "longer and sharper costs more");
ok(pctFor("making the video", "") > pctFor("installing", "") && pctFor("making the video", "  40%|") > pctFor("making the video", ""), "progress moves forward through the stages and inside rendering");

// ---- Style Bible and prompt
const dir = mkdtempSync(join(tmpdir(), "xugc-"));
const style = new Style(join(dir, "style"), join(process.cwd(), "assets", "style"));
ok(style.list().length === 13 && style.list().every((f) => f.on), "the thirteen starter style files are installed and on");
const g = style.gather(["hooks.md"]);
ok(g.prompt.some((l) => /iPhone/.test(l)) && !g.prompt.some((l) => /Ends abruptly, the way a real person/.test(l)), "a switched-off file contributes nothing");
ok(g.never.length > 12, "a big '## Never' list is collected for the Avoid section", String(g.never.length));
ok(sections("# x\nprose\n## Prompt\n- one\n- two\n## Other\n- no\n## Never\n- three").prompt.join() === "one,two", "only lines under '## Prompt' go into the prompt");
const p1 = compose({ scene: "She plugs it in and a ghost appears on the window", look: "Demo", avatar: "maya", product: { title: "Haunted Projector", desc: "Plug-in ghost projector" }, seconds: 15 }, g);
ok(p1.includes("Maya") && p1.includes("Haunted Projector") && p1.includes("a ghost appears on the window") && p1.includes("Avoid:") && p1.includes("15 seconds"), "the prompt carries person, product, scene, style, avoid list and length");
ok(p1 === compose({ scene: "She plugs it in and a ghost appears on the window", look: "Demo", avatar: "maya", product: { title: "Haunted Projector", desc: "Plug-in ghost projector" }, seconds: 15 }, g), "the same inputs always give the same prompt");
let bad = null; try { style.write("../evil.md", "x"); } catch (e) { bad = e; } ok(!!bad, "a path-escaping style file name is refused");
style.write("my-style.md", "# my-style.md\n## Prompt\n- She whispers\n"); ok(style.gather().prompt.includes("She whispers"), "a file written by Claude or by Alex is used straight away");

ok(compose({ scene: "scene text here ok", seconds: 10, music: "drop" }, g).includes("bass drop") && !compose({ scene: "scene text here ok", seconds: 10, music: "none" }, g).includes("beat plays"), "music is an option: none, soft beat, or a beat drop");
ok(compose({ scene: "scene text here ok", seconds: 10 }, g).length > 3500, "the prompt is huge by default (people, camera, sound, a long Avoid list)", String(compose({ scene: "scene text here ok", seconds: 10 }, g).length));
style.addNever("the man looked like he was in a costume"); ok(style.gather().never.includes("the man looked like he was in a costume"), "a 👎 note is added to the Avoid list");
ok(g.captions.length === 2 && g.captions[0].text === "BREAKING NEWS" && g.captions[0].end === 4, "the Style Bible's '## Captions' lines become on-screen captions with timings", JSON.stringify(g.captions[0]));
ok(compose({ scene: "scene text here ok", seconds: 10 }, g).length > 6000, "with the deeper files the default prompt is very large", String(compose({ scene: "scene text here ok", seconds: 10 }, g).length));
const ref = { level: 2, beats: "0-3s: a man kneels beside a flat black heap and starts a blower. 3-6s: it rises." };
const pr0 = compose({ scene: "scene text here ok", seconds: 10 }, g), pr1 = compose({ scene: "scene text here ok", seconds: 10, reference: { ...ref, level: 1 } }, g), pr2 = compose({ scene: "scene text here ok", seconds: 10, reference: ref, product: { title: "The 16 ft Scream" } }, g), pr3 = compose({ scene: "scene text here ok", seconds: 10, reference: { ...ref, level: 3 } }, g);
ok(!/viral/.test(pr0) && !/viral/.test(compose({ scene: "scene text here ok", seconds: 10, reference: { ...ref, level: 0 } }, g)), "no reference, or level Off: nothing from it is in the prompt");
ok(/mood and energy/.test(pr1) && !pr1.includes("3-6s"), "level 1 (mood only) takes the feeling, not the shots");
ok(pr2.includes("same story beats") && pr2.includes("3-6s: it rises") && pr2.includes("Do not copy any faces") && pr2.includes("The 16 ft Scream") && pr2.includes("Make it better"), "level 2 follows the story, forbids copying faces/product, names our product, and says make it better");
ok(/shot order and the timing/.test(pr3) && pr3.includes("0-3s"), "level 3 copies shot order and timing");
ok(!/viral/.test(compose({ scene: "scene text here ok", seconds: 10, reference: { level: 3, beats: "  " } }, g)), "a reference with no shots described adds nothing");
// ---- product from a link
process.env.XUGC_ALLOW_LOCAL = "1";
const srv = http.createServer((q, r) => { r.setHeader("content-type", "text/html"); r.end(`<html><head><script type="application/ld+json">{"@type":"Product","name":"Haunted Projector","description":"Plug-in <b>ghost</b> projector","image":["/p1.jpg"],"offers":{"price":"79.99","priceCurrency":"USD"}}</script><meta property="og:image" content="/a.jpg"></head></html>`); });
await new Promise((r) => srv.listen(0, r));
const prod = await fetchProduct(`http://127.0.0.1:${srv.address().port}/p`);
ok(prod.title === "Haunted Projector" && prod.price === "79.99" && prod.images.length === 2 && !/</.test(prod.desc), "a product page is read: name, price, photos, clean description");
srv.close();
const srv2 = http.createServer((q, r) => { r.setHeader("content-type", "text/html"); r.end(`<html><head><script type="application/ld+json">{"@type":"Product","name":"P","image":["/media/scr-s1-hero.webp"]}</script></head><body><img src="/media/scr-s1-hero-t200.webp"><img src="/media/scr-s2-scale.webp"><img src="/media/scr-s2-scale-w640.webp"><img srcset="/media/scr-s3-does.webp 1x"><img src="/media/bw-other1.webp"><img src="/media/scr-s2-scale.webp"></body></html>`); });
await new Promise((r) => srv2.listen(0, r));
process.env.XUGC_ALLOW_LOCAL = "1";
const prod2 = await fetchProduct(`http://127.0.0.1:${srv2.address().port}/p`);
ok(prod2.images.map((x) => x.split("/").pop()).join() === "scr-s1-hero.webp,scr-s2-scale.webp,scr-s3-does.webp", "ALL of the product's photos are read from the page (same family, once each, no thumbnails, no other products)", prod2.images.map((x) => x.split("/").pop()).join());
srv2.close();
let pe = null; try { await fetchProduct("ftp://x.y"); } catch (e) { pe = e; } ok(!!pe, "only web links are accepted");
delete process.env.XUGC_ALLOW_LOCAL; let pe2 = null; try { await fetchProduct("http://192.168.1.1/x"); } catch (e) { pe2 = e; } ok(pe2 && /private/.test(pe2.message), "private network addresses are refused");

// ---- engine
const store = new Store(dir); const secrets = new Secrets(dir, null, "runpod"); const hf = new Secrets(dir, null, "hf");
const calls = [];
class FakeRunPod {
  constructor(o) { calls.push({ made: o }); }
  async check() { return { ok: true, pods: 0 }; }
  async sweep() { return 0; }
  async run(job) {
    calls.push({ run: job.script, env: job.env, cap: job.capUsd, maxMinutes: job.maxMinutes, inputs: job.inputs, extra: job.extraScripts });
    job.onProgress({ stage: "installing", pct: 0, costUsd: 0.02, minutes: 0.5, log: "" });
    if (FakeRunPod.fail) { job.onProgress({ stage: "GPU handed back", pct: 100, costUsd: 0.4, minutes: 5, gone: true }); throw new Error("The GPU job failed (exit 3)."); }
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(job.destDir, { recursive: true });
    writeFileSync(join(job.destDir, "clip.mp4"), "x".repeat(2048)); writeFileSync(join(job.destDir, "info.txt"), "codec_type=video\ncodec_type=audio\n");
    await new Promise((r) => setTimeout(r, 60));
    job.onProgress({ stage: "GPU handed back", pct: 100, costUsd: 0.5, minutes: 6, gone: true });
    return { saved: ["clip.mp4"], log: "", costUsd: 0.5, minutes: 6, hourly: 1.6 };
  }
}
const eng = new Engine({ store, dir, secrets, hf, makeRunPod: (o) => new FakeRunPod(o) });
const job = { prompt: "A woman in a hoodie plugs in a projector and a ghost appears on her window.", seconds: 15, quality: "hd", meta: { scene: "x", look: "Demo" } };
const err = async (j) => { try { await eng.generate(j, () => {}); } catch (e) { return e; } return null; };

let e1 = await err(job); ok(e1 && /RunPod key|Hugging Face/.test(e1.message) && !calls.some((c) => c.run), "no keys: refused, nothing rented", e1?.message);
hf.set("hf_TESTTOKEN1234567890");
let e1b = await err(job); ok(e1b && e1b.code === "nokey", "no RunPod key: refused", e1b?.message);
secrets.set("rpa_TESTKEY1234567890");
ok((await err({ ...job, prompt: "hi" })).message.includes("what happens"), "a too-short prompt is refused");
ok(/length/.test((await err({ ...job, seconds: 7 })).message), "a length that is not 5/10/15/20 is refused");
store.update((st) => { st.settings.capJob = 0.5; });
let e4 = await err(job); ok(e4 && e4.code === "cap" && !calls.some((c) => c.run), "over the per-video cap: refused BEFORE anything is rented", e4?.message);
store.update((st) => { st.settings.capJob = 5; });

const ev = [];
const take = await eng.generate(job, (p) => ev.push(p));
const c1 = calls.find((c) => c.run === "generate.sh");
ok(existsSync(take.video) && take.audio === true, "a take is saved on the Mac and its sound track is detected", take.video);
ok(c1.env.FRAMES === "361" && c1.env.WIDTH === "704" && c1.env.HEIGHT === "1280" && c1.env.HF_TOKEN === "hf_TESTTOKEN1234567890" && c1.env.PROMPT === job.prompt, "15s HD = 361 frames at 704x1280, with the token and the prompt");
ok(Math.abs(store.read().spent.usd - 0.5) < 1e-9, "the day's spending went up by the real cost", String(store.read().spent.usd));
ok(ev.some((p) => p.costUsd > 0) && ev.at(-1).pct === 100, "progress carries live cost and ends at 100");
ok(eng.job === null, "the engine is free again afterwards");
await eng.generate({ ...job, seconds: 5, quality: "draft" }, () => {});
const c2 = calls.filter((c) => c.run).at(-1); ok(c2.env.FRAMES === "121" && c2.env.WIDTH === "512" && c2.env.HEIGHT === "896", "5s draft = 121 frames at 512x896");
ok(Number(c1.maxMinutes) > 0 && c1.cap <= 5, "the job's own cap is passed down to the GPU runner", String(c1.cap));

await eng.generate({ ...job, refs: [{ bytes: Buffer.alloc(3000, 1), url: "x/a.webp" }, { bytes: Buffer.alloc(3000, 2), url: "x/b.jpg" }] }, () => {});
const c3 = calls.filter((c) => c.run).at(-1);
ok(Object.keys(c3.inputs).join() === "ref1.webp,ref2.jpg" && c3.env.REFS === "ref1.webp:0:1,ref2.jpg:184:0.7", "reference photos are uploaded and sent as file:frame:strength, the first at frame 0", c3.env.REFS);
await eng.generate({ ...job, captions: [{ text: "BREAKING NEWS", start: 0, end: 4, pos: "top" }] }, () => {});
const c4 = calls.filter((c) => c.run).at(-1);
ok(JSON.parse(c4.env.CAPTIONS)[0].text === "BREAKING NEWS" && c4.extra.join() === "burn_captions.py", "captions are sent to the GPU job together with the script that burns them onto the video", c4.env.CAPTIONS);
FakeRunPod.fail = true;
let e5 = await err(job); ok(e5 && /exit 3/.test(e5.message) && e5.costUsd === 0.4, "a failed job reports why and what it cost");
ok(Math.abs(store.read().spent.usd - 2.4) < 1e-9 && eng.job === null, "…its cost still counts today and the engine is free", String(store.read().spent.usd));
FakeRunPod.fail = false;
const slow = eng.generate(job, () => {}); let e6 = await err(job); ok(e6 && e6.code === "busy", "a second job while one runs is refused"); await slow;

// ---- old builds' leftovers
writeFileSync(join(dir, "xugc.json"), JSON.stringify({ takes: [{ id: "d", demo: true }], models: [{ id: "wan22" }, { id: "u", kind: "lora" }], dataset: [{ id: "seed-1", file: "assets/x.mp4" }], settings: { mode: "demo", capTrain: 40 } }));
const re = new Store(dir).read();
ok(re.takes.length === 0 && re.models.length === 1 && re.models[0].id === "xugc" && re.dataset.length === 0 && re.settings.mode === undefined && re.settings.capTrain === undefined, "pretend takes, the Wan model and sample clips from older builds are removed");
process.exit(fail ? 1 : 0);

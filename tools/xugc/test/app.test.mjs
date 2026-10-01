/**
 * The real app, in a real Chromium, pressed like he will press it.
 * Not "the button fires": the thing the button is for has to be on screen afterwards.
 * Only the RunPod network client is faked (same run() contract); the engine, the money rules,
 * the key storage and every screen are the real ones.
 */
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const here = process.cwd();
const home = await mkdtemp(join(tmpdir(), "xugc-app-"));
const shots = process.env.XUGC_SHOTS || join(home, "shots");
await mkdir(shots, { recursive: true });
const fixture = join(here, "test", "fixtures", "clip.mp4");

const probe = `
const { app, BrowserWindow } = require("electron");
const path = require("node:path"); const fs = require("node:fs");
process.env.XUGC_NO_AUTOSTART = "1";
const { setup } = require(${JSON.stringify(join(here, "main.js"))});
const out = []; const say = (ok, what, extra) => out.push({ ok, what, extra: extra ?? null });
const log = [];
class FakeRunPod {
  constructor(o) { this.o = o; }
  async check() { if (/BAD/.test(this.o.apiKey)) { const e = new Error("RunPod refused the key. Make a new one with Read & Write access and paste it in Settings."); e.code = "auth"; throw e; } return { ok: true, pods: 0 }; }
  async sweep() { log.push("sweep"); return 2; }
  async run(job) {
    log.push({ run: job.script, env: job.env, inputs: Object.keys(job.inputs) });
    const t0 = Date.now(); const marks = job.script === "train.sh" ? ["installing", "downloading models", "training (1 epochs)"] : ["installing", "making the clip"];
    let i = 0;
    for (;;) {
      if (job.signal.cancelled) { job.onProgress({ stage: "GPU handed back", pct: 100, costUsd: 0.11, minutes: 0.1, gone: true }); const e = new Error("Cancelled."); e.code = "cancelled"; throw e; }
      const el = Date.now() - t0;
      job.onProgress({ stage: marks[Math.min(marks.length - 1, Math.floor(el / 900))], pct: 10, costUsd: 0.0003 * el, minutes: el / 60000, log: "step " + Math.floor(el / 100) + "/30  loss 0.0" + (el % 9) });
      if (el > 2700 && !globalThis.__hold) break;
      await new Promise((r) => setTimeout(r, 120));
    }
    fs.mkdirSync(job.destDir, { recursive: true });
    for (const r of job.required) fs.copyFileSync(r.endsWith(".mp4") ? ${JSON.stringify(fixture)} : ${JSON.stringify(fixture)}, path.join(job.destDir, r));
    fs.writeFileSync(path.join(job.destDir, "captions-sample.txt"), "UGC video. A woman holds a small black projector at her window.");
    job.onProgress({ stage: "GPU handed back", pct: 100, costUsd: 0.81, minutes: 2.9, gone: true });
    return { saved: job.required, log: "", costUsd: 0.81, minutes: 2.9, hourly: 1.6 };
  }
}
app.whenReady().then(async () => {
  try {
    setup({ dir: ${JSON.stringify(join(home, "data"))}, makeRunPod: (o) => new FakeRunPod(o), sweepOnStart: false });
    const win = new BrowserWindow({ width: 1280, height: 820, show: true, backgroundColor: "#07080A", webPreferences: { preload: path.join(${JSON.stringify(here)}, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: false } });
    const errors = [];
    win.webContents.on("console-message", (_e, level, msg) => { if (level >= 3) errors.push(msg); });
    await win.loadFile(path.join(${JSON.stringify(here)}, "renderer", "index.html"));
    const run = (js) => win.webContents.executeJavaScript(js);
    const until = async (js, ms = 6000) => { const t0 = Date.now(); for (;;) { try { const v = await run(js); if (v) return v; } catch {} if (Date.now() - t0 > ms) return false; await new Promise((r) => setTimeout(r, 60)); } };
    const shot = async (name) => { await new Promise((r) => setTimeout(r, 350)); const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(${JSON.stringify(shots)}, name + ".png"), img.toPNG()); };
    const view = (v) => run("document.querySelector('#nav [data-view=" + v + "]').click()");
    const type = (sel, v, ev = "input") => run("(function(){const i=document.querySelector(" + JSON.stringify(sel) + "); i.value=" + JSON.stringify(v) + "; i.dispatchEvent(new Event(" + JSON.stringify(ev) + "))})()");

    say(await until("document.querySelector('#modechip').textContent.includes('NO RUNPOD KEY')"), "with no key, the header says so in plain words");
    say(await until("document.querySelector('#nokey').style.display === 'block'"), "Create shows a banner pointing at Settings");
    say(await run("!!document.querySelector('.brand svg use') && document.querySelector('.mark svg') !== null"), "the eye logo is in the header and on the empty stage");
    await shot("1-empty");
    await run("document.querySelector('#go').click()");
    say(await until("document.querySelector('#err').textContent.includes('start frame')"), "Generate with no picture says what to do, rents nothing", await run("document.querySelector('#err').textContent"));

    // Settings: a bad key is refused and not kept; a good key is kept and works.
    await view("settings");
    await type("#keyin", "rpa_BAD_KEY_0000000000"); await run("document.querySelector('#keysave').click()");
    say(await until("document.querySelector('#keyerr').textContent.includes('refused the key')"), "a wrong key is refused with a plain message");
    say(await until("document.querySelector('#keystate').textContent === 'No key saved.'"), "…and it is not kept");
    await type("#keyin", "rpa_GOOD_KEY_1234567890"); await run("document.querySelector('#keysave').click()");
    say(await until("document.querySelector('#keystate').textContent.includes('7890') && document.querySelector('#keystate').textContent.includes('works')"), "a good key is saved and tested", await run("document.querySelector('#keystate').textContent"));
    say(!(await run("document.documentElement.innerHTML")).includes("GOOD_KEY_1234567890"), "the key is never written into the page");
    say(await run("document.querySelector('#keyin').value") === "", "the key box is emptied after saving");
    say(fs.readdirSync(${JSON.stringify(join(home, "data"))}).includes("runpod.key") && !(fs.existsSync(${JSON.stringify(join(home, "data", "xugc.json"))}) && fs.readFileSync(${JSON.stringify(join(home, "data", "xugc.json"))}, "utf8").includes("GOOD_KEY")), "the key is in its own file, not in the app's state");
    await run("document.querySelector('#sweep').click()");
    say(await until("document.querySelector('#sweepnote').textContent.includes('Stopped 2 GPUs')"), "Stop-the-meter button works and reports what it stopped");
    await shot("2-settings");

    // Create for real.
    await view("create");
    say(await until("document.querySelector('#modechip').textContent.includes('RUNPOD')"), "the header now shows RUNPOD and today's spend");
    const dataUrl = await run("(function(){const c=document.createElement('canvas');c.width=600;c.height=900;const g=c.getContext('2d');const gr=g.createLinearGradient(0,0,600,900);gr.addColorStop(0,'#2a3a55');gr.addColorStop(1,'#a06a3a');g.fillStyle=gr;g.fillRect(0,0,600,900);g.fillStyle='#e8c9a0';g.beginPath();g.arc(300,330,120,0,7);g.fill();g.fillStyle='#111';g.fillRect(230,560,140,120);return c.toDataURL('image/png')})()");
    await run("window.__useFrame({ name: 'maya-with-projector.png', dataUrl: " + JSON.stringify(dataUrl) + " })");
    say(await until("document.querySelector('#frame').classList.contains('has') && document.querySelector('#framename').textContent === 'maya-with-projector.png'"), "the picture shows as the start frame");
    await type("#script", "She plugs the projector in, points it at her front window, and a ghost appears on the glass.");
    await run("document.querySelector('#looks .pill:nth-child(3)').click()");
    await shot("3-ready");
    await run("document.querySelector('#go').click()");
    say(await until("document.querySelector('#prog').classList.contains('on')"), "pressing Generate shows the eye overlay");
    await new Promise((r) => setTimeout(r, 1700));
    say(await run("document.querySelector('#ptime').textContent") !== "0:00", "the timer is running", await run("document.querySelector('#ptime').textContent"));
    say(await run("Number(document.querySelector('#pcost').textContent.slice(1))") > 0, "the live cost is going up", await run("document.querySelector('#pcost').textContent"));
    say((await run("document.querySelector('#pstage').textContent")).length > 3 && (await run("document.querySelector('#plog').textContent")).includes("loss"), "the stage and the GPU's own log line are shown");
    say(await run("document.querySelector('#go').disabled"), "the Generate button is locked while a job runs");
    await shot("4-working");
    say(await until("document.querySelectorAll('#takes .take').length === 1 && !document.querySelector('#prog').classList.contains('on')", 12000), "the finished video appears in the takes column");
    say(await until("document.querySelector('#pv').src.endsWith('.mp4') && document.querySelector('#pv').readyState >= 1 && document.querySelector('#pv').style.display === 'block'", 8000), "the video element has really loaded the clip", await run("document.querySelector('#pv').readyState + ' ' + document.querySelector('#pv').src.slice(-26)"));
    say((await run("document.querySelector('#ptag').textContent")).includes("$0.81"), "the take shows what it really cost");
    await shot("5-generated");
    const g1 = log.find((l) => l.run === "generate.sh");
    say(g1 && g1.env.PROMPT.includes("ghost appears on the glass") && g1.env.PROMPT.includes("demonstrates the product") && g1.inputs.join() === "first.png", "the GPU was sent his words, the Demo look, and only the start frame");
    say((await run("document.querySelector('#modechip').textContent")).includes("$0.81"), "today's spending moved by the real cost");

    // 👍 -> training list
    await run("document.querySelector('#vup').click()");
    say(await until("document.querySelector('#vup').classList.contains('on')"), "👍 lights up");
    await run("window.xugc.addClipPaths([" + JSON.stringify(${JSON.stringify(fixture)}) + "]).then(refresh)");
    await view("train");
    say(await until("document.querySelector('#n-clips').textContent === '2'"), "the 👍 take and the added video are both training videos");
    say(await run("document.querySelector('#train-go').disabled"), "full Train is locked until the test run has been done");
    await shot("6-train");
    await run("document.querySelector('#test-go').click()");
    say(await until("document.querySelector('#tprog').style.display === 'flex'"), "the test run shows the eye and progress");
    await shot("7-training");
    say(await until("document.querySelector('#tsample').style.display === 'block' && document.querySelector('#tsampletext').textContent.includes('projector')", 14000), "after the test run, the captions the GPU wrote are shown to read");
    say(await until("!document.querySelector('#train-go').disabled"), "full Train unlocks after the test run");
    say(await until("document.querySelectorAll('#tmodels .model').length === 2"), "the test model is in the list");
    await run("document.querySelector('#train-go').click()");
    say(await until("document.querySelectorAll('#tmodels .model').length === 3", 14000), "the real training finished and a third model exists");
    const tr = log.filter((l) => l.run === "train.sh");
    say(tr.length === 2 && tr[0].env.DRY === "1" && tr[1].env.DRY === "0", "the GPU was run twice: test first, then the real one");
    await view("create");
    say(await until("document.querySelectorAll('#models .model').length === 3 && document.querySelector('#models .model.on').textContent.includes('UGC')"), "the new model is selectable and selected in Create");

    // Cancel: Stop hands the GPU back and nothing is saved.
    await run("globalThis.__noop = 1"); 
    const before = await run("document.querySelectorAll('#takes .take').length");
    await run("document.querySelector('#go').click()");
    await until("document.querySelector('#prog').classList.contains('on')");
    await new Promise((r) => setTimeout(r, 700));
    await run("document.querySelector('#stop').click()");
    say(await until("document.querySelector('#err').classList.contains('on') && document.querySelector('#err').textContent.includes('Cancelled')", 8000), "Stop cancels the job and says what it cost", await run("document.querySelector('#err').textContent"));
    say(await run("document.querySelectorAll('#takes .take').length") === before, "…and no video was added");
    say(!(await run("document.querySelector('#go').disabled")), "…and Generate works again");

    // Caps.
    await view("settings");
    await type("#cap-job", "0.5", "change");
    await new Promise((r) => setTimeout(r, 250));
    await view("create");
    await run("document.querySelector('#go').click()");
    say(await until("document.querySelector('#err').textContent.includes('over your per-video limit')"), "over the per-video limit: refused on screen, before any GPU", await run("document.querySelector('#err').textContent"));
    say(log.filter((l) => l.run === "generate.sh").length === 2, "…and the GPU was never started for it");
    await shot("8-cap");

    say(errors.length === 0, "no errors in the page console", errors.join(" | ").slice(0, 300));
  } catch (e) { say(false, "the probe crashed", String(e && e.stack || e)); }
  console.log("@@RESULT@@" + JSON.stringify(out));
  app.exit(0);
});
`;
await writeFile(join(home, "probe.cjs"), probe);
const electron = join(here, "node_modules", ".bin", "electron");
const child = spawn("xvfb-run", ["-a", "-s", "-screen 0 1400x900x24", electron, "--no-sandbox", "--disable-gpu", "--autoplay-policy=no-user-gesture-required", "--user-data-dir=" + join(home, "ud"), join(home, "probe.cjs")], { stdio: ["ignore", "pipe", "pipe"] });
let stdout = "", stderr = "";
child.stdout.on("data", (d) => (stdout += d)); child.stderr.on("data", (d) => (stderr += d));
const code = await new Promise((r) => { const t = setTimeout(() => { child.kill("SIGKILL"); r("timeout"); }, 170000); child.on("close", (c) => { clearTimeout(t); r(c); }); });
const line = stdout.split("\n").find((l) => l.startsWith("@@RESULT@@"));
let failed = 0;
if (!line) { console.log("FAIL  no result from electron (" + code + ")\n" + stderr.slice(-1500) + stdout.slice(-600)); failed = 1; }
else for (const r of JSON.parse(line.slice(10))) { if (!r.ok) failed++; console.log((r.ok ? "ok    " : "FAIL  ") + r.what + (r.extra ? "  — " + String(r.extra).slice(0, 260) : "")); }
if (!process.env.XUGC_SHOTS) await rm(home, { recursive: true, force: true }).catch(() => {});
process.exit(failed ? 1 : 0);

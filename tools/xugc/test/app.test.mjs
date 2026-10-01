/**
 * The real app, in a real Chromium, pressed like he will press it.
 * Not "the button fires": the thing the button is for has to be on screen afterwards.
 */
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const here = process.cwd();
const home = await mkdtemp(join(tmpdir(), "xugc-app-"));
const shots = process.env.XUGC_SHOTS || join(home, "shots");
await mkdir(shots, { recursive: true });

const probe = `
const { app, BrowserWindow } = require("electron");
const path = require("node:path");
process.env.XUGC_NO_AUTOSTART = "1";
const { setup } = require(${JSON.stringify(join(here, "main.js"))});
const out = []; const say = (ok, what, extra) => out.push({ ok, what, extra: extra ?? null });
app.whenReady().then(async () => {
  try {
    setup({ dir: ${JSON.stringify(join(home, "data"))}, fast: true });
    const win = new BrowserWindow({ width: 1280, height: 820, show: true, backgroundColor: "#07080A", webPreferences: { preload: path.join(${JSON.stringify(here)}, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: false } });
    const errors = [];
    win.webContents.on("console-message", (_e, level, msg) => { if (level >= 3) errors.push(msg); });
    await win.loadFile(path.join(${JSON.stringify(here)}, "renderer", "index.html"));
    const run = (js) => win.webContents.executeJavaScript(js);
    const until = async (js, ms = 6000) => { const t0 = Date.now(); for (;;) { try { const v = await run(js); if (v) return v; } catch {} if (Date.now() - t0 > ms) return false; await new Promise((r) => setTimeout(r, 60)); } };
    const shot = async (name) => { await new Promise((r) => setTimeout(r, 350)); const img = await win.webContents.capturePage(); require("node:fs").writeFileSync(path.join(${JSON.stringify(shots)}, name + ".png"), img.toPNG()); };
    await run("window.__fastDemo = true");

    say(await until("document.querySelectorAll('#avs .av').length === 9"), "Create screen draws 8 avatars and the + button");
    say(await until("document.querySelectorAll('#models .model').length === 1"), "the model list shows Wan 2.2");
    say((await run("document.querySelector('#modechip').textContent")).includes("DEMO"), "the header says DEMO, so he always knows no money moves");
    await shot("1-create");

    // Generate for real: the video must end up playable on screen.
    await run("document.querySelector('#go').click()");
    say(await until("document.querySelector('#prog').classList.contains('on')"), "pressing Generate shows progress");
    say(await until("document.querySelectorAll('#takes .take').length === 1 && !document.querySelector('#prog').classList.contains('on')", 12000), "the finished video appears in the takes column");
    say(await until("document.querySelector('#pv').src.endsWith('assets/samples/ugc-projector.mp4') && document.querySelector('#pv').readyState >= 1", 8000), "the video element has really loaded the clip", await run("document.querySelector('#pv').readyState + ' ' + document.querySelector('#pv').src.slice(-30)"));
    say(await run("getComputedStyle(document.querySelector('#verd')).visibility") === "visible", "the 👍/👎 buttons appear on a finished video");
    await shot("2-generated");

    // 👍 puts the take into the training clips.
    await run("document.querySelector('#vup').click()");
    say(await until("document.querySelector('#vup').classList.contains('on')"), "👍 lights up");
    await run("document.querySelector('#nav [data-view=train]').click()");
    say(await until("document.querySelector('#n-clips').textContent === '2'"), "the 👍 take joined the training clips (seed + approved)", await run("document.querySelector('#n-clips').textContent"));
    say(await until("document.querySelectorAll('#cliplist .clip').length === 2"), "both clips are listed with captions boxes");
    await shot("3-train");

    // Train, demo: a new model must appear and be pickable in Create.
    await run("document.querySelector('#mname').value = 'UGC-02'; document.querySelector('#train-go').click()");
    say(await until("document.querySelectorAll('#tmodels .model').length === 2", 12000), "training finished and UGC-02 is in the model list");
    await run("document.querySelector('#nav [data-view=create]').click()");
    say(await until("document.querySelectorAll('#models .model').length === 2"), "UGC-02 can be chosen in Create");
    say((await run("document.querySelector('#models .model.on').textContent")).includes("UGC-02"), "the new model is selected after training");

    // Library shows it.
    await run("document.querySelector('#nav [data-view=library]').click()");
    say(await until("document.querySelectorAll('#libgrid .card').length === 1"), "the Library lists the video");
    await shot("4-library");

    // The cap refuses before anything starts.
    await run("document.querySelector('#nav [data-view=settings]').click()");
    await run("(function(){const i=document.querySelector('#cap-job'); i.value='0.5'; i.dispatchEvent(new Event('change'))})()");
    await until("document.querySelector('#cap-job').value === '0.5'");
    await new Promise((r) => setTimeout(r, 200));
    await run("document.querySelector('#nav [data-view=create]').click()");
    await run("document.querySelector('#go').click()");
    say(await until("document.querySelector('#err').classList.contains('on') && document.querySelector('#err').textContent.includes('over your per-video limit')"), "a video over the limit shows the refusal on screen", await run("document.querySelector('#err').textContent"));
    say(await run("document.querySelectorAll('#takes .take').length") === 1, "and no extra video was made");
    await shot("5-cap");

    // RunPod is honest about not being connected.
    await run("document.querySelector('#nav [data-view=settings]').click()");
    await run("(function(){const i=document.querySelector('#cap-job'); i.value='5'; i.dispatchEvent(new Event('change'))})()");
    await new Promise((r) => setTimeout(r, 200));
    await run("document.querySelector('#m-runpod').click()");
    await until("document.querySelector('#modechip').textContent.includes('RUNPOD')");
    await run("document.querySelector('#nav [data-view=create]').click()");
    await run("document.querySelector('#go').click()");
    say(await until("document.querySelector('#err').textContent.includes('not connected')"), "RunPod mode says it is not connected instead of pretending");
    await run("document.querySelector('#nav [data-view=settings]').click(); document.querySelector('#m-demo').click()");
    await shot("6-settings");

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
const code = await new Promise((r) => { const t = setTimeout(() => { child.kill("SIGKILL"); r("timeout"); }, 120000); child.on("close", (c) => { clearTimeout(t); r(c); }); });
const line = stdout.split("\n").find((l) => l.startsWith("@@RESULT@@"));
let failed = 0;
if (!line) { console.log("FAIL  no result from electron (" + code + ")\n" + stderr.slice(-1500) + stdout.slice(-600)); failed = 1; }
else for (const r of JSON.parse(line.slice(10))) { if (!r.ok) failed++; console.log((r.ok ? "ok    " : "FAIL  ") + r.what + (r.extra ? "  — " + String(r.extra).slice(0, 260) : "")); }
if (!process.env.XUGC_SHOTS) await rm(home, { recursive: true, force: true }).catch(() => {});
process.exit(failed ? 1 : 0);

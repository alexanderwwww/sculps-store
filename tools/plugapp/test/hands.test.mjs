/**
 * The hands, in a real Chromium, on a real page — with the loop driven.
 * A syntax check is not a test; this drives an actual sequence of actions and
 * checks the page really changed, that every click was a trusted one, how long
 * each action took, and that the cursor is visible in what he would see.
 */
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const here = process.cwd();
const home = await mkdtemp(join(tmpdir(), "plug-hands-"));
const shot = process.env.HANDS_SHOT_DIR || home;
const probe = `
const { app, BrowserWindow, WebContentsView } = require("electron");
const path = require("node:path");
const { Hands } = require(${JSON.stringify(join(here, "agent.js"))});
const out = []; const say = (ok, what, extra) => out.push({ ok, what, extra: extra ?? null });
app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({ width: 393, height: 852, show: true, frame: false });
    const view = new WebContentsView({ webPreferences: { partition: "persist:test", sandbox: true } });
    win.contentView.addChildView(view);
    view.setBounds({ x: 10, y: 10, width: 373, height: 800 });
    const hands = new Hands(view.webContents);
    const fx = (f) => ${JSON.stringify(pathToFileURL(join(here, "test", "fixtures") + "/").href)} + f;
    const timing = {};
    const go = async (name, cmd) => { const r = await hands.run(cmd); timing[name] = r.ms; return r; };

    let r = await go("goto", { cmd: "goto", url: fx("hands.html") });
    say(r.ok, "opens a page", r.why);
    let snap = await go("snap", { cmd: "snap" });
    say(snap.ok && snap.things.length >= 6, "snap lists the pressable things", snap.things?.map((t) => t.i + ":" + t.tag + ":" + t.text).join(" | "));
    const by = (s, rx) => snap.things.find((t) => rx.test(t.text + t.tag + t.type));
    const titleI = by(snap, /Title/).i, descI = by(snap, /Description/).i, saveI = by(snap, /Save draft/).i;
    const fileI = snap.things.find((t) => t.type === "file").i;

    r = await go("type title", { cmd: "type", i: titleI, text: "Chrome Hearts Stained Glass sunglasses" });
    say(r.ok, "types into a field", r.why);
    r = await go("type desc", { cmd: "type", i: descI, text: "Brand new, never worn. Ships from New York." });
    r = await go("click save", { cmd: "click", i: saveI });
    say(r.ok, "clicks save", r.why);
    r = await go("upload", { cmd: "upload", i: fileI, files: [${JSON.stringify(join(here, "test", "fixtures", "a.jpg"))}, ${JSON.stringify(join(here, "test", "fixtures", "b.jpg"))}] });
    say(r.ok, "hands files to the file input", r.why);
    await new Promise((x) => setTimeout(x, 100));
    const state = JSON.parse(await view.webContents.executeJavaScript("document.getElementById('out').textContent"));
    say(state.title === "Chrome Hearts Stained Glass sunglasses", "the title really landed", state.title);
    say(state.desc.includes("New York"), "the description really landed", state.desc);
    say(state.clicks === 1, "exactly one real click", String(state.clicks));
    say(state.events.some((e) => e === "save trusted=true"), "the click was trusted (isTrusted)", state.events.join(","));
    say(state.files === 2, "both files arrived", String(state.files));

    await go("stale", { cmd: "goto", url: fx("hands.html") });
    r = await go("stale click", { cmd: "click", i: saveI });
    say(!r.ok && /snap again/.test(r.why), "a stale number is refused, not guessed", r.why);

    snap = await go("snap2", { cmd: "snap" });
    r = await go("scroll", { cmd: "scroll", dy: 700 });
    await new Promise((x) => setTimeout(x, 200));
    const late = await hands.run({ cmd: "click", text: "Publish" });
    say(late.ok, "scroll reveals a hidden button and it can be pressed by its words", late.why);
    const state2 = JSON.parse(await view.webContents.executeJavaScript("document.getElementById('out').textContent"));
    say(state2.events.includes("publish trusted=true"), "that press landed too", state2.events.join(","));

    await go("scroll back", { cmd: "scroll", dy: -2000 });
    await new Promise((x) => setTimeout(x, 150));
    await go("snap3", { cmd: "snap" });
    await hands.run({ cmd: "click", text: "Next page" });
    await new Promise((x) => setTimeout(x, 400));
    say(view.webContents.getURL().endsWith("page2.html"), "a link navigates", view.webContents.getURL());
    /* The cursor must survive the navigation — overlay is re-injected. */
    const cur = await view.webContents.executeJavaScript("!!document.getElementById('__plug_cursor')");
    say(cur, "the cursor is on the new page after navigating");
    await hands.run({ cmd: "snap" });
    await hands.run({ cmd: "click", text: "Confirm" });
    await new Promise((x) => setTimeout(x, 100));
    say(view.webContents.getTitle() === "done", "it finished the second page's action", view.webContents.getTitle());

    /* Picture of exactly what he sees, cursor and all. */
    await hands.run({ cmd: "goto", url: fx("hands.html") });
    await hands.run({ cmd: "snap" });
    await hands.run({ cmd: "click", text: "Save draft" });
    await new Promise((x) => setTimeout(x, 120));
    await hands.run({ cmd: "type", i: 1, text: "Chrome Hearts sunglasses", clear: true }).catch(() => {});
    const s = await hands.run({ cmd: "shot", path: ${JSON.stringify(join(shot, "hands-shot.png"))} });
    say(s.ok && s.bytes > 2000, "takes a picture", s.path);

    const moves = await view.webContents.executeJavaScript("window.__m||0");
    say(moves > 12, "real mouse events arrived on the page", String(moves));
    const slow = Object.entries(timing).filter(([k, v]) => ["type title","click save","upload"].includes(k) && v > 1200);
    say(slow.length === 0, "each action is under 1.2 s", JSON.stringify(timing));
    say(true, "timing (ms)", JSON.stringify(timing));
  } catch (e) { say(false, "the probe itself crashed", String(e && e.stack || e)); }
  console.log("@@RESULT@@" + JSON.stringify(out));
  app.exit(0);
});
`;
await writeFile(join(home, "probe.cjs"), probe);
const electron = join(here, "node_modules", ".bin", "electron");
const child = spawn("xvfb-run", ["-a", electron, "--no-sandbox", "--disable-gpu", "--user-data-dir=" + join(home, "ud"), join(home, "probe.cjs")], { stdio: ["ignore", "pipe", "pipe"] });
let stdout = "", stderr = "";
child.stdout.on("data", (d) => (stdout += d)); child.stderr.on("data", (d) => (stderr += d));
const code = await new Promise((r) => { const t = setTimeout(() => { child.kill("SIGKILL"); r("timeout"); }, 90000); child.on("close", (c) => { clearTimeout(t); r(c); }); });
const line = stdout.split("\n").find((l) => l.startsWith("@@RESULT@@"));
let failed = 0;
if (!line) { console.log("FAIL  no result from electron (" + code + ")\n" + stderr.slice(-1500) + stdout.slice(-800)); failed = 1; }
else for (const r of JSON.parse(line.slice(10))) { if (!r.ok) failed++; console.log((r.ok ? "ok    " : "FAIL  ") + r.what + (r.extra ? "  — " + String(r.extra).slice(0, 300) : "")); }
await rm(home, { recursive: true, force: true }).catch(() => {});
process.exit(failed ? 1 : 0);

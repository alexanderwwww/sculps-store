import { Screens, MOD } from "../worker/screens.mjs";
import { ask } from "../worker/chrome.mjs";
import { check, failures, testChrome, stubSites, until, sleep } from "./lib.mjs";
import { execSync } from "node:child_process";

const PORT = 9463;
const PROFILE = "/tmp/claude-0/organic-test-3";
execSync(`rm -rf ${PROFILE}`);
const page = `<html><body style="margin:0">
<input id="i" style="position:absolute;left:100px;top:100px;width:300px;height:40px;font-size:20px">
<button id="b" style="position:absolute;left:100px;top:300px;width:200px;height:60px" onclick="window.clicked=(window.clicked||0)+1">go</button>
<div id="big" style="height:3000px"></div>
<script>window.keys=[];document.addEventListener('keydown',e=>window.keys.push(e.key));document.addEventListener('mousemove',e=>{window.lastMove=[e.clientX,e.clientY]})</script>
</body></html>`;
const guard = setTimeout(() => { console.log("HARD STOP"); process.exit(9); }, 90000);

const { browser } = await testChrome(PORT, PROFILE);
const screens = new Screens(browser, { hosts: { instagram: "ig.test" } });
await stubSites(await screens.context(), { "ig.test": page });
await screens.adopt();
const p = await screens.open("instagram", "http://ig.test/");
await screens.startStream("instagram");
const vp = await screens.viewport("instagram");
check("viewport is read from chrome", vp.w > 300 && vp.h > 300, `${vp.w}x${vp.h}`);

// Click the input (its centre: 250,120) then type.
const at = (x, y) => ({ x: x / vp.w, y: y / vp.h });
await screens.input("instagram", { t: "mouse", kind: "move", ...at(250, 120) });
await screens.input("instagram", { t: "mouse", kind: "down", ...at(250, 120), button: 0 });
await screens.input("instagram", { t: "mouse", kind: "up", ...at(250, 120), button: 0 });
const moved = await ask(p, () => window.lastMove);
check("mouse move lands in page pixels", moved && Math.abs(moved[0] - 250) <= 2 && Math.abs(moved[1] - 120) <= 2, JSON.stringify(moved));
check("click focused the input", (await ask(p, () => document.activeElement?.id)) === "i");

for (const ch of "hi there") {
  const key = ch === " " ? " " : ch;
  const code = ch === " " ? "Space" : "Key" + ch.toUpperCase();
  await screens.input("instagram", { t: "key", kind: "down", key, code, text: ch, modifiers: 0 });
  await screens.input("instagram", { t: "key", kind: "up", key, code, modifiers: 0 });
}
await screens.input("instagram", { t: "key", kind: "down", key: "Backspace", code: "Backspace", modifiers: 0 });
await screens.input("instagram", { t: "key", kind: "up", key: "Backspace", code: "Backspace", modifiers: 0 });
check("keys typed into the input (with backspace)", (await ask(p, () => document.getElementById("i").value)) === "hi ther", await ask(p, () => document.getElementById("i").value));
await screens.input("instagram", { t: "key", kind: "down", key: "a", code: "KeyA", text: "a", modifiers: MOD.ctrl });
await screens.input("instagram", { t: "key", kind: "up", key: "a", code: "KeyA", modifiers: MOD.ctrl });
check("keydown events reach the page with keys", ((await ask(p, () => window.keys)) ?? []).includes("Backspace"));

// Click the button (centre 200,330).
await screens.input("instagram", { t: "mouse", kind: "move", ...at(200, 330) });
await screens.input("instagram", { t: "mouse", kind: "down", ...at(200, 330), button: 0 });
await screens.input("instagram", { t: "mouse", kind: "up", ...at(200, 330), button: 0 });
check("click lands on the button", (await ask(p, () => window.clicked)) === 1);

await screens.input("instagram", { t: "mouse", kind: "wheel", ...at(400, 400), dx: 0, dy: 600 });
const y = await until(async () => { const v = await ask(p, () => window.scrollY); return v > 100 ? v : null; }, 3000);
check("wheel scrolls the page", y > 100, String(y));

check("garbage is refused, not thrown", (await screens.input("instagram", { t: "mouse", kind: "teleport" })) === false && (await screens.input("nope", { t: "key" })) === false);

clearTimeout(guard);
await screens.dispose();
await browser.close().catch(() => {});
execSync(`fuser -k ${PORT}/tcp 2>/dev/null || true`);
console.log(failures() ? `\n${failures()} FAILED` : "\nall passed");
process.exit(failures() ? 1 : 0);

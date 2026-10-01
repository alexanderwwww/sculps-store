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
const path = require("node:path"); const fs = require("node:fs"); const http = require("node:http");
process.env.XUGC_NO_AUTOSTART = "1";
const { setup } = require(${JSON.stringify(join(here, "main.js"))});
const out = []; const say = (ok, what, extra) => { out.push({ ok, what, extra: extra ?? null }); fs.appendFileSync("/tmp/steps.log", (ok ? "ok   " : "FAIL ") + what + "\\n"); };
const log = [];
class FakeRunPod {
  constructor(o) { this.o = o; }
  async check() { if (/BAD/.test(this.o.apiKey)) { const e = new Error("RunPod refused the key. Make a new one with Read & Write access and paste it in Settings."); e.code = "auth"; throw e; } return { ok: true, pods: 0 }; }
  async sweep() { log.push("sweep"); return 2; }
  async run(job) {
    log.push({ run: job.script, env: job.env });
    const t0 = Date.now(); const marks = ["installing", "downloading the model", "making the video"];
    for (;;) {
      if (job.signal.cancelled) { job.onProgress({ stage: "GPU handed back", pct: 100, costUsd: 0.11, minutes: 0.1, gone: true }); const e = new Error("Cancelled."); e.code = "cancelled"; throw e; }
      const el = Date.now() - t0;
      job.onProgress({ stage: marks[Math.min(2, Math.floor(el / 900))], pct: 10, costUsd: 0.0003 * el, minutes: el / 60000, log: "step " + Math.floor(el / 100) + "/30  40%|loss 0.0" + (el % 9) });
      if (el > 2700 && !globalThis.__hold) break;
      await new Promise((r) => setTimeout(r, 120));
    }
    if (job.script === "train_lora.sh") { fs.mkdirSync(job.destDir, { recursive: true }); fs.writeFileSync(path.join(job.destDir, "lora.safetensors"), "L".repeat(3000)); fs.writeFileSync(path.join(job.destDir, "caption.log"), "c001.mp4 -> xugciphone. [VISUAL] a woman shows a bottle\\n"); job.onProgress({ stage: "GPU handed back", pct: 100, costUsd: 0.9, minutes: 3, gone: true }); return { saved: ["lora.safetensors"], log: "", costUsd: 0.9, minutes: 3, hourly: 1.6 }; }
    fs.mkdirSync(job.destDir, { recursive: true });
    fs.copyFileSync(${JSON.stringify(fixture)}, path.join(job.destDir, "clip.mp4"));
    fs.writeFileSync(path.join(job.destDir, "info.txt"), "codec_type=video\\ncodec_type=audio\\n");
    job.onProgress({ stage: "GPU handed back", pct: 100, costUsd: 0.81, minutes: 2.9, gone: true });
    return { saved: ["clip.mp4"], log: "", costUsd: 0.81, minutes: 2.9, hourly: 1.6 };
  }
}
// A stand-in for the Kerberos worker: same URLs, same shapes, in memory.
const W = { status: null, statusPosts: 0, orders: [], results: [], uploads: [] };
const worker = http.createServer((q, s) => {
  const chunks = []; q.on("data", (d) => chunks.push(d)); q.on("end", () => {
    const body = Buffer.concat(chunks); const u = new URL(q.url, "http://x"); const send = (o, c = 200) => { s.writeHead(c, { "content-type": "application/json" }); s.end(JSON.stringify(o)); };
    if (u.pathname === "/status" && q.method === "POST") { W.status = JSON.parse(body); W.statusPosts++; return send({ ok: true }); }
    if (u.pathname === "/orders" && q.method === "GET") return send({ orders: W.orders, mcpSeen: W.claudeAt ? { at: W.claudeAt } : null });
    if (u.pathname === "/orders" && q.method === "POST") { const b = JSON.parse(body); W.orders = W.orders.filter((o) => !(b.ack || []).includes(o.id)); for (const r of b.results || []) W.results.push(r); return send({ ok: true }); }
    if (u.pathname.startsWith("/img")) { s.writeHead(200, { "content-type": "image/jpeg" }); return s.end(Buffer.alloc(4000, 7)); }
    if (u.pathname === "/take" && q.method === "POST") { W.uploads.push({ name: u.searchParams.get("name"), bytes: body.length }); return send({ ok: true, url: "https://example.test/" + u.searchParams.get("name") }); }
    send({}, 404);
  });
});
app.whenReady().then(async () => {
  try {
    await new Promise((r) => worker.listen(0, r));
    const IMG = (n) => "http://127.0.0.1:" + worker.address().port + "/img" + n + ".jpg";
    const stubSrc = [];
    const collectorStub = { pile: "/tmp/xugc-pile", count() { return { videos: stubSrc.length, pieces: stubSrc.reduce((n, x) => n + x.pieces.length, 0) }; }, sources() { return stubSrc; }, remove() { return 0; },
      async all(items, onP) { let n = 0; for (let i = 0; i < Math.min(4, items.length); i++) { onP({ n: i + 1, of: items.length, id: items[i].id, creator: items[i].creator, state: "working" }); await new Promise((r) => setTimeout(r, 80)); stubSrc.push({ id: items[i].id, creator: items[i].creator, place: items[i].place, category: items[i].category, sound: items[i].sound, pieces: [{ file: "01.mp4", db: -20 }, { file: "02.mp4", db: -22 }, { file: "03.mp4", db: -19 }] }); n += 3; onP({ n: i + 1, of: items.length, id: items[i].id, creator: items[i].creator, state: "ok", pieces: 3, totals: this.count() }); } return { done: 4, skipped: 0, failed: [], pieces: n }; } };
    const prodStub = async (url) => ({ url, title: "Haunted Projector", desc: "Plug-in ghost projector for windows", price: "79.99", currency: "USD", images: [IMG(1), IMG(2), IMG(3)] });
    const sys = setup({ dir: ${JSON.stringify(join(home, "data"))}, makeRunPod: (o) => new FakeRunPod(o), sweepOnStart: false, bridgeBase: "http://127.0.0.1:" + worker.address().port, bridgeMs: 250, productFetch: prodStub, collector: collectorStub });
    const win = new BrowserWindow({ width: 1280, height: 820, show: true, backgroundColor: "#07080A", webPreferences: { preload: path.join(${JSON.stringify(here)}, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: false } });
    const errors = [];
    win.webContents.on("console-message", (_e, level, msg) => { if (level >= 3) errors.push(msg); });
    await win.loadFile(path.join(${JSON.stringify(here)}, "renderer", "index.html"));
    const run = (js) => win.webContents.executeJavaScript(js);
    const until = async (js, ms = 6000) => { const t0 = Date.now(); for (;;) { try { const v = await run(js); if (v) return v; } catch {} if (Date.now() - t0 > ms) return false; await new Promise((r) => setTimeout(r, 60)); } };
    const untilJs = async (fn, ms = 15000) => { const t0 = Date.now(); for (;;) { const v = fn(); if (v) return v; if (Date.now() - t0 > ms) return false; await new Promise((r) => setTimeout(r, 80)); } };
    const shot = async (name) => { await new Promise((r) => setTimeout(r, 350)); const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(${JSON.stringify(shots)}, name + ".png"), img.toPNG()); };
    const view = (v) => run("document.querySelector('#nav [data-view=" + v + "]').click()");
    const type = (sel, v, ev = "input") => run("(function(){const i=document.querySelector(" + JSON.stringify(sel) + "); i.value=" + JSON.stringify(v) + "; i.dispatchEvent(new Event(" + JSON.stringify(ev) + "))})()");
    const click = (sel) => run("document.querySelector(" + JSON.stringify(sel) + ").click()");

    say(await until("document.querySelector('#modechip').textContent.includes('NO RUNPOD KEY')"), "with no key, the header says so in plain words");
    say(await until("document.querySelector('#nokey').style.display === 'block' && document.querySelector('#nokey').textContent.includes('RunPod')"), "Create tells him what is missing before anything else");
    say((await run("getComputedStyle(document.querySelector('.brand img')).width")) === "20px", "the logo in the header is small (20px) and is the real icon file", await run("document.querySelector('.brand img').getAttribute('src')"));
    say(await run("document.querySelectorAll('#nav button').length") === 5 && (await run("document.querySelector('#nav').textContent")).includes("MCP"), "there is an MCP section in the navigation");
    await shot("1-empty");
    await click("#go");
    say(await until("document.querySelector('#err').textContent.includes('what happens')"), "Generate with no scene says what to do");

    await view("settings");
    await type("#keyin", "rpa_BAD_KEY_0000000000"); await click("#keysave");
    say(await until("document.querySelector('#keyerr').textContent.includes('refused the key')"), "a wrong RunPod key is refused");
    say(await until("document.querySelector('#keystate').textContent === 'No key saved.'"), "…and not kept");
    await type("#keyin", "rpa_GOOD_KEY_1234567890"); await click("#keysave");
    say(await until("document.querySelector('#keystate').textContent.includes('7890') && document.querySelector('#keystate').textContent.includes('works')"), "a good RunPod key is saved and tested");
    await type("#hfin", "hf_GOODTOKEN_9876543210"); await click("#hfsave");
    say(await until("document.querySelector('#hfstate').textContent.includes('3210')"), "the Hugging Face token is saved");
    const html = await run("document.documentElement.innerHTML");
    say(!html.includes("GOOD_KEY_1234567890") && !html.includes("GOODTOKEN_9876543210"), "neither key is ever written into the page");
    const files = fs.readdirSync(${JSON.stringify(join(home, "data"))});
    say(files.includes("runpod.key") && files.includes("hf.key"), "each key is in its own file");
    say(!(fs.existsSync(${JSON.stringify(join(home, "data", "xugc.json"))}) && /GOOD_KEY|GOODTOKEN/.test(fs.readFileSync(${JSON.stringify(join(home, "data", "xugc.json"))}, "utf8"))), "and neither is in the app's state file");
    await click("#sweep");
    say(await until("document.querySelector('#sweepnote').textContent.includes('Stopped 2 GPUs')"), "Stop-the-meter reports what it stopped");
    await shot("2-settings");

    // Create
    await view("create");
    say(await until("document.querySelector('#modechip').textContent.includes('RUNPOD') && document.querySelector('#nokey').style.display === 'none'"), "with both keys the warning is gone and the header shows RUNPOD");
    await type("#purl", "https://blackreaper.us/products/haunted-projector"); await click("#pfetch");
    say(await until("document.querySelector('#pfound').textContent.includes('Haunted Projector') && document.querySelectorAll('#pphotos img').length === 3 && document.querySelectorAll('#pphotos img.sel').length === 0"), "a product link brings in the name and the photos", await run("document.querySelector('#pfound').textContent"));
    // Reference ad
    say(await run("document.querySelector('#refdrop').style.display") !== "none" && await run("document.querySelector('#refbody').style.display") === "none", "the Reference ad box is there, empty, with a Choose button");
    run("window.xugc.refFromPath(" + JSON.stringify(${JSON.stringify(fixture)}) + ").then((f) => window.__loadReference(f)); 1");
    say(await until("document.querySelector('#refan').style.display === 'flex' && document.querySelector('#refan-title').textContent === 'ANALYZING'", 5000), "the reference box shows the analysis working: ANALYZING");
    say(await until("document.querySelectorAll('#refan-strip canvas').length >= 4 && parseInt(document.querySelector('#refan-pct').textContent) > 0", 10000), "frames appear live in a strip with a rising percentage", await run("document.querySelector('#refan-pct').textContent + ' ' + document.querySelectorAll('#refan-strip canvas').length + ' frames'"));
    await shot("9-analyzing");
    say(await until("document.querySelector('#refan-title').textContent === 'ANALYSIS COMPLETE' && document.querySelector('#refan').classList.contains('done')", 20000), "after a few seconds it marks ANALYSIS COMPLETE");
    say((await run("document.querySelector('#refan-stats').textContent")).includes("Shots") && (await run("document.querySelector('#refan-stats').textContent")).includes("Camera"), "the result lists length, shots, average shot, camera and light", await run("document.querySelector('#refan-stats').textContent"));
    await shot("9b-complete");
    say(await until("document.querySelector('#refbody').style.display === 'flex' && document.querySelector('#refsheet').complete && document.querySelector('#refsheet').naturalWidth > 300", 15000), "dropping a video reads its frames into a contact sheet", await run("document.querySelector('#refmeta').textContent"));
    say(/[0-9]+-[0-9.]+s: [(]shot 1/.test(await run("document.querySelector('#refbeats').value")), "the shots are listed with timings, ready to be described");
    await run("(function(){const i=document.querySelector('#refbeats'); i.value='0-1s: a man kneels beside a flat black heap and starts a blower. 1-2s: it rises and he steps back.'; i.dispatchEvent(new Event('change'))})()");
    await until("document.querySelector('#refhelp').textContent.length > 0");
    await run("(function(){const r=document.querySelector('#refrange'); r.value='3'; r.dispatchEvent(new Event('input'))})()");
    say(await until("document.querySelector('#reflvl').textContent === 'Same shots and timing'"), "the 'how close' slider has four stops and says which one is on");
    await run("document.querySelector('#showp').click()");
    say(await until("document.querySelector('#fulltext').value.includes('shot order and the timing') && document.querySelector('#fulltext').value.includes('a man kneels beside a flat black heap')"), "the full prompt shows exactly how much of the reference goes in");
    await run("document.querySelector('#showp').click()");
    await run("(function(){const r=document.querySelector('#refrange'); r.value='1'; r.dispatchEvent(new Event('input'))})()");
    say(await until("document.querySelector('#reflvl').textContent === 'Mood only'"), "moving the slider changes it");
    say(await untilJs(() => W.uploads.some((u) => u.name === "ref-sheet.jpg" && u.bytes > 500), 10000), "the contact sheet is sent up so Claude can look at the frames");
    W.orders.push({ id: "r1", type: "reference_set", at: Date.now(), beats: "0-1s: a neighbour films a man starting a blower. 1-2s: the figure stands up.", level: 2 });
    say(await untilJs(() => W.results.some((r) => r.id === "r1" && r.state === "done")), "Claude can describe the shots and set how close to follow, over MCP");
    say(await until("document.querySelector('#refbeats').value.includes('a neighbour films') && document.querySelector('#reflvl').textContent === 'Same story'"), "…and the app shows it at once");
    await run("document.querySelectorAll('#pphotos img')[2].click()");
    say(await until("document.querySelectorAll('#pphotos img.sel').length === 1 && document.querySelector('#pfound').textContent.includes('1 locked')"), "tapping a photo locks the video to it as well");
    await run("document.querySelector('#avmode [data-m=pick]').click()");
    say(await until("document.querySelector('#avpick').style.display === 'flex' && document.querySelectorAll('#avpick button').length === 5"), "'Pick one' shows five people");
    await run("[...document.querySelectorAll('#avpick button')].find((b) => b.textContent === 'Jordan').click()");
    await run("document.querySelector('#secs button:nth-child(2)').click()");
    await run("document.querySelector('#quals button:nth-child(1)').click()");
    say(await until("document.querySelector('#secs button.on').textContent === '10s' && document.querySelector('#quals button.on').textContent.includes('Draft')"), "length and quality buttons select");
    const est1 = await run("document.querySelector('#goest').textContent");
    await run("document.querySelector('#secs button:nth-child(4)').click(); document.querySelector('#quals button:nth-child(3)').click()");
    await until("document.querySelector('#goest').textContent !== " + JSON.stringify(est1));
    say((await run("document.querySelector('#goest').textContent")) !== est1, "the price on the button changes with length and quality", est1 + " -> " + await run("document.querySelector('#goest').textContent"));
    await run("document.querySelector('#secs button:nth-child(2)').click(); document.querySelector('#quals button:nth-child(1)').click()");
    await until("document.querySelector('#secs button.on').textContent === '10s'");
    await type("#script", "She plugs the projector in, points it at her front window, and a ghost appears on the glass.");
    await shot("3-ready");
    await click("#go");
    say(await until("document.querySelector('#render').classList.contains('on')"), "pressing Generate opens the render screen");
    await new Promise((r) => setTimeout(r, 1800));
    say(await run("document.querySelector('#ht').textContent") !== "0:00", "the timer is running", await run("document.querySelector('#ht').textContent"));
    say(await run("Number(document.querySelector('#hc').textContent.replace(/[^0-9.]/g,'').slice(0,4))") > 0, "the live cost is going up", await run("document.querySelector('#hc').textContent"));
    say((await run("document.querySelector('#hud').textContent")).includes("> "), "the code lines of what the GPU is doing stream by", await run("document.querySelector('#hud').textContent.slice(0,80)"));
    say(await run("document.querySelector('#go').disabled"), "Generate is locked while a job runs");
    say(await run("(function(){const c=document.querySelector('#cv'),g=c.getContext('2d');const d=g.getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=4*97)if(d[i+3]>40)n++;return n})()") > 5, "stars and code are really being drawn on the canvas");
    await shot("4-working");
    say(await until("document.querySelectorAll('#takes .take').length === 1 && !document.querySelector('#render').classList.contains('on')", 12000), "the finished video appears in the takes column");
    say(await until("document.querySelector('#pv').src.endsWith('.mp4') && document.querySelector('#pv').readyState >= 1 && document.querySelector('#pv').style.display === 'block'", 8000), "the video element has really loaded the clip");
    say((await run("document.querySelector('#ptag').textContent")).includes("$0.81") && (await run("document.querySelector('#hint').textContent")).includes("with sound"), "the take shows what it cost and that it has sound");
    await shot("5-generated");
    const g1 = log.find((l) => l.run === "generate.sh");
    say(g1 && g1.env.PROMPT.includes("Jordan") && g1.env.PROMPT.includes("Haunted Projector") && g1.env.PROMPT.includes("ghost appears on the glass") && g1.env.PROMPT.includes("iPhone") && g1.env.FRAMES === "241" && g1.env.WIDTH === "512" && /^ref1[.]jpg:0:1$/.test(g1.env.REFS || ""), "the GPU got person + product + his words + the Style Bible, 10s = 241 frames, draft size");
    say((await run("document.querySelector('#modechip').textContent")).includes("$0.81"), "today's spending moved by the real cost");

    // Train: the Style Bible
    await run("document.querySelector('#vup').click()");
    say(await until("document.querySelector('#vup').classList.contains('on')"), "👍 lights up");
    await view("train");
    say(await until("document.querySelectorAll('#files .file').length === 13"), "the thirteen starter Style Bible files are listed");
    say(await until("document.querySelector('#n-clips').textContent === '1' && document.querySelector('#n-appr').textContent === '1'"), "the 👍 take is in the training pile");
    await run("document.querySelectorAll('#files .file .tg')[2].click()");
    say(await until("document.querySelectorAll('#files .tg.off').length === 1"), "a style file can be switched off");
    await run("document.querySelectorAll('#files .file')[0].click()");
    say(await until("document.querySelector('#editor').value.includes('## Prompt') && document.querySelector('#editor').value.includes('BREAKING NEWS')"), "clicking a file opens its text to read and edit");
    await type("#editor", "# calm-voice.md\\nQuiet delivery.\\n\\n## Prompt\\n- She speaks softly, almost whispering\\n");
    await run("document.querySelector('#stylenew').click()");
    await type("#editor", "# calm-voice.md\\nQuiet delivery.\\n\\n## Prompt\\n- She speaks softly, almost whispering\\n"); await click("#edsave");
    say(await until("document.querySelectorAll('#files .file').length === 14 && document.querySelector('#files').textContent.includes('calm-voice.md')"), "a new style file can be written and saved");
    await shot("6-train");
    await view("create");
    say(await until("document.querySelectorAll('#stylchips span').length === 14 && document.querySelectorAll('#stylchips span.off').length === 1"), "Create shows which style files are on and off");

    // MCP
    await view("mcp");
    say((await run("document.querySelector('#mcpurl').textContent")).includes("http://127.0.0.1"), "the connector URL is shown for copying");
    say(await until("document.querySelector('#mcpstate').textContent.includes('Connected')", 8000), "the app is connected to the line", await run("document.querySelector('#mcpstate').textContent"));
    say(W.statusPosts > 2 && W.status.app === "XUGC" && W.status.keys.runpod === true && !JSON.stringify(W.status).includes("GOOD_KEY") && !JSON.stringify(W.status).includes("GOODTOKEN"), "the app reports its status to Claude, never a key", W.statusPosts + " posts");
    say(W.status.takes.length === 1 && W.status.style.length === 14 && W.status.limits.perDay === 20, "the status shows takes, style files and the limits");
    // Claude asks for a video
    W.claudeAt = Date.now();
    const runsB = log.filter((l) => l.run).length;
    W.orders.push({ id: "o0", type: "generate", at: Date.now(), scene: "He holds the projector up to the window and a ghost appears", seconds: 5, quality: "draft", look: "Selfie", avatar: "leo", music: "drop", productUrl: "https://blackreaper.us/products/haunted-projector", refs: "auto" });
    say(await until("document.querySelector('#approve').classList.contains('on') && document.querySelector('#ap-prompt').value.includes('Leo')", 15000), "a video Claude orders shows its full prompt and price on screen and WAITS", await run("document.querySelector('#ap-meta').textContent"));
    say((await run("document.querySelector('#cbtext').textContent")).includes("waiting for your OK") && (await run("document.querySelector('#ap-prompt').value.length")) > 3500, "the Claude bar says it is waiting, and the prompt shown is the huge one");
    say((await run("document.querySelector('#ap-prompt').value")).includes("bass drop"), "the music choice is in the prompt");
    say((await run("document.querySelector('#ap-meta').textContent")).includes("BREAKING NEWS"), "the approval screen lists the on-screen captions that will be burned in");
    say(log.filter((l) => l.run).length === runsB, "…and no GPU has been rented while it waits");
    await shot("7a-approve");
    await click("#ap-no");
    say(await untilJs(() => W.results.some((r) => r.id === "o0" && r.state === "refused")), "pressing No cancels it with nothing rented", JSON.stringify(W.results.filter((r) => r.id === "o0").map((r) => r.error || r.state)));
    await run("document.querySelector('#nav [data-view=mcp]').click()"); await click("#ap-off");
    await until("document.querySelector('#ap-off').classList.contains('on')");
    W.orders.push({ id: "o1", type: "generate", at: Date.now(), scene: "He holds the projector up to the window and a ghost appears", seconds: 5, quality: "draft", look: "Selfie", avatar: "leo", productUrl: "https://blackreaper.us/products/haunted-projector" });
    say(await untilJs(() => W.results.some((r) => r.id === "o1" && r.state === "done"), 20000), "an order from Claude to make a video runs through the real engine and reports done", JSON.stringify(W.results.filter((r) => r.id === "o1").map((r) => r.state + (r.cost ? " $" + r.cost : ""))));
    const g2 = log.filter((l) => l.run === "generate.sh")[1];
    say(g2 && g2.env.PROMPT.includes("Leo") && g2.env.FRAMES === "121", "…using the same prompt builder and frame counts as the screen");
    await click("#ap-on"); await until("document.querySelector('#ap-on').classList.contains('on')");
    W.orders.push({ id: "o1b", type: "generate", at: Date.now(), scene: "A neighbour films the giant figure rising on the lawn", seconds: 5, quality: "draft", music: "soft", productUrl: "https://blackreaper.us/products/haunted-projector", refs: "auto" });
    say(await until("document.querySelector('#approve').classList.contains('on')", 15000), "with 'Ask me first' on, the next order waits again");
    await run("document.querySelector('#ap-prompt').value = document.querySelector('#ap-prompt').value + ' EXTRA LINE BY ALEX'"); await click("#ap-yes");
    say(await until("document.querySelector('#render').classList.contains('on')", 8000), "after Approve the render screen opens by itself, with the stage rail", await run("document.querySelector('#rail').textContent"));
    await shot("7b-render-remote");
    say(await untilJs(() => W.results.some((r) => r.id === "o1b" && r.state === "done"), 25000), "the approved video renders and reports done");
    say(log.filter((l) => l.run).at(-1).env.PROMPT.includes("EXTRA LINE BY ALEX") && /^ref1\.jpg:0:1/.test(log.filter((l) => l.run).at(-1).env.REFS || ""), "his edit to the prompt is what ran, with the product's reference photos");
    say(await until("document.querySelectorAll('#takes .take').length >= 2 && !document.querySelector('#render').classList.contains('on')", 12000), "the finished video shows up in the app without anyone sending it in chat");
    await click("#ap-off");
    W.orders.push({ id: "o2", type: "style_write", at: Date.now(), name: "from-claude.md", content: "# from-claude.md\\n## Prompt\\n- Test line from Claude\\n" });
    say(await untilJs(() => W.results.some((r) => r.id === "o2" && r.state === "done")), "Claude can write a Style Bible file");
    W.orders.push({ id: "o3", type: "style_write", at: Date.now(), name: "../../evil.md", content: "x" });
    say(await untilJs(() => W.results.some((r) => r.id === "o3" && r.state === "error")), "…but a path-escaping name is refused by the app too");
    const t1 = JSON.parse(fs.readFileSync(${JSON.stringify(join(home, "data", "xugc.json"))}, "utf8")).takes[0].id;
    W.orders.push({ id: "o5", type: "set_caps", at: Date.now(), capJob: 9999 });
    say(await untilJs(() => W.results.some((r) => r.id === "o5" && r.state === "refused")), "an order that tries to change anything not on the list (like spending limits) is refused", JSON.stringify(W.results.filter((r) => r.id === "o5")));
    say(JSON.parse(fs.readFileSync(${JSON.stringify(join(home, "data", "xugc.json"))}, "utf8")).settings.capJob === 5, "…and the limit is unchanged");
    W.orders.push({ id: "o6", type: "share", at: Date.now(), takeId: t1 });
    say(await untilJs(() => W.uploads.filter((u) => u.name !== "ref-sheet.jpg").length === 1), "Claude can ask for a finished video to be uploaded for review", JSON.stringify(W.uploads));
    say(W.uploads.some((u) => u.name === t1 + ".mp4" && u.bytes > 10000), "…and the right file went up whole");
    await view("mcp");
    say((await run("document.querySelector('#mcplog').textContent")).includes("Claude asked: generate"), "the MCP screen lists what Claude asked for");
    await shot("7-mcp");
    // switched off
    await click("#mcp-off");
    say(await until("document.querySelector('#mcpstate').textContent.includes('Off')"), "switching Claude control off shows Off");
    const n0 = W.statusPosts; await new Promise((r) => setTimeout(r, 900));
    say(W.statusPosts === n0, "…and the app stops talking to the line at all");
    await click("#mcp-on");
    say(await until("document.querySelector('#mcpstate').textContent.includes('Connected')", 8000), "…and switching it on again reconnects");

    // Cancel
    await view("create");
    const before = await run("document.querySelectorAll('#takes .take').length");
    await click("#go");
    await until("document.querySelector('#render').classList.contains('on')");
    await new Promise((r) => setTimeout(r, 700));
    await click("#stop");
    say(await until("document.querySelector('#err').classList.contains('on') && document.querySelector('#err').textContent.includes('Cancelled')", 8000), "Stop cancels the job and says what it cost", await run("document.querySelector('#err').textContent"));
    say(await run("document.querySelectorAll('#takes .take').length") === before, "…and no video was added");

    // Caps, on screen and from Claude
    await view("settings");
    await type("#cap-job", "0.5", "change");
    await new Promise((r) => setTimeout(r, 250));
    await view("create");
    await click("#go");
    say(await until("document.querySelector('#err').textContent.includes('over your per-video limit')"), "over the per-video limit: refused on screen, before any GPU", await run("document.querySelector('#err').textContent"));
    const runsBefore = log.filter((l) => l.run).length;
    W.orders.push({ id: "o7", type: "generate", at: Date.now(), scene: "A long scene description here", seconds: 20, quality: "full" });
    say(await untilJs(() => W.results.some((r) => r.id === "o7" && r.state === "error" && /per-video limit/.test(r.error || ""))), "Claude's video request is refused by the same limit");
    say(log.filter((l) => l.run).length === runsBefore, "…and no GPU was started for either");
    await shot("8-cap");

    await view("train");
    await click("#linkstarter");
    say((await run("document.querySelector('#linkbox').value")).includes("tiktok.com/@itsmodernmillie") && (await run("document.querySelector('#linkbox').value.split('\\\\n').filter(Boolean).length")) >= 59, "Load the starter list puts ChatGPT's 59 links in the box");
    await click("#collectgo");
    say(await until("document.querySelector('#colstat').textContent.includes('Finished. 4 new videos, 12 new pieces')", 8000), "Collect runs by itself and reports what it got", await run("document.querySelector('#colstat').textContent"));
    say(await until("document.querySelector('#collectgo').style.display !== 'none'", 3000), "…and the Collect button comes back when it is done");
    await shot("9-train-reallife");
    say((await run("document.querySelector('#trdryest').textContent")).includes("$") && (await run("document.querySelector('#trfullest').textContent")).includes("$"), "both training buttons show their price", await run("document.querySelector('#trdryest').textContent + ' / ' + document.querySelector('#trfullest').textContent"));
    await run("document.querySelectorAll('#trmodels button')[1].click()"); await new Promise((r) => setTimeout(r, 300));
    await click("#trdry");
    say(await until("document.querySelector('#trmodal').style.display === 'flex' && document.querySelector('#trmt').textContent.includes('Dry run Wan 2.2')", 4000), "a dry run asks for Approve first, with the price and what it does", await run("document.querySelector('#trmb').textContent"));
    const nrun0 = log.filter((l) => l.run === "train_lora.sh").length;
    await click("#trmno"); await new Promise((r) => setTimeout(r, 300));
    say(log.filter((l) => l.run === "train_lora.sh").length === nrun0, "Cancel on the approval: no GPU was rented");
    await click("#trdry"); await until("document.querySelector('#trmodal').style.display === 'flex'", 3000); await click("#trmyes");
    say(await until("document.querySelector('#trstat').textContent.startsWith('Done. XUGC Real Life (Wan 2.2)')", 20000), "after Approve the training runs and says Done", await run("document.querySelector('#trstat').textContent"));
    const tl = log.filter((l) => l.run === "train_lora.sh").at(-1);
    say(tl && tl.env.MODEL === "wan" && tl.env.DRY === "1" && tl.env.TRIGGER === "xugciphone", "the GPU got the right model, dry flag and trigger word");
    say((await run("document.querySelector('#lorals').textContent")).includes("XUGC Real Life · wan · dry run"), "the trained file is listed as XUGC Real Life");
    say((await run("document.querySelectorAll('#trbudget button').length")) === 3 && (await run("document.querySelector('#trfullest').textContent")) === "up to $5.00", "the training button shows the $5 budget the user picked", await run("document.querySelector('#trfullest').textContent"));
    await run("document.querySelectorAll('#trmodels button')[0].click()"); await new Promise((r) => setTimeout(r, 300));
    await click("#trfull"); await until("document.querySelector('#trmodal').style.display === 'flex'", 3000);
    say((await run("document.querySelector('#trmb').textContent")).includes("at most $5.00") && (await run("document.querySelector('#trmb').textContent")).includes("stop and keep"), "the approval says the most it can cost and that Stop keeps what is trained", await run("document.querySelector('#trmb').textContent"));
    await click("#trmyes");
    say(await until("document.querySelector('#trstat').textContent.startsWith('Done. XUGC Real Life (LTX-2.5)')", 20000), "the budgeted training runs and says Done");
    const tl2 = log.filter((l) => l.run === "train_lora.sh").at(-1);
    say(tl2 && tl2.env.MODEL === "ltx" && tl2.env.BUDGET === "1" && tl2.env.DRY === "0", "the GPU was told: LTX, budgeted, not a dry run");
    await view("create");
    say((await run("document.querySelectorAll('#engines button').length")) === 4, "Create has an engine switch with four engines");
    await run("document.querySelectorAll('#reallife button')[1].click()");
    say((await run("document.querySelectorAll('#reallife button')[1].disabled")) === false && (await run("document.querySelector('#rlnote').textContent")).includes('your trained file'), "with an LTX XUGC Real Life file trained, the Real Life switch on Create is available", await run("document.querySelector('#rlnote').textContent"));
    say(errors.length === 0, "no errors in the page console", errors.join(" | ").slice(0, 300));
  } catch (e) { say(false, "the probe crashed", String(e && e.stack || e)); }
  console.log("@@RESULT@@" + JSON.stringify(out));
  app.exit(0);
});
`;
await writeFile(join(home, "probe.cjs"), probe); await writeFile("/tmp/probe-last.cjs", probe);
const electron = join(here, "node_modules", ".bin", "electron");
const child = spawn("xvfb-run", ["-a", "-s", "-screen 0 1400x900x24", electron, "--no-sandbox", "--disable-gpu", "--autoplay-policy=no-user-gesture-required", "--user-data-dir=" + join(home, "ud"), join(home, "probe.cjs")], { stdio: ["ignore", "pipe", "pipe"] });
let stdout = "", stderr = "";
child.stdout.on("data", (d) => (stdout += d)); child.stderr.on("data", (d) => (stderr += d));
const code = await new Promise((r) => { const t = setTimeout(() => { child.kill("SIGKILL"); r("timeout"); }, 300000); child.on("close", (c) => { clearTimeout(t); r(c); }); });
const line = stdout.split("\n").find((l) => l.startsWith("@@RESULT@@"));
let failed = 0;
if (!line) { console.log("FAIL  no result from electron (" + code + ")\n" + stderr.slice(-1500) + stdout.slice(-600)); failed = 1; }
else for (const r of JSON.parse(line.slice(10))) { if (!r.ok) failed++; console.log((r.ok ? "ok    " : "FAIL  ") + r.what + (r.extra ? "  — " + String(r.extra).slice(0, 260) : "")); }
if (!process.env.XUGC_SHOTS) await rm(home, { recursive: true, force: true }).catch(() => {});
process.exit(failed ? 1 : 0);

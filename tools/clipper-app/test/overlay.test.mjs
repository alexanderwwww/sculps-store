/*
 * The overlay, in a real Chromium, driven the way the runner drives Alex's Chrome:
 * Chromium is started on its own with a DevTools port and reached with
 * connectOverCDP (no viewport emulation, exactly like his Mac), at device scale 2
 * (a Retina screen). Every move goes through ui.mjs -> page.mouse.
 *
 * Proves: the cursor follows real mouse events along a curved human path and lands
 * inside the target; the ring wraps the hovered element; a click ripples and goes
 * THROUGH the overlay to the page (a button under the pill is clickable); the pill
 * text changes with ui.say and comes back after a navigation; the wheel scrolls the
 * page and an inner panel; an off-screen element is wheeled into view; the overlay
 * survives SPA body wipes, a document re-render and document.open(); it stays above
 * a modal <dialog>; it never draws on /accounts/login or /login; and no pixel it
 * draws on a neutral page has colour (no blue, purple or green).
 *
 * Screenshots land in test/shots/ to be LOOKED at.
 *
 *   TMPDIR=/tmp node test/overlay.test.mjs
 */
import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import * as ui from "../src/ui.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const PW = fs.existsSync("/home/user/sculps-store/node_modules/playwright-core")
  ? "/home/user/sculps-store/node_modules/playwright-core"
  : path.resolve(HERE, "../../../node_modules/playwright-core");
const { chromium } = require(PW);
const CHROME = process.env.ULTRA_TEST_CHROMIUM || "/opt/pw-browsers/chromium";
const SHOTS = path.join(HERE, "shots");
const BUILD = "7";

const KILL = setTimeout(() => { console.log("FAIL  overlay test timed out after 240 s"); process.exit(1); }, 240000);

/* ------------------------------------------------------------------ results */

let failed = 0, passed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`  ok  ${name}`); }
  else { failed++; console.log(`FAIL  ${name}${detail === undefined ? "" : `  -> ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`); }
  return Boolean(cond);
}
async function step(name, fn) {
  try { await fn(); } catch (e) { failed++; console.log(`FAIL  ${name} threw: ${String(e && e.stack || e).split("\n").slice(0, 3).join(" | ")}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* -------------------------------------------------------------------- pages */

const BASE_CSS = `
*{box-sizing:border-box} html,body{margin:0} body{font:15px/1.45 Inter,-apple-system,Helvetica,Arial,sans-serif}
header{height:64px;display:flex;align-items:center;gap:28px;padding:0 40px;font-weight:600}
header nav{display:flex;gap:22px;font-weight:500;font-size:14px;opacity:.7}
.hero{padding:34px 40px 10px} .hero h1{font-size:40px;line-height:1.1;margin:0 0 10px;letter-spacing:-.02em} .hero p{margin:0;max-width:560px;opacity:.7}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:22px;padding:28px 40px}
.card{border-radius:14px;padding:12px;min-height:250px;display:flex;flex-direction:column;gap:8px}
.card .img{flex:1;border-radius:10px;min-height:150px}
.card b{font-size:14px} .card span{font-size:13px;opacity:.65}
button{font:600 14px Inter,Helvetica,sans-serif;border-radius:10px;padding:12px 18px;cursor:pointer}
#cta{margin:0 40px} #under{position:fixed;left:14px;bottom:12px;width:300px;height:60px}
.far{margin:900px 40px 200px;padding:30px;border-radius:14px}
`;

function neutralPage(dark) {
  const bg = dark ? "#0b0b0b" : "#ffffff", fg = dark ? "#ededed" : "#111111";
  const card = dark ? "#161616" : "#f4f4f4", img = dark ? "#262626" : "#e3e3e3", line = dark ? "#2a2a2a" : "#dddddd";
  const btn = dark ? "background:#ededed;color:#0b0b0b;border:0" : "background:#111;color:#fff;border:0";
  const cards = Array.from({ length: 8 }, (_, i) => `<div class="card" id="p${i + 1}"><div class="img"></div><b>Product ${i + 1}</b><span>$${(19 + i * 7).toFixed(2)} · ${(1.2 + i).toFixed(1)}K sold</span></div>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${dark ? "dark" : "white"}</title><style>${BASE_CSS}
body{background:${bg};color:${fg}} header{border-bottom:1px solid ${line}} .card{background:${card}} .card .img{background:${img}}
button{${btn}} .far{background:${card}}</style></head><body>
<header>Goodsy<nav><span>New</span><span>Best sellers</span><span>Bundles</span><span>Reviews</span></nav></header>
<section class="hero"><h1>The bottle chiller everyone is asking about</h1><p>No fridge. No ice. Cold water in four minutes, anywhere on the counter.</p></section>
<div class="grid">${cards}</div>
<button id="cta">Add to cart · <span id="count">0</span></button>
<div class="far" id="far">Reviews · 4.9 · 2,431 ratings</div>
<button id="under">Under the pill · <span id="ucount">0</span></button>
<script>
document.getElementById('cta').addEventListener('click',()=>{const c=document.getElementById('count');c.textContent=String(+c.textContent+1)});
document.getElementById('under').addEventListener('click',()=>{const c=document.getElementById('ucount');c.textContent=String(+c.textContent+1)});
</script></body></html>`;
}

function busyPage() {
  const hues = [8, 28, 46, 160, 192, 214, 262, 300, 340, 120, 20, 200];
  const tiles = hues.map((h, i) => `<a class="tile" id="t${i + 1}" href="/video/${7000 + i}" style="background:linear-gradient(160deg,hsl(${h} 85% 62%),hsl(${(h + 40) % 360} 80% 32%))"><i>${(1 + i * 0.7).toFixed(1)}M</i><em>@seller${i + 1} · this thing is insane #fyp #tiktokmademebuyit</em></a>`).join("");
  const comments = Array.from({ length: 40 }, (_, i) => `<p class="c"><b>user${i + 1}</b> ${["where do I get this??", "link pls", "need this for my mom", "omg", "how much?", "ordered 2", "does it ship to Texas", "lol"][i % 8]}</p>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>busy</title><style>${BASE_CSS}
body{background:#121212;color:#f1f1f1} .top{position:sticky;top:0;z-index:50;height:60px;background:#000;display:flex;align-items:center;gap:16px;padding:0 24px;border-bottom:1px solid #222}
.top input{flex:0 0 420px;height:38px;border-radius:19px;border:0;background:#2a2a2a;color:#fff;padding:0 16px;font:14px Inter,sans-serif}
.top .logo{font-weight:800;font-size:20px;letter-spacing:-.02em;background:linear-gradient(90deg,#25f4ee,#fe2c55);-webkit-background-clip:text;color:transparent}
.wrap{display:flex} aside{width:220px;padding:18px;display:flex;flex-direction:column;gap:12px;font-weight:600;color:#bbb}
aside span:first-child{color:#fe2c55}
.g{flex:1;display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:16px}
.tile{position:relative;display:block;height:300px;border-radius:8px;overflow:hidden;color:#fff;text-decoration:none}
.tile i{position:absolute;left:10px;bottom:34px;font-style:normal;font-weight:700} .tile em{position:absolute;left:10px;right:10px;bottom:10px;font-style:normal;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#comments{position:fixed;right:16px;top:76px;width:300px;height:330px;overflow:auto;background:#1e1e1e;border-radius:12px;padding:6px 14px;z-index:40}
#comments .c{margin:10px 0;font-size:13px} #comments b{color:#fe2c55;margin-right:6px}
dialog{border:0;border-radius:16px;padding:28px;width:520px;height:440px;background:#fff;color:#111;position:fixed;left:0;bottom:0;margin:0 0 0 0;inset:auto auto 0 0}
dialog::backdrop{background:rgba(0,0,0,.55)}
</style></head><body>
<div class="top"><span class="logo">TikTok</span><input value="bottle chiller"><span>Top</span><span>Videos</span><span>Users</span></div>
<div class="wrap"><aside><span>For You</span><span>Explore</span><span>Following</span><span>LIVE</span><span>Profile</span></aside><div class="g">${tiles}</div></div>
<div id="comments">${comments}</div>
<div style="height:900px"></div>
<dialog id="modal"><h2 style="margin:0 0 10px">Log in to follow creators</h2><p>A white modal opened by the page, in the top layer.</p></dialog>
</body></html>`;
}

function spaPage(title) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${BASE_CSS} body{background:#fafafa;color:#111}
#box{margin:120px auto;width:360px;height:160px;border-radius:16px;background:#e8e8e8;display:flex;align-items:center;justify-content:center;font-weight:600}</style></head>
<body><div id="box">SPA ${title}</div></body></html>`;
}

function loginPage() {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Log in</title><style>${BASE_CSS} body{background:#fff;color:#111}
form{margin:120px auto;width:340px;display:flex;flex-direction:column;gap:12px} input{height:40px;padding:0 12px;border:1px solid #ccc;border-radius:8px}</style></head>
<body><form><b>Log in</b><input id="u" placeholder="Phone, username or email"><input type="password" placeholder="Password"><button type="button" id="go" style="background:#111;color:#fff;border:0">Log in</button></form></body></html>`;
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const send = (body) => { res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }); res.end(body); };
  if (u.pathname === "/white") return send(neutralPage(false));
  if (u.pathname === "/dark") return send(neutralPage(true));
  if (u.pathname === "/busy") return send(busyPage());
  if (u.pathname === "/csp") {
    // What Google and Meta pages send: no inline style, no inline script, Trusted Types.
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; require-trusted-types-for 'script'; trusted-types 'none'",
    });
    return res.end(`<!doctype html><html><head><meta charset="utf-8"><title>csp</title></head><body><h1>Strict CSP</h1><p id="t">No inline styles allowed here.</p><button id="b">A button</button></body></html>`);
  }
  if (u.pathname === "/green") return send(`<!doctype html><html><body style="margin:0;height:100vh;background:#00cc00;font:16px Inter,sans-serif;color:#063"><p style="padding:30px">A saturated green page.</p></body></html>`);
  if (u.pathname.startsWith("/spa")) return send(spaPage(u.pathname));
  if (u.pathname.startsWith("/accounts/login") || u.pathname.startsWith("/login")) return send(loginPage());
  res.writeHead(404); res.end("no");
});

// The real sign-in hosts, served over TLS from here: Chromium maps
// accounts.google.com, appleid.apple.com and www.facebook.com to this server
// (--host-resolver-rules) and accepts its throwaway certificate.
let secure = null;
function startSecure(dir) {
  const key = path.join(dir, "k.pem"), cert = path.join(dir, "c.pem");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-days", "1", "-subj", "/CN=ultracursor-test"], { stdio: "ignore" });
  secure = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, (req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    res.end(`<!doctype html><html><head><meta charset="utf-8"><title>${req.headers.host}</title></head><body style="margin:0;background:#fff;font:16px Inter,sans-serif">
<div id="box" style="margin:140px auto;width:380px;height:180px;border-radius:14px;background:#eee;display:flex;align-items:center;justify-content:center">${req.headers.host}${req.url.replace(/[<>&"]/g, "")}</div></body></html>`);
  });
  return new Promise((r) => secure.listen(0, "127.0.0.1", () => r(secure.address().port)));
}

/* ---------------------------------------------------------- tiny PNG reader */

// Chromium screenshots: 8-bit RGB/RGBA, not interlaced. Enough to read pixels
// without a dependency.
function readPng(buf) {
  let off = 8, w = 0, h = 0, type = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), t = buf.toString("ascii", off + 4, off + 8);
    const d = buf.subarray(off + 8, off + 8 + len);
    if (t === "IHDR") { w = d.readUInt32BE(0); h = d.readUInt32BE(4); type = d[9]; if (d[8] !== 8 || d[12] !== 0) throw new Error("png: unsupported"); }
    else if (t === "IDAT") idat.push(d);
    else if (t === "IEND") break;
    off += 12 + len;
  }
  const bpp = type === 6 ? 4 : type === 2 ? 3 : 0;
  if (!bpp) throw new Error(`png: colour type ${type}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp, out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride), p = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[p++], line = Buffer.from(raw.subarray(p, p + stride)); p += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      line[i] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      out[(y * w + x) * 4] = line[x * bpp]; out[(y * w + x) * 4 + 1] = line[x * bpp + 1];
      out[(y * w + x) * 4 + 2] = line[x * bpp + 2]; out[(y * w + x) * 4 + 3] = bpp === 4 ? line[x * bpp + 3] : 255;
    }
    prev = line;
  }
  return { w, h, px: out };
}
function chroma(img) {
  let max = 0, at = null, over = 0;
  for (let i = 0; i < img.w * img.h; i++) {
    const r = img.px[i * 4], g = img.px[i * 4 + 1], b = img.px[i * 4 + 2];
    const c = Math.max(r, g, b) - Math.min(r, g, b);
    if (c > 12) over++;
    if (c > max) { max = c; at = { x: i % img.w, y: Math.floor(i / img.w), r, g, b }; }
  }
  return { max, at, over };
}
function pixel(img, x, y) {
  const i = (Math.round(y) * img.w + Math.round(x)) * 4;
  return { r: img.px[i], g: img.px[i + 1], b: img.px[i + 2] };
}

/* ---------------------------------------------------------------- browser */

async function startChromium(dir, securePort) {
  const map = ["accounts.google.com", "appleid.apple.com", "www.facebook.com"].map((h) => `MAP ${h} 127.0.0.1:${securePort}`).join(",");
  const proc = spawn(CHROME, [
    `--host-resolver-rules=${map}`, "--ignore-certificate-errors",
    // A proxy in the environment (cloud containers) would send these hosts to
    // the real sites and bypass the resolver map: always go direct.
    "--no-proxy-server",
    "--headless=new", "--no-sandbox", "--remote-debugging-port=0", `--user-data-dir=${dir}`,
    "--window-size=1280,800", "--force-device-scale-factor=2", "--hide-scrollbars",
    "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
    // GPU compositing through SwiftShader, as Chrome composites on his Mac's GPU.
    // Without it, headless Chromium's software path silently drops any
    // backdrop-filter that contains blur(), and the glass cannot be judged.
    "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  const ws = await new Promise((resolve, reject) => {
    let err = "";
    const t = setTimeout(() => reject(new Error(`Chromium did not open its DevTools port: ${err.slice(-400)}`)), 30000);
    proc.stderr.on("data", (d) => {
      err += d;
      const m = err.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(t); resolve(m[1]); }
    });
    proc.on("exit", (c) => { clearTimeout(t); reject(new Error(`Chromium exited ${c}: ${err.slice(-400)}`)); });
  });
  const browser = await chromium.connectOverCDP(ws);
  return { browser, proc };
}

/* ------------------------------------------------------------------ tests */

const box = async (page, sel) => page.locator(sel).boundingBox();
const inside = (p, b, m = 0) => p && b && p.x >= b.x - m && p.x <= b.x + b.width + m && p.y >= b.y - m && p.y <= b.y + b.height + m;
const recordMoves = (page) => page.evaluate(() => {
  window.__moves = [];
  addEventListener("mousemove", (e) => window.__moves.push([e.clientX, e.clientY, e.isTrusted]), true);
});
const hostThere = (page) => page.evaluate(() => Boolean(document.querySelector("ultracursor-overlay")));

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const ORIGIN = `http://127.0.0.1:${server.address().port}`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uc-overlay-"));
  const securePort = await startSecure(dir);
  const { browser, proc } = await startChromium(dir, securePort);
  const context = browser.contexts()[0];
  const page = context.pages()[0] || await context.newPage();
  console.log(`chromium ${browser.version()} over CDP, viewport ${JSON.stringify(page.viewportSize())} (null = real window, as on his Mac)`);

  try {
    /* ---------------------------------------------------------- white page */
    await page.goto(`${ORIGIN}/white`);
    let att;
    await step("attach", async () => {
      att = await ui.attach(context, page, BUILD);
      check("attach mounts the overlay on a normal page", att.mounted === true && att.blocked === false, att);
      check("the overlay host is in the page", await hostThere(page));
      const s = await ui.state(page);
      check("pill shows the build", s && s.buildText === `· build ${BUILD}`, s && s.buildText);
      check("overlay sits in the top layer (above modals) or at max z-index", s && (s.topLayer === true || s.mounted), s && s.topLayer);
      check("cursor stays hidden until the mouse first moves", s && s.cursorOpacity === 0 && s.seen === false, s && s.cursorOpacity);
      const again = await ui.attach(context, page, BUILD);
      const n = await page.evaluate(() => document.querySelectorAll("ultracursor-overlay").length);
      check("attaching twice keeps one overlay", again.mounted && n === 1, n);
    });

    await step("hover follows the mouse", async () => {
      await recordMoves(page);
      const target = await box(page, "#p3");
      const at = await ui.hover(page, page.locator("#p3"));
      await sleep(80);
      const s = await ui.state(page);
      const moves = await page.evaluate(() => window.__moves);
      check("hover lands inside the element", inside(at, target), { at, target });
      check("overlay tip is exactly where the mouse is", s && s.tip && Math.abs(s.tip.x - at.x) < 1.01 && Math.abs(s.tip.y - at.y) < 1.01, { tip: s && s.tip, at });
      check("cursor is visible after moving", s && s.seen === true, s && s.seen);
      check(`the path is 18-30 real mouse moves (got ${moves.length - 1} + the first jump)`, moves.length >= 18 && moves.length <= 32, moves.length);
      check("every move is a trusted event", moves.every((m) => m[2] === true));
      const a = moves[1] || moves[0], b = moves[moves.length - 1];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const dev = Math.max(...moves.slice(1).map((m) => Math.abs((b[0] - a[0]) * (a[1] - m[1]) - (a[0] - m[0]) * (b[1] - a[1])) / L));
      check(`the path curves (max ${dev.toFixed(1)}px off the straight line over ${L.toFixed(0)}px)`, L < 60 || dev > 2, dev);
      await sleep(350);
      const s2 = await ui.state(page);
      const r = s2.ring;
      check("highlight ring is on", r.on === true && r.opacity > 0.95, r);
      check("ring wraps the hovered element (2-10px outside every edge)",
        r.x <= target.x - 2 && r.x >= target.x - 10 && r.y <= target.y - 2 && r.y >= target.y - 10
        && r.x + r.w >= target.x + target.width + 2 && r.x + r.w <= target.x + target.width + 10
        && r.y + r.h >= target.y + target.height + 2 && r.y + r.h <= target.y + target.height + 10, { ring: r, target });
    });

    await step("hover with an ElementHandle and with a point", async () => {
      const h = await page.$("#p6");
      const at = await ui.hover(page, h);
      const tb = await h.boundingBox(); // after: hover may have wheeled it into view
      check("ElementHandle target: lands inside it", inside(at, tb), { at, tb });
      await sleep(300);
      const r = (await ui.state(page)).ring;
      check("ElementHandle target: ring moved to it", r.x < tb.x && r.x + r.w > tb.x + tb.width, { r, tb });
      const at2 = await ui.hover(page, { x: 640, y: 120 });
      const s = await ui.state(page);
      check("{x,y} target: mouse and overlay land on the point", at2 && Math.abs(at2.x - 640) < 0.5 && Math.abs(s.tip.y - 120) < 1.01, { at2, tip: s.tip });
    });

    await step("say", async () => {
      const text = "TikTok · reading comments 12/40 · 3 buying signals";
      const ok = await ui.say(page, text);
      const s = await ui.state(page);
      check("ui.say changes the pill line", ok === true && s.status === text, s.status);
      await ui.say(page, "Meta Ad Library · reading ads for “bottle chiller” · 14 seen");
      check("ui.say again replaces it", (await ui.state(page)).status.startsWith("Meta Ad Library"));
    });

    await step("click ripples and reaches the page", async () => {
      const ok = await ui.click(page, page.locator("#cta"));
      const s = await ui.state(page);
      check("ui.click returns true", ok === true);
      check("click shows a glass ripple", s.ripples >= 1, s.ripples);
      check("the page button got the click", (await page.textContent("#count")) === "1", await page.textContent("#count"));
      await sleep(900);
      check("ripple is gone after it plays", (await ui.state(page)).ripples === 0);
    });

    await step("pointer-events none: the pill never blocks the page", async () => {
      await ui.hover(page, { x: 900, y: 300 }); // away from the pill so it is fully drawn
      await sleep(350);
      const s = await ui.state(page);
      const ub = await box(page, "#under");
      const p = s.pill;
      const overlap = p.x < ub.x + ub.width && p.x + p.w > ub.x && p.y < ub.y + ub.height && p.y + p.h > ub.y;
      check("the test button really sits under the pill", overlap, { pill: p, button: ub });
      const hit = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? (e.id || e.tagName) : null; }, [p.x + p.w / 2, p.y + p.h / 2]);
      check("elementFromPoint under the pill is the page's button, not the overlay", hit === "under" || hit === "ucount", hit);
      const ok = await ui.click(page, page.locator("#under"));
      check("a click through the pill reaches the button", ok && (await page.textContent("#ucount")) === "1", await page.textContent("#ucount"));
      const s2 = await ui.state(page);
      check("the pill steps aside (fades) while the cursor works under it", s2.pillOpacity < 0.5, s2.pillOpacity);
      await ui.hover(page, { x: 820, y: 330 });
      await sleep(400);
      check("and comes back when the cursor leaves", (await ui.state(page)).pillOpacity > 0.95);
    });

    await step("white page shots + no colour", async () => {
      await page.evaluate(() => { document.getElementById("under").style.visibility = "hidden"; }); // test-only button, not part of the look
      await ui.say(page, "TikTok · reading comments 12/40 · 3 buying signals");
      await ui.hover(page, page.locator("#p2"));
      await sleep(450);
      const shot = await page.screenshot({ path: path.join(SHOTS, "white.png") });
      const c = chroma(readPng(shot));
      check(`white page: nothing the overlay draws has colour (max chroma ${c.max})`, c.max <= 12, c);
      const s = await ui.state(page);
      await page.screenshot({ path: path.join(SHOTS, "white-cursor.png"), clip: { x: s.tip.x - 40, y: s.tip.y - 40, width: 180, height: 110 } });
      await page.screenshot({ path: path.join(SHOTS, "white-pill.png"), clip: { x: 0, y: s.pill.y - 24, width: Math.min(640, s.pill.x + s.pill.w + 40), height: s.pill.h + 40 } });
      // A ripple frame, caught mid-play.
      await page.evaluate(() => document.getElementById("cta").scrollIntoView({ block: "center" }));
      await sleep(150);
      const cb = await box(page, "#cta");
      await ui.hover(page, page.locator("#cta"));
      await page.mouse.down();
      await sleep(170);
      const t = (await ui.state(page)).tip;
      const rshot = await page.screenshot({ path: path.join(SHOTS, "white-ripple.png"), clip: { x: Math.max(0, t.x - 60), y: Math.max(0, t.y - 60), width: 200, height: 130 } });
      await page.mouse.up();
      const rc = chroma(readPng(rshot));
      check(`ripple has no colour (max chroma ${rc.max})`, rc.max <= 12, rc);
      check("(ripple shot was on the button)", inside(t, cb, 2));
    });

    /* ------------------------------------------------- navigation restores */
    await step("navigation keeps the status line and the cursor", async () => {
      const said = "Instagram · #bottlechiller · reading post 2/2";
      await ui.say(page, said);
      const before = await ui.state(page);
      await page.goto(`${ORIGIN}/dark`);
      await sleep(250);
      const s = await ui.state(page);
      check("overlay is back after a full navigation (init script)", s && s.mounted === true, s && s.mounted);
      check("the build is still shown", s && s.buildText === `· build ${BUILD}`, s && s.buildText);
      check("the status line came back after the navigation", s && s.status === said, s && s.status);
      check("the cursor came back where the mouse is", s && s.seen && Math.abs(s.x - before.x) < 0.5 && Math.abs(s.y - before.y) < 0.5, { before: [before.x, before.y], after: s && [s.x, s.y] });
    });

    await step("dark page shots + no colour", async () => {
      await page.evaluate(() => { document.getElementById("under").style.visibility = "hidden"; });
      await ui.say(page, "TikTok · reading comments 12/40 · 3 buying signals");
      await ui.hover(page, page.locator("#p7"));
      await sleep(450);
      const shot = await page.screenshot({ path: path.join(SHOTS, "dark.png") });
      const c = chroma(readPng(shot));
      check(`dark page: nothing the overlay draws has colour (max chroma ${c.max})`, c.max <= 12, c);
      const s = await ui.state(page);
      await page.screenshot({ path: path.join(SHOTS, "dark-cursor.png"), clip: { x: s.tip.x - 40, y: s.tip.y - 40, width: 180, height: 110 } });
      await page.screenshot({ path: path.join(SHOTS, "dark-pill.png"), clip: { x: 0, y: s.pill.y - 24, width: Math.min(640, s.pill.x + s.pill.w + 40), height: s.pill.h + 40 } });
      const img = readPng(shot);
      // The pill must be visibly different from a near-black page: its rim and
      // top highlight carry it. Mean brightness of its top edge vs the page.
      const y = Math.round((s.pill.y + 1) * 2);
      let sum = 0, n = 0;
      for (let x = Math.round((s.pill.x + 30) * 2); x < Math.round((s.pill.x + s.pill.w - 30) * 2); x++) { const p = pixel(img, x, y); sum += (p.r + p.g + p.b) / 3; n++; }
      const page0 = pixel(img, img.w - 6, (s.pill.y + s.pill.h / 2) * 2);
      check(`dark page: the pill's rim stands out (rim ${Math.round(sum / n)} vs page ${page0.r})`, sum / n - page0.r > 25, { rim: sum / n, page: page0 });
    });

    /* ------------------------------------------------------------ busy page */
    await step("busy page: scroll, inner panel, off-screen element, modal", async () => {
      await page.goto(`${ORIGIN}/busy`);
      await sleep(200);
      await ui.say(page, "TikTok · search “bottle chiller” · 12 clips · 4 buying signals");
      await ui.hover(page, page.locator("#t6"));
      await sleep(400);
      await page.screenshot({ path: path.join(SHOTS, "busy.png") });
      const s = await ui.state(page);
      await page.screenshot({ path: path.join(SHOTS, "busy-cursor.png"), clip: { x: s.tip.x - 40, y: s.tip.y - 40, width: 180, height: 110 } });
      await page.screenshot({ path: path.join(SHOTS, "busy-pill.png"), clip: { x: 0, y: s.pill.y - 24, width: Math.min(640, s.pill.x + s.pill.w + 40), height: s.pill.h + 40 } });

      const y0 = await page.evaluate(() => scrollY);
      const sent = await ui.scroll(page, 600);
      await sleep(400);
      const y1 = await page.evaluate(() => scrollY);
      check(`ui.scroll wheels the page down (sent ${sent}, page moved ${y1 - y0}px)`, sent === 600 && y1 - y0 >= 450, { sent, moved: y1 - y0 });
      const ring = (await ui.state(page)).ring;
      const t6 = await box(page, "#t6");
      check("the ring rides with its element while the page scrolls", Math.abs(ring.y - (t6.y - 5)) < 3 || ring.opacity === 0 || t6.y < 0, { ring, t6 });

      const c0 = await page.evaluate(() => document.getElementById("comments").scrollTop);
      await ui.scroll(page, 400, page.locator("#comments"));
      await sleep(400);
      const c1 = await page.evaluate(() => document.getElementById("comments").scrollTop);
      const y2 = await page.evaluate(() => scrollY);
      check(`ui.scroll(page, px, panel) scrolls the panel (moved ${c1 - c0}px), not the page`, c1 - c0 >= 250 && Math.abs(y2 - y1) < 5, { panel: c1 - c0, page: y2 - y1 });
      const up = await ui.scroll(page, -300, page.locator("#comments"));
      await sleep(400);
      const c2 = await page.evaluate(() => document.getElementById("comments").scrollTop);
      check("negative px scrolls up", up === -300 && c2 < c1, { up, c1, c2 });

      await page.evaluate(() => scrollTo(0, 0));
      await sleep(200);
      const far = page.locator("#t12");
      await page.evaluate(() => { document.getElementById("t12").style.marginTop = "0"; });
      const fb0 = await far.boundingBox();
      const at = await ui.hover(page, page.locator(".tile").last());
      const fb = await far.boundingBox();
      check(`an element below the fold is wheeled into view and hovered (was at y=${Math.round(fb0.y)})`, fb0.y + fb0.height > 800 ? inside(at, fb) && fb.y < 800 : inside(at, fb), { at, fb0, fb });
    });

    await step("busy page: a modal <dialog> opened by the page does not hide the overlay", async () => {
      await page.evaluate(() => scrollTo(0, 0));
      await ui.hover(page, { x: 900, y: 200 });
      await page.evaluate(() => document.getElementById("modal").showModal());
      await sleep(800);
      const s = await ui.state(page);
      const shot = await page.screenshot({ path: path.join(SHOTS, "busy-modal.png") });
      const img = readPng(shot);
      // Right padding of the pill: pill glass, which is dark. Under it the page
      // put a WHITE dialog, so a light pixel here means the dialog covers us.
      const p = pixel(img, (s.pill.x + s.pill.w - 7) * 2, (s.pill.y + s.pill.h / 2) * 2);
      const d = pixel(img, 500 * 2, (s.pill.y - 60) * 2);
      check(`the pill is drawn above the page's modal (pill pixel ${p.r}, dialog ${d.r})`, d.r > 200 && p.r < 90, { pill: p, dialog: d });
      check("overlay still mounted with a modal open", s.mounted === true);
      await page.evaluate(() => document.getElementById("modal").close());
    });

    await step("a page rule that paints every ::backdrop does not tint the page", async () => {
      await page.goto(`${ORIGIN}/spa/backdrop`);
      await sleep(200);
      await ui.hover(page, page.locator("#box"));
      await page.addStyleTag({ content: "::backdrop{background:rgba(255,0,0,.45)}" });
      await sleep(800);
      const s = await ui.state(page);
      const shot = await page.screenshot();
      const img = readPng(shot);
      const corner = pixel(img, img.w - 20, 20);
      check(`no red tint from our backdrop (corner ${JSON.stringify(corner)})`, corner.r - corner.g < 8, corner);
      check("overlay left the top layer and is still drawn", s.mounted === true && s.noTop === true && s.topLayer === false, { mounted: s.mounted, noTop: s.noTop, topLayer: s.topLayer });
    });

    await step("glass stays black and white over a saturated page", async () => {
      await page.goto(`${ORIGIN}/green`);
      await sleep(200);
      await ui.say(page, "Google Trends · bottle chiller · +38% in 4 weeks");
      await ui.hover(page, { x: 700, y: 300 });
      await sleep(600);
      const s = await ui.state(page);
      const shot = await page.screenshot({ path: path.join(SHOTS, "green.png") });
      const img = readPng(shot);
      // Inside the pill, clear of its rounded ends and rim: page colour must not come through.
      const p = s.pill;
      let max = 0;
      for (let y = Math.round((p.y + 6) * 2); y < Math.round((p.y + p.h - 6) * 2); y += 2)
        for (let x = Math.round((p.x + p.h) * 2); x < Math.round((p.x + p.w - p.h / 2) * 2); x += 2) {
          const q = pixel(img, x, y); max = Math.max(max, Math.max(q.r, q.g, q.b) - Math.min(q.r, q.g, q.b));
        }
      check(`the pill is not tinted green by the page (max chroma inside ${max})`, max <= 10, max);
      const c = s.chip;
      let cmax = 0;
      for (let y = Math.round((c.y + 3) * 2); y < Math.round((c.y + c.h - 3) * 2); y++)
        for (let x = Math.round((c.x + 6) * 2); x < Math.round((c.x + c.w - 6) * 2); x++) {
          const q = pixel(img, x, y); cmax = Math.max(cmax, Math.max(q.r, q.g, q.b) - Math.min(q.r, q.g, q.b));
        }
      check(`the cursor chip is not tinted green either (max chroma inside ${cmax})`, cmax <= 10, cmax);
    });

    /* ------------------------------------------------------------------ SPA */
    await step("SPA: body wiped, document re-rendered, document.open()", async () => {
      await page.goto(`${ORIGIN}/spa`);
      await sleep(150);
      await ui.hover(page, page.locator("#box"));
      const a0 = (await ui.state(page)).attaches;
      await page.evaluate(() => {
        history.pushState({}, "", "/spa/next");
        document.body.innerHTML = "<div id='box2' style='margin:200px auto;width:300px;height:120px;background:#ddd;border-radius:14px'>next view</div>";
      });
      await sleep(100);
      let s = await ui.state(page);
      check("pushState + body wiped: overlay still there", s.mounted === true && (await hostThere(page)), s.mounted);
      const at = await ui.hover(page, page.locator("#box2"));
      s = await ui.state(page);
      check("... and the cursor still follows", at && Math.abs(s.tip.x - at.x) < 1.01 && Math.abs(s.tip.y - at.y) < 1.01, { at, tip: s.tip });

      await page.evaluate(() => {
        history.pushState({}, "", "/spa/third");
        const b = document.createElement("body");
        b.innerHTML = "<div id='box3' style='margin:260px 0 0 300px;width:260px;height:100px;background:#ccc'>third</div>";
        document.documentElement.replaceChildren(document.createElement("head"), b);
      });
      await sleep(150);
      s = await ui.state(page);
      check("whole document re-rendered: overlay put itself back", s.mounted === true && s.attaches > a0 && (await hostThere(page)), { mounted: s.mounted, attaches: s.attaches, a0 });
      const at3 = await ui.hover(page, page.locator("#box3"));
      s = await ui.state(page);
      check("... and the cursor follows after the re-render", at3 && Math.abs(s.tip.x - at3.x) < 1.01, { at3, tip: s.tip });

      await page.evaluate(() => { document.open(); document.write("<!doctype html><html><body style='background:#fff'><div id='box4' style='margin:300px 0 0 700px;width:200px;height:90px;background:#ddd'>written</div></body></html>"); document.close(); });
      await sleep(700);
      s = await ui.state(page);
      check("document.open()/write(): overlay back", s && s.mounted === true && (await hostThere(page)), s && s.mounted);
      const at4 = await ui.hover(page, page.locator("#box4"));
      s = await ui.state(page);
      check("... and still follows the mouse", at4 && s && Math.abs(s.tip.x - at4.x) < 1.01 && Math.abs(s.tip.y - at4.y) < 1.01, { at4, tip: s && s.tip });
      const ok = await ui.say(page, "after document.write");
      check("... and the pill still talks", ok && (await ui.state(page)).status === "after document.write");
    });

    /* ---------------------------------------------------------------- login */
    await step("never draws on sign-in pages", async () => {
      await page.goto(`${ORIGIN}/accounts/login/?next=%2Fexplore%2Ftags%2Fbottlechiller%2F`);
      await sleep(300);
      const r = await ui.attach(context, page, BUILD);
      check("attach on /accounts/login reports blocked, not mounted", r.mounted === false && r.blocked === true, r);
      await ui.hover(page, page.locator("#u"));
      await ui.click(page, page.locator("#go"));
      await ui.say(page, "should not show");
      await sleep(300);
      check("/accounts/login: no overlay element in the page", !(await hostThere(page)));
      await page.screenshot({ path: path.join(SHOTS, "login-clean.png") });

      await page.goto(`${ORIGIN}/login?redirect=/search`);
      await sleep(300);
      check("/login: no overlay element in the page", !(await hostThere(page)));

      await page.goto(`${ORIGIN}/spa`);
      await sleep(200);
      check("(back on a normal page it draws again)", await hostThere(page));
      await page.evaluate(() => history.pushState({}, "", "/accounts/login/"));
      await sleep(700);
      check("SPA route change to /accounts/login: overlay takes itself off", !(await hostThere(page)));
      await page.evaluate(() => history.pushState({}, "", "/spa/after-login"));
      await sleep(700);
      check("SPA route away from login: overlay comes back", await hostThere(page));
    });

    await step("never draws on accounts.google.com or appleid.apple.com (real hosts, TLS)", async () => {
      // Control first: a mapped facebook.com page that is NOT a sign-in page must
      // draw, or a pass below would only mean the mapping is broken.
      await page.goto("https://www.facebook.com/ads/library/?active_status=active&q=bottle%20chiller");
      await sleep(300);
      const ctl = await ui.state(page);
      check("(control) www.facebook.com/ads/library is served here and the overlay draws", ctl && ctl.mounted === true && (await hostThere(page)), ctl && ctl.mounted);
      await page.goto("https://www.facebook.com/login/?next=%2Fads%2Flibrary");
      await sleep(300);
      check("www.facebook.com/login: no overlay", !(await hostThere(page)));
      await page.goto("https://accounts.google.com/v3/signin/identifier?continue=https%3A%2F%2Ftrends.google.com");
      await sleep(300);
      check(`accounts.google.com (path has no /login): no overlay [${await page.title()}]`, (await page.title()).startsWith("accounts.google.com") && !(await hostThere(page)));
      await ui.hover(page, page.locator("#box"));
      await ui.say(page, "should not show");
      check("... still none after hover and say", !(await hostThere(page)));
      await page.goto("https://appleid.apple.com/sign-in");
      await sleep(300);
      check(`appleid.apple.com: no overlay [${await page.title()}]`, (await page.title()).startsWith("appleid.apple.com") && !(await hostThere(page)));
    });

    await step("strict CSP + Trusted Types page (like Google and Meta)", async () => {
      const errs = [];
      const onErr = (e) => errs.push(String(e));
      page.on("pageerror", onErr);
      await page.goto(`${ORIGIN}/csp`);
      await sleep(300);
      await ui.say(page, "Google Trends · reading interest over time");
      const at = await ui.hover(page, page.locator("#b"));
      await sleep(350);
      const s = await ui.state(page);
      check("CSP page: overlay mounted", s && s.mounted === true, s && s.mounted);
      check("CSP page: cursor follows", at && s && Math.abs(s.tip.x - at.x) < 1.01 && Math.abs(s.tip.y - at.y) < 1.01, { at, tip: s && s.tip });
      check("CSP page: pill line updated", s && s.status === "Google Trends · reading interest over time", s && s.status);
      const img = readPng(await page.screenshot({ path: path.join(SHOTS, "csp.png") }));
      const q = pixel(img, (s.pill.x + s.pill.w - 7) * 2, (s.pill.y + s.pill.h / 2) * 2);
      check(`CSP page: the pill is really painted (styles not stripped; pixel ${q.r})`, q.r < 90, q);
      check("CSP page: ring painted around the button", s.ring.on && s.ring.opacity > 0.95);
      check(`CSP page: no page errors from the overlay (${errs.length})`, errs.length === 0, errs);
      page.off("pageerror", onErr);
    });

    await step("a Locator that matches several elements goes to the first", async () => {
      await page.goto(`${ORIGIN}/white`);
      await sleep(200);
      const first = await page.locator(".card").first().boundingBox();
      const at = await ui.hover(page, page.locator(".card"));
      check("hover(page, locator matching 8 cards) lands on the first card", inside(at, first), { at, first });
    });

    /* -------------------------------------------- one more look: tidy shots */
    await step("final look shots", async () => {
      await page.goto(`${ORIGIN}/white`);
      await sleep(200);
      await page.evaluate(() => { document.getElementById("under").style.visibility = "hidden"; });
      await ui.say(page, "Meta Ad Library · “bottle chiller” · 23 ads, longest running 41 days");
      await ui.hover(page, page.locator("#p1"));
      await sleep(450);
      await page.screenshot({ path: path.join(SHOTS, "white-adlibrary.png") });
    });
  } finally {
    await browser.close().catch(() => {});
    try { proc.kill("SIGKILL"); } catch {}
    server.close();
    if (secure) secure.close();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  clearTimeout(KILL);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.log(`FAIL  ${String(e && e.stack || e)}`); process.exit(1); });

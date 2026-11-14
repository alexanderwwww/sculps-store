/*
 * Cursor Clipper — Alex's clipping app (written new, 2026-11-13).
 *
 * One job: let Claude work Whop Content Rewards and YouTube for the ORAKTYS
 * channel inside Alex's own Chrome on his Mac, with a cursor he can watch.
 * No trading. No research. No self-update. A new build is a new zip.
 *
 *   Chrome  : started by run.command with its own profile and DevTools port.
 *   Link    : the same mailbox Claude's ultra_* tools use
 *             GET  <LINK>/next    one command {id, action, input}
 *             POST <LINK>/result  {id, text, image?}
 *             POST <LINK>/status  heartbeat (every 5 s)
 *   Sites   : contentrewards.com, whop.com, youtube.com, youtu.be,
 *             accounts.google.com, and (build 3) the Google Cloud, Meta and
 *             TikTok developer consoles plus www.instagram.com and
 *             www.tiktok.com. Any other tab is sent to Content Rewards.
 *   Cards   : anything final (join, submit, post, Enter in a box) waits for
 *             Alex to press Approve on the page. Passwords are never typed.
 */
import dns from "node:dns";
import net from "node:net";
import { createRequire } from "node:module";

// Same network fix that brought Ultra back: IPv4 first, and when the Mac's own
// lookup fails, ask Cloudflare and Google DNS directly.
try { dns.setDefaultResultOrder("ipv4first"); } catch { /* old node */ }
try { net.setDefaultAutoSelectFamily(true); } catch { /* old node */ }
{
  const sys = dns.lookup, R = new dns.Resolver();
  R.setServers(["1.1.1.1", "8.8.8.8", "1.0.0.1"]);
  dns.lookup = function (host, opts, cb) {
    if (typeof opts === "function") { cb = opts; opts = {}; }
    if (typeof opts === "number") opts = { family: opts };
    sys.call(dns, host, opts, (err, addr, fam) => {
      if (!err) return cb(null, addr, fam);
      R.resolve4(host, (e2, a4) => {
        if (e2 || !a4?.length) return cb(err);
        if (opts?.all) return cb(null, a4.map((x) => ({ address: x, family: 4 })));
        cb(null, a4[0], 4);
      });
    });
  };
}

const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");

export const APP = "Cursor Clipper";
export const BUILD = String(process.env.CC_BUILD || "3");
export const HOME_URL = "https://contentrewards.com/";
// build 3 (2026-11-14, mob v2): the developer consoles where Claude creates mob's YouTube, Instagram and TikTok
// apps for Alex, plus the two sign-in pages those flows need. business.facebook.com is NOT here: Business
// Verification and App Review are done in Alex's name.
export const ALLOWED = ["contentrewards.com", "whop.com", "youtube.com", "youtu.be", "accounts.google.com",
  "console.cloud.google.com", "console.developers.google.com", "developers.facebook.com",
  "www.instagram.com", "developers.tiktok.com", "www.tiktok.com"];
const LINK = (process.env.CC_LINK || "https://ultra-link.gardenbuddystore.workers.dev/uL7kQ2vN9xR4tB8mW3zY6pD1sF5hJ0cA").replace(/\/+$/, "");
const PORT = Number(process.env.CC_PORT || 9555);
const TEST_HOSTS = (process.env.CC_TEST_HOSTS || "").split(",").filter(Boolean); // tests only
const CARD_MS = Number(process.env.CC_CARD_MS || 10 * 60000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clip = (s, n) => (String(s ?? "").length > n ? String(s).slice(0, n - 1) + "…" : String(s ?? ""));

export function allowedHost(host) {
  host = String(host || "").toLowerCase();
  if (TEST_HOSTS.includes(host)) return true;
  return ALLOWED.some((h) => host === h || host.endsWith("." + h));
}
const hostOf = (u) => { try { return new URL(u).hostname; } catch { return ""; } };
const isWeb = (u) => /^https?:/i.test(String(u || ""));

/* ------------------------------------------------------------------ link */

async function call(method, what, body) {
  try {
    const r = await fetch(`${LINK}/${what}`, {
      method, headers: body ? { "content-type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) return undefined;
    return await r.json();
  } catch { return undefined; }
}

/* ------------------------------------------------------------------ chrome */

let browser = null, page = null, card = null, lastError = "";

async function connect() {
  if (browser && browser.isConnected()) return;
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`, { timeout: 15000 });
  const ctx = browser.contexts()[0];
  ctx.on("page", (p) => { page = p; guardTab(p).catch(() => {}); });
  for (const p of ctx.pages()) await guardTab(p);
  page = ctx.pages().find((p) => isWeb(p.url())) || ctx.pages()[0] || await ctx.newPage();
  if (!isWeb(page.url())) await page.goto(HOME_URL, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
  console.log(`${APP} build ${BUILD}: connected to Chrome on port ${PORT}`);
}

/** A tab on any site that is not a clipping site goes to Content Rewards. */
async function guardTab(p) {
  const u = p.url();
  if (isWeb(u) && !allowedHost(hostOf(u))) {
    console.log(`not a clipping site, leaving it: ${hostOf(u)}`);
    await p.goto(HOME_URL, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
  }
}

async function current() {
  await connect();
  const pages = browser.contexts()[0].pages();
  if (!page || page.isClosed()) page = pages[pages.length - 1];
  await guardTab(page);
  return page;
}

async function snapshot(p, full = false) {
  let text = "";
  try { text = await p.ariaSnapshot({ mode: "ai" }); } catch (e) { text = `(could not read the page: ${clip(e.message, 120)})`; }
  const lines = text.split("\n");
  const max = full ? 1200 : 400;
  if (lines.length > max) text = lines.slice(0, max).join("\n") + `\n… ${lines.length - max} more lines not shown (look {full:true})`;
  return `url: ${p.url()}\ntitle: ${await p.title().catch(() => "")}\npage:\n${text}`;
}

/* ------------------------------------------------------------------ the cursor and the card (drawn in the page) */

async function moveCursor(p, loc) {
  try {
    const b = await loc.boundingBox();
    if (!b) return;
    const x = b.x + b.width / 2, y = b.y + b.height / 2;
    await p.evaluate(([x, y]) => {
      let c = document.getElementById("__cc_cursor");
      if (!c) {
        c = document.createElement("div");
        c.id = "__cc_cursor";
        c.style.cssText = "position:fixed;left:0;top:0;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:#e8203a;box-shadow:0 0 0 3px #fff,0 2px 10px rgba(0,0,0,.4);z-index:2147483647;pointer-events:none;transition:transform .45s cubic-bezier(.2,.8,.2,1)";
        document.documentElement.appendChild(c);
      }
      c.style.transform = `translate(${x}px,${y}px)`;
    }, [x, y]);
    await sleep(480);
  } catch { /* the cursor is only for Alex to watch */ }
}

// build 2 (Alex, 2026-11-13: "get all the jobs done and don't stop"): on clipping pages joins, submits and Enter go
// through without a card. Pages about money or the account (payouts, earnings, settings, billing, withdraw) still
// ask him, and nothing there is ever done on its own.
// build 3: payment pages, business verification and app-review submission on the developer consoles always ask too.
const ASK_PAGES = /settings|payout|earning|withdraw|billing|bank|account|payment|verification\/business|app-review\/submit|submit-for-review/i;
const ALWAYS_ASK = process.env.CC_ALWAYS_ASK === "1"; // tests of the card itself

/** Shows Approve / Deny on the page and waits for Alex. -> "approve" | "deny" | "expired" */
async function askAlex(p, title, what) {
  if (!ALWAYS_ASK && !ASK_PAGES.test(p.url())) { console.log(`auto-approved (${title}): ${what}`); return "approve"; }
  card = { title, what };
  try {
    await p.evaluate(([title, what]) => {
      document.getElementById("__cc_card")?.remove();
      window.__ccChoice = null;
      const d = document.createElement("div");
      d.id = "__cc_card";
      d.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:2147483647;background:#141218;color:#fff;font:14px -apple-system,Helvetica,sans-serif;padding:16px 18px;border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,.45);max-width:360px";
      const h = document.createElement("div"); h.textContent = "Cursor Clipper · " + title; h.style.cssText = "font-weight:700;margin-bottom:6px";
      const t = document.createElement("div"); t.textContent = what; t.style.cssText = "opacity:.85;margin-bottom:12px;word-break:break-word";
      const row = document.createElement("div"); row.style.cssText = "display:flex;gap:8px";
      const mk = (label, bg, v) => { const b = document.createElement("button"); b.textContent = label; b.style.cssText = `flex:1;border:0;border-radius:10px;padding:9px;font-weight:700;cursor:pointer;color:#fff;background:${bg}`; b.onclick = () => { window.__ccChoice = v; d.remove(); }; return b; };
      row.append(mk("Approve", "#e8203a", "approve"), mk("Deny", "#3a3640", "deny"));
      d.append(h, t, row);
      document.documentElement.appendChild(d);
    }, [title, what]);
  } catch { card = null; return "deny"; }
  const end = Date.now() + CARD_MS;
  try {
    while (Date.now() < end) {
      const v = await p.evaluate(() => window.__ccChoice).catch(() => null);
      if (v) return v;
      await sleep(500);
    }
    await p.evaluate(() => document.getElementById("__cc_card")?.remove()).catch(() => {});
    return "expired";
  } finally { card = null; }
}

/* ------------------------------------------------------------------ actions */

const SECRET = /password|passcode|card number|cvc|cvv|security code|one-time|otp|2fa/i;

async function act(action, input) {
  if (action === "done") return `ok: true\ndid: session ended — ${clip(input.summary || "done", 300)}`;
  const p = await current();
  const ref = (r) => p.locator(`aria-ref=${String(r || "").replace(/[^a-z0-9]/gi, "")}`);
  const after = async (did) => `ok: true\ndid: ${did}\n${await snapshot(p)}`;
  const fail = async (why) => `ok: false\nerror: ${why}\n${await snapshot(p)}`;

  switch (action) {
    case "look":
      return `ok: true\n${await snapshot(p, input.full === true)}`;
    case "find": {
      const s = await snapshot(p, true);
      const hits = s.split("\n").filter((l) => l.toLowerCase().includes(String(input.text || "").toLowerCase())).slice(0, 30);
      return `ok: true\nfound ${hits.length}:\n${hits.join("\n")}`;
    }
    case "read_text": {
      const t = input.ref ? await ref(input.ref).innerText({ timeout: 8000 }).catch(() => null) : await p.evaluate(() => document.body.innerText).catch(() => null);
      return t == null ? fail("could not read that") : `ok: true\ntext:\n${clip(t, 12000)}`;
    }
    case "navigate": {
      let u;
      try { u = new URL(String(input.url)); } catch { return fail("that is not a web address"); }
      if (!/^https?:$/.test(u.protocol)) return fail("only http and https addresses");
      if (!allowedHost(u.hostname)) return fail(`Cursor Clipper is only for clipping: ${u.hostname} is not allowed`);
      try { await p.goto(u.href, { waitUntil: "domcontentloaded", timeout: 45000 }); } catch (e) { return fail(`the page did not load: ${clip(e.message, 160)}`); }
      await sleep(800);
      return after(`opened ${u.hostname}${u.pathname}`);
    }
    case "click": {
      const loc = ref(input.ref);
      const name = await loc.evaluate((el) => (el.innerText || el.getAttribute("aria-label") || el.value || "").trim()).catch(() => null);
      if (name === null) return fail(`no element ${input.ref} on the page now: look again`);
      await moveCursor(p, loc);
      if (input.final && input.final !== "none") {
        const v = await askAlex(p, input.final, `${clip(input.why || "click", 140)} → "${clip(name, 80)}"`);
        if (v !== "approve") return fail(v === "deny" ? "Alex pressed Deny" : "Alex did not answer the card");
      }
      try { await loc.click({ timeout: 10000 }); } catch (e) { return fail(`click failed: ${clip(e.message, 160)}`); }
      await sleep(900);
      return after(`clicked "${clip(name, 80)}"`);
    }
    case "type": {
      const loc = ref(input.ref);
      const info = await loc.evaluate((el) => ({ type: el.type || "", label: [el.name, el.id, el.getAttribute("aria-label"), el.placeholder, el.autocomplete].join(" ") })).catch(() => null);
      if (!info) return fail(`no element ${input.ref} on the page now: look again`);
      if (info.type === "password" || SECRET.test(info.label)) return fail("that is a secret field: Alex types it himself");
      await moveCursor(p, loc);
      try {
        if (input.clear) await loc.fill("", { timeout: 8000 });
        await loc.pressSequentially(String(input.text || ""), { delay: 35, timeout: 60000 });
      } catch (e) { return fail(`typing failed: ${clip(e.message, 160)}`); }
      if (input.enter) {
        const v = await askAlex(p, "send", `Enter after typing: "${clip(input.text, 100)}"`);
        if (v !== "approve") return fail(v === "deny" ? "typed, but Alex pressed Deny on Enter" : "typed, but Alex did not answer the card for Enter");
        await p.keyboard.press("Enter");
        await sleep(900);
      }
      return after(`typed ${String(input.text || "").length} characters${input.enter ? " and pressed Enter" : ""}`);
    }
    case "select": {
      try { await ref(input.ref).selectOption({ label: String(input.option) }, { timeout: 8000 }); } catch (e) { return fail(`select failed: ${clip(e.message, 160)}`); }
      return after(`selected ${input.option}`);
    }
    case "press": {
      const key = String(input.key || "");
      if (/^enter$/i.test(key)) {
        const v = await askAlex(p, "send", `press Enter: ${clip(input.why, 120)}`);
        if (v !== "approve") return fail("Alex did not approve Enter");
      }
      try { await p.keyboard.press(key); } catch (e) { return fail(`key failed: ${clip(e.message, 120)}`); }
      await sleep(500);
      return after(`pressed ${key}`);
    }
    case "scroll": {
      const dy = (input.direction === "up" ? -1 : 1) * (input.amount === "small" ? 300 : 800);
      await p.mouse.wheel(0, dy).catch(() => {});
      await sleep(500);
      return after(`scrolled ${input.direction || "down"}`);
    }
    case "screenshot": {
      const buf = await p.screenshot({ type: "jpeg", quality: 60 }).catch(() => null);
      return buf ? { text: `ok: true\nurl: ${p.url()}`, image: buf.toString("base64") } : fail("no screenshot");
    }
    case "wait":
      await sleep(Math.max(1, Math.min(10, Number(input.seconds) || 2)) * 1000);
      return after("waited");
    case "upload":
      return fail("upload is not in Cursor Clipper (clipping does not need it)");
    default:
      return fail(`unknown action ${action}`);
  }
}

/* ------------------------------------------------------------------ loops */

async function heartbeat() {
  let url = "", title = "";
  try { if (page && !page.isClosed()) { url = page.url(); title = await page.title(); } } catch { /* fine */ }
  await call("POST", "status", { app: APP, build: BUILD, chrome: !!(browser && browser.isConnected()), url, title, mode: "clipping", status: lastError, card });
}

export async function main({ once = false } = {}) {
  console.log(`${APP} build ${BUILD} starting`);
  let beat = 0;
  // The heartbeat runs on its own, so a long step (a card waiting for Alex) never makes the app look gone.
  const hb = setInterval(() => { heartbeat().catch(() => {}); }, 5000);
  if (hb.unref) hb.unref();
  for (;;) {
    try { await connect(); lastError = ""; } catch (e) { lastError = `Chrome not reachable: ${clip(e.message, 120)}`; browser = null; }
    if (Date.now() - beat > 5000) { beat = Date.now(); await heartbeat(); }
    const cmd = browser ? await call("GET", "next") : null;
    if (cmd && cmd.id) {
      console.log(`→ ${cmd.action} ${clip(JSON.stringify(cmd.input || {}), 120)}`);
      let out;
      try { out = await act(String(cmd.action), cmd.input || {}); } catch (e) { out = `ok: false\nerror: ${clip(e.message, 200)}`; }
      const res = typeof out === "string" ? { id: cmd.id, text: out } : { id: cmd.id, ...out };
      await call("POST", "result", res);
      await heartbeat();
      if (once) return;
      continue;
    }
    if (once) return;
    await sleep(1000);
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

// Aquarius's service worker: reads his mailbox (speech bubbles, chat messages), runs his hands
// (a tab of his own, driven with chrome.tabs + chrome.scripting) and tells every claude.ai tab what to show.
import { CONFIG } from "./config.js";
import { aqMagic } from "./magic.js";
import { aqLook, aqInfo, aqType, aqClick, aqPress, aqReadText, aqSelect, aqCard, aqCardChoice, aqCardClear } from "./hands.js";

const FEED = `${CONFIG.mob}/api/aquarius/feed?key=${encodeURIComponent(CONFIG.feedKey)}`;
const LINK = `${CONFIG.mob}/api/aquarius/link/${CONFIG.linkKey}`;
const CARD_MS = CONFIG.cardMs || 10 * 60000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clip = (s, n) => { s = String(s ?? ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const get = (k) => chrome.storage.local.get(k).then((o) => o[k]);
const set = (o) => chrome.storage.local.set(o);

/* ---------------- the claude.ai tabs ---------------- */
async function chatTabs() { return chrome.tabs.query({ url: CONFIG.chatMatches }); }
async function toChats(msg) { for (const t of await chatTabs()) chrome.tabs.sendMessage(t.id, msg).catch(() => {}); }
/** One tab types into the chat: the one Alex looked at last. */
async function oneChat(msg) {
  const tabs = await chatTabs(); if (!tabs.length) return false;
  tabs.sort((a, b) => (b.active - a.active) || ((b.lastAccessed || 0) - (a.lastAccessed || 0)));
  await chrome.tabs.sendMessage(tabs[0].id, msg).catch(() => {});
  return true;
}

/* ---------------- the feed ---------------- */
let feeding = false;
async function pollFeed() {
  if (feeding) return; feeding = true;
  try {
    const r = await fetch(FEED, { cache: "no-store" });
    if (!r.ok) return;
    const { messages = [] } = await r.json();
    let last = Number(await get("lastId")) || 0;
    if (!last && messages.length) { // a fresh install says only the newest, if it is recent
      const n = messages[messages.length - 1];
      last = Date.now() - new Date(n.at).getTime() < 10 * 60000 ? n.id - 1 : n.id;
    }
    for (const m of messages) {
      if (m.id <= last) continue;
      last = m.id;
      if (m.to_chat) { if (!(await oneChat({ type: "chat", text: m.text }))) { last = m.id - 1; break; } } // no chat open: keep it for later
      await toChats({ type: "say", text: m.text, face: m.face, suit: m.suit });
    }
    await set({ lastId: last });
  } catch (e) { /* offline: next tick */ } finally { feeding = false; }
}

/* ---------------- the hands ---------------- */
let handsTab = null, busy = false, card = null, lastError = "";
async function tab() {
  if (handsTab != null) { const t = await chrome.tabs.get(handsTab).catch(() => null); if (t) return t; }
  const t = await chrome.tabs.create({ url: CONFIG.startUrl, active: false });
  handsTab = t.id; await loaded(t.id);
  return chrome.tabs.get(t.id);
}
function loaded(id, ms = 30000) {
  return new Promise((done) => {
    let finished = false;
    const end = () => { if (finished) return; finished = true; chrome.tabs.onUpdated.removeListener(on); clearTimeout(tm); done(); };
    const on = (tid, info) => { if (tid === id && info.status === "complete") end(); };
    chrome.tabs.onUpdated.addListener(on);
    const tm = setTimeout(end, ms);
    chrome.tabs.get(id).then((t) => { if (t.status === "complete" && t.url && !/^about:blank/.test(t.url)) end(); }).catch(end);
  });
}
async function run(id, func, ...args) {
  const [r] = await chrome.scripting.executeScript({ target: { tabId: id }, func, args });
  return r ? r.result : undefined;
}
const SECRET = /password|passcode|card number|cc-number|cc-csc|cvc|cvv|security code|one-time|otp|2fa/i;
const MONEY_URL = /checkout|payment|\bpay\b|billing|settings|\border|cart|purchase|subscri|invoice|payout|withdraw|bank/i;
const MONEY_NAME = /checkout|place (your )?order|pay now|\bpay\b|buy now|purchase|subscribe|billing|settings|confirm (order|payment)|complete order/i;
async function ask(id, title, what) {
  card = { title, what };
  try {
    await run(id, aqCard, title, what);
    const end = Date.now() + CARD_MS;
    while (Date.now() < end) { const v = await run(id, aqCardChoice).catch(() => null); if (v) return v; await sleep(400); }
    await run(id, aqCardClear).catch(() => {}); return "expired";
  } finally { card = null; }
}
async function brief(id, did) { const t = await chrome.tabs.get(id); return `ok: true\ndid: ${did}\nurl: ${t.url}\ntitle: ${t.title}`; }
async function look(id, full) { const s = await run(id, aqLook, !!full); return `url: ${s.url}\ntitle: ${s.title}\npage:\n${s.lines.join("\n")}`; }
async function magicAt(id, info) { await run(id, aqMagic, info.x, info.y, CONFIG.magicLife ? { life: CONFIG.magicLife } : {}).catch(() => {}); }

export async function act(action, input = {}) {
  if (action === "done") return `ok: true\ndid: session ended: ${clip(input.summary || "done", 300)}`;
  const t = await tab(), id = t.id;
  const after = async (did) => (input.look ? `ok: true\ndid: ${did}\n${await look(id)}` : brief(id, did));
  const fail = (why) => `ok: false\nerror: ${why}`;
  switch (action) {
    case "look": return `ok: true\n${await look(id, input.full)}`;
    case "find": { const s = await look(id, true); const q = String(input.text || "").toLowerCase(); const hits = s.split("\n").filter((l) => l.toLowerCase().includes(q)).slice(0, 30); return `ok: true\nfound ${hits.length}:\n${hits.join("\n")}`; }
    case "read_text": { const x = await run(id, aqReadText, input.ref || null); return x == null ? fail("could not read that") : `ok: true\ntext:\n${clip(x, 12000)}`; }
    case "navigate": {
      let u; try { u = new URL(String(input.url)); } catch { return fail("that is not a web address"); }
      if (!/^https?:$/.test(u.protocol)) return fail("only http and https addresses");
      await chrome.tabs.update(id, { url: u.href }); await sleep(50); await loaded(id);
      return after(`opened ${u.hostname}${u.pathname}`);
    }
    case "click": {
      const info = await run(id, aqInfo, input.ref);
      if (!info) return fail(`no element ${input.ref} on the page now: look again`);
      const money = MONEY_NAME.test(info.name) || (input.final && input.final !== "none" && MONEY_URL.test(info.url)) || input.final === "buy";
      if (money) {
        const v = await ask(id, input.final && input.final !== "none" ? input.final : "click", `${clip(input.why || "click", 140)} → "${clip(info.name, 80)}"`);
        if (v !== "approve") return fail(v === "deny" ? "Alex pressed Deny" : "Alex did not answer the card");
      }
      await magicAt(id, info);
      const r = await run(id, aqClick, input.ref);
      if (r !== "ok") return fail("click failed: the element went away");
      await sleep(60); const now = await chrome.tabs.get(id); if (now.status === "loading") await loaded(id);
      return after(`clicked "${clip(info.name, 80)}"`);
    }
    case "type": {
      const info = await run(id, aqInfo, input.ref);
      if (!info) return fail(`no element ${input.ref} on the page now: look again`);
      if (info.type === "password" || SECRET.test(info.label)) return fail("that is a secret field: Alex types it himself");
      await magicAt(id, info);
      const r = await run(id, aqType, input.ref, String(input.text ?? ""), !!input.clear);
      if (r !== "ok") return fail(r === "secret" ? "that is a secret field: Alex types it himself" : "typing failed");
      if (input.enter) {
        if (MONEY_URL.test(info.url)) { const v = await ask(id, "send", `Enter after typing: "${clip(input.text, 100)}"`); if (v !== "approve") return fail("typed, but Alex did not approve Enter"); }
        await run(id, aqPress, "Enter"); await sleep(60); const now = await chrome.tabs.get(id); if (now.status === "loading") await loaded(id);
      }
      return after(`typed ${String(input.text ?? "").length} characters${input.enter ? " and pressed Enter" : ""}`);
    }
    case "select": { const r = await run(id, aqSelect, input.ref, String(input.option || "")); return r === "ok" ? after(`selected ${input.option}`) : fail(`select failed: ${r}`); }
    case "press": {
      const key = String(input.key || "");
      const t2 = await chrome.tabs.get(id);
      if (/^enter$/i.test(key) && MONEY_URL.test(t2.url)) { const v = await ask(id, "send", `press Enter: ${clip(input.why, 120)}`); if (v !== "approve") return fail("Alex did not approve Enter"); }
      await run(id, aqPress, /^enter$/i.test(key) ? "Enter" : key); await sleep(60); const now = await chrome.tabs.get(id); if (now.status === "loading") await loaded(id);
      return after(`pressed ${key}`);
    }
    case "scroll": { const dy = (input.direction === "up" ? -1 : 1) * (input.amount === "small" ? 300 : 800); await run(id, (d) => { window.scrollBy(0, d); return true; }, dy); return after(`scrolled ${input.direction || "down"}`); }
    case "screenshot": {
      const t2 = await chrome.tabs.get(id), [prev] = await chrome.tabs.query({ active: true, windowId: t2.windowId });
      await chrome.tabs.update(id, { active: true }); await sleep(150);
      const url = await chrome.tabs.captureVisibleTab(t2.windowId, { format: "jpeg", quality: 60 }).catch(() => null);
      if (prev && prev.id !== id) await chrome.tabs.update(prev.id, { active: true }).catch(() => {});
      return url ? { text: `ok: true\nurl: ${t2.url}`, image: url.split(",")[1] } : fail("no screenshot");
    }
    case "wait": await sleep(Math.max(1, Math.min(10, Number(input.seconds) || 2)) * 1000); return after("waited");
    default: return fail(`unknown action ${action}`);
  }
}

async function link(what, body) {
  try {
    const r = await fetch(`${LINK}/${what}`, { method: body ? "POST" : "GET", headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
    return r.ok ? await r.json() : undefined;
  } catch { return undefined; }
}
let beatAt = 0;
async function heartbeat(force) {
  if (!force && Date.now() - beatAt < 5000) return; beatAt = Date.now();
  let url = "", title = "";
  if (handsTab != null) { const t = await chrome.tabs.get(handsTab).catch(() => null); if (t) { url = t.url; title = t.title; } }
  await link("status", { app: "Aquarius", build: CONFIG.build, chrome: true, hands: handsTab != null, url, title, busy, card, status: lastError });
}
let linking = false;
async function pollLink() {
  if (linking) return; linking = true;
  try {
    await heartbeat();
    for (let i = 0; i < 20; i++) {
      const cmd = await link("next");
      if (!cmd || !cmd.id) break;
      busy = true; toChats({ type: "working", on: true });
      let out;
      try { out = await act(String(cmd.action), cmd.input || {}); lastError = ""; } catch (e) { out = `ok: false\nerror: ${clip(e.message, 200)}`; lastError = clip(e.message, 120); }
      await link("result", typeof out === "string" ? { id: cmd.id, text: out } : { id: cmd.id, ...out });
      busy = false; toChats({ type: "working", on: false });
      await heartbeat(true);
    }
  } finally { linking = false; busy = false; }
}

/* ---------------- wake-ups ---------------- */
async function tick() { await Promise.all([pollFeed(), pollLink()]); }
chrome.alarms.create("aq", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(() => { tick(); });
chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (m && m.type === "tick") { tick(); reply({ ok: true }); }
  if (m && m.type === "magic" && sender.tab) { run(sender.tab.id, aqMagic, m.x, m.y, m.opts || {}).catch(() => {}); reply({ ok: true }); }
  return false;
});
// Clicking the toolbar icon always brings him back (that is how "opening the app again" works here).
chrome.action.onClicked.addListener(async () => { await set({ on: true, hiddenUntil: 0 }); await toChats({ type: "wake" }); });
chrome.runtime.onInstalled.addListener(async () => {
  const s = await chrome.storage.local.get(["on", "listen"]);
  await set({ on: s.on ?? true, listen: s.listen ?? true });
});
self.__aq = { act, tick, pollFeed, pollLink }; // tests drive these
tick();

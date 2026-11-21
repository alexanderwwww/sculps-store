// supercomputer background: fetches public market data for the panel (no CORS from the page) and checks
// for a newer build. It can only reach Kraken's public APIs and the update address. No account, no orders.
import { CONFIG } from "./config.js";
import { FEEDS } from "./lib/news.js";

const ALLOWED = ["https://api.kraken.com/0/public/", "https://futures.kraken.com/derivatives/api/v3/", "https://futures.kraken.com/api/charts/v1/"];
const FEED_URLS = new Set(Object.values(FEEDS).flat().map((f) => f.url));
if (CONFIG.updateUrl) ALLOWED.push(new URL(CONFIG.updateUrl).origin + "/");

async function getJSON(url) {
  if (!ALLOWED.some((p) => url.startsWith(p))) throw new Error("blocked address");
  const r = await fetch(url, { cache: "no-store", credentials: "omit" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function checkUpdate() {
  if (!CONFIG.updateUrl) return { state: "off" };
  try {
    const v = await getJSON(CONFIG.updateUrl + (CONFIG.updateUrl.includes("?") ? "&" : "?") + "t=" + Date.now());
    // different in either direction: the published build is the truth (AGENTS rule 13)
    const res = { state: String(v.build) !== String(CONFIG.build) ? "ready" : "current", build: v.build, zip: v.zip, notes: v.notes || "", checked: Date.now() };
    await chrome.storage.local.set({ update: res });
    return res;
  } catch (e) {
    const res = { state: "error", error: String(e.message || e), checked: Date.now() };
    await chrome.storage.local.set({ update: res });
    return res;
  }
}

chrome.runtime.onInstalled.addListener(() => { chrome.alarms.create("update", { periodInMinutes: 360 }); checkUpdate(); });
chrome.runtime.onStartup.addListener(() => { chrome.alarms.create("update", { periodInMinutes: 360 }); checkUpdate(); });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === "update") checkUpdate(); });

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  (async () => {
    try {
      if (msg.type === "get") return reply({ ok: true, data: await getJSON(msg.url) });
      if (msg.type === "feed") {
        if (!FEED_URLS.has(msg.url)) throw new Error("blocked address");
        const r = await fetch(msg.url, { cache: "no-store", credentials: "omit" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return reply({ ok: true, data: await r.text() });
      }
      if (msg.type === "checkUpdate") return reply({ ok: true, data: await checkUpdate() });
      if (msg.type === "download") {
        const { update } = await chrome.storage.local.get("update");
        if (!update || !update.zip) return reply({ ok: false, error: "no update" });
        const id = await chrome.downloads.download({ url: update.zip, filename: `supercomputer-build-${update.build}.zip`, saveAs: false });
        return reply({ ok: true, data: id });
      }
      if (msg.type === "openExtensions") { await chrome.tabs.create({ url: "chrome://extensions/?id=" + chrome.runtime.id }); return reply({ ok: true }); }
      reply({ ok: false, error: "unknown" });
    } catch (e) { reply({ ok: false, error: String(e.message || e) }); }
  })();
  return true;
});

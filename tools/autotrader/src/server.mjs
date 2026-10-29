// Ultra. A small local server on this Mac: the engine runs in here, the screen is a page on 127.0.0.1, and the only
// things that leave the machine are the market feeds, the Jupiter quotes and the signed transactions from the Phantom wallet.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { Engine } from "./lib/engine.mjs";
import { Narrative } from "./lib/narrative.mjs";
import { Journal } from "./lib/journal.mjs";
import { liveFeed } from "./lib/feed.mjs";
import { jupiterExec, CAPS as JUP_CAPS, PLUG_CAPS_EXTRA } from "./lib/exec-jupiter.mjs";
import { startLink, DEFAULT_LINK } from "./lib/link.mjs";
import { checkRuntime, stageRuntime } from "./lib/ota.mjs";
import { Rpc, Jupiter, walletFromPem, buildTransferTx } from "./lib/solana.mjs";
import { rugCheck } from "./lib/rug.mjs";
import { Secrets } from "./lib/secrets.mjs";
import { solBalance } from "./lib/rpc.mjs";
import { DEFAULTS } from "./lib/strategy.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const APP = "ultra";
/** Ultra trades ONE wallet: Alex's Phantom, plugged in once. It signs its own Jupiter swaps on this Mac. No GMGN, no Chrome (Alex, 2026-10-29). */

export function start({ dataDir, port = 47401, build = "dev", feed = liveFeed, tickMs = 3000, quiet = false, balance = solBalance, rpc: rpcOverride = null, jupiter: jupiterOverride = null, rug: rugOverride = null, execOverride = null, now = Date.now, idleMs = 0, link = false, autoStart = false, onShutdown = () => {} } = {}) {
  mkdirSync(dataDir, { recursive: true });
  const secrets = new Secrets(dataDir);
  const cfgFile = join(dataDir, "config.json");
  const readCfg = () => { try { return JSON.parse(readFileSync(cfgFile, "utf8")); } catch { return {}; } };
  const writeCfg = (patch) => writeFileSync(cfgFile, JSON.stringify({ ...readCfg(), ...patch }, null, 1));
  const token = randomBytes(16).toString("hex");
  const log = (...a) => { if (!quiet) console.log(new Date().toISOString(), ...a); };
  let engine = null, mode = null, timer = null, timer2 = null, ticking = false, lastError = null, stopped = false;

  const rpcI = rpcOverride || new Rpc(), jupI = jupiterOverride || new Jupiter();
  const rpc = () => rpcI, jup = () => jupI;
  const wallet = () => { if (!secrets.imported) throw new Error("Plug in your Phantom wallet first."); return walletFromPem(secrets.walletPem); };
  const caps = { ...JUP_CAPS, ...PLUG_CAPS_EXTRA, preset: String(PLUG_CAPS_EXTRA.fixedSol) };

  // what the organism learned: its tables, and only the clamped exit levels (sl / partAt / tp). Never size, never caps.
  const onLearn = ({ org, exits } = {}) => { const t = readCfg().tuned || {}; const ex = {}; for (const k of ["sl", "partAt", "tp"]) if (exits && typeof exits[k] === "number") ex[k] = exits[k]; writeCfg({ tuned: { ...t, ...ex, ...(org ? { org } : {}) } }); };
  async function build_(m) {
    if (execOverride) { const e = new Engine({ feed, exec: execOverride, journal: new Journal(join(dataDir, "journal-test.jsonl")), rug: rugOverride || rugCheck, startEq: 100, now, org: readCfg().tuned?.org || null }); e.onLearn = (c) => onLearn(c); return e; }
    if (m !== "live") throw new Error("Only real trading exists.");
    const w = wallet(); const bal = await rpc().solBalance(w.address);
    // never refuse to run on a low balance: the SOL may be inside open positions, and only a running engine can sell them. Buys simply wait.
    if (false) log(`wallet ${bal.toFixed(4)} SOL: running, buys paused under 0.05 SOL until a sale brings SOL back`);
    if (readCfg().phantomStartSol == null) writeCfg({ phantomStartSol: bal });
    const { org: savedOrg = null, ...tunedCfg } = readCfg().tuned || {};
    Object.assign(DEFAULTS, tunedCfg);
    // first boot of the organism (no saved org): the old tuner's momMin goes back to the 3% growth floor, once. The organism
    // picks bands itself from here; a momMin the desk sets later is kept.
    if (!savedOrg && !(DEFAULTS.momMin <= 0.03)) { DEFAULTS.momMin = 0.03; writeCfg({ tuned: { ...(readCfg().tuned || {}), momMin: 0.03 } }); }
    const exec = jupiterExec({ wallet: w, rpc: rpc(), jupiter: jup(), cfg: DEFAULTS, caps, startSol: readCfg().phantomStartSol, now });
    const eng = new Engine({ feed, exec, journal: new Journal(join(dataDir, "journal-phantom.jsonl")), rug: rugOverride || rugCheck, startEq: readCfg().phantomStartSol, now, org: savedOrg, narr: feed === liveFeed ? new Narrative({ now }) : null });
    eng.onLearn = (c) => onLearn(c);
    return eng;
  }
  async function go(m) {
    if (stopped) return;
    if (timer) clearTimeout(timer); if (timer2) clearTimeout(timer2);
    engine = await build_(m); mode = m; lastError = null; writeCfg({ mode: m, running: true });
    log("engine started:", m, `(${engine.open.size} open, ${engine.closed.length} closed)`);
    const eng = engine;
    const stillMine = () => !stopped && engine === eng;
    if (eng.fastMode) {
      // two lanes: prices and decisions every few seconds, the slow chart feed on its own clock
      let fastBusy = false, slowBusy = false;
      const fastLoop = async () => { if (!stillMine()) return; if (!fastBusy) { fastBusy = true; try { await eng.fast(); } catch (e) { lastError = String(e.message || e); } fastBusy = false; } timer = setTimeout(fastLoop, tickMs); timer.unref?.(); };
      const slowLoop = async () => { if (!stillMine()) return; if (!slowBusy) { slowBusy = true; try { await eng.slow(); } catch (e) { lastError = String(e.message || e); } slowBusy = false; } timer2 = setTimeout(slowLoop, 1500); timer2.unref?.(); };
      slowLoop(); setTimeout(fastLoop, 400);
    } else {
      const loop = async () => {
        if (!stillMine()) return;
        if (!ticking) { ticking = true; try { await eng.tick(); } catch (e) { lastError = String(e.message || e); } ticking = false; }
        timer = setTimeout(loop, tickMs); timer.unref?.();
      };
      loop();
    }
  }
  const halt = () => { if (timer) clearTimeout(timer); if (timer2) clearTimeout(timer2); timer = null; timer2 = null; engine = null; mode = null; writeCfg({ running: false }); };

  const send = (res, code, body, type = "application/json; charset=utf-8", extra = {}) => { res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra }); res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
  const fail = (res, code, error) => send(res, code, { ok: false, error });
  const readBody = (req) => new Promise((r) => { let b = ""; req.on("data", (c) => { b += c; if (b.length > 20000) req.destroy(); }); req.on("end", () => { try { r(b ? JSON.parse(b) : {}); } catch { r({}); } }); });
  const ui = join(HERE, "ui");
  const assets = { "/app.js": ["app.js", "text/javascript; charset=utf-8"], "/style.css": ["style.css", "text/css; charset=utf-8"], "/icon.png": ["icon.png", "image/png"] };

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || "")) return fail(res, 403, "Wrong host.");
      if (req.method === "POST" && url.pathname === "/shutdown") { if (req.headers["x-ultra-launcher"] !== "1") return fail(res, 403, "No."); send(res, 200, { ok: true }); setTimeout(() => close().then(onShutdown), 50); return; }
      if (req.method === "GET" && url.pathname === "/healthz") return send(res, 200, { ok: true, app: APP, build });
      if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) return send(res, 200, readFileSync(join(ui, "index.html"), "utf8").replace("__TOKEN__", token).replaceAll("__BUILD__", String(build)), "text/html; charset=utf-8");
      const a = assets[url.pathname]; if (req.method === "GET" && a) return send(res, 200, readFileSync(join(ui, a[0])), a[1]);
      if (url.pathname.startsWith("/api/")) {
        if (req.method === "POST" && req.headers["x-ultra-token"] !== token) return fail(res, 403, "Reload the window.");
        if (req.method === "GET" && url.pathname === "/api/state") {
          let own = null; if (secrets.imported) { const w = wallet(); own = { address: w.address, sol: await rpc().solBalance(w.address).catch(() => null) }; }
          return send(res, 200, { ok: true, build, running: !!engine, mode, own, sol: own?.sol ?? null, source: "phantom", setup: { imported: secrets.imported }, caps, cfg: { stakeFrac: DEFAULTS.stakeFrac, sl: DEFAULTS.sl, tp: DEFAULTS.tp, maxOpen: DEFAULTS.maxOpen }, engine: engine ? engine.status() : null, lastError, saved: readCfg() });
        }
        if (req.method === "POST") {
          const body = await readBody(req);
          if (url.pathname === "/api/go") { if (body.mode !== "live") return fail(res, 400, "mode must be live"); writeCfg({ userStopped: false }); try { await go(body.mode); } catch (e) { return fail(res, 400, e.message); } return send(res, 200, { ok: true, mode }); }
          if (url.pathname === "/api/pause") { if (engine) engine.paused = !!body.paused; return send(res, 200, { ok: true, paused: engine?.paused ?? null }); }
          if (url.pathname === "/api/sell") { if (!engine) return fail(res, 400, "Not running."); const done = await engine.sellOne(String(body.id || "")); return done ? send(res, 200, { ok: true }) : fail(res, 400, "That position is not open (or the sale did not go through yet)."); }
          if (url.pathname === "/api/flatten") { if (!engine) return fail(res, 400, "Not running."); await engine.flatten(); return send(res, 200, { ok: true, open: engine.open.size }); }
          if (url.pathname === "/api/wallet") { let address; try { address = secrets.importWallet(body.secret); } catch (e) { return fail(res, 400, e.message); } halt(); writeCfg({ phantomStartSol: null, userStopped: false }); try { await go("live"); } catch (e) { lastError = e.message; retry(); } return send(res, 200, { ok: true, address, running: !!engine }); }
          if (url.pathname === "/api/stop") { halt(); writeCfg({ userStopped: true }); return send(res, 200, { ok: true }); }
          if (url.pathname === "/api/rebase") { if (engine && engine.open.size) return fail(res, 400, "Close the open positions first."); const w = wallet(); const b = await rpc().solBalance(w.address); writeCfg({ phantomStartSol: b }); if (engine && mode === "live") { halt(); await go("live"); } return send(res, 200, { ok: true, start: b }); }
          if (url.pathname === "/api/withdraw") {
            if (engine && engine.open.size) return fail(res, 400, "Close the open positions first (Sell everything).");
            if (typeof body.to !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(body.to.trim())) return fail(res, 400, "That does not look like a Solana address.");
            const w = wallet(); const bal = await rpc().solBalance(w.address); const fee = 5000;
            const lamports = body.all ? Math.floor(bal * 1e9) - fee : Math.round(Number(body.sol) * 1e9);
            if (!(lamports > 0) || lamports + fee > Math.floor(bal * 1e9)) return fail(res, 400, "That is more than the wallet holds.");
            const { blockhash } = await rpc().latestBlockhash(); const t = buildTransferTx({ wallet: w, to: body.to.trim(), lamports, blockhash });
            try { await rpc().send(t.tx); } catch (e) { return fail(res, 502, `The network refused it: ${e.message.slice(0, 120)}`); }
            return send(res, 200, { ok: true, signature: t.signature, sol: lamports / 1e9 });
          }
        }
      }
      fail(res, 404, "Not found.");
    } catch (e) { log("request failed:", e); fail(res, 500, "Something went wrong."); }
  });
  // a live update hands the port over: the new server retries for a few seconds while the old one closes
  const listening = new Promise((r, j) => { let n = 0; const tryListen = () => server.listen(port, "127.0.0.1", () => r(server.address().port)); server.on("error", (e) => { if (e.code === "EADDRINUSE" && n++ < 40) setTimeout(tryListen, 250); else j(e); }); tryListen(); });
  // strategy numbers Claude sets over the bridge survive restarts and live updates
  const tuned = () => readCfg().tuned || {};
  const linkI = link ? startLink({ getState: () => ({ build, running: !!engine, mode, lastError, cfg: engine ? engine.cfg : null, applied: linkI?.applied || [], engine: engine ? engine.status() : null }), getEngine: () => engine, onStart: () => go("live"), onSet: (cfg) => writeCfg({ tuned: { ...tuned(), ...cfg } }) }) : null;
  const close = () => new Promise((r) => { stopped = true; linkI?.stop(); if (timer) clearTimeout(timer); if (timer2) clearTimeout(timer2); server.close(() => r()); server.closeAllConnections?.(); });
  // The app trades on its own: once the Phantom wallet is plugged in it starts on launch, and retries every 20 s if the network
  // or the balance is not ready. Only Stop ends that. In tests (no autoStart) it resumes only what was running.
  // In tests (execOverride, a stub executor and no wallet) a restart resumes what was running the same way.
  function autoGo() { if (stopped || engine || readCfg().userStopped || !secrets.imported) return; go("live").catch((e) => { lastError = e.message; retry(); }); }
  function retry() { if (autoStart && !stopped) setTimeout(autoGo, 20000).unref?.(); }
  listening.then(() => { if (autoStart) autoGo(); else if (readCfg().running && (execOverride || secrets.imported)) go("live").catch((e) => { lastError = e.message; }); });
  return { listening, close, token, get engine() { return engine; }, secrets, go, halt };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dataDir = process.env.ULTRA_DATA || join(process.env.HOME || ".", "Library", "Application Support", "Ultra", "data");
  const app = start({ dataDir, port: Number(process.env.ULTRA_PORT || 47401), build: process.env.ULTRA_BUILD || "dev", link: true, autoStart: true, tickMs: 1000, onShutdown: () => process.exit(0) });
  app.listening.then((p) => console.log(`ultra on http://127.0.0.1:${p}/`));
  // live updates: every 2 minutes, a newer published build takes over this same port
  const build = process.env.ULTRA_BUILD || "dev";
  let updating = false;
  const ota = async () => {
    if (updating || build === "dev" || process.env.ULTRA_LINK === "off") return;
    const m = await checkRuntime({ url: `${process.env.ULTRA_LINK || DEFAULT_LINK}/runtime`, build });
    if (!m) return;
    updating = true;
    try {
      const dir = stageRuntime({ manifest: m, fromDir: dirname(fileURLToPath(import.meta.url)), dataDir });
      console.log(`live update: build ${build} -> ${m.build}`);
      await app.close();
      spawn(process.execPath, [join(dir, "server.mjs")], { cwd: dir, env: { ...process.env, ULTRA_BUILD: String(m.build) }, stdio: "inherit", detached: true }).unref();
      setTimeout(() => process.exit(0), 300);
    } catch (e) { console.log("live update refused:", e.message); updating = false; }
  };
  setTimeout(ota, 5000).unref?.(); setInterval(ota, 120000).unref?.();
  // A sleeping Mac cannot sell. While Ultra runs, keep the Mac awake (the screen may still sleep).
  if (process.platform === "darwin") { try { spawn("caffeinate", ["-i", "-w", String(process.pid)], { stdio: "ignore", detached: true }).unref(); } catch { /* optional */ } }
}

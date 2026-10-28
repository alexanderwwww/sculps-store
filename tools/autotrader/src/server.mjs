// Ultra. A small local server on this Mac: the engine runs in here, the screen is a page on 127.0.0.1, and the only
// things that leave the machine are the market feeds and the signed orders to GMGN.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { Engine } from "./lib/engine.mjs";
import { Journal } from "./lib/journal.mjs";
import { liveFeed } from "./lib/feed.mjs";
import { paperExec } from "./lib/exec-paper.mjs";
import { gmgnExec, CAPS } from "./lib/exec-gmgn.mjs";
import { jupiterExec, CAPS as OWN_CAPS } from "./lib/exec-jupiter.mjs";
import { Rpc, Jupiter, walletFromPem, buildTransferTx } from "./lib/solana.mjs";
import { GmgnClient } from "./lib/gmgn.mjs";
import { combinedRug, rugCheck } from "./lib/rug.mjs";
import { Secrets } from "./lib/secrets.mjs";
import { solBalance, publicIpv4 } from "./lib/rpc.mjs";
import { DEFAULTS } from "./lib/strategy.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const APP = "ultra";

export function start({ dataDir, port = 47401, build = "dev", feed = liveFeed, tickMs = 15000, quiet = false, balance = solBalance, ipv4 = publicIpv4, gmgnHost, rpc: rpcOverride = null, jupiter: jupiterOverride = null, rug: rugOverride = null, paperQuote = undefined, now = Date.now, idleMs = 0, onShutdown = () => {} } = {}) {
  mkdirSync(dataDir, { recursive: true });
  const secrets = new Secrets(dataDir);
  const cfgFile = join(dataDir, "config.json");
  const readCfg = () => { try { return JSON.parse(readFileSync(cfgFile, "utf8")); } catch { return {}; } };
  const writeCfg = (patch) => writeFileSync(cfgFile, JSON.stringify({ ...readCfg(), ...patch }, null, 1));
  const token = randomBytes(16).toString("hex");
  const log = (...a) => { if (!quiet) console.log(new Date().toISOString(), ...a); };
  let engine = null, mode = null, timer = null, ticking = false, lastError = null, stopped = false;

  const rpcI = rpcOverride || new Rpc(), jupI = jupiterOverride || new Jupiter();
  const rpc = () => rpcI, jup = () => jupI;
  const ownWallet = () => walletFromPem(secrets.ensureWallet());
  const client = () => (secrets.apiKey && secrets.privateKeyPem ? new GmgnClient({ apiKey: secrets.apiKey, privateKeyPem: secrets.privateKeyPem, ...(gmgnHost ? { host: gmgnHost } : {}) }) : null);

  async function build_(m) {
    if (m === "live" && readCfg().liveSource === "gmgn") {
      if (!secrets.ready()) throw new Error("Finish the GMGN setup first: API key, wallet address and the public key pasted into GMGN.");
      const c = client(); const bal = await balance(secrets.wallet);
      const cfg = readCfg(); if (cfg.liveStartSol == null) writeCfg({ liveStartSol: bal });
      const exec = gmgnExec({ client: c, wallet: secrets.wallet, balanceSol: () => balance(secrets.wallet), cfg: DEFAULTS, startSol: readCfg().liveStartSol });
      return new Engine({ feed, exec, journal: new Journal(join(dataDir, "journal-live.jsonl")), rug: rugOverride || combinedRug(c), startEq: readCfg().liveStartSol, now });
    }
    if (m === "live") {
      const w = ownWallet(); const bal = await rpc().solBalance(w.address);
      if (bal < 0.02) throw new Error(`Ultra's wallet has ${bal.toFixed(4)} SOL. Send some SOL to ${w.address} first (at least 0.03).`);
      if (readCfg().ownStartSol == null) writeCfg({ ownStartSol: bal });
      const exec = jupiterExec({ wallet: w, rpc: rpc(), jupiter: jup(), cfg: DEFAULTS, startSol: readCfg().ownStartSol, now });
      return new Engine({ feed, exec, journal: new Journal(join(dataDir, "journal-own.jsonl")), rug: rugOverride || rugCheck, startEq: readCfg().ownStartSol, now });
    }
    return new Engine({ feed, exec: paperExec({ cfg: DEFAULTS, ...(paperQuote ? { quote: paperQuote } : {}) }), journal: new Journal(join(dataDir, "journal-paper.jsonl")), rug: rugOverride || (client() ? combinedRug(client()) : rugCheck), startEq: 100, now });
  }
  async function go(m) {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    engine = await build_(m); mode = m; lastError = null; writeCfg({ mode: m, running: true });
    log("engine started:", m, `(${engine.open.size} open, ${engine.closed.length} closed)`);
    const loop = async () => {
      if (stopped || !engine) return;
      if (!ticking) { ticking = true; try { await engine.tick(); } catch (e) { lastError = String(e.message || e); } ticking = false; }
      timer = setTimeout(loop, tickMs); timer.unref?.();
    };
    loop();
  }
  const halt = () => { if (timer) clearTimeout(timer); timer = null; engine = null; mode = null; writeCfg({ running: false }); };

  async function checks() {
    const steps = []; const add = (name, ok, why) => steps.push({ name, ok, why });
    add("Signing key made on this Mac", !!secrets.privateKeyPem, secrets.privateKeyPem ? "ready" : "press 'Make my signing key' first");
    add("API key saved", !!secrets.apiKey, secrets.apiKey ? "saved" : "paste it in step 3");
    add("Wallet address saved", !!secrets.wallet, secrets.wallet || "paste it in step 3");
    const c = client();
    if (secrets.wallet) { try { const b = await balance(secrets.wallet); add("Wallet balance read from the chain", b > 0, `${b.toFixed(4)} SOL`); } catch (e) { add("Wallet balance read from the chain", false, e.message); } }
    if (c && secrets.wallet) {
      try { const q = await c.quote({ from: secrets.wallet, input: "So11111111111111111111111111111111111111112", output: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", amount: 10000000, slippage: 20 }); add("GMGN accepts the API key and the wallet (quote)", !!q && Number(q.output_amount) > 0, q ? `0.01 SOL would buy ${(Number(q.output_amount) / 1e6).toFixed(3)} USDC` : "empty answer"); }
      catch (e) { add("GMGN accepts the API key and the wallet (quote)", false, e.message); }
      try { await c.order("ultra-signature-check"); add("GMGN accepts the signing key", true, "signed call answered"); }
      catch (e) { const bad = /signature|403|sign/i.test(`${e.message} ${e.apiError || ""}`); add("GMGN accepts the signing key", !bad, bad ? `${e.message} — is the public key pasted in GMGN, and this computer's IP whitelisted?` : "signature accepted (the test order does not exist, as expected)"); }
    }
    return steps;
  }

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
          let sol = null; try { if (secrets.wallet) sol = await balance(secrets.wallet); } catch { /* shown as unknown */ }
          let own = null; try { const w = ownWallet(); own = { address: w.address, sol: await rpc().solBalance(w.address).catch(() => null) }; } catch { /* shown as unknown */ }
          return send(res, 200, { ok: true, build, running: !!engine, mode, own, source: readCfg().liveSource || "own", setup: { ...secrets.masked(), ready: secrets.ready(), publicKey: secrets.publicKeyPem }, sol, caps: OWN_CAPS, cfg: { stakeFrac: DEFAULTS.stakeFrac, sl: DEFAULTS.sl, tp: DEFAULTS.tp, maxOpen: DEFAULTS.maxOpen }, engine: engine ? engine.status() : null, lastError, saved: readCfg() });
        }
        if (req.method === "GET" && url.pathname === "/api/ip") return send(res, 200, { ok: true, ip: await ipv4() });
        if (req.method === "POST") {
          const body = await readBody(req);
          if (url.pathname === "/api/keypair") return send(res, 200, { ok: true, publicKey: secrets.ensureKeypair() });
          if (url.pathname === "/api/setup") { try { secrets.set(body); } catch (e) { return fail(res, 400, e.message); } return send(res, 200, { ok: true, setup: secrets.masked() }); }
          if (url.pathname === "/api/test") return send(res, 200, { ok: true, steps: await checks() });
          if (url.pathname === "/api/go") { if (!["live", "paper"].includes(body.mode)) return fail(res, 400, "mode must be live or paper"); try { await go(body.mode); } catch (e) { return fail(res, 400, e.message); } return send(res, 200, { ok: true, mode }); }
          if (url.pathname === "/api/pause") { if (engine) engine.paused = !!body.paused; return send(res, 200, { ok: true, paused: engine?.paused ?? null }); }
          if (url.pathname === "/api/flatten") { if (!engine) return fail(res, 400, "Not running."); await engine.flatten(); return send(res, 200, { ok: true, open: engine.open.size }); }
          if (url.pathname === "/api/stop") { halt(); return send(res, 200, { ok: true }); }
          if (url.pathname === "/api/source") { if (!["own", "gmgn"].includes(body.source)) return fail(res, 400, "source must be own or gmgn"); if (engine && mode === "live") return fail(res, 400, "Stop Ultra first."); writeCfg({ liveSource: body.source }); return send(res, 200, { ok: true }); }
          if (url.pathname === "/api/backup") { if (body.confirm !== true) return fail(res, 400, "Confirm first."); const w = ownWallet(); return send(res, 200, { ok: true, address: w.address, secretKey: w.secretKeyBase58 }); }
          if (url.pathname === "/api/rebase") { if (engine && engine.open.size) return fail(res, 400, "Close the open positions first."); const w = ownWallet(); const b = await rpc().solBalance(w.address); writeCfg({ ownStartSol: b }); if (engine && mode === "live") { halt(); await go("live"); } return send(res, 200, { ok: true, start: b }); }
          if (url.pathname === "/api/withdraw") {
            if (engine && engine.open.size) return fail(res, 400, "Close the open positions first (Sell everything).");
            if (typeof body.to !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(body.to.trim())) return fail(res, 400, "That does not look like a Solana address.");
            const w = ownWallet(); const bal = await rpc().solBalance(w.address); const fee = 5000;
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
  const listening = new Promise((r) => server.listen(port, "127.0.0.1", () => r(server.address().port)));
  const close = () => new Promise((r) => { stopped = true; if (timer) clearTimeout(timer); server.close(() => r()); server.closeAllConnections?.(); });
  // Resume what was running when the app last closed. Live resumes only if the keys are still there.
  listening.then(() => { const c = readCfg(); if (c.running && c.mode && !(c.mode === "live" && c.liveSource === "gmgn" && !secrets.ready())) go(c.mode).catch((e) => { lastError = e.message; }); });
  return { listening, close, token, get engine() { return engine; }, secrets, go, halt };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dataDir = process.env.ULTRA_DATA || join(process.env.HOME || ".", "Library", "Application Support", "Ultra", "data");
  const app = start({ dataDir, port: Number(process.env.ULTRA_PORT || 47401), build: process.env.ULTRA_BUILD || "dev", onShutdown: () => process.exit(0) });
  app.listening.then((p) => console.log(`ultra on http://127.0.0.1:${p}/`));
  // A sleeping Mac cannot sell. While Ultra runs, keep the Mac awake (the screen may still sleep).
  if (process.platform === "darwin") { try { spawn("caffeinate", ["-i", "-w", String(process.pid)], { stdio: "ignore", detached: true }).unref(); } catch { /* optional */ } }
}

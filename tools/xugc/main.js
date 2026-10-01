/**
 * XUGC — the shell. One window, one engine, one small JSON file.
 *
 * `setup()` registers everything the screens can ask for and is exported so the tests can run the REAL
 * handlers. The only seams are `makeRunPod` and `bridgeFetch` (tests never touch the network).
 */
const { app, BrowserWindow, ipcMain, dialog, safeStorage, clipboard } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { Store } = require("./store.js");
const { Secrets } = require("./secrets.js");
const { Engine, estimateGenerate, today } = require("./engine.js");
const { Style, compose, LOOKS, AVATARS, QUALITY, SECONDS, NAME } = require("./compose.js");
const { fetchProduct } = require("./product.js");
const { Bridge } = require("./bridge.js");

const BUILD = 4;
const LATEST_NOTE = "";

function setup({ dir, makeRunPod, safe = null, sweepOnStart = true, bridgeFetch, bridgeBase, bridgeMs, startBridge = true, productFetch }) {
  const store = new Store(dir);
  const secrets = new Secrets(dir, safe, "runpod");
  const hf = new Secrets(dir, safe, "hf");
  const engine = new Engine({ store, dir, secrets, hf, makeRunPod });
  // Alex's personal copy ships with his keys in seed.json (never in git). Only used when no key is saved yet.
  try { const seed = JSON.parse(fs.readFileSync(path.join(__dirname, "seed.json"), "utf8")); if (seed.runpod && !secrets.get()) secrets.set(seed.runpod); if (seed.hf && !hf.get()) hf.set(seed.hf); } catch { /* a copy without keys */ }
  const style = new Style(path.join(dir, "style"), path.join(__dirname, "assets", "style"));
  const clipsDir = path.join(dir, "clips");
  fs.mkdirSync(clipsDir, { recursive: true });
  let progress = null; // the last progress line, for the status board
  let bridge = null;

  const estimate = (seconds, quality) => estimateGenerate({ seconds: Number(seconds) || 15, quality: quality || "hd", volume: !!store.read().settings.volumeId });
  const view = () => {
    const s = store.read();
    return {
      state: s, build: BUILD, keySet: !!secrets.get(), keyTail: secrets.tail(), hfSet: !!hf.get(), hfTail: hf.tail(), busy: engine.status(),
      looks: Object.keys(LOOKS), avatars: Object.keys(AVATARS), qualities: Object.fromEntries(Object.entries(QUALITY).map(([k, v]) => [k, v.label])), seconds: Object.keys(SECONDS).map(Number),
      style: style.list(s.styleOff), usedToday: s.spent.day === today() ? s.spent.usd : 0,
      mcp: { on: s.settings.mcpOn, url: bridge ? bridge.url() : new Bridge({ getStatus() {}, onOrder() {} }).url(), connected: !!(bridge && bridge.connected), lastOk: bridge ? bridge.lastOk : 0, claudeSeen: bridge && bridge.mcpSeen ? bridge.mcpSeen.at : 0, log: bridge ? bridge.log : [] },
    };
  };
  const fail = (err) => ({ error: err.message, code: err.code || "error", costUsd: err.costUsd || 0, ...view() });

  /** One way to make a video, for the screen and for Claude alike. */
  async function makeVideo(spec, emit) {
    const st = store.read();
    let product = null;
    if (spec.productUrl) { product = await (productFetch || fetchProduct)(spec.productUrl); store.update((s) => { s.product = product; }); }
    else if (spec.useProduct !== false && st.product) product = st.product;
    const scene = String(spec.scene || "").trim(), given = String(spec.prompt || "").trim();
    if (!given && scene.length < 10) throw new Error("Write what happens in the video (a sentence or two).");
    const seconds = Number(spec.seconds) || 15;
    const prompt = given || compose({ scene, look: spec.look, avatar: spec.avatar, avatarText: spec.avatarText, product, seconds }, style.gather(st.styleOff));
    const take = await engine.generate({ prompt, seconds, quality: spec.quality || "hd", meta: { scene: scene || undefined, look: spec.look || "", avatar: spec.avatar || (spec.avatarText ? "custom" : "broad"), product: product ? product.title : "" } }, (p) => { progress = { ...p, at: Date.now() }; emit && emit(p); });
    store.update((s) => { s.takes.unshift(take); });
    progress = null;
    return take;
  }

  ipcMain.handle("state:get", () => view());
  ipcMain.handle("estimate", (_e, seconds, quality) => estimate(seconds, quality));
  ipcMain.handle("settings:set", (_e, patch) => {
    store.update((s) => {
      for (const k of ["capJob", "capDay"]) if (patch[k] != null) { const v = Number(patch[k]); if (Number.isFinite(v) && v >= 0 && v <= 10000) s.settings[k] = v; }
      if (typeof patch.volumeId === "string") s.settings.volumeId = patch.volumeId.trim().slice(0, 40);
      if (typeof patch.mcpOn === "boolean") s.settings.mcpOn = patch.mcpOn;
    });
    syncBridge();
    return view();
  });

  ipcMain.handle("key:set", async (_e, key) => {
    try { secrets.set(key); } catch (err) { return fail(err); }
    try { const r = await engine.testKey(); return { ok: true, pods: r.pods, ...view() }; }
    catch (err) { if (err.code === "auth") secrets.clear(); return fail(err); }
  });
  ipcMain.handle("key:test", async () => { try { const r = await engine.testKey(); return { ok: true, pods: r.pods, ...view() }; } catch (err) { return fail(err); } });
  ipcMain.handle("hf:set", (_e, key) => { try { hf.set(key); return { ok: true, ...view() }; } catch (err) { return fail(err); } });
  ipcMain.handle("pods:sweep", async () => { try { const n = await engine.sweep(); return { ok: true, stopped: n, ...view() }; } catch (err) { return fail(err); } });

  ipcMain.handle("product:fetch", async (_e, url) => {
    try { const p = await (productFetch || fetchProduct)(String(url || "").trim()); store.update((s) => { s.product = p; }); return { ok: true, product: p, ...view() }; } catch (err) { return fail(err); }
  });
  ipcMain.handle("product:clear", () => { store.update((s) => { s.product = null; }); return view(); });

  ipcMain.handle("generate", async (e, spec) => {
    try { const take = await makeVideo(spec || {}, (p) => e.sender.send("job", p)); return { take, ...view() }; }
    catch (err) { return fail(err); }
  });
  ipcMain.handle("cancel", () => engine.cancel());

  ipcMain.handle("style:toggle", (_e, name, on) => { if (!NAME.test(name)) return view(); store.update((s) => { s.styleOff = s.styleOff.filter((n) => n !== name); if (!on) s.styleOff.push(name); }); return view(); });
  ipcMain.handle("style:read", (_e, name) => { try { return style.read(name); } catch { return ""; } });
  ipcMain.handle("style:write", (_e, name, text) => { try { style.write(name, text); return view(); } catch (err) { return fail(err); } });
  ipcMain.handle("style:delete", (_e, name) => { try { style.remove(name); } catch {} return view(); });
  ipcMain.handle("style:add", async () => {
    const r = await dialog.showOpenDialog({ title: "Choose Style Bible .md files", properties: ["openFile", "multiSelections"], filters: [{ name: "Markdown", extensions: ["md"] }] });
    if (r.canceled) return view();
    try { for (const f of r.filePaths) { const nm = path.basename(f).toLowerCase().replace(/[^a-z0-9.-]+/g, "-"); style.write(nm, fs.readFileSync(f, "utf8")); } return view(); } catch (err) { return fail(err); }
  });

  ipcMain.handle("verdict", (_e, id, v) => {
    store.update((s) => {
      const t = s.takes.find((x) => x.id === id); if (!t) return;
      t.verdict = t.verdict === v ? null : v;
      s.dataset = s.dataset.filter((c) => c.takeId !== id);
      if (t.verdict === "up") s.dataset.push({ id: `ds-${id}`, takeId: id, name: `Approved take (${new Date(t.at).toLocaleDateString()})`, file: t.video, caption: t.prompt || "", source: "approved" });
    });
    return view();
  });
  ipcMain.handle("take:delete", (_e, id) => {
    store.update((s) => { const t = s.takes.find((x) => x.id === id); if (t) for (const f of [t.video, t.poster]) if (f) try { fs.unlinkSync(f); } catch {} s.takes = s.takes.filter((x) => x.id !== id); s.dataset = s.dataset.filter((c) => c.takeId !== id); });
    return view();
  });

  const addPaths = (paths) => {
    store.update((s) => {
      for (const p of paths) {
        if (!/\.(mp4|mov|m4v|webm)$/i.test(p)) continue;
        const name = path.basename(p); const dest = path.join(clipsDir, `${Date.now()}-${Math.floor(Math.random() * 1e4)}-${name}`);
        fs.copyFileSync(p, dest);
        s.dataset.push({ id: `ds-${Date.now()}-${Math.floor(Math.random() * 1e4)}`, name, file: dest, caption: "", source: "yours" });
      }
    });
    return view();
  };
  ipcMain.handle("dataset:addPaths", (_e, paths) => addPaths(paths || []));
  ipcMain.handle("dataset:add", async () => {
    const r = await dialog.showOpenDialog({ title: "Choose UGC videos you own", properties: ["openFile", "multiSelections"], filters: [{ name: "Video", extensions: ["mp4", "mov", "m4v", "webm"] }] });
    return r.canceled ? view() : addPaths(r.filePaths);
  });
  ipcMain.handle("dataset:caption", (_e, id, text) => { store.update((s) => { const c = s.dataset.find((x) => x.id === id); if (c) c.caption = String(text).slice(0, 600); }); return view(); });
  ipcMain.handle("dataset:remove", (_e, id) => { store.update((s) => { s.dataset = s.dataset.filter((c) => c.id !== id); }); return view(); });
  ipcMain.handle("clipboard:write", (_e, text) => { clipboard.writeText(String(text)); return true; });

  /* ---- Claude's line: a short fixed list of orders, each re-checked here ---- */
  const statusBoard = () => {
    const s = store.read();
    return {
      app: "XUGC", build: BUILD, busy: engine.status(), progress, usedToday: s.spent.day === today() ? s.spent.usd : 0,
      limits: { perVideo: s.settings.capJob, perDay: s.settings.capDay }, keys: { runpod: !!secrets.get(), huggingface: !!hf.get() }, volume: !!s.settings.volumeId,
      style: style.list(s.styleOff).map((f) => ({ name: f.name, on: f.on, lines: f.lines })), product: s.product ? { title: s.product.title, url: s.product.url, price: s.product.price } : null,
      takes: s.takes.slice(0, 15).map((t) => ({ id: t.id, at: t.at, seconds: t.seconds, quality: t.quality, cost: t.cost, minutes: t.minutes, audio: t.audio, verdict: t.verdict, scene: t.scene, prompt: (t.prompt || "").slice(0, 400) })),
      claudeLog: bridge ? bridge.log.slice(-8) : [],
    };
  };
  async function onOrder(o) {
    if (!store.read().settings.mcpOn) return { ok: false, error: "Claude control is switched off in XUGC (Settings, MCP)." };
    const t = o.type;
    if (t === "generate") {
      const take = await makeVideo({ scene: o.scene, prompt: o.prompt, look: o.look, avatar: o.avatar, avatarText: o.avatarText, productUrl: o.productUrl || undefined, seconds: o.seconds, quality: o.quality }, null);
      return { ok: true, takeId: take.id, cost: take.cost, minutes: take.minutes, audio: take.audio, seconds: take.seconds };
    }
    if (t === "cancel") return { ok: true, cancelled: engine.cancel() };
    if (t === "style_write") { style.write(o.name, o.content); return { ok: true, name: o.name }; }
    if (t === "style_delete") { style.remove(o.name); return { ok: true }; }
    if (t === "style_toggle") { if (!NAME.test(o.name)) return { ok: false, error: "bad name" }; store.update((s) => { s.styleOff = s.styleOff.filter((n) => n !== o.name); if (o.on === false) s.styleOff.push(o.name); }); return { ok: true }; }
    if (t === "share") {
      const take = store.read().takes.find((x) => x.id === o.takeId);
      if (!take || !fs.existsSync(take.video)) return { ok: false, error: "no such video" };
      const size = fs.statSync(take.video).size; if (size > 90e6) return { ok: false, error: "video too big to share" };
      return { ok: true, url: await bridge.upload(`${take.id}.mp4`, fs.readFileSync(take.video)) };
    }
    return { ok: false, error: "not an order the app accepts: " + t };
  }
  function syncBridge() {
    const on = store.read().settings.mcpOn;
    if (!startBridge) return;
    if (!bridge) bridge = new Bridge({ base: bridgeBase, getStatus: statusBoard, onOrder, fetch: bridgeFetch, intervalMs: bridgeMs });
    if (on) bridge.start(); else bridge.stop();
  }
  syncBridge();

  // The meter: anything XUGC left running in a past session is stopped now.
  if (sweepOnStart && secrets.get()) engine.sweep().catch(() => {});
  return { store, engine, secrets, hf, style, get bridge() { return bridge; }, makeVideo };
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 1100, minHeight: 700, backgroundColor: "#07080A", title: "XUGC",
    titleBarStyle: "hiddenInset", trafficLightPosition: { x: 16, y: 16 },
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
  return win;
}

if (!process.env.XUGC_NO_AUTOSTART) {
  app.whenReady().then(() => {
    setup({ dir: path.join(app.getPath("userData"), "xugc"), safe: safeStorage });
    createWindow();
    app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
  app.on("window-all-closed", () => app.quit());
}

module.exports = { setup, createWindow, BUILD };

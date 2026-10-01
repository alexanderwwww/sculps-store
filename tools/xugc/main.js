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
const { Style, compose, parseCaption, LEVELS, LOOKS, AVATARS, QUALITY, SECONDS, NAME } = require("./compose.js");
const { fetchProduct } = require("./product.js");
const { Bridge } = require("./bridge.js");

const BUILD = 7;
const LATEST_NOTE = "";

function setup({ dir, makeRunPod, safe = null, sweepOnStart = true, bridgeFetch, bridgeBase, bridgeMs, startBridge = true, productFetch }) {
  const store = new Store(dir);
  const secrets = new Secrets(dir, safe, "runpod");
  const hf = new Secrets(dir, safe, "hf");
  const engine = new Engine({ store, dir, secrets, hf, makeRunPod, fetchImpl: bridgeFetch });
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
      style: style.list(s.styleOff), levels: LEVELS, usedToday: s.spent.day === today() ? s.spent.usd : 0,
      mcp: { on: s.settings.mcpOn, url: bridge ? bridge.url() : new Bridge({ getStatus() {}, onOrder() {} }).url(), connected: !!(bridge && bridge.connected), lastOk: bridge ? bridge.lastOk : 0, claudeSeen: bridge && bridge.mcpSeen ? bridge.mcpSeen.at : 0, log: bridge ? bridge.log : [] },
    };
  };
  const fail = (err) => ({ error: err.message, code: err.code || "error", costUsd: err.costUsd || 0, ...view() });

  // Reference photos: the ones he ticked, or "auto" = the first two photos of the saved product.
  const NOT_A_PHOTO = /(-s\d|spec|band|box|logo|text|chart|size|infograph|-rv-|-u\d|thumb|-t\d+\.|-w\d+\.)/i;
  const cleanPhotos = (images) => images.filter((u) => !NOT_A_PHOTO.test(u.split("/").pop()));
  const refUrls = (spec, product) => {
    const ok = new Set(product ? product.images : []);
    const raw = spec.refs === "auto" ? (product ? cleanPhotos(product.images).slice(0, 1) : []) : Array.isArray(spec.refs) ? spec.refs : [];
    return raw.map((r) => (typeof r === "string" ? { url: r } : { url: r && r.url, at: r && Number(r.at), strength: r && Number(r.strength) }))
      .filter((r) => typeof r.url === "string" && /^https?:\/\//i.test(r.url) && (ok.has(r.url) || spec.refsAnyUrl)).slice(0, 3)
      .map((r) => ({ url: r.url, ...(Number.isFinite(r.at) ? { at: r.at } : {}), ...(Number.isFinite(r.strength) ? { strength: r.strength } : {}) }));
  };
  const send = (ch, p) => { for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(ch, p); };

  /** Everything a video needs, decided BEFORE any money moves: the product, the final prompt, the reference photos, the price. */
  async function prepare(spec) {
    const st = store.read();
    let product = null;
    if (spec.productUrl) { send("claude", { kind: "product", url: spec.productUrl }); product = await (productFetch || fetchProduct)(spec.productUrl); store.update((s) => { s.product = product; }); send("claude", { kind: "refresh" }); }
    else if (spec.useProduct !== false && st.product) product = st.product;
    const scene = String(spec.scene || "").trim(), given = String(spec.prompt || "").trim();
    if (!given && scene.length < 10) throw new Error("Write what happens in the video (a sentence or two).");
    const seconds = Number(spec.seconds) || 15, quality = spec.quality || "hd";
    const prompt = given || compose({ scene, look: spec.look, avatar: spec.avatar, avatarText: spec.avatarText, product, seconds, music: spec.music, reference: spec.useReference === false ? null : st.reference }, style.gather(st.styleOff));
    const est = estimateGenerate({ seconds, quality, volume: !!st.settings.volumeId });
    const asked = Array.isArray(spec.captions) ? spec.captions.map(parseCaption).filter(Boolean) : null;
    const captions = (asked || style.gather(st.styleOff).captions).filter((c) => c.start < seconds).map((c) => ({ ...c, end: Math.min(c.end, seconds) }));
    return { spec, product, scene, prompt, seconds, quality, captions, refs: refUrls(spec, product), engine: spec.engine, usd: est.usd, minutes: est.minutes };
  }
  async function render(pr, emit) {
    const spec = pr.spec;
    try {
      const take = await engine.generate({ prompt: pr.prompt, seconds: pr.seconds, quality: pr.quality, refs: pr.refs, captions: pr.captions, engine: pr.engine, meta: { scene: pr.scene || undefined, look: spec.look || "", avatar: spec.avatar || (spec.avatarText ? "custom" : "broad"), product: pr.product ? pr.product.title : "" } }, (p) => { progress = { ...p, at: Date.now() }; (emit || ((q) => send("job", q)))(p); });
      store.update((s) => { s.takes.unshift(take); });
      progress = null; send("job:done", { take, state: store.read() });
      return take;
    } catch (e) { progress = null; send("job:done", { error: e.message, costUsd: e.costUsd || 0 }); throw e; }
  }
  /** One way to make a video, for the screen and for Claude alike. */
  async function makeVideo(spec, emit) { return render(await prepare(spec), emit); }

  // Claude's videos wait for his OK on screen (unless he switched auto-approve on in the MCP tab).
  let decision = null;
  ipcMain.handle("claude:decide", (_e, ok, prompt) => { if (decision) { const d = decision; decision = null; d({ ok: !!ok, prompt: prompt && String(prompt).trim() ? String(prompt) : null }); } return true; });
  const askApproval = (pr, who) => new Promise((resolve) => {
    decision = resolve; send("claude", { kind: "approve", who, prompt: pr.prompt, seconds: pr.seconds, quality: pr.quality, usd: pr.usd, minutes: pr.minutes, refs: pr.refs.length, product: pr.product ? pr.product.title : "", chars: pr.prompt.length, captions: pr.captions.map((c) => `${c.start}-${c.end}s: ${c.text}`) });
    setTimeout(() => { if (decision === resolve) { decision = null; resolve({ ok: false, timeout: true }); } }, 15 * 60 * 1000);
  });

  ipcMain.handle("state:get", () => view());
  ipcMain.handle("prompt:preview", async (_e, spec) => { try { const st = store.read(); const product = spec.useProduct !== false ? st.product : null; const seconds = Number(spec.seconds) || 15; return { prompt: compose({ scene: String(spec.scene || "").trim() || "(what happens goes here)", look: spec.look, avatar: spec.avatar, avatarText: spec.avatarText, product, seconds, music: spec.music, reference: spec.useReference === false ? null : st.reference }, style.gather(st.styleOff)) }; } catch (err) { return { error: err.message }; } });
  ipcMain.handle("estimate", (_e, seconds, quality) => estimate(seconds, quality));
  ipcMain.handle("settings:set", (_e, patch) => {
    store.update((s) => {
      for (const k of ["capJob", "capDay"]) if (patch[k] != null) { const v = Number(patch[k]); if (Number.isFinite(v) && v >= 0 && v <= 10000) s.settings[k] = v; }
      if (typeof patch.volumeId === "string") s.settings.volumeId = patch.volumeId.trim().slice(0, 40);
      if (typeof patch.mcpOn === "boolean") s.settings.mcpOn = patch.mcpOn;
      if (typeof patch.autoApprove === "boolean") s.settings.autoApprove = patch.autoApprove;
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

  ipcMain.handle("verdict", (_e, id, v, note) => {
    if (v === "down" && note) style.addNever(note);
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
  /* ---- the reference ad: a video that went a little viral, used as inspiration only ---- */
  const refDir = path.join(dir, "reference"); fs.mkdirSync(refDir, { recursive: true });
  const readVideo = (p) => { if (!/\.(mp4|mov|m4v|webm)$/i.test(p)) throw new Error("Choose a video file (mp4 or mov)."); const st = fs.statSync(p); if (st.size > 150e6) throw new Error("That video is over 150 MB. Use a shorter or smaller one."); return { name: path.basename(p), bytes: fs.readFileSync(p) }; };
  ipcMain.handle("reference:fromPath", (_e, p) => { try { return readVideo(String(p)); } catch (err) { return { error: err.message }; } });
  ipcMain.handle("reference:pick", async () => { const r = await dialog.showOpenDialog({ title: "Choose the reference ad", properties: ["openFile"], filters: [{ name: "Video", extensions: ["mp4", "mov", "m4v", "webm"] }] }); if (r.canceled) return null; try { return readVideo(r.filePaths[0]); } catch (err) { return { error: err.message }; } });
  const shareSheet = () => { try { const f = path.join(refDir, "sheet.jpg"); if (bridge && store.read().settings.mcpOn && fs.existsSync(f)) bridge.upload("ref-sheet.jpg", fs.readFileSync(f)).catch(() => {}); } catch {} };
  ipcMain.handle("reference:save", (_e, r) => {
    try {
      const jpg = Buffer.from(String(r.sheet || "").split(",")[1] || "", "base64"); if (jpg.length < 500) throw new Error("No frames were read from that video.");
      fs.writeFileSync(path.join(refDir, "sheet.jpg"), jpg);
      const cuts = (r.cuts || []).map(Number).filter((x) => Number.isFinite(x)).slice(0, 40);
      store.update((s) => { s.reference = { name: String(r.name || "reference").slice(0, 80), duration: Math.round(Number(r.duration) * 10) / 10, cuts, beats: String(r.beats || "").slice(0, 3000), level: 2, sheet: path.join(refDir, "sheet.jpg"), at: Date.now() }; });
      shareSheet(); return view();
    } catch (err) { return fail(err); }
  });
  ipcMain.handle("reference:update", (_e, patch) => { store.update((s) => { if (!s.reference) return; if (typeof patch.beats === "string") s.reference.beats = patch.beats.slice(0, 3000); if (Number.isInteger(patch.level) && patch.level >= 0 && patch.level <= 3) s.reference.level = patch.level; }); return view(); });
  ipcMain.handle("reference:clear", () => { store.update((s) => { s.reference = null; }); return view(); });
  ipcMain.handle("clipboard:write", (_e, text) => { clipboard.writeText(String(text)); return true; });

  /* ---- Claude's line: a short fixed list of orders, each re-checked here ---- */
  const statusBoard = () => {
    const s = store.read();
    return {
      app: "XUGC", build: BUILD, busy: engine.status(), progress, usedToday: s.spent.day === today() ? s.spent.usd : 0,
      limits: { perVideo: s.settings.capJob, perDay: s.settings.capDay }, keys: { runpod: !!secrets.get(), huggingface: !!hf.get() }, volume: !!s.settings.volumeId,
      style: style.list(s.styleOff).map((f) => ({ name: f.name, on: f.on, lines: f.lines })), product: s.product ? { title: s.product.title, url: s.product.url, price: s.product.price } : null,
      takes: s.takes.slice(0, 15).map((t) => ({ id: t.id, at: t.at, seconds: t.seconds, quality: t.quality, cost: t.cost, minutes: t.minutes, audio: t.audio, verdict: t.verdict, scene: t.scene, prompt: (t.prompt || "").slice(0, 400) })),
      reference: s.reference ? { name: s.reference.name, duration: s.reference.duration, cuts: s.reference.cuts, level: s.reference.level, beats: s.reference.beats, sheet: "ref-sheet.jpg (see xugc_takes)" } : null,
      claudeLog: bridge ? bridge.log.slice(-8) : [],
    };
  };
  async function onOrder(o) {
    if (!store.read().settings.mcpOn) return { ok: false, error: "Claude control is switched off in XUGC (Settings, MCP)." };
    const t = o.type;
    if (t === "generate") {
      send("claude", { kind: "start", text: "Claude is setting up a video" });
      const pr = await prepare({ scene: o.scene, prompt: o.prompt, look: o.look, avatar: o.avatar, avatarText: o.avatarText, productUrl: o.productUrl || undefined, seconds: o.seconds, quality: o.quality, refs: o.refs, music: o.music, captions: o.captions, engine: o.engine });
      if (!store.read().settings.autoApprove) {
        const d = await askApproval(pr, "Claude");
        if (!d.ok) { send("claude", { kind: "end", text: d.timeout ? "No answer, so it was cancelled" : "You said no" }); return { ok: false, error: d.timeout ? "Alex did not answer in 15 minutes, nothing was rented." : "Alex said no on screen. Nothing was rented." }; }
        if (d.prompt) { pr.prompt = d.prompt; pr.spec = { ...pr.spec, prompt: d.prompt }; }
      }
      send("claude", { kind: "go" });
      const take = await render(pr, null);
      send("claude", { kind: "end", text: "Done" });
      return { ok: true, takeId: take.id, cost: take.cost, minutes: take.minutes, audio: take.audio, seconds: take.seconds };
    }
    if (t === "reference_set") {
      if (!store.read().reference) return { ok: false, error: "No reference ad is loaded in the app yet. Alex has to drop one into Create first." };
      store.update((s) => { if (typeof o.beats === "string" && o.beats.trim()) s.reference.beats = o.beats.slice(0, 3000); if (Number.isInteger(o.level) && o.level >= 0 && o.level <= 3) s.reference.level = o.level; });
      send("claude", { kind: "refresh" }); return { ok: true };
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

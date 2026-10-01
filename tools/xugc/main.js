/**
 * XUGC — the shell. One window, one engine, one small JSON file.
 *
 * `setup()` registers everything the screens can ask for and is exported so the
 * tests can run the REAL handlers — a test that mocks them proves nothing about
 * what he will press. The only seam is `makeRunPod` (so tests never touch the network).
 */
const { app, BrowserWindow, ipcMain, dialog, safeStorage } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { Store } = require("./store.js");
const { Secrets } = require("./secrets.js");
const { Engine, estimateGenerate, estimateTrain, today, LOOKS } = require("./engine.js");

const BUILD = 2;
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

function setup({ dir, makeRunPod, safe = null, sweepOnStart = true }) {
  const store = new Store(dir);
  const secrets = new Secrets(dir, safe);
  const engine = new Engine({ store, dir, secrets, makeRunPod });
  const clipsDir = path.join(dir, "clips");
  fs.mkdirSync(clipsDir, { recursive: true });

  const view = () => {
    const s = store.read(); const vol = !!s.settings.volumeId;
    return {
      state: s, build: BUILD, keySet: !!secrets.get(), keyTail: secrets.tail(), busy: engine.status(), looks: Object.keys(LOOKS),
      estimate: estimateGenerate({ volume: vol }),
      trainEstimate: estimateTrain({ videos: s.dataset.length || 1, volume: vol }), testEstimate: estimateTrain({ videos: 2, dry: true, volume: vol }),
      usedToday: s.spent.day === today() ? s.spent.usd : 0,
    };
  };
  const fail = (err) => ({ error: err.message, code: err.code || "error", costUsd: err.costUsd || 0, ...view() });

  ipcMain.handle("state:get", () => view());
  ipcMain.handle("settings:set", (_e, patch) => {
    store.update((s) => {
      for (const k of ["capJob", "capDay", "capTrain"]) if (patch[k] != null) { const v = Number(patch[k]); if (Number.isFinite(v) && v >= 0 && v <= 10000) s.settings[k] = v; }
      if (typeof patch.volumeId === "string") s.settings.volumeId = patch.volumeId.trim().slice(0, 40);
    });
    return view();
  });

  ipcMain.handle("key:set", async (_e, key) => {
    try { secrets.set(key); } catch (err) { return fail(err); }
    try { const r = await engine.testKey(); return { ok: true, pods: r.pods, ...view() }; }
    catch (err) { if (err.code === "auth") secrets.clear(); return fail(err); }
  });
  ipcMain.handle("key:clear", () => { secrets.clear(); return view(); });
  ipcMain.handle("key:test", async () => { try { const r = await engine.testKey(); return { ok: true, pods: r.pods, ...view() }; } catch (err) { return fail(err); } });
  ipcMain.handle("pods:sweep", async () => { try { const n = await engine.sweep(); return { ok: true, stopped: n, ...view() }; } catch (err) { return fail(err); } });

  ipcMain.handle("generate", async (e, job) => {
    try {
      const take = await engine.generate(job, (p) => e.sender.send("job", p));
      store.update((s) => { s.takes.unshift(take); });
      return { take, ...view() };
    } catch (err) { return fail(err); }
  });
  ipcMain.handle("cancel", () => engine.cancel());

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
    store.update((s) => { const t = s.takes.find((x) => x.id === id); if (t) for (const f of [t.video, t.poster]) try { fs.unlinkSync(f); } catch {} s.takes = s.takes.filter((x) => x.id !== id); s.dataset = s.dataset.filter((c) => c.takeId !== id); });
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

  ipcMain.handle("train", async (e, opts) => {
    try {
      const model = await engine.train(opts || {}, (p) => e.sender.send("train", p));
      return { model, ...view() };
    } catch (err) { return fail(err); }
  });
  ipcMain.handle("model:delete", (_e, id) => {
    store.update((s) => { const m = s.models.find((x) => x.id === id); if (m && m.kind === "lora") { try { fs.unlinkSync(m.file); } catch {} s.models = s.models.filter((x) => x.id !== id); } });
    return view();
  });

  /** A picture from his Mac, handed to the screen as a data URL (the screen crops it to 9:16). */
  const readImage = (p) => { const m = MIME[path.extname(p).toLowerCase()]; if (!m) return null; return { name: path.basename(p), dataUrl: `data:${m};base64,${fs.readFileSync(p).toString("base64")}` }; };
  ipcMain.handle("pick:frame", async () => {
    const r = await dialog.showOpenDialog({ title: "Choose the start frame", properties: ["openFile"], filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "webp"] }] });
    return r.canceled ? null : readImage(r.filePaths[0]);
  });
  ipcMain.handle("read:image", (_e, p) => readImage(p));

  // The meter: anything XUGC left running in a past session is stopped now.
  if (sweepOnStart && secrets.get()) engine.sweep().catch(() => {});
  return { store, engine, secrets };
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

/**
 * XUGC — the shell. One window, one engine, one small JSON file.
 *
 * `setup()` registers everything the screens can ask for and is exported so the
 * tests can run the REAL handlers — a test that mocks them proves nothing about
 * what he will press.
 */
const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { Store } = require("./store.js");
const { Engine, estimateGenerate, estimateTrain, today } = require("./engine.js");

const BUILD = 1;

function setup({ dir, fast = false }) {
  const store = new Store(dir);
  const engine = new Engine({ store, fast });
  const clipsDir = path.join(dir, "clips");
  fs.mkdirSync(clipsDir, { recursive: true });

  // First run: his own UGC video is the first example to train on, so Train is never an empty screen.
  if (!store.read().dataset.length && !store.read().seeded) {
    store.update((s) => {
      s.seeded = true;
      s.dataset.push({ id: "seed-1", name: "Haunted Projector UGC (from your store)", file: "assets/samples/ugc-projector.mp4", caption: "A woman shows the projector throwing a ghost onto her front window at night, phone-camera framing.", source: "yours" });
    });
  }

  const view = () => {
    const s = store.read();
    return {
      state: s, build: BUILD,
      estimate: estimateGenerate({ seconds: 15 }), trainEstimate: estimateTrain({ clips: s.dataset.length || 1 }),
      usedToday: s.spent.day === today() ? s.spent.usd : 0,
    };
  };

  ipcMain.handle("state:get", () => view());
  ipcMain.handle("settings:set", (_e, patch) => {
    store.update((s) => {
      for (const k of ["capJob", "capDay", "capTrain"]) if (patch[k] != null) { const v = Number(patch[k]); if (Number.isFinite(v) && v >= 0 && v <= 10000) s.settings[k] = v; }
      if (patch.mode === "demo") s.settings.mode = "demo";
      if (patch.mode === "runpod") s.settings.mode = "runpod"; // refuses at generate time, out loud
    });
    return view();
  });

  ipcMain.handle("generate", async (e, job) => {
    try {
      const take = await engine.generate(job, (p) => e.sender.send("job", p));
      store.update((s) => { s.takes.unshift(take); });
      return { take, ...view() };
    } catch (err) { return { error: err.message, code: err.code || "error" }; }
  });

  ipcMain.handle("verdict", (_e, id, v) => {
    store.update((s) => {
      const t = s.takes.find((x) => x.id === id); if (!t) return;
      t.verdict = t.verdict === v ? null : v;
      s.dataset = s.dataset.filter((c) => c.takeId !== id);
      if (t.verdict === "up") s.dataset.push({ id: `ds-${id}`, takeId: id, name: `Approved take (${new Date(t.at).toLocaleDateString()})`, file: t.video, caption: t.script || "", source: "approved" });
    });
    return view();
  });
  ipcMain.handle("take:delete", (_e, id) => { store.update((s) => { s.takes = s.takes.filter((t) => t.id !== id); s.dataset = s.dataset.filter((c) => c.takeId !== id); }); return view(); });

  const addPaths = (paths) => {
    store.update((s) => {
      for (const p of paths) {
        if (!/\.(mp4|mov|m4v|webm)$/i.test(p)) continue;
        const name = path.basename(p); const dest = path.join(clipsDir, `${Date.now()}-${name}`);
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
      store.update((s) => { s.models.push(model); });
      return { model, ...view() };
    } catch (err) { return { error: err.message, code: err.code || "error" }; }
  });

  ipcMain.handle("pick:images", async () => {
    const r = await dialog.showOpenDialog({ title: "Choose product photos", properties: ["openFile", "multiSelections"], filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "webp"] }] });
    return r.canceled ? [] : r.filePaths;
  });
  return { store, engine };
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
    setup({ dir: path.join(app.getPath("userData"), "xugc") });
    createWindow();
    app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
  app.on("window-all-closed", () => app.quit());
}

module.exports = { setup, createWindow, BUILD };

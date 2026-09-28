/**
 * plug — the Electron shell.
 *
 * One frameless, transparent window that is two shapes: a 320x64 pill and a
 * 393x852 phone. Clicking the pill morphs it into the phone.
 *
 * THE ONE THING THAT DECIDES THIS ARCHITECTURE
 *
 * `backdrop-filter` in Electron only sees what is INSIDE the window. On a
 * transparent window there is nothing behind the glass to bend, so a straight
 * copy of the approved design renders a beautiful filter over empty air and
 * arrives looking like a grey slab — which is exactly what eleven earlier
 * builds of this app were.
 *
 * So the desktop is brought inside. The main process captures the screen, the
 * renderer draws the region under the window behind the glass, and the filter
 * bends THAT. It is the real desktop, correctly aligned, and it is the only
 * way this design can exist in Electron.
 *
 * The cost is honest and worth saying out loud: macOS asks for Screen
 * Recording permission once, the first time. Nothing is sent anywhere — the
 * capture never leaves the process that draws it.
 */
const { app, BrowserWindow, ipcMain, screen, desktopCapturer, shell } = require("electron");
const path = require("node:path");
const { SITES, Shop } = require("./shops.js");

/** One per marketplace, built the first time it is needed. */
const shops = new Map();
function shopFor(id) {
  if (!SITES[id]) return null;
  if (!shops.has(id)) shops.set(id, new Shop(id, win));
  return shops.get(id);
}

const SHAPES = {
  pill: { width: 320, height: 64 },
  phone: { width: 393, height: 852 },
};

let win = null;
let shape = "pill";

function create() {
  const area = screen.getPrimaryDisplay().workAreaSize;
  win = new BrowserWindow({
    ...SHAPES.pill,
    x: Math.round(area.width / 2 - SHAPES.pill.width / 2),
    y: Math.round(area.height * 0.62),
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    /* It floats over everything and never steals focus from what he is typing
       into. A shop that runs all day cannot be a window he has to manage. */
    alwaysOnTop: true,
    skipTaskbar: true,
    /* No vibrancy: that is macOS's own frosted material and it would sit
       behind our glass as a grey wash — the exact look this design exists to
       replace. */
    vibrancy: undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setAlwaysOnTop(true, "floating");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, "renderer", "index.html"));

  /* The capture has to follow the window, or the desktop behind the glass is a
     picture of somewhere else. */
  win.on("move", () => send("moved"));
  win.on("resize", () => send("moved"));
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

/**
 * A picture of the screen, at the screen's own scale.
 *
 * Taken whole and cropped in the renderer rather than here, because the window
 * moves between the capture and the paint and cropping to a stale rectangle is
 * how the glass ends up showing the desktop from a second ago, half a window
 * to the left.
 */
ipcMain.handle("desktop", async () => {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { width, height } = display.size;
  const scale = display.scaleFactor || 1;
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: Math.round(width * scale), height: Math.round(height * scale) },
    fetchWindowIcons: false,
  });
  const source = sources.find((s) => String(s.display_id) === String(display.id)) || sources[0];
  if (!source) return null;
  return {
    image: source.thumbnail.toDataURL(),
    display: { x: display.bounds.x, y: display.bounds.y, width, height, scale },
  };
});

/** Where the window is, so the renderer knows which part of the screen it is over. */
ipcMain.handle("where", () => {
  if (!win || win.isDestroyed()) return null;
  const b = win.getBounds();
  return { x: b.x, y: b.y, width: b.width, height: b.height };
});

/**
 * The morph.
 *
 * The frame is animated in steps rather than set once, so it reads as one
 * thing changing shape rather than as two windows swapping over. The renderer
 * regenerates its displacement map for the new size when it lands — a map
 * drawn for 320x64 bends the wrong pixels at 393x852 and puts the rim through
 * the middle of the screen.
 */
ipcMain.handle("shape", async (_event, next) => {
  if (!win || win.isDestroyed() || !SHAPES[next] || next === shape) return shape;
  const from = win.getBounds();
  const to = SHAPES[next];
  /* Grown from the same centre, so it opens where he pointed at it. */
  const cx = from.x + from.width / 2;
  const cy = from.y + from.height / 2;
  const target = {
    x: Math.round(cx - to.width / 2),
    y: Math.round(cy - to.height / 2),
    width: to.width,
    height: to.height,
  };

  const steps = 18;
  for (let i = 1; i <= steps; i++) {
    /* The same easing as the design's fold: quick out, settling in. */
    const t = i / steps;
    const e = 1 - Math.pow(1 - t, 3);
    win.setBounds({
      x: Math.round(from.x + (target.x - from.x) * e),
      y: Math.round(from.y + (target.y - from.y) * e),
      width: Math.round(from.width + (target.width - from.width) * e),
      height: Math.round(from.height + (target.height - from.height) * e),
    });
    await new Promise((go) => setTimeout(go, 12));
  }
  shape = next;
  send("shape", shape);
  return shape;
});

/*
 * Sign in — the one flow that has to work before anything else exists.
 *
 * The marketplace's own page is put inside the phone, below the glass chrome,
 * and he types into it. It is his session, in a named partition that no
 * rebuild touches, and the two dead buttons are gone from the sheet before he
 * ever sees it.
 */
ipcMain.handle("signin", async (_event, id) => {
  const shop = shopFor(id);
  if (!shop || !win) return { ok: false, why: "no such shop" };
  const b = win.getBounds();
  /* Inset so the glass rim and the ✕ stay visible around it — the page is
     inside plug, not the other way round. */
  shop.show({ x: 10, y: 74, width: b.width - 20, height: b.height - 96 });
  await shop.go(shop.spec.signin);
  return { ok: true };
});

/** Back to plug's own screen; the page stays signed in behind it. */
ipcMain.handle("close-shop", (_event, id) => {
  const shop = shops.get(id);
  if (shop) shop.hide();
  return { ok: true };
});

/**
 * One pass: is he in, and what is on the shelf.
 *
 * Every failure comes back as a sentence rather than as silence, and a shop
 * that cannot be read never reports an empty shelf — unknown stays unknown.
 */
ipcMain.handle("pass", async () => {
  const out = [];
  for (const id of Object.keys(SITES)) {
    const shop = shopFor(id);
    const row = { id, name: SITES[id].name, signedIn: null, trouble: null };
    try {
      const url = shop.view.webContents.getURL();
      if (!url || url === "about:blank") await shop.go(SITES[id].home);
      const status = await shop.accountStatus();
      if (typeof status.signedIn !== "boolean") {
        row.trouble = `${SITES[id].name} did not answer`;
      } else {
        row.signedIn = status.signedIn;
        if (!status.signedIn) row.trouble = `not signed into ${SITES[id].name}`;
      }
    } catch (error) {
      row.trouble = `${SITES[id].name}: ${error?.message ?? "something went wrong"}`;
    }
    out.push(row);
  }
  return out;
});

ipcMain.handle("open-external", (_event, url) => {
  if (typeof url === "string" && /^https:\/\//.test(url)) shell.openExternal(url);
});

app.whenReady().then(() => {
  create();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) create();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

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
    /*
     * The first click ACTS, rather than only focusing the window.
     *
     * This floats over everything and never takes focus on its own, so macOS
     * treats the first click on it as "activate me" and swallows it. He
     * pressed Sign in with email, the window came forward, and nothing
     * happened — which reads exactly like a dead button. The headless test
     * could never catch it, because there is no window server there to eat
     * the click.
     */
    acceptFirstMouse: true,
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
/*
 * Small, and as JPEG.
 *
 * This used to grab the whole screen at its full backing scale and hand back a
 * PNG data url — on a Retina MacBook that is a 6000-pixel-wide image, encoded,
 * base64'd, sent over IPC and decoded, every 1.2 seconds. It made his Mac
 * crawl, and it was entirely my doing.
 *
 * The capture only ever ends up behind refracting glass, where it is bent and
 * never read, so its resolution is almost free to give away: a 1280-wide JPEG
 * is perhaps a fortieth of the bytes and indistinguishable once the filter has
 * finished with it.
 */
/* 900, for a 2020 Air on integrated graphics. The capture only ever ends up
   behind refracting glass where it is bent past recognition, so its resolution
   is the cheapest thing in the app to give away — and on this machine every
   megabyte of it was being felt. */
const CAPTURE_WIDTH = 900;
let lastGrab = { at: 0, payload: null, key: "" };

ipcMain.handle("desktop", async () => {
  /* Nothing is captured for a window nobody can see. Minimised, hidden behind
     something, or on another Space — the cost is the same and the picture is
     never looked at. */
  if (!win || win.isDestroyed() || !win.isVisible()) return lastGrab.payload;
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { width, height } = display.size;
  const shrunk = Math.min(CAPTURE_WIDTH, width);

  /* One capture is reused while nothing has moved. The renderer asks whenever
     it likes; this decides whether the screen actually needs reading again. */
  const key = `${display.id}:${shrunk}`;
  if (lastGrab.payload && lastGrab.key === key && Date.now() - lastGrab.at < 900) {
    return lastGrab.payload;
  }

  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: shrunk, height: Math.round((shrunk / width) * height) },
    fetchWindowIcons: false,
  });
  const source = sources.find((s) => String(s.display_id) === String(display.id)) || sources[0];
  if (!source) return null;
  const payload = {
    /* JPEG at 70: the glass bends this beyond recognition anyway, and it is a
       fraction of the encode cost of a PNG that size. */
    image: `data:image/jpeg;base64,${source.thumbnail.toJPEG(58).toString("base64")}`,
    display: { x: display.bounds.x, y: display.bounds.y, width, height, scale: 1 },
  };
  lastGrab = { at: Date.now(), payload, key };
  return payload;
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
/*
 * The morph, in ONE move.
 *
 * This used to step the window's bounds eighteen times with a sleep between
 * each, which is expensive for a transparent window, retriggered a screen
 * capture on every step, and is why the fold looked broken rather than liquid.
 *
 * The window is now set to its new size once and the SHAPE is animated inside
 * it, in CSS, by the renderer — which is free, runs on the compositor, and is
 * the only way the glass can actually flow rather than jump.
 */
ipcMain.handle("shape", async (_event, next) => {
  if (!win || win.isDestroyed() || !SHAPES[next] || next === shape) return shape;
  const from = win.getBounds();
  const to = SHAPES[next];
  /* Grown from the same centre, so it opens where he pointed at it. */
  const cx = from.x + from.width / 2;
  const cy = from.y + from.height / 2;
  win.setBounds({
    x: Math.round(cx - to.width / 2),
    y: Math.round(cy - to.height / 2),
    width: to.width,
    height: to.height,
  });
  shape = next;
  send("shape", shape);
  return shape;
});

/*
 * Sign in — the one flow everything else waits on.
 *
 * The marketplace's own page goes inside the phone, below the glass chrome,
 * and he types into it. It is his session, in a named partition no rebuild
 * touches, and the two buttons that cannot work are gone from the sheet
 * before he ever sees it.
 */
ipcMain.handle("signin", async (_event, id) => {
  const shop = shopFor(id);
  if (!shop || !win) return { ok: false, why: "no such shop" };
  for (const [other, view] of shops) if (other !== id) view.hide();
  const b = win.getBounds();
  /* Inset, so the rim and the ✕ stay visible around it — the page is inside
     plug rather than the other way round. */
  shop.show({ x: 10, y: 74, width: b.width - 20, height: b.height - 96 });
  await shop.go(shop.spec.signin);
  return { ok: true };
});

/**
 * Open a marketplace's own page inside the phone.
 *
 * Signed in is not the end of it — he still wants to SEE the shop: his
 * messages, his offers, his payouts. Before this, a shop that answered "signed
 * in" became a green dot and nothing else, and pressing it did nothing at all,
 * which is exactly what he reported about Vestiaire. Same view, same session,
 * same partition as the sign-in; only the starting page differs.
 */
ipcMain.handle("open-shop", async (_event, id, where) => {
  const shop = shopFor(id);
  if (!shop || !win) return { ok: false, why: "no such shop" };
  /* One shop on screen at a time, or the second draws over the first and the
     one underneath keeps taking the clicks. */
  for (const [other, view] of shops) if (other !== id) view.hide();
  const b = win.getBounds();
  shop.show({ x: 10, y: 74, width: b.width - 20, height: b.height - 96 });
  const url = where === "signin" ? shop.spec.signin : shop.spec.home;
  await shop.go(url);
  return { ok: true };
});

/** Back to plug's own screen; the page stays signed in behind it. */
ipcMain.handle("close-shop", (_event, id) => {
  const shop = shops.get(id);
  if (shop) shop.hide();
  return { ok: true };
});

/**
 * One pass: is he in, and what does each shop say.
 *
 * Every failure comes back as a sentence rather than as silence, and a shop
 * that cannot be read is never reported as empty — unknown stays unknown,
 * because a shut door and a quiet day look identical from here.
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

/* Which build he is actually running — never a guess. A Mac app that installs
   a worker beside itself can run a version from weeks ago while every fix
   looks like it was never made, so the number is on screen. */
ipcMain.handle("build", () => app.getVersion());

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

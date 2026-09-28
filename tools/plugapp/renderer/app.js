/**
 * What the window does.
 *
 * Small on purpose: it paints the desktop behind the glass, swaps between the
 * two shapes, and shows what the worker tells it. It decides nothing about the
 * shops — that lives in the worker, so the screen and the marketplaces can
 * never disagree about who is signed in.
 */
import { installFilters, SHAPES } from "./glass.js";
import { cycle, targetForDay } from "../worker/schedule.mjs";

const $ = (id) => document.getElementById(id);

let shape = "pill";
/* Which shop's own page is on screen, if any. While one is, plug's chrome
   stays but its content is behind it — he is signing in, not browsing. */
let signingIn = null;
let state = { build: "", shops: {}, doing: "starting…", site: "depop" };

/*
 * The desktop, drawn behind the glass and kept aligned.
 *
 * The capture is the whole screen; the window then slides it so the pixel
 * under the window is the pixel on screen. Cropping in the main process
 * instead would freeze a rectangle that is already stale by the time it is
 * painted — the glass would show the desktop from a moment ago, offset by
 * however far the window had moved.
 */
/*
 * The type reads on ANY desktop.
 *
 * The design's ink is a dark navy, which is right over a pale wallpaper and
 * invisible over a dark one — he saw it as "light blue, and not working on
 * every surface", which is exactly what dark type on a dark desktop looks like
 * through clear glass.
 *
 * So the ink follows what is actually behind the window: the capture is drawn
 * into a tiny canvas, its average brightness measured, and the whole screen
 * switches between dark ink and light. Cheap — a 24-pixel-wide draw, once per
 * capture — and it is the only way type on genuinely clear glass can work.
 */
let inkIsLight = null;
/*
 * Measured UNDER THE WINDOW, not across the whole screen.
 *
 * Averaging the entire desktop is how the type ended up black on a dark patch:
 * a pale wallpaper with the window sitting over a dark terminal reads "light
 * background" and picks dark ink, which is invisible exactly where the ink is.
 * Only the rectangle the glass covers decides.
 */
function inkFor(dataUrl, where, display) {
  const img = new Image();
  img.onload = () => {
    const c = document.createElement("canvas");
    c.width = 24; c.height = 24;
    const x = c.getContext("2d", { willReadFrequently: true });
    const sx = img.width / display.width;
    const sy = img.height / display.height;
    x.drawImage(
      img,
      Math.max(0, (where.x - display.x) * sx), Math.max(0, (where.y - display.y) * sy),
      Math.max(1, where.width * sx), Math.max(1, where.height * sy),
      0, 0, 24, 24
    );
    const { data } = x.getImageData(0, 0, 24, 24);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      /* Perceived brightness, not the average of the channels: green carries
         most of what the eye reads as light. */
      sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    }
    const light = sum / (data.length / 4) < 128;
    if (light === inkIsLight) return;
    inkIsLight = light;
    document.body.classList.toggle("on-dark", light);
  };
  img.src = dataUrl;
}

let grabbing = false;
async function paintDesktop() {
  if (!window.plug || grabbing) return;
  /* One at a time. Two captures in flight means two full-screen encodes racing
     each other, and the second one is always the one that is thrown away. */
  grabbing = true;
  try { await grab(); } finally { grabbing = false; }
}

async function grab() {
  const [grab, where] = await Promise.all([window.plug.desktop(), window.plug.where()]);
  if (!grab || !where) return;
  known = grab;
  const img = $("desk");
  const { display } = grab;
  img.src = grab.image;
  inkFor(grab.image, where, display);
  /* The capture is at the display's backing scale; the page is in points. */
  const k = 1 / (display.scale || 1);
  img.style.width = `${display.width}px`;
  img.style.height = `${display.height}px`;
  img.style.left = `${-(where.x - display.x)}px`;
  img.style.top = `${-(where.y - display.y)}px`;
  img.style.transform = `scale(${1})`;
  void k;
}

/* Re-grab while it moves, and slowly while it sits — the desktop behind it
   changes on its own, and a frozen picture reads as a photograph rather than
   as glass. */
/*
 * Moving the window transforms the glass immediately.
 *
 * The screen behind it has not changed while he drags — only where the glass
 * is over it. So the picture already in hand is simply re-offset, which is a
 * style write and costs nothing, and the refraction flows under the glass as
 * he carries it. That IS the transformation he was looking for, and waiting
 * 60ms for a fresh capture is what made it feel dead.
 *
 * A real capture follows, lazily, for whatever actually changed on screen.
 */
let known = null;
let pending = null;
function refreshSoon() {
  place();
  clearTimeout(pending);
  pending = setTimeout(paintDesktop, 400);
}

/** Put the picture where the window is now, using what we already have. */
async function place() {
  if (!known || !window.plug) return;
  const where = await window.plug.where();
  if (!where) return;
  const img = $("desk");
  img.style.left = `${-(where.x - known.display.x)}px`;
  img.style.top = `${-(where.y - known.display.y)}px`;
}

async function morph(next) {
  if (next === shape || !window.plug) return;
  const was = shape;
  shape = next;

  /*
   * The window is resized once; the SHAPE flows into place in CSS.
   *
   * Stepping the window's bounds eighteen times was expensive, retriggered a
   * screen capture on every step, and is why the fold read as a jump. The
   * transition on .glass does the fold now — it runs on the compositor and
   * costs nothing.
   */
  /* Collapse what is on screen, change the shape underneath it, then let it
     rise into the new one. Two short beats rather than one jump — that is the
     whole transformation, and it costs nothing because it ends. */
  document.body.classList.add("folding");
  await new Promise((go) => setTimeout(go, 150));
  await window.plug.shape(next);
  document.body.classList.remove(`shape-${was}`);
  document.body.classList.add(`shape-${next}`);
  $("pill").hidden = next !== "pill";
  $("phone").hidden = next !== "phone";
  requestAnimationFrame(() => document.body.classList.remove("folding"));
  /* A map drawn for one size bends the wrong pixels at another, so it is
     rebuilt whenever the window's size changes. */
  installFilters(document);
  paintDesktop();
}

function slot(site) {
  const shop = state.shops[site] || {};
  const box = $(`slot-${site}`);
  if (!box) return;
  const name = site === "vestiaire" ? "Vestiaire" : "Depop";

  /*
   * Signed in is a DOOR, not a badge.
   *
   * This used to print a green dot and stop there — so a shop that was
   * connected was the one thing on the screen he could not press. He said it
   * plainly about Vestiaire: signed in, clicked it, nothing happened. Right
   * every time. Now it opens the shop's own page inside the phone, in the same
   * session, so he can read his messages and his payouts without leaving.
   */
  const open = document.createElement("button");
  open.className = "tap";
  if (shop.signedIn === true) {
    open.innerHTML = `<span class="dot"></span>Open ${name}`;
    open.onclick = () => openSite(site);
  } else if (shop.signedIn === false) {
    open.textContent = "Sign in with email";
    open.onclick = () => openSite(site, "signin");
  } else {
    /* Unknown is never drawn as signed out — it offers the way in without
       claiming his shop is empty. */
    open.textContent = `Open ${name}`;
    open.onclick = () => openSite(site);
  }
  box.innerHTML = "";
  box.appendChild(open);
}

/** Put a marketplace on screen, and remember which one is up. */
function openSite(site, where) {
  if (!window.plug) return;
  state.site = site;
  state.doing = `opening ${site}…`;
  /*
   * Marked as open BEFORE the page loads, not after.
   *
   * Loading Depop takes seconds on his Mac, and until this was set the ✕ still
   * meant "fold the whole app away" — so pressing it during the wait shrank the
   * window to the pill with a phone-sized page pinned over it, covering
   * everything. The shop is open the moment it is asked for.
   */
  signingIn = site;
  paint();
  window.plug.openShop(site, where).then(() => {
    state.doing = `${site} is open`;
    paint();
  }).catch(() => {
    signingIn = null;
    state.doing = `could not open ${site}`;
    paint();
  });
}

/*
 * The day, drawn as a ring.
 *
 * The arc is how far through today's target he is; the seven dots are the
 * golden-ratio week with today filled. Deliberately not a progress bar — a bar
 * says "loading" and this is meant to say "growing", which is the thing he
 * actually asked for.
 */
function paintDay() {
  const box = $("working");
  const both = (state.shops.depop || {}).signedIn === true
    && (state.shops.vestiaire || {}).signedIn === true;
  box.hidden = !both;
  if (!both) return;

  const day = Number(state.day || 1);
  const target = Number(state.target ?? targetForDay(day));
  const done = Number(state.doneToday || 0);
  $("done").textContent = String(done);
  $("target").textContent = String(target);

  const arc = $("arc");
  const circumference = 2 * Math.PI * 52;
  const share = target > 0 ? Math.min(1, done / target) : 0;
  arc.style.strokeDasharray = String(circumference);
  arc.style.strokeDashoffset = String(circumference * (1 - share));

  $("cyc").innerHTML = cycle()
    .map((n, i) => `<span data-today="${i + 1 === day}">${n}</span>`)
    .join("");

  const held = $("held");
  held.hidden = !state.held;
  held.textContent = state.held ? `held: ${state.held}` : "";

  /* The last few things it did, each saying which shop it happened on. */
  $("feed").innerHTML = (state.feed || []).slice(0, 4).map((row) => {
    const site = row.site === "vestiaire" ? "vestiaire" : "depop";
    const label = site === "vestiaire" ? "V" : "d";
    return `<div class="row"><span class="tag ${site}">${label}</span>`
      + `<span>${String(row.line ?? "").replace(/[<&]/g, "")}</span></div>`;
  }).join("");
}

function paint() {
  $("pill-doing").textContent = state.doing || "minding the shops";
  /* The ring is lit while there is something to do and dim otherwise. It does
     not spin: see the note in index.html — a continuous animation over the
     glass costs a core on his Mac. */
  $("pill-ring").dataset.working = String(Boolean(state.doing));
  $("build").textContent = state.build ? `build ${state.build}` : "build —";
  for (const tab of document.querySelectorAll(".seg > div")) {
    tab.setAttribute("aria-selected", tab.dataset.site === state.site ? "true" : "false");
  }
  slot("depop");
  slot("vestiaire");
  const both = (state.shops.depop || {}).signedIn === true
    && (state.shops.vestiaire || {}).signedIn === true;
  $("head").textContent = both ? "both shops are connected" : "connect your shops";
  $("lede").textContent = both
    ? "plug is hunting, listing and answering on both. Fold it away — it keeps working."
    : "Sign in once. plug lists, answers, negotiates and sells on its own from then on.";
  /* The cards stay. Once both shops are in they stop being sign-ins and
     become the way into each shop — hiding them left him connected to two
     marketplaces with no way to reach either. */
  document.querySelector(".shops").hidden = false;
  paintDay();
}

/* The pill opens; the ✕ folds it back. Nothing else on the glass is a button,
   which is how it stays an object rather than a control panel. */
$("pill").onclick = () => morph("phone");
$("fold").onclick = (e) => {
  e.stopPropagation();
  /* While a marketplace page is up, the ✕ closes THAT rather than folding the
     whole app away — otherwise the only way out of a sign-in is to quit. */
  if (signingIn && window.plug) {
    window.plug.closeShop(signingIn).then(() => { signingIn = null; runPass(); });
    return;
  }
  morph("pill");
};

/*
 * Ask both shops how they stand.
 *
 * Nothing here decides anything: the answer is whatever the pages actually
 * say, and a shop that cannot be read stays unknown rather than being called
 * signed out. A shut door and a quiet day look identical, and calling one the
 * other is the worst lie this app can tell him.
 */
async function runPass() {
  if (!window.plug) return;
  const rows = await window.plug.pass().catch(() => []);
  const shops = {};
  let trouble = null;
  for (const row of rows) {
    shops[row.id] = { signedIn: row.signedIn, who: null };
    if (row.trouble && !trouble) trouble = row.trouble;
  }
  state.shops = shops;
  state.doing = trouble || state.doing;
  paint();
}
$("plus").onclick = (e) => {
  e.stopPropagation();
  window.dispatchEvent(new CustomEvent("plug:list-item"));
};
/*
 * The two tabs SWITCH THE SHOP, they do not just highlight themselves.
 *
 * Before this they set a variable nothing else read: he pressed Depop, he
 * pressed Vestiaire, the underline moved and not one other thing on the Mac
 * changed. That is the definition of the complaint he made — a pretty window
 * instead of a working one. Pressing a tab now brings that marketplace up.
 */
for (const tab of document.querySelectorAll(".seg > div")) {
  tab.onclick = () => openSite(tab.dataset.site);
}

window.__plug = {
  set(next) {
    Object.assign(state, next);
    paint();
  },
};

installFilters(document);
paint();
if (window.plug) {
  window.plug.build().then((v) => { state.build = v; paint(); }).catch(() => {});
  window.plug.onMoved(refreshSoon);
  paintDesktop();
  /*
   * Every few seconds, not every 1.2.
   *
   * The desktop behind it does change on its own, so it cannot be captured
   * once and forgotten — but a capture is the single most expensive thing this
   * app does and at 1.2 seconds it was most of what his Mac was doing. Moving
   * the window still refreshes immediately, which is when a stale picture is
   * actually visible.
   */
  /* Eight seconds. The desktop does change on its own, but on this machine a
     capture is the most expensive thing the app does and the glass is showing
     a blurred, bent version of it — a few seconds stale is invisible. Moving
     the window still refreshes at once, which is when staleness would show. */
  setInterval(paintDesktop, 8000);
  /* Not on a greeting: a greeting is a page load and a pass begins with a
     navigation, so starting work on one is a loop that reloads forever. */
  runPass();
  setInterval(runPass, 30_000);
}

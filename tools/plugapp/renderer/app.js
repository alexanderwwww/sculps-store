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
  const img = $("desk");
  const { display } = grab;
  img.src = grab.image;
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
let pending = null;
function refreshSoon() {
  clearTimeout(pending);
  pending = setTimeout(paintDesktop, 60);
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
  await window.plug.shape(next);
  document.body.classList.remove(`shape-${was}`);
  document.body.classList.add(`shape-${next}`);
  $("pill").hidden = next !== "pill";
  $("phone").hidden = next !== "phone";
  /* A map drawn for one size bends the wrong pixels at another, so it is
     rebuilt whenever the window's size changes. */
  installFilters(document);
  paintDesktop();
}

function slot(site) {
  const shop = state.shops[site] || {};
  const box = $(`slot-${site}`);
  if (!box) return;
  if (shop.signedIn === true) {
    box.innerHTML = `<span class="live"><span class="dot"></span>${
      String(shop.who ?? "signed in").replace(/[<&]/g, "")}</span>`;
    return;
  }
  box.innerHTML = `<button class="tap">Sign in with email</button>`;
  box.firstChild.onclick = () => {
    state.doing = `opening ${site}…`;
    paint();
    /* The main process puts that marketplace's own page inside the phone. The
       screen never navigates anything itself — one way in, and it is the
       bridge. */
    if (window.plug) window.plug.signin(site).then(() => { signingIn = site; paint(); });
  };
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
  /* Once both shops are in, the cards have done their job and the day takes
     the screen. Leaving them up would be asking for something already given. */
  document.querySelector(".shops").hidden = both;
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
for (const tab of document.querySelectorAll(".seg > div")) {
  tab.onclick = () => { state.site = tab.dataset.site; paint(); };
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

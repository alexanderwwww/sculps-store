/**
 * The injected agent, in a real engine.
 *
 * There is no Mac here, so this is the proof: the local Chromium, an
 * iPhone-shaped context, a stub feed served by a route handler (the sandbox has
 * no network), and the built bundle injected at document start exactly the way
 * WKUserScript will inject it. What is being proven: the bezel draws and does
 * not swallow clicks, the cursor glides rather than jumps and presses, a tap
 * flips a real Like button, typing lands in the field AND fires the events
 * React listens for, scrolling happens in steps, the panel opens and asks
 * rather than acts, the readers find posts and handles, the Instagram recipe
 * finds by aria-label and returns null when there is nothing to find, the
 * bridge answers every act with a matching {t:"done"}, and injecting the whole
 * bundle twice changes nothing.
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const BUNDLE = readFileSync(join(here, "..", "worker", "agent.built.js"), "utf8");
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

let bad = 0;
const ok = (name, good, extra = "") => {
  console.log(`${good ? "  ok  " : "FAIL  "}${name}${extra ? " — " + extra : ""}`);
  if (!good) bad++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const POSTS = Array.from({ length: 6 }, (_, i) => `
  <article>
    <header><a href="/@creator${i}">@creator${i}</a></header>
    <div class="media" style="height:420px;background:#222"></div>
    <div><button aria-label="Like">heart</button>
         <button aria-label="Comment">bubble</button></div>
    <span>${(i + 1) * 137} likes</span>
    <span>${(i + 1) * 4021} views</span>
    <p>a caption about the thing number ${i} #organic #reels${i}</p>
  </article>`).join("");

const FEED = `<!doctype html><html><head><meta charset="utf-8"><title>feed</title>
<style>body{margin:0;font:15px system-ui}article{padding:12px;border-bottom:1px solid #333;background:#111;color:#eee}</style>
</head><body>
<nav><a href="/direct/inbox/" aria-label="Home">home</a><a href="/beacrew/" aria-label="Profile">me</a></nav>
<main>${POSTS}</main>
<label for="c">Comment</label>
<input id="c" aria-label="Add a comment" placeholder="Add a comment...">
<div id="probe" style="position:fixed;top:300px;left:150px;width:90px;height:40px;background:#444;color:#fff">probe</div>
<script>
  window.__inputEvents = 0;
  window.__probeClicks = 0;
  document.getElementById('c').addEventListener('input', function(){ window.__inputEvents++; });
  document.getElementById('probe').addEventListener('click', function(){ window.__probeClicks++; });
  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('button[aria-label]');
    if (!b) return;
    var l = b.getAttribute('aria-label');
    if (l === 'Like') b.setAttribute('aria-label','Unlike');
    else if (l === 'Unlike') b.setAttribute('aria-label','Like');
  });
</script></body></html>`;

const LOGIN = `<!doctype html><html><head><meta charset="utf-8"><title>login</title></head><body>
<form><input name="username" aria-label="Username"><input name="password" type="password" aria-label="Password">
<button>Log In</button></form></body></html>`;

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });

  await context.route("**/*", (route) => {
    const u = new URL(route.request().url());
    const body = u.pathname.startsWith("/accounts/login") ? LOGIN : FEED;
    return route.fulfill({ contentType: "text/html", body });
  });

  // exactly how WKUserScript injects it: at document start, every navigation
  await context.addInitScript({ content: "window.__BUNDLE__ = " + JSON.stringify(BUNDLE) + ";" });
  await context.addInitScript({ content: BUNDLE });

  const page = await context.newPage();
  // catch the messages the agent would post to Swift
  await page.goto("https://www.instagram.com/");
  await page.waitForFunction(() => window.__organic && window.__organic.__booted);

  // ---- bezel ------------------------------------------------------------
  const bezel = await page.evaluate(() => {
    const el = document.getElementById("__organic_bezel");
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      fixed: cs.position === "fixed",
      none: cs.pointerEvents === "none",
      z: parseInt(cs.zIndex, 10),
      island: !!el.querySelector(".island"),
      home: !!el.querySelector(".home"),
      frame: !!el.querySelector(".frame"),
    };
  });
  ok("bezel draws (frame, island, home bar)", !!bezel && bezel.frame && bezel.island && bezel.home);
  ok("bezel is fixed, pointer-events none, top of stack", !!bezel && bezel.fixed && bezel.none && bezel.z > 2000000000);

  await page.mouse.click(195, 320);
  const probeClicks = await page.evaluate(() => window.__probeClicks);
  ok("bezel does not block clicks", probeClicks === 1, "probe clicks=" + probeClicks);

  // survives the page rewriting its DOM
  await page.evaluate(() => document.getElementById("__organic_bezel").remove());
  await page.evaluate(() => document.body.appendChild(document.createElement("div")));
  await sleep(1400);
  await page.evaluate(() => document.body.appendChild(document.createElement("div")));
  await page.waitForFunction(() => !!document.getElementById("__organic_bezel"), null, { timeout: 5000 }).catch(() => {});
  ok("bezel re-attaches after the page removes it", await page.evaluate(() => !!document.getElementById("__organic_bezel")));

  // ---- cursor -----------------------------------------------------------
  const cursorOk = await page.evaluate(() => {
    const el = document.getElementById("__organic_cursor");
    if (!el) return null;
    const cs = getComputedStyle(el);
    const dot = el.querySelector(".dot");
    return {
      none: cs.pointerEvents === "none",
      z: parseInt(cs.zIndex, 10),
      green: getComputedStyle(dot).backgroundColor,
      label: el.querySelector(".name").textContent,
      ring: !!el.querySelector(".ring"),
    };
  });
  ok("cursor exists, green, named, with a pulsing ring",
    !!cursorOk && cursorOk.green === "rgb(57, 255, 122)" && cursorOk.label === "Bea" && cursorOk.ring,
    cursorOk ? cursorOk.green + " / " + cursorOk.label : "missing");
  ok("cursor is pointer-events none at max z", !!cursorOk && cursorOk.none && cursorOk.z === 2147483647);

  const path = await page.evaluate(async () => {
    const el = document.getElementById("__organic_cursor");
    const seen = [];
    const t = setInterval(() => seen.push(el.style.transform), 8);
    await window.__organic.cursor.moveTo(40, 120, { ms: 120 });
    await window.__organic.cursor.moveTo(330, 700, { ms: 700 });
    clearInterval(t);
    return Array.from(new Set(seen.filter(Boolean)));
  });
  ok("cursor glides: >10 distinct intermediate positions", path.length > 10, path.length + " positions");
  const straight = (() => {
    // a straight line would put every sample on the same gradient
    const pts = path.map((s) => (s.match(/translate3d\(([-\d.]+)px, ?([-\d.]+)px/) || []).slice(1).map(Number)).filter((p) => p.length === 2);
    if (pts.length < 6) return true;
    const a = pts[0], b = pts[pts.length - 1];
    let maxDev = 0;
    for (const p of pts) {
      const num = Math.abs((b[1] - a[1]) * p[0] - (b[0] - a[0]) * p[1] + b[0] * a[1] - b[1] * a[0]);
      const den = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      maxDev = Math.max(maxDev, num / den);
    }
    return maxDev < 2;
  })();
  ok("cursor path is curved, not a straight line", !straight);

  const pressed = await page.evaluate(async () => {
    await window.__organic.cursor.press();
    return !!document.querySelector("#__organic_cursor .ripple");
  });
  ok("cursor press() plays a ripple", pressed);

  // ---- hands: tap -------------------------------------------------------
  const tap = await page.evaluate(async () => {
    const btn = window.__organic.sites.instagram.likeButton(document.querySelector("article"));
    const before = btn.getAttribute("aria-label");
    const res = await window.__organic.hands.tapEl(btn);
    return { before, after: btn.getAttribute("aria-label"), res };
  });
  ok("tapEl flips Like to Unlike", tap.before === "Like" && tap.after === "Unlike", tap.before + " -> " + tap.after);
  ok("tapEl reports the element is still there and changed", tap.res.stillThere === true && tap.res.changed === true);

  // ---- hands: type ------------------------------------------------------
  const typed = await page.evaluate(async () => {
    window.__inputEvents = 0;
    const r = await window.__organic.hands.type("love this", {
      into: "#c",
      delays: [20, 18, 25, 20, 22, 19, 24, 20, 21],
      typos: [{ at: 4, ch: "x", pause: 40 }],
    });
    return { value: document.querySelector("#c").value, events: window.__inputEvents, r };
  });
  ok("type puts the text in the field", typed.value === "love this", JSON.stringify(typed.value));
  ok("type fires React-style input events per character", typed.events >= 10, typed.events + " input events");

  // ---- hands: scroll ----------------------------------------------------
  const scrolled = await page.evaluate(async () => {
    window.scrollTo(0, 0);
    const seen = new Set();
    const t = setInterval(() => seen.add(Math.round(window.scrollY)), 10);
    const r = await window.__organic.hands.scroll(700, { pace: "easy" });
    clearInterval(t);
    return { y: Math.round(window.scrollY), distinct: seen.size, steps: r.steps };
  });
  ok("scroll moves the page", scrolled.y > 500, "scrollY=" + scrolled.y);
  ok("scroll happens in several steps, not one jump", scrolled.distinct > 5 && scrolled.steps > 5,
    scrolled.distinct + " samples / " + scrolled.steps + " steps");

  // ---- panel ------------------------------------------------------------
  const panel = await page.evaluate(() => {
    window.__organic.ns.send({ t: "noop" }); // ensure the outbox exists
    window.__organic.sent = [];
    window.__organic.panel.set({
      accounts: [
        { platform: "instagram", label: "Instagram", handle: "beacrew", on: true },
        { platform: "tiktok", label: "TikTok", handle: null, on: false },
        { platform: "youtube", label: "YouTube", handle: null, on: false },
      ],
      now: "Bea is liking reels",
      ticks: ["Bea: liked @creator2"],
    });
    window.__organic.panel.open();
    const el = document.getElementById("__organic_panel");
    const rows = Array.from(el.querySelectorAll("[data-organic-platform]")).map((r) =>
      r.getAttribute("data-organic-platform"),
    );
    const text = el.innerText;
    return { open: el.classList.contains("on"), rows, hasNow: text.includes("liking reels"), hasStop: text.includes("Stop") };
  });
  ok("panel opens", panel.open);
  ok("panel lists the three platforms", panel.rows.join(",") === "instagram,tiktok,youtube", panel.rows.join(","));
  ok("panel shows what the crew is doing and a Stop", panel.hasNow && panel.hasStop);

  const asked = await page.evaluate(() => {
    window.__organic.sent = [];
    document.querySelector('[data-organic-platform="tiktok"]').click();
    return window.__organic.sent;
  });
  ok("pressing a platform sends {t:'asked', what:'connect'}",
    asked.length === 1 && asked[0].t === "asked" && asked[0].what === "connect" && asked[0].platform === "tiktok",
    JSON.stringify(asked));

  const closed = await page.evaluate(() => {
    document.querySelector("#__organic_panel .scrim").click();
    return document.getElementById("__organic_panel").classList.contains("on");
  });
  ok("tapping outside closes the panel", closed === false);

  const winMsg = await page.evaluate(() => {
    window.__organic.panel.open();
    window.__organic.sent = [];
    document.querySelector('[data-organic-window="quit"]').click();
    const out = window.__organic.sent.slice();
    window.__organic.panel.close();
    return out;
  });
  ok("quit sends {t:'window', do:'quit'} straight through",
    winMsg.length === 1 && winMsg[0].t === "window" && winMsg[0].do === "quit", JSON.stringify(winMsg));

  // ---- read -------------------------------------------------------------
  const readOut = await page.evaluate(() => {
    const posts = window.__organic.read.posts();
    return {
      n: posts.length,
      handles: posts.map((p) => p.handle),
      likes: posts.map((p) => p.likes),
      views: posts.map((p) => p.views),
      caption: posts[0].caption,
      tags: window.__organic.read.tags().slice(0, 3),
      platform: window.__organic.read.platform(),
      signedIn: window.__organic.read.signedIn(),
      handle: window.__organic.read.handle(),
    };
  });
  ok("read.posts() finds the posts", readOut.n === 6, readOut.n + " posts");
  ok("read.posts() reads each handle", readOut.handles.join(",") === "creator0,creator1,creator2,creator3,creator4,creator5", readOut.handles.join(","));
  ok("read.posts() reads likes and views when visible", readOut.likes[0] === 137 && readOut.views[0] === 4021,
    readOut.likes[0] + " likes / " + readOut.views[0] + " views");
  ok("read.captionOf() finds the caption", /caption about the thing/.test(readOut.caption || ""), String(readOut.caption));
  ok("read.tags() finds the hashtags", readOut.tags.includes("#organic"), readOut.tags.join(" "));
  ok("read knows the platform and the signed-in handle",
    readOut.platform === "instagram" && readOut.signedIn === true && readOut.handle === "beacrew",
    readOut.platform + " / " + readOut.handle);

  // ---- the Instagram recipe --------------------------------------------
  const recipe = await page.evaluate(() => {
    const ig = window.__organic.sites.instagram;
    const art = document.querySelectorAll("article")[2];
    const like = ig.likeButton(art);
    return {
      found: !!like,
      byLabel: like ? like.getAttribute("aria-label") : null,
      noClass: like ? like.className === "" : false,
      box: !!ig.commentBox(),
      profile: ig.profileUrl(),
      login: ig.isLoginPage(),
    };
  });
  ok("instagram.likeButton() finds it by aria-label", recipe.found && recipe.byLabel === "Like");
  ok("instagram recipe uses no class names to find it", recipe.noClass);
  ok("instagram.commentBox() finds the comment field", recipe.box);
  ok("instagram.profileUrl() is built from the handle", recipe.profile === "https://www.instagram.com/beacrew/", String(recipe.profile));
  ok("instagram.isLoginPage() is false on a feed", recipe.login === false);

  const loginPage = await context.newPage();
  await loginPage.goto("https://www.instagram.com/accounts/login/");
  await loginPage.waitForFunction(() => window.__organic && window.__organic.__booted);
  const onLogin = await loginPage.evaluate(() => {
    const ig = window.__organic.sites.instagram;
    return {
      like: ig.likeButton(),
      login: ig.isLoginPage(),
      signedIn: ig.signedIn(),
      handle: ig.handle(),
    };
  });
  ok("instagram.likeButton() returns null with no like button", onLogin.like === null);
  ok("instagram.isLoginPage() is true on the login page, signedIn false",
    onLogin.login === true && onLogin.signedIn === false);
  ok("no handle on the login page (a connection with no handle is not one)", onLogin.handle === null);
  await loginPage.close();

  // ---- the bridge -------------------------------------------------------
  const bridge = await page.evaluate(async () => {
    window.__organic.sent = [];
    const say = (m) => window.__organic.fromApp(JSON.stringify(m));
    say({ t: "do", id: "a1", act: "dwell", ms: 30 });
    say({ t: "do", id: "a2", act: "read", what: "handle" });
    say({ t: "do", id: "a3", act: "say", who: "Bea", what: "liked one" });
    say({ t: "do", id: "a4", act: "panel", open: false });
    say({ t: "do", id: "a5", act: "cursor", x: 100, y: 200, ms: 120 });
    say({ t: "do", id: "a6", act: "wiggle" });
    say({ t: "do", id: "a7", act: "stop" });
    await new Promise((r) => setTimeout(r, 900));
    return window.__organic.sent.slice();
  });
  const dones = bridge.filter((m) => m.t === "done");
  const idsSeen = dones.map((m) => m.id).sort().join(",");
  ok("every act replies {t:'done'} with its own id", idsSeen === "a1,a2,a3,a4,a5,a6,a7", idsSeen);
  ok("known acts reply ok:true", dones.filter((m) => m.id !== "a6").every((m) => m.ok === true));
  const unknown = dones.find((m) => m.id === "a6");
  ok("an unknown act replies ok:false with a reason", !!unknown && unknown.ok === false && /unknown act/.test(unknown.error || ""), JSON.stringify(unknown));
  ok("read through the bridge returns the handle",
    (dones.find((m) => m.id === "a2") || {}).result?.handle === "beacrew");
  ok("say emits a ticker line", bridge.some((m) => m.t === "tick" && m.who === "Bea" && m.what === "liked one"));

  const helloMsg = await page.evaluate(() => {
    window.__organic.sent = [];
    window.__organic.hello();
    return window.__organic.sent[0];
  });
  ok("hello carries url, platform, signedIn and handle",
    helloMsg && helloMsg.t === "hello" && helloMsg.platform === "instagram" &&
    helloMsg.signedIn === true && helloMsg.handle === "beacrew" && /instagram\.com/.test(helloMsg.url),
    JSON.stringify(helloMsg));

  ok("postMessage wrapper does not throw without the Swift handler",
    await page.evaluate(() => { try { window.__organic.send({ t: "ping" }); return true; } catch (e) { return false; } }));

  // ---- idempotence ------------------------------------------------------
  const twice = await page.evaluate(() => {
    const before = {
      bezel: document.querySelectorAll("#__organic_bezel").length,
      cursor: document.querySelectorAll("#__organic_cursor").length,
      panel: document.querySelectorAll("#__organic_panel").length,
      booted: window.__organic.__booted,
    };
    // re-inject the whole bundle, exactly as a navigation would
    const src = document.createElement("script");
    src.textContent = window.__BUNDLE__;
    document.head.appendChild(src);
    return {
      before,
      after: {
        bezel: document.querySelectorAll("#__organic_bezel").length,
        cursor: document.querySelectorAll("#__organic_cursor").length,
        panel: document.querySelectorAll("#__organic_panel").length,
        booted: window.__organic.__booted,
      },
    };
  });
  ok("re-injecting the bundle duplicates nothing",
    twice.after.bezel === 1 && twice.after.cursor === 1 && twice.after.panel === 1 && twice.after.booted === true,
    JSON.stringify(twice.after));

  // and a real navigation re-runs it from scratch, still once
  await page.goto("https://www.instagram.com/explore/");
  await page.waitForFunction(() => window.__organic && window.__organic.__booted);
  const afterNav = await page.evaluate(() => ({
    bezel: document.querySelectorAll("#__organic_bezel").length,
    cursor: document.querySelectorAll("#__organic_cursor").length,
    panel: document.querySelectorAll("#__organic_panel").length,
  }));
  ok("after a navigation there is still exactly one of each",
    afterNav.bezel === 1 && afterNav.cursor === 1 && afterNav.panel === 1, JSON.stringify(afterNav));

  // an iframe gets the script too and must stay silent
  const inFrame = await page.evaluate(async () => {
    const f = document.createElement("iframe");
    f.style.cssText = "width:10px;height:10px";
    f.srcdoc = "<!doctype html><p>frame</p>";
    document.body.appendChild(f);
    await new Promise((r) => (f.onload = r));
    const s = f.contentDocument.createElement("script");
    s.textContent = window.__BUNDLE__;
    f.contentDocument.head.appendChild(s);
    return {
      hasOrganic: !!f.contentWindow.__organic,
      bezels: f.contentDocument.querySelectorAll("#__organic_bezel").length,
    };
  });
  ok("a subframe draws nothing and builds no __organic", inFrame.hasOrganic === false && inFrame.bezels === 0,
    JSON.stringify(inFrame));

  await browser.close();
  console.log(bad ? `\n${bad} failed` : "\nall ok");
  process.exit(bad ? 1 : 0);
}

main().catch((e) => {
  console.error("FAIL  suite threw —", e && e.stack ? e.stack : e);
  process.exit(1);
});

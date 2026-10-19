/*
 * The fake marketplace (fixtures/shop.mjs), driven by hand in a real Chromium the
 * way the agent will drive it: Chromium started on its own with a DevTools port and
 * reached with connectOverCDP (no viewport emulation), clicks and keys through
 * Playwright.
 *
 * Proves: the login redirect keeps ?next=, the form logs in and never stores the
 * password, /__test/login works; the cookie banner goes away for good; search;
 * the whole sell flow (empty submit -> inline errors without navigating; "Add
 * photos" opens a real file chooser; two real PNGs; native Category; the CUSTOM
 * Condition listbox by mouse and by keyboard; "$45" typed into Price becomes 45;
 * Save draft; Post listing -> /item/<id>/) and /__test/state holds 2 photos with
 * the right sha256; price edit -> stored with history; delete via the dialog;
 * sending in a thread by button and by Enter (Shift+Enter is a new line); the
 * captcha interstitial with its reCAPTCHA iframe, and the page coming back by
 * itself when the check is cleared; reset.
 *
 * It prints page.ariaSnapshot({mode:"ai"}) for /sell/ and /messages/t2/ once, and
 * checks that every target the e2e scripts need resolves with the stub's own
 * resolveRef in those real snapshots (so a script written against them works).
 *
 *   TMPDIR=/tmp node test/shop.test.mjs
 *   SHOP_SHOTS=<dir> also saves screenshots there, to be looked at.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { startShop } from "./fixtures/shop.mjs";
import { resolveRef } from "./stub-claude.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const PW = fs.existsSync("/home/user/sculps-store/node_modules/playwright-core")
  ? "/home/user/sculps-store/node_modules/playwright-core"
  : path.resolve(HERE, "../../../node_modules/playwright-core");
const { chromium } = require(PW);
const CHROME = process.env.ULTRA_TEST_CHROMIUM || "/opt/pw-browsers/chromium";
const SHOTS = process.env.SHOP_SHOTS || "";

const KILL = setTimeout(() => { console.log("FAIL  shop test timed out after 180 s"); process.exit(1); }, 180000);

let failed = 0, passed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`  ok  ${name}`); }
  else { failed++; console.log(`FAIL  ${name}${detail === undefined ? "" : `  -> ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 900)}`}`); }
  return Boolean(cond);
}
async function step(name, fn) {
  try { await fn(); } catch (e) { failed++; console.log(`FAIL  ${name} threw: ${String(e && e.stack || e).split("\n").slice(0, 4).join(" | ")}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms, every = 100) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = await fn(); if (v) return v; await sleep(every); }
  return null;
}

/** A small real PNG (RGB, a diagonal gradient) — what a phone photo is to the shop. */
function png(w, h, [r, g, b]) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3, k = (x + y) / (w + h);
      raw[o] = Math.round(r * (1 - k * 0.5)); raw[o + 1] = Math.round(g * (1 - k * 0.5)); raw[o + 2] = Math.round(b * (1 - k * 0.5));
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

async function startChromium(dir) {
  const proc = spawn(CHROME, [
    // A proxy in the environment (cloud containers) would get in the way of 127.0.0.1: always go direct.
    "--no-proxy-server",
    "--headless=new", "--no-sandbox", "--remote-debugging-port=0", `--user-data-dir=${dir}`,
    "--window-size=1280,860", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  const ws = await new Promise((resolve, reject) => {
    let err = "";
    const t = setTimeout(() => reject(new Error(`Chromium did not open its DevTools port: ${err.slice(-400)}`)), 30000);
    proc.stderr.on("data", (d) => {
      err += d;
      const m = err.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(t); resolve(m[1]); }
    });
    proc.on("exit", (c) => { clearTimeout(t); reject(new Error(`Chromium exited ${c}: ${err.slice(-400)}`)); });
  });
  return { browser: await chromium.connectOverCDP(ws), proc };
}

/* ------------------------------------------------------------------ setup */

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uc-shop-"));
const FRONT = path.join(dir, "jacket-front.png"), BACK = path.join(dir, "jacket-back.png");
fs.writeFileSync(FRONT, png(64, 80, [40, 44, 52]));
fs.writeFileSync(BACK, png(72, 90, [196, 160, 120]));
const hash = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const FILES = [{ name: "jacket-front.png", size: fs.statSync(FRONT).size, sha256: hash(FRONT) }, { name: "jacket-back.png", size: fs.statSync(BACK).size, sha256: hash(BACK) }];
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const shop = await startShop();
const S = shop.url;
const { browser, proc } = await startChromium(path.join(dir, "profile"));
const context = browser.contexts()[0];
const page = context.pages()[0] || await context.newPage();
page.setDefaultTimeout(10000);
console.log(`shop at ${S}; chromium ${browser.version()} over CDP, viewport ${JSON.stringify(page.viewportSize())}`);

const testState = async () => (await fetch(`${S}/__test/state`)).json();
const control = async (p) => (await fetch(`${S}${p}`, { method: "POST" })).json();
const shot = async (name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };
const PASSWORD = "correct horse battery staple";
let listingId = null;
let sellSnapshot = "", threadSnapshot = "";

/* ------------------------------------------------------------------ login */

await step("login", async () => {
  console.log("== login");
  await page.goto(`${S}/sell/`);
  check("no cookie: /sell/ redirects to /login/?next=%2Fsell%2F", page.url() === `${S}/login/?next=%2Fsell%2F`, page.url());
  check("the sign-in page has Email, a visible password field and Log in", await page.getByLabel("Email").isVisible() && await page.locator('input[type="password"]').isVisible() && await page.getByRole("button", { name: "Log in" }).isVisible());
  await page.goto(`${S}/messages/t2/`);
  check("…and /messages/t2/ keeps its own next", page.url() === `${S}/login/?next=%2Fmessages%2Ft2%2F`, page.url());
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForLoadState();
  check("empty form -> 'Enter your email and password.' on the same page", await page.getByRole("alert").textContent() === "Enter your email and password." && page.url().startsWith(`${S}/login/`));
  await page.goto(`${S}/sell/`);
  await page.getByLabel("Email").fill("alex@example.com");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(`${S}/sell/`);
  check("logging in lands on next (/sell/)", page.url() === `${S}/sell/`, page.url());
  const st = await testState();
  check("the login is recorded and the password is stored nowhere", st.logins.some((l) => l.email === "alex@example.com") && !JSON.stringify(st).includes(PASSWORD) && st.sessions === 1, st.logins);

  await context.clearCookies();
  await page.goto(`${S}/sell/`);
  check("cookies cleared -> back to the sign-in page", page.url().startsWith(`${S}/login/`));
  await page.goto(`${S}/__test/login`);
  check("/__test/login sets the session and lands on /", page.url() === `${S}/`, page.url());
  check("header: Sell, 'Messages 2 unread', My shop", await page.getByRole("link", { name: "Messages 2 unread" }).isVisible() && await page.getByRole("link", { name: "My shop" }).isVisible() && await page.getByRole("link", { name: "Sell", exact: true }).isVisible());
});

/* ------------------------------------------------------------------ cookie banner, search */

await step("cookie banner and search", async () => {
  console.log("== cookie banner, search");
  const banner = page.getByRole("region", { name: "Cookie consent" });
  check("cookie banner shows with Accept", await banner.isVisible() && await banner.getByRole("button", { name: "Accept" }).isVisible());
  check("home grid shows other sellers' items", await page.getByRole("link", { name: /Vintage Burberry check scarf/ }).isVisible() && await page.locator(".card").count() === 5);
  check("stub resolves the banner's Accept button in the home snapshot", Boolean(resolveRef(await page.ariaSnapshot({ mode: "ai" }), { role: "button", name: "Accept" })));
  await shot("home");
  await banner.getByRole("button", { name: "Accept" }).click();
  check("Accept removes it", await banner.count() === 0);
  await page.reload();
  check("…for good (after a reload)", await page.getByRole("region", { name: "Cookie consent" }).count() === 0);
  await page.getByRole("searchbox", { name: "Search" }).fill("jacket");
  await page.getByRole("searchbox", { name: "Search" }).press("Enter");
  await page.waitForURL(/\/search\/\?q=jacket$/);
  check("search 'jacket' finds the Arc'teryx and the Carhartt", await page.getByRole("heading", { name: "2 results for “jacket”" }).isVisible()
    && await page.getByRole("link", { name: /Arc'teryx Beta AR/ }).isVisible() && await page.getByRole("link", { name: /Carhartt Detroit/ }).isVisible());
});

/* ------------------------------------------------------------------ sell */

await step("sell", async () => {
  console.log("== sell");
  await page.goto(`${S}/sell/`);
  sellSnapshot = await page.ariaSnapshot({ mode: "ai" });
  const before = (await testState()).listings.length;

  await page.getByRole("button", { name: "Post listing" }).click();
  await sleep(300);
  const errs = await page.locator(".err:not([hidden])").allTextContents();
  check("empty Post listing -> inline errors, no navigation", page.url() === `${S}/sell/`
    && ["Add at least one photo", "Add a description", "Choose a category", "Choose a condition", "Price is required"].every((e) => errs.includes(e)), errs);
  check("…a summary alert counts them", (await page.getByRole("alert").first().textContent()) === "Fix 5 things before posting");
  check("…and nothing was stored", (await testState()).listings.length === before);

  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: "Add photos" }).click()]);
  check("'Add photos' opens a real file chooser that takes several files", chooser.isMultiple());
  await chooser.setFiles([FRONT, BACK]);
  const thumbs = page.getByRole("list", { name: "Selected photos" }).getByRole("img");
  check("two thumbnails, named from the File objects", await thumbs.count() === 2
    && await thumbs.nth(0).getAttribute("alt") === "Photo 1: jacket-front.png" && await thumbs.nth(1).getAttribute("alt") === "Photo 2: jacket-back.png");
  const caps = await page.locator(".thumbs .cap").allTextContents();
  check("…with their real sizes", caps[0] === `jacket-front.png · ${FILES[0].size} B` && caps[1] === `jacket-back.png · ${FILES[1].size} B`, caps);
  check("the photo error cleared itself", await page.locator("#err-photos").isHidden());

  await page.getByRole("textbox", { name: "Description" }).fill("Arc'teryx Atom LT hoody\nBlack, size M. Worn a handful of times, no marks.");
  await page.getByRole("combobox", { name: "Category" }).selectOption({ label: "Outerwear" });
  const cond = page.getByRole("button", { name: /^Condition/ });
  check("Condition is a button with a listbox popup, closed", await cond.getAttribute("aria-haspopup") === "listbox" && await cond.getAttribute("aria-expanded") === "false" && await page.getByRole("listbox").count() === 0);
  await cond.click();
  const listbox = page.getByRole("listbox", { name: "Condition" });
  check("clicking it opens the listbox with four options", await listbox.isVisible() && await listbox.getByRole("option").count() === 4 && await cond.getAttribute("aria-expanded") === "true");
  const openSnap = await page.ariaSnapshot({ mode: "ai" });
  for (const o of ["Brand new", "Like new", "Used - Excellent", "Used - Good"]) check(`stub resolves option "${o}" in the open snapshot`, Boolean(resolveRef(openSnap, { role: "option", name: o })));
  check("stub resolves listbox \"Condition\"", Boolean(resolveRef(openSnap, { role: "listbox", name: "Condition" })));
  if (SHOTS) {
    await page.getByRole("textbox", { name: "Size" }).scrollIntoViewIfNeeded();
    await shot("sell-listbox-open");
  }
  await listbox.getByRole("option", { name: "Like new" }).click();
  check("picking 'Like new' closes it and names the button", await page.getByRole("listbox").count() === 0 && (await cond.textContent()).trim() === "Like new" && await cond.getAttribute("aria-expanded") === "false");
  // The keyboard path: open (starts on the chosen option), down, down, up, Enter.
  await cond.click();
  await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  check("by keyboard: from Like new, down x2, up, Enter -> 'Used - Excellent'", (await cond.textContent()).trim() === "Used - Excellent" && await page.getByRole("listbox").count() === 0, await cond.textContent());
  await page.getByRole("textbox", { name: "Size" }).fill("M");
  const price = page.getByRole("textbox", { name: "Price" });
  await price.click();
  await page.keyboard.type("$45", { delay: 30 });
  check("typing '$45' into Price leaves 45 (the field takes numbers only)", await price.inputValue() === "45", await price.inputValue());

  await page.getByRole("button", { name: "Save draft" }).click();
  await page.getByRole("status").filter({ hasText: "Draft saved" }).waitFor();
  let st = await testState();
  const draft = st.listings.find((l) => l.mine && l.status === "draft");
  check("Save draft stores a draft with both photos, page stays", Boolean(draft) && draft.photos.length === 2 && page.url() === `${S}/sell/`, draft);
  await page.locator(".thumbs").scrollIntoViewIfNeeded();
  await shot("sell-filled");

  await page.getByRole("button", { name: "Post listing" }).click();
  await page.waitForURL(/\/item\/\d+\/\?posted=1$/);
  listingId = /\/item\/(\d+)\//.exec(page.url())[1];
  check("Post listing -> /item/<id>/ (the draft became the live listing)", draft && listingId === draft.id, { url: page.url(), draft: draft && draft.id });
  check("item page: title, price, 'Your listing is live', Edit listing", await page.getByRole("heading", { name: "Arc'teryx Atom LT hoody" }).isVisible()
    && (await page.locator(".price").textContent()) === "$45.00" && await page.getByRole("status").filter({ hasText: "Your listing is live" }).isVisible()
    && await page.getByRole("link", { name: "Edit listing" }).isVisible());
  const widths = await page.locator(".gallery img").evaluateAll((els) => els.map((e) => e.naturalWidth));
  check("both uploaded photos are served back and decode (64 and 72 px wide)", widths.join() === "64,72", widths);
  await shot("item");

  st = await testState();
  const l = st.listings.find((x) => x.id === listingId);
  check("state: one more listing, live, with the fields as entered", st.listings.length === before + 1 && l && l.status === "live" && l.category === "Outerwear"
    && l.condition === "Used - Excellent" && l.size === "M" && l.price === 45 && l.description.startsWith("Arc'teryx Atom LT hoody\nBlack"), l);
  check("state: 2 photos, names, sizes and sha256 match the files on disk", l && l.photos.length === 2 && l.photos.every((p, i) => p.name === FILES[i].name && p.size === FILES[i].size && p.sha256 === FILES[i].sha256 && p.type === "image/png"), { got: l && l.photos, want: FILES });
});

/* ------------------------------------------------------------------ edit, delete */

await step("edit price", async () => {
  console.log("== edit price, delete");
  await page.getByRole("link", { name: "Edit listing" }).click();
  await page.waitForURL(`${S}/item/${listingId}/edit/`);
  const price = page.getByRole("textbox", { name: "Price" });
  check("edit page: Price prefilled with 45", await price.inputValue() === "45", await price.inputValue());
  await price.fill("");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForLoadState();
  check("an empty price is refused inline", (await page.getByRole("alert").textContent()) === "Price is required" && (await testState()).edits.length === 0);
  await page.getByRole("textbox", { name: "Price" }).fill("39");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForURL(`${S}/item/${listingId}/?saved=1`);
  check("saved: 'Changes saved', $39.00", await page.getByRole("status").filter({ hasText: "Changes saved" }).isVisible() && (await page.locator(".price").textContent()) === "$39.00");
  const st = await testState();
  const l = st.listings.find((x) => x.id === listingId);
  check("state: the edit (price only) and the price history are stored", st.edits.length === 1 && st.edits[0].id === listingId && st.edits[0].field === "price" && st.edits[0].from === 45 && st.edits[0].to === 39
    && l.price === 39 && l.priceHistory.length === 1, { edits: st.edits, history: l && l.priceHistory });
});

await step("delete", async () => {
  await page.goto(`${S}/item/${listingId}/edit/`);
  await page.getByRole("button", { name: "Delete listing" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete this listing?" });
  check("Delete listing opens the dialog with Cancel and Delete", await dialog.isVisible() && await dialog.getByRole("button", { name: "Cancel" }).isVisible() && await dialog.getByRole("button", { name: "Delete", exact: true }).isVisible());
  const snap = await page.ariaSnapshot({ mode: "ai" });
  check("stub resolves the dialog's Delete and Cancel buttons", Boolean(resolveRef(snap, { role: "button", name: "Delete" }) && resolveRef(snap, { role: "button", name: "Cancel" })), snap.split("\n").filter((x) => /dialog|Delete|Cancel/.test(x)).join(" | "));
  await shot("delete-dialog");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  check("Cancel closes it and deletes nothing", await dialog.count() === 0 && (await testState()).deletions.length === 0);
  await page.getByRole("button", { name: "Delete listing" }).click();
  await page.keyboard.press("Escape");
  check("Escape closes it too", await dialog.count() === 0);
  await page.getByRole("button", { name: "Delete listing" }).click();
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await page.waitForURL(`${S}/shop/?deleted=1`);
  check("Delete -> My shop with 'Listing deleted'", await page.getByRole("status").filter({ hasText: "Listing deleted" }).isVisible() && await page.getByRole("heading", { name: "My shop" }).isVisible());
  check("…and the shop lists the three seeded items, not the deleted one", await page.locator(".card").count() === 3 && await page.getByRole("link", { name: /Atom LT/ }).count() === 0);
  const st = await testState();
  check("state: the deletion is recorded", st.deletions.length === 1 && st.deletions[0].id === listingId && st.listings.find((x) => x.id === listingId).status === "deleted", st.deletions);
  const r = await page.goto(`${S}/item/${listingId}/`);
  check("the deleted item answers 404 'no longer available'", r.status() === 404 && await page.getByRole("heading", { name: "This listing is no longer available" }).isVisible());
});

/* ------------------------------------------------------------------ messages */

await step("messages", async () => {
  console.log("== messages");
  await page.goto(`${S}/messages/`);
  const threads = page.getByRole("list", { name: "Conversations" }).getByRole("link");
  check("inbox: three conversations, two unread", await threads.count() === 3 && await page.locator(".threads a.unread").count() === 2 && await page.getByRole("link", { name: "Messages 2 unread" }).isVisible());
  await page.getByRole("link", { name: /jdub\.vintage/ }).click();
  await page.waitForURL(`${S}/messages/t2/`);
  const log = page.getByRole("log", { name: "Conversation with jdub.vintage" });
  check("thread: history in a role=log with the buyer's offer", await log.isVisible() && (await log.textContent()).includes("would you do 180?"));
  check("opening it marks it read (header: 1 unread)", await page.getByRole("link", { name: "Messages 1 unread" }).isVisible());
  threadSnapshot = await page.ariaSnapshot({ mode: "ai" });
  const box = page.getByRole("textbox", { name: "Write a message" });
  const sendBtn = page.getByRole("button", { name: "Send" });
  check("Send is disabled while the box is empty", await sendBtn.isDisabled());
  await box.click();
  await page.keyboard.type("Hey! Lowest I can do is 200, it's barely worn.", { delay: 5 });
  check("…and enabled once there is text", await sendBtn.isEnabled());
  await sendBtn.click();
  await until(async () => (await log.textContent()).includes("Lowest I can do is 200"), 4000);
  check("Send appends the message to the history and clears the box", (await log.textContent()).includes("You: Hey! Lowest I can do is 200, it's barely worn.") && await box.inputValue() === "");
  let st = await testState();
  check("state: the sent message is stored", st.sent.length === 1 && st.sent[0].thread === "t2" && st.sent[0].text === "Hey! Lowest I can do is 200, it's barely worn.", st.sent);
  await box.click();
  await page.keyboard.type("line one");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("line two");
  check("Shift+Enter makes a new line and sends nothing", await box.inputValue() === "line one\nline two" && (await testState()).sent.length === 1);
  await box.fill("");
  await page.keyboard.type("I can ship tomorrow morning.");
  await page.keyboard.press("Enter");
  await until(async () => (await testState()).sent.length === 2, 4000);
  st = await testState();
  check("Enter sends (like most chat boxes)", st.sent.length === 2 && st.sent[1].text === "I can ship tomorrow morning." && st.threads.find((t) => t.id === "t2").messages.length === 4);
  await shot("thread");
  await page.reload();
  check("after a reload the history is still there", (await page.getByRole("log").textContent()).includes("I can ship tomorrow morning."));
});

/* ------------------------------------------------------------------ captcha */

await step("captcha", async () => {
  console.log("== captcha");
  await control("/__test/captcha?on=1");
  const r = await page.goto(`${S}/`);
  check("captcha on: home answers 403 'Verify you are human'", r.status() === 403 && await page.getByRole("heading", { name: "Verify you are human" }).isVisible());
  const src = await page.locator("iframe").getAttribute("src");
  check("…with an iframe from /recaptcha/api2/anchor", /\/recaptcha\/api2\/anchor/.test(src), src);
  const frame = page.frames().find((f) => /\/recaptcha\/api2\/anchor/.test(f.url()));
  check("…whose page has the 'I'm not a robot' checkbox", Boolean(frame) && await frame.getByRole("checkbox", { name: "I'm not a robot" }).isVisible());
  const snap = await page.ariaSnapshot({ mode: "ai" });
  console.log("\n--- ariaSnapshot (ai) of the captcha interstitial ---\n" + snap + "\n---\n");
  await shot("captcha");
  const login = await fetch(`${S}/login/`);
  check("/login/ is not behind the check", login.status === 200 && (await login.text()).includes("Log in to Thrift"));
  const api = await fetch(`${S}/api/listings`, { method: "POST" });
  check("the API answers 403 too", api.status === 403);
  const sell = await page.goto(`${S}/sell/`);
  check("every other page is the interstitial (/sell/)", sell.status() === 403 && await page.getByRole("heading", { name: "Verify you are human" }).isVisible());
  await control("/__test/captcha?on=0");
  const back = await until(async () => page.getByRole("heading", { name: "List an item" }).isVisible().catch(() => false), 6000, 200);
  check("cleared: the interstitial reloads itself into the page (/sell/)", Boolean(back) && page.url() === `${S}/sell/`, page.url());
});

/* ------------------------------------------------------------------ checkout, reset */

await step("checkout and reset", async () => {
  console.log("== checkout, reset");
  await page.goto(`${S}/item/201/`);
  await page.getByRole("link", { name: "Buy now" }).click();
  await page.waitForURL(`${S}/checkout/201/`);
  check("Buy now -> checkout with Card number and Pay now", await page.getByRole("textbox", { name: "Card number" }).isVisible() && await page.getByRole("button", { name: "Pay now" }).isVisible());
  await page.getByRole("button", { name: "Pay now" }).click();
  await page.getByRole("heading", { name: "Order placed" }).waitFor();
  let st = await testState();
  check("Pay now records the purchase and marks the item sold", st.purchases.length === 1 && st.purchases[0].id === "201" && st.listings.find((l) => l.id === "201").status === "sold");
  await control("/__test/reset");
  st = await testState();
  check("reset: seed back (8 listings, 2 unread, nothing sent/edited/deleted/bought)", st.listings.length === 8 && st.threads.filter((t) => t.unread).length === 2
    && !st.sent.length && !st.edits.length && !st.deletions.length && !st.purchases.length && st.captcha === false, { n: st.listings.length });
  await page.goto(`${S}/sell/`);
  check("…and the session survives a reset", page.url() === `${S}/sell/`);
  await control("/__test/logout");
  await page.goto(`${S}/shop/`);
  check("/__test/logout drops it", page.url() === `${S}/login/?next=%2Fshop%2F`, page.url());
});

/* ------------------------------------------------------------------ what the agent will read */

await step("snapshots", async () => {
  console.log("== the snapshots the agent will read");
  console.log("\n--- ariaSnapshot (ai) of /sell/ (fresh page) ---\n" + sellSnapshot + "\n---\n");
  console.log("--- ariaSnapshot (ai) of /messages/t2/ (fresh page) ---\n" + threadSnapshot + "\n---\n");
  const sellTargets = [
    ["button", "Add photos"], ["textbox", "Description"], ["combobox", "Category"], ["button", "Condition Select condition"],
    ["textbox", "Size"], ["textbox", "Brand (optional)"], ["textbox", "Price"], ["button", "Save draft"], ["button", "Post listing"],
    ["searchbox", "Search"], ["link", "Messages 2 unread"], ["link", "My shop"],
  ];
  for (const [role, name] of sellTargets) check(`/sell/: stub resolves ${role} "${name}"`, Boolean(resolveRef(sellSnapshot, { role, name })));
  check("/sell/: the hidden file input is not in the snapshot (only the button is)", !/Choose File|No file chosen/.test(sellSnapshot));
  for (const [role, name] of [["log", "Conversation with jdub.vintage"], ["textbox", "Write a message"], ["button", "Send"], ["link", /^maya\.k/], ["link", "Messages 1 unread"]]) {
    check(`/messages/t2/: stub resolves ${role} ${name instanceof RegExp ? name : `"${name}"`}`, Boolean(resolveRef(threadSnapshot, { role, name })));
  }
  check("/messages/t2/: Send shows as disabled while empty", /button "Send" \[disabled\]/.test(threadSnapshot));
});

try { await browser.close(); } catch { /* gone */ }
try { proc.kill("SIGKILL"); } catch { /* gone */ }
await shop.close();
try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* fine */ }
clearTimeout(KILL);
console.log(`\n${passed} passed, ${failed} failed${SHOTS ? `  (screenshots in ${SHOTS})` : ""}`);
process.exit(failed ? 1 : 0);

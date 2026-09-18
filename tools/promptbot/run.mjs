/**
 * Drives Gemini or ChatGPT in a Chrome you started yourself.
 *
 * It attaches to a running browser over the debug port rather than launching
 * its own. That is the whole trick: the session, the login and the free tier
 * are yours, and nothing here ever sees a password.
 *
 * Read the README before the code — especially the part about this breaking
 * when Google changes their page.
 */
import { chromium } from "playwright";
import { attachWand } from "./wand.mjs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, extname } from "node:path";

/* ------------------------------------------------------------------ config */

/**
 * Everything that knows what the two sites look like, in one place.
 *
 * When a run suddenly finds nothing, it is almost always one of these strings
 * and almost never the logic below. Open the site, right-click the box you
 * type into, Inspect, and fix the selector here.
 *
 * Each `ask` is tried in order until one is found, so an old and a new
 * selector can live side by side through a redesign.
 */
const SITES = {
  gemini: {
    url: "https://gemini.google.com/app",
    ask: ['div.ql-editor[contenteditable="true"]', 'rich-textarea div[contenteditable="true"]', 'textarea'],
    send: ['button[aria-label*="Send" i]', 'button[aria-label*="Submit" i]', 'button.send-button'],
    fresh: ['button[aria-label*="New chat" i]', 'a[aria-label*="New chat" i]'],
    /** Where a finished picture ends up. Thumbnails and avatars are filtered out by size. */
    images: ['img[src^="https://lh3.googleusercontent.com"]', 'img[src^="blob:"]', 'img[src^="data:image"]'],
    /** The hidden input behind the paperclip. Every one of these sites has one. */
    file: ['input[type="file"]'],
  },
  chatgpt: {
    url: "https://chatgpt.com/",
    ask: ['div#prompt-textarea[contenteditable="true"]', 'textarea#prompt-textarea', 'textarea'],
    send: ['button[data-testid="send-button"]', 'button[aria-label*="Send" i]'],
    fresh: ['a[href="/"]', 'button[aria-label*="New chat" i]'],
    images: ['img[src*="oaiusercontent"]', 'img[src^="blob:"]', 'img[src^="data:image"]'],
    file: ['input[type="file"]'],
  },
};

/** The smallest thing we'll call a generated picture. Below this it's UI. */
const MIN_PIXELS = 320;

/* -------------------------------------------------------------------- args */

function args(argv) {
  const out = { site: "gemini", prompts: "prompts.txt", out: "./images", refs: "./reference", wait: 180, port: 9222, fresh: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--fresh") out.fresh = true;
    else if (a.startsWith("--")) out[a.slice(2)] = argv[++i];
  }
  out.wait = Number(out.wait);
  out.port = Number(out.port);
  return out;
}

/** The first of these selectors that actually exists on the page. */
async function find(page, list, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const sel of list) {
      const el = page.locator(sel).first();
      if (await el.count().then((n) => n > 0).catch(() => false)) {
        if (await el.isVisible().catch(() => false)) return el;
      }
    }
    await page.waitForTimeout(400);
  }
  return null;
}

/* -------------------------------------------------------------------- main */

const opt = args(process.argv);
const site = SITES[opt.site];
if (!site) {
  console.error(`Unknown site "${opt.site}". Use gemini or chatgpt.`);
  process.exit(1);
}

const blocks = (await readFile(opt.prompts, "utf8"))
  .split(/\n\s*\n/)
  .map((s) => s.trim())
  .filter(Boolean);
if (!blocks.length) {
  console.error(`No prompts in ${opt.prompts}. Separate them with a blank line.`);
  process.exit(1);
}
await mkdir(opt.out, { recursive: true });

/**
 * Reference pictures, attached to every prompt.
 *
 * A prompt that says "match the attached product" is worth ten that describe
 * it, because a description is a new guess each time and a photograph is the
 * thing itself. Anything dropped in the reference folder rides along with
 * every prompt in the run; an empty folder changes nothing.
 */
const REF_DIR = opt.refs;
const refs = await readdir(REF_DIR)
  .then((names) =>
    names
      .filter((n) => /\.(png|jpe?g|webp|gif)$/i.test(n) && !n.startsWith("."))
      .sort()
      .map((n) => join(REF_DIR, n)),
  )
  .catch(() => []);
if (refs.length) {
  console.log(`${refs.length} reference image${refs.length === 1 ? "" : "s"} will be attached to every prompt.\n`);
}

let browser;
try {
  browser = await chromium.connectOverCDP(`http://localhost:${opt.port}`);
} catch {
  console.error(
    `Nothing listening on port ${opt.port}.\n` +
      `Quit Chrome completely, then start it with --remote-debugging-port=${opt.port}. ` +
      `The README has the exact command for your machine.`,
  );
  process.exit(1);
}

const context = browser.contexts()[0] ?? (await browser.newContext());
const page = await context.newPage();
await page.goto(site.url, { waitUntil: "domcontentloaded" });

// The wand, the panel and the Escape key. Everything below reports through it,
// so nothing is typed into your browser that you didn't watch happen.
const wand = await attachWand(page);
await wand.say("Starting", `${blocks.length} prompt${blocks.length === 1 ? "" : "s"} to send.`);

// A logged-out page has no box to type in, and saying so beats a timeout.
if (!(await find(page, site.ask, 20000))) {
  console.error(
    `Couldn't find the message box. Either you're not logged into ${opt.site} ` +
      `in this Chrome profile, or the page changed — see the config block at the top of run.mjs.`,
  );
  await browser.close();
  process.exit(1);
}

console.log(`${blocks.length} prompt${blocks.length === 1 ? "" : "s"} → ${opt.site}\n`);

let saved = 0;
for (let i = 0; i < blocks.length; i++) {
  const n = i + 1;
  if (await wand.stopped()) { console.log("\nStopped — you pressed Escape."); break; }
  console.log(`[${n}/${blocks.length}] sending…`);
  await wand.say(`Prompt ${n} of ${blocks.length}`, blocks[i].slice(0, 120) + (blocks[i].length > 120 ? "…" : ""));

  if (opt.fresh && i > 0) {
    const nw = await find(page, site.fresh, 5000);
    if (nw) {
      await wand.point(nw);
      await nw.click().catch(() => {});
      await page.waitForTimeout(1500);
      await wand.reattach();
    }
  }

  const box = await find(page, site.ask, 20000);
  if (!box) { console.log(`   no message box, skipping`); continue; }
  // The pictures go on before the words, because both sites disable their send
  // button while an upload is still going and enable it once the text is in.
  if (refs.length) {
    const input = page.locator(site.file).first();
    const ok = await input.count().then((n) => n > 0).catch(() => false);
    if (ok) {
      await wand.say(`Prompt ${n} of ${blocks.length}`, `Attaching ${refs.length} reference image${refs.length === 1 ? "" : "s"}…`);
      await input.setInputFiles(refs).catch(() => {});
      // Uploads have to finish before the send button will accept a click.
      await page.waitForTimeout(2500 + refs.length * 1200);
    } else {
      console.log("   (no attachment box found — sending the prompt on its own)");
    }
  }

  await wand.point(box);
  await box.click();
  // Typed rather than pasted: these editors are rich-text widgets that often
  // ignore a programmatic value set, and a paste needs clipboard permission.
  await box.fill("").catch(() => {});
  await page.keyboard.insertText(blocks[i]);
  await page.waitForTimeout(400);

  if (await wand.stopped()) { console.log("\nStopped — you pressed Escape."); break; }
  const send = await find(page, site.send, 5000);
  if (send) { await wand.point(send); await send.click().catch(() => page.keyboard.press("Enter")); }
  else await page.keyboard.press("Enter");
  await wand.say(`Prompt ${n} of ${blocks.length}`, "Waiting for the pictures…");

  // Wait for pictures to appear and then stop appearing — a generation that
  // returns four images writes them one at a time.
  const deadline = Date.now() + opt.wait * 1000;
  const seen = new Set();
  let quiet = 0;
  while (Date.now() < deadline) {
    await page.waitForTimeout(2000);
    const urls = await page.evaluate(
      ({ sels, min }) =>
        sels
          .flatMap((s) => Array.from(document.querySelectorAll(s)))
          .filter((el) => el.naturalWidth >= min && el.naturalHeight >= min)
          .map((el) => el.src),
      { sels: site.images, min: MIN_PIXELS },
    );
    const fresh = urls.filter((u) => !seen.has(u));
    fresh.forEach((u) => seen.add(u));
    if (await wand.stopped()) break;
    if (fresh.length) {
      quiet = 0;
      process.stdout.write(`   ${seen.size} image${seen.size === 1 ? "" : "s"}\r`);
      await wand.say(`Prompt ${n} of ${blocks.length}`, `${seen.size} image${seen.size === 1 ? "" : "s"} so far…`);
    }
    else if (seen.size) { quiet += 2; if (quiet >= 8) break; }
  }

  if (!seen.size) {
    console.log(`   nothing came back in ${opt.wait}s — raise --wait, or check the tab`);
    continue;
  }

  let k = 0;
  for (const url of seen) {
    k++;
    // Fetched inside the page so cookies and referrer come along; a plain
    // request from node gets a 403 from both of them.
    const b64 = await page.evaluate(async (u) => {
      const r = await fetch(u);
      const buf = await r.arrayBuffer();
      let s = "";
      const bytes = new Uint8Array(buf);
      for (let j = 0; j < bytes.length; j++) s += String.fromCharCode(bytes[j]);
      return btoa(s);
    }, url).catch(() => null);
    if (!b64) continue;
    const name = `${String(n).padStart(2, "0")}-${String(k).padStart(2, "0")}.png`;
    await writeFile(join(opt.out, name), Buffer.from(b64, "base64"));
    saved++;
  }
  console.log(`   saved ${seen.size} → ${opt.out}`);
  await wand.say(`Prompt ${n} of ${blocks.length}`, `Saved ${seen.size} to ${opt.out}.`);
}

console.log(`\nDone. ${saved} image${saved === 1 ? "" : "s"} in ${opt.out}`);
await wand.say("Done", `${saved} image${saved === 1 ? "" : "s"} saved to ${opt.out}.`);
// A moment to read the panel before the overlay goes with the connection.
await page.waitForTimeout(2500);
// The browser is yours — leave it open, just let go of it.
await browser.close();

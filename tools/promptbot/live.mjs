/**
 * Stays open, shows you what Claude has queued, and runs it when you say so.
 *
 * The one-shot runner reads a file on disk, which means every new idea is a
 * download. This connects to the browser once and then keeps checking a small
 * queue Claude publishes, so "do the ghost swing next" reaches your laptop in
 * seconds.
 *
 * It does not run anything on its own. When a job appears it prints what it
 * is — the name, how many prompts, the first line of each — and waits for you
 * to press Return. That gate is deliberate: a program that polls a URL and
 * acts on whatever comes back, unattended, is a remote-controlled bot no
 * matter how good the intentions behind the URL are. With you reading each
 * job before it runs, it is a tool you are pointing.
 *
 * What it can do is narrow on purpose: type into the chat box of the site you
 * are already signed into, attach pictures the job points at, and save the
 * pictures that come back. It never navigates anywhere else. Escape in the
 * browser stops it between any two steps.
 */
import { chromium } from "playwright";
import { attachWand } from "./wand.mjs";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";

const QUEUE = process.env.QUEUE || "https://kerberos.gardenbuddystore.workers.dev/media/wand-queue.json";
const POLL_MS = 6000;
const MIN_PIXELS = 320;

const SITES = {
  gemini: {
    name: "Gemini",
    url: "https://gemini.google.com/app",
    ask: ['div.ql-editor[contenteditable="true"]', 'rich-textarea div[contenteditable="true"]', "textarea"],
    send: ['button[aria-label*="Send" i]', 'button[aria-label*="Submit" i]', "button.send-button"],
    fresh: ['button[aria-label*="New chat" i]', 'a[aria-label*="New chat" i]'],
    file: ['input[type="file"]'],
    images: ['img[src^="https://lh3.googleusercontent.com"]', 'img[src^="blob:"]', 'img[src^="data:image"]'],
  },
  chatgpt: {
    name: "ChatGPT",
    url: "https://chatgpt.com/",
    ask: ['div#prompt-textarea[contenteditable="true"]', "textarea#prompt-textarea", "textarea"],
    send: ['button[data-testid="send-button"]', 'button[aria-label*="Send" i]'],
    fresh: ['a[href="/"]', 'button[aria-label*="New chat" i]'],
    file: ['input[type="file"]'],
    images: ['img[src*="oaiusercontent"]', 'img[src^="blob:"]', 'img[src^="data:image"]'],
  },
};

const opt = { site: "gemini", out: "./images", port: 9222, wait: 240 };
for (let i = 2; i < process.argv.length; i += 2) opt[process.argv[i].slice(2)] = process.argv[i + 1];
opt.port = Number(opt.port);
opt.wait = Number(opt.wait);
const site = SITES[opt.site] ?? SITES.gemini;

const rl = createInterface({ input: process.stdin, output: process.stdout });

/** Jobs already run, so a restart doesn't offer you the same one again. */
const DONE_FILE = ".done-jobs";
const done = new Set(
  await readFile(DONE_FILE, "utf8").then((t) => t.split("\n").filter(Boolean)).catch(() => []),
);

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

let browser;
try {
  browser = await chromium.connectOverCDP(`http://localhost:${opt.port}`);
} catch {
  console.error(`\nNothing listening on port ${opt.port}. Start Chrome with the debug port first.\n`);
  process.exit(1);
}

const context = browser.contexts()[0] ?? (await browser.newContext());
const page = await context.newPage();
await page.goto(site.url, { waitUntil: "domcontentloaded" });

if (!(await find(page, site.ask, 20000))) {
  console.error(`\nCouldn't find the message box — check you're signed into ${site.name} in that Chrome.\n`);
  await browser.close();
  process.exit(1);
}

const wand = await attachWand(page);
await mkdir(opt.out, { recursive: true });

console.log(`\n\x1b[1mConnected to ${site.name}.\x1b[0m`);
console.log(`Tell Claude what you want. It shows up here and you press Return to run it.`);
console.log(`Esc in the browser stops whatever is running.\n`);
await wand.say("Waiting", `Connected to ${site.name}. Tell Claude what you want.`);

async function fetchRefs(urls, dir) {
  if (!urls?.length) return [];
  await mkdir(dir, { recursive: true });
  const out = [];
  for (let i = 0; i < urls.length; i++) {
    try {
      const res = await fetch(urls[i]);
      if (!res.ok) continue;
      const ext = (urls[i].split(".").pop() ?? "jpg").split("?")[0].slice(0, 4);
      const path = join(dir, `ref-${i + 1}.${ext}`);
      await writeFile(path, Buffer.from(await res.arrayBuffer()));
      out.push(path);
    } catch { /* a reference that won't download isn't worth stopping for */ }
  }
  return out;
}

async function runPrompt(text, refs, label, n, total, dir) {
  await wand.reattach();
  await wand.say(label, `${n} of ${total} — sending…`);

  // A fresh chat per prompt: several shots of one product in one thread makes
  // each picture a reply to the last rather than an answer to the prompt.
  const nw = await find(page, site.fresh, 4000);
  if (nw) { await wand.point(nw); await nw.click().catch(() => {}); await page.waitForTimeout(1600); await wand.reattach(); }

  // Pictures before words: both sites disable send while an upload is running.
  if (refs.length) {
    const input = page.locator(site.file).first();
    if (await input.count().then((c) => c > 0).catch(() => false)) {
      await wand.say(label, `${n} of ${total} — attaching ${refs.length}…`);
      await input.setInputFiles(refs).catch(() => {});
      await page.waitForTimeout(2500 + refs.length * 1200);
    }
  }

  const box = await find(page, site.ask, 20000);
  if (!box) return 0;
  await wand.point(box);
  await box.click();
  await box.fill("").catch(() => {});
  await page.keyboard.insertText(text);
  await page.waitForTimeout(400);

  const send = await find(page, site.send, 5000);
  if (send) { await wand.point(send); await send.click().catch(() => page.keyboard.press("Enter")); }
  else await page.keyboard.press("Enter");

  await wand.say(label, `${n} of ${total} — waiting for the pictures…`);
  const deadline = Date.now() + opt.wait * 1000;
  const seen = new Set();
  let quiet = 0;
  while (Date.now() < deadline) {
    await page.waitForTimeout(2000);
    if (await wand.stopped()) return 0;
    const urls = await page.evaluate(
      ({ sels, min }) =>
        sels.flatMap((s) => Array.from(document.querySelectorAll(s)))
          .filter((el) => el.naturalWidth >= min && el.naturalHeight >= min)
          .map((el) => el.src),
      { sels: site.images, min: MIN_PIXELS },
    ).catch(() => []);
    const fresh = urls.filter((u) => !seen.has(u));
    fresh.forEach((u) => seen.add(u));
    if (fresh.length) { quiet = 0; await wand.say(label, `${n} of ${total} — ${seen.size} image${seen.size === 1 ? "" : "s"}…`); }
    else if (seen.size) { quiet += 2; if (quiet >= 8) break; }
  }

  let saved = 0;
  for (const url of seen) {
    const b64 = await page.evaluate(async (u) => {
      const r = await fetch(u);
      const bytes = new Uint8Array(await r.arrayBuffer());
      let s = "";
      for (let j = 0; j < bytes.length; j++) s += String.fromCharCode(bytes[j]);
      return btoa(s);
    }, url).catch(() => null);
    if (!b64) continue;
    saved++;
    // Numbered by prompt then by picture, so the folder reads in the order the
    // shots were asked for rather than the order they happened to finish.
    await writeFile(
      join(dir, `${String(n).padStart(2, "0")}-${String(saved).padStart(2, "0")}.png`),
      Buffer.from(b64, "base64"),
    );
  }
  return saved;
}

/* ------------------------------------------------------------------- loop */

let spinner = 0;
while (true) {
  if (await wand.stopped()) { console.log("\nStopped — you pressed Escape.\n"); break; }

  let job = null;
  try {
    const res = await fetch(`${QUEUE}?t=${Date.now()}`, { cache: "no-store" });
    if (res.ok) job = await res.json();
  } catch { /* a moment offline is not a reason to quit */ }

  if (!job?.id || done.has(job.id) || !job.prompts?.length) {
    process.stdout.write(`\r  waiting${".".repeat((spinner++ % 3) + 1)}   `);
    await page.waitForTimeout(POLL_MS);
    continue;
  }

  // Everything about the job, before any of it runs.
  const label = job.name || job.id;
  console.log(`\r\x1b[K`);
  console.log(`\x1b[1m${label}\x1b[0m`);
  console.log(`${job.prompts.length} prompt${job.prompts.length === 1 ? "" : "s"}${job.refs?.length ? `, ${job.refs.length} reference image${job.refs.length === 1 ? "" : "s"}` : ""}:`);
  job.prompts.forEach((p, i) => {
    const first = p.trim().split("\n")[0];
    console.log(`  ${i + 1}. ${first.slice(0, 92)}${first.length > 92 ? "…" : ""}`);
  });
  console.log();

  const answer = (await rl.question(`Run it? [Return to go, s to skip] `)).trim().toLowerCase();
  if (answer === "s" || answer === "skip" || answer === "n") {
    done.add(job.id);
    await writeFile(DONE_FILE, [...done].join("\n"));
    console.log(`Skipped.\n`);
    continue;
  }

  await wand.say(label, "Starting…");

  // A folder per job, named after the job. Forty pictures in one directory is
  // a pile; seven folders of five is a shoot.
  const slug = label.replace(/\W+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  const dir = join(opt.out, slug);
  await mkdir(dir, { recursive: true });
  const refs = await fetchRefs(job.refs, join(dir, "reference"));

  let total = 0;
  for (let i = 0; i < job.prompts.length; i++) {
    if (await wand.stopped()) break;
    const got = await runPrompt(job.prompts[i], refs, label, i + 1, job.prompts.length, dir);
    total += got;
    console.log(`  [${i + 1}/${job.prompts.length}] ${got} image${got === 1 ? "" : "s"}`);
  }

  done.add(job.id);
  await writeFile(DONE_FILE, [...done].join("\n"));
  console.log(`\n\x1b[1m${total} image${total === 1 ? "" : "s"} saved to ${dir}\x1b[0m\n`);
  await wand.say("Waiting", `${label}: ${total} saved. Tell Claude what's next.`);
}

rl.close();
await browser.close();

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
import { basename, extname } from "node:path";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

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
    file: ['input[type="file"]:not([data-wand])'],
    /** The paperclip. Gemini only puts a file input in the page once this is open. */
    attach: ['button[aria-label*="Open upload" i]', 'button[aria-label*="upload" i]', 'button[aria-label*="Add files" i]', 'uploader-button button', 'button.upload-card-button'],
    /** And then the menu item inside it. */
    attachItem: ['button[aria-label*="Upload file" i]', 'text=Upload files', 'text=Μεταφόρτωση αρχείων'],
    images: ['img[src^="https://lh3.googleusercontent.com"]', 'img[src^="blob:"]', 'img[src^="data:image"]'],
  },
  chatgpt: {
    name: "ChatGPT",
    url: "https://chatgpt.com/",
    ask: ['div#prompt-textarea[contenteditable="true"]', "textarea#prompt-textarea", "textarea"],
    send: ['button[data-testid="send-button"]', 'button[aria-label*="Send" i]'],
    fresh: ['a[href="/"]', 'button[aria-label*="New chat" i]'],
    file: ['input[type="file"]:not([data-wand])'],
    attach: ['button[aria-label*="Upload" i]', 'button[aria-label*="Attach" i]', 'button[data-testid="composer-plus-btn"]'],
    attachItem: [],
    images: ['img[src*="oaiusercontent"]', 'img[src^="blob:"]', 'img[src^="data:image"]'],
  },
};

const opt = { site: "gemini", out: "./images", port: 9222, wait: 240 };
for (let i = 2; i < process.argv.length; i += 2) opt[process.argv[i].slice(2)] = process.argv[i + 1];
opt.port = Number(opt.port);
opt.wait = Number(opt.wait);
/**
 * Which site is in front of us right now.
 *
 * It starts as the one chosen at launch and can change per job, because the
 * point of the queue is that the decision lives with whoever is writing the
 * prompts. ChatGPT refuses things Gemini will draw and the reverse is just as
 * true, so "try this one on the other machine" has to be a property of the
 * job rather than something you restart for.
 *
 * Switching needs you signed into both in that Chrome window. If you aren't,
 * it says so and leaves the job for later rather than typing into a login
 * page.
 */
let site = SITES[opt.site] ?? SITES.gemini;

const run = promisify(execFile);

/**
 * The approval, as a real macOS dialog rather than a keypress in a Terminal.
 *
 * Asking someone to find a black window and press Return is asking them to
 * learn where the window went. A dialog comes to the front, names the job, and
 * has two buttons. It is the same gate either way — nothing runs until it is
 * answered — and it falls back to the keyboard on anything that isn't a Mac.
 */
const esc = (t) => t.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

async function ask(title, body) {
  const script =
    `display dialog "${esc(body)}" with title "${esc(title)}" ` +
    `buttons {"Skip", "Pick image…", "Run it"} default button "Run it" ` +
    `with icon note giving up after 3600`;
  try {
    const { stdout } = await run("osascript", ["-e", script]);
    if (/Pick image/.test(stdout)) return "pick";
    if (/Run it/.test(stdout)) return "run";
    return "skip";
  } catch {
    // Cancel, a timeout, or no osascript at all — none of which mean yes.
    return "skip";
  }
}

/**
 * The Finder's own picker.
 *
 * Choosing the reference here rather than naming it in the queue means the
 * picture never has to be uploaded anywhere first, and the person who knows
 * which photo is the right one is the one choosing it.
 */
async function pickImages() {
  const script =
    'set f to choose file with prompt "Pick the reference picture" ' +
    'of type {"public.image"} with multiple selections allowed\n' +
    'set out to ""\n' +
    'repeat with i in f\n' +
    'set out to out & POSIX path of i & linefeed\n' +
    'end repeat\n' +
    'return out';
  try {
    const { stdout } = await run("osascript", ["-e", script]);
    return stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  } catch {
    // Cancelled the picker.
    return [];
  }
}

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


/**
 * Gets files into the composer.
 *
 * This has now failed three ways, so it tries three ways.
 *
 * Clicking the paperclip was first and it broke because the button was found
 * by its English label on an account running Gemini in Greek. Dropping was
 * second and it broke because the handler isn't on the text box — the event
 * has to reach a container further up, or the document.
 *
 * Pasting is first now because it is the one path every one of these editors
 * supports deliberately: people paste screenshots into them all day. It needs
 * no button, no label, and no guess about which element listens.
 *
 * Each attempt is checked rather than assumed. The cost of getting this wrong
 * silently is eight pictures of a product nobody has seen.
 */
async function putFiles(page, paths, wand, label) {
  const TYPES = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };
  const files = [];
  for (const p of paths) {
    files.push({
      name: basename(p),
      type: TYPES[extname(p).toLowerCase()] ?? "image/jpeg",
      data: (await readFile(p)).toString("base64"),
    });
  }

  const before = await blobCount(page);

  // Focus first: a paste goes to whatever has the caret.
  const box = await find(page, site.ask, 8000);
  if (box) await box.click().catch(() => {});
  await page.waitForTimeout(300);

  /**
   * The attach button, found by where it is rather than what it says.
   *
   * Every label-based attempt has broken — English names on a Greek
   * interface, and they change anyway. But the paperclip is always in the
   * same place: a button inside the composer, to the left of the text box,
   * on the same line as it. That is a fact about the layout, and layouts
   * change far more slowly than markup does.
   */
  const plus = async () => {
    const target = await box?.boundingBox().catch(() => null);
    if (!target) return null;
    const buttons = await page.locator("button:not([data-wand])").all().catch(() => []);
    for (const b of buttons) {
      const r = await b.boundingBox().catch(() => null);
      if (!r) continue;
      const sameLine = r.y + r.height > target.y && r.y < target.y + target.height;
      const toTheLeft = r.x < target.x;
      const small = r.width < 90 && r.height < 90;
      if (sameLine && toTheLeft && small && (await b.isVisible().catch(() => false))) return b;
    }
    return null;
  };

  /**
   * Hand the files to the page as a real DataTransfer, either as a paste or
   * as a full drag. Built here rather than at the top because it closes over
   * the files we just read.
   */
  const deliver = (mode) =>
    page.evaluate(({ files, sels, mode }) => {
      const dt = new DataTransfer();
      for (const f of files) {
        const bin = atob(f.data);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        dt.items.add(new File([bytes], f.name, { type: f.type }));
      }

      const box = sels.map((s) => document.querySelector(s)).find(Boolean);
      if (!box) return false;

      if (mode === "paste") {
        box.focus?.();
        box.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt }));
        return true;
      }

      // Walk up from the text box and hit every ancestor, plus the document.
      // Which element carries the drop handler is an implementation detail
      // that changes; the ancestor chain does not.
      const targets = [];
      for (let el = box; el && targets.length < 8; el = el.parentElement) targets.push(el);
      targets.push(document.body, document.documentElement);
      for (const t of targets) {
        for (const type of ["dragenter", "dragover", "drop"]) {
          t.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
        }
      }
      return true;
    }, { files, sels: site.ask, mode }).catch(() => false);

  // 1 — let Chrome open its own file dialog and answer it.
  //
  // This is the only route that works the way a person does: the page opens
  // the picker it would open for anybody, and we hand it the file. Nothing
  // about it depends on the site's markup or its language.
  const clip = await plus();
  if (clip) {
    try {
      const [chooser] = await Promise.all([
        page.waitForEvent("filechooser", { timeout: 6000 }),
        wand?.point(clip),
        clip.click(),
      ]);
      await chooser.setFiles(paths);
      await page.waitForTimeout(2500 + files.length * 1200);
      if ((await blobCount(page)) > before) return "chosen";
    } catch {
      // No dialog appeared — that button was something else. Close whatever
      // it opened before trying the next way, with the stop key deafened:
      // Playwright's Escape is indistinguishable from a person's, so without
      // this the tool hears its own keypress and stops itself mid-run.
      await wand?.deafen(2000);
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(400);
    }
  }

  // 2 — paste it in, the way you'd paste a screenshot
  if (box) await box.click().catch(() => {});
  await deliver("paste");
  await page.waitForTimeout(2200 + files.length * 900);
  if ((await blobCount(page)) > before) return "pasted";

  // 3 — drop, everywhere that might be listening
  await wand?.say(label, "attaching — another way…");
  await deliver("drop");
  await page.waitForTimeout(2200 + files.length * 900);
  if ((await blobCount(page)) > before) return "dropped";

  // 4 — a real file input, if the page keeps one
  const input = page.locator(site.file).first();
  if (await input.count().then((c) => c > 0).catch(() => false)) {
    await wand?.say(label, "attaching — last way…");
    await input.setInputFiles(paths).catch(() => {});
    await page.waitForTimeout(2500 + files.length * 1200);
    if ((await blobCount(page)) > before) return "uploaded";
  }

  return null;
}

/**
 * Did anything actually attach?
 *
 * Both sites show an attachment as a thumbnail built from a blob URL, and
 * neither uses blob URLs anywhere else in an empty composer. Counting them
 * before and after is a cheap, language-proof answer to a question that
 * otherwise only gets answered by the pictures coming out wrong.
 */
async function blobCount(page) {
  return page.evaluate(() => document.querySelectorAll('img[src^="blob:"], video[src^="blob:"]').length).catch(() => 0);
}

async function runPrompt(text, refs, label, n, total, dir, fromCard = 0) {
  await wand.reattach();
  await wand.say(label, `${n} of ${total} — sending…`);

  // A fresh chat per prompt: several shots of one product in one thread makes
  // each picture a reply to the last rather than an answer to the prompt.
  const nw = await find(page, site.fresh, 4000);
  if (nw) { await wand.point(nw); await nw.click().catch(() => {}); await page.waitForTimeout(1600); await wand.reattach(); }

  // Pictures before words: both sites disable send while an upload is running.
  if (fromCard) {
    // Straight from the panel that received them — no disk, no file dialog.
    await wand.say(label, `${n} of ${total} — attaching ${fromCard}…`);
    const before = await blobCount(page);
    const box0 = await find(page, site.ask, 8000);
    if (box0) await box0.click().catch(() => {});
    await wand.give(site.ask, "paste");
    await page.waitForTimeout(2200 + fromCard * 900);
    let ok = (await blobCount(page)) > before;
    if (!ok) {
      await wand.give(site.ask, "drop");
      await page.waitForTimeout(2200 + fromCard * 900);
      ok = (await blobCount(page)) > before;
    }
    console.log(ok
      ? `  attached ${fromCard} (from the card)`
      : `  \x1b[31m!! nothing attached — sending with NO reference image\x1b[0m`);
  } else if (refs.length) {
    await wand.say(label, `${n} of ${total} — attaching ${refs.length}…`);
    const how = await putFiles(page, refs, wand, label);
    if (how) {
      console.log(`  attached ${refs.length} (${how})`);
    } else {
      console.log(`  \x1b[31m!! nothing attached — sending with NO reference image\x1b[0m`);
      await wand.say(label, `${n} of ${total} — couldn't attach, sending anyway`);
      await page.waitForTimeout(1000);
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
  await wand.idle(true);
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

  await wand.idle(false);

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

  // A job can name the site it wants.
  const wanted = job.site && SITES[job.site] ? SITES[job.site] : null;
  if (wanted && wanted !== site) {
    console.log(`\r\x1b[K  switching to ${wanted.name}…`);
    const was = site;
    site = wanted;
    await page.goto(site.url, { waitUntil: "domcontentloaded" }).catch(() => {});
    await wand.reattach();
    if (!(await find(page, site.ask, 20000))) {
      // Not signed in there. Put it back and leave the job alone — it will be
      // offered again once that tab is logged in.
      console.log(`  \x1b[31mnot signed into ${site.name} in this Chrome — sign in and it'll come back\x1b[0m`);
      site = was;
      await page.goto(site.url, { waitUntil: "domcontentloaded" }).catch(() => {});
      await wand.reattach();
      await page.waitForTimeout(POLL_MS);
      continue;
    }
    console.log(`  now on ${site.name}`);
  }
  console.log(`\r\x1b[K`);
  console.log(`\x1b[1m${label}\x1b[0m  \x1b[2m(${site.name})\x1b[0m`);
  console.log(`${job.prompts.length} prompt${job.prompts.length === 1 ? "" : "s"}${job.refs?.length ? `, ${job.refs.length} reference image${job.refs.length === 1 ? "" : "s"}` : ""}:`);
  job.prompts.forEach((p, i) => {
    const first = p.trim().split("\n")[0];
    console.log(`  ${i + 1}. ${first.slice(0, 92)}${first.length > 92 ? "…" : ""}`);
  });
  console.log();

  const summary =
    `${job.prompts.length} prompt${job.prompts.length === 1 ? "" : "s"}` +
    `${job.refs?.length ? `, ${job.refs.length} reference image${job.refs.length === 1 ? "" : "s"}` : ""}\n\n` +
    job.prompts.map((p, i) => `${i + 1}. ${p.trim().split("\n")[0].slice(0, 70)}…`).join("\n");

  // The card in the corner of the page, when the overlay is there to show it.
  // The macOS dialog stays as the fallback for a page that won't take it.
  let answer = wand.mounted
    ? await wand.ask(label, `${job.prompts.length} prompt${job.prompts.length === 1 ? "" : "s"} on ${site.name} — drop your pictures below`)
    : await ask(label, summary);
  if (answer === null) answer = await ask(label, summary);

  // Picking is not the decision — after choosing, it asks again with the
  // chosen file named, so the last thing before anything runs is still a yes.
  let picked = [];
  if (answer === "pick") {
    picked = await pickImages();
    answer = await ask(
      label,
      (picked.length
        ? `Using ${picked.length} picture${picked.length === 1 ? "" : "s"}:\n` +
          picked.map((p) => "  " + p.split("/").pop()).join("\n")
        : "No picture chosen — it will run without a reference.") +
        `\n\n${summary}`,
    );
    if (answer === "pick") answer = "run";
  }

  if (answer !== "run") {
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
  // Three places a reference can come from, in order of who knew best: the
  // picture dropped on the card just now, one chosen in the Finder, then
  // whatever the queue named.
  const inCard = await wand.fileCount();
  const refs = inCard ? [] : picked.length ? picked : await fetchRefs(job.refs, join(dir, "reference"));
  if (inCard) console.log(`  ${inCard} picture${inCard === 1 ? "" : "s"} from the card`);

  let total = 0;
  for (let i = 0; i < job.prompts.length; i++) {
    if (await wand.stopped()) break;
    const got = await runPrompt(job.prompts[i], refs, label, i + 1, job.prompts.length, dir, inCard);
    total += got;
    console.log(`  [${i + 1}/${job.prompts.length}] ${got} image${got === 1 ? "" : "s"}`);
  }

  done.add(job.id);
  await writeFile(DONE_FILE, [...done].join("\n"));
  console.log(`\n\x1b[1m${total} image${total === 1 ? "" : "s"} saved to ${dir}\x1b[0m\n`);
  await wand.say("Waiting", `${label}: ${total} saved. Tell Claude what's next.`);
}

await browser.close();

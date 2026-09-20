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
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { basename, extname } from "node:path";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { promisify } from "node:util";

const QUEUE = process.env.QUEUE || "https://kerberos.gardenbuddystore.workers.dev/wand/0ikn4sXuXNntr2Im2Mil7zRxLBmlCWtu/queue";
/*
 * How long the app is ever allowed to sit still.
 *
 * This was six seconds, and with a two-second order throttle on top of it a
 * correction could take ten seconds to land. The whole point of the wire
 * between Claude and this app is that a wrong picture is caught while it is
 * still on screen, so both numbers come down to where the app answers inside
 * a second and a half.
 */
const POLL_MS = 1200;
/**
 * The smallest thing that can be one of our pictures.
 *
 * A generation from either site is megabytes. Everything else a chat page
 * holds — logos, avatars, sidebar artwork, promotional tiles — measured
 * nineteen to thirty-eight kilobytes when they were being filed as Halloween
 * panels, so this sits well clear of both.
 *
 * It has to be enforced everywhere a picture can enter. The network capture
 * had a floor and the save path had its own of two kilobytes, so a stray that
 * the capture rejected was quietly downloaded instead and saved anyway.
 */
const MIN_PICTURE = 150_000;
/**
 * Orders from Claude, separate from the queue.
 *
 * The queue says what to draw. This says what to do right now — continue,
 * pause, stop, ask for pictures — and it is read every couple of seconds
 * wherever the runner is, including in the middle of waiting for a picture.
 * Each order carries the time it was written, and one is obeyed once: the
 * file staying on the server is not the same order being given again.
 */
/*
 * Where the app says what it is doing.
 *
 * A test run must never land here. The suites point QUEUE and CONTROL at a
 * local fake but had no reason to think about this one, so every `node
 * test/endtoend.mjs` quietly overwrote the real status board with "site: Fake,
 * build: dev" — and anyone reading the board, Claude included, was looking at
 * a test instead of at the Mac. A run with its sites injected is by
 * definition not the real thing, so it reports nowhere unless told to.
 */
const WAND = process.env.WAND || (process.env.WAND_SITES ? "" : "https://kerberos.gardenbuddystore.workers.dev/wand/0ikn4sXuXNntr2Im2Mil7zRxLBmlCWtu");
const CONTROL = process.env.CONTROL || `${WAND}/order`;
const RUNTIME = process.env.RUNTIME || (WAND ? `${WAND}/runtime` : "");

/**
 * The app updating itself, with nobody closing anything.
 *
 * This is the whole answer to the complaint that every fix costs a relaunch.
 * The runner asks the shop what the current build is; when that is not the
 * build it is running, it fetches the files named there, writes them next to
 * itself, and exits with 97 — a code its launcher treats as "go round again".
 * From the outside the window blinks and the app is new, mid-sitting, with the
 * queue and the Chrome window both untouched.
 *
 * Two rules keep it from being a way to break the app remotely: it only ever
 * writes files whose names it already knows, and a file that does not look
 * like the script it replaces is thrown away rather than written.
 */
async function selfUpdate(loud = false) {
  if (!RUNTIME) return false;
  const now = await getJson(RUNTIME);
  if (!now?.build || String(now.build) === String(BUILD)) {
    if (loud) log(`\r\x1b[K  \x1b[2malready on build ${BUILD}\x1b[0m`);
    return false;
  }
  const want = now.files && typeof now.files === "object" ? now.files : {};
  const allowed = ["live.mjs", "wand.mjs"];
  const got = [];
  for (const name of allowed) {
    const url = want[name];
    if (typeof url !== "string" || !/^https:\/\//.test(url)) continue;
    const text = await fetch(url).then((r) => (r.ok ? r.text() : "")).catch(() => "");
    // A truncated download is worse than no download: it replaces a working
    // app with a file that will not parse, and the restart loop then spins.
    if (text.length < 2000 || !text.includes("export") && !text.includes("async function")) continue;
    got.push([name, text]);
  }
  if (got.length !== allowed.length) {
    log(`\r\x1b[K  \x1b[33mbuild ${now.build} is out but its files did not come down cleanly — staying on ${BUILD}\x1b[0m`);
    return false;
  }
  for (const [name, text] of got) await writeFile(join(process.cwd(), name), text).catch(() => {});
  // The launcher reads this on the way back round, so the restarted process
  // reports the build it is actually running rather than the one it replaced.
  await writeFile(join(process.cwd(), "build.txt"), String(now.build)).catch(() => {});
  log(`\r\x1b[K  \x1b[35mbuild ${now.build} — updating and restarting\x1b[0m`);
  report("updating", { from: BUILD, to: String(now.build) });
  await wait(400);
  process.exit(97);
}

/**
 * Saying, out loud, what it is doing.
 *
 * Every problem with this app so far arrived as a photograph of a screen,
 * because nothing came back from the Mac. It posts a line after every step
 * now — the job, the prompt it is on, what it is waiting for, and the last
 * few things it printed — so the answer to "what is he waiting for" is a
 * question Claude can answer by looking instead of by guessing.
 *
 * It is fire-and-forget on purpose. A status board that can hold up the run
 * it is reporting on is worse than no status board.
 */
const tail = [];
function note(line) {
  tail.push(line);
  if (tail.length > 40) tail.shift();
}
let said = "";
let sayAt = 0;
function report(state, extra = {}) {
  const now = Date.now();
  // Keyed on everything, not just the state word: two different errors inside
  // five seconds are two different things to say, and dropping the second one
  // shows the wrong cause on the board.
  if (!WAND) return;
  const key = state + JSON.stringify(extra);
  if (key === said && now - sayAt < 5000) return;
  said = key;
  sayAt = now;
  const stop = new AbortController();
  // Cleared on the way out: an abort timer nobody clears keeps the process
  // alive for its full length after everything else has finished.
  const timer = setTimeout(() => stop.abort(), 5000);
  fetch(`${WAND}/status`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ state, build: BUILD, site: site?.name, ...extra, tail: tail.slice(-20) }),
    signal: stop.signal,
  }).catch(() => {}).finally(() => clearTimeout(timer));
}

/**
 * A finished picture, sent up to the shop as well as saved to disk.
 *
 * Fire and forget, with a deadline: the run is not held up by an upload, and
 * a failed one costs nothing because the picture is on the disk either way.
 */
function sendShot(dir, name, bytes, kind = "png") {
  // Same reason as report(): a test's fake pictures do not belong in the
  // shop's shot store, where Claude reads them back as real work.
  if (!WAND) return;
  const job = dir.split("/").filter(Boolean).pop() || "run";
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), 30000);
  fetch(`${WAND}/shot?job=${encodeURIComponent(job)}&name=${encodeURIComponent(name)}`, {
    method: "POST",
    // The real type, not always PNG: a JPEG served as image/png is a file
    // the shop then has to guess about.
    headers: { "content-type": `image/${kind === "jpg" ? "jpeg" : kind}` },
    body: bytes,
    signal: stop.signal,
  }).catch(() => {}).finally(() => clearTimeout(timer));
}

/** Printed and reported in one go, so the two can never disagree. */
function log(line) {
  console.log(line);
  note(line.replace(/\x1b\[[0-9;]*m/g, ""));
}
let lastOrder = 0;
let baselined = false;
let orderAt = 0;
/**
 * Fetch that cannot hang.
 *
 * Both the queue and the control file are read from inside loops that the
 * whole run waits on. A request with no deadline on a flaky connection stops
 * everything for as long as the network feels like it, which from the outside
 * is the app locked up doing nothing — so nothing here waits more than five
 * seconds for a small JSON file.
 */
async function getJson(url) {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), 5000);
  try {
    const res = await fetch(`${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`, {
      cache: "no-store",
      signal: stop.signal,
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function obey() {
  if (Date.now() - orderAt < 700) return;
  orderAt = Date.now();
  // Every heartbeat is also the moment to notice the overlay was replaced by a
  // navigation and to hand its Pause or Stop back to it.
  await syncWand(wand).catch(() => {});
  const o = await getJson(CONTROL);
  /*
   * Whatever was sitting there when we started is history, not an
   * instruction — but "when we started" cannot be judged by comparing the
   * server's clock to this Mac's. They are never the same, and a Mac a minute
   * behind ignores every order it is ever given.
   *
   * So the first read is a baseline, whatever it holds, and only a later
   * change counts as somebody saying something. Note the baseline is taken
   * even when there is no order stored at all, or the first real order would
   * be swallowed as if it had always been there.
   */
  // A failed read is not a baseline. Taking one from a null answer set the
  // mark to zero, and the next successful poll then replayed whatever order
  // was last left on the server — yesterday's "stop", at launch.
  if (o === null) return;
  if (!baselined) {
    baselined = true;
    lastOrder = Number(o?.at) || 0;
    return;
  }
  if (!o?.cmd || !Number(o.at) || Number(o.at) <= lastOrder) return;
  lastOrder = Number(o.at);
  const cmd = String(o.cmd);

  // Where to be is the runner's business; the page only knows its own buttons.
  let did = false;
  try {
    if (cmd === "chatgpt" || cmd === "gemini") {
      did = await switchSite(cmd);
      // An order names the site on purpose, usually because the other one is
      // rate limited. That choice outranks whatever "site" the queued jobs
      // happen to carry, which otherwise switched straight back on the next
      // job and looked like the app changing sites by itself.
      if (did) {
        siteHeld = cmd;
        // To disk, so a restart or an update does not undo it.
        writeFile(SITE_FILE, cmd).catch(() => {});
        log(`  \x1b[2mstaying on ${site.name} until you say otherwise\x1b[0m`);
      }
    }
    else if (cmd.startsWith("goto ")) did = await goTo(cmd.slice(5).trim());
    // No navGen bump: unpin moves nothing. Counting it as a move abandoned
    // the picture that was already being drawn in the chat we are still in.
    else if (cmd === "unpin") { pinnedChat = null; did = true; }
    /**
     * A clean slate on the site it is already on.
     *
     * A long thread drifts: twenty pictures in, the model is answering the
     * last picture rather than the prompt. This opens a fresh conversation
     * and lets the run carry on into it — no new job, no restart, and the
     * next prompt re-attaches whatever that part needs because the pin and
     * the attached flag are both cleared.
     */
    else if (cmd === "newchat") {
      if (await freshChat("couldn't open a new chat")) {
        watchImages(page);
        wand = await attachWand(page);
        pinnedChat = null;
        attachedInChat = false;
        // A new conversation holds no pictures, so nothing is a duplicate in it.
        chatRefs = new Set();
        navGen++;
        did = true;
      }
    }
    else if (/^redo \d+$/.test(cmd)) {
      const n = Number(cmd.slice(5));
      if (n >= 1) { redoAt = n - 1; reload = true; did = true; }
    }
    // Claude has rewritten the job that is running. Re-read it and use the new
    // words from the next shot on.
    else if (cmd === "requeue") { reload = true; did = true; }
    else if (cmd === "update") { did = await selfUpdate(true); }
    else {
      did = await wand.order(cmd);
      /*
       * An order from Claude is obeyed whether or not the page can hear it.
       *
       * Pause, Continue and Stop live in the overlay, and the runner reads
       * the overlay to know which state it is in. When a navigation throws
       * the overlay out, order() reaches nothing -- and the held state keeps
       * whatever it last saw. A run paused at that moment stayed paused for
       * good: every Continue was delivered to a page that no longer had an
       * overlay on it, the runner went on believing it was paused, and the
       * app sat there unreachable with its own buttons gone too.
       *
       * So the three that decide whether work happens are applied to the
       * runner's own state as well, after one attempt to put the overlay
       * back. The page is where they are SHOWN; it is not where they are
       * decided.
       */
      if (!did && (cmd === "continue" || cmd === "pause" || cmd === "stop")) {
        await wand.reattach().catch(() => {});
        did = await wand.order(cmd);
        if (!did) {
          if (cmd === "continue") { held.paused = false; held.stopped = false; }
          if (cmd === "pause") held.paused = true;
          if (cmd === "stop") { held.stopped = true; held.paused = false; }
          did = true;
          log(`  \x1b[33m!! the panel could not be reached — ${cmd} applied anyway\x1b[0m`);
        }
      }
    }
  } catch (e) {
    // Chrome going away in the middle of a goto is the usual one. The order
    // is spent either way; the job it interrupted is not.
    log(`\r\x1b[K  \x1b[31m!! ${cmd}: ${String(e?.message ?? e).split("\n")[0]}\x1b[0m`);
  }
  log(`\r\x1b[K  \x1b[35mClaude: ${o.cmd}\x1b[0m${did ? "" : " (nothing to do)"}`);
  report(did ? `did: ${o.cmd}` : `ignored: ${o.cmd}`, { order: o.cmd, obeyed: did });
}
/*
 * The chat this run belongs to.
 *
 * Without it the app is loyal to a tab rather than to a conversation, and a
 * tab is a thing that closes. `ensurePage` then grabbed whatever ChatGPT tab
 * was most recently opened and carried on there, so a run told to work in one
 * chat quietly finished somewhere else — which is exactly what it looks like
 * from outside when four pictures end up in four threads.
 *
 * Pinned, the address is the thing being followed. A closed tab is reopened on
 * the same conversation, and a job that named a chat keeps working in it for
 * its whole length rather than for its first prompt.
 */
let pinnedChat = null;
/** A site named by an order, which a job's own "site" is not allowed to undo. */
let siteHeld = null;
/**
 * The reference pictures this conversation already holds, by their contents.
 *
 * Parts of a job share pictures — every product's part carries the same brand
 * mark — and they were re-uploaded for each one, so a five product run put the
 * same file up five times. That is five uploads of quota, five more thumbnails
 * in the composer to scroll past, and five more chances to trip the site's
 * limit on how many files one message may carry.
 *
 * Keyed on the bytes rather than the path, because each part downloads its
 * copy into its own folder: the same picture arrives under five different
 * names. Emptied whenever the conversation changes, since a new chat holds
 * nothing.
 */
let chatRefs = new Set();
function refKey(path) {
  try {
    return createHash("sha1").update(readFileSync(path)).digest("hex");
  } catch {
    // Unreadable means "cannot prove it is a duplicate", and the safe answer
    // to that is to attach it.
    return `unreadable:${path}:${Math.random()}`;
  }
}
/**
 * Bumped by anything that moves the app somewhere else on purpose — a site
 * switch, a goto, an unpin. A prompt that was waiting for its pictures when
 * that happened is looking at a different conversation now, and whatever is
 * there is not its answer.
 */
let navGen = 0;

const BUILD = process.env.WAND_BUILD || "dev";
/** No cards, no Submit, no waiting on a person. Set WAND_ASK=1 to get them back. */
const AUTO = process.env.WAND_ASK !== "1";
/**
 * A shot Claude has asked for again, while the run is still going.
 *
 * `redo 7` sets this to 6 (zero-based). The prompt loop notices it at the top
 * of its next turn, jumps back to that shot, redraws it with whatever the
 * queue now says shot seven is, and carries on from where it had got to. No
 * stop, no requeue, no relaunch — which is the only reason any of the rest of
 * this file is worth reading.
 */
let redoAt = null;
/** Set when Claude rewrites the running job. The loop picks up the new words. */
let reload = false;
const MIN_PIXELS = 320;

/**
 * A pause that never throws.
 *
 * `page.waitForTimeout` on a tab that has been closed rejects, and every one
 * of those was sitting unguarded inside the main loop — so closing the tab
 * killed the app with a stack trace instead of it noticing and finding
 * another tab.
 */
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Every image the browser has actually loaded, kept by url.
 *
 * This is the strongest way to get a generation onto the disk and it was
 * missing. Gemini's host refuses a script request and often refuses node's
 * too, which is how the app ended up photographing the screen and baking its
 * own overlay into product photographs. The browser is not refused — it is
 * the one displaying the picture — so the bytes are already in hand before
 * anybody asks for them.
 *
 * Bounded: the biggest few hundred images, oldest dropped first, so a long run
 * cannot eat the machine's memory.
 */
/**
 * Pause and Stop, kept here as well as in the page.
 *
 * The overlay is re-injected on every navigation with its flags cleared, so a
 * paused run that hit a fresh chat, a goto or a reload came back un-paused and
 * carried on typing. This is the copy that survives; `syncWand` puts it back
 * whenever it notices a new mount.
 */
const held = { paused: false, stopped: false, running: false, title: "Ready", body: "Waiting." };
let sayUntil = 0;
let lastEpoch = 0;
async function syncWand(w) {
  if (!w) return;
  const epoch = await w.epoch().catch(() => 0);
  if (epoch && epoch !== lastEpoch) {
    // A new mount knows nothing at all. Push the whole state into it and read
    // nothing back this turn — a blank mount's "not paused" would otherwise
    // become the truth, which is how a pause pressed a second before a
    // navigation used to disappear for good.
    lastEpoch = epoch;
    await w.restore(held).catch(() => {});
    return;
  }
  const paused = await w.paused();
  const stopped = await w.stopped();
  // null is "could not ask", and it changes nothing.
  if (paused !== null) held.paused = paused;
  if (stopped !== null) held.stopped = stopped;
}

/**
 * Say something, and remember having said it.
 *
 * The caption lives in the page, so a navigation wipes it and the panel reads
 * "Ready / Waiting." in the middle of a job. Keeping the last thing said here
 * means the next mount gets it back with the rest of the state.
 */
async function say(title, body, urgent = false) {
  if (!urgent && Date.now() < sayUntil) return;
  sayUntil = Date.now() + 600;
  held.title = title;
  held.body = body;
  await wand.say(title, body);
}

const CAPTURED = new Map();
const CAPTURE_MAX = 240;
/** …and at most this many bytes of them. */
const CAPTURE_BYTES = 400 * 1024 * 1024;
let capturedBytes = 0;
const watched = new WeakSet();
function watchImages(target) {
  if (!target || watched.has(target)) return;
  watched.add(target);
  target.on("response", async (res) => {
    try {
      const type = res.headers()["content-type"] ?? "";
      if (!type.startsWith("image/")) return;
      const body = await res.body().catch(() => null);
      /*
       * Thumbnails and icons are not generations — and neither is most of
       * what a chat page loads.
       *
       * The floor was twenty kilobytes, which let through every logo, avatar,
       * sidebar preview and stray photograph the page happened to fetch. On
       * ChatGPT those arrived in the middle of a run and were saved as the
       * second capture of a prompt: a run of ours came back with an agency
       * logo and a photograph of somebody's office filed as Halloween
       * pictures. A real generation from either site is hundreds of kilobytes
       * at least, so the floor is where it should always have been.
       */
      if (!body || body.length < MIN_PICTURE) return;
      CAPTURED.set(res.url(), body);
      capturedBytes += body.length;
      // Bounded by weight as well as by count: two hundred four-megabyte
      // renders is most of a laptop's memory, and the count alone would have
      // allowed it.
      while (CAPTURED.size > CAPTURE_MAX || capturedBytes > CAPTURE_BYTES) {
        const oldest = CAPTURED.keys().next().value;
        capturedBytes -= CAPTURED.get(oldest)?.length ?? 0;
        CAPTURED.delete(oldest);
      }
    } catch {
      /* a body we cannot read is simply not captured */
    }
  });
}

const SITES = {
  gemini: {
    name: "Gemini",
    url: "https://gemini.google.com/app",
    ask: ['div.ql-editor[contenteditable="true"]', 'rich-textarea div[contenteditable="true"]', "textarea"],
    send: ['button[aria-label*="Send" i]', 'button[aria-label*="Submit" i]', "button.send-button"],
    /*
     * Starting a fresh conversation.
     *
     * The aria-label was the whole list, and when Gemini renamed that control
     * the order came back "nothing to do" — quietly, while every prompt in a
     * newChat:"each" job kept landing in one long conversation. Gemini then
     * answers from what it drew before instead of from the words it was just
     * given: a rewritten prompt comes back as the old picture with the old
     * mistakes on it, which reads as the rewrite being ignored.
     *
     * So: the test id first, then the side-nav button it lives in, then the
     * label in either English or the user's own language, and the home link
     * last — that one always opens a new conversation even if it is slower.
     */
    fresh: [
      'button[data-test-id="new-chat-button"]',
      '[data-test-id="new-chat-button"]',
      'side-nav-action-button[data-test-id="new-chat-button"] button',
      'button[aria-label*="New chat" i]',
      'a[aria-label*="New chat" i]',
      'button[aria-label*="Νέα συνομιλία" i]',
      'a[href="/app"]',
    ],
    file: ['input[type="file"]:not([data-wand])'],
    /** The paperclip. Gemini only puts a file input in the page once this is open. */
    attach: ['button[aria-label*="Open upload" i]', 'button[aria-label*="upload" i]', 'button[aria-label*="Add files" i]', 'uploader-button button', 'button.upload-card-button'],
    /** And then the menu item inside it. */
    attachItem: ['button[aria-label*="Upload file" i]', 'text=Upload files', 'text=Μεταφόρτωση αρχείων'],
    /* Same reasoning as ChatGPT's: big, on the page, and not there before. */
    images: ["img"],
    /** Where an answer can appear. A picture outside these is not a result. */
    results: ["model-response img", ".response-container img", "img"],
    /** Our own turn. The reference comes back re-rendered here after a send,
     *  bigger than the threshold and with a brand new src — which the old
     *  code happily saved as the generation and then moved on. */
    mine: ["user-query", ".user-query-container", '[data-test-id="user-query"]'],
    /** Still drawing. Leaving while this is up is leaving before the picture. */
    busy: ['button[aria-label*="Stop" i]', 'mat-icon[data-mat-icon-name="stop"]'],
    /**
     * Gemini's own download button, on the image card.
     *
     * Its image host refuses a script request and often refuses node's too,
     * and the fallback was a photograph of the screen — which bakes the
     * composer bar, the model picker and this app's own overlay into what is
     * supposed to be a product photograph. Those are unusable, and worse,
     * they look usable. Clicking the button the site puts there itself gets
     * the real file, because a click is a click.
     */
    save: [
      'button[aria-label*="Download" i]',
      'button[aria-label*="Λήψη" i]',
      'button[data-test-id="download-button"]',
      'button[aria-label*="Save image" i]',
    ],
  },
  chatgpt: {
    name: "ChatGPT",
    url: "https://chatgpt.com/",
    ask: ['div#prompt-textarea[contenteditable="true"]', "textarea#prompt-textarea", "textarea"],
    send: ['button[data-testid="send-button"]', 'button[data-testid="composer-submit-button"]', 'button[aria-label*="Send" i]'],
    // The button first, the logo link only as a fallback: clicking the logo
    // is a full page load, which throws the overlay out and costs a second.
    fresh: ['button[data-testid="create-new-chat-button"]', 'a[data-testid="create-new-chat-button"]', 'button[aria-label*="New chat" i]', 'a[aria-label*="New chat" i]', 'a[href="/"]'],
    file: ['input[type="file"]:not([data-wand])'],
    attach: ['button[aria-label*="Upload" i]', 'button[aria-label*="Attach" i]', 'button[data-testid="composer-plus-btn"]'],
    /** Where an answer can appear. */
    results: ['[data-message-author-role="assistant"] img', "img"],
    /** Our own turn — never a result. */
    mine: ['[data-message-author-role="user"]'],
    /**
     * Things that sit over the page and swallow every click.
     *
     * The upload limit banner and the "drop a file here" curtain both do it,
     * and while either is up the app is not being refused by the site — it
     * simply cannot reach anything. Naming them means they can be cleared
     * rather than waited out.
     */
    /*
     * Only things that genuinely cover the page.
     *
     * [role="alert"] was in this list and it should never have been: the site
     * keeps polite, harmless alert nodes around, so the app decided the page
     * was blocked on every single prompt, failed to "clear" something that
     * was not in the way, and opened a clean chat each time — which is the
     * new chat per picture that this whole app exists to avoid.
     *
     * Named states only, and even then the decision below is made by trying
     * the composer rather than by trusting this list.
     */
    blocked: ['text=Unable to upload', 'text=uploads at a time', 'text=Drop any file here'],
    dismiss: [
      '[role="alert"] button',
      'button[aria-label*="Dismiss" i]',
      'button[aria-label*="Close" i]',
      'button:has(svg[aria-label*="close" i])',
    ],
    /** Still drawing. */
    busy: ['button[data-testid="stop-button"]', 'button[aria-label*="Stop" i]'],
    // The plus opens a menu; the first item is the one that takes a file.
    /**
     * The menu item inside the plus.
     *
     * ChatGPT renames these with every redesign, and a miss used to stall the
     * whole run on a thirty-second click that could never land. More spellings
     * here, and the attach step gives up quickly rather than holding the job:
     * the reference is usually already in the chat anyway.
     */
    attachItem: [
      'text=Add photos & files',
      'text=Add photos and files',
      'text=Upload from computer',
      'text=Upload files',
      'text=Upload file',
      '[role="menuitem"]:has-text("Upload")',
      '[role="menuitem"]:has-text("photos")',
    ],
    /*
     * Finished pictures, found by where they are rather than where they came
     * from.
     *
     * Every version of this that named a host went stale: the CDN subdomain
     * rotates, the alt text changes with a redesign, and lately the picture
     * is served straight off chatgpt.com through an API path that matches
     * nothing. Meanwhile the run sat there saying "still waiting" with the
     * picture on the screen in front of it.
     *
     * A picture in the conversation, big enough to be a picture, is a result.
     * The named ones stay in front because they are exact when they work, and
     * anything that was on screen before the prompt went out is excluded
     * already — so the composer thumbnail and the avatars cannot get in.
     */
    /*
     * Anything on the page big enough to be a picture.
     *
     * Three versions of this have gone stale in a week — the CDN host, the
     * alt text, then `main`, when ChatGPT started serving the result through
     * its own API path from a container that isn't main. Each time the
     * picture was on the screen and the app sat there saying "still waiting".
     *
     * So it stops trying to describe where a result comes from. Every image
     * on the page is a candidate; the size filter throws out the avatars and
     * the icons, and everything that was on screen before the prompt went out
     * — the composer thumbnail, the reference, every earlier answer — is
     * excluded by name. What is left can only be new and can only be big,
     * which is the actual definition of the thing being looked for.
     */
    images: ["img"],
  },
};

/*
 * Extra sites, for the test harness.
 *
 * The end-to-end test needs somewhere to run that is not somebody's real
 * ChatGPT account. It hands the runner one through the environment rather
 * than the code carrying a fake site around in it.
 */
if (process.env.WAND_SITES) {
  try { Object.assign(SITES, JSON.parse(process.env.WAND_SITES)); } catch { /* ignore a bad one */ }
}

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
/**
 * The site to work on, remembered across restarts.
 *
 * An order naming a site was held in memory only, so every update and every
 * restart forgot it and fell back to the built-in default. The owner has no
 * Gemini quota left; the app kept reopening Gemini anyway, once per restart,
 * and each time it was a run wasted and a thing to notice and correct by
 * hand. A preference stated out loud should outlive the process that heard
 * it.
 */
/*
 * Beside this file, not beside whatever folder the app happened to start in.
 *
 * This was the bare name ".site", which resolves against the working
 * directory -- and that is not the same place twice. Launched from Finder a
 * Mac app gets "/" or the bundle; launched from a terminal it gets wherever
 * you were standing. So the choice was written to one place and looked for in
 * another, and every restart forgot it and opened the default site again.
 *
 * The runtime folder holds this very file, so deriving the path from
 * import.meta.url puts the note next to the code that reads it, wherever that
 * turns out to be.
 */
const SITE_FILE = fileURLToPath(new URL(".site", import.meta.url));
let siteRemembered = null;
try {
  const saved = readFileSync(SITE_FILE, "utf8").trim();
  if (SITES[saved]) siteRemembered = saved;
} catch {
  /* nothing remembered yet, which is the normal first run */
}
if (siteRemembered) console.log(`  \x1b[2mopening ${SITES[siteRemembered].name}, as last ordered\x1b[0m`);
let site = SITES[opt.site] ?? (siteRemembered ? SITES[siteRemembered] : null) ?? SITES.gemini;
// A remembered site is a held site: a job's own "site" must not undo a choice
// the owner made out loud, whether they made it a minute ago or last week.
if (siteRemembered && !opt.site) siteHeld = siteRemembered;

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
    // An hour with nobody at the Mac is not a decision. `gave up:true` came
    // back as Skip, which wrote the job into .done-jobs and refused it for
    // the rest of the sitting — the job was never seen, let alone declined.
    if (/gave up:true/.test(stdout)) return "wait";
    return "skip";
  } catch {
    // Cancel, or no osascript at all (this runs on a Mac, but a shell without
    // it is a broken install, not a no). Neither means yes, and neither means
    // throw the job away: it comes back round on the next poll.
    return "wait";
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
    await wait(400);
  }
  return null;
}

/**
 * Chrome, waited for rather than demanded.
 *
 * The app starts Chrome and this script at almost the same moment, so losing
 * that race by half a second used to print "nothing listening on port 9222"
 * and quit — which reads, from the Dock, as an app that does not work. It
 * tries for a minute now, and says what it is waiting for while it does.
 */
let browser;
for (let go = 1; ; go++) {
  try {
    browser = await chromium.connectOverCDP(`http://localhost:${opt.port}`);
    break;
  } catch {
    if (go === 1) console.log(`\nWaiting for Chrome on port ${opt.port}…`);
    if (go > 30) {
      console.error(`\nNothing listening on port ${opt.port} after a minute. Start Chrome with the debug port first.\n`);
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

let context = browser.contexts()[0] ?? (await browser.newContext());
let page = null;

/*
 * The waiting job decides which site opens.
 *
 * Starting on Gemini and switching later meant a run written for ChatGPT
 * still opened a Gemini tab first, waited for a sign-in there, and only then
 * moved — which from the outside is the app doing the opposite of what it was
 * told. One look at the queue before anything opens fixes it.
 */
{
  // Offline at launch: whatever was asked for on the command line stands.
  const first = await getJson(QUEUE);
  if (first?.site && SITES[first.site] && !done.has(first.id)) site = SITES[first.site];
}

/*
 * A chat that is already open is the one to work in.
 *
 * Opening a fresh tab throws away the thread that holds the reference
 * picture and everything drawn so far, which is exactly what you do not want
 * when a laptop lid closed halfway through forty-four shots. So the tabs are
 * searched for this site first, and only if there isn't one does a new one
 * get opened.
 */
const host = new URL(site.url).host;
for (const open of context.pages()) {
  try { if (new URL(open.url()).host === host) { page = open; break; } } catch { /* about:blank */ }
}
if (page) {
  console.log(`\n\x1b[2mpicking up the ${site.name} tab you already have open\x1b[0m`);
  await page.bringToFront().catch(() => {});
} else {
  page = await context.newPage();
  await page.goto(site.url, { waitUntil: "domcontentloaded" });
}

/*
 * Not signed in, or not on a chat page yet. This used to close the browser and
 * quit — closing the browser being your Chrome, with your tabs in it. It waits
 * instead, and says so, because the fix is something you do in that window and
 * it should be there when you do it.
 */
if (!(await find(page, site.ask, 20000))) {
  console.log(`\n\x1b[33mNo message box on ${site.name} yet.\x1b[0m`);
  console.log(`Sign in, or open a chat, in that Chrome window. This keeps looking.\n`);
}

watchImages(page);
let wand = await attachWand(page);

/*
 * A new conversation, guaranteed.
 *
 * Clicking the site's own New chat control is the good path — it is instant
 * and it keeps the tab. But that control gets renamed, and when the selector
 * stopped matching the failure was silent: a job asking for a fresh chat per
 * prompt quietly ran every prompt in one long conversation, where the model
 * answers from the picture it drew last rather than from the words it was
 * just handed. A rewritten prompt then comes back as the old picture with the
 * old mistakes still on it, and nothing anywhere says why.
 *
 * So when the button cannot be found we go to the site's own address instead.
 * It costs a page load and it always works. Returns false only when even that
 * failed, and then it says so out loud rather than reporting nothing to do.
 */
async function freshChat(why = "couldn't start a new chat") {
  const nw = await find(page, site.fresh, 4000);
  if (nw) {
    await wand.point(nw);
    await nw.click({ timeout: 4000 }).catch(() => {});
    await wait(1600);
    await wand.reattach().catch(() => {});
    return true;
  }
  try {
    await page.goto(site.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await wait(2200);
    await wand.reattach().catch(() => {});
    log(`\r\x1b[K  \x1b[2mnew chat by reloading ${site.name}\x1b[0m`);
    return true;
  } catch (e) {
    log(`\r\x1b[K  \x1b[31m!! ${why}: ${String(e?.message ?? e).split("\n")[0]}\x1b[0m`);
    return false;
  }
}
await mkdir(opt.out, { recursive: true });

/**
 * Make sure we are still working in a tab that exists, on the site we want.
 *
 * The runner held on to whichever tab it found at launch. Close that tab, or
 * open the chat in a second one, and everything after that happened somewhere
 * nobody was looking: the overlay drew on a dead page, the clicks went
 * nowhere, and from the front it was an app that had simply stopped caring.
 *
 * Every loop asks this first. It prefers the tab already in hand, then any
 * other open tab on the same site, and only opens a new one when there is
 * nothing to work with. The overlay follows the page it finds.
 */
/**
 * The conversation part of a chat URL, so query strings do not split a match.
 *
 * Google's account prefix is dropped with it. `/u/1/app/<id>` and
 * `/app/<id>` are the same conversation seen from two signed-in accounts, and
 * treating them as different ones meant a pinned chat was reopened in a loop
 * on any Mac with more than one Google account.
 */
function chatKey(u) {
  try {
    const x = new URL(u);
    return x.host + x.pathname.replace(/^\/u\/\d+/, "");
  } catch { return null; }
}

/** Is this the site's own front page rather than a conversation in it? */
function isFront(u) {
  const k = chatKey(u);
  return !k || k === chatKey(site.url);
}

async function ensurePage() {
  const host = new URL(site.url).host;
  const ok = (pg) => {
    if (!pg || pg.isClosed()) return false;
    try { return new URL(pg.url()).host === host; } catch { return false; }
  };

  // A pinned chat outranks the tab we happen to be holding. The old code
  // returned early on any live tab of the right host, which is how a run
  // drifted out of the conversation it was told to work in and never came
  // back — the drift was invisible because nothing was ever "lost".
  if (pinnedChat) {
    const want = chatKey(pinnedChat);
    if (ok(page) && chatKey(page.url()) === want) return true;

    const onChat = context.pages().filter((pg) => ok(pg) && chatKey(pg.url()) === want);
    if (onChat.length) {
      page = onChat[onChat.length - 1];
      console.log(`\r\x1b[K  \x1b[2mback on the chat this job belongs to\x1b[0m`);
    } else {
      console.log(`\r\x1b[K  \x1b[2mreopening the chat this job belongs to\x1b[0m`);
      if (!ok(page)) page = await context.newPage().catch(() => null);
      if (!page) return false;
      await page.goto(pinnedChat, { waitUntil: "domcontentloaded" }).catch(() => {});
      await wait(1200);
      // A site is free to answer a chat address with a different one — a
      // deleted thread goes to the front page, another account's goes to
      // /u/1/, chat.openai.com goes to chatgpt.com. Left as it was, the pin
      // never matched the page and every check here reloaded it, forever.
      // So the pin follows where the site actually put us, or lets go.
      await page.bringToFront().catch(() => {});
        watchImages(page);
  wand = await attachWand(page);
      // Only a page with a message box in it is somewhere this app can work,
      // and that has to be settled before the pin is allowed to move. A
      // signed-out session answers a chat address with a login page, and
      // re-pinning to that made every prompt for the rest of the morning fail
      // with "no message box" while the app insisted it was pinned.
      const usable = Boolean(await find(page, site.ask, 15000));
      if (!usable) return false;
      const landed = chatKey(page.url());
      if (landed !== want) {
        if (!isFront(page.url())) {
          console.log(`\r\x1b[K  \x1b[2mthe chat moved — following it\x1b[0m`);
          pinnedChat = page.url();
        } else {
          console.log(`\r\x1b[K  \x1b[33mthat chat is gone — carrying on without it\x1b[0m`);
          pinnedChat = null;
        }
      }
      return true;
    }
    await page.bringToFront().catch(() => {});
    watchImages(page);
    wand = await attachWand(page);
    return Boolean(await find(page, site.ask, 15000));
  }

  if (ok(page)) return true;

  // Asking a dead context for its pages throws; that is the same closed-browser
  // case, and it is the loop's job to wait for Chrome, not this function's to
  // die of it.
  if (!(await alive()) && !(await reconnect("Chrome is not answering"))) return false;
  const found = context.pages().filter(ok);
  // A tab that is inside a conversation beats one sitting on the front page.
  //
  // With no pin to go back to, this used to take the most recent tab whatever
  // was in it, and if none was usable it opened the front page — which on
  // Gemini IS a new chat. Mid-run that threw away the references and
  // everything the model had been told about the product, silently, and the
  // next picture came back drawn by a model that had never seen the brief.
  // So: prefer a tab already in a conversation, and only ever open the front
  // page when there is genuinely nothing else.
  const inChat = found.filter((pg) => { try { return !isFront(pg.url()); } catch { return false; } });
  const pool = inChat.length ? inChat : found;
  const next = pool[pool.length - 1] ?? null;
  if (next) {
    page = next;
    console.log(`\r\x1b[K  \x1b[2mmoved to your other ${site.name} tab\x1b[0m`);
  } else {
    // Loud, not quiet: this is the one path that legitimately starts a new
    // conversation without being asked, so it should never again be something
    // only noticed later by looking at the pictures.
    console.log(`\r\x1b[K  \x1b[33mno ${site.name} conversation left open — starting a new chat\x1b[0m`);
    page = await context.newPage().catch(() => null);
    if (!page) {
      // The browser is gone, whatever it claims. Reconnect and try once more;
      // if Chrome really is not there, say so and let the loop wait for it
      // rather than throwing the run away.
      if (!(await reconnect("Chrome is not answering"))) return false;
      page = await context.newPage().catch(() => null);
      if (!page) return false;
    }
    await page.goto(site.url, { waitUntil: "domcontentloaded" }).catch(() => {});
  }
  await page.bringToFront().catch(() => {});
  watchImages(page);
  wand = await attachWand(page);
  return Boolean(await find(page, site.ask, 15000));
}

/**
 * Get back to Chrome.
 *
 * `browser.isConnected()` can still say yes while the window it described is
 * gone — quit Chrome and reopen it and the old CDP session survives just long
 * enough to hand out a context whose every call throws "Target page, context
 * or browser has been closed". That exact error ended a run on the owner's
 * machine, out of `ensurePage`, where nothing was catching it.
 *
 * So reconnecting is a function rather than a branch of the main loop, and
 * anything that touches the browser can ask for it.
 */
async function reconnect(why = "Chrome went away") {
  log(`  \x1b[33m${why} — reconnecting…\x1b[0m`);
  report("reconnecting", { waitingFor: "Chrome on the debug port" });
  try {
    browser = await chromium.connectOverCDP(`http://localhost:${opt.port}`);
    context = browser.contexts()[0] ?? (await browser.newContext());
    page = null;
    return true;
  } catch {
    return false;
  }
}

/** Is this connection actually usable, or only pretending to be? */
async function alive() {
  if (!browser?.isConnected()) return false;
  try {
    context.pages();
    return true;
  } catch {
    return false;
  }
}

/**
 * Move to the other chat site, live.
 *
 * Switching used to be a thing only a queued job could ask for, which meant
 * "enough of ChatGPT, open Gemini" had to be phrased as a job with prompts in
 * it. It is an order now, obeyed wherever the app is — mid-wait included —
 * and it drops the pinned chat, because the chat belonged to the old site.
 */
async function switchSite(name) {
  const wanted = SITES[name];
  if (!wanted) return false;
  if (wanted === site) { console.log(`  already on ${site.name}`); return true; }
  console.log(`\r\x1b[K  switching to ${wanted.name}…`);
  const was = site;
  const hadPin = pinnedChat;
  site = wanted;
  if (!page || page.isClosed()) page = await context.newPage().catch(() => null);
  if (!page) { site = was; return false; }
  await page.goto(site.url, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.bringToFront().catch(() => {});
    watchImages(page);
  wand = await attachWand(page);
  if (!(await find(page, site.ask, 20000))) {
    // Not signed in there. Everything goes back the way it was — the site,
    // and the chat we were in, not just the site's front page.
    console.log(`  \x1b[31mnot signed into ${site.name} in this Chrome — sign in and it'll come back\x1b[0m`);
    site = was;
    await page.goto(hadPin ?? site.url, { waitUntil: "domcontentloaded" }).catch(() => {});
      watchImages(page);
  wand = await attachWand(page);
    return false;
  }
  // The chat belonged to the old site.
  pinnedChat = null;
  navGen += 1;
  siteName = name;
  console.log(`  now on ${site.name}`);
  await say("Waiting", `On ${site.name}. Tell Claude what you want.`);
  return true;
}

/** Open one specific chat and stay in it. */
async function goTo(url) {
  let u;
  try { u = new URL(url); } catch { console.log(`  \x1b[31mnot a URL: ${url}\x1b[0m`); return false; }
  // The site is whichever one the address belongs to — nobody should have
  // to say "chatgpt" and then paste a chatgpt.com link.
  const owner = Object.keys(SITES).find((k) => {
    try { return new URL(SITES[k].url).host === u.host; } catch { return false; }
  });
  /*
   * An address this app does not know is refused before the tab moves.
   *
   * The shop's end of the wire checks this, but the shop is not the only
   * thing that can write an order — a shell script with the key writes one
   * straight into the store — so the check has to exist at the end that
   * actually opens the page. Without it a goto to anywhere at all was
   * obeyed: the page opened in a signed-in Chrome, a message box was found,
   * and the next prompt was typed into a stranger's site. It also left the
   * pin on a host `ensurePage` can never match, so every poll afterwards
   * opened one more tab, forever.
   */
  if (!owner) {
    console.log(`  \x1b[31m${u.host} is not ChatGPT or Gemini — not going there\x1b[0m`);
    return false;
  }
  // By name, not by object: a job's selector overrides make `site` a copy,
  // and comparing the copy to the original threw the overrides away on every
  // goto — the one feature that lets a broken selector be fixed from the queue.
  if (owner !== siteName) {
    site = SITES[owner];
    siteName = owner;
  }
  if (!page || page.isClosed()) page = await context.newPage().catch(() => null);
  if (!page) return false;
  await page.goto(u.href, { waitUntil: "domcontentloaded" }).catch(() => {});
  // The tab has moved, whether or not the destination turns out to be usable.
  // A prompt waiting for pictures is now looking at a different conversation
  // either way, and it has to be told even when the goto then fails.
  navGen += 1;
  await wait(1200);
  await page.bringToFront().catch(() => {});
    watchImages(page);
  wand = await attachWand(page);
  if (!(await find(page, site.ask, 20000))) {
    console.log(`  \x1b[31mno message box at ${u.href} — is it signed in?\x1b[0m`);
    return false;
  }
  // Pinned to where the site put us, which is not always what was asked for.
  const landed = page.url();
  if (isFront(landed)) {
    console.log(`  \x1b[33m${u.href} opened the front page — nothing to pin to\x1b[0m`);
    pinnedChat = null;
    return false;
  }
  pinnedChat = landed;
  console.log(`  \x1b[2mpinned to ${landed}\x1b[0m`);
  await say("Waiting", `In the chat Claude named. Tell Claude what you want.`);
  return true;
}

console.log(`\n\x1b[1mConnected to ${site.name}.\x1b[0m`);
console.log(`Tell Claude what you want. It shows up here and you press Return to run it.`);
console.log(`Esc in the browser stops whatever is running.\n`);
await say("Waiting", `Connected to ${site.name}. Tell Claude what you want.`);

/**
 * Clear anything sitting over the page, and say what it was.
 *
 * Two states used to stall a run with no explanation. The site's upload limit
 * banner, which appears after too many files and covers the top of the page;
 * and its "drop a file here" curtain, which opens on a drag and stays open
 * until something tells it the drag ended. Neither is a refusal and neither
 * clears itself, so the app sat there timing out on clicks and reporting that
 * the site might be "out of generations".
 *
 * Runs before every prompt. Cheap when there is nothing to clear, and when
 * there is, it says so on the panel and in the status rather than leaving it
 * to be found in a screenshot.
 */
async function clearBlockers(label = "") {
  if (!site.blocked?.length) return false;
  let found = null;
  for (const sel of site.blocked) {
    const hit = await page.locator(sel).first().isVisible().catch(() => false);
    if (hit) { found = sel; break; }
  }
  if (!found) return false;

  log(`  \x1b[33m!! something is covering the page (${found}) — clearing it\x1b[0m`);
  report("running", { job: label, problem: `clearing a blocker on ${site.name}: ${found}` });

  // The curtain listens for the end of a drag, so tell it the drag ended.
  await page.evaluate(() => {
    const dt = new DataTransfer();
    for (const el of [document.documentElement, document.body]) {
      for (const type of ["dragleave", "dragend"]) {
        el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
      }
    }
  }).catch(() => {});

  // A banner has a dismiss control; press it if one is on screen.
  for (const sel of site.dismiss ?? []) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click({ timeout: 2500 }).catch(() => {});
      break;
    }
  }

  // And Escape, deafened so the app does not hear its own keypress as a stop.
  await wand?.deafen(1500);
  await page.keyboard.press("Escape").catch(() => {});
  await wait(800);

  /*
   * The test is whether the composer can be used, not whether a banner is
   * still on screen.
   *
   * A notice can sit in a corner all day without being in the way of
   * anything. Asking the page directly — is the message box there, and is
   * the point in the middle of it actually the message box rather than
   * something on top of it — is the only question that matters, and it is
   * the one that decides whether a clean chat is worth the cost.
   */
  const usable = await page.evaluate((sels) => {
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (top && (el.contains(top) || top.contains(el))) return true;
    }
    return false;
  }, site.ask).catch(() => true);

  if (!usable) log(`  \x1b[33m!! the message box still cannot be reached\x1b[0m`);
  return !usable;
}

async function fetchRefs(urls, dir) {
  if (!urls?.length) return [];
  // Its own fallback. A caller that forgets the folder used to take the whole
  // run down inside mkdir, before a single picture was drawn, with an error
  // that named node's internals rather than this file.
  const into = dir || join(opt.out, "reference");
  await mkdir(into, { recursive: true });
  const out = [];
  for (let i = 0; i < urls.length; i++) {
    for (let go = 1; go <= 3; go++) {
      try {
        const stop = new AbortController();
        const timer = setTimeout(() => stop.abort(), 20000);
        const res = await fetch(urls[i], { signal: stop.signal }).finally(() => clearTimeout(timer));
        if (!res.ok) throw new Error(String(res.status));
        const ext = (urls[i].split(".").pop() ?? "jpg").split("?")[0].slice(0, 4);
        const path = join(into, `ref-${i + 1}.${ext}`);
        await writeFile(path, Buffer.from(await res.arrayBuffer()));
        out.push(path);
        break;
      } catch (e) {
        // A blip on the host must not cost a whole job, so it is tried three
        // times before it counts as unreachable.
        if (go === 3) log(`  \x1b[31m!! reference ${i + 1} wouldn't download (${String(e).slice(0, 40)})\x1b[0m`);
        else await wait(2000 * go);
      }
    }
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
  await wait(300);

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

  /**
   * Did the thumbnails appear yet?
   *
   * Each route used to be followed by a flat sleep long enough for the worst
   * case — fourteen seconds with ten pictures — and then one check. An upload
   * that landed in a second still cost the full fourteen, four times over, on
   * every prompt of the job. This asks every 250ms and returns the moment the
   * count rises, so the fast case is fast and the slow case is unchanged.
   */
  /*
   * Every file, not the first one.
   *
   * This returned the moment the count moved AT ALL, so handing the composer
   * two pictures — a brand mark and the product — was called a success as soon
   * as the first thumbnail appeared. The second was still uploading, the
   * prompt was sent without it, and the model drew from the brand mark alone
   * and invented the product. The log said "attached 2" the whole time,
   * because it printed how many it had been given rather than how many
   * arrived.
   *
   * So: wait for all of them, and tell the caller how many actually made it.
   */
  const landed = async (was, capMs, want = 1) => {
    const until = Date.now() + capMs;
    let best = 0;
    while (Date.now() < until) {
      await wait(250);
      const now = (await blobCount(page)) - was;
      if (now > best) best = now;
      if (best >= want) return best;
    }
    return best;
  };

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
        // Its own short timeout. This used to be a bare click, which carries
        // Playwright's thirty-second default — so a button that turned out not
        // to be the paperclip held the entire run still for half a minute,
        // once per prompt, while the dialog it was waiting for had already
        // timed out at six seconds.
        clip.click({ timeout: 4000 }),
      ]);
      await chooser.setFiles(paths);
      if ((await landed(before, 2500 + files.length * 1200, files.length)) >= files.length) return "chosen";
      // Partial here too: wait for the rest instead of trying another way and
      // delivering the ones that already arrived a second time.
      if ((await blobCount(page)) - before > 0) {
        if ((await landed(before, 9000, files.length)) >= files.length) return "chosen";
        log(`  \x1b[33m!! only part of the set arrived through the file picker\x1b[0m`);
        return null;
      }
    } catch {
      // No dialog appeared — that button was something else. Close whatever
      // it opened before trying the next way, with the stop key deafened:
      // Playwright's Escape is indistinguishable from a person's, so without
      // this the tool hears its own keypress and stops itself mid-run.
      await wand?.deafen(2000);
      await page.keyboard.press("Escape").catch(() => {});
      await wait(400);
    }
  }

  /*
   * A route that delivered SOME of the files is not a route to give up on.
   *
   * Each way in was tried in turn and the next one was started whenever the
   * full set had not arrived yet. But an upload in flight is not a failure:
   * paste would land the first picture, the check would run out while the
   * second was still going, and then the drop route delivered BOTH of them
   * again — so the composer held the brand mark twice and the product once.
   * That is the duplicate logo, and it survived every fix aimed at the drop
   * code because the duplicate was never made there.
   *
   * So a partial delivery is waited on, never repeated. Only a route that
   * moved nothing at all hands over to the next one.
   */
  const got = async () => Math.max(0, (await blobCount(page)) - before);

  // 2 — paste it in, the way you'd paste a screenshot
  if (box) await box.click().catch(() => {});
  await deliver("paste");
  if ((await landed(before, 2200 + files.length * 900, files.length)) >= files.length) return "pasted";
  if (await got()) {
    // Something is on its way. Give it room rather than sending it twice.
    if ((await landed(before, 9000, files.length)) >= files.length) return "pasted";
    log(`  \x1b[33m!! ${await got()} of ${files.length} arrived by pasting and the rest did not follow\x1b[0m`);
    return null;
  }

  // 3 — drop, everywhere that might be listening
  await wand?.say(label, "attaching — another way…");
  await deliver("drop");
  if ((await landed(before, 2200 + files.length * 900, files.length)) >= files.length) return "dropped";
  if (await got()) {
    if ((await landed(before, 9000, files.length)) >= files.length) return "dropped";
    log(`  \x1b[33m!! ${await got()} of ${files.length} arrived by dropping and the rest did not follow\x1b[0m`);
    return null;
  }

  // 4 — a real file input, if the page keeps one
  const input = page.locator(site.file).first();
  if (await input.count().then((c) => c > 0).catch(() => false)) {
    await wand?.say(label, "attaching — last way…");
    await input.setInputFiles(paths).catch(() => {});
    if ((await landed(before, 2500 + files.length * 1200, files.length)) >= files.length) return "uploaded";
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
/**
 * The same picture, asked for at full size.
 *
 * Google's image URLs carry their size in the path — `=w512-h512-rw`. Left
 * alone you save the thumbnail; sometimes the thumbnail is refused and the
 * whole generation falls through to a screenshot. `=d` asks for the download,
 * `=s0` for the unresized original.
 */
function originals(url) {
  const out = [];
  const cut = url.replace(/=[-\w]+$/, "");
  if (cut !== url) out.push(`${cut}=d`, `${cut}=s0`);
  out.push(url);
  return [...new Set(out)];
}

async function blobCount(page) {
  return page.evaluate(() => document.querySelectorAll('img[src^="blob:"], video[src^="blob:"]').length).catch(() => 0);
}

async function runPrompt(text, refs, label, n, total, dir, fromCard = 0, sameChat = true) {
  if (await holdIfPaused(`before ${n} of ${total}`)) return 0;
  /*
   * A prompt that opens a new chat must let go of the old one FIRST.
   *
   * The pin outranks whatever tab we hold, so with the previous part's
   * address still pinned, `ensurePage` dragged the tab back into that
   * conversation, the "new chat" click below opened a thread the pin
   * immediately abandoned, and every prompt after the first in a part ran
   * in the part before it — with `attachedInChat` still true, so it printed
   * "references already in this chat" over the wrong product's references.
   * Four-part jobs came back with four sets of the first product.
   */
  if (!sameChat) pinnedChat = null;
  if (!(await ensurePage())) { console.log(`  \x1b[31m!! lost the ${site.name} tab\x1b[0m`); return 0; }
  await wand.reattach();
  await say(label, `${n} of ${total} — sending…`);

  /*
   * One chat for the whole run, unless the job says otherwise.
   *
   * This used to be the other way round — a fresh thread per prompt — on the
   * theory that a picture drawn in a thread full of earlier pictures becomes a
   * reply to the last one rather than an answer to the prompt. In practice the
   * cost of that was much worse: the reference photograph had to be attached
   * forty-four times, the run left forty-four chats behind, and the model lost
   * everything it had already been told about the product between every shot.
   *
   * Staying put keeps the reference, the corrections and the house style in
   * view, which is what actually makes shot twenty-five look like shot one.
   * A job can still ask for a fresh chat when it is genuinely a new product.
   */
  if (!sameChat) {
    await freshChat("carrying on in the same chat");
    // Nothing from the old thread carries over, references included.
    attachedInChat = false;
    chatRefs = new Set();
  }

  /*
   * The references go in once when the whole run is one conversation.
   *
   * Attaching the same two pictures to all forty-four prompts is ten minutes
   * of waiting, a thread full of duplicates, and a good way to be rate
   * limited — and pointless, because the model can already see them further
   * up the same chat.
   */
  /*
   * Skipping the attach is only safe once the pictures are demonstrably in
   * the thread. Two ways it was wrong: if prompt one's attach failed, every
   * prompt after it ran with no reference while printing "already in this
   * chat"; and pictures dropped mid-run through Add pictures were thrown
   * away, so the rest of the job kept drawing the old product.
   */
  // Not a constant: a clean chat started below invalidates it. It was const,
  // and a prompt that opened a fresh chat then skipped attaching because the
  // old chat had had references — sending the very first prompt of a new
  // conversation with nothing attached.
  let skipRefs = sameChat && attachedInChat && !freshRefs;
  if (skipRefs && (fromCard || refs.length)) {
    log(`  \x1b[2mreferences already in this chat\x1b[0m`);
  }

  /*
   * Clear the page before anything else is attempted on it.
   *
   * This lived inside the branch that attaches references, so a prompt that
   * was reusing the references already in the chat never ran it — and those
   * are most of the prompts in a run. The upload banner and the drop curtain
   * block a click whether or not this particular prompt is uploading
   * anything, so the check belongs in front of both branches.
   *
   * Left-over thumbnails are dealt with in the same place: a failed attach
   * leaves its pictures behind and the next attempt adds to them rather than
   * replacing them, which is how two references became twenty.
   */
  const blockedStill = await clearBlockers(label);
  const leftOver = skipRefs ? 0 : await blobCount(page).catch(() => 0);
  if (blockedStill || leftOver > 0) {
    log(blockedStill
      ? `  \x1b[33m!! the page is still blocked — starting a clean chat\x1b[0m`
      : `  \x1b[33m!! ${leftOver} picture${leftOver === 1 ? "" : "s"} left over in the box — starting a clean chat\x1b[0m`);
    if (await freshChat("couldn't clear the page")) {
      watchImages(page);
      wand = await attachWand(page);
      pinnedChat = null;
      attachedInChat = false;
      freshRefs = Boolean(refs.length);
      // Nothing is in this conversation yet, so this prompt's pictures go in.
      skipRefs = false;
      chatRefs = new Set();
      navGen++;
      await wait(1200);
    }
  }

  // Pictures before words: both sites disable send while an upload is running.
  if (fromCard && !skipRefs) {
    // Straight from the panel that received them — no disk, no file dialog.
    await say(label, `${n} of ${total} — attaching ${fromCard}…`);
    const before = await blobCount(page);
    const box0 = await find(page, site.ask, 8000);
    if (box0) await box0.click().catch(() => {});
    await wand.give(site.ask, "paste");
    await wait(2200 + fromCard * 900);
    let ok = (await blobCount(page)) > before;
    if (!ok) {
      await wand.give(site.ask, "drop");
      await wait(2200 + fromCard * 900);
      ok = (await blobCount(page)) > before;
    }
    if (ok) { attachedInChat = true; freshRefs = false; }
    log(ok
      ? `  attached ${fromCard} (from the card)`
      : `  \x1b[31m!! nothing attached — sending with NO reference image\x1b[0m`);
  } else if (refs.length && !skipRefs) {
    /*
     * A prompt that needs references is never sent without them.
     *
     * The old rule was to log "sending with NO reference image" and send it
     * anyway, which is the worst of both: the site spends a generation, the
     * quota is gone, and the picture that comes back was drawn from nothing —
     * a box with an invented product on it, a reaper that is not the reaper.
     * It looks like a bad prompt rather than a missing file, so the hours go
     * into rewriting words that were never the problem.
     *
     * Attaching is retried, and if the pictures still are not all in the
     * composer the prompt is REFUSED. Nothing is sent, the reason is said out
     * loud, and the run moves on rather than burning the quota on an image
     * that cannot be used.
     */
    // Counted as a difference, not a total: the composer can already hold
    // something, and comparing a raw count against the number of files being
    // sent would call that a success without either of them arriving.
    /*
     * Start from an empty composer.
     *
     * A failed attach leaves its thumbnails behind, and the next attempt adds
     * to them rather than replacing them: one screenshot showed ten pictures
     * queued in the composer from a job that only ever needed two. The model
     * then gets the same brand mark eight times and a product photo buried
     * among them, and the site is slower with every one. If anything is
     * already sitting there before this prompt's own pictures go in, the
     * cleanest answer is a fresh conversation, which costs one page load.
     */
    /*
     * Only the pictures this conversation does not already hold.
     *
     * Every part of a job carries the brand mark, so without this the same
     * file goes up once per product: five uploads of one picture, five more
     * thumbnails in the composer, and five steps closer to the site's limit
     * on files per message.
     */
    const fresh = refs.filter((r) => !chatRefs.has(refKey(r)));
    if (fresh.length < refs.length) {
      log(`  \x1b[2m${refs.length - fresh.length} of ${refs.length} already in this chat — not sending ${refs.length - fresh.length === 1 ? "it" : "them"} again\x1b[0m`);
    }
    const startCount = await blobCount(page).catch(() => 0);
    const landedSoFar = async () => {
      const now = await blobCount(page).catch(() => startCount);
      return Math.max(0, now - startCount);
    };
    let how = null;
    let landedCount = 0;
    for (let attempt = 1; attempt <= 3; attempt++) {
      await say(label, `${n} of ${total} — attaching ${fresh.length}${attempt > 1 ? ` (try ${attempt})` : ""}…`);
      how = await putFiles(page, fresh, wand, label);
      landedCount = await landedSoFar();
      if (landedCount >= fresh.length) break;
      /*
       * Never attach again on top of a partial one.
       *
       * The routes inside putFiles stopped re-delivering, but THIS loop still
       * called the whole of putFiles a second time when the set was short --
       * so the one picture that had arrived was joined by both of them again.
       * That is the duplicate brand mark, made here rather than in any of the
       * places it was hunted for.
       *
       * Something in the composer means the delivery worked and the rest is
       * either slow or lost. Wait for slow; refuse if lost. Only a completely
       * empty composer is worth another attempt.
       */
      if (landedCount > 0) {
        log(`  \x1b[33m!! ${landedCount} of ${fresh.length} attached — waiting for the rest rather than sending them again\x1b[0m`);
        for (let t = 0; t < 12 && landedCount < fresh.length; t++) {
          await wait(1000);
          landedCount = await landedSoFar();
        }
        break;
      }
      /*
       * Most short attachments are simply slow, not lost: the second file is
       * still uploading when the check runs out. So the first answer to a
       * short count is to wait and look again, not to attach anything else.
       *
       * If a retry does send the files a second time the composer may end up
       * holding a duplicate, and that is deliberately accepted. The model
       * seeing one of the references twice costs nothing; the model never
       * seeing it at all is what ruins the picture.
       */
      // Nothing arrived at all. That is worth another go.
      await wait(2000);
      landedCount = await landedSoFar();
      if (landedCount >= fresh.length) { how = how ?? "waited"; break; }
      if (attempt < 3) {
        log(`  \x1b[33m!! nothing attached — trying again\x1b[0m`);
      }
    }
    if (fresh.length && (!how || landedCount < fresh.length)) {
      log(`  \x1b[31m!! only ${landedCount} of ${fresh.length} reference pictures would attach — NOT sending this one\x1b[0m`);
      await say(label, `${n} of ${total} — references wouldn't attach, skipped`);
      report("waiting for pictures", {
        job: label,
        prompt: `${n} of ${total}`,
        problem: `only ${landedCount} of ${fresh.length} reference pictures attached — prompt not sent`,
      });
      await wait(1200);
      return 0;
    }
    // Past the gate above, every reference is in the composer. The count is
    // the measured one, because the old line printed how many files it had
    // been handed and said "attached 2" all afternoon while attaching one.
    /*
     * One last count before the words go in.
     *
     * Everything above tries to make a duplicate impossible; this checks. If
     * the composer holds more than it was given, something delivered twice --
     * and drawing from it would put the brand mark on the box twice and bury
     * the product, which is the failure this is all for. A clean chat costs
     * one page load and the prompt comes round again with an empty composer.
     */
    const inBox = await blobCount(page).catch(() => -1);
    const expected = startCount + fresh.length;
    if (inBox > expected) {
      log(`  \x1b[31m!! ${inBox} pictures in the box and only ${expected} were sent — something delivered twice, starting clean\x1b[0m`);
      report("waiting for pictures", {
        job: label,
        prompt: `${n} of ${total}`,
        problem: `${inBox} attachments where ${expected} were expected — prompt not sent`,
      });
      if (await freshChat("couldn't clear the duplicates")) {
        watchImages(page);
        wand = await attachWand(page);
        pinnedChat = null;
        attachedInChat = false;
        chatRefs = new Set();
        navGen++;
      }
      return 0;
    }

    attachedInChat = true;
    freshRefs = false;
    // Remember them by their contents, so no part of this job sends the same
    // picture into this conversation a second time.
    for (const r of fresh) chatRefs.add(refKey(r));
    if (fresh.length) log(`  attached ${landedCount} (${how})`);
  }

  const box = await find(page, site.ask, 20000);
  if (!box) {
    log(`  \x1b[31m!! no message box on ${site.name} — is it signed in and on a chat page?\x1b[0m`);
    return 0;
  }
  await wand.point(box);
  /*
   * Focusing the composer must never be able to end the prompt.
   *
   * This was a bare click: no timeout, so Playwright's default thirty seconds,
   * and no catch, so it THREW. Anything that covers the box for half a minute
   * — the upload overlay after two files, a tooltip, one of the site's own
   * notices — took the whole prompt down with a locator timeout. The run
   * tried it twice and then declared the picture impossible, which is what
   * "produced no picture, twice" was: not a refusal by the site and not a
   * rate limit, just a click that could not land on a covered element.
   *
   * Three ways in, each brief, and none of them fatal. A normal click; then a
   * forced one, which ignores what is on top; then focus set directly on the
   * element, which needs no hit test at all. If all three fail the typing
   * below still runs — the composer is usually focused already.
   */
  let focused = false;
  for (const attempt of [
    () => box.click({ timeout: 4000 }),
    () => box.click({ timeout: 3000, force: true }),
    () => box.evaluate((el) => el.focus?.()),
  ]) {
    try { await attempt(); focused = true; break; } catch { /* try the next way */ }
  }
  if (!focused) log(`  \x1b[33m!! couldn't focus the message box — typing anyway\x1b[0m`);
  await box.fill("").catch(() => {});
  /*
   * Typing cannot be allowed to end the prompt either.
   *
   * insertText throws if the page navigates or the composer is replaced while
   * it runs, and an unguarded throw here loses the prompt exactly the way the
   * unguarded focus click did. The read-back below already tells us whether
   * the words arrived, so a failure here just falls through to that.
   */
  let typedIn = true;
  try {
    await page.keyboard.insertText(text);
  } catch (e) {
    typedIn = false;
    log(`  \x1b[33m!! typing was interrupted (${String(e?.message ?? e).slice(0, 60)}) — checking what landed\x1b[0m`);
  }
  await wait(400);
  if (!typedIn) {
    // Read the box directly rather than through typed(), which is declared
    // further down this function: calling it here threw "cannot access before
    // initialization" on the one path this guard exists for, turning a
    // recoverable interruption into a thrown prompt.
    const landedText =
      (await box.textContent().catch(() => "")) ||
      (await box.inputValue().catch(() => "")) ||
      "";
    if (landedText.trim().length < 8) {
      log(`  \x1b[31m!! the prompt did not reach the box — skipping this one\x1b[0m`);
      return 0;
    }
  }

  /*
   * Sending, and then checking that it went.
   *
   * A click on a send button that is disabled — because an upload is still
   * running, or because the site re-rendered the composer under us — does
   * nothing at all, and the old code then sat waiting four minutes for
   * pictures nobody had asked for. So the composer is read back: empty means
   * it left, and anything else gets Enter, then a second Enter, before this
   * is called a failure out loud rather than silently.
   */
  /**
   * Everything already on screen before the prompt goes out.
   *
   * The attached reference shows as a thumbnail in the composer, and it is a
   * blob url over the size threshold like any generated picture — so it was
   * being collected as a result and then failing to save, once per prompt,
   * with a red line each time. Anything present before the send is not a
   * result of the send.
   *
   * This has to be read BEFORE the send, and for a while it was read after.
   * A site that answers quickly had its answer already on screen by then, so
   * the picture was written down as something that had always been there and
   * quietly thrown away — every prompt finishing "0 images" with nothing in
   * the log to say why.
   */
  const already = new Set(
    await page.evaluate(
      ({ sels }) =>
        sels.flatMap((s) => Array.from(document.querySelectorAll(s)))
          .filter((el) => !el.closest("[data-wand]"))
          .map((el) => {
            // Stamped, not just noted. The old snapshot filtered by decoded
            // size, so a picture from an earlier prompt that had not finished
            // loading when we looked was left out — and then arrived a moment
            // later and was written down as the answer to this one.
            el.dataset.wandOld = "1";
            return el.currentSrc || el.src;
          }),
      { sels: site.images },
    ).catch(() => []),
  );

  // Where the tab was before the message went, so the pin can be taken from
  // the address *changing* rather than from a guess about what a chat URL
  // looks like on each site.
  const urlBeforeSend = page.url();
  const typed = async () => (await box.textContent().catch(() => "")) || (await box.inputValue().catch(() => "")) || "";
  // Wait for the last answer to finish before sending the next prompt. While a
  // generation runs, the send button is a Stop button in the same place — so
  // sending early did not send, it cancelled.
  if (site.busy?.length) {
    const until = Date.now() + 90_000;
    while (Date.now() < until) {
      const busy = await page.locator(site.busy.join(",")).first().isVisible().catch(() => false);
      if (!busy) break;
      await say(label, `${n} of ${total} — waiting for the last one to finish…`);
      await wait(1500);
      await obey();
    }
  }
  const send = await find(page, site.send, 5000);
  if (send) { await wand.point(send); await send.click({ timeout: 4000 }).catch(() => {}); }
  await wait(900);

  for (let tries = 0; tries < 2 && (await typed()).trim().length > 8; tries++) {
    console.log(`  \x1b[2mstill in the box — pressing Return\x1b[0m`);
    await box.click().catch(() => {});
    await page.keyboard.press("Enter").catch(() => {});
    await wait(1200);
  }
  if ((await typed()).trim().length > 8) {
    log(`  \x1b[31m!! ${site.name} would not send it — skipping this one\x1b[0m`);
    return 0;
  }
  log(`  \x1b[2msent\x1b[0m`);

  // The first message to land is what turns "a tab" into "this chat": from
  // here on the run is loyal to the address, not to the window. A fresh
  // thread per prompt asks not to be pinned, since it will never be back.
  if (sameChat && !pinnedChat) {
    // A fresh page only becomes a conversation once the site assigns it an
    // address, and that takes a moment after the send. Waiting a fixed 800ms
    // and then trusting whatever the URL was pinned front pages on slow days
    // and the multi-account /u/1/app on Gemini every day.
    // Only the first prompt gets to wait for it. A site that has not given
    // this thread an address by then is one that never will, and three seconds
    // on every prompt after that is a job running a third slower for nothing.
    // A later prompt gets the same patience when there is still no pin. The
    // budget was zero for every prompt after the first, so a run whose first
    // send did not produce an address within three seconds went the whole way
    // unpinned — and an unpinned run is one tab hiccup away from carrying on
    // in a brand new chat, which is the bug this pair of changes closes.
    const budget = n === 1 || !pinnedChat ? 3000 : 0;
    let here = page.url();
    for (let t = 0; t < budget && chatKey(here) === chatKey(urlBeforeSend); t += 400) {
      await wait(400);
      here = page.url();
    }
    if (chatKey(here) !== chatKey(urlBeforeSend) && !isFront(here)) {
      pinnedChat = here;
      log(`  \x1b[2mpinned to this chat\x1b[0m`);
      report("running", { chat: here });
    } else if (!isFront(urlBeforeSend)) {
      // Already in a conversation before the send — that is the one.
      pinnedChat = urlBeforeSend;
      log(`  \x1b[2mpinned to this chat\x1b[0m`);
      report("running", { chat: urlBeforeSend });
    }
  }

  await say(label, `${n} of ${total} — waiting for the pictures…`);
  report("waiting for pictures", { job: label, prompt: `${n} of ${total}` });
  await wand.idle(true);
  // How long to wait for pictures. A job can set its own, because a site that
  // is slow today is a queue edit rather than a new app.
  let deadline = Date.now() + (jobWait || opt.wait) * 1000;
  const seen = new Set();
  let quiet = 0;
  const myGen = navGen;
  while (Date.now() < deadline) {
    await wait(2000);
    await obey();
    // Sent somewhere else while waiting — by a site switch or a goto. The
    // pictures in the new place belong to whatever was drawn there, not to
    // this prompt, and harvesting them as its answer filled a zip with the
    // reference photographs once.
    if (navGen !== myGen) {
      log(`  \x1b[33mmoved away while waiting — this one gets nothing\x1b[0m`);
      // The drifting cursor was started before this loop and only stopped at
      // the bottom of it, so leaving here left it sparkling forever on a run
      // that had moved on.
      await wand.idle(false);
      return 0;
    }
    // Paused here waits and then carries on with this same prompt. It used to
    // return, which counted the prompt as finished with nothing saved — so a
    // pause in the middle of a picture quietly lost it.
    // Time spent paused is given back, or a two minute think while it is
    // held would eat the whole window the picture had to arrive in.
    const heldAt = Date.now();
    if (await holdIfPaused(`waiting for pictures from ${site.name}`)) {
      if (await wand.stopped()) break;
    }
    deadline += Date.now() - heldAt;
    if (await wand.stopped()) break;
    const urls = await page.evaluate(
      ({ sels, mine, min }) =>
        sels.flatMap((s) => Array.from(document.querySelectorAll(s)))
          .filter((el) => !el.closest("[data-wand]"))
          // Not something that was on screen before we sent.
          .filter((el) => !el.dataset.wandOld)
          // And never our own message. Both sites re-render the attached
          // reference inside the sent turn with a fresh src, which is big and
          // new and looked exactly like an answer — so prompt one of every job
          // with a reference "succeeded" by saving the photograph we had just
          // handed in, and moved on before the real picture existed.
          .filter((el) => !mine.some((m) => el.closest(m)))
          .filter((el) => el.naturalWidth >= min && el.naturalHeight >= min)
          .map((el) => el.currentSrc || el.src),
      { sels: site.results ?? site.images, mine: site.mine ?? [], min: MIN_PIXELS },
    ).catch(() => []);
    const fresh = urls.filter((u) => !seen.has(u) && !already.has(u));
    fresh.forEach((u) => seen.add(u));
    /**
     * Is it still drawing?
     *
     * ChatGPT streams blurred partial renders into the same element on its way
     * to the finished picture. Eight seconds of stillness between two partials
     * is ordinary, and the old code read that as "done" — saved the blurred
     * one, moved to the next prompt, and then its send hit the Stop button
     * that occupies the same corner while a generation is running. That is one
     * prompt lost and the picture for it killed.
     */
    const busy = site.busy?.length
      ? await page.locator(site.busy.join(",")).first().isVisible().catch(() => false)
      : false;
    if (fresh.length) { quiet = 0; await say(label, `${n} of ${total} — ${seen.size} image${seen.size === 1 ? "" : "s"}…`); }
    // Done the moment the site stops working, not eight seconds after it.
    // The partial-render problem `busy` solves is still solved — this only
    // removes the idle padding that was added on top of it, which was four
    // wasted seconds on every one of thirty-two shots.
    else if (seen.size) { quiet += 2; if (quiet >= 4 && !busy) break; }
    else {
      // Nothing at all yet. Four minutes of that is the site having refused
      // the prompt, or having asked a question back — either way, standing
      // there for the full wait means the next forty shots are four minutes
      // further away each. Two minutes, then move on and say so.
      quiet += 2;
      if (quiet >= 120) {
        log(`  \x1b[33mno picture after two minutes — moving on\x1b[0m`);
        break;
      }
      // Every six seconds on the panel, every thirty to the status board: the
      // person watching needs to see it move, the board does not.
      if (quiet % 6 === 0) await say(label, `${n} of ${total} — still waiting (${quiet}s)`, true);
      if (quiet % 30 === 0) {
        report("waiting for pictures", { job: label, prompt: `${n} of ${total}`, seconds: quiet, waitingFor: `an image on ${site.name} matching the job's selectors` });
      }
    }
  }

  await wand.idle(false);

  /**
   * Getting the picture onto the disk.
   *
   * This used to fetch the image from inside the page, and a page is the one
   * place that isn't allowed to: Gemini's content security policy refuses a
   * request to its own image host from script, the error was swallowed, and
   * eight generations were thrown away in silence.
   *
   * So the first attempt is made from node, through the browser's own request
   * context — same cookies, same session, no policy in the way. Blob and data
   * URLs only exist inside the page, so those still go through it. And if
   * both fail there is always the picture on screen, which can simply be
   * a real file or nothing at all.
   */
  let saved = 0;
  const urls = [...seen];
  for (let k = 0; k < urls.length; k++) {
    const url = urls[k];
    // Orders are heard here too. The save phase can run for most of a minute
    // across three pictures, and nothing in it used to look up.
    await obey();
    if (held.stopped) break;
    let buf = null;

    let how = null;

    // What the browser already loaded, before anybody is asked for it again.
    // No request to replay, no cookies to carry, no content policy to refuse.
    for (const want of [url, ...originals(url)]) {
      const hit = CAPTURED.get(want);
      if (hit && hit.length >= MIN_PICTURE) { buf = hit; how = "captured"; break; }
    }

    if (!buf && !/^(blob|data):/.test(url)) {
      // Google hands back a display URL with the size baked into it —
      // ...=w512-h512-rw. Asking for that is asking for a thumbnail, and on
      // some of them it is refused outright, which is how a screenshot ended
      // up standing in for a real generation. Ask for the original first.
      for (const want of originals(url)) {
        buf = await context.request
          .get(want, { headers: { referer: page.url() } })
          .then(async (r) => {
            // A sign-in page and an error body both arrive as a cheerful 200.
            // They were being written to disk as PNGs, counted as saved, and
            // uploaded to the shop.
            const type = r.headers()["content-type"] ?? "";
            if (!r.ok() || !type.startsWith("image/")) return null;
            const body = await r.body();
            return body && body.length >= MIN_PICTURE ? body : null;
          })
          .catch(() => null);
        if (buf) { how = "downloaded"; break; }
      }
    }

    if (!buf) {
      const b64 = await page.evaluate(async (u) => {
        // Fifteen seconds, then give up. This had no timeout at all, so a
        // stalled request held the whole run still with nothing on screen to
        // say why.
        const r = await fetch(u, { signal: AbortSignal.timeout(15_000) });
        const type = r.headers.get("content-type") ?? "";
        if (!r.ok || !type.startsWith("image/")) return null;
        const bytes = new Uint8Array(await r.arrayBuffer());
        let s = "";
        for (let j = 0; j < bytes.length; j++) s += String.fromCharCode(bytes[j]);
        return btoa(s);
      }, url).catch(() => null);
      // The third way in needs the same floor as the other two, or a stray
      // the capture and the request both refused arrives through this one.
      if (b64) {
        const got = Buffer.from(b64, "base64");
        if (got.length >= MIN_PICTURE) { buf = got; how = "page-fetched"; }
      }
    }

    /**
     * The site's own download button.
     *
     * Before giving up and photographing the screen, hover the picture and
     * press the button the site puts there for exactly this. It is a real
     * click, so no content policy applies to it, and what lands is the file
     * the model produced rather than a picture of a browser window. This is
     * the one that has to work: a screenshot carries the composer bar, the
     * model picker and this app's own overlay, and those have gone onto a
     * live shop more than once.
     */
    if (!buf && Array.isArray(site.save) && site.save.length) {
      buf = await (async () => {
        const shot = page.locator(`img[src="${url.replace(/["\\]/g, "\\$&")}"]`).first();
        if (!(await shot.count())) return null;
        await shot.hover({ timeout: 2000 }).catch(() => {});
        // The control usually lives in the card around the picture, so look
        // there first and fall back to anywhere on the page.
        const card = shot.locator("xpath=ancestor::*[self::div or self::article][3]");
        for (const sel of site.save) {
          for (const where of [card]) {
            const btn = where.locator(sel).first();
            if (!(await btn.count().catch(() => 0))) continue;
            // Wait for a download only once a click has actually landed.
            // Waiting fifteen seconds after every candidate meant eight
            // candidates could cost two minutes per picture before the app
            // fell back to photographing the screen.
            const coming = page.waitForEvent("download", { timeout: 6000 }).catch(() => null);
            const clicked = await btn.click({ timeout: 2000 }).then(() => true).catch(() => false);
            if (!clicked) continue;
            const got = await coming;
            if (!got) continue;
            const tmp = await got.path().catch(() => null);
            const bytes = tmp ? await readFile(tmp).catch(() => null) : null;
            // The temporary file is ours to clear up; they were piling up.
            await got.delete().catch(() => {});
            if (bytes && bytes.length > 2048) return bytes;
          }
        }
        return null;
      })().catch(() => null);
      if (buf) how = "saved";
    }

    /**
     * No screenshots. Ever.
     *
     * There used to be a last resort here that photographed the picture on
     * screen when the file could not be fetched. It is gone, and it is not
     * coming back. What it produced was a picture of a browser window — the
     * composer bar, the model picker, this app's own overlay — and those went
     * onto a live shop twice and had to be cropped back out by hand. A missing
     * picture is a prompt to run again; a screenshot is a mistake that looks
     * like a success, which is worse.
     *
     * Everything above this line is a real file: the bytes the browser itself
     * loaded, the file the host serves, or the one its own download button
     * hands over. If none of those worked, this prompt produced nothing and
     * says so, and the run retries it.
     */

    if (!buf) {
      log(`  \x1b[31m!! couldn't save one of the pictures\x1b[0m`);
      continue;
    }

    /*
     * Is this actually a picture, and which kind?
     *
     * Everything here was written out as .png whatever the bytes were, so a
     * JPEG went to the shop claiming to be a PNG and anything that was not an
     * image at all was saved as one. The first bytes of a file say what it
     * is; nothing else needs to be decoded to find out.
     */
    const kind =
      buf.length > 12 && buf[0] === 0x89 && buf[1] === 0x50 ? "png"
      : buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 ? "jpg"
      : buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP" ? "webp"
      : buf.toString("ascii", 0, 3) === "GIF" ? "gif"
      : null;
    if (!kind) {
      log(`  \x1b[31m!! what came back is not an image (${buf.length} bytes) — not saving it\x1b[0m`);
      continue;
    }

    saved++;
    log(`  \x1b[2m${how}\x1b[0m ${url.slice(0, 70)}`);
    /**
     * A photograph is named as one.
     *
     * These carry the composer bar, the model picker and this app's own
     * overlay burned into them, and they have gone onto a live shop and been
     * seen by the owner before anybody noticed. A file called
     * `03-01-SCREENSHOT.png` cannot be mistaken for a product photograph at a
     * glance, which is the whole point.
     */
    const stem = `${String(n).padStart(2, "0")}-${String(saved).padStart(2, "0")}`;
    // Up it goes as well as down. A picture that only exists in a folder on
    // one laptop has to be found, downloaded and re-uploaded by hand before
    // the shop can use it; one that is also here can be put on a product the
    // moment it exists.
    // Every file that reaches this line is a real one, so every one goes up.
    sendShot(dir, `${stem}.${kind}`, buf, kind);
    // Numbered by prompt then by picture, so the folder reads in the order the
    // shots were asked for rather than the order they happened to finish.
    await writeFile(join(dir, `${stem}.${kind}`), buf);
  }
  return saved;
}

/* ------------------------------------------------------------------- loop */

/**
 * Everything saved for this job so far, as one file on the Desktop.
 *
 * Zipped with -j so the pictures sit at the archive's root rather than behind
 * a chain of folders, and rewritten rather than appended so it always matches
 * what is actually on disk. Returns null if zip isn't there to run, in which
 * case the loose folder is what the button opens.
 */
async function makeZip(dir, slug) {
  const out = join(process.env.HOME ?? ".", "Desktop", `${slug}.zip`);
  await rm(out, { force: true }).catch(() => {});
  // `dir` is already absolute, so running zip from `opt.out` pointed it at a
  // path under the output folder that does not exist and the zip was never
  // written — every job said "on the Desktop" and left nothing there.
  // `dir` is absolute, so the old `cwd: opt.out` pointed zip at a path under
  // the output folder that does not exist and nothing was ever written — every
  // job said "on the Desktop" and left nothing there. And the zip is the
  // pictures: the references that were fed in and the resume file are
  // bookkeeping, and shipping them back looked like duplicate output.
  const ok = await run("zip", ["-qrj", out, dir, "-x", "*/reference/*", "*/progress.json"])
    .then(() => true)
    .catch(() => false);
  return ok ? out : null;
}

/**
 * Hold here while paused, wherever we are.
 *
 * Pause used to be read only between prompts, and a prompt is four minutes of
 * waiting for pictures — so pressing Pause did nothing at all for minutes,
 * which from the outside is the app ignoring you. Every wait that matters
 * calls this now, so Pause bites within a second of being pressed and
 * Continue picks up in the same place.
 */
async function holdIfPaused(what = "") {
  if (!(await wand.paused())) return false;
  let said = false;
  while (await wand.paused()) {
    if (await wand.stopped()) return true;
    if (!said) { log(`\r\x1b[K  \x1b[33mpaused${what ? " — " + what : ""}. Press Continue, or tell Claude.\x1b[0m`); said = true; }
    report("paused", { where: what });
    await obey();
    await wait(600);
  }
  console.log(`  \x1b[32mcarrying on.\x1b[0m`);
  return false;
}

/**
 * Wait for a yes or a no, from wherever one can come from.
 *
 * The card in the corner of the page is the first choice. It is polled rather
 * than awaited, because anything awaited inside a chat page dies when the
 * page re-renders — and it re-renders all the time. If the overlay itself
 * has gone (a navigation threw it out), it is put back and the card shown
 * again; nobody's click is ever lost to that. The macOS dialog is only for a
 * page the overlay cannot draw on at all.
 *
 * And a failure to ask is never an answer. The old code turned a dead
 * dialog, a dead promise, a closed window into "skip", wrote the job down as
 * done and then waited forever for the job it had just thrown away. This
 * returns only what a person pressed.
 */
/**
 * The card, held up until somebody answers it.
 *
 * `sub` is a sentence with the site's name in it, and the site can change
 * while the card is on screen — an order moves the app to Gemini, and the
 * card carries on saying ChatGPT. Pressing Submit on that is agreeing to
 * something that is no longer true. So the line is rebuilt from a function
 * rather than baked in, and the card is redrawn whenever the answer changes.
 */
async function decision(label, sub, summary) {
  /*
   * There is no longer anything to decide.
   *
   * Claude writes the job and Claude is watching it draw, so a card asking a
   * second time for permission it already has only means the app sits still
   * until somebody walks past. A job that arrives is a job that runs, and a
   * job that turns out wrong is corrected mid-run with "redo" rather than
   * refused before it starts. The panel still says what is happening; it just
   * does not ask.
   */
  if (AUTO) {
    await say(label, typeof sub === "function" ? sub() : sub);
    await wand.running().catch(() => {});
    return "run";
  }
  const line = () => (typeof sub === "function" ? sub() : sub);
  let shown = line();
  if (!wand.mounted) {
    // The overlay could not be drawn, so the macOS dialog is the gate. It can
    // sit there for an hour, and silence for an hour is the thing this whole
    // status board exists to stop.
    report("waiting for approval", { job: label, waitingFor: "the dialog on the Mac — the on-screen card could not be drawn" });
    return ask(label, summary);
  }
  let beat = 0;
  for (;;) {
    await obey();
    if (await wand.stopped()) return "skip";
    if (!(await ensurePage())) {
      // Reported from in here too. Looping quietly on a missing tab was
      // indistinguishable, from the outside, from having died.
      report("waiting for a tab", { job: label, waitingFor: `a ${site.name} tab with a message box in it` });
      await wait(1000);
      continue;
    }
    // The site moved under the card. Redraw it so the thing being agreed to
    // is the thing that will happen.
    if (line() !== shown) {
      shown = line();
      await wand.ask(label, shown);
      report("waiting for approval", { job: label, site: site.name, waitingFor: shown });
    }
    if (!(await wand.present())) { await wand.reattach(); await wand.ask(label, shown); }
    else if (!(await wand.asking())) {
      const a = await wand.answer();
      if (a === "run" || a === "skip") return a;
      // Card not on screen and no answer: it was never shown, or the page
      // replaced it. Show it again.
      await wand.ask(label, shown);
    }
    // Said out loud, because a Terminal with nothing moving in it is the same
    // as a Terminal that has crashed.
    if (beat++ % 5 === 0) {
      process.stdout.write(`\r\x1b[K  waiting for you — press Submit on the card in Chrome, or tell Claude "go"   `);
      report("waiting for approval", { job: label, waitingFor: 'someone to press Submit, or the order "continue"' });
    }
    await wait(400);
  }
}

/** Seconds to wait for pictures, when the running job asked for its own. */
let jobWait = 0;

/**
 * Whether this conversation has the reference pictures in it already, and
 * whether newer ones are waiting to replace them. Both are reset for every
 * job, and `freshRefs` is set the moment somebody drops pictures mid-run.
 */
let attachedInChat = false;
let freshRefs = false;

/** The site the runner belongs to between jobs, by name, so a job's own
 *  overrides can always be undone. */
let siteName = Object.keys(SITES).find((k) => SITES[k] === site) ?? "gemini";

/** The zip the "Get the zip" button reaches for, from the last finished job. */
let lastZip = null;
let spinner = 0;
/** Jobs we've already explained are finished, so it is said once. */
const saidDone = new Set();
/**
 * Nothing in here may kill the app quietly.
 *
 * The loop touches a browser somebody else is using: tabs close, Chrome
 * quits, a page navigates while it is being read. Every one of those throws,
 * and an uncaught throw ends the process — the Terminal window is behind the
 * browser by then, so all anybody sees is an app that stopped. Worse, the
 * status board stops with it, so from here it looks identical to a hang.
 *
 * So the whole turn is wrapped: the error is reported, printed, and the loop
 * goes round again. If Chrome itself has gone, it reconnects rather than
 * giving up.
 */
process.on("unhandledRejection", (e) => {
  log(`  \x1b[31m!! ${String(e).split("\n")[0]}\x1b[0m`);
  report("error", { error: String(e).split("\n")[0] });
});

while (true) {
 try {
  if (!(await alive()) && !(await reconnect())) {
    await wait(4000);
    continue;
  }
  await ensurePage();
  /*
   * Stop no longer ends the app.
   *
   * This line used to `break` the outer loop, which is the whole process — so
   * pressing Stop, or Claude sending one to abandon a job, quit Magic Wand
   * without saying so. From the outside the window simply went quiet and the
   * next job sat in the queue forever waiting for an app that was no longer
   * there. It cost a relaunch every single time.
   *
   * Stop means "drop what you are doing", never "shut down". The job loop
   * below already ends the current run on it; here the flag is cleared and
   * the app goes back to waiting, which is the only state it should ever end
   * a job in.
   */
  if (await wand.stopped()) {
    await wand.order("continue").catch(() => {});
    log(`\r\x1b[K  \x1b[2mstopped — back to waiting\x1b[0m`);
    report("idle", { waitingFor: "a job in the queue" });
  }

  // A moment offline is not a reason to quit.
  const job = await getJson(QUEUE);

  if (job?.id && done.has(job.id) && !saidDone.has(job.id)) {
    saidDone.add(job.id);
    console.log(`\r\x1b[K  \x1b[2m"${job.name || job.id}" already ran on this Mac — waiting for the next job.\x1b[0m`);
    console.log(`  \x1b[2m(to run it again: quit, delete "${join(process.cwd(), DONE_FILE)}", reopen)\x1b[0m`);
  }
  /*
   * A job in parts keeps its prompts inside those parts.
   *
   * This gate asked only for a top-level "prompts", so every parts job was
   * read off the queue, judged empty and dropped without a word — the app sat
   * there reporting "waiting for a job in the queue" with the job already in
   * front of it. The rest of the runner has understood parts all along; only
   * the door did not.
   */
  const hasWork = Boolean(job?.prompts?.length) ||
    (Array.isArray(job?.parts) && job.parts.some((p) => p?.prompts?.length));
  if (!job?.id || done.has(job.id) || !hasWork) {
    // The button on the finished panel. Reveals the zip in Finder with the
    // file selected, so it can be dragged straight out.
    if (await wand.wantsFolder()) {
      if (lastZip) await run("open", ["-R", lastZip]).catch(() => {});
      else await run("open", [opt.out]).catch(() => {});
    }
    process.stdout.write(`\r  waiting${".".repeat((spinner++ % 3) + 1)}   `);
    /*
     * Say WHY a job on the queue is not being run.
     *
     * "Waiting for a job in the queue" was reported whether the queue was
     * empty or held a job this build had just refused, and four separate bugs
     * hid behind that one sentence for a day: a job whose prompts sat inside
     * its parts, a job already in the done list, a job with no id. Whoever is
     * watching — a person at the app or Claude reading the status — should be
     * told which of those it is, because each has a different fix.
     */
    const why = !job?.id
      ? "a job in the queue"
      : done.has(job.id)
        ? `"${job.name || job.id}" already ran on this Mac — delete .done-jobs to run it again`
        : !hasWork
          ? `"${job.name || job.id}" has no prompts in it — nothing to draw`
          : "a job in the queue";
    report("idle", { waitingFor: why, ...(job?.id ? { refused: job.id } : {}) });
    await obey();
    // Idle is the safe moment to become a newer app.
    await selfUpdate().catch(() => {});
    await wait(POLL_MS);
    continue;
  }

  // Everything about the job, before any of it runs.
  const label = job.name || job.id;

  /*
   * A job can rewrite the site it runs on.
   *
   * Everything this app knows about ChatGPT and Gemini is a handful of CSS
   * selectors, and those change whenever either company ships a redesign —
   * which used to mean a new app, downloaded and dragged into Applications,
   * for a one-line fix. A job can carry its own now:
   *
   *   "selectors": { "send": ["button#new-thing"], "images": ["img.result"] }
   *
   * They merge in front of the built-in ones for the length of the job, so a
   * broken selector is a thing Claude fixes in the queue while the app stays
   * exactly where it is. The same goes for "url" — the address of a specific
   * chat to work in rather than the site's front page.
   */
  const wanted = job.site && SITES[job.site] ? SITES[job.site] : null;
  if (wanted && wanted !== site && siteHeld && SITES[siteHeld] === site) {
    log(`  \x1b[2mthis job asks for ${wanted.name}; staying on ${site.name} as ordered\x1b[0m`);
  } else if (wanted && wanted !== site) {
    // Not signed in there: leave the job alone — it is offered again once
    // that tab is logged in.
    if (!(await switchSite(job.site))) { await wait(POLL_MS); continue; }
  }

  jobWait = Number(job.wait) > 0 ? Number(job.wait) : 0;

  // Selector overrides, for this job only: the built-in list is restored by
  // the copy taken here as soon as the job is done with.
  siteName = Object.keys(SITES).find((k) => SITES[k] === site) ?? siteName;
  if (job.selectors && typeof job.selectors === "object") {
    const over = {};
    for (const [k, v] of Object.entries(job.selectors)) if (Array.isArray(v) && v.length) over[k] = v;
    if (Object.keys(over).length) {
      site = { ...site, ...over };
      console.log(`  \x1b[2musing the queue's own selectors for ${Object.keys(over).join(", ")}\x1b[0m`);
    }
  }

  // And a chat to work in, rather than whatever tab happened to be open.
  if (job.url) {
    console.log(`  opening the chat the job named`);
    await goTo(String(job.url));
  } else if (job.newChat) {
    pinnedChat = null;
  }
  console.log(`\r\x1b[K`);
  console.log(`\x1b[1m${label}\x1b[0m  \x1b[2m(${site.name})\x1b[0m`);
  /*
   * The summary printed before a run has to read a parts job too.
   *
   * It listed job.prompts directly, which a parts job does not have, so the
   * very first line after the gate threw and the job died on the launch pad
   * with a TypeError instead of drawing anything.
   */
  const listed = job.prompts?.length
    ? job.prompts
    : (job.parts ?? []).flatMap((part) => part.prompts ?? []);
  const refCount = job.refs?.length ?? (job.parts ?? []).reduce((n, part) => n + (part.refs?.length ?? 0), 0);
  console.log(`${listed.length} prompt${listed.length === 1 ? "" : "s"}${refCount ? `, ${refCount} reference image${refCount === 1 ? "" : "s"}` : ""}:`);
  listed.forEach((p, i) => {
    const first = String(p).trim().split("\n")[0];
    console.log(`  ${i + 1}. ${first.slice(0, 92)}${first.length > 92 ? "…" : ""}`);
  });
  console.log();

  const summary =
    `${listed.length} prompt${listed.length === 1 ? "" : "s"}` +
    `${refCount ? `, ${refCount} reference image${refCount === 1 ? "" : "s"}` : ""}\n\n` +
    listed.map((p, i) => `${i + 1}. ${String(p).trim().split("\n")[0].slice(0, 70)}…`).join("\n");

  // The card in the corner of the page, when the overlay is there to show it.
  // The macOS dialog stays as the fallback for a page that won't take it.
  let answer = await decision(
    label,
    // A function, not a string: the site can change while this is on screen.
    () => `${listed.length} prompt${listed.length === 1 ? "" : "s"} on ${site.name} — drop your pictures below`,
    summary,
  );

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
    // Only a pressed Skip retires a job. Anything else — a dialog that timed
    // out, a Mac with no osascript — leaves it in the queue to be offered
    // again, rather than silently losing the work.
    if (answer === "skip") {
      done.add(job.id);
      await writeFile(DONE_FILE, [...done].join("\n"));
      console.log(`Skipped.\n`);
    } else {
      console.log(`No answer — it'll come back round.\n`);
      await wait(POLL_MS);
    }
    continue;
  }

  // The card can sit on screen for minutes, and live orders are obeyed the
  // whole time it is — including "gemini" on a job written for ChatGPT. Left
  // unchecked the job then ran on the wrong site with the other one's
  // selectors merged in, which looks exactly like a site redesign.
  if (wanted && siteName !== job.site && !(siteHeld && SITES[siteHeld] === site) && !(await switchSite(job.site))) {
    await wait(POLL_MS);
    continue;
  }

  /*
   * Written down as run before it runs, not after.
   *
   * It used to be recorded at the end, inside the same try that now catches
   * everything — so a throw two prompts in re-offered the whole job and
   * re-sent every prompt already sent, forever, spending the quota each time.
   * Once somebody has said yes, this job has had its turn.
   */
  done.add(job.id);
  await writeFile(DONE_FILE, [...done].join("\n")).catch(() => {});

  await say(label, "Starting…", true);

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
  if (inCard) log(`  ${inCard} picture${inCard === 1 ? "" : "s"} from the card`);

  /*
   * A job that asked for references and got none would draw the wrong thing
   * forty-four times and spend the day's quota doing it. It stops instead,
   * says why, and leaves the job to be run again once the pictures are
   * reachable.
   */
  if (job.refs?.length && !inCard && !picked.length && !refs.length) {
    log(`  \x1b[31m!! none of the ${job.refs.length} reference pictures would download — not running\x1b[0m`);
    report("error", { job: label, error: "the job's reference pictures could not be downloaded" });
    await wand.done("Couldn't get the references", "Nothing was run. The pictures the job points at didn't download.");
    // And let it be run again. It was written into the done list before it
    // started, so the promise in that sentence was not being kept: the job was
    // gone for good the moment its references failed.
    done.delete(job.id);
    await writeFile(DONE_FILE, [...done].join("\n")).catch(() => {});
    continue;
  }

  held.running = true;
  await wand.running();
  attachedInChat = false;
  freshRefs = false;
  let total = 0;
  /**
   * One conversation, entered fresh.
   *
   * `newChat: true` used to mean a brand new thread for every single prompt.
   * So the long first message that teaches the model the five products, their
   * sizes and the house style was left behind the moment prompt two ran, the
   * references were pasted again on all fifteen — nine pictures each time —
   * and every shot after the first was drawn by a model that had never been
   * told anything. It now means: open a clean thread for the first prompt and
   * stay in it. A job that genuinely wants a thread per prompt asks for
   * `newChat: "each"`.
   */
  const perPrompt = job.newChat === "each";
  /**
   * A job in parts: one product at a time, the way a person does it.
   *
   * Each part brings its own pictures and its own prompts. The app opens a
   * chat, attaches that product's pictures once, draws that product, then
   * starts a clean chat for the next one. No attaching all five products to
   * every prompt, and no thread full of things it is not being asked to draw.
   *
   * A job with no parts is treated as one part, so nothing older changes.
   */
  const parts = Array.isArray(job.parts) && job.parts.length
    ? job.parts.map((p) => ({ name: p.name ?? "", refs: p.refs ?? [], prompts: p.prompts ?? [] })).filter((p) => p.prompts.length)
    : [{ name: "", refs: job.refs ?? [], prompts: job.prompts ?? [] }];
  /** Which part each prompt belongs to, flattened. */
  const belongs = parts.flatMap((p, pi) => p.prompts.map(() => pi));
  /** The first prompt of a part starts its own chat and brings its own pictures. */
  const opensPart = parts.flatMap((p) => p.prompts.map((_, i) => i === 0));
  const sameChat = (i) => (perPrompt ? false : !(opensPart[i] && (parts.length > 1 || job.newChat)));
  /** Prompts in a row that produced nothing. Two means the site, not the prompt. */
  let dry = 0;
  let live = refs;
  let card = inCard;
  const flatPrompts = parts.flatMap((p) => p.prompts);
  /**
   * Where this job got to, on disk, next to its pictures.
   *
   * A job is written into the done list before it runs, so a crash, a closed
   * Chrome or a quit app used to lose everything that was left — the job came
   * back as "already run" and the last thirty prompts were never drawn. The
   * index of the next prompt is saved after every one, and a job that finds
   * its own progress file picks up there instead of at the beginning.
   */
  const progressFile = join(dir, "progress.json");
  /*
   * What the saved place belongs to, exactly.
   *
   * The id and the prompt count were the whole test, and a rewritten job kept
   * inheriting a stale position: prompts one and two were declared already
   * done and the run began in the middle, so two of five products were never
   * drawn and the folder came back short with nothing saying why. Rewriting a
   * prompt is the most common thing that happens to a job between two runs,
   * and it is exactly the case where the old place is meaningless.
   *
   * So the fingerprint covers the prompts themselves. Change a word in any of
   * them and the run starts at the beginning, which is the only safe answer.
   */
  const signature = `${flatPrompts.length}:${flatPrompts
    .map((t) => {
      let h = 0;
      const str = String(t);
      for (let k = 0; k < str.length; k++) h = (h * 31 + str.charCodeAt(k)) | 0;
      return h.toString(36);
    })
    .join(",")}`;
  let startAt = 0;
  try {
    const seen = JSON.parse(await readFile(progressFile, "utf8"));
    if (
      seen?.id === job.id &&
      Number.isInteger(seen.next) &&
      seen.next > 0 &&
      seen.next < flatPrompts.length &&
      // Two jobs with the same name share a folder, so the count has to match
      // as well as the id — otherwise a resume can start past the end of a
      // shorter job and draw nothing at all.
      seen.of === flatPrompts.length &&
      seen.sig === signature
    ) {
      startAt = seen.next;
      log(`  \x1b[2mpicking up at ${startAt + 1} of ${flatPrompts.length}\x1b[0m`);
    }
    else if (seen?.next > 0) {
      log(`  \x1b[2mthis job was rewritten since it last ran — starting from the beginning\x1b[0m`);
    }
  } catch {
    /* no progress yet, which is the normal case */
  }
  // The standing instruction goes in front of the first prompt of every part,
  // so each product gets the brief without it being retyped into every line.
  const textFor = (i) =>
    opensPart[i] && job.brief ? `${job.brief}\n\n${flatPrompts[i]}` : flatPrompts[i];
  // Where an interrupted run got to, and whether it was interrupted at all.
  let stoppedEarly = flatPrompts.length > startAt;
  let resumeAt = startAt;
  /** Where to carry on from after a redo sent the loop backwards, and which
      shot it was sent back for. */
  let redoReturn = null;
  let redoDoing = null;
  /** Which part the previous prompt belonged to, so a change can be noticed. */
  let lastPart = -1;
  for (let i = startAt; i < flatPrompts.length; i++) {
    // This part's own pictures, attached when the part opens and never again.
    const mine = parts[belongs[i]]?.refs ?? [];
    try {
    /*
     * Load a part's pictures whenever the part CHANGES, not only when its
     * first prompt runs.
     *
     * Two ways that went wrong. A job resumed in the middle of part three
     * never sees that part's first prompt, so `live` kept the job-level refs
     * -- empty for a parts job -- and the rest of the run was drawn with no
     * reference, or worse, attached the wrong set. And a `redo` that jumps
     * back into an earlier part loads that part's pictures, then returns to
     * where it was without ever loading the pictures back, so everything
     * after it was drawn with the redone product's references.
     *
     * Asking "am I in a different part than the last prompt was" answers both.
     *
     * The old guard was also parts.length > 1, so a job with exactly one part
     * never fetched its pictures at all.
     */
    const partChanged = belongs[i] !== lastPart;
    lastPart = belongs[i];
    if (partChanged && (parts.length > 1 || (mine.length && !refs.length))) {
      // fetchRefs(urls, dir) — the folder it saves into is not optional, and
      // leaving it off crashed the whole run on the first part before a single
      // picture was drawn. Each part keeps its references in its own folder.
      live = mine.length
        ? await fetchRefs(mine, join(dir, "reference", String(belongs[i] + 1))).catch(() => [])
        : [];
      attachedInChat = false;
      freshRefs = Boolean(live.length);
      if (parts[belongs[i]]?.name) log(`\n\x1b[1m${parts[belongs[i]].name}\x1b[0m`);
    }
    } catch (e) {
      // A part that cannot fetch its picture draws without one and says so,
      // rather than ending the job for the three parts behind it.
      log(`  \x1b[31m!! couldn't set this part up — ${String(e?.message ?? e).slice(0, 80)}\x1b[0m`);
      live = [];
    }
    if (await wand.stopped()) break;
    // Paused holds here rather than unwinding the run, so Continue picks up on
    // the very next prompt with everything — the folder, the zip, the count —
    // exactly where it was. Add pictures reopens the card mid-run, and
    // whatever is dropped there becomes the reference from that prompt on,
    // which is how one run covers a second product.
    while (await wand.paused()) {
      if (await wand.stopped()) break;
      if (await wand.wantsCard()) {
        const sub = `Paused at ${i + 1} of ${flatPrompts.length} — drop the pictures to use from here`;
        await wand.ask(label, sub);
        const answer = await decision(label, sub, sub);
        if (answer === "skip") { await wand.running(); break; }
        const got = await wand.fileCount();
        if (got) {
          card = got;
          live = [];
          // New pictures beat whatever is already up the thread, even in a
          // conversation that has references in it — that is the whole point
          // of handing it more.
          freshRefs = true;
          log(`\r\x1b[K  ${got} new picture${got === 1 ? "" : "s"} from here on`);
        }
        await wand.running();
        break;
      }
      process.stdout.write(`\r  paused at ${i + 1}/${flatPrompts.length} — press Continue, or tell Claude   `);
      await obey();
      await wait(700);
    }
    if (await wand.stopped()) break;

    /*
     * Claude changed something while this was running.
     *
     * Two shapes, one mechanism. "requeue" means the words for the shots not
     * yet drawn have been rewritten — re-read them and carry on. "redo 7"
     * means shot seven came out wrong and has been rewritten — go back and
     * draw it again, then carry on from where we were. Neither stops the run,
     * and neither needs the app closed, which is the entire point.
     */
    if (reload) {
      reload = false;
      const now = await getJson(QUEUE);
      if (now?.id === job.id && Array.isArray(now.prompts) && now.prompts.length) {
        for (let k = 0; k < flatPrompts.length && k < now.prompts.length; k++) {
          flatPrompts[k] = now.prompts[k];
        }
        log(`\r\x1b[K  \x1b[35mtook Claude's rewrite\x1b[0m`);
      }
      if (redoAt != null && redoAt < flatPrompts.length && redoAt < i) {
        const back = redoAt;
        redoAt = null;
        log(`\r\x1b[K  \x1b[35mredrawing ${back + 1} of ${flatPrompts.length}\x1b[0m`);
        // Where to come back to once that one shot is done. Without it the run
        // would carry on forwards from the redone shot and draw everything
        // after it a second time.
        redoReturn = i;
        redoDoing = back;
        i = back - 1;        // `continue` still runs the loop's ++
        continue;
      }
    }
    // The redone shot is finished. Pick the run back up where it was.
    if (redoDoing != null && i > redoDoing) {
      const on = redoReturn;
      redoDoing = null;
      redoReturn = null;
      if (on != null && on > i) { i = on - 1; continue; }
    }

    /**
     * A prompt is never thrown away for nothing.
     *
     * This used to take whatever came back — including zero — log it and walk
     * on to the next line. So a site that refused the send, or asked a
     * question back, or simply took longer than the window, cost a prompt
     * silently, and a whole run could march through forty lines and produce an
     * empty folder while the panel counted happily upwards. That is what the
     * owner watched happen, and he was right to call it what it was.
     *
     * Now: one straight retry, and if the second attempt is empty too the run
     * HOLDS and says which prompt and why, so a person can look at the tab.
     * The queue keeps its place either way — nothing is consumed unseen.
     */
    /**
     * Wrapped, because a throw here used to end the job in silence.
     *
     * The job is written to the done list before it runs, so an exception in
     * prompt three walked out of the loop, was logged at the bottom of the
     * file, and the next pass skipped the job as finished. Prompts four to
     * forty never existed. A click that cannot land, a page that closed, a
     * reference file that moved — any of them did it.
     */
    const attempt = () =>
      runPrompt(textFor(i), live, label, i + 1, flatPrompts.length, dir, card, sameChat(i))
        .catch((e) => { log(`  \x1b[31m!! that prompt threw — ${String(e).slice(0, 90)}\x1b[0m`); return 0; });
    let got = await attempt();
    if (!got && !(await wand.stopped())) {
      log(`  \x1b[33mnothing came back — running that one again\x1b[0m`);
      report("running", { job: label, prompt: `${i + 1} of ${flatPrompts.length}`, saved: total, note: "retrying — the first attempt produced no picture" });
      got = await attempt();
    }
    if (!got && !(await wand.stopped())) {
      dry += 1;
      const why = `Prompt ${i + 1} of ${flatPrompts.length} produced no picture, twice. Look at the tab — the site may be asking something, out of generations, or refusing the prompt.`;
      log(`  \x1b[31m!! ${why}\x1b[0m`);
      report("needs a look", { job: label, prompt: `${i + 1} of ${flatPrompts.length}`, saved: total, error: why });
      // Two empty prompts in a row is the site, not the prompt. Stop rather
      // than burn the rest of the queue against a wall.
      if (dry >= 2) {
        await wand.done("Stopped — nothing is coming back", why);
        break;
      }
      // Hold on this one. Continue moves to the next prompt; the queue is
      // still whole, and whoever presses it has seen the screen.
      await wand.order("pause");
      await say(label, `${i + 1} of ${flatPrompts.length} — no picture. Press Continue when the tab looks right.`);
      while (await wand.paused()) {
        if (await wand.stopped()) break;
        await obey();
        await wait(700);
      }
      if (await wand.stopped()) break;
      await wand.running();
    } else if (got) {
      dry = 0;
    }
    total += got;
    log(`  [${i + 1}/${flatPrompts.length}] ${got} image${got === 1 ? "" : "s"}`);
    report("running", { job: label, prompt: `${i + 1} of ${flatPrompts.length}`, saved: total });
    // The zip is rebuilt after every prompt rather than once at the end.
    // A free account runs out of generations partway through a long job, and
    // building the archive only on the last line meant everything that had
    // already been drawn stayed locked in a folder nobody could find, with a
    // button that opened nothing. Now whatever is finished is on the Desktop
    // the moment it is finished.
    if (got) lastZip = (await makeZip(dir, slug)) ?? dir;
    // Written after every prompt, so whatever kills the app next costs one
    // prompt rather than the rest of the job.
    resumeAt = i + 1;
    await writeFile(progressFile, JSON.stringify({ id: job.id, next: i + 1, of: flatPrompts.length, sig: signature })).catch(() => {});
    if (i === flatPrompts.length - 1) stoppedEarly = false;
    else stoppedEarly = true;
  }

  /*
   * Only a run that reached the last prompt has nothing left to pick up.
   *
   * Every `break` above — Stop, or a stretch of prompts that drew nothing —
   * landed here too and deleted the resume file, while the job stayed in
   * .done-jobs. So the one case the resume file exists for, an interrupted
   * job, was the one case it was thrown away: re-queueing started from
   * prompt one and spent the whole quota again. Stopping now keeps the
   * place and puts the job back on the queue's side of the line.
   */
  const finished = !stoppedEarly && !(await wand.stopped());
  if (finished) {
    await rm(progressFile, { force: true }).catch(() => {});
  } else {
    done.delete(job.id);
    await writeFile(DONE_FILE, [...done].join("\n")).catch(() => {});
    log(`  \x1b[2mstopped at ${resumeAt} of ${flatPrompts.length} — send it again and it carries on\x1b[0m`);
  }
  await say("Waiting", `${label}: ${total} saved. Tell Claude what's next.`, true);

  // The panel, with the number and a button that opens the folder — because
  // a folder you can see beats a sentence saying the folder exists.
  /**
   * One zip on the Desktop, and the loose folder thrown away.
   *
   * Saving into a folder per job meant a Downloads directory slowly filling
   * with directories nobody could find again. A single file, on the Desktop,
   * named after the job, is the thing somebody can actually point at — and
   * making it here rather than asking the chat site for one is the difference
   * between it existing and it being promised.
   */
  const zipPath = total ? await makeZip(dir, slug) : null;
  if (zipPath) {
    /*
     * Keep the place of an unfinished job.
     *
     * progress.json lives in this folder, and the branch above has just
     * decided -- for a job that was stopped part way -- to keep it so that
     * sending the job again carries on instead of starting over. Then this
     * deleted the folder it is in, unconditionally, fifteen lines later. So
     * the one case the resume file exists for was the one case it was thrown
     * away: re-queueing began at prompt one and spent the whole quota again,
     * which is exactly what keeping it was meant to prevent.
     *
     * A finished job has already removed its own progress file, so there is
     * nothing to save and the folder goes as before.
     */
    if (finished) {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    } else {
      const keep = await readFile(progressFile, "utf8").catch(() => null);
      await rm(dir, { recursive: true, force: true }).catch(() => {});
      if (keep !== null) {
        await mkdir(dir, { recursive: true }).catch(() => {});
        await writeFile(progressFile, keep).catch(() => {});
      }
    }
    console.log(`\n\x1b[1m${total} picture${total === 1 ? "" : "s"} → ${zipPath.replace(process.env.HOME ?? "", "~")}\x1b[0m\n`);
  } else if (total) {
    console.log(`\n\x1b[1m${total} picture${total === 1 ? "" : "s"} saved to ${dir}\x1b[0m\n`);
  }

  lastZip = zipPath ?? (total ? dir : null);
  // Whatever ended this job, the app is not stopped — the next job must not
  // inherit the flag and end before it starts.
  await wand.order("continue").catch(() => {});
  report("finished", { job: label, saved: total, zip: lastZip });
  await wand.done(
    total ? `${total} picture${total === 1 ? "" : "s"} ready` : "Nothing came back",
    total
      ? (zipPath ?? dir).replace(process.env.HOME ?? "", "~")
      : `${site.name} returned no images for this one.`,
  );
 } catch (e) {
  // Whatever it was, it is not a reason to disappear.
  const first = String(e?.stack ?? e).split("\n").slice(0, 2).join(" ");
  log(`  \x1b[31m!! ${first}\x1b[0m`);
  report("error", { error: first });
  await wait(3000);
 } finally {
  // A job's selector and url overrides belong to that job. Leaked by a throw,
  // they would quietly rewrite every job that came after it.
  site = SITES[siteName] ?? site;
 }
}

await browser.close();

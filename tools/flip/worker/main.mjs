/**
 * flip — the loop.
 *
 * Read the board, think, write, show. Round and round, at a person's pace,
 * inside the seller's own hours, in the seller's own signed-in window.
 *
 * The thinking is not done here. This posts what it sees to the back end;
 * Claude reads that board from the other side, writes the deliverable and the
 * reply against that buyer's actual words, and posts them back; this shows
 * them. Nothing is templated and nothing is cached, and the laptop holds no
 * credential of any kind — the app talks to a Claude session Alex already
 * pays for rather than to an API key he would have to buy.
 *
 * The panel is pushed after every step rather than at the end of a pass, so
 * the screen is never a progress bar — it is what is happening, now.
 *
 * Sending is a tap. Every reply, every delivery. Depop does not permit automated
 * fulfilment and enforces it with a permanent ban that cannot be appealed, and
 * this account is the one paying for the ads, so the last button is his. The
 * work still gets done by the machine; only the pressing is human, and the
 * pressing is the cheap part.
 */
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { startBridge } from "./bridge.mjs";
import { shortlist } from "./work.mjs";
import { connectCloud } from "./cloud.mjs";
import { openChrome, pageOverChrome, findChrome } from "./chrome.mjs";
import { readKnowledge } from "./knowledge.mjs";
import { SELLER, working, takeBudget, betweenActionsMs, typeReply } from "./pace.mjs";

/* The inbox, because an unanswered buyer is the only row that costs ranking
   by the hour. The shop floor is read from there in the same pass. */
const BOARD = "https://www.depop.com/messages/";
/* Filled in from the page once it says who he is. The homepage was being read
   as "the shop floor", which is other people's listings in the recommendation
   feed — so the app would have shortlisted strangers' items and tried to
   refresh them. */
let SHOP = "https://www.depop.com/alleqsh/";
/** Where a new listing is written. */
const SELL = "https://www.depop.com/products/create/";
const cloud = connectCloud();
/** How often to look for work Claude has written. */
const DRAIN_MS = 6000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const state = {
  build: 1,
  working: false,
  resting: null,
  doing: null,
  takenToday: 0,
  takeBudget: takeBudget(Number(process.env.FLIP_DAYS_SELLING) || 0),
  board: [],
};

/* What was refreshed, offered and answered, and when. The rules read this to
   hold themselves to once a day and once every few days — without it the app
   would refresh the same listing every pass, which is the exact rhythm the
   bans are for. It lives for the life of the process, which is the life of
   the window. */
const history = Object.create(null);

let page = null;
/** Set by the first hello. Later ones are just the page reloading. */
let greeted = false;
/** Set by the panel's "Work anyway", cleared by the pass it buys. */
let override = false;

function show(patch) {
  Object.assign(state, patch);
  /* One line onto the glass whenever there is something new to say — the
     machine thinking out loud, which is how he can tell it apart from frozen
     without opening anything. */
  if (patch.doing || patch.resting) {
    page?.ask("panel", { note: patch.doing || patch.resting }).catch(() => {});
  }
  page?.ask("panel", { ...state }).catch(() => {});
  // Said outward too, so "is flip working?" has an answer from anywhere.
  cloud.status({
    working: state.working,
    doing: state.doing,
    resting: state.resting,
    takenToday: state.takenToday,
    takeBudget: state.takeBudget,
    jobs: state.board.length,
  }).catch(() => {});
}

function patch(id, fields) {
  show({ board: state.board.map((j) => (j.id === id ? { ...j, ...fields } : j)) });
}

/**
 * The tray Claude writes into.
 *
 * Drained rather than polled per job, because one read hands over everything
 * written since the last one and the back end clears it on read — so the same
 * reply can never be typed twice, which matters more than latency.
 */
const written = new Map();

/*
 * Take the work, then say so.
 *
 * Reading used to clear the tray on the far side, so a slow response or a
 * dropped link — and this gives up after ten seconds — lost everything Claude
 * had written in that window, permanently and silently. Now the tray is only
 * emptied of the ids that actually arrived here.
 */
async function drain() {
  const got = await cloud.work().catch((error) => {
    cloud.log([{ line: `could not read the tray: ${error.message}` }]).catch(() => {});
    return null;
  });
  const items = got?.items ?? {};
  const ids = Object.keys(items);
  if (!ids.length) return 0;
  for (const [id, work] of Object.entries(items)) written.set(id, work);
  await cloud.ack(ids).catch(() => {
    /* Not acknowledged: the tray keeps them and the next drain hands them
       over again. `written` is keyed by id, so a second copy overwrites
       rather than duplicating — a job can be handed over twice, never typed
       twice, because typing waits for his tap. */
  });
  return ids.length;
}

/*
 * Nothing waits for him. Ever.
 *
 * This used to be a promise with no timeout, awaited inside the pass, inside
 * the lock — so one reply he did not tap at 09:35 stopped every refresh, every
 * offer and every other reply for the rest of the day, while the app sat there
 * looking alive. It is the worst bug this thing has had.
 *
 * A pass writes the work onto the board and moves on. His tap arrives whenever
 * it arrives and is handled on its own, below.
 */

/** Written, shown, and waiting on him — by id. */
const onTheBoard = new Map();

/** Every row the last pass shortlisted, by id, with what it decided. Kept so
 *  that work Claude writes a minute later can still find its row. */
const known = new Map();

/**
 * Put one piece of written work in front of him.
 *
 * Shared by the pass and by the drain loop, because work almost never arrives
 * while a pass is running — Claude writes in its own time, and a row that had
 * to wait for the next pass to appear meant his Take did nothing for fifteen
 * minutes and nothing said why.
 */
function present(id, work) {
  const seat = known.get(id);
  if (!seat) return false;
  const words = work.kind === "listing"
    ? [work.title, work.description, (work.hashtags || []).join(" ")].filter(Boolean).join("\n\n")
    : work.kind === "offer"
      ? String(work.priceCents != null ? work.priceCents / 100 : "")
      : work.reply;
  onTheBoard.set(id, { row: seat.row, work, words, verdict: seat.verdict });
  patch(id, {
    reply: words,
    ready: work.ready,
    questions: work.questions,
    why: work.why || seat.verdict.why,
  });
  return true;
}

/** Type one thing he has just taken. Runs outside the pass, on its own. */
async function takeIt(id) {
  const held = onTheBoard.get(id);
  if (!held || !page) return;
  const { row, work, words, verdict } = held;
  onTheBoard.delete(id);

  /*
   * No hold here.
   *
   * The reading-time delay belongs before the work is put in front of him, not
   * after he has asked for it — once he presses Take he is waiting on the app,
   * and up to ninety seconds of nothing is how it earned "it does nothing".
   * The human rhythm comes from the pass cadence and from the fact that he
   * presses send himself, which is a real person at a real keyboard.
   */
  /* An offer is a price, not a sentence, and an empty one must never be
     reported as typed. */
  if (!String(words || "").trim()) {
    patch(id, { why: "nothing written to type — Claude sent an empty one" });
    show({ doing: null });
    return;
  }

  show({ doing: `typing ${work.kind === "listing" ? "the listing" : "to " + (row.buyer ?? "the buyer")}` });
  const strokes = typeReply(words);
  /*
   * The deadline follows the typing, not the clock.
   *
   * The bridge gives an act 20 seconds. At a human's pace that is about 130
   * characters — so a normal reply timed out mid-sentence and a listing, at
   * five hundred to fifteen hundred characters, never stood a chance. The
   * hands kept typing correctly in the page while the brain gave up on them.
   */
  const howLong = strokes.reduce((sum, stroke) => sum + (stroke?.delayMs ?? 0), 0);
  const typed = await page
    .ask("type", { into: "composer", strokes }, { ms: 30_000 + howLong })
    .catch(() => null);

  /* The count and the message both depend on what the page actually says.
     Claiming work that does not exist is the worst thing this app could do. */
  if (!typed || typed.ok === false || typed.found === false) {
    patch(id, { reply: words, why: "could not find the box — open it on screen and press Take again" });
    onTheBoard.set(id, held);
    show({ doing: null });
    return;
  }

  state.takenToday += 1;
  if (verdict.act === "offer") history[id] = { ...(history[id] || {}), offeredAt: Date.now() };
  if (verdict.act === "reply") history[id] = { ...(history[id] || {}), repliedAt: Date.now() };
  patch(id, { reply: words + "\n\n— typed, ready for you to send" });
  show({ takenToday: state.takenToday, doing: null });
}

/** A pass can block for twenty minutes waiting on Claude while the timer
 *  fires again underneath it. Two passes interleaving `goto`, the board and
 *  the day's count is not a race worth having. */
let passing = false;

async function pass() {
  if (passing) return;
  passing = true;
  try {
    rollDay();
    await onePass();
  } finally {
    passing = false;
  }
}

async function onePass() {
  /* The shop opens before the clock is consulted: he cannot sign in if the
     window never leaves the starting screen, and a window that sits on
     "waking" all evening looks broken when it is only resting. */
  show({ doing: "opening the shop" });
  await page.ask("goto", { url: BOARD });
  await sleep(betweenActionsMs());

  /*
   * Signed in, or nothing else here means anything.
   *
   * Without this the app read a logged-out page and told him "nothing on the
   * shop floor yet" — which is the worst lie it could tell, because a shut
   * door looks exactly like a quiet day.
   */
  /* `accountStatus`, because that is the act the reader implements — "status"
     fell through to a default branch that answered false on every page. */
  const who = await page.ask("read", { what: "accountStatus" }).catch(() => null);
  if (!who || who.signedIn !== true) {
    show({
      working: false,
      signedOut: true,
      doing: null,
      resting: "not signed in — open me and paste your login",
      board: [],
    });
    return;
  }
  show({ who: who.who ?? null, signedOut: false });
  /* His handle, as the page states it. Without one there is no shop floor to
     read, so the pass does the inbox and stops rather than reading Depop's
     front page and calling it his. */
  /* His handle if the page states it, and alleqsh as the default — so a pass
     can still read the shop floor on a screen that does not print it. */
  if (who.who) SHOP = `https://www.depop.com/${String(who.who).replace(/^@/, "")}/`;

  if (!working(new Date(), SELLER) && !override) {
    show({
      working: false,
      doing: null,
      resting: "paused",
      board: [],
    });
    return;
  }
  override = false;
  show({ working: true, resting: null });

  show({ doing: "reading the inbox" });
  const inbox = await page.ask("read", { what: "listings" });

  /* Then the shop floor. Two reads, because they are two screens, and a pass
     that only ever saw the inbox would never refresh or offer anything. */
  let floor = [];
  if (SHOP) {
    await sleep(betweenActionsMs());
    show({ doing: "looking at the shop" });
    await page.ask("goto", { url: SHOP });
    await sleep(betweenActionsMs());
    floor = await page.ask("read", { what: "listings" });
  }

  /* Anything but an array is a timeout or a refusal — never spread it. */
  const rows = [
    ...(Array.isArray(inbox) ? inbox : []),
    ...(Array.isArray(floor) ? floor : []),
  ];
  const { take, considered } = shortlist(rows, { history });

  if (!take.length) {
    show({
      doing: null,
      resting: considered
        ? "all caught up — answered, refreshed, or too soon to touch"
        : "nothing on the shop floor yet",
      board: [],
    });
    return;
  }

  const board = take.map(({ row, verdict }) => ({
    id: row.id,
    kind: row.kind,
    act: verdict.act,
    title: row.title ?? null,
    buyer: row.buyer ?? null,
    price: row.priceCents ?? null,
    currency: row.currency ?? null,
    likes: row.likes ?? null,
    why: verdict.why,
    urgent: verdict.urgent === true,
    line: row.line ?? null,
    waitingMinutes: row.waitingMinutes ?? null,
    satMinutes: row.listedMinutesAgo ?? null,
    reply: null,
    ready: null,
  }));
  show({ doing: `${take.length} to do`, board });
  await cloud.board(board).catch(() => {});

  /* Refreshes first, because they need nobody: one tap on a listing he already
     wrote, inside the window, on something people liked. */
  for (const { row, verdict } of take) {
    if (verdict.act !== "refresh") continue;
    if (state.takenToday >= state.takeBudget) break;
    show({ doing: `refreshing ${row.title ?? "a listing"}` });
    const done = await page.ask("tap", { url: row.url, what: "refresh" }).catch(() => null);
    if (done && done.ok !== false && done.found !== false) {
      history[row.id] = { ...(history[row.id] || {}), refreshedAt: Date.now() };
      patch(row.id, { why: verdict.why + " — refreshed" });
    } else {
      patch(row.id, { why: "could not find the refresh control" });
    }
    await sleep(betweenActionsMs());
  }

  /* Then whatever Claude has already written, put in front of him. One drain,
     no waiting — what is not written yet will be there on the next pass. */
  /* Remember the seats before draining, so anything already written finds its
     row — and so anything written later still can. */
  known.clear();
  for (const { row, verdict } of take) {
    if (verdict.act !== "refresh") known.set(row.id, { row, verdict });
  }

  await drain();

  /* Anything Claude has written as a listing goes up now. It does not wait for
     him — he is not the bottleneck and was never meant to be one. */
  for (const [id, work] of [...written.entries()]) {
    if (work?.kind !== "listing" || work.ready === false) continue;
    if (state.takenToday >= state.takeBudget) break;
    written.delete(id);
    await listOne(id, work);
    await sleep(betweenActionsMs());
  }

  let waitingOnHim = 0;
  for (const id of known.keys()) {
    const work = written.get(id);
    if (!work) continue;
    written.delete(id);
    if (present(id, work)) waitingOnHim += 1;
  }

  show({
    doing: null,
    resting: waitingOnHim
      ? `${waitingOnHim} written — open me and press Take`
      : "on the board, waiting on Claude to write them",
  });
}

/** Midnight resets the count. Without this "Done for today" was forever. */
let day = new Date().toDateString();
function rollDay() {
  const today = new Date().toDateString();
  if (today === day) return;
  day = today;
  state.takenToday = 0;
  state.takeBudget = takeBudget(Number(process.env.FLIP_DAYS_SELLING) || 0);
}

/*
 * His own Chrome, and it is the driver — not the window's web view.
 *
 * The web view could never hold a Depop session across builds (its cookie jar
 * comes from the process, and the process changes) and could never complete
 * Continue with Google or Continue with Apple, because both refuse an embedded
 * browser on purpose. So the pass runs in his Chrome: a profile of its own
 * under the support directory that no rebuild touches, signed into once and
 * kept.
 *
 * The loop does not know the difference. It says page.ask(act, args) and
 * pageOverChrome answers in the same shape the bridge does.
 *
 * If Chrome is not installed, the window's web view is still there and the
 * bridge still assigns `page` on hello — so the app degrades to what it was
 * rather than refusing to start.
 */
let chrome = null;

async function useChrome() {
  if (!findChrome()) {
    cloud.log([{ line: "Chrome is not installed — falling back to the window" }]).catch(() => {});
    return false;
  }
  try {
    chrome = await openChrome({
      home: process.env.FLIP_HOME || ".",
      agent: await readFile(new URL("./agent.built.js", import.meta.url), "utf8"),
      log: (line) => cloud.log([{ line }]).catch(() => {}),
    });
    /* Whatever is already open, or the shop. Reusing the tab matters: opening
       a new one on every start would leave him with forty tabs by lunchtime. */
    const target = (await chrome.firstPage()) ?? (await chrome.open(SHOP));
    page = pageOverChrome(target);
    show({ doing: "using your Chrome" });
    return true;
  } catch (error) {
    cloud.log([{ line: `chrome would not start: ${error.message}` }]).catch(() => {});
    return false;
  }
}

let bridge;
bridge = await startBridge({
  /* fileURLToPath, never `.pathname`: the worker lives in "Application
     Support", and a URL pathname percent-encodes that space. The bridge then
     looked for agent.built.js under "Application%20Support", never found it,
     and answered 500 — so the window gave up on a worker that was listening
     the whole time. */
  dir: fileURLToPath(new URL(".", import.meta.url)),
  // One argument. The bridge hands over the message and nothing else — the
  // way to reach the page is the object startBridge returned, which is why
  // `page` is assigned below rather than in here.
  onMessage(message) {
    if (message.t === "hello") {
      /* Only if Chrome is not driving. Otherwise a reload of the window's web
         view would quietly take the pass back off his signed-in browser and
         put it on one that has never seen Depop. */
      if (!chrome) page = bridge;
      show({});
      /*
       * Only the first hello starts a pass.
       *
       * The page says hello every time it loads — and a pass BEGINS with a
       * navigation. So every pass caused a reload, every reload said hello,
       * and every hello started another pass: the window reloading about once
       * a second, forever, which is exactly what he saw. The timer below is
       * the only thing that starts a pass now.
       */
      if (!greeted) {
        greeted = true;
        pass().catch((error) => {
          cloud.log([{ line: `pass failed: ${error.message}` }]).catch(() => {});
        });
      }
    }
    if (message.t === "now") {
      override = true;
      pass().catch(() => {});
    }
    /* Out of band, both. A tap never waits for a pass, a pass never waits
       for a tap. */
    /* Depop pushing back is the most important thing the page can say, and it
       was being thrown away. It goes on the record and onto the glass. */
    if (message.t === "trouble") {
      const line = String(message.what ?? message.line ?? "trouble on the page");
      cloud.log([{ line }]).catch(() => {});
      show({ resting: line });
    }
    if (message.t === "take") {
      takeIt(String(message.id)).catch((error) => {
        cloud.log([{ line: `take failed: ${error.message}` }]).catch(() => {});
      });
    }
    if (message.t === "skip") {
      onTheBoard.delete(String(message.id));
      patch(String(message.id), { reply: null, why: "skipped" });
    }
  },
});

console.log(`PORT ${bridge.port}`);

/*
 * Chrome comes up alongside the worker — NEVER awaited here.
 *
 * This used to be `if (await useChrome())`, and that one word took the app
 * down: everything below this line — the status heartbeat, the pass timer, the
 * drain, Xcoder — only registers once the await finishes. Chrome opened, the
 * attach hung, and the rest of the worker never came into existence. From the
 * outside: Chrome on screen, the window connected the whole time, and nothing
 * ever sent, which is exactly "the worker is not answering".
 *
 * A top-level await is a promise the whole module is betting on. Nothing that
 * talks to another process belongs in one.
 *
 * So it is started and left to settle. The pass timer below finds `page` when
 * it is ready and gets on with it; until then the window is told what is
 * happening rather than left on a boot screen.
 */
show({ doing: "starting your Chrome" });
useChrome()
  .then((ok) => {
    if (!ok) {
      show({ doing: null, resting: "using the window — Chrome did not start" });
      return;
    }
    greeted = true;
    return pass();
  })
  .catch((error) => {
    show({ doing: null, resting: `chrome: ${error.message}` });
    cloud.log([{ line: `chrome start failed: ${error.message}` }]).catch(() => {});
  });

/*
 * What it knows, published once at start.
 *
 * The shipped folder plus his own — `knowledge/` under the support directory —
 * where the markdown we write from his videos lands. He can drop a file in
 * there and restart, with no new build and nothing to install.
 */
(async () => {
  const here = fileURLToPath(new URL(".", import.meta.url));
  const mine = (process.env.FLIP_HOME || "") + "/knowledge";
  const files = await readKnowledge([join(here, "knowledge"), mine]);
  if (!files.length) {
    cloud.log([{ line: "no playbook found — listings will be written blind" }]).catch(() => {});
    return;
  }
  await cloud.knowledge(files).catch(() => {});
  cloud.log([{ line: `playbook: ${files.map((f) => f.name).join(", ")}` }]).catch(() => {});
})();

/**
 * Say "I am up" before the page has said anything.
 *
 * Without this the back end cannot tell a dead worker from a live one whose
 * window never connected — both look like silence, and silence sent me looking
 * in the wrong place twice. The heartbeat keeps saying it, so a page that
 * connects late, or drops, is visible from outside rather than guessed at.
 */
cloud.log([{ line: `worker up on port ${bridge.port}` }]).catch(() => {});

/*
 * Look for written work every few seconds while there is a row expecting some.
 *
 * Without this the board only ever picked work up during a pass, which is once
 * every nine to fifteen minutes — so his Take on a reply Claude had already
 * written did nothing at all, silently, until the next one came round.
 */
setInterval(() => {
  if (!page || !known.size) return;
  const waiting = [...known.keys()].some((id) => !onTheBoard.has(id));
  if (!waiting) return;
  drain()
    .then(() => {
      let fresh = 0;
      for (const id of known.keys()) {
        if (onTheBoard.has(id)) continue;
        const work = written.get(id);
        if (!work) continue;
        written.delete(id);
        if (present(id, work)) fresh += 1;
      }
      if (fresh) show({ resting: `${fresh} written — open me and press Take` });
    })
    .catch(() => {});
}, DRAIN_MS);

/*
 * Xcoder — the look changing while he watches, with nothing to download.
 *
 * He asked for this twice and was explicit that it must not need his approval
 * each time: "without with without I have to approve. It must be auto-approved."
 * So the worker asks the cloud what the look should be and forwards it to the
 * window. The window applies it on the next frame.
 *
 * Only a HIGHER build is applied. A push that is not newer than what is
 * already on is ignored, which means a slow or repeated read can never undo a
 * change, and a rollback is a higher build carrying the old numbers rather
 * than a special case.
 */
let uiBuild = 0;
setInterval(() => {
  if (!bridge) return;
  cloud.ui()
    .then((face) => {
      if (!face || typeof face !== "object") return;
      const build = Number(face.build ?? 0);
      if (!(build > uiBuild)) return;
      uiBuild = build;
      const style = face.style && typeof face.style === "object" ? face.style : null;
      if (!style) return;
      bridge.window("style", style);
      cloud.log([{ line: `look ${build}: ${face.why ?? "no reason given"}` }]).catch(() => {});
    })
    .catch(() => {});
}, 4000);

setInterval(() => {
  cloud.status({
    ...state,
    board: undefined,
    jobs: state.board.length,
    // The one fact that separates the two silences.
    pageConnected: bridge.connected(),
    at: Date.now(),
  }).catch(() => {});
}, 20_000);


// Round again on a scattered timer. A pass that starts at exactly :00 every
// hour is its own signature, whoever is pressing the buttons.
setInterval(
  () => { if (page) pass().catch(() => {}); },
  /* Twenty seconds. There is no slow gap between passes any more: what holds
     the account is the per-pass cap and the refresh rules, which are Depop's
     arithmetic — not a performance of somebody having a think. */
  20_000,
);

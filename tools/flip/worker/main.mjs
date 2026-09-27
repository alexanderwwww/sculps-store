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
import { join } from "node:path";
import { startBridge } from "./bridge.mjs";
import { shortlist } from "./work.mjs";
import { connectCloud } from "./cloud.mjs";
import { readKnowledge } from "./knowledge.mjs";
import { SELLER, working, replyAfterMs, takeBudget, betweenActionsMs, typeReply } from "./pace.mjs";

/* The inbox, because an unanswered buyer is the only row that costs ranking
   by the hour. The shop floor is read from there in the same pass. */
const BOARD = "https://www.depop.com/messages/";
const SHOP = "https://www.depop.com/";
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
/** Set by the panel's "Work anyway", cleared by the pass it buys. */
let override = false;

function show(patch) {
  Object.assign(state, patch);
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

async function drain() {
  const got = await cloud.work().catch(() => null);
  const items = got?.items ?? {};
  for (const [id, work] of Object.entries(items)) written.set(id, work);
  return Object.keys(items).length;
}

/** Wait until Claude has written this one. Gives up after twenty minutes. */
async function waitForWork(id, waitMs = 20 * 60_000) {
  const until = Date.now() + waitMs;
  while (Date.now() < until) {
    if (written.has(id)) return written.get(id);
    await drain();
    if (written.has(id)) return written.get(id);
    await sleep(DRAIN_MS);
  }
  return null;
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

/** Type one thing he has just taken. Runs outside the pass, on its own. */
async function takeIt(id) {
  const held = onTheBoard.get(id);
  if (!held || !page) return;
  const { row, work, words, verdict } = held;
  onTheBoard.delete(id);

  // Reading time first: a reply that lands eleven seconds after a long message
  // is the tell, and this whole app is built on not being one.
  const wait = replyAfterMs({
    words: String(row.line ?? "").split(/\s+/).length,
    firstContact: !row.buyer,
    urgent: verdict.urgent === true,
  });
  show({ doing: `holding ${Math.round(wait / 1000)}s, then typing` });
  await sleep(Math.min(wait, 90_000));

  show({ doing: `typing ${work.kind === "listing" ? "the listing" : "to " + (row.buyer ?? "the buyer")}` });
  const typed = await page.ask("type", { into: "composer", strokes: typeReply(words) }).catch(() => null);

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
  const who = await page.ask("read", { what: "status" }).catch(() => null);
  if (!who || who.signedIn !== true) {
    show({
      working: false,
      doing: null,
      resting: "not signed in — open me, then Paste login or make a password",
      board: [],
    });
    return;
  }
  show({ who: who.who ?? null });

  if (!working(new Date(), SELLER) && !override) {
    show({
      working: false,
      doing: null,
      resting: "resting — open me and press Work anyway to go now",
      board: [],
    });
    return;
  }
  override = false;
  show({ working: true, resting: null });

  show({ doing: "reading the inbox" });
  const inbox = (await page.ask("read", { what: "listings" })) ?? [];

  /* Then the shop floor. Two reads, because they are two screens, and a pass
     that only ever saw the inbox would never refresh or offer anything. */
  await sleep(betweenActionsMs());
  show({ doing: "looking at the shop" });
  await page.ask("goto", { url: SHOP });
  await sleep(betweenActionsMs());
  const floor = (await page.ask("read", { what: "listings" })) ?? [];

  const { take, considered } = shortlist([...inbox, ...floor], { history });

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
  await drain();
  let waitingOnHim = 0;
  for (const { row, verdict } of take) {
    if (verdict.act === "refresh") continue;
    const work = written.get(row.id);
    if (!work) continue;
    written.delete(row.id);
    const words = work.kind === "listing"
      ? [work.title, work.description, (work.hashtags || []).join(" ")].filter(Boolean).join("\n\n")
      : work.reply;
    onTheBoard.set(row.id, { row, work, words, verdict });
    patch(row.id, { reply: words, ready: work.ready, questions: work.questions, why: work.why || verdict.why });
    waitingOnHim += 1;
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
      page = bridge;
      show({});
      pass().catch((error) => {
        cloud.log([{ line: `pass failed: ${error.message}` }]).catch(() => {});
      });
    }
    if (message.t === "now") {
      override = true;
      pass().catch(() => {});
    }
    /* Out of band, both. A tap never waits for a pass, a pass never waits
       for a tap. */
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
  9 * 60_000 + Math.round(Math.random() * 6 * 60_000),
);

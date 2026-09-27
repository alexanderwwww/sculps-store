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
 * Sending is a tap. Every reply, every delivery. Fiverr bans automated order
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
/** What he tapped, per job. Nothing moves without an entry in here. */
const tapped = new Map();

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

/** Wait for a tap. No timeout — an unanswered job simply stays on the board. */
function waitForTap(id) {
  return new Promise((resolve) => {
    const check = setInterval(() => {
      const answer = tapped.get(id);
      if (!answer) return;
      clearInterval(check);
      tapped.delete(id);
      resolve(answer);
    }, 400);
  });
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
  /* The board is opened before the clock is consulted.
     Two reasons, both learned the hard way. He cannot sign in to Fiverr if
     the window never leaves the starting screen — and a window that sits on
     "waking the crew…" all evening looks broken when it is only resting. */
  show({ doing: "opening the board" });
  await page.ask("goto", { url: BOARD });
  await sleep(betweenActionsMs());

  if (!working(new Date(), SELLER) && !override) {
    show({
      working: false,
      doing: null,
      resting: "Off the clock — back inside seller hours. Work anyway if you want it running now.",
      board: [],
    });
    return;
  }
  /* An override is for the pass he asked for, not for every pass after it. */
  override = false;
  show({ working: true, resting: null });

  show({ doing: "reading the inbox" });
  const inbox = (await page.ask("read", { what: "listings" })) ?? [];

  /* Then the shop floor. Two reads rather than one because they live on two
     screens, and a pass that only ever sees the inbox would never refresh or
     offer anything. */
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
        ? "Nothing due — everything answered, refreshed or too soon to touch."
        : "Nothing on the shop floor yet.",
      board: [],
    });
    return;
  }

  /* The board fills before a single word is written, so the glass shows the
     shop at once rather than after several minutes of thinking. */
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
    // The buyer's own words go out, so Claude writes against what was said
    // rather than against a title.
    line: row.line ?? null,
    waitingMinutes: row.waitingMinutes ?? null,
    satMinutes: row.listedMinutesAgo ?? null,
    reply: null,
    ready: null,
  }));
  show({ doing: `${take.length} to do`, board });
  await cloud.board(board).catch(() => {});

  for (const { row, verdict } of take) {
    const id = row.id;

    if (state.takenToday >= state.takeBudget) {
      show({ doing: null, resting: `Enough for today — ${state.takenToday} done.` });
      return;
    }

    /* A refresh needs nobody's words. It is one tap on a listing he already
       wrote, inside the window, on something people liked — so it does not
       wait on Claude and it does not wait on him. */
    if (verdict.act === "refresh") {
      show({ doing: `refreshing ${row.title ?? "a listing"}` });
      const done = await page.ask("tap", { url: row.url, what: "refresh" });
      if (done && done.ok !== false && done.found !== false) {
        history[id] = { ...(history[id] || {}), refreshedAt: Date.now() };
        patch(id, { why: verdict.why + " — refreshed" });
      } else {
        patch(id, { why: "could not find the refresh control" });
      }
      await sleep(betweenActionsMs());
      continue;
    }

    show({ doing: `waiting on Claude: ${row.title ?? row.buyer ?? "a row"}` });
    const work = await waitForWork(id);
    if (!work) {
      patch(id, { reply: "Claude has not written this one yet.", ready: false });
      continue;
    }
    /* What is shown is what will be typed, whichever kind it is. */
    const words = work.kind === "listing"
      ? [work.title, work.description, (work.hashtags || []).join(" ")].filter(Boolean).join("\n\n")
      : work.reply;
    patch(id, { reply: words, ready: work.ready, questions: work.questions, why: work.why || verdict.why });

    const go = await waitForTap(id);
    if (go !== "take") {
      patch(id, { reply: null, why: "skipped" });
      continue;
    }

    // Reading time is charged before anything is typed, because a reply that
    // lands eleven seconds after a long message is the tell.
    const wait = replyAfterMs({
      words: String(row.line ?? "").split(/\s+/).length,
      firstContact: !row.buyer,
      urgent: verdict.urgent === true,
    });
    show({ doing: `holding ${Math.round(wait / 1000)}s, then typing` });
    await sleep(Math.min(wait, 90_000));

    show({ doing: `typing ${work.kind === "listing" ? "the listing" : "to " + (row.buyer ?? "the buyer")}` });
    const typed = await page.ask("type", { into: "composer", strokes: typeReply(words) });

    /* The count and the message both depend on what the page actually says.
       Claiming work that does not exist is the worst failure this app has. */
    if (!typed || typed.ok === false || typed.found === false) {
      patch(id, {
        reply: words,
        why: "could not find the box — open it on screen and it will try again",
      });
      continue;
    }

    state.takenToday += 1;
    if (verdict.act === "offer") history[id] = { ...(history[id] || {}), offeredAt: Date.now() };
    if (verdict.act === "reply") history[id] = { ...(history[id] || {}), repliedAt: Date.now() };
    patch(id, { reply: words + "\n\n— typed, ready for you to send" });
    show({ takenToday: state.takenToday });
    await sleep(betweenActionsMs());
  }

  show({ doing: null });
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
    if (message.t === "take") tapped.set(message.id, "take");
    if (message.t === "skip") tapped.set(message.id, "skip");
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

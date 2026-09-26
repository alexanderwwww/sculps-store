/**
 * Clone Me — the loop.
 *
 * Read the board, think, write, show. Round and round, at a person's pace,
 * inside the seller's own hours, in the seller's own signed-in window.
 *
 * "Think" is a live call to Claude on every job. Nothing here is a template
 * and nothing is cached: the deliverable and the reply are written fresh
 * against that buyer's actual words. That is the whole reason this is worth
 * running rather than a macro.
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
import { startBridge } from "./bridge.mjs";
import { shortlist } from "./work.mjs";
import { doJob } from "./brain.mjs";
import { SELLER, working, replyAfterMs, takeBudget, betweenActionsMs, typeReply } from "./pace.mjs";

const BOARD = "https://www.fiverr.com/seller_dashboard";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const state = {
  build: 1,
  working: false,
  resting: null,
  doing: null,
  takenToday: 0,
  takeBudget: takeBudget(Number(process.env.CLONE_DAYS_SELLING) || 0),
  board: [],
};

let page = null;
/** What he tapped, per job. Nothing moves without an entry in here. */
const tapped = new Map();

function show(patch) {
  Object.assign(state, patch);
  page?.do("panel", { set: state }).catch(() => {});
}

function patch(id, fields) {
  show({ board: state.board.map((j) => (j.id === id ? { ...j, ...fields } : j)) });
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

async function pass() {
  if (!working(new Date(), SELLER)) {
    show({ working: false, doing: null, resting: "Off the clock — back inside seller hours.", board: [] });
    return;
  }
  show({ working: true, resting: null, doing: "opening the board" });

  await page.do("goto", { url: BOARD });
  await sleep(betweenActionsMs());

  show({ doing: "reading what is waiting" });
  const rows = await page.do("read", { what: "listings" });
  const { take } = shortlist(rows ?? []);

  if (!take.length) {
    show({ doing: null, resting: "Nothing on the board it can do.", board: [] });
    return;
  }

  // The board is shown before a single deliverable is written, so the screen
  // fills at once rather than after several minutes of thinking.
  show({
    doing: `${take.length} worth looking at`,
    board: take.map(({ job, verdict }, i) => ({
      id: job.url || `row-${i}`,
      title: job.title,
      buyer: job.buyer,
      pays: job.priceCents,
      why: verdict.why,
      label: verdict.label,
      wand: verdict.wand === true,
      reply: null,
      ready: null,
    })),
  });

  for (let i = 0; i < take.length; i++) {
    const { job, verdict } = take[i];
    const id = job.url || `row-${i}`;

    if (state.takenToday >= state.takeBudget) {
      show({ doing: null, resting: `Done for today — ${state.takenToday} taken.` });
      return;
    }

    // Picture work is never written here. It is handed over with the prompt
    // left to Claude and the wand — his rule, and the right one.
    if (verdict.wand) {
      patch(id, { reply: "Picture work — the prompt goes to Claude, the wand draws it.", ready: false });
      continue;
    }

    show({ doing: `writing: ${job.title ?? "a job"}` });
    let work;
    try {
      work = await doJob({ job, verdict });
    } catch (error) {
      patch(id, { reply: `Could not write this one: ${error.message}`, ready: false });
      continue;
    }

    if (work.refused) {
      patch(id, { reply: `Declined — ${work.refused}. It should not have been shortlisted.`, ready: false });
      continue;
    }

    patch(id, { reply: work.reply, ready: work.ready, questions: work.questions });

    const go = await waitForTap(id);
    if (go !== "take") {
      patch(id, { reply: null, why: "skipped" });
      continue;
    }

    // Reading time is charged before anything is typed, because a reply that
    // lands eleven seconds after a six-hundred-word brief is the tell.
    const words = String(job.brief ?? job.line ?? "").split(/\s+/).length;
    const wait = replyAfterMs({ words, firstContact: !job.buyer, urgent: job.late === true });
    show({ doing: `holding ${Math.round(wait / 1000)}s, then typing` });
    await sleep(Math.min(wait, 90_000));

    show({ doing: `typing to ${job.buyer ?? "the buyer"}` });
    await page.do("type", { keys: typeReply(work.reply) });

    state.takenToday += 1;
    patch(id, { reply: work.reply + "\n\n— typed, ready for you to send" });
    show({ takenToday: state.takenToday });
    await sleep(betweenActionsMs());
  }

  show({ doing: null });
}

const bridge = await startBridge({
  dir: new URL(".", import.meta.url).pathname,
  onMessage(message, api) {
    if (message.t === "hello") {
      page = api;
      show({});
      pass().catch(() => {});
    }
    if (message.t === "take") tapped.set(message.id, "take");
    if (message.t === "skip") tapped.set(message.id, "skip");
  },
});

console.log(`PORT ${bridge.port}`);

// Round again on a scattered timer. A pass that starts at exactly :00 every
// hour is its own signature, whoever is pressing the buttons.
setInterval(
  () => { if (page) pass().catch(() => {}); },
  9 * 60_000 + Math.round(Math.random() * 6 * 60_000),
);

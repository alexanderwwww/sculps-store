/**
 * What the shop does next, and what it leaves alone.
 *
 * The rules here come from the playbook, not from taste, and they are the part
 * that keeps the account alive. Depop enforces against behaviour rather than
 * tooling: shops die from rhythm, not from software. So every rule below is a
 * ceiling as much as an instruction.
 *
 * Nothing in this file talks to a page or to the network. It takes rows and
 * returns decisions, which is why it can be tested, and is.
 */

/** Reply inside four hours or the shop is ranked down. This is the one that pays. */
export const REPLY_WITHIN_MINUTES = 240;

/** A listing may be refreshed once a day, and not one time more. */
export const REFRESH_EVERY_MINUTES = 24 * 60;

/** The two windows the playbook names, in local hours. */
export const REFRESH_HOURS = [12.5, 19.5];

/** Only the most-liked end of the shop gets refreshed. Refreshing dead stock
 *  reads as artificial activity and is penalised — this is the line. */
export const REFRESH_TOP_N = 20;

/** An offer goes to people who liked something that has sat this long. */
export const OFFER_AFTER_MINUTES = 14 * 24 * 60;

/** And no more often than this on the same stagnant listing. */
export const OFFER_EVERY_MINUTES = 3.5 * 24 * 60;

/** The discount band the playbook gives. Below the floor it is not an offer,
 *  it is a markdown; above the ceiling it is a mistake. */
export const OFFER_MIN = 0.10;
export const OFFER_MAX = 0.15;

/** New listings a day. The playbook says 1–2, and more looks like a feed. */
export const LIST_PER_DAY = 2;

/** How many things it will touch in one pass, of any kind. A pass that acts on
 *  forty rows is the bot rhythm the bans are for. */
export const ACTIONS_PER_PASS = 6;

/**
 * Nothing that is sold, nothing that is already answered, nothing without an
 * id. Dropped here rather than on his screen.
 */
function usable(row) {
  return !!row && !!row.id && row.sold !== true;
}

/** The hour as a fraction, so 12:30 is 12.5. */
function hourNow(now = new Date()) {
  return now.getHours() + now.getMinutes() / 60;
}

/** Inside one of the refresh windows, give or take half an hour either side. */
export function inRefreshWindow(now = new Date()) {
  const h = hourNow(now);
  return REFRESH_HOURS.some((w) => Math.abs(h - w) <= 0.5);
}

/**
 * What one row deserves, and why.
 *
 * `why` is written to be read on his phone, in his language, because a board
 * that says "score 0.82" is a board nobody can argue with.
 */
export function decide(row, { now = new Date(), history = {} } = {}) {
  if (!usable(row)) return { act: "skip", why: "nothing to act on" };
  const seen = history[row.id] || {};

  if (row.kind === "message") {
    // An unanswered buyer outranks everything else on the floor. It is ranked
    // by Depop and it is the only row where waiting costs money directly.
    const waited = Number.isFinite(row.waitingMinutes) ? row.waitingMinutes : null;
    if (seen.repliedAt && waited !== null && waited > 0 && seen.repliedAt > Date.now() - waited * 60_000) {
      return { act: "skip", why: "already answered" };
    }
    const late = waited !== null && waited > REPLY_WITHIN_MINUTES;
    return {
      act: "reply",
      urgent: late,
      why: late
        ? `waiting ${Math.round(waited / 60)}h — past the four hours Depop ranks on`
        : "a buyer is waiting",
    };
  }

  if (row.kind === "draft") {
    return { act: "list", why: "not listed yet" };
  }

  if (row.kind === "listing") {
    const likes = Number.isFinite(row.likes) ? row.likes : 0;
    const sat = Number.isFinite(row.listedMinutesAgo) ? row.listedMinutesAgo : null;

    // An offer beats a refresh: it reaches people who already said they want
    // it, and a price drop notifies them for free.
    if (likes > 0 && sat !== null && sat >= OFFER_AFTER_MINUTES) {
      const since = seen.offeredAt ? (Date.now() - seen.offeredAt) / 60_000 : Infinity;
      if (since >= OFFER_EVERY_MINUTES) {
        return { act: "offer", why: `${likes} likes and sitting ${Math.round(sat / 1440)} days` };
      }
      return { act: "skip", why: "offered recently" };
    }

    const since = seen.refreshedAt ? (Date.now() - seen.refreshedAt) / 60_000 : Infinity;
    if (since < REFRESH_EVERY_MINUTES) return { act: "skip", why: "refreshed today" };
    if (!inRefreshWindow(now)) return { act: "skip", why: "outside the 12:30 and 19:30 windows" };
    if (likes <= 0) return { act: "skip", why: "no likes — refreshing this is what gets shops flagged" };
    return { act: "refresh", why: `${likes} likes` };
  }

  return { act: "skip", why: "unknown row" };
}

/**
 * The pass, in order: buyers first, then the offers, then the refreshes, then
 * anything waiting to be listed. Capped, because the cap is the safety.
 */
export function shortlist(rows, options = {}) {
  const decided = (Array.isArray(rows) ? rows : [])
    .map((row) => ({ row, verdict: decide(row, options) }))
    .filter((d) => d.verdict.act !== "skip");

  const rank = { reply: 0, offer: 1, refresh: 2, list: 3 };
  decided.sort((a, b) => {
    const byAct = (rank[a.verdict.act] ?? 9) - (rank[b.verdict.act] ?? 9);
    if (byAct) return byAct;
    if (a.verdict.urgent !== b.verdict.urgent) return a.verdict.urgent ? -1 : 1;
    return (b.row.likes || 0) - (a.row.likes || 0);
  });

  // Only the top of the shop is ever refreshed, whatever else is in the list.
  let refreshed = 0;
  const take = [];
  for (const item of decided) {
    if (item.verdict.act === "refresh") {
      if (refreshed >= REFRESH_TOP_N) continue;
      refreshed += 1;
    }
    take.push(item);
    if (take.length >= (options.perPass || ACTIONS_PER_PASS)) break;
  }
  return { take, considered: decided.length };
}

/**
 * What to offer on a listing that has sat.
 *
 * Ten to fifteen per cent, leaning to the top of the band the longer it has
 * been there and the more people liked it — and never below a floor he sets,
 * because a shop that discounts into the ground is a shop with no margin.
 */
export function offerFor({ priceCents, likes = 0, satMinutes = 0, floorCents = 0 } = {}) {
  if (!Number.isFinite(priceCents) || priceCents <= 0) return null;
  const weeks = Math.max(0, satMinutes / (7 * 24 * 60) - 2);
  const pull = Math.min(1, weeks / 4 + Math.min(likes, 20) / 40);
  const cut = OFFER_MIN + (OFFER_MAX - OFFER_MIN) * pull;
  const offered = Math.round(priceCents * (1 - cut));
  if (floorCents && offered < floorCents) return floorCents >= priceCents ? null : floorCents;
  return offered;
}

/** The shop's rules, which are mostly ceilings. */
import { strict as assert } from "node:assert";
import {
  decide, shortlist, offerFor, inRefreshWindow,
  OFFER_AFTER_MINUTES, REFRESH_TOP_N,
} from "../worker/work.mjs";

const noon = new Date(2026, 8, 27, 12, 30);
const threeAM = new Date(2026, 8, 27, 3, 0);

// A buyer waiting outranks everything, and past four hours it says so.
assert.equal(decide({ id: "a", kind: "message", waitingMinutes: 30 }).act, "reply");
const late = decide({ id: "a", kind: "message", waitingMinutes: 600 });
assert.equal(late.urgent, true);
assert.match(late.why, /four hours/);

// Refreshing something nobody liked is the thing that gets shops flagged.
assert.equal(
  decide({ id: "b", kind: "listing", likes: 0, listedMinutesAgo: 100 }, { now: noon }).act,
  "skip");

// And only inside the windows.
assert.equal(
  decide({ id: "c", kind: "listing", likes: 9, listedMinutesAgo: 100 }, { now: threeAM }).act,
  "skip");
assert.equal(
  decide({ id: "c", kind: "listing", likes: 9, listedMinutesAgo: 100 }, { now: noon }).act,
  "refresh");
assert.equal(inRefreshWindow(noon), true);
assert.equal(inRefreshWindow(threeAM), false);

// Sat two weeks with likes: an offer, not a refresh.
assert.equal(
  decide({ id: "d", kind: "listing", likes: 4, listedMinutesAgo: OFFER_AFTER_MINUTES + 10 }, { now: noon }).act,
  "offer");
// But not twice in the same few days.
assert.equal(
  decide({ id: "d", kind: "listing", likes: 4, listedMinutesAgo: OFFER_AFTER_MINUTES + 10 },
    { now: noon, history: { d: { offeredAt: Date.now() - 60_000 } } }).act,
  "skip");

// Sold items and rows with no id never reach his screen.
assert.equal(decide({ id: "e", kind: "listing", sold: true }).act, "skip");
assert.equal(decide({ kind: "listing", likes: 5 }).act, "skip");

// The pass is capped and buyers come first.
const rows = [];
for (let i = 0; i < 40; i++) rows.push({ id: "L" + i, kind: "listing", likes: 5, listedMinutesAgo: 100 });
rows.push({ id: "M1", kind: "message", waitingMinutes: 500 });
const { take } = shortlist(rows, { now: noon });
assert.equal(take.length, 6);
assert.equal(take[0].row.id, "M1");
assert.ok(take.every((t) => t.verdict.act !== "skip"));

// The refresh cap holds even when the whole shop qualifies.
const many = shortlist(rows, { now: noon, perPass: 100 });
assert.ok(many.take.filter((t) => t.verdict.act === "refresh").length <= REFRESH_TOP_N);

// Offers sit in the band, lean deeper the longer it sat, and respect a floor.
const fresh = offerFor({ priceCents: 10000, likes: 0, satMinutes: OFFER_AFTER_MINUTES });
assert.equal(fresh, 9000);
const stale = offerFor({ priceCents: 10000, likes: 20, satMinutes: OFFER_AFTER_MINUTES * 4 });
assert.ok(stale <= 9000 && stale >= 8500, `band: ${stale}`);
assert.equal(offerFor({ priceCents: 10000, likes: 20, satMinutes: 10 ** 7, floorCents: 9500 }), 9500);
assert.equal(offerFor({ priceCents: 0 }), null);

console.log("work rules: ok");

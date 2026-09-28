/**
 * The three decisions plug makes on its own, driven directly.
 *
 * No browser and no marketplace: these are pure judgements and they are the
 * part that can be proved completely. Each one comes from something he said or
 * something that already went wrong on a real account.
 */
import { targetForDay, cycle, dayOfCycle, plan, CYCLE_DAYS } from "../worker/schedule.mjs";
import { routeFor, huntBand, DEPOP_CEILING } from "../worker/route.mjs";
import { makeItem, listed, sold, canList, listedOn } from "../worker/stock.mjs";

let bad = 0;
const check = (ok, what, extra) => {
  console.log(ok ? "  ok  " + what : "FAIL  " + what + (extra ? " — " + extra : ""));
  if (!ok) bad++;
};

/* ---- the golden ratio, his number ---- */
check(cycle().join(",") === "1,2,3,4,7,11,18",
  "the week is 1 → 2 → 3 → 4 → 7 → 11 → 18", cycle().join(","));
check(targetForDay(8) === 1, "day eight starts from one again");
check(targetForDay(14) === 18 && targetForDay(15) === 1,
  "it never reaches 521 — the cycle resets instead");
const started = new Date("2026-09-28T09:00:00Z");
check(dayOfCycle(started, new Date("2026-09-28T23:00:00Z")) === 1, "the first day is day one");
check(dayOfCycle(started, new Date("2026-10-05T08:00:00Z")) === 1, "a week later is day one again");
check(dayOfCycle(started, new Date("2026-10-02T08:00:00Z")) === 5, "the fifth day is five");

/* Stock and the marketplace both cap it, and neither is allowed to be a lie. */
const short = plan({ day: 7, done: 0, ready: 4 });
check(short.left === 4 && /ready stock/.test(short.held || ""),
  "it never lists more than he actually has", JSON.stringify(short));
const capped = plan({ day: 7, done: 0, ready: 100, allowed: 6 });
check(capped.left === 6 && /marketplace/.test(capped.held || ""),
  "the marketplace's own limit wins over the target");
check(plan({ day: 3, done: 5 }).left === 0,
  "being ahead does not make tomorrow smaller, and does not go negative");
/* And the flood he specifically ruled out. */
check(plan({ day: 4, done: 0 }).left === 4,
  "a quiet day is not caught up by a burst the next one");

/* ---- which marketplace, and why ---- */
const cold = { depopReviews: 0 };
check(routeFor({ priceCents: 25_000 }, cold).sites.join() === "depop",
  "a €250 piece goes to Depop — that is its buyer, and it earns a review");
const watch = routeFor({ priceCents: 1_680_000 }, cold);
check(watch.sites[0] === "vestiaire" && !watch.sites.includes("depop"),
  "a €16,800 watch does not sit on Depop with no reviews", watch.sites.join());
check(/authentication/.test(watch.why), "and it says why in a line he can follow", watch.why);
const warm = routeFor({ priceCents: 85_000 }, { depopReviews: 22 });
check(warm.sites.includes("depop") && warm.sites.includes("vestiaire"),
  "with twenty reviews the high ticket is credible on both");
const mid = routeFor({ priceCents: 45_000 }, cold);
check(mid.sites.join() === "vestiaire",
  "the middle band waits for reviews before it touches Depop", mid.sites.join());
check(routeFor({ priceCents: 0 }, cold).sites.length === 0,
  "nothing is listed at a price we cannot defend");

const band = huntBand(cold);
check(band.maxCents === DEPOP_CEILING && /review/.test(band.why),
  "while the account is cold, the hunt points at what earns reviews", band.why);
check(huntBand({ depopReviews: 30 }).maxCents === Infinity,
  "once it is warm, the hunt has no ceiling but his stock");

/* ---- one item, two marketplaces, sold once ---- */
let birkin = makeItem({ id: "birkin-30", title: "Hermès Birkin 30", priceCents: 1_420_000, photos: ["a.jpg"] });
birkin = listed(birkin, "vestiaire", "v-1", 1000);
birkin = listed(birkin, "depop", "d-1", 1000);

const gone = sold(birkin, "vestiaire", 2000);
check(gone.takedowns.length === 1 && gone.takedowns[0].site === "depop",
  "when it sells on one site the other listing comes down");
check(gone.item.listings.depop.state === "pulled" && gone.item.soldOn === "vestiaire",
  "and the record says where it went");
check(canList(gone.item, "depop").ok === false,
  "a later pass cannot put a sold item back up",
  JSON.stringify(canList(gone.item, "depop")));

/* The case that costs him real money, reported rather than swallowed. */
const twice = sold(gone.item, "depop", 3000);
check(/double sale/.test(twice.trouble || ""),
  "a double sale is said out loud, with what to do", twice.trouble);

check(canList(makeItem({ id: "x", title: "x", priceCents: 100 }), "depop").ok === false,
  "nothing is listed blind — no photos, no listing");

/* The count is of items he owns, never of listings posted. */
const today = new Date();
let one = makeItem({ id: "ring", title: "CH ring", priceCents: 30_000, photos: ["p.jpg"] });
one = listed(one, "depop", "d-2", today.getTime());
one = listed(one, "vestiaire", "v-2", today.getTime());
check(listedOn([one], today) === 1,
  "an item cross-listed on both counts once, not twice");

if (bad) { console.log(`logic: ${bad} failed`); process.exit(1); }
console.log("logic: ok");

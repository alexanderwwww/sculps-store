/*
 * Unit tests: number/date parsing, buying signals, the Q4 arithmetic, goals.md,
 * query building, Trends measures, store parsing and the report's "thin" flag.
 *
 *   node test/unit.test.mjs
 */
import { count, startedOn, daysSince, price, tagFor, queriesFrom } from "../src/parse.mjs";
import { kindOf, find, tally } from "../src/signals.mjs";
import { daysTo, calendar, lastOrderDay, stillQ4 } from "../src/q4.mjs";
import { parseGoals } from "../src/cloud.mjs";
import { parseMultiline, measures } from "../src/sites/trends.mjs";
import { productsFrom, freeShippingIn, pickDomains } from "../src/sites/stores.mjs";
import { unwrap } from "../src/sites/adlibrary.mjs";
import { buildReport } from "../src/report.mjs";

let failed = 0, passed = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) passed++; else failed++;
  console.log(`${ok ? "  ok" : "FAIL"}  ${name}${ok ? "" : `  -> got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};

// numbers
eq("1.2M", count("1.2M"), 1200000);
eq("12.3K", count("12.3K views"), 12300);
eq("4,512", count("4,512"), 4512);
eq("980", count("980"), 980);
eq("1,2M european", count("1,2M"), 1200000);
eq("unreadable is null", count("views"), null);
eq("null is null", count(null), null);
// dates
eq("US date", startedOn("Started running on Oct 3, 2026"), "2026-10-03");
eq("EU date", startedOn("Started running on 3 Oct 2026"), "2026-10-03");
eq("long month", startedOn("Started running on September 14, 2026"), "2026-09-14");
eq("no date", startedOn("Started running recently"), null);
const NOW = Date.parse("2026-10-17T15:00:00Z");
eq("days since", daysSince("2026-10-03", NOW), 14);
eq("future date is null", daysSince("2026-11-03", NOW), null);
eq("price", price("$24.99"), 24.99);
eq("price 0 is null", price("0.00"), null);
eq("tag", tagFor("Heatless Curlers!"), "heatlesscurlers");
eq("queries", queriesFrom("find me halloween projectors that are selling", [], 6), ["halloween projectors selling", "halloween projectors", "projectors selling", "halloween", "projectors", "selling"]);

// signals
eq("where", kindOf("Where can I buy this??"), "where");
eq("link", kindOf("link?"), "where");
eq("price", kindOf("how much"), "price");
eq("bought", kindOf("just ordered mine!"), "bought");
eq("want", kindOf("I need this"), "want");
eq("gift", kindOf("getting this for my sister for christmas"), "gift");
eq("noise", kindOf("lol so cute"), null);
eq("emoji only", kindOf("😍😍"), null);
eq("find + tally", tally(find(["where to buy", "how much?", "nice", "take my money"])), { where: 1, price: 1, bought: 0, want: 1, gift: 0 });

// Q4 (today 17 Oct 2026)
eq("days to Halloween", daysTo("2026-10-31", "2026-10-17"), 14);
eq("days to Christmas", daysTo("2026-12-25", "2026-10-17"), 69);
const cal = calendar(NOW);
eq("calendar today", cal.today, "2026-10-17");
eq("calendar BFCM days", cal.daysTo.bfcm, 41);
eq("calendar CNY days", cal.daysTo.cny2027, 112);
eq("ad costs normal in October", cal.adCosts, "normal");
eq("ad costs high in December", calendar(Date.parse("2026-12-02T00:00:00Z")).adCosts.startsWith("high"), true);
eq("last order day for Christmas, 3+12 days + 7 launch + 14 selling", lastOrderDay("christmas", 3, 12), "2026-11-19");
eq("no lead times -> null, never a guess", lastOrderDay("christmas", null, 12), null);
eq("Halloween too late from China", stillQ4("halloween", 3, 12, NOW), false);
eq("Christmas still possible", stillQ4("christmas", 3, 12, NOW), true);

// goals.md
eq("goals", parseGoals("budget: $500\ndaily_target: 10\nniches: beauty, gifts\nnever: weapons, vapes\ncurrency: USD\nnoise line"),
  { budget: 500, daily_target: 10, niches: ["beauty", "gifts"], never: ["weapons", "vapes"], currency: "USD" });
eq("goals missing = null", parseGoals(""), { budget: null, daily_target: null, niches: null, never: null, currency: null });

// trends
const tl = parseMultiline(")]}',\n" + JSON.stringify({ default: { timelineData: [{ time: "1700000000", value: [12] }] } }));
eq("multiline parsed", tl, [{ t: "2023-11-14", v: 12 }]);
eq("too few weeks", measures([{ t: "2026-01-01", v: 3 }]).growth4w, null);
const w = Array.from({ length: 8 }, (_, i) => ({ t: `2026-0${1 + (i % 8)}-01`, v: i < 4 ? 20 : 30 }));
eq("growth4w", measures(w).growth4w, 50);

// stores
eq("free shipping", freeShippingIn("FREE SHIPPING ON ORDERS OVER $35 | shop"), 35);
eq("free shipping above", freeShippingIn("Free shipping above $49.99"), 49.99);
eq("no free shipping", freeShippingIn("Shipping calculated at checkout"), null);
eq("products", productsFrom({ products: [{ title: "Set", handle: "set", variants: [{ title: "A", price: "19.00", compare_at_price: "29.00" }, { title: "Buy 2", price: "34.00" }] }] }, "https://s.com"),
  [{ title: "Set", price: 19, compareAt: 29, url: "https://s.com/products/set", offer: true }]);
eq("domains skip marketplaces", pickDomains(["https://www.amazon.com/x", "https://shop.example.com/p", "https://www.temu.com", "https://shop.example.com/q", "https://glow.co/"]), ["shop.example.com", "glow.co"]);
eq("unwrap l.php", unwrap("https://l.facebook.com/l.php?u=https%3A%2F%2Fglow.co%2Fp&h=x"), "https://glow.co/p");

// report
const rep = buildReport({ hunt: { id: "h", looking: "x" }, evidence: [{ source: "adlibrary", query: "x", ads: [], blocked: "empty" }], build: "1", startedAt: NOW, endedAt: NOW });
eq("thin query flagged", rep.perQuery[0].thin, true);
eq("thin says so", rep.perQuery[0].verdictHints.includes("Not enough seen yet for this query."), true);
eq("best stays null", rep.best, null);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

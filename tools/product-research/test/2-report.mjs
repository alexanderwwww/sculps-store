/** The hunt's arithmetic: what gets ranked first, and what gets called thin. */
import { buildReport, scoreCandidate, groupByQuery, verdict } from "../worker/report.mjs";
import { check, failures } from "./lib.mjs";

const ad = (q, who, days) => ({ kind: "ad", query: q, who, metrics: { days }, title: `${who} ad` });
const seller = (q, who, longestDays) => ({ kind: "seller", query: q, who, metrics: { longestDays } });
const clip = (q, views, platform = "tiktok") => ({ kind: "clip", query: q, platform, metrics: { views } });

const findings = [
  // A proven one: four advertisers past a month, and it travels organically.
  seller("halloween projector", "SpookyCo", 120), seller("halloween projector", "GhostLab", 64),
  seller("halloween projector", "HauntCo", 41), seller("halloween projector", "NightFX", 33),
  ad("halloween projector", "SpookyCo", 120), ad("halloween projector", "GhostLab", 64),
  clip("halloween projector", 2_400_000), clip("halloween projector", 800_000),
  clip("halloween projector", 310_000), clip("halloween projector", 120_000), clip("halloween projector", 44_000),
  // Viral, but nobody is paying to run it for long. Should not beat the above.
  clip("glow slime", 9_000_000), clip("glow slime", 5_000_000), clip("glow slime", 1_000_000),
  clip("glow slime", 900_000), clip("glow slime", 120_000),
  seller("glow slime", "SlimeGuy", 4), ad("glow slime", "SlimeGuy", 4),
  // Barely seen at all.
  clip("fog machine", 3000), ad("fog machine", "Nobody", 2),
];

const r = buildReport({ looking: "halloween decor to sell in October", findings });

check("it groups what was seen into candidates", groupByQuery(findings).length === 3);
check("the report keeps the words that were asked", r.looking === "halloween decor to sell in October");
check("money spent over a month beats views", r.best?.query === "halloween projector", r.best?.query ?? "none");
check("it counts the proven advertisers", r.best.provenSellers === 4, String(r.best.provenSellers));
check("it carries the longest run", r.best.longestRunDays === 120, String(r.best.longestRunDays));
check("the verdict is made of its own numbers", /4 advertisers/.test(r.best.verdict) && /2,400,000 views/.test(r.best.verdict), r.best.verdict);
check("something barely seen is called thin", r.candidates.find((c) => c.query === "fog machine").thin === true);
check("thin says so instead of guessing", /Not enough seen yet/.test(r.candidates.find((c) => c.query === "fog machine").verdict));
check("a viral thing nobody pays for still ranks", r.candidates.some((c) => c.query === "glow slime"));
check("it is honest that nobody proved that one", /nobody has proved it for a month/.test(r.candidates.find((c) => c.query === "glow slime").verdict));
check("the best one is never a thin one", r.best.thin === false);

const nothing = buildReport({ looking: "x", findings: [clip("x", 10)] });
check("nothing solid says nothing solid", nothing.nothingSolid === true && nothing.best === null);

const c = scoreCandidate({ query: "q", sellers: [], ads: [], clips: [] });
check("an empty candidate scores zero, not NaN", c.score === 0 && Number.isFinite(c.score));
check("a score cannot run away", scoreCandidate({ query: "q", sellers: Array.from({ length: 50 }, (_, i) => seller("q", `s${i}`, 900)), ads: [], clips: Array.from({ length: 200 }, () => clip("q", 90_000_000)) }).score <= 100);
check("verdict never returns nothing", typeof verdict(c) === "string" && verdict(c).length > 10);

/* --------------------------- his number, not ours --------------------------- */

const { targetMath } = await import("../worker/report.mjs");

const paid = buildReport({
  looking: "halloween decor", findings, targetPerDay: 1000, window: "6 weeks to Halloween",
  prices: { "halloween projector": 49 },
});
check("the target he gave is kept", paid.targetPerDay === 1000 && paid.window === "6 weeks to Halloween");
check("orders a day come from his target and the market's price", paid.best.math.ordersPerDay === 21, JSON.stringify(paid.best.math));
const big = buildReport({ looking: "x", findings, targetPerDay: 10000, prices: { "halloween projector": 49 } });
check("ten a day is a different number, not the same one", big.best.math.ordersPerDay === 205, String(big.best.math.ordersPerDay));
check("nothing is assumed when no target was given", buildReport({ looking: "x", findings }).best.math.known === false);
check("no invented price", targetMath({ query: "q" }, { targetPerDay: 1000 }).known === false);
check("it says WHY it cannot do the math", /no price was read/.test(targetMath({ query: "q" }, { targetPerDay: 1000 }).why));
const m = targetMath({ query: "q" }, { targetPerDay: 1000, price: 49, cost: 19 });
check("ad room is half the gross margin", m.adRoomPerOrder === 15, String(m.adRoomPerOrder));
check("the note reads like a person wrote it", /orders a day at 49/.test(m.note), m.note);

console.log(failures() ? `\n${failures()} FAILED` : "\nall passed");
process.exit(failures() ? 1 : 0);

// THE ECOM BRAIN — encodes real DTC/marketing judgment into a scoring + validation
// engine. Turns raw TikTok signals into a hustler's verdict: X Score, risk, a
// validation checklist, and ad angles. (Claude later adds the visual "eye" on top.)

const SATURATED = /(phone ?case|charger|cable|ring ?light|airpods?|screen protector|popsocket)/i;
const GATED = /(supplement|vitamin|cbd|vape|nicotine|weight ?loss|diet|slim|detox|teeth ?whiten|weapon|knife|gun)/i; // ad-policy landmines
const WOW = /(gadget|tool|massage|beauty|skincare|home|kitchen|pet|car|cleaning|led|portable|mini)/i; // demoable, scroll-stopping

const chk = (pass, label, note) => ({ pass: !!pass, label, note });

export function assess(p) {
  const views = p.engagement?.views || 0;
  const velocity = p.velocity || Math.round(views / 7);
  const price = p.retailPrice || 0;
  const cost = p.cost ?? (price ? +(price * 0.30).toFixed(2) : 0);     // ~30% landed cost if unknown
  const margin = price ? Math.round(((price - cost) / price) * 100) : 0;
  const hay = `${p.title || ""} ${p.category || ""}`;

  // --- X Score (0-100): demand + margin + price-fit + wow - saturation ---
  const demand = Math.min(42, Math.log10(Math.max(velocity, 1)) * 9);   // viral velocity is king
  const marginScore = Math.min(24, margin / 4);                          // 96%+ -> full
  const priceFit = price >= 20 && price <= 60 ? 18 : price > 0 ? 9 : 4;  // impulse-buy sweet spot
  const wow = WOW.test(hay) ? 11 : 5;                                     // can it be demoed in 3s?
  const satPenalty = SATURATED.test(hay) ? -14 : 0;
  const xScore = Math.max(1, Math.min(99, Math.round(demand + marginScore + priceFit + wow + satPenalty + 5)));

  // --- risk rating ---
  let risk = "Low"; const reasons = [];
  if (GATED.test(hay)) { risk = "High"; reasons.push("ad-policy restricted category (Meta/TikTok will flag)"); }
  if (SATURATED.test(hay)) { risk = risk === "High" ? "High" : "Medium"; reasons.push("saturated — everyone sells it"); }
  if (margin < 40) { risk = risk === "High" ? "High" : "Medium"; reasons.push(`thin margin (${margin}%)`); }
  if (price > 0 && price < 15) reasons.push("low AOV — needs a bundle to be profitable on paid");
  if (!reasons.length) reasons.push("clean: healthy margin, ad-safe, not red-ocean");

  // --- validation checklist (the ecom framework) ---
  const validation = [
    chk(velocity > 50000, "Demand — viral velocity", velocity > 50000 ? "strong" : "weak views/day"),
    chk(margin >= 50, "Margin — ≥50%", `${margin}%`),
    chk(price >= 20 && price <= 60, "Price — $20–60 impulse zone", price ? `$${price}` : "unknown"),
    chk(!SATURATED.test(hay), "Saturation — not red-ocean", SATURATED.test(hay) ? "crowded" : "ok"),
    chk(!GATED.test(hay), "Compliance — ad-safe category", GATED.test(hay) ? "restricted" : "ok"),
    chk(WOW.test(hay), "Wow-factor — demoable in 3s", WOW.test(hay) ? "scroll-stopper" : "hard to show"),
  ];

  // --- ad angles (marketing) ---
  const angles = [
    `"TikTok made me buy it" UGC — first 3s IS the wow, no slow intro`,
    `Problem → solution: show the pain, then ${p.title || "it"} solving it on camera`,
    `Satisfying demo + price anchor${price ? ` ("only $${price}")` : ""} + "link in bio"`,
  ];

  const verdict = xScore >= 80 ? "chase" : xScore >= 60 ? "watch" : "skip";
  return { ...p, cost, margin, xScore, risk, riskReasons: reasons, validation, angles, verdict };
}

export function rank(list) {
  return list.map(assess).sort((a, b) => b.xScore - a.xScore).map((p, i) => ({ ...p, rank: i + 1 }));
}

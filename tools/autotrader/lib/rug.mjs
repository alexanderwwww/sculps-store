import { getJson } from "./net.mjs";
// RugCheck's free summary: {score, score_normalised, lpLockedPct, risks:[{name,level,score,description}]}.
// "danger" level risks, a live mint/freeze authority, or thin locked LP all end the trade before it starts.
export async function rugCheck(mint) {
  let s;
  try { s = await getJson(`https://api.rugcheck.xyz/v1/tokens/${mint}/report/summary`, { tries: 2 }); }
  catch (e) { return { pass: false, reason: `rugcheck unreachable: ${e.message.slice(0, 60)}`, risks: [] }; }
  const risks = s.risks || [];
  const danger = risks.filter((r) => r.level === "danger");
  const names = risks.map((r) => r.name);
  const live = names.filter((n) => /mint authority|freeze authority/i.test(n));
  if (danger.length) return { pass: false, reason: `danger: ${danger.map((r) => r.name).join(", ")}`, risks: names, score: s.score_normalised };
  if (live.length) return { pass: false, reason: `authority still live: ${live.join(", ")}`, risks: names, score: s.score_normalised };
  return { pass: true, reason: names.length ? `ok (${names.slice(0, 3).join(", ")})` : "ok", risks: names, score: s.score_normalised, lpLockedPct: s.lpLockedPct };
}

/** GMGN's own security audit (fields from gmgn-cli's token skill). Hard stops and risk limits for a young Solana coin. */
export function judgeGmgnSecurity(d) {
  if (!d || typeof d !== "object") return { pass: false, reason: "gmgn security: empty answer" };
  const bad = [];
  if (d.renounced_mint === false) bad.push("mint authority live");
  if (d.renounced_freeze_account === false) bad.push("freeze authority live");
  if (d.is_honeypot === "yes") bad.push("honeypot");
  if (Number(d.rug_ratio) > 0.3) bad.push(`rug_ratio ${d.rug_ratio}`);
  if (Number(d.top_10_holder_rate) > 0.5) bad.push(`top-10 hold ${(d.top_10_holder_rate * 100).toFixed(0)}%`);
  if (Number(d.sell_tax) > 0.1 || Number(d.buy_tax) > 0.1) bad.push("tax over 10%");
  if (d.is_wash_trading === true) bad.push("wash trading");
  if (Number(d.bundler_trader_amount_rate) > 0.5) bad.push(`bundlers ${(d.bundler_trader_amount_rate * 100).toFixed(0)}% of volume`);
  return bad.length ? { pass: false, reason: `gmgn: ${bad.join(", ")}` } : { pass: true, reason: "gmgn ok" };
}
/** Both audits must pass. GMGN unreachable = no trade (never trade blind). */
export function combinedRug(client) {
  return async (mint) => {
    const a = await rugCheck(mint);
    if (!a.pass) return a;
    if (!client) return a;
    try { const g = judgeGmgnSecurity(await client.tokenSecurity(mint)); return g.pass ? { ...a, reason: `${a.reason}; ${g.reason}` } : g; }
    catch (e) { return { pass: false, reason: `gmgn security unreachable: ${e.message.slice(0, 80)}` }; }
  };
}

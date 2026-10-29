import { getJson } from "./net.mjs";
// RugCheck's free summary: {score, score_normalised, lpLockedPct, risks:[{name,level,score,description}]}.
// "danger" level risks, a live mint/freeze authority, or thin locked LP all end the trade before it starts.
export async function rugCheck(mint) {
  let s;
  try { s = await getJson(`https://api.rugcheck.xyz/v1/tokens/${mint}/report/summary`, { tries: 2 }); }
  catch (e) { return { pass: false, reason: `rugcheck unreachable (${e.message.replace(/^https?:\S+: /, "").slice(0, 40)})`, risks: [] }; }
  const risks = s.risks || [];
  const danger = risks.filter((r) => r.level === "danger");
  const names = risks.map((r) => r.name);
  const live = names.filter((n) => /mint authority|freeze authority/i.test(n));
  if (danger.length) return { pass: false, reason: `danger: ${danger.map((r) => r.name).join(", ")}`, risks: names, score: s.score_normalised };
  if (live.length) return { pass: false, reason: `authority still live: ${live.join(", ")}`, risks: names, score: s.score_normalised };
  return { pass: true, reason: names.length ? `ok (${names.slice(0, 3).join(", ")})` : "ok", risks: names, score: s.score_normalised, lpLockedPct: s.lpLockedPct };
}

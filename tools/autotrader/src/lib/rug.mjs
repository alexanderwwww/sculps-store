import { getJson } from "./net.mjs";
// RugCheck's free summary: {score, score_normalised, lpLockedPct, risks:[{name,level,score,description}]}.
// "danger" level risks, a live mint/freeze authority, or thin locked LP all end the trade before it starts.
export const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
/** On-chain hard stops: a token we could buy but not sell at full value. Returns a reason, or null when clean. Only ever adds rejections. */
export function mintTraps(m) {
  if (m.freezeAuthority) return "freeze authority is live on-chain";
  if (m.program !== TOKEN_2022) return null;
  for (const e of m.extensions || []) {
    const n = e.extension, st = e.state || {};
    if (n === "transferFeeConfig" && (Number(st.newerTransferFee?.transferFeeBasisPoints) > 0 || Number(st.olderTransferFee?.transferFeeBasisPoints) > 0)) return `transfer fee ${Math.max(Number(st.newerTransferFee?.transferFeeBasisPoints) || 0, Number(st.olderTransferFee?.transferFeeBasisPoints) || 0) / 100}%`;
    if (n === "permanentDelegate" && st.delegate) return "permanent delegate (can take tokens from any wallet)";
    if (n === "transferHook" && st.programId) return "transfer hook (a program can block the sell)";
    if (n === "nonTransferable") return "non-transferable token";
    if (n === "defaultAccountState" && /frozen/i.test(String(st.accountState))) return "new accounts start frozen";
    if (/pausable/i.test(String(n))) return "pausable token";
  }
  return null;
}
export async function rugCheck(mint, { rpc = null } = {}) {
  if (rpc?.mintInfo) {
    let m; try { m = await rpc.mintInfo(mint); } catch (e) { return { pass: false, reason: `mint unreadable on-chain (${String(e.message).slice(0, 40)})`, risks: [] }; }   // fail closed
    const trap = mintTraps(m); if (trap) return { pass: false, reason: `trap: ${trap}`, risks: [] };
  }
  let s, m0 = null;
  if (rpc?.mintInfo) { try { m0 = await rpc.mintInfo(mint); } catch { m0 = null; } }
  try { s = await getJson(`https://api.rugcheck.xyz/v1/tokens/${mint}/report/summary`, { tries: 2 }); }
  catch (e) {
    // build 92 (2026-11-07): RugCheck was unreachable from Alex's Mac for every coin, so Ultra bought nothing for an hour.
    // When it is down, the on-chain facts decide: no mint authority, no freeze authority, no Token-2022 trap -> pass, flagged.
    if (m0 && !m0.mintAuthority && !m0.freezeAuthority && !mintTraps(m0)) return { pass: true, reason: "rugcheck down: on-chain clean (mint and freeze off)", risks: [], onchainOnly: true };
    return { pass: false, reason: `rugcheck unreachable (${e.message.replace(/^https?:\S+: /, "").slice(0, 40)})`, risks: [] };
  }
  const risks = s.risks || [];
  const danger = risks.filter((r) => r.level === "danger");
  const names = risks.map((r) => r.name);
  const live = names.filter((n) => /mint authority|freeze authority/i.test(n));
  if (danger.length) return { pass: false, reason: `danger: ${danger.map((r) => r.name).join(", ")}`, risks: names, score: s.score_normalised };
  if (live.length) return { pass: false, reason: `authority still live: ${live.join(", ")}`, risks: names, score: s.score_normalised };
  // lesson 16 (리핀 -100%): warnings that predict a rug are hard stops too, and a pool whose LP is not locked or burned is skipped
  const bad = risks.filter((r) => /top 10 holders|single holder|low liquidity|lp unlocked|creator.*(rug|history)|holder correlation|copycat|high ownership|low amount of lp/i.test(r.name));
  if (bad.length) return { pass: false, reason: `warning: ${bad.map((r) => r.name).join(", ")}`, risks: names, score: s.score_normalised };
  if (s.lpLockedPct != null && s.lpLockedPct > 0 && s.lpLockedPct < 80) return { pass: false, reason: `only ${Math.round(s.lpLockedPct)}% of the liquidity is locked`, risks: names, score: s.score_normalised };
  if ((s.score_normalised ?? 0) > 60) return { pass: false, reason: `rugcheck risk score ${s.score_normalised}`, risks: names, score: s.score_normalised };
  return { pass: true, reason: names.length ? `ok (${names.slice(0, 3).join(", ")})` : "ok", risks: names, score: s.score_normalised, lpLockedPct: s.lpLockedPct };
}

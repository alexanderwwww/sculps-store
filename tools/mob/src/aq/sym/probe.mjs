// SYMBIOTE stream probe (admin only): opens ONE subscription for N seconds (default 60) and reports what it would cost to
// run all day. Sources:
//   helius   logsSubscribe {mentions:[pump program]} on wss://mainnet.helius-rpc.com (HELIUS_API_KEY)
//   public   the same subscription on the free public node wss://api.mainnet-beta.solana.com
//   program  programSubscribe on the pump program, bonding-curve accounts only (memcmp on the account discriminator), Helius
// Helius bills LaserStream WebSocket standard methods 2 credits per 0.1 MB of uncompressed data, on all plans
// (helius.dev/docs/billing/credits, read 2026-11-18). Plans (helius.dev/docs/billing/plans): Free 1M, Developer 10M,
// Business 100M, Professional 200M credits a month. The probe itself costs about 20 credits per MB it receives.
import { eventsFromLogs, decodeCurve, b58, PUMP_PROGRAM } from "./decode.mjs";

export const PLANS = { free: 1e6, developer: 10e6, business: 100e6, professional: 200e6 };
export const CREDITS_PER_MB = 20;
const CURVE_DISC_B58 = b58(new Uint8Array([23, 183, 248, 55, 96, 216, 172, 96]));

export async function openWs(url) {
  const r = await fetch(url.replace(/^wss:/, "https:"), { headers: { Upgrade: "websocket" } });
  const ws = r.webSocket;
  if (!ws) throw new Error(`websocket refused: HTTP ${r.status}`);
  ws.accept();
  return ws;
}
export const wsText = (data) => (typeof data === "string" ? data : new TextDecoder().decode(data));
export const logsSub = (id = 1) => JSON.stringify({ jsonrpc: "2.0", id, method: "logsSubscribe", params: [{ mentions: [PUMP_PROGRAM] }, { commitment: "confirmed" }] });
export const programSub = (id = 1) => JSON.stringify({ jsonrpc: "2.0", id, method: "programSubscribe", params: [PUMP_PROGRAM, { encoding: "base64", commitment: "confirmed", filters: [{ memcmp: { offset: 0, bytes: CURVE_DISC_B58 } }] }] });
export const heliusWss = (k) => `wss://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(k)}`;
export const PUBLIC_WSS = "wss://api.mainnet-beta.solana.com";

// counts a stream of raw messages; pure so the test can drive it
export function tally(kind) {
  const t = { kind, msgs: 0, bytes: 0, notes: 0, failed: 0, buys: 0, sells: 0, creates: 0, completes: 0, other: 0, curves: 0, errors: [], subscribed: false };
  t.add = (raw) => {
    t.msgs++; t.bytes += raw.length;
    let j; try { j = JSON.parse(raw); } catch { t.other++; return; }
    if (j.error) { if (t.errors.length < 3) t.errors.push(j.error.message || String(j.error)); return; }
    if (j.result !== undefined && j.id) { t.subscribed = true; return; }
    const v = j.params?.result?.value; if (!v) { t.other++; return; }
    t.notes++;
    if (kind === "program") { if (decodeCurve(v.account?.data?.[0] || "")) t.curves++; else t.other++; return; }
    const e = eventsFromLogs(v, j.params.result.context?.slot);
    if (e.failed) { t.failed++; return; }
    for (const x of e.trades) x.buy ? t.buys++ : t.sells++;
    t.creates += e.creates.length; t.completes += e.completes.length;
  };
  return t;
}
export function report(t, secs) {
  const mbDay = t.bytes / secs * 86400 / 1e6, credDay = t.kind === "public" ? 0 : mbDay * CREDITS_PER_MB;
  const fits = Object.fromEntries(Object.entries(PLANS).map(([p, c]) => [p, t.kind === "public" ? "free node, no credits" : `${Math.round(credDay * 30 / c * 100)}% of the monthly credits`]));
  return { source: t.kind, seconds: secs, subscribed: t.subscribed, errors: t.errors, notifications: t.notes, perSec: +(t.notes / secs).toFixed(1), failedTx: t.failed,
    buys: t.buys, sells: t.sells, creates: t.creates, completes: t.completes, curveUpdates: t.curves, mb: +(t.bytes / 1e6).toFixed(2), mbPerDay: Math.round(mbDay),
    creditsPerDay: Math.round(credDay), creditsThisProbe: Math.round(t.bytes / 1e6 * (t.kind === "public" ? 0 : CREDITS_PER_MB)), planUse: fits };
}

export async function probe(env, { secs = 60, sources = ["helius"] } = {}) {
  secs = Math.max(5, Math.min(90, Number(secs) || 60));
  const runs = sources.map(async (src) => {
    const t = tally(src);
    let url;
    if (src === "public") url = PUBLIC_WSS;
    else if (!env.HELIUS_API_KEY) return { source: src, error: "HELIUS_API_KEY is not set on this Worker" };
    else url = heliusWss(env.HELIUS_API_KEY);
    let ws;
    try { ws = await openWs(url); } catch (e) { return { source: src, error: String(e.message || e) }; }
    ws.addEventListener("message", (m) => t.add(wsText(m.data)));
    ws.send(src === "program" ? programSub() : logsSub());
    await new Promise((r) => setTimeout(r, secs * 1000));
    try { ws.close(1000, "probe done"); } catch {}
    return report(t, secs);
  });
  return { at: new Date().toISOString(), program: PUMP_PROGRAM, results: await Promise.all(runs) };
}

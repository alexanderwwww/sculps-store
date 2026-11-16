// Which free data sources answer from the deployed Worker. Fixed URLs only.
import { SOL_MINT } from "./feeds.mjs";
const WIF = "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm"; // dogwifhat: a long-lived liquid Solana token, used only as a probe subject
export async function diag(env) {
  const now = Date.now();
  const list = [
    ["jupiter charts", `https://datapi.jup.ag/v2/charts/${WIF}?interval=1_MINUTE&to=${now}&candles=120&type=price&quote=usd`],
    ["jupiter txs", `https://datapi.jup.ag/v1/txs/${WIF}?limit=50`],
    ["jupiter toptrending", "https://datapi.jup.ag/v1/pools/toptrending/1h?limit=50"],
    ["jupiter toptraded", "https://datapi.jup.ag/v1/pools/toptraded/1h?limit=50"],
    ["jupiter price", `https://lite-api.jup.ag/price/v3?ids=${SOL_MINT}`],
    ["binance SOL ticker (last-resort SOL price)", "https://data-api.binance.vision/api/v3/ticker/price?symbol=SOLUSDT"],
    ["jupiter wallet pnl", "https://datapi.jup.ag/v1/pnl?addresses=CoJatHdT3goMJKCLS3h28LrGeUm6rqzk17HHcKKonZuF"],
    ["kolscan leaderboard", "https://kolscan.io/leaderboard"],
    ["dexscreener boosts", "https://api.dexscreener.com/token-boosts/latest/v1"],
    ["geckoterminal trending", "https://api.geckoterminal.com/api/v2/networks/solana/trending_pools?page=1"],
    ["rugcheck", `https://api.rugcheck.xyz/v1/tokens/${WIF}/report/summary`],
  ];
  const out = [];
  for (const [name, url] of list) {
    const t0 = Date.now();
    try {
      const r = await fetch(url, { headers: { accept: "application/json", "user-agent": "aquarius-paper/1" } });
      const body = await r.text();
      out.push({ name, status: r.status, bytes: body.length, ms: Date.now() - t0, head: body.replace(/\s+/g, " ").slice(0, 100) });
    } catch (e) { out.push({ name, error: String(e.message || e).slice(0, 120), ms: Date.now() - t0 }); }
  }
  if (env.HELIUS_API_KEY) {
    const t0 = Date.now();
    try {
      const r = await fetch(`https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(env.HELIUS_API_KEY)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [WIF, { limit: 3 }] }) });
      const body = await r.text();
      out.push({ name: "helius rpc getSignaturesForAddress", status: r.status, bytes: body.length, ms: Date.now() - t0, head: body.replace(/\s+/g, " ").slice(0, 100) });
    } catch (e) { out.push({ name: "helius rpc", error: String(e.message || e).slice(0, 120) }); }
  } else out.push({ name: "helius rpc", error: "HELIUS_API_KEY is not set on this Worker" });
  return { at: new Date().toISOString(), probes: out };
}

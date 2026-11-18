// SYMBIOTE deep health checks: run only on coins that exploded on paper (a few an hour), then judged by rules.judgeHealth.
// Reads only: Solana RPC (Helius when HELIUS_API_KEY is set, else the public node), RugCheck's summary, the coin's metadata JSON,
// and Grok's VETO rows. No key material, no signing, no transaction building: nothing here can send anything.
// Shapes read 2026-11-18: getTokenLargestAccounts value[{address, amount, uiAmount}] (Helius docs; the public node answers 429),
// getAccountInfo jsonParsed mint info {mintAuthority, freezeAuthority, supply} (live), RugCheck /report/summary {score, risks[]}
// (live), metadata at gateway.pinata.cloud/ipfs/<cid> {twitter, website, telegram?} (live; ipfs.io no longer serves JSON).
import { judgeHealth, createEngine } from "./rules.mjs";
import { eventsFromLogs } from "./decode.mjs";

export const PUBLIC_RPC = "https://api.mainnet-beta.solana.com";
const heliusUrl = (k) => `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(k)}`;
export const isVeto = (text, mint) => new RegExp(`^[\\s>*_\`#~-]*VETO[\\s*_\`:~-]+${mint}(?![1-9A-HJ-NP-Za-km-z])`, "i").test(String(text || ""));

export function rpcFor(env) {
  const url = env.HELIUS_API_KEY ? heliusUrl(env.HELIUS_API_KEY) : PUBLIC_RPC;
  return async (method, params) => {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    const j = await r.json().catch(() => null);
    if (!j || j.error) throw new Error(`${method}: ${j?.error?.message || r.status}`);
    return j.result;
  };
}
const cidOf = (uri) => { const m = String(uri || "").match(/\/ipfs\/([A-Za-z0-9]+)/); return m ? m[1] : null; };
const safe = async (f) => { try { return await f(); } catch (e) { return { error: String(e.message || e) }; } };

export async function vetoed(d, mint) {
  const rows = await d.q(`SELECT text FROM mob_aq_chat WHERE from_name = 'grok' AND at > now() - interval '1 hour' AND strpos(text, $1) > 0
    UNION ALL SELECT text FROM mob_aq_helpers WHERE from_helper = 'grok' AND at > now() - interval '1 hour' AND strpos(text, $1) > 0`, [mint]).catch(() => []);
  return rows.some((r) => isVeto(r.text, mint));
}

// When the live source carried no wallets (the "curve" source), the buyer-side facts come from a sample of the coin's own
// transactions: its 20 oldest (the first blocks: snipers, bundles, the dev) and 100 newest, decoded with the same IDL decoder.
// Unique buyers from a sample are a lower bound, so the check can only be stricter than the truth.
export async function sampleStream(rpc, mint, base = {}) {
  const sigs = ((await rpc("getSignaturesForAddress", [mint, { limit: 1000 }])) || []).filter((x) => !x.err);
  const pick = [...new Set([...sigs.slice(-20), ...sigs.slice(0, 100)].map((x) => x.signature))];
  const txs = [];
  for (let i = 0; i < pick.length; i += 10) txs.push(...(await Promise.all(pick.slice(i, i + 10).map((sg) => rpc("getTransaction", [sg, { encoding: "json", maxSupportedTransactionVersion: 1 }]).catch(() => null)))));
  const e = createEngine(); const ok = txs.filter(Boolean).sort((a, b) => a.slot - b.slot);
  let created = false;
  for (const t of ok) {
    const ev = eventsFromLogs({ signature: null, err: t.meta?.err ?? null, logs: t.meta?.logMessages || [] }, t.slot);
    for (const c of ev.creates) if (c.mint === mint) { e.onCreate({ ...c, src: "chain" }); created = true; }
    if (!created) { e.onCreate({ mint, creator: base.creator, curve: base.curve, slot: t.slot, src: "chain" }); created = true; }
    for (const x of ev.trades) if (x.mint === mint) e.onTrade(x, (t.blockTime || 0) * 1000);
  }
  const h = e.streamHealth(mint) || {};
  return { ...base, ...h, curve: base.curve || h.curve, uri: base.uri || h.uri, creator: base.creator || h.creator, sampledTx: ok.length, totalTx: sigs.length };
}

// stream: rules.streamHealth(mint). Returns {checks, verdict}.
export async function deepCheck(env, d, mint, stream, rpc = rpcFor(env)) {
  if (!stream.uniqueBuyers) { const smp = await safe(() => sampleStream(rpc, mint, stream)); if (!smp.error) stream = smp; }
  const checks = { ...stream };
  const holders = await safe(async () => {
    const big = (await rpc("getTokenLargestAccounts", [mint]))?.value || [];
    const acc = big.length ? (await rpc("getMultipleAccounts", [big.map((b) => b.address), { encoding: "jsonParsed" }]))?.value || [] : [];
    const rows = big.map((b, i) => ({ owner: acc[i]?.data?.parsed?.info?.owner ?? null, amount: Number(b.amount) }));
    const supply = 1e15, ex = new Set([stream.curve].filter(Boolean));
    const top = rows.filter((r) => r.owner && !ex.has(r.owner)).slice(0, 10);
    return { top10Share: top.reduce((a, r) => a + r.amount, 0) / supply, top: top.map((r) => r.owner), curveFound: rows.some((r) => ex.has(r.owner)) };
  });
  if (!holders.error) { checks.top10Share = holders.top10Share; checks.topHolders = holders.top; } else checks.holdersError = holders.error;
  const mi = await safe(async () => (await rpc("getAccountInfo", [mint, { encoding: "jsonParsed" }]))?.value?.data?.parsed?.info);
  if (mi && !mi.error) { checks.mintAuthority = mi.mintAuthority ?? null; checks.freezeAuthority = mi.freezeAuthority ?? null; } else checks.authError = mi?.error || "no account";
  // funders: the earliest of each early wallet's last 25 transactions, the SOL transfer that reached it (a cheap proxy for "who funded it")
  const wallets = [...new Set([...(stream.earlyBuyers || []), ...(stream.firstBuyers || [])])].filter((w) => w && w !== stream.creator).slice(0, 8);
  const fund = await safe(async () => {
    const by = new Map();
    for (const w of wallets) {
      const sigs = await rpc("getSignaturesForAddress", [w, { limit: 25 }]);
      const old = sigs?.[sigs.length - 1]?.signature; if (!old) continue;
      const tx = await rpc("getTransaction", [old, { encoding: "jsonParsed", maxSupportedTransactionVersion: 1 }]);
      const ins = [...(tx?.transaction?.message?.instructions || []), ...((tx?.meta?.innerInstructions || []).flatMap((x) => x.instructions || []))];
      const t = ins.find((i) => i?.program === "system" && i?.parsed?.type === "transfer" && i.parsed.info?.destination === w);
      if (t) { const s = t.parsed.info.source; by.set(s, (by.get(s) || 0) + 1); }
    }
    return { sameFunderMax: by.size ? Math.max(...by.values()) : 0, checked: wallets.length };
  });
  if (!fund.error) { checks.sameFunderMax = fund.sameFunderMax; checks.fundersChecked = fund.checked; } else checks.fundError = fund.error;
  const rug = await safe(async () => { const r = await fetch(`https://api.rugcheck.xyz/v1/tokens/${mint}/report/summary`); if (!r.ok) throw new Error("rugcheck " + r.status); return r.json(); });
  if (!rug.error) { const risks = Array.isArray(rug.risks) ? rug.risks : []; checks.rugScore = rug.score ?? null; checks.rugRisks = risks.map((x) => `${x.name} (${x.level})`); checks.rugDanger = risks.some((x) => x.level === "danger"); } else checks.rugError = rug.error;
  const cid = cidOf(stream.uri);
  const meta = cid ? await safe(async () => { const r = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`); if (!r.ok) throw new Error("metadata " + r.status); return r.json(); }) : { error: "no metadata uri" };
  if (!meta.error) { const s = ["twitter", "telegram", "website"].filter((k) => typeof meta[k] === "string" && /^https?:\/\//.test(meta[k])); checks.socials = s.length; checks.socialLinks = s.map((k) => meta[k]); } else checks.metaError = meta.error;
  checks.vetoed = d ? await vetoed(d, mint) : false;
  return { checks, verdict: judgeHealth(checks) };
}

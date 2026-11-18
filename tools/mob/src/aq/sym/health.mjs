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
  // a 429 (production 2026-11-18: most "unknown" answers were Helius 429s) is retried 3 times, 1.5 s, 3 s and 4.5 s apart
  return async (method, params) => {
    for (let k = 0; ; k++) {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      const j = await r.json().catch(() => null);
      const limited = r.status === 429 || j?.error?.code === 429 || /429|rate/i.test(String(j?.error?.message || ""));
      if (limited && k < 3) { await new Promise((z) => setTimeout(z, 1500 * (k + 1))); continue; }
      if (!j || j.error) throw new Error(`${method}: ${j?.error?.message || r.status}`);
      return j.result;
    }
  };
}
const cidOf = (uri) => { const m = String(uri || "").match(/\/ipfs\/([A-Za-z0-9]+)/); return m ? m[1] : null; };
// a plain GET that retries a 429 three times (the IPFS gateway answered 429 for 83 of 106 calls on 2026-11-18)
async function getJsonRetry(url) { for (let k = 0; ; k++) { const r = await fetch(url, { headers: { accept: "application/json" } }); if (r.status === 429 && k < 3) { await new Promise((z) => setTimeout(z, 1500 * (k + 1))); continue; } if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`); return r.json(); } }
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
  // the launch facts recorded at launch win; the sample never claims them (its oldest 20 are not the launch when there are 1000+)
  const keep = base.launchComplete ? { launchComplete: true, earlyBuyers: base.earlyBuyers, sniperWallets: base.sniperWallets, sniperShare: base.sniperShare, devShare: Math.max(base.devShare || 0, h.devShare || 0), devSold: !!(base.devSold || h.devSold), createSlot: base.createSlot } : { launchComplete: false };
  return { ...base, ...h, ...keep, curve: base.curve || h.curve, uri: base.uri || h.uri, creator: base.creator || h.creator, sampledTx: ok.length, totalTx: sigs.length };
}

// LAUNCH FACTS (curve source): the curve's signatures, oldest first. Complete only when the page reaches the create itself
// (fewer than 1000 signatures and the oldest carries this coin's CreateEvent); then the dev and every buyer in the create slot
// and the next 2 slots are read (up to 25 transactions). Incomplete = the coin can never be a right call (fail closed).
export async function launchFacts(rpc, mint, curve) {
  const sigs = ((await rpc("getSignaturesForAddress", [curve, { limit: 1000 }])) || []);
  if (!sigs.length || sigs.length >= 1000) return { complete: false, why: sigs.length ? "over 1000 transactions: the launch is out of reach" : "no transactions", calls: 1 };
  const oldest = sigs[sigs.length - 1], first = await rpc("getTransaction", [oldest.signature, { encoding: "json", maxSupportedTransactionVersion: 1 }]);
  const ev0 = eventsFromLogs({ signature: oldest.signature, err: first?.meta?.err ?? null, logs: first?.meta?.logMessages || [] }, first?.slot ?? oldest.slot);
  const cr = ev0.creates.find((c) => c.mint === mint); if (!cr) return { complete: false, why: "the oldest transaction is not this coin's create", calls: 2 };
  const slot = first?.slot ?? oldest.slot, creator = cr.creator, early = new Map(); let devTok = 0, devBuy = 0, devSold = false, calls = 2;
  const take = (ev) => { for (const t of ev.trades) if (t.mint === mint) { if (t.user === creator) { if (t.buy) { devTok += t.tokens; devBuy += t.sol; } else { devTok -= t.tokens; devSold = true; } } else if (t.buy && t.slot - slot <= 2) early.set(t.user, (early.get(t.user) || 0) + t.tokens); } };
  take(ev0);
  const near = sigs.filter((x) => x.slot <= slot + 2 && x.signature !== oldest.signature && !x.err).slice(-25);
  for (const x of near) { const tx = await rpc("getTransaction", [x.signature, { encoding: "json", maxSupportedTransactionVersion: 1 }]).catch(() => null); calls++; if (tx) take(eventsFromLogs({ signature: x.signature, err: tx.meta?.err ?? null, logs: tx.meta?.logMessages || [] }, tx.slot)); }
  return { complete: true, createSlot: slot, creator, early: [...early], devTok, devBuy, devSold, calls };
}

// stream: rules.streamHealth(mint). Returns {checks, verdict}.
export async function deepCheck(env, d, mint, stream, rpc0 = rpcFor(env)) {
  let calls = 0; const rpc = (m, p) => { calls++; return rpc0(m, p); };
  // the sample runs whenever the stream did not carry a wallet on (nearly) every trade. Production 2026-11-18: in curve mode the
  // only wallet ever seen was the dev's own buy inside the create transaction, which made 36 real movers read "unique buyers: 1"
  let sampleError = null;
  if (!stream.walletsSeen) { const smp = await safe(() => sampleStream(rpc, mint, stream)); if (!smp.error) stream = smp; else sampleError = smp.error; }
  const checks = { ...stream }; if (sampleError) checks.sampleError = sampleError;
  // the mint first: authorities and the real supply (the denominator of every share)
  const mi = await safe(async () => (await rpc("getAccountInfo", [mint, { encoding: "jsonParsed" }]))?.value?.data?.parsed?.info);
  if (mi && !mi.error) { checks.mintAuthority = mi.mintAuthority ?? null; checks.freezeAuthority = mi.freezeAuthority ?? null; checks.supply = Number(mi.supply) || null; } else checks.authError = mi?.error || "no account";
  // top-10 holders: the largest token accounts, their owners, and each owner's own account. An owner that is not a plain
  // wallet (its account belongs to a program: the bonding curve, a pool, a vault, Mayhem's) is excluded, then the share is of
  // the real supply (production 2026-11-18: shares of 1.00-1.09 came from counting the curve's vault)
  const holders = await safe(async () => {
    const big = (await rpc("getTokenLargestAccounts", [mint]))?.value || [];
    const acc = big.length ? (await rpc("getMultipleAccounts", [big.map((b) => b.address), { encoding: "jsonParsed" }]))?.value || [] : [];
    const rows = big.map((b, i) => ({ owner: acc[i]?.data?.parsed?.info?.owner ?? null, amount: Number(b.amount) }));
    const owners = [...new Set(rows.map((r) => r.owner).filter(Boolean))];
    const oa = owners.length ? (await rpc("getMultipleAccounts", [owners, { encoding: "base64", dataSlice: { offset: 0, length: 0 } }]))?.value || [] : [];
    const SYS = "11111111111111111111111111111111", wallet = new Map(owners.map((o, i) => [o, !oa[i] || oa[i].owner === SYS]));
    const supply = checks.supply || 1e15, ex = new Set([stream.curve].filter(Boolean));
    const keep = (r) => r.owner && !ex.has(r.owner) && wallet.get(r.owner), top = rows.filter(keep).slice(0, 10);
    return { top10Share: top.reduce((a, r) => a + r.amount, 0) / supply, top: top.map((r) => r.owner), excluded: rows.filter((r) => !keep(r)).length };
  });
  if (!holders.error) { checks.top10Share = holders.top10Share; checks.topHolders = holders.top; checks.holdersExcluded = holders.excluded; } else checks.holdersError = holders.error;
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
    // no funder found for any wallet = UNKNOWN (null), never a pass (Inspector 2026-11-18)
    return { sameFunderMax: by.size ? Math.max(...by.values()) : null, checked: wallets.length, found: [...by.values()].reduce((a, b) => a + b, 0) };
  });
  if (!fund.error) { checks.sameFunderMax = fund.sameFunderMax; checks.fundersChecked = fund.checked; checks.fundersFound = fund.found; } else checks.fundError = fund.error;
  // dev sold: the stream and the sample only see the first slots and 120 transactions, so the dev wallet's CURRENT balance of
  // the coin is read directly. Less than it bought at launch = it sold (or moved the coins out, which is the same warning).
  if (stream.creator) {
    const bal = await safe(async () => ((await rpc("getTokenAccountsByOwner", [stream.creator, { mint }, { encoding: "jsonParsed" }]))?.value || []).reduce((a, x) => a + Number(x.account?.data?.parsed?.info?.tokenAmount?.amount || 0), 0));
    if (typeof bal === "number") { checks.devBalance = bal; checks.devShare = bal / (checks.supply || 1e15);
      if (stream.launchComplete && stream.devTok > 0 && bal < stream.devTok * 0.99) { checks.devSold = true; checks.devSoldBy = "balance"; } }
    else { checks.devBalanceError = bal.error; checks.devSold = checks.devSold === true ? true : null; }
  }
  const rug = await safe(() => getJsonRetry(`https://api.rugcheck.xyz/v1/tokens/${mint}/report/summary`));
  if (!rug.error) { const risks = Array.isArray(rug.risks) ? rug.risks : []; checks.rugScore = rug.score ?? null; checks.rugRisks = risks.map((x) => `${x.name} (${x.level})`); checks.rugDanger = risks.some((x) => x.level === "danger"); } else checks.rugError = rug.error;
  // the coin's own metadata: an IPFS path through the Pinata gateway (ipfs.io no longer serves JSON), any other https URI as is
  const cid = cidOf(stream.uri), metaUrl = cid ? `https://gateway.pinata.cloud/ipfs/${cid}` : /^https:\/\//.test(String(stream.uri || "")) ? stream.uri : null;
  const meta = metaUrl ? await safe(() => getJsonRetry(metaUrl)) : { error: "no metadata uri" };
  if (!meta.error) { const s = ["twitter", "telegram", "website"].filter((k) => typeof meta[k] === "string" && /^https?:\/\//.test(meta[k])); checks.socials = s.length; checks.socialLinks = s.map((k) => meta[k]); } else checks.metaError = meta.error;
  checks.vetoed = d ? await vetoed(d, mint) : false;
  return { checks, verdict: judgeHealth(checks), calls };
}

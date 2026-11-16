// Nansen reader. Alex is signed in (free account) to Nansen in Aquarius's own Chrome; the Smart Money pages are read through
// the same command queue the Aquarius link uses (mob_aquarius_link: the extension polls it), so this works from the tick
// with no session of ours open. Gentle on purpose (his personal account): the trades page at most every 3 minutes, the
// leaderboard every 4 hours, one small step per tick (navigate, then read a minute later), and a cycle is skipped whenever
// the browser is offline, busy, showing a card, or someone else has a command queued. Rows are stored raw. A labelled smart
// trader BUYING a non-stable token (>= $50, <= 10 minutes ago) whose symbol resolves to exactly one liquid mint becomes an
// R5 signal of source "nansen". Their sells are only exit warnings. Text shapes were read from the real pages on 2026-11-16.
import { db } from "../db.mjs";
import { getJson, jupPool } from "./feeds.mjs";
import { num, round, COUNCIL } from "./logic.mjs";

export const NANSEN = { trades: "https://app.nansen.ai/smart-money?chains=solana&tab=dex-trades", leaders: "https://app.nansen.ai/smart-money/?chains=solana", everyMin: 3, leadersEveryMin: 240, minUsd: 50, maxAgeMin: 10 };
const STABLE = new Set(["SOL", "WSOL", "USDC", "USDT", "USD1", "PYUSD", "USDS", "JUPUSD", "USDE", "FDUSD"]);
const SEARCH = (q) => `https://lite-api.jup.ag/tokens/v2/search?query=${encodeURIComponent(q)}`;
const cells = (text) => String(text || "").split(/[\n\t]+/).map((s) => s.replace(/ /g, " ").trim()).filter(Boolean);
const amount = (s) => { const m = String(s).replace(/[$,%\s]/g, "").match(/^(-?[\d.]+)([KMB])?$/i); return m ? Number(m[1]) * ({ K: 1e3, M: 1e6, B: 1e9 }[(m[2] || "").toUpperCase()] || 1) : null; };
const trader = (s) => { const m = String(s).match(/^(.*?)\s*\[([1-9A-HJ-NP-Za-km-z]{4,12})[\]…]?/); return m ? { label: m[1].replace(/^"|"$/g, "").replace(/"\s+on\s+/, " on ").trim() || "Smart Trader", prefix: m[2] } : null; };
const agoMin = (s) => { const m = String(s).match(/^(\d+)\s*(s|m|h|d)\w*\s+ago$/i); return m ? Number(m[1]) * ({ s: 1 / 60, m: 1, h: 60, d: 1440 }[m[2].toLowerCase()]) : null; };

// "Trader | Amount | Bought | Amount | Sold | Value | Time": a trader cell, then exactly these six cells.
export function parseTrades(text) {
  const c = cells(text), out = [];
  for (let i = 0; i + 6 < c.length; i++) {
    const t = trader(c[i]); if (!t) continue;
    const row = { ...t, amtBought: amount(c[i + 1]), bought: c[i + 2], amtSold: amount(c[i + 3]), sold: c[i + 4], valueUsd: /^\$/.test(c[i + 5]) ? amount(c[i + 5]) : null, agoMin: agoMin(c[i + 6]) };
    if (row.amtBought == null || row.amtSold == null || row.valueUsd == null || row.agoMin == null || !/^[^\s$]{1,20}$/.test(row.bought) || !/^[^\s$]{1,20}$/.test(row.sold)) continue;
    out.push(row); i += 6;
  }
  return out;
}
// "Name | Total PnL | Realized PnL | ROI | Win Rate | # Trades"
export function parseLeaders(text) {
  const c = cells(text), out = [];
  for (let i = 0; i + 5 < c.length; i++) {
    const t = trader(c[i]); if (!t) continue;
    const row = { ...t, totalPnl: /^-?\$/.test(c[i + 1]) ? amount(c[i + 1]) : null, realizedPnl: /^-?\$/.test(c[i + 2]) ? amount(c[i + 2]) : null, roiPct: /%$/.test(c[i + 3]) ? amount(c[i + 3]) : null, winRatePct: /%$/.test(c[i + 4]) ? amount(c[i + 4]) : null, trades: amount(c[i + 5]) };
    if (row.totalPnl == null || row.realizedPnl == null || row.roiPct == null || row.winRatePct == null || row.trades == null) continue;
    out.push(row); i += 5;
  }
  return out;
}
// Symbol -> mint through Jupiter's token search. Exactly one liquid, not-brand-new token with that exact symbol, or no signal.
export async function resolveSymbol(sym) {
  let list;
  try { list = await getJson(SEARCH(sym)); } catch (e) { return { mint: null, why: `search failed: ${String(e.message).slice(0, 60)}` }; }
  const hits = (Array.isArray(list) ? list : []).filter((x) => String(x.symbol || "").toLowerCase() === sym.toLowerCase() && (num(x.liquidity) || 0) >= COUNCIL.hardMinLiq && x.firstPool?.createdAt && Date.now() - Date.parse(x.firstPool.createdAt) >= 10 * 60000);
  if (hits.length !== 1) return { mint: null, why: hits.length ? `ambiguous: ${hits.length} liquid tokens named ${sym}` : `no liquid token named ${sym}` };
  const cand = jupPool({ id: hits[0].firstPool.id, quoteAsset: null, baseAsset: hits[0] });
  return cand ? { mint: hits[0].id, cand } : { mint: null, why: "not a tradable memecoin (stock, RWA or staking token)" };
}

const cmdId = () => `nz${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
async function linkState(d) {
  const s = (await d.one(`SELECT value FROM mob_settings WHERE key='aquarius_link_status'`).catch(() => null))?.value;
  const st = typeof s === "string" ? JSON.parse(s) : s;
  if (!st || Date.now() - (st.at || 0) > 45000 || st.chrome === false || st.hands === false) return { online: false, why: "browser offline" };
  if (st.busy || st.card) return { online: true, free: false, why: "browser busy" };
  const other = await d.one(`SELECT count(*)::int n FROM mob_aquarius_link WHERE state IN ('queued','running') AND id NOT LIKE 'nz%' AND created_at > now() - interval '2 minutes'`);
  return other.n ? { online: true, free: false, why: "someone else is using the tab" } : { online: true, free: true };
}

export async function nansenTick(env, { set = () => {}, nowMs = Date.now() } = {}) {
  const d = db(env);
  const st = (await d.one(`SELECT v FROM mob_aq_state WHERE k='nansen'`))?.v || { phase: "idle" };
  const save = (v) => d.q(`INSERT INTO mob_aq_state (k, v, at) VALUES ('nansen',$1,now()) ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v, at=now()`, [JSON.stringify(v)]);
  const done = async (extra) => { const v = { ...st, phase: "idle", cmd: null, ...extra }; await save(v); return v; };
  const ls = await linkState(d);
  const queue = async (action, input) => { const id = cmdId(); await d.q(`INSERT INTO mob_aquarius_link (id, action, input) VALUES ($1,$2,$3)`, [id, action, JSON.stringify(input)]); return id; };
  if (st.phase !== "idle") {
    const r = await d.one(`SELECT state, result FROM mob_aquarius_link WHERE id=$1`, [st.cmd]);
    if (!r || r.state !== "done") {
      if (nowMs - (st.since || 0) < 150000 && ls.online) { set("nw.x", "busy", `nansen: waiting for the browser (${st.phase} ${st.kind})`); return { ...st, online: ls.online }; }
      await d.q(`DELETE FROM mob_aquarius_link WHERE id=$1 AND state='queued'`, [st.cmd]);
      set("wh.kol", "blocked", "nansen: browser offline");
      return done({ online: false, note: "nansen: browser offline" });
    }
    if (st.phase === "nav") { const id = await queue("read_text", {}); const v = { ...st, phase: "read", cmd: id, since: nowMs }; await save(v); return v; }
    const text = r.result?.text || "";
    if (st.kind === "leaders") {
      const rows = parseLeaders(text);
      for (const x of rows) await d.q(`INSERT INTO mob_aq_nansen_leaders (prefix, label, total_pnl, realized_pnl, roi_pct, win_rate_pct, trades) VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (prefix) DO UPDATE SET label=EXCLUDED.label, total_pnl=EXCLUDED.total_pnl, realized_pnl=EXCLUDED.realized_pnl, roi_pct=EXCLUDED.roi_pct, win_rate_pct=EXCLUDED.win_rate_pct, trades=EXCLUDED.trades, updated_at=now()`,
        [x.prefix, x.label, x.totalPnl, x.realizedPnl, x.roiPct, x.winRatePct, x.trades]);
      set("wh.kol", rows.length ? "busy" : "blocked", `nansen leaderboard: ${rows.length} labelled traders read`);
      return done({ online: true, lastLeadersAt: nowMs, leaders: rows.length, note: rows.length ? null : "nansen: leaderboard page had no rows" });
    }
    const rows = parseTrades(text);
    let fresh = 0, signals = 0;
    const held = new Set((await d.q(`SELECT upper(symbol) s FROM mob_aq_positions`)).map((p) => p.s));
    for (const x of rows) {
      const key = [x.prefix, x.bought, x.amtBought, x.sold, x.amtSold, x.valueUsd].join("|");
      const isBuy = !STABLE.has(x.bought.toUpperCase()) && STABLE.has(x.sold.toUpperCase());
      const ins = await d.one(`INSERT INTO mob_aq_nansen_trades (key, label, prefix, bought, amt_bought, sold, amt_sold, value_usd, trade_at, is_buy) VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now() - make_interval(secs => $9::int), $10) ON CONFLICT (key) DO NOTHING RETURNING id`,
        [key, x.label, x.prefix, x.bought, x.amtBought, x.sold, x.amtSold, x.valueUsd, Math.round(x.agoMin * 60), isBuy]);
      if (!ins) continue;
      fresh++;
      const w = await d.q(`SELECT wallet FROM mob_aq_whales WHERE wallet LIKE $1 LIMIT 2`, [`${x.prefix}%`]);
      if (w.length === 1) await d.q(`UPDATE mob_aq_nansen_trades SET wallet=$2 WHERE id=$1`, [ins.id, w[0].wallet]);
      // their sell of a coin we hold is a warning for the open position, never an entry
      if (!isBuy && STABLE.has(x.bought.toUpperCase()) && held.has(x.sold.toUpperCase()))
        await d.q(`INSERT INTO mob_aq_brain (dept, kind, text) VALUES ('whales','warning',$1)`, [`Nansen exit warning: ${x.label} [${x.prefix}] sold ${x.sold} ($${x.valueUsd}) ${Math.round(x.agoMin)} min ago while we hold it. REPORTED, not a trigger.`]);
      if (!isBuy || x.valueUsd < NANSEN.minUsd || x.agoMin > NANSEN.maxAgeMin) continue;
      const rs = await resolveSymbol(x.bought);
      const ld = await d.one(`SELECT win_rate_pct, roi_pct FROM mob_aq_nansen_leaders WHERE prefix=$1`, [x.prefix]);
      const weight = ld ? round(0.5 + Math.min(100, ld.win_rate_pct) / 100, 2) : 1;
      await d.q(`UPDATE mob_aq_nansen_trades SET mint=$2, resolved=$3, signal=$4, weight=$5, cand=$6 WHERE id=$1`, [ins.id, rs.mint, rs.mint ? "ok" : rs.why, !!rs.mint, weight, rs.cand ? JSON.stringify(rs.cand) : null]);
      if (rs.mint) signals++;
    }
    set("wh.kol", "busy", `nansen: ${rows.length} smart-money trades on the page, ${fresh} new, ${signals} buy signal(s)`);
    return done({ online: true, lastReadAt: nowMs, rowsOnPage: rows.length, note: rows.length ? null : "nansen: trades page had no rows (signed out?)" });
  }
  // idle: start a cycle when one is due and the tab is free
  const dueLeaders = nowMs - (st.lastLeadersAt || 0) >= NANSEN.leadersEveryMin * 60000, dueTrades = nowMs - (st.lastReadAt || 0) >= NANSEN.everyMin * 60000;
  if (!dueLeaders && !dueTrades) return { ...st, online: ls.online };
  if (!ls.online || !ls.free) { set("wh.kol", ls.online ? "idle" : "blocked", `nansen: ${ls.why}`); const v = { ...st, online: ls.online, note: `nansen: ${ls.why}` }; await save(v); return v; }
  const kind = dueLeaders && st.lastReadAt ? "leaders" : "trades";
  const id = await queue("navigate", { url: NANSEN[kind], why: kind === "leaders" ? "Aquarius: read the Smart Money leaderboard" : "Aquarius: read Smart Money live trades" });
  const v = { ...st, phase: "nav", kind, cmd: id, since: nowMs, online: true, note: null };
  await save(v);
  set("wh.kol", "busy", `nansen: opening the ${kind} page`);
  return v;
}

// Fresh nansen buy signals by mint (for the Council) and their candidates (so the coin is judged even if no list shows it).
export async function nansenSignals(d) {
  const rows = await d.q(`SELECT mint, label, prefix, value_usd, weight, cand FROM mob_aq_nansen_trades WHERE signal AND trade_at > now() - make_interval(mins => $1::int) ORDER BY weight DESC, value_usd DESC`, [NANSEN.maxAgeMin]);
  const by = {};
  for (const r of rows) (by[r.mint] ||= { traders: [], weight: 0, cand: r.cand }).traders.push(`${r.label} [${r.prefix}]`), (by[r.mint].weight = Math.max(by[r.mint].weight, r.weight || 1));
  return by;
}
export async function nansenState(d) {
  const st = (await d.one(`SELECT v FROM mob_aq_state WHERE k='nansen'`))?.v || {};
  const c = await d.one(`SELECT count(*) FILTER (WHERE seen_at > now() - interval '1 hour')::int t, count(*) FILTER (WHERE signal AND seen_at > now() - interval '1 hour')::int s, (SELECT count(*)::int FROM mob_aq_nansen_leaders) l FROM mob_aq_nansen_trades`);
  const rows = await d.q(`SELECT seen_at, trade_at, label, prefix, bought, amt_bought, sold, amt_sold, value_usd, is_buy, signal, resolved FROM mob_aq_nansen_trades ORDER BY trade_at DESC, id LIMIT 15`);
  return { state: { online: !!st.online, lastReadAt: st.lastReadAt ? new Date(st.lastReadAt).toISOString() : null, tradesSeen1h: c.t, signals1h: c.s, leaders: c.l, note: st.note || null },
    feed: rows.map((r) => ({ at: r.trade_at, section: "whales", label: "REPORTED", source: "nansen", text: `${r.label} [${r.prefix}] ${r.is_buy ? "bought" : "swapped to"} ${r.bought} for ${r.sold} ($${r.value_usd})${r.signal ? " -> R5 signal" : r.resolved && r.resolved !== "ok" ? ` (${r.resolved})` : ""}` })) };
}

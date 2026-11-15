// THE CITY: private live dashboard, served inside mob at /city. Everything here sits behind the mob admin session
// (the gate in worker.route), except /api/income which also accepts the mob bearer token. READ-ONLY on all store data:
// only SELECTs on stores/orders/carts/visits/payment_providers; the only write in this file is the manual income ledger (mob_income).
import { db } from "./db.mjs";
import * as S from "./stats.mjs";
import { BUILDINGS, WORKERS, STATUS_DAYS, MIN_VISITS } from "../city/config.mjs";
import { APP_JS, TRADING, TODOS, BUILT_AT } from "./city-bundle.mjs";

const ids = new Set(BUILDINGS.map((b) => b.id));
const money = (cents, cur = "USD") => { try { return new Intl.NumberFormat("en-US", { style: "currency", currency: cur || "USD" }).format(Number(cents || 0) / 100); } catch { return `${(Number(cents || 0) / 100).toFixed(2)} ${cur}`; } };
const N = (v) => Number(v || 0);
const trim = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

export function cityPage() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex"><title>The City</title>
<style>${CSS}</style></head><body>
<canvas id="gl"></canvas>
<div id="load"><div><b>THE CITY</b><i id="loadmsg">Lighting the lanterns…</i></div></div>
<div id="hud"><b>THE CITY</b><span id="tot">loading live numbers…</span></div>
<canvas id="mini" width="160" height="160"></canvas>
<div id="tip"></div><div id="labels"></div>
<div id="panel"><button id="x" aria-label="Close">×</button><div id="pc"></div></div>
<div id="btns"><button id="snow">Snow: on</button><button id="orbit">Orbit view</button><a href="/">mob</a></div>
<div id="help">WASD walk · Shift run · Space jump · drag to look · wheel zoom · click a building · E opens the nearest</div>
<div id="joy"><i></i></div>
<script type="module" src="/city/app.js"></script></body></html>`;
}
const CSS = `*{box-sizing:border-box}html,body{margin:0;height:100%;overflow:hidden;background:#f1c58c;font:14px/1.4 -apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#fff6e4}
#gl{position:fixed;inset:0;width:100%;height:100%;display:block;touch-action:none}
#load{position:fixed;inset:0;background:linear-gradient(#2a3a7a,#f1a860);display:flex;align-items:center;justify-content:center;text-align:center;z-index:9;transition:opacity .6s}#load b{display:block;font:700 34px Georgia,serif;letter-spacing:.2em}#load i{display:block;margin-top:8px;opacity:.8}
#hud{position:fixed;left:16px;top:14px;padding:8px 14px;background:rgba(24,22,48,.55);border:1px solid rgba(255,214,140,.5);border-radius:12px;backdrop-filter:blur(8px);max-width:60vw}#hud b{font:700 15px Georgia,serif;letter-spacing:.18em;margin-right:12px;color:#ffd98a}#hud span{font-size:13px}
#mini{position:fixed;right:14px;top:14px;border-radius:50%;border:2px solid rgba(255,214,140,.6);background:rgba(20,30,60,.5)}
#tip{position:fixed;left:50%;bottom:64px;transform:translateX(-50%);padding:6px 14px;border-radius:20px;background:rgba(24,22,48,.7);border:1px solid rgba(255,214,140,.5);display:none;white-space:nowrap}
#labels div{position:fixed;transform:translate(-50%,-100%);padding:2px 8px;border-radius:10px;background:rgba(24,22,48,.6);font-size:12px;white-space:nowrap;pointer-events:none;border:1px solid rgba(255,214,140,.35)}
#labels div.say{background:#fffdf4;color:#2a2438;border-color:#e8c880;font-weight:600}
#panel{position:fixed;right:0;top:0;bottom:0;width:min(400px,100vw);transform:translateX(105%);transition:transform .35s;background:linear-gradient(#211d3e,#2d2748);border-left:2px solid #e8c880;overflow:auto;padding:18px 18px 40px;z-index:5}#panel.on{transform:none}
#x{position:absolute;right:10px;top:8px;background:none;border:0;color:#ffd98a;font-size:28px;cursor:pointer}
#pc h2{margin:0 24px 2px 0;font:700 22px Georgia,serif;color:#ffd98a}#pc .dist{font-size:12px;opacity:.7;letter-spacing:.06em;text-transform:uppercase}#pc p{margin:8px 0;opacity:.92}
.st{display:inline-block;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:700;margin:6px 6px 6px 0}.st.open{background:#3aa876;color:#04210f}.st.construction{background:#f2b21c;color:#2a1c00}.st.closed{background:#777;color:#fff}.st.planned{background:#6a8ad8;color:#07122e}
.kp{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0}.kp div{background:rgba(255,255,255,.07);border-radius:10px;padding:8px 10px}.kp small{display:block;opacity:.65;font-size:11px;text-transform:uppercase;letter-spacing:.05em}.kp b{font-size:18px}.kp .no b{opacity:.5;font-size:14px;font-weight:500}
.tg{font-size:10px;font-weight:700;padding:1px 6px;border-radius:8px;margin-left:6px;vertical-align:middle;background:#e8c880;color:#2a1c00}.tg.auto{background:#7ab8ff;color:#06203a}
#pc h3{margin:18px 0 6px;font-size:13px;color:#ffd98a;text-transform:uppercase;letter-spacing:.08em}#pc ul{margin:0;padding:0;list-style:none}#pc li{padding:6px 0;border-bottom:1px solid rgba(255,255,255,.08);font-size:13px}#pc li small{display:block;opacity:.65}
.asof{margin-top:16px;font-size:11px;opacity:.55}
#btns{position:fixed;left:16px;bottom:16px;display:flex;gap:8px}#btns button,#btns a{background:rgba(24,22,48,.7);color:#ffd98a;border:1px solid rgba(255,214,140,.5);border-radius:10px;padding:7px 12px;font-size:13px;cursor:pointer;text-decoration:none}
#help{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);font-size:12px;opacity:.75;text-shadow:0 1px 3px #000;white-space:nowrap;pointer-events:none}
#joy{position:fixed;left:24px;bottom:70px;width:120px;height:120px;border-radius:50%;background:rgba(24,22,48,.35);border:2px solid rgba(255,214,140,.5);display:none;touch-action:none}#joy i{position:absolute;left:40px;top:40px;width:40px;height:40px;border-radius:50%;background:rgba(255,214,140,.7)}
@media(max-width:700px){#help{display:none}#mini{width:100px;height:100px}#hud{max-width:70vw}}`;

// ---------- manual income ledger ----------
export async function incomeApi(req, env, M, { json, apiErr, ok }) {
  if (!ok) return apiErr(401, "unauthorized", "Bearer MOB_API_TOKEN or an admin session is required");
  const d = db(env);
  if (M === "GET") {
    const rows = await d.q(`SELECT id, to_char(date,'YYYY-MM-DD') AS date, business, source, amount_cents::bigint AS amount_cents, currency, ext_ref, note, created_at FROM mob_income ORDER BY date DESC, id DESC LIMIT 500`);
    return json({ entries: rows.map((r) => ({ ...r, amount_cents: N(r.amount_cents), manual: true })) });
  }
  if (M !== "POST") return apiErr(405, "method", "GET or POST");
  let b; try { b = await req.json(); } catch { return apiErr(400, "bad_json", "Body must be JSON"); }
  const errs = [];
  const business = String(b?.business ?? "");
  if (!ids.has(business)) errs.push(`business must be a building id: ${[...ids].join(", ")}`);
  const source = trim(b?.source, 80); if (!source) errs.push("source is required (e.g. Stripe payment link, Depop, Grailed)");
  const amount = Number(b?.amount_cents); if (!Number.isInteger(amount) || amount === 0) errs.push("amount_cents must be a non-zero integer");
  const currency = String(b?.currency || "USD").toUpperCase(); if (!/^[A-Z]{3}$/.test(currency)) errs.push("currency must be a 3-letter code");
  const date = b?.date == null ? new Date().toISOString().slice(0, 10) : String(b.date); if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(new Date(date))) errs.push("date must be YYYY-MM-DD");
  const ext = b?.ext_ref == null || b.ext_ref === "" ? null : trim(b.ext_ref, 120);
  if (errs.length) return apiErr(400, "validation", errs.join("; "));
  try {
    const r = await d.one(`INSERT INTO mob_income (date, business, source, amount_cents, currency, ext_ref, note) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, to_char(date,'YYYY-MM-DD') AS date, business, source, amount_cents::bigint AS amount_cents, currency, ext_ref, note`, [date, business, source, amount, currency, ext, trim(b?.note, 300) || null]);
    return json({ entry: { ...r, amount_cents: N(r.amount_cents), manual: true } }, 201);
  } catch (e) {
    if (/mob_income_ext_ref|duplicate key/.test(String(e.message))) return apiErr(409, "duplicate", "An entry with this ext_ref already exists");
    throw e;
  }
}

// ---------- routes ----------
export async function cityRoute(req, env, path, { json, html }) {
  if (req.method !== "GET") return json({ error: { message: "read-only" } }, 405);
  if (path === "/city") return html(cityPage(), 200, { "content-security-policy": "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; worker-src 'self' blob:", "x-robots-tag": "noindex" });
  if (path === "/city/app.js") return new Response(APP_JS, { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" } });
  if (path === "/city/data") return json(await cityData(env));
  return json({ error: { message: "not found" } }, 404);
}

const safe = async (f, fb = null) => { try { return await f(); } catch (e) { return fb; } };
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

export async function cityData(env, now = new Date()) {
  const d = db(env);
  const [stores, ord, carts, vis, brain, inc, prov, mobCounts, ov, last24] = await Promise.all([
    safe(() => d.q(`SELECT slug, name, currency FROM stores`), []),
    safe(() => d.q(`SELECT s.slug,
      count(*) FILTER (WHERE o.payment_status='paid')::int paid,
      coalesce(sum(o.total_cents - coalesce(o.refunded_cents,0)) FILTER (WHERE o.payment_status='paid'),0)::bigint rev,
      count(*) FILTER (WHERE o.payment_status='paid' AND coalesce(o.paid_at,o.created_at) > now() - interval '7 days')::int p7,
      coalesce(sum(o.total_cents - coalesce(o.refunded_cents,0)) FILTER (WHERE o.payment_status='paid' AND coalesce(o.paid_at,o.created_at) > now() - interval '7 days'),0)::bigint r7,
      count(*) FILTER (WHERE o.payment_status='paid' AND coalesce(o.paid_at,o.created_at) > now() - interval '30 days')::int p30,
      coalesce(sum(o.total_cents - coalesce(o.refunded_cents,0)) FILTER (WHERE o.payment_status='paid' AND coalesce(o.paid_at,o.created_at) > now() - interval '30 days'),0)::bigint r30,
      count(*) FILTER (WHERE o.payment_status='paid' AND coalesce(o.paid_at,o.created_at) > now() - interval '${STATUS_DAYS} days')::int p60,
      count(*) FILTER (WHERE o.payment_status='pending')::int pending,
      count(*) FILTER (WHERE o.payment_status='failed')::int failed,
      count(*) FILTER (WHERE o.payment_status='refunded' OR coalesce(o.refunded_cents,0) > 0)::int refunds,
      coalesce(sum(o.refunded_cents),0)::bigint refunded_cents,
      max(coalesce(o.paid_at,o.created_at)) FILTER (WHERE o.payment_status='paid') last_paid
      FROM stores s LEFT JOIN orders o ON o.store_id=s.id GROUP BY s.slug`), []),
    safe(() => d.q(`SELECT s.slug,
      count(*) FILTER (WHERE c.status='open' AND c.updated_at > now() - interval '7 days')::int open7,
      count(*) FILTER (WHERE c.created_at > now() - interval '30 days')::int c30,
      count(*) FILTER (WHERE c.status='converted')::int conv
      FROM stores s LEFT JOIN carts c ON c.store_id=s.id GROUP BY s.slug`), []),
    safe(() => d.q(`SELECT s.slug,
      count(*) FILTER (WHERE v.first_at > now() - interval '1 day')::int d1,
      count(*) FILTER (WHERE v.first_at > now() - interval '7 days')::int d7,
      count(*) FILTER (WHERE v.first_at > now() - interval '30 days')::int d30,
      count(*) FILTER (WHERE v.first_at > now() - interval '${STATUS_DAYS} days')::int d60,
      max(v.last_at) last_visit
      FROM stores s LEFT JOIN visits v ON v.store_id=s.id GROUP BY s.slug`), []),
    safe(() => d.q(`SELECT id, idea, business, score, result, expected_return, created_at, updated_at FROM mob_aquarius_brain ORDER BY id DESC LIMIT 300`), []),
    safe(() => d.q(`SELECT id, to_char(date,'YYYY-MM-DD') date, business, source, amount_cents::bigint amount_cents, currency, ext_ref, note FROM mob_income ORDER BY date DESC, id DESC LIMIT 500`), []),
    // never selects any key column: mode is derived from the publishable key prefix only
    safe(() => d.q(`SELECT s.slug, p.provider, p.is_primary, p.is_backup, p.connected_at,
      CASE WHEN p.publishable_key LIKE 'pk_live%' THEN 'live' WHEN p.publishable_key LIKE 'pk_test%' THEN 'test' ELSE 'unknown' END AS mode
      FROM payment_providers p JOIN stores s ON s.id=p.store_id`), []),
    safe(() => d.one(`SELECT count(*) FILTER (WHERE status='posted')::int live, count(*) FILTER (WHERE status='scheduled')::int queued,
      count(*) FILTER (WHERE status IN ('publishing','processing'))::int posting, count(*) FILTER (WHERE status='failed')::int failed FROM mob_posts`)),
    safe(() => S.overview(env, "7d")),
    safe(() => d.one(`SELECT (SELECT count(*) FROM mob_aquarius_brain WHERE updated_at > now() - interval '24 hours')::int brain24`)),
  ]);

  const by = (rows) => Object.fromEntries((rows || []).map((r) => [r.slug, r]));
  const O = by(ord), C = by(carts), V = by(vis), SN = by(stores);
  const manual = inc || [];
  const inWindow = (r, days) => (now - new Date(r.date + "T12:00:00Z")) / 864e5 <= days;
  const manualFor = (id) => {
    const rows = manual.filter((r) => r.business === id);
    const agg = (days) => { const o = {}; for (const r of rows) if (days == null || inWindow(r, days)) o[r.currency] = (o[r.currency] || 0) + N(r.amount_cents); return o; };
    return { rows, all: agg(null), d30: agg(30), d7: agg(7) };
  };
  const fmtMap = (m) => { const k = Object.keys(m); return k.length ? k.map((c) => money(m[c], c)).join(" + ") : null; };
  const ideasFor = (b) => {
    if (!b.brain) return [];
    const re = new RegExp(b.brain, "i");
    return (brain || []).filter((r) => re.test(`${r.business || ""} ${r.idea || ""}`)).sort((a, b2) => N(b2.score) - N(a.score) || b2.id - a.id).slice(0, 4)
      .map((r) => ({ t: trim(r.idea, 150), s: [r.result ? trim(r.result, 130) : null, r.score != null ? `score ${r.score}` : null].filter(Boolean).join(" · ") }));
  };

  const out = {}; const totals = { auto30: {}, autoAll: {}, manual30: {}, manualAll: {}, visitorsToday: 0 };
  const orderStatus = (b) => {
    const o = O[b.slug] || {}, v = V[b.slug] || {};
    const active = N(o.p60) > 0 || N(v.d60) >= MIN_VISITS;
    return { active, why: active ? `auto: ${N(o.p60)} paid orders and ${N(v.d60)} visits in the last ${STATUS_DAYS} days` : `auto: no paid order and under ${MIN_VISITS} visits in ${STATUS_DAYS} days` };
  };
  for (const b of BUILDINGS) {
    const p = { id: b.id, name: b.name, district: b.district, purpose: b.purpose, skill: b.skill || null, kpis: [], lists: [], notes: [], next: [] };
    let status = b.status, why = "set by hand in city/config.mjs";
    const k = (l, v, extra = {}) => p.kpis.push({ l, v: v == null ? "no data yet" : String(v), no: v == null, ...extra });
    if (b.kind === "store") {
      const cur = SN[b.slug]?.currency || "USD", o = O[b.slug], c = C[b.slug], v = V[b.slug];
      if (b.status === "auto") { const s = orderStatus(b); status = s.active ? "open" : b.idle || "closed"; why = s.why; }
      if (!o) { k("Revenue (30 days)", null); } else {
        k("Revenue (30 days)", money(o.r30, cur), { tag: "auto" }); k("Revenue (7 days)", money(o.r7, cur), { tag: "auto" });
        k("Paid orders (30d)", N(o.p30)); k("Paid orders (all time)", N(o.paid)); k("Revenue (all time)", money(o.rev, cur), { tag: "auto" });
        k("Checkouts not paid", N(o.pending)); if (N(o.paid)) p.notes.push(`Last paid order: ${new Date(o.last_paid).toISOString().slice(0, 16).replace("T", " ")} UTC`);
        totals.auto30[cur] = (totals.auto30[cur] || 0) + N(o.r30); totals.autoAll[cur] = (totals.autoAll[cur] || 0) + N(o.rev);
      }
      if (v) { k("Visitors today", N(v.d1)); k("Visitors (7d)", N(v.d7)); k("Visitors (30d)", N(v.d30)); totals.visitorsToday += N(v.d1); } else k("Visitors", null);
      if (c) { k("Open carts (7d)", N(c.open7)); k("Carts converted (all)", N(c.conv)); } else k("Carts", null);
    } else if (b.kind === "clipping") {
      const m = mobCounts, kp = ov?.kpis;
      if (!m) k("Posts", null); else { k("Posts live", m.live); k("Queued", m.queued); k("Posting now", m.posting); k("Failed", m.failed); }
      if (kp) { k("Views (7 days)", kp.views_range); k("Views (all)", kp.views_total); k("Est. earnings (7d)", money(Math.round(N(kp.est_usd) * 100)), { tag: "est" }); }
      if (!ov || !ov.accounts?.length) p.notes.push("No connected accounts reporting stats yet.");
      else p.lists.push({ title: "Channels", rows: ov.accounts.map((a) => ({ t: `${a.platform} @${a.handle}`, s: `${a.status}${a.views != null ? ` · ${a.views} views` : ""}` })) });
    } else if (b.kind === "trading") {
      k("Mode", "paper / backtest only"); k("Live trades", null);
      const t = TRADING; if (t) { k("Backtest trades", t.tradesTaken); k("Backtest win rate", `${(t.winRate * 100).toFixed(1)}%`); k("Backtest equity", `${t.startEq} → ${t.endEq}`); p.notes.push(`Backtest snapshot from the repo (fake money, ${t.costsAssumed}); not live results.`); }
    } else if (b.kind === "miner") {
      p.notes.push("Waiting for the machine."); k("Hash rate", null); k("Earnings", null);
    } else if (b.kind === "bank") {
      const autoAll = {}, auto30 = {};
      let paid = 0, pend = 0, fail = 0, refunds = 0, refunded = 0;
      for (const o of Object.values(O)) { const cur = SN[o.slug]?.currency || "USD"; autoAll[cur] = (autoAll[cur] || 0) + N(o.rev); auto30[cur] = (auto30[cur] || 0) + N(o.r30); paid += N(o.paid); pend += N(o.pending); fail += N(o.failed); refunds += N(o.refunds); refunded += N(o.refunded_cents); }
      const man = manualFor.call ? { all: {}, d30: {} } : null;
      for (const r of manual) man.all[r.currency] = (man.all[r.currency] || 0) + N(r.amount_cents);
      for (const r of manual) if (inWindow(r, 30)) man.d30[r.currency] = (man.d30[r.currency] || 0) + N(r.amount_cents);
      k("Order revenue (all)", fmtMap(autoAll) || "no data yet", { tag: "auto" }); k("Order revenue (30d)", fmtMap(auto30), { tag: "auto" });
      k("Manual income (all)", fmtMap(man.all) || money(0), { tag: "manual" }); k("Manual income (30d)", fmtMap(man.d30) || money(0), { tag: "manual" });
      k("Orders paid", paid); k("Orders pending", pend); k("Orders failed", fail); k("Refunds", `${refunds} · ${money(refunded)}`);
      const total = paid + pend + fail; k("Payments health", total ? `${Math.round((paid / total) * 100)}% paid (${paid} of ${total})` : null);
      p.lists.push({ title: "Processors (our database only; keys are never shown)", rows: BUILDINGS.filter((x) => x.kind === "store").map((x) => {
        const rows = (prov || []).filter((r) => r.slug === x.slug);
        return { t: x.name, s: rows.length ? rows.map((r) => `${r.provider} ${r.mode}${r.is_primary ? " · primary" : ""}${r.is_backup ? " · backup" : ""}`).join("; ") : "no processor connected" };
      }) });
      p.lists.push({ title: "Manual income ledger (not from orders)", rows: manual.slice(0, 8).map((r) => ({ t: `${money(r.amount_cents, r.currency)} · ${r.source}`, s: `${r.date} · ${r.business}${r.ext_ref ? " · " + r.ext_ref : ""}${r.note ? " · " + trim(r.note, 90) : ""}`, tag: "manual" })) });
      if (!manual.length) p.notes.push("No manual income entries yet.");
      p.lists.push({ title: "Payments health per store", rows: BUILDINGS.filter((x) => x.kind === "store" && O[x.slug]).map((x) => { const o = O[x.slug]; return { t: x.name, s: `${N(o.paid)} paid · ${N(o.pending)} pending · ${N(o.failed)} failed` }; }) });
    } else if (b.kind === "home") {
      p.notes.push("Home. Nothing to count here.");
    }
    // manual income shows on any building that has entries (and always on stores)
    const mf = manualFor(b.id);
    if (b.kind !== "bank" && (mf.rows.length || b.kind === "store")) {
      k("Manual income (30d)", fmtMap(mf.d30) || money(0), { tag: "manual" }); k("Manual income (all)", fmtMap(mf.all) || money(0), { tag: "manual" });
      if (mf.rows.length) p.lists.push({ title: "Manual entries", rows: mf.rows.slice(0, 5).map((r) => ({ t: `${money(r.amount_cents, r.currency)} · ${r.source}`, s: `${r.date}${r.ext_ref ? " · " + r.ext_ref : ""}${r.note ? " · " + trim(r.note, 90) : ""}`, tag: "manual" })) });
    }
    if (b.id === "hq" && brain) { const m = {}; for (const r of brain) m[r.business || "other"] = (m[r.business || "other"] || 0) + 1; k("Brain ideas", brain.length); p.lists.push({ title: "Brain by business", rows: Object.entries(m).sort((a, c) => c[1] - a[1]).map(([t, n]) => ({ t, s: `${n} ideas` })) }); }
    if (!p.kpis.length && !p.lists.length && !p.notes.length) p.notes.push("No live numbers for this one yet.");
    p.status = status; p.why = why;
    p.next = [...(b.next || []).map((t) => ({ t, s: "plan" })), ...ideasFor(b).map((x) => ({ ...x, s: x.s || "from the brain" }))];
    for (const r of manualFor(b.id).rows) {} // (totals use the full ledger below)
    out[b.id] = p;
  }
  for (const r of manual) { totals.manualAll[r.currency] = (totals.manualAll[r.currency] || 0) + N(r.amount_cents); if (inWindow(r, 30)) totals.manual30[r.currency] = (totals.manual30[r.currency] || 0) + N(r.amount_cents); }

  const m = mobCounts;
  const wk = {
    poster: m ? (N(m.posting) ? { s: "working", t: `posting ${m.posting} clip${m.posting > 1 ? "s" : ""}` } : N(m.queued) ? { s: "working", t: `${m.queued} clips queued` } : { s: "idle", t: "no clips queued" }) : { s: "idle", t: "no data" },
    keeper: (() => { const v = Object.values(V).reduce((a, x) => a + N(x.d1), 0), c = Object.values(C).reduce((a, x) => a + N(x.open7), 0); return vis || carts ? (v || c ? { s: "working", t: `${v} visitors today, ${c} open carts` } : { s: "idle", t: "quiet shop" }) : { s: "idle", t: "no data" }; })(),
    trader: { s: "idle", t: "paper mode, resting" },
    researcher: last24 && N(last24.brain24) ? { s: "working", t: `${last24.brain24} new idea${last24.brain24 > 1 ? "s" : ""} today` } : { s: "idle", t: brain ? "no new ideas today" : "no data" },
    builder: (() => { const n = BUILDINGS.filter((b) => out[b.id].status === "construction").length; return n ? { s: "working", t: `${n} building${n > 1 ? "s" : ""} going up` } : { s: "idle", t: "nothing to build" }; })(),
  };
  const board = {
    jobs: [
      m ? { t: `Clips: ${N(m.live)} live, ${N(m.queued)} queued, ${N(m.posting)} posting, ${N(m.failed)} failed` } : { t: "Clips: no data" },
      { t: `Under construction: ${BUILDINGS.filter((b) => out[b.id].status === "construction").map((b) => b.name).join(", ") || "none"}` },
      ...TODOS.map((t) => ({ t, s: "from plan.md" })),
    ],
    results: (brain || []).filter((r) => r.result).slice(0, 5).map((r) => ({ t: trim(r.idea, 100), s: trim(r.result, 130) })),
  };
  return { asof: now.toISOString(), built: BUILT_AT, buildings: out, workers: WORKERS.map((w) => ({ ...w, ...wk[w.id] })), board, totals, ledger_entries: manual.length };
}

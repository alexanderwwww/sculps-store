/**
 * Tracking behaviour — what real visitors did, on a real map, for any day
 * or span of days.
 *
 * Everything drawn here is read from three places and nothing is modelled:
 * the events table (who arrived, added, reached checkout, paid), the visits
 * table (seconds with the tab visible and how far they scrolled, from the
 * page's 20-second heartbeat) and the carts/orders tables (which products
 * were actually put in a bag). The map's land is real coastline rasterised
 * into hexagons at build time; a visitor lights the tile they were in.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { sql } from "drizzle-orm";
import type { Route } from "./+types/admin.analytics.behavior";
import { requireUser } from "~/lib/auth.server";
import { startOfDayIn } from "~/lib/day";
import { resolveAdminStore } from "~/lib/admin.server";
import { events, visits, carts, orders, variants, customers } from "~/db/schema";
import { formatMoney } from "~/lib/money";
import { Empty, card } from "~/admin/ui";
import world from "~/admin/world-hex.json";

export function meta() {
  return [{ title: "Tracking behaviour — Shop Admin" }];
}

const PRESETS: Record<string, { label: string; from: number; to: number }> = {
  today: { label: "Today", from: 0, to: -1 },
  yesterday: { label: "Yesterday", from: 1, to: 0 },
  "7d": { label: "7 days", from: 6, to: -1 },
  "30d": { label: "30 days", from: 29, to: -1 },
};

interface SessionRow {
  sid: string;
  first: string;
  last: string;
  views: number;
  carted: boolean;
  checked: boolean;
  paid: boolean;
  country: string | null;
  city: string | null;
  lat: number | null;
  lon: number | null;
  device: string | null;
  source: string | null;
  seconds: number | null;
  scroll: number | null;
  lastPath: string | null;
  email: string | null;
  name: string | null;
  /** what this visitor put in a bag, by variant id */
  added: string[];
}

export async function loader({ context, request }: Route.LoaderArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  if (!store) return { store: null, range: null, sessions: [], catalogue: {}, added: [], hours: [], summary: null, cities: [] };

  // The window, in the store's own days.
  const preset = url.searchParams.get("range") || "today";
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  let since: Date;
  let until: Date;
  let label: string;
  if (preset === "custom" && fromParam && toParam) {
    since = startOfDayIn(store.timezone, 0, new Date(`${fromParam}T12:00:00Z`));
    until = startOfDayIn(store.timezone, -1, new Date(`${toParam}T12:00:00Z`));
    label = `${fromParam} → ${toParam}`;
  } else {
    const p = PRESETS[preset] ?? PRESETS.today;
    since = startOfDayIn(store.timezone, p.from);
    until = startOfDayIn(store.timezone, p.to);
    label = p.label;
  }

  const [sessionRows, addedRows, paidRows] = await Promise.all([
    context.db.execute(sql`
      with e as (
        select ${events.sessionId} as sid,
               min(${events.at}) as first,
               max(${events.at}) as last,
               cast(count(*) filter (where ${events.type} = 'view') as int) as views,
               bool_or(${events.type} = 'cart') as carted,
               bool_or(${events.type} = 'checkout') as checked,
               bool_or(${events.type} = 'purchase') as paid,
               max(${events.country}) as country,
               max(${events.city}) as city,
               max(${events.lat}) as lat,
               max(${events.lon}) as lon,
               max(${events.device}) as device,
               max(${events.source}) as source
        from ${events}
        where ${events.storeId} = ${store.id}
          and ${events.human} = true
          and ${events.at} >= ${since}
          and ${events.at} < ${until}
        group by 1
      )
      select e.*, v.${sql.raw("seconds")} as seconds, v.${sql.raw("scroll_max")} as scroll, v.${sql.raw("last_path")} as last_path,
             coalesce(cu.${sql.raw("email")}, ca.${sql.raw("email")}) as email, cu.${sql.raw("name")} as name,
             ca.${sql.raw("items")} as items,
             (select array_agg(substring(${events.path} from '/cart/add/(.*)$')) from ${events}
               where ${events.sessionId} = e.sid and ${events.type} = 'cart' and ${events.path} like '/cart/add/%') as adds
      from e
      left join ${visits} v on v.${sql.raw("session_id")} = e.sid and v.${sql.raw("store_id")} = ${store.id}
      left join lateral (select ${customers.email} as email, ${customers.name} as name from ${customers}
                          where ${customers.storeId} = ${store.id} and ${customers.lastSessionId} = e.sid limit 1) cu on true
      left join lateral (select ${carts.email} as email, ${carts.items} as items from ${carts}
                          where ${carts.storeId} = ${store.id} and ${carts.sessionId} = e.sid order by ${carts.updatedAt} desc limit 1) ca on true
      order by e.first desc
      limit 3000
    `),
    // Products put in a bag: every cart touched in the window, by variant.
    context.db.execute(sql`
      select v.${sql.raw("id")} as id, v.${sql.raw("label")} as label, v.${sql.raw("image_url")} as image, v.${sql.raw("price_cents")} as price,
             cast(sum((i->>'quantity')::int) as int) as qty,
             cast(count(distinct c.${sql.raw("id")}) as int) as carts
      from ${carts} c, jsonb_array_elements(c.${sql.raw("items")}) i
      join ${variants} v on (i->>'variantId') ~ '^[0-9a-f-]{36}$' and v.${sql.raw("id")} = (i->>'variantId')::uuid
      where c.${sql.raw("store_id")} = ${store.id}
        and jsonb_typeof(c.${sql.raw("items")}) = 'array'
        and c.${sql.raw("updated_at")} >= ${since} and c.${sql.raw("updated_at")} < ${until}
      group by 1,2,3,4
      order by carts desc
    `),
    context.db.execute(sql`
      select cast(count(distinct o.${sql.raw("id")}) as int) as n, cast(coalesce(sum(o.${sql.raw("total_cents")}),0) as int) as revenue
      from ${orders} o
      where o.${sql.raw("store_id")} = ${store.id} and o.${sql.raw("paid_at")} >= ${since} and o.${sql.raw("paid_at")} < ${until}
    `),
  ]);

  const sessions: SessionRow[] = (sessionRows.rows as any[]).map((r) => ({
    sid: String(r.sid),
    first: new Date(r.first).toISOString(),
    last: new Date(r.last).toISOString(),
    views: Number(r.views ?? 0),
    carted: Boolean(r.carted),
    checked: Boolean(r.checked),
    paid: Boolean(r.paid),
    country: r.country ?? null,
    city: r.city ?? null,
    lat: r.lat == null ? null : Number(r.lat),
    lon: r.lon == null ? null : Number(r.lon),
    device: r.device ?? null,
    source: r.source ?? null,
    seconds: r.seconds == null ? null : Number(r.seconds),
    scroll: r.scroll == null ? null : Number(r.scroll),
    lastPath: r.last_path ?? null,
    email: r.email ?? null,
    name: r.name ?? null,
    added: Array.from(new Set([
      ...((r.adds as string[] | null) ?? []).filter(Boolean),
      ...(((r.items as { variantId?: string }[] | null) ?? []).map((i) => i.variantId).filter(Boolean) as string[]),
    ])),
  }));

  // Names and pictures for whatever anyone added, so the table can show the bag.
  const variantIds = Array.from(new Set(sessions.flatMap((s) => s.added))).filter((id) => /^[0-9a-f-]{36}$/.test(id));
  const variantRows = variantIds.length
    ? await context.db.select({ id: variants.id, label: variants.label, image: variants.imageUrl }).from(variants).where(sql`${variants.id} in ${variantIds}`)
    : [];
  const catalogue = Object.fromEntries(variantRows.map((v) => [v.id, { label: v.label, image: v.image }]));

  // Hours in the store's zone, so "morning" means the customer's morning.
  const hours = Array.from({ length: 24 }, () => 0);
  const hourOf = new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: store.timezone });
  for (const s of sessions) {
    const h = Number(hourOf.format(new Date(s.first))) % 24;
    hours[h] += 1;
  }

  const cityCount = new Map<string, { n: number; country: string | null }>();
  for (const s of sessions) {
    const key = s.city || "Unknown";
    const cur = cityCount.get(key) ?? { n: 0, country: s.country };
    cur.n += 1;
    cityCount.set(key, cur);
  }
  const cities = [...cityCount.entries()].map(([city, v]) => ({ city, n: v.n, country: v.country })).sort((a, b) => b.n - a.n).slice(0, 14);

  const measured = sessions.filter((s) => s.seconds != null);
  const median = (xs: number[]) => (xs.length ? xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null);
  const paid = (paidRows.rows[0] as any) ?? { n: 0, revenue: 0 };

  return {
    store: { slug: store.slug, name: store.name, timezone: store.timezone, currency: store.currency },
    range: { key: preset, label, from: since.toISOString(), to: until.toISOString(), fromParam, toParam },
    sessions,
    catalogue,
    added: (addedRows.rows as any[]).map((r) => ({ id: String(r.id), label: String(r.label), image: r.image ?? null, price: Number(r.price), qty: Number(r.qty), carts: Number(r.carts) })),
    hours,
    cities,
    summary: {
      visitors: sessions.length,
      fromAds: sessions.filter((s) => s.source === "facebook").length,
      carted: sessions.filter((s) => s.carted).length,
      checked: sessions.filter((s) => s.checked).length,
      paid: Number(paid.n ?? 0),
      revenue: Number(paid.revenue ?? 0),
      measured: measured.length,
      medianSeconds: median(measured.map((s) => s.seconds as number)),
      medianScroll: median(measured.map((s) => s.scroll ?? 0)),
      mobile: sessions.filter((s) => s.device === "mobile").length,
      tablet: sessions.filter((s) => s.device === "tablet").length,
      desktop: sessions.filter((s) => s.device === "desktop").length,
    },
  };
}

/* ------------------------------------------------------------------ view */

type Data = Awaited<ReturnType<typeof loader>>;

function secondsLabel(s: number | null): string {
  if (s == null) return "—";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

export default function Behaviour({ loaderData }: Route.ComponentProps) {
  const { store, range, sessions, catalogue, added, hours, cities, summary } = loaderData as Data;
  const cat = catalogue as Record<string, { label: string; image: string | null }>;
  const navigate = useNavigate();
  const [from, setFrom] = useState(range?.fromParam ?? "");
  const [to, setTo] = useState(range?.toParam ?? "");

  if (!store || !range || !summary) {
    return (
      <div style={{ maxWidth: 640, margin: "40px auto", ...card }}>
        <Empty title="No store yet" help="Create a store first." />
      </div>
    );
  }
  const suffix = `?store=${store.slug}`;
  const go = (params: Record<string, string>) => navigate(`/admin/analytics/behavior${suffix}&${new URLSearchParams(params)}`);

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", display: "grid", gap: 16 }}>
      <style>{`
        @keyframes tb-dash{from{transform:translateX(0);opacity:0}15%{opacity:1}to{transform:translateX(34px);opacity:0}}
        .tb-pill{height:30px;padding:0 12px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--ink);font-size:13px;font-weight:550;cursor:pointer}
        .tb-pill[aria-pressed="true"]{background:var(--ink);color:var(--surface);border-color:var(--ink)}
        .tb-date{height:30px;padding:0 8px;border-radius:8px;border:1px solid var(--input-border);background:var(--input);color:var(--ink);font-size:13px}
        .tb-chip{display:inline-flex;align-items:center;height:20px;padding:0 7px;border-radius:6px;font-size:11px;font-weight:600;background:var(--bg);color:var(--ink-2)}
        .tb-chip.on{background:var(--b-success-bg);color:var(--b-success-fg)}
        .tb-chip.pay{background:var(--ink);color:var(--surface)}
        .tb-table{width:100%;border-collapse:collapse;font-size:13px}
        .tb-table th{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);text-align:left;padding:8px 10px;border-bottom:1px solid var(--border);font-weight:600}
        .tb-table td{padding:9px 10px;border-bottom:1px solid var(--border);vertical-align:middle;white-space:nowrap}
        .tb-num{font-variant-numeric:tabular-nums}
        @media (prefers-reduced-motion:reduce){.tb-dot{animation:none!important}}
      `}</style>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 4 }}>
            <Link to={`/admin/analytics${suffix}`} style={{ color: "inherit" }}>Analytics</Link> › Tracking behaviour
          </div>
          <h1 style={{ margin: 0, fontSize: 20, lineHeight: "28px", fontWeight: 650 }}>Tracking behaviour</h1>
          <div style={{ fontSize: 13, color: "var(--ink-2)" }}>{range.label} · store time {store.timezone}</div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {Object.entries(PRESETS).map(([key, p]) => (
            <button key={key} className="tb-pill" aria-pressed={range.key === key} onClick={() => go({ range: key })}>{p.label}</button>
          ))}
          <input className="tb-date" type="date" id="tb-from" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
          <span style={{ color: "var(--ink-3)" }}>→</span>
          <input className="tb-date" type="date" id="tb-to" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
          <button className="tb-pill" aria-pressed={range.key === "custom"} disabled={!from || !to} onClick={() => go({ range: "custom", from, to })}>Apply</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        {[
          ["Visitors", String(summary.visitors), `${summary.fromAds} from ads`],
          ["Added to cart", String(summary.carted), summary.visitors ? `${Math.round((summary.carted / summary.visitors) * 100)}% of visitors` : "—"],
          ["Reached checkout", String(summary.checked), ""],
          ["Paid", String(summary.paid), summary.paid ? formatMoney(summary.revenue, store.currency) : "no orders"],
          ["Median time", secondsLabel(summary.medianSeconds), summary.measured ? `${summary.measured} measured` : "heartbeat starts now"],
          ["Median scroll", summary.medianScroll == null ? "—" : `${summary.medianScroll}%`, "of the page"],
        ].map(([label, value, sub]) => (
          <div key={label} style={{ ...card, padding: "12px 14px" }}>
            <div style={{ fontSize: 12, color: "var(--ink-2)" }}>{label}</div>
            <div className="tb-num" style={{ fontSize: 26, fontWeight: 650, lineHeight: 1.2 }}>{value}</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{sub}</div>
          </div>
        ))}
      </div>

      <WorldMap sessions={sessions} timezone={store.timezone} />

      <div style={{ ...card, padding: 16 }}>
        <div style={{ fontSize: 12, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 600, marginBottom: 12 }}>The path</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 22 }}>
          {[
            ["Landed", summary.visitors, `${summary.mobile} phone · ${summary.tablet} tablet · ${summary.desktop} desktop`],
            ["Added to cart", summary.carted, `${added.reduce((n, a) => n + a.qty, 0)} items in ${added.reduce((n, a) => n + a.carts, 0)} carts`],
            ["Reached checkout", summary.checked, summary.carted ? `${Math.round((summary.checked / summary.carted) * 100)}% of carts` : ""],
            ["Paid", summary.paid, summary.checked ? `${Math.round((summary.paid / summary.checked) * 100)}% of checkouts` : ""],
          ].map(([label, n, sub], i) => (
            <div key={String(label)} style={{ position: "relative", padding: "12px 14px", background: "var(--bg)", borderRadius: 12 }}>
              <div style={{ fontSize: 12, color: "var(--ink-2)" }}>{label}</div>
              <div className="tb-num" style={{ fontSize: 30, fontWeight: 650, lineHeight: 1.1 }}>{n}</div>
              <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{sub}</div>
              {i < 3 ? (
                <span aria-hidden style={{ position: "absolute", right: -18, top: 30, width: 14, height: 2, background: "var(--border)" }}>
                  <i className="tb-dot" style={{ position: "absolute", top: -3, left: -10, width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", animation: "tb-dash 1.5s linear infinite" }} />
                </span>
              ) : null}
              {i === 1 && added.length ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                  {added.map((a) => (
                    <div key={a.id} title={`${a.label} · ${a.qty} in ${a.carts} cart${a.carts === 1 ? "" : "s"}`} style={{ width: 72 }}>
                      <div style={{ width: 72, height: 72, borderRadius: 12, overflow: "hidden", background: "#fff", border: "1px solid var(--border)", position: "relative" }}>
                        {a.image ? <img src={a.image} alt={a.label} style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : null}
                        <span className="tb-num" style={{ position: "absolute", right: 4, top: 4, fontSize: 11, fontWeight: 700, background: "var(--ink)", color: "var(--surface)", borderRadius: 6, padding: "1px 5px" }}>{a.qty}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--ink-2)", lineHeight: 1.25, marginTop: 4 }}>{a.label}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
        <div style={{ ...card, padding: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>When they arrived</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 12 }}>Visitors per hour, {store.timezone}</div>
          <Bars values={hours} labels={Array.from({ length: 24 }, (_, i) => (i % 3 === 0 ? String(i).padStart(2, "0") : ""))} />
        </div>
        <div style={{ ...card, padding: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>How long they stayed</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 12 }}>Seconds with the tab open, from the heartbeat</div>
          <Buckets sessions={sessions} />
        </div>
        <div style={{ ...card, padding: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>Where</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 12 }}>By city</div>
          <div style={{ display: "grid", gap: 4 }}>
            {cities.map((c) => (
              <div key={c.city} style={{ display: "grid", gridTemplateColumns: "1fr auto", fontSize: 13, padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                <span>{c.city}{c.country ? <span style={{ color: "var(--ink-3)" }}> · {c.country}</span> : null}</span>
                <span className="tb-num">{c.n}</span>
              </div>
            ))}
            {!cities.length ? <div style={{ color: "var(--ink-3)", fontSize: 13 }}>Nobody in this window.</div> : null}
          </div>
        </div>
      </div>

      <div style={{ ...card }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontWeight: 600 }}>Sessions</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>latest {Math.min(sessions.length, 80)} of {sessions.length}</div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="tb-table">
            <thead>
              <tr><th>Arrived</th><th>Who</th><th>Where</th><th>Device</th><th>Source</th><th>Path</th><th>In the bag</th><th>Time</th><th>Scroll</th><th>Views</th></tr>
            </thead>
            <tbody>
              {sessions.slice(0, 80).map((s) => (
                <tr key={s.sid}>
                  <td className="tb-num">{new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric", timeZone: store.timezone }).format(new Date(s.first))}</td>
                  <td>{s.email ? <span>{s.name ? <b style={{ fontWeight: 600 }}>{s.name} </b> : null}<span style={{ color: "var(--ink-2)" }}>{s.email}</span></span> : <span style={{ color: "var(--ink-3)" }}>no email yet</span>}</td>
                  <td>{s.city ?? "—"}{s.country ? <span style={{ color: "var(--ink-3)" }}> {s.country}</span> : null}</td>
                  <td>{s.device ?? "—"}</td>
                  <td>{s.source ?? <span style={{ color: "var(--ink-3)" }}>direct</span>}</td>
                  <td style={{ display: "flex", gap: 4 }}>
                    <span className="tb-chip on">Landed</span>
                    <span className={`tb-chip${s.carted ? " on" : ""}`}>Cart</span>
                    <span className={`tb-chip${s.checked ? " on" : ""}`}>Checkout</span>
                    <span className={`tb-chip${s.paid ? " pay" : ""}`}>Paid</span>
                  </td>
                  <td>
                    {s.added.length ? (
                      <span style={{ display: "inline-flex", gap: 4 }}>
                        {s.added.map((id) => (
                          <span key={id} title={cat[id]?.label ?? id} style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid var(--border)", background: "#fff", overflow: "hidden", display: "inline-block" }}>
                            {cat[id]?.image ? <img src={cat[id].image!} alt={cat[id].label} style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : null}
                          </span>
                        ))}
                      </span>
                    ) : <span style={{ color: "var(--ink-3)" }}>—</span>}
                  </td>
                  <td className="tb-num">{secondsLabel(s.seconds)}</td>
                  <td className="tb-num">{s.scroll == null ? "—" : `${s.scroll}%`}</td>
                  <td className="tb-num">{s.views}</td>
                </tr>
              ))}
              {!sessions.length ? <tr><td colSpan={10} style={{ color: "var(--ink-3)", padding: 24, textAlign: "center" }}>No visitors in this window.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Bars({ values, labels }: { values: number[]; labels: string[] }) {
  const max = Math.max(1, ...values);
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${values.length}, 1fr)`, gap: 3, alignItems: "end", height: 110 }}>
        {values.map((v, i) => (
          <div key={i} title={`${labels[i] || String(i).padStart(2, "0")}:00 · ${v}`} style={{ height: Math.max(2, Math.round((v / max) * 110)), background: v ? "var(--accent)" : "var(--border)", borderRadius: "3px 3px 0 0" }} />
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${values.length}, 1fr)`, gap: 3, fontSize: 10, color: "var(--ink-3)", marginTop: 4 }} className="tb-num">
        {labels.map((l, i) => <span key={i}>{l}</span>)}
      </div>
    </div>
  );
}

function Buckets({ sessions }: { sessions: SessionRow[] }) {
  const measured = sessions.filter((s) => s.seconds != null) as (SessionRow & { seconds: number })[];
  const buckets: [string, (s: number) => boolean][] = [
    ["under 10 s", (s) => s < 10],
    ["10 – 30 s", (s) => s >= 10 && s < 30],
    ["30 s – 1 min", (s) => s >= 30 && s < 60],
    ["1 – 3 min", (s) => s >= 60 && s < 180],
    ["over 3 min", (s) => s >= 180],
  ];
  const counts = buckets.map(([label, f]) => [label, measured.filter((s) => f(s.seconds)).length] as const);
  const max = Math.max(1, ...counts.map(([, n]) => n));
  const unmeasured = sessions.length - measured.length;
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {counts.map(([label, n]) => (
        <div key={label} style={{ display: "grid", gridTemplateColumns: "110px 1fr 36px", gap: 10, alignItems: "center", fontSize: 13 }}>
          <span>{label}</span>
          <span style={{ height: 10, borderRadius: 5, background: "var(--accent)", width: `${Math.round((n / max) * 100)}%`, minWidth: n ? 6 : 0, opacity: n ? 1 : 0 }} />
          <span className="tb-num" style={{ textAlign: "right" }}>{n}</span>
        </div>
      ))}
      <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>
        {measured.length ? `${measured.length} sessions measured` : "No heartbeat data yet in this window"}{unmeasured ? ` · ${unmeasured} arrived before measuring began or left before the first beat` : ""}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- map */

const BLUE = "#3B7BFF";
const YELLOW = "#F5C518";
const GOLD = "#C9A227";

/**
 * Where the visitors are, framed on the market the store actually sells to.
 *
 * The same hexagons either way — this is a zoom, not invented detail. Anyone
 * outside the frame is still counted and said out loud underneath, so a
 * narrower view never quietly hides a visitor.
 */
const VIEWS = {
  us: { label: "United States", inSentence: "the United States", lon: [-133, -60] as const, lat: [23, 51] as const },
  americas: { label: "Americas", inSentence: "the Americas", lon: [-172, -28] as const, lat: [-56, 74] as const },
  world: { label: "World", inSentence: "this view", lon: [-180, 180] as const, lat: [-58, 84] as const },
};
type ViewKey = keyof typeof VIEWS;

function WorldMap({ sessions, timezone }: { sessions: SessionRow[]; timezone: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  /**
   * Opens on the market the store sells to. But a map with nothing on it
   * teaches nobody anything, so when the United States has no visitors and
   * somewhere else does, it opens wide instead. Only the first render decides
   * this — once someone has chosen a view, it is theirs.
   */
  const [view, setView] = useState<ViewKey>(() => {
    const us = VIEWS.us;
    let here = 0;
    let anywhere = 0;
    for (const s of sessions) {
      if (s.lat == null || s.lon == null) continue;
      anywhere += 1;
      if (s.lon >= us.lon[0] && s.lon <= us.lon[1] && s.lat >= us.lat[0] && s.lat <= us.lat[1]) here += 1;
    }
    return here === 0 && anywhere > 0 ? "world" : "us";
  });

  // Visitors onto tiles, once per data change. World space is fixed; the view
  // only changes how much of it the canvas shows.
  const lit = useMemo(() => {
    const { cols, rows, lon0, lon1, lat0, lat1 } = world as { cols: number; rows: number; lon0: number; lon1: number; lat0: number; lat1: number; cells: number[][] };
    const W = 1000;
    const H = (W * (lat1 - lat0)) / (lon1 - lon0);
    const R = W / (cols * Math.sqrt(3));
    const dx = R * Math.sqrt(3);
    const dy = R * 1.5;
    const map = new Map<string, { r: number; c: number; n: number; cart: number; paid: number; city: string | null; lon: number; lat: number; arrivals: number[]; cartAt: number[]; paidAt: number[] }>();
    const ordered = sessions.slice().sort((a, b) => a.first.localeCompare(b.first));
    ordered.forEach((s) => {
      if (s.lat == null || s.lon == null) return;
      const x = ((s.lon - lon0) / (lon1 - lon0)) * W;
      const y = ((lat1 - s.lat) / (lat1 - lat0)) * H;
      const r = Math.round(y / dy);
      const c = Math.round((x - (r % 2 ? dx / 2 : 0)) / dx);
      const key = `${r}:${c}`;
      const cur = map.get(key) ?? { r, c, n: 0, cart: 0, paid: 0, city: s.city, lon: s.lon, lat: s.lat, arrivals: [], cartAt: [], paidAt: [] };
      const at = Date.parse(s.first);
      cur.n += 1;
      cur.arrivals.push(at);
      if (s.carted) { cur.cart += 1; cur.cartAt.push(Date.parse(s.last)); }
      if (s.paid) { cur.paid += 1; cur.paidAt.push(Date.parse(s.last)); }
      map.set(key, cur);
    });
    const times = ordered.map((s) => Date.parse(s.first));
    const start = times.length ? Math.min(...times) : Date.now();
    const end = times.length ? Math.max(...ordered.map((s) => Date.parse(s.last))) : Date.now();
    return { map, W, H, R, dx, dy, rows, lon0, lon1, lat0, lat1, total: ordered.length, start, end };
  }, [sessions]);

  // How much of the world this view shows, in world-space pixels.
  const frame = useMemo(() => {
    const v = VIEWS[view];
    const { W, H, lon0, lon1, lat0, lat1 } = lit;
    const x0 = ((v.lon[0] - lon0) / (lon1 - lon0)) * W;
    const x1 = ((v.lon[1] - lon0) / (lon1 - lon0)) * W;
    const y0 = ((lat1 - v.lat[1]) / (lat1 - lat0)) * H;
    const y1 = ((lat1 - v.lat[0]) / (lat1 - lat0)) * H;
    const scale = 1000 / (x1 - x0);
    return { x0, y0, scale, cw: 1000, ch: (y1 - y0) * scale };
  }, [lit, view]);

  // Visitors the current frame cannot show. Said out loud rather than dropped.
  const outside = useMemo(() => {
    const v = VIEWS[view];
    let n = 0;
    for (const cell of lit.map.values()) {
      if (cell.lon < v.lon[0] || cell.lon > v.lon[1] || cell.lat < v.lat[0] || cell.lat > v.lat[1]) n += cell.n;
    }
    return n;
  }, [lit, view]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { map, R, dx, dy, start, end } = lit;
    const { x0, y0, scale, cw, ch } = frame;
    const dpr = Math.min(2, typeof devicePixelRatio === "number" ? devicePixelRatio : 1);
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const land = (world as { cells: number[][] }).cells;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Hexes are drawn a touch under their true size so the gaps between them
    // read as a grid rather than a solid mass — and the gap has to hold at
    // every zoom, so it scales with the tiles.
    const gap = 0.35 / scale;
    let t = 0;
    let raf = 0;
    const hex = (x: number, y: number, r: number, fill: string) => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 180) * (60 * i - 30);
        ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
      }
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    };
    // The replay runs on the real clock of the window: 24 seconds of screen
    // time for the whole span, arrivals appearing at their true moment, a
    // ring spreading out from each new one, then the tile settles and
    // breathes. The clock in the corner shows the replayed time.
    const LOOP = 24 * 60;
    const t0 = start;
    const t1 = Math.max(start + 1, end);
    const clock = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", timeZone: timezone });
    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, -x0 * scale * dpr, -y0 * scale * dpr);

      const grey = css("--border") || "#e5e5e5";
      for (const [r, c] of land) {
        const x = c * dx + (r % 2 ? dx / 2 : 0);
        const y = r * dy;
        // Only what the frame can see, so a zoomed view costs no more to draw.
        if (x < x0 - dx || x > x0 + cw / scale + dx || y < y0 - dy || y > y0 + ch / scale + dy) continue;
        hex(x, y, R - gap, grey);
      }

      const frac = reduce ? 1 : (t % LOOP) / LOOP;
      const nowMs = t0 + frac * (t1 - t0);
      for (const cell of map.values()) {
        const x = cell.c * dx + (cell.r % 2 ? dx / 2 : 0);
        const y = cell.r * dy;
        const seen = cell.arrivals.filter((ms) => ms <= nowMs);
        if (!seen.length) continue;
        const n = seen.length;
        const carted = cell.cartAt.some((ms) => ms <= nowMs);
        const paid = cell.paidAt.some((ms) => ms <= nowMs);
        const colour = paid ? GOLD : carted ? YELLOW : BLUE;
        const latest = seen[seen.length - 1];
        const age = ((nowMs - latest) / (t1 - t0)) * LOOP;
        if (!reduce && age < 72) {
          ctx.globalAlpha = 0.45 * (1 - age / 72);
          ctx.lineWidth = 1.4 / scale;
          ctx.strokeStyle = colour;
          ctx.beginPath();
          // The ring spreads by screen pixels, not world pixels. Left in world
          // units it grew with the zoom, so on the United States view one
          // arrival threw a hexagon the size of three states.
          const rr = R + (age * 0.35) / scale;
          for (let i = 0; i < 6; i++) { const a = (Math.PI / 180) * (60 * i - 30); ctx.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a)); }
          ctx.closePath();
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        const breathe = reduce ? 0 : 0.5 + 0.5 * Math.sin(t / 30 + cell.r * 0.4);
        const size = Math.min(R * 2.2, R * 0.9 + (Math.log2(n + 1) * 1.3 + breathe * 0.8) / scale);
        // A live tile glows. It is what separates "someone is there right now"
        // from "this pixel is a different colour".
        ctx.shadowColor = colour;
        ctx.shadowBlur = (10 + breathe * 6) / scale;
        hex(x, y, size, colour);
        ctx.shadowBlur = 0;
      }

      // Names, drawn back in screen space so the type stays the same size at
      // every zoom. A coloured hexagon nobody can place on a map teaches
      // nothing; "Austin" does. The busiest few only, and never one on top of
      // another — a pile of overlapping labels is worse than none.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const named: { x: number; y: number }[] = [];
      const labelled = [...map.values()]
        .filter((cell) => cell.city && cell.arrivals.some((ms) => ms <= nowMs))
        .sort((a, b) => b.n - a.n)
        .slice(0, 8);
      ctx.font = "600 11px system-ui, sans-serif";
      ctx.textAlign = "left";
      for (const cell of labelled) {
        const wx = cell.c * dx + (cell.r % 2 ? dx / 2 : 0);
        const wy = cell.r * dy;
        const x = (wx - x0) * scale;
        const y = (wy - y0) * scale;
        if (x < 0 || x > cw || y < 0 || y > ch) continue;
        if (named.some((p) => Math.abs(p.x - x) < 90 && Math.abs(p.y - y) < 16)) continue;
        named.push({ x, y });
        const text = cell.city as string;
        const tx = x + R * scale + 7;
        const w = ctx.measureText(text).width;
        // A plate under the words, so a name over pale land is still readable.
        ctx.fillStyle = "rgba(255,255,255,.82)";
        ctx.beginPath();
        const rx = tx - 5;
        const ry = y - 9;
        const rw = w + 10;
        const rh = 18;
        const rr2 = 5;
        ctx.moveTo(rx + rr2, ry);
        ctx.arcTo(rx + rw, ry, rx + rw, ry + rh, rr2);
        ctx.arcTo(rx + rw, ry + rh, rx, ry + rh, rr2);
        ctx.arcTo(rx, ry + rh, rx, ry, rr2);
        ctx.arcTo(rx, ry, rx + rw, ry, rr2);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = css("--ink") || "#1c1c1e";
        ctx.fillText(text, tx, y + 4);
      }

      ctx.font = "600 12px system-ui, sans-serif";
      ctx.fillStyle = css("--ink-2") || "#666";
      ctx.textAlign = "right";
      ctx.fillText(reduce ? "" : clock.format(new Date(nowMs)), cw - 12, 18);
      ctx.textAlign = "left";
      t += 1;
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [lit, frame, timezone]);

  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = ref.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    // Screen to world: undo the frame's zoom, not just the canvas's own scale.
    const px = ((e.clientX - rect.left) / rect.width) * frame.cw;
    const py = ((e.clientY - rect.top) / rect.width) * frame.cw;
    const x = px / frame.scale + frame.x0;
    const y = py / frame.scale + frame.y0;
    let best: { d: number; text: string } | null = null;
    for (const cell of lit.map.values()) {
      const cx = cell.c * lit.dx + (cell.r % 2 ? lit.dx / 2 : 0);
      const cy = cell.r * lit.dy;
      const d = Math.hypot(cx - x, cy - y);
      if (d < (lit.R * 3) / frame.scale && (!best || d < best.d)) best = { d, text: `${cell.city ?? "Unknown"} · ${cell.n} visitor${cell.n === 1 ? "" : "s"}${cell.cart ? ` · ${cell.cart} cart` : ""}${cell.paid ? ` · ${cell.paid} paid` : ""}` };
    }
    setTip(best ? { x: e.clientX - rect.left, y: e.clientY - rect.top, text: best.text } : null);
  };

  return (
    <div style={{ ...card, position: "relative", background: "var(--surface)" }}>
      <div style={{ position: "absolute", left: 14, top: 12, zIndex: 2, display: "flex", gap: 2, padding: 2, borderRadius: 9, background: "var(--bg)", border: "1px solid var(--border)" }}>
        {(Object.keys(VIEWS) as ViewKey[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            style={{
              border: 0,
              cursor: "pointer",
              borderRadius: 7,
              padding: "4px 10px",
              fontSize: 12,
              fontWeight: view === key ? 650 : 500,
              fontFamily: "inherit",
              background: view === key ? "var(--surface)" : "transparent",
              color: view === key ? "var(--ink)" : "var(--ink-2)",
              boxShadow: view === key ? "0 1px 2px rgba(16,20,28,.12)" : "none",
            }}
          >
            {VIEWS[key].label}
          </button>
        ))}
      </div>
      <canvas ref={ref} onMouseMove={onMove} onMouseLeave={() => setTip(null)} style={{ width: "100%", height: "auto", display: "block" }} aria-label="Visitors on a map" />
      {tip ? (
        <div style={{ position: "absolute", left: tip.x + 12, top: tip.y - 30, background: "var(--ink)", color: "var(--surface)", fontSize: 12, padding: "4px 8px", borderRadius: 6, pointerEvents: "none", whiteSpace: "nowrap" }}>{tip.text}</div>
      ) : null}
      <div style={{ position: "absolute", left: 14, bottom: 12, display: "flex", gap: 14, fontSize: 12, color: "var(--ink-2)", alignItems: "center", flexWrap: "wrap" }}>
        <span><i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: BLUE, marginRight: 6, verticalAlign: -1 }} />visitor</span>
        <span><i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: YELLOW, marginRight: 6, verticalAlign: -1 }} />added to cart</span>
        <span><i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: GOLD, marginRight: 6, verticalAlign: -1 }} />paid</span>
        {/* Not a footnote — the way to go and look at them. */}
        {outside ? (
          <button
            type="button"
            onClick={() => setView("world")}
            style={{ border: 0, background: "none", padding: 0, cursor: "pointer", font: "inherit", color: "var(--ink-2)", textDecoration: "underline", textUnderlineOffset: 3 }}
          >
            · {outside} outside {VIEWS[view].inSentence} — show them
          </button>
        ) : null}
      </div>
    </div>
  );
}

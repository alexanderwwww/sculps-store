/**
 * Shop Admin, on the phone.
 *
 * Not the admin shrunk down — the two things Alex actually opens his phone
 * for: who is on the store right now, and what today has made. It installs to
 * the home screen from Safari (Share → Add to Home Screen), opens full screen
 * with its own icon, and refreshes itself while it is open.
 *
 * It is a page rather than an App Store app on purpose: an App Store build
 * needs a developer account, a review and a release every time something
 * changes. This is on his own domain, changes when the Worker deploys, and
 * costs nothing.
 *
 *   GET /m                        the page
 *   GET /m/data                   the numbers, for the page's own refresh
 *   GET /m/manifest.webmanifest   what makes it installable
 *   GET /m/icon-180.png|512.png   the home-screen icon
 *
 * Sign-in is the admin's own: no session, no page. The installed app keeps its
 * own cookie, so he signs in once inside it.
 */
import { useEffect, useState } from "react";
import { redirect } from "react-router";
import type { Route } from "./+types/m.$";
import { requireUser } from "~/lib/auth.server";
import { resolveAdminStore, liveBoard } from "~/lib/admin.server";
import { phoneNumbers } from "~/lib/phone-board.server";

export function meta() {
  return [
    { title: "Shop" },
    { name: "viewport", content: "width=device-width,initial-scale=1,viewport-fit=cover" },
    { name: "apple-mobile-web-app-capable", content: "yes" },
    { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
    { name: "apple-mobile-web-app-title", content: "Shop" },
    { name: "theme-color", content: "#0b0b0f" },
  ];
}

export const links: Route.LinksFunction = () => [
  { rel: "manifest", href: "/m/manifest.webmanifest" },
  { rel: "apple-touch-icon", href: "/m/icon-180.png" },
];

export async function loader({ context, request }: Route.LoaderArgs) {
  const user = await requireUser(context.db, request).catch(() => null);
  if (!user) throw redirect(`/admin/login?next=${encodeURIComponent("/m")}`);

  const url = new URL(request.url);
  const { store, all } = await resolveAdminStore(context.db, url);
  if (!store) return { store: null, stores: [], numbers: null, at: Date.now() };

  const board = await liveBoard(context.db, store.id, store.timezone);
  return {
    store: { slug: store.slug, name: store.name, currency: store.currency },
    stores: all.map((s) => ({ slug: s.slug, name: s.name })),
    numbers: phoneNumbers(board, store.currency),
    at: Date.now(),
  };
}

const AGO = (ms: number) => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${Math.round(s / 3600)}h`;
};

const LABEL: Record<string, string> = {
  page_view: "looked at a page",
  product_view: "looked at a product",
  add_to_cart: "added to cart",
  checkout_start: "started checkout",
  purchase: "bought",
};

export default function Phone({ loaderData }: Route.ComponentProps) {
  const first = loaderData as {
    store: { slug: string; name: string; currency: string } | null;
    stores: { slug: string; name: string }[];
    numbers: ReturnType<typeof phoneNumbers> | null;
    at: number;
  };
  const [data, setData] = useState(first);
  const [live, setLive] = useState(true);

  /* Ten seconds while it is on screen, nothing at all when it is not: a page
     that keeps polling in a pocket is a page that eats a battery. */
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(`/m/data${data.store ? `?store=${data.store.slug}` : ""}`, { headers: { accept: "application/json" } });
        if (!res.ok) throw new Error(String(res.status));
        setData(await res.json());
        setLive(true);
      } catch {
        setLive(false);
      }
    };
    timer = setInterval(tick, 10000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [data.store?.slug]);

  const n = data.numbers;

  return (
    <div style={S.page}>
      <style>{CSS}</style>
      <header style={S.head}>
        <div>
          <div style={S.kicker}>{data.store?.name ?? "No store"}</div>
          <h1 style={S.h1}>
            <span className={live ? "dot on" : "dot"} /> {n ? `${n.live} on the store` : "—"}
          </h1>
        </div>
        {data.stores.length > 1 ? (
          <select
            style={S.pick}
            value={data.store?.slug ?? ""}
            onChange={(e) => { window.location.href = `/m?store=${e.target.value}`; }}
          >
            {data.stores.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
          </select>
        ) : null}
      </header>

      {!n ? (
        <p style={S.quiet}>No store to show yet.</p>
      ) : (
        <>
          <div style={S.grid}>
            <Tile big label="Today" value={n.revenue} />
            <Tile label="Orders" value={String(n.orders)} />
            <Tile label="Sessions" value={String(n.sessions)} />
            <Tile label="Carts" value={String(n.carts)} />
            <Tile label="Checking out" value={String(n.checkingOut)} />
            <Tile label="Bought" value={String(n.purchased)} />
          </div>

          {n.where.length ? (
            <section>
              <h2 style={S.h2}>Where they are</h2>
              {n.where.map((w) => (
                <div key={w.place} style={S.row}>
                  <span style={S.grow}>{w.place}</span>
                  <span style={S.num}>{w.count}</span>
                </div>
              ))}
            </section>
          ) : null}

          <section>
            <h2 style={S.h2}>Just now</h2>
            {n.recent.length ? n.recent.map((e) => (
              <div key={e.id} style={S.row}>
                <span style={S.grow}>
                  {LABEL[e.type] ?? e.type}
                  {e.place ? <span style={S.place}> · {e.place}</span> : null}
                </span>
                <span style={S.ago}>{AGO(e.at)}</span>
              </div>
            )) : <p style={S.quiet}>Nobody on the store in the last half hour.</p>}
          </section>
        </>
      )}

      <footer style={S.foot}>
        <a style={S.link} href="/admin">Open the full admin</a>
      </footer>
    </div>
  );
}

function Tile({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div style={{ ...S.tile, ...(big ? S.tileBig : null) }}>
      <div style={S.tileLabel}>{label}</div>
      <div style={{ ...S.tileValue, ...(big ? S.tileValueBig : null) }}>{value}</div>
    </div>
  );
}

const CSS = `
  html,body{background:#0b0b0f;margin:0;-webkit-text-size-adjust:100%;}
  .dot{display:inline-block;width:10px;height:10px;border-radius:50%;
       background:rgba(255,255,255,.25);margin-right:.45rem;vertical-align:middle;}
  .dot.on{background:#39FF7A;box-shadow:0 0 10px rgba(57,255,122,.75);}
  select{-webkit-appearance:none;appearance:none;}
  a{-webkit-tap-highlight-color:transparent;}
`;

const S: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100dvh", background: "#0b0b0f", color: "#f5f5f7",
    font: "16px/1.45 -apple-system,BlinkMacSystemFont,'SF Pro Text',system-ui,sans-serif",
    padding: "calc(env(safe-area-inset-top) + 1.1rem) 1.1rem calc(env(safe-area-inset-bottom) + 2rem)",
  },
  head: { display: "flex", alignItems: "flex-start", gap: ".75rem", marginBottom: "1.2rem" },
  kicker: { fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", color: "rgba(235,235,245,.5)" },
  h1: { fontSize: 24, margin: ".15rem 0 0", letterSpacing: "-.02em", fontWeight: 650 },
  pick: {
    marginLeft: "auto", background: "rgba(120,120,128,.24)", color: "#f5f5f7",
    border: "none", borderRadius: 10, padding: ".45rem .6rem", fontSize: 14,
  },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".6rem", margin: "0 0 1.6rem" },
  tile: { background: "rgba(120,120,128,.16)", borderRadius: 16, padding: ".85rem .95rem" },
  tileBig: { gridColumn: "1 / -1", background: "rgba(57,255,122,.12)" },
  tileLabel: { fontSize: 12, color: "rgba(235,235,245,.6)", letterSpacing: ".04em", textTransform: "uppercase" },
  tileValue: { fontSize: 22, fontWeight: 650, marginTop: ".2rem", letterSpacing: "-.02em" },
  tileValueBig: { fontSize: 34 },
  h2: { fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", color: "rgba(235,235,245,.5)", margin: "1.4rem 0 .4rem" },
  row: { display: "flex", alignItems: "center", gap: ".6rem", padding: ".55rem 0", borderBottom: "1px solid rgba(255,255,255,.07)", fontSize: 15 },
  grow: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  place: { color: "rgba(235,235,245,.5)" },
  num: { color: "rgba(235,235,245,.7)", fontVariantNumeric: "tabular-nums" },
  ago: { color: "rgba(235,235,245,.45)", fontVariantNumeric: "tabular-nums", fontSize: 13 },
  quiet: { color: "rgba(235,235,245,.5)", fontSize: 15 },
  foot: { marginTop: "2rem", paddingTop: "1rem", borderTop: "1px solid rgba(255,255,255,.07)" },
  link: { color: "#39FF7A", textDecoration: "none", fontSize: 15 },
};

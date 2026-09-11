/**
 * Home.
 *
 * Not an analytics screen. Analytics has the chart, the metric strip and the
 * breakdowns, and they were removed from here rather than duplicated: this
 * screen answers "is my store alive, and what do I do next".
 *
 * Three things, in order: a small live strip (sessions, live visitors, revenue
 * today) with smooth sparklines; the real storefront rendered in a tilted card;
 * and the work that is actually waiting. The material is the shared glass in
 * `app/admin/admin.css` — `k-ground` behind, `k-glass` on the panels — nothing
 * invented here.
 *
 * Every figure comes from the loader. Nothing on this screen is a placeholder:
 * a metric with no traffic shows its zero and draws no line, and the headline
 * says what is actually true of the store, never that it is open when it is not.
 */
import { InstallCard } from "~/admin/install-card";
import { Link } from "react-router";
import { eq, sql } from "drizzle-orm";
import type { Route } from "./+types/admin._index";
import { requireUser } from "~/lib/auth.server";
import { resolveAdminStore, todos, liveBoard } from "~/lib/admin.server";
import { domains, paymentProviders, products, themes } from "~/db/schema";
import { money0 } from "~/lib/money";
import { card, Empty, primaryButton } from "~/admin/ui";
import { useIsMobile } from "~/admin/use-mobile";
import { Sparkline } from "~/admin/sparkline";
import { StorePreview } from "~/admin/store-preview";

export function meta() {
  return [{ title: "Home — Shop Admin" }];
}

/** Ten three-minute buckets over the last half hour, from real events only. */
const BUCKETS = 10;
const SPAN_MS = 30 * 60_000;

function bucketOf(at: number, end: number): number | null {
  const age = end - at;
  if (age < 0 || age > SPAN_MS) return null;
  return Math.min(BUCKETS - 1, Math.floor(((SPAN_MS - age) / SPAN_MS) * BUCKETS));
}

export async function loader({ context, request }: Route.LoaderArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);

  if (!store) {
    return { store: null, live: null, todo: [], state: null, next: [] };
  }

  const [board, todo, productRows, domainRows, providerRows, themeRows] = await Promise.all([
    liveBoard(context.db, store.id),
    todos(context.db, store.id),
    context.db
      .select({ status: products.status, n: sql<number>`cast(count(*) as int)` })
      .from(products)
      .where(eq(products.storeId, store.id))
      .groupBy(products.status),
    context.db.select().from(domains).where(eq(domains.storeId, store.id)),
    context.db.select().from(paymentProviders).where(eq(paymentProviders.storeId, store.id)),
    context.db.select().from(themes).where(eq(themes.storeId, store.id)),
  ]);

  // Sessions: a session counted in the bucket it first appeared in.
  // Live visitors: sessions with any event inside the bucket — two different
  // questions, so two different series, both counted off the same real rows.
  const end = Date.now();
  const started = new Map<string, number>();
  const perBucket: Set<string>[] = Array.from({ length: BUCKETS }, () => new Set<string>());
  const revenue = new Array<number>(BUCKETS).fill(0);

  for (const event of board.recent) {
    const at = new Date(event.at).getTime();
    const index = bucketOf(at, end);
    if (index === null) continue;
    perBucket[index].add(event.sessionId);
    const first = started.get(event.sessionId);
    if (first === undefined || at < first) started.set(event.sessionId, at);
    if (event.type === "purchase") revenue[index] += event.amountCents ?? 0;
  }

  const sessionSeries = new Array<number>(BUCKETS).fill(0);
  for (const at of started.values()) {
    const index = bucketOf(at, end);
    if (index !== null) sessionSeries[index] += 1;
  }
  const visitorSeries = perBucket.map((set) => set.size);

  const productCount = productRows.reduce((total, row) => total + row.n, 0);
  const activeProducts = productRows.find((row) => row.status === "active")?.n ?? 0;
  const primaryDomain = domainRows.find((d) => d.isPrimary) ?? domainRows[0] ?? null;
  const connectedProvider = providerRows.find((p) => p.connectedAt !== null) ?? null;
  const liveTheme = themeRows.find((t) => t.isLive) ?? null;

  // What is left to do before the store can take money, read off the same
  // rows. An item is only listed when it is genuinely outstanding.
  const next: { label: string; to: string }[] = [];
  if (!activeProducts) next.push({ label: "Add a product and set it active", to: "/admin/products" });
  if (!connectedProvider) next.push({ label: "Connect Stripe so the store can take payment", to: "/admin/settings?pane=payments" });
  if (!primaryDomain || primaryDomain.status !== "connected")
    next.push({ label: "Connect your domain", to: "/admin/settings?pane=domains" });
  if (store.passwordEnabled)
    next.push({ label: "Turn the storefront password off to open the store", to: "/admin/online-store?pane=preferences" });
  if (!liveTheme) next.push({ label: "Publish a theme", to: "/admin/online-store" });

  return {
    store: { slug: store.slug, name: store.name, currency: store.currency, domain: store.domain },
    live: {
      sessionsToday: board.sessionsToday,
      activeVisitors: board.activeVisitors,
      revenueToday: board.revenueToday,
      ordersToday: board.ordersToday,
      sessionSeries,
      visitorSeries,
      revenueSeries: revenue,
    },
    state: {
      open: activeProducts > 0 && !store.passwordEnabled && !!liveTheme,
      passwordOn: store.passwordEnabled,
      activeProducts,
      productCount,
      hasLiveTheme: !!liveTheme,
    },
    todo,
    next,
  };
}

const TODO_TONE: Record<number, { bg: string; fg: string }> = {
  0: { bg: "var(--b-warning-bg)", fg: "var(--b-warning-fg)" },
  1: { bg: "var(--b-purple-bg)", fg: "var(--b-purple-fg)" },
};

/** What is true of the store right now, in one line. Never "open" on a guess. */
function headlineFor(name: string, state: NonNullable<Awaited<ReturnType<typeof loader>>["state"]>) {
  if (state.open) return `${name} is open for business`;
  if (!state.productCount) return `${name} has nothing to sell yet`;
  if (!state.activeProducts) return `${name} has no active product`;
  if (state.passwordOn) return `${name} is behind a password`;
  if (!state.hasLiveTheme) return `${name} has no published theme`;
  return `${name} is not open yet`;
}

export default function AdminHome({ loaderData }: Route.ComponentProps) {
  const { store, live, state, todo, next } = loaderData;
  const isMobile = useIsMobile();

  if (!store || !live || !state) {
    return (
      <div style={{ maxWidth: 640, margin: "60px auto" }}>
        <div style={card}>
          <Empty
            title="No stores yet"
            help="A store is the thing everything else hangs off — orders, products, the storefront, its own Stripe account and its own domain. Create the first one to get going."
            action={
              <Link to="/admin/stores/new" style={{ ...primaryButton, height: 34, textDecoration: "none" }}>
                Create your first store
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  const tiles = [
    {
      key: "sessions",
      label: "Sessions today",
      value: live.sessionsToday.toLocaleString(),
      series: live.sessionSeries,
      live: false,
    },
    {
      key: "visitors",
      label: "Live visitors",
      value: live.activeVisitors.toLocaleString(),
      series: live.visitorSeries,
      live: true,
    },
    {
      key: "revenue",
      label: "Revenue today",
      value: money0(live.revenueToday, store.currency),
      series: live.revenueSeries,
      live: false,
    },
  ];

  return (
    <div
      className="k-ground"
      style={{
        borderRadius: 24,
        padding: isMobile ? "18px 14px 26px" : "26px 24px 34px",
        maxWidth: 1200,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      {/* The live strip: small numbers, at the top, where he looks first. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0,1fr))",
          gap: 12,
        }}
      >
        {tiles.map((tile) => (
          <div
            key={tile.key}
            className="k-glass k-glass--tight k-glass--flat"
            style={{ padding: "12px 14px 13px", minWidth: 0 }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                fontWeight: 550,
                color: "var(--ink-2)",
              }}
            >
              {tile.live ? (
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "#22C55E",
                    flex: "none",
                    animation: "kPulse 1.8s ease-out infinite",
                  }}
                />
              ) : null}
              {tile.label}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "space-between",
                gap: 10,
                marginTop: 4,
              }}
            >
              <span
                style={{
                  fontSize: 22,
                  lineHeight: "28px",
                  fontWeight: 650,
                  letterSpacing: "-.02em",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {tile.value}
              </span>
              <Sparkline series={tile.series} width={62} height={20} />
            </div>
          </div>
        ))}
      </div>

      {/* The store itself, and what it is doing. */}
      <div
        className="k-glass"
        style={{
          padding: isMobile ? "22px 18px 30px" : "30px 28px 34px",
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1fr) 460px",
          gap: isMobile ? 30 : 28,
          alignItems: "center",
        }}
      >
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
          <h1
            style={{
              margin: 0,
              fontSize: isMobile ? 26 : 32,
              lineHeight: 1.15,
              fontWeight: 650,
              letterSpacing: "-.02em",
            }}
          >
            {headlineFor(store.name, state)}
          </h1>
          <div style={{ color: "var(--ink-2)", fontSize: 14, lineHeight: "20px" }}>
            {live.ordersToday
              ? `${live.ordersToday} order${live.ordersToday === 1 ? "" : "s"} today · ${live.sessionsToday.toLocaleString()} session${live.sessionsToday === 1 ? "" : "s"}`
              : `${live.sessionsToday.toLocaleString()} session${live.sessionsToday === 1 ? "" : "s"} today · no orders yet`}
          </div>

          {next.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 2 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)" }}>Next</div>
              {next.map((item) => (
                <Link
                  key={item.to}
                  to={`${item.to}${item.to.includes("?") ? "&" : "?"}store=${store.slug}`}
                  className="k-glass k-glass--tight k-glass--flat k-lift"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 14px",
                    color: "var(--ink)",
                    textDecoration: "none",
                    fontWeight: 550,
                    fontSize: 13,
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0 }}>{item.label}</span>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--ink-2)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}>
                    <path d="m6 4 4 4-4 4" />
                  </svg>
                </Link>
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link
                to={`/admin/live?store=${store.slug}`}
                style={{ ...primaryButton, height: 34, textDecoration: "none" }}
              >
                Open Live View
              </Link>
              <a
                href={`/?store=${store.slug}`}
                target="_blank"
                rel="noreferrer"
                className="k-glass k-glass--tight k-glass--flat k-lift"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  height: 34,
                  padding: "0 14px",
                  color: "var(--ink)",
                  textDecoration: "none",
                  fontWeight: 550,
                  fontSize: 13,
                }}
              >
                View store
              </a>
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: isMobile ? "center" : "flex-end", minWidth: 0 }}>
          <StorePreview slug={store.slug} title={`${store.name} storefront`} />
        </div>
      </div>

      {/* The work waiting. Real rows out of `todos`, in the glass. */}
      {/* The admin as an app — install it from here. */}
      {!isMobile ? <InstallCard /> : null}

      <div className="k-glass" style={{ overflow: "hidden" }}>
        <div
          style={{
            padding: "13px 18px",
            fontWeight: 650,
            borderBottom: "1px solid rgba(255,255,255,.6)",
          }}
        >
          Things to do
        </div>
        {todo.length === 0 ? (
          <div
            style={{
              padding: "26px 18px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              textAlign: "center",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--ink-3)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 10.5 8 14.5 16 5.5" />
            </svg>
            <div style={{ fontWeight: 600 }}>Nothing to do</div>
            <div style={{ color: "var(--ink-2)" }}>
              Orders needing a supplier order or tracking number show up here.
            </div>
          </div>
        ) : null}
        {todo.map((item, index) => {
          const tone = TODO_TONE[index] ?? TODO_TONE[0];
          return (
            <Link
              key={item.to}
              to={`${item.to}&store=${store.slug}`}
              className="k-hover"
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 18px",
                border: 0,
                borderBottom: "1px solid rgba(255,255,255,.6)",
                background: "transparent",
                cursor: "pointer",
                textAlign: "left",
                color: "var(--ink)",
                textDecoration: "none",
              }}
            >
              <span
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: tone.bg,
                  color: tone.fg,
                  display: "grid",
                  placeItems: "center",
                  fontWeight: 700,
                  fontSize: 13,
                  flex: "none",
                }}
              >
                {item.count}
              </span>
              <span style={{ flex: 1 }}>
                <strong style={{ fontWeight: 600 }}>{item.strong}</strong> {item.rest}
              </span>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--ink-2)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="m6 4 4 4-4 4" />
              </svg>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

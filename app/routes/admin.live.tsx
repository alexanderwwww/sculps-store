/**
 * Live View — transliterated from `design/port/live.html`.
 *
 * Every style string below is copied from the approved prototype. The globe is
 * `public/shop-globe.js`, which was signed off and is used unedited.
 *
 * Two deliberate departures, both required by the project's rules: the
 * "Simulate live traffic" button is gone, and the empty state no longer tells
 * you to press it. Everything here is a row in `events` or `orders`.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useRevalidator } from "react-router";
import type { Route } from "./+types/admin.live";
import { requireUser } from "~/lib/auth.server";
import { resolveAdminStore, liveBoard } from "~/lib/admin.server";
import { formatMoney, money0 } from "~/lib/money";
import { mountGlobe, GLOBE_TYPE, type GlobeInstance } from "~/admin/globe";

export function meta() {
  return [{ title: "Live View — Shop Admin" }];
}

export async function loader({ context, request }: Route.LoaderArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store, all } = await resolveAdminStore(context.db, url);
  if (!store) return { store: null, stores: [], board: null, now: Date.now() };

  const board = await liveBoard(context.db, store.id);
  return {
    now: Date.now(),
    store: { slug: store.slug, name: store.name, currency: store.currency },
    stores: all.map((s) => ({ slug: s.slug, name: s.name })),
    board: {
      activeVisitors: board.activeVisitors,
      sessionsToday: board.sessionsToday,
      ordersToday: board.ordersToday,
      revenueToday: board.revenueToday,
      activeCarts: board.activeCarts,
      checkingOut: board.checkingOut,
      purchased: board.purchased,
      byLocation: board.byLocation,
      recent: board.recent.map((event) => ({
        id: event.id,
        type: event.type,
        sessionId: event.sessionId,
        city: event.city,
        region: event.region,
        country: event.country,
        lat: event.lat,
        lon: event.lon,
        path: event.path,
        source: event.source,
        amountCents: event.amountCents,
        orderId: event.orderId,
        at: new Date(event.at).getTime(),
      })),
    },
  };
}

type Board = NonNullable<Route.ComponentProps["loaderData"]["board"]>;
type RecentEvent = Board["recent"][number];

/** Feed rail and dot colours, from the prototype's feed mapping. */
const EVENT_COLOR: Record<string, string> = {
  view: "#4DA3FF",
  cart: "#FF9AE0",
  checkout: "#FF57C8",
  purchase: "#FF2FB9",
  leave: "#B5B5B5",
};

const EVENT_TITLE: Record<string, string> = {
  view: "Viewing",
  cart: "Added to cart",
  checkout: "Checking out",
  purchase: "Purchased",
  leave: "Left",
};

function place(event: { city: string | null; region: string | null; country: string | null }): string {
  return [event.city, event.region].filter(Boolean).join(", ") || event.country || "Unknown location";
}

function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** The prototype's literal "Just now", made true. */
function stamp(newest: number | undefined, now: number): string {
  if (!newest) return "Waiting for a visitor";
  const seconds = Math.max(0, Math.round((now - newest) / 1000));
  if (seconds < 60) return "Just now";
  return `${Math.round(seconds / 60)} min ago`;
}

export default function LiveViewScreen({ loaderData }: Route.ComponentProps) {
  const { store, stores, board, now } = loaderData;
  const revalidator = useRevalidator();
  const navigate = useNavigate();

  const paneRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeInstance | null>(null);
  const seen = useRef(new Map<string, number>());
  const mountedAt = useRef(Date.now());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [dotsOn, setDotsOn] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [locQuery, setLocQuery] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [glassCards, setGlassCards] = useState<{ key: string; title: string; sub: string }[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.hidden) return;
      if (revalidator.state === "idle") revalidator.revalidate();
    }, 5_000);
    return () => clearInterval(timer);
  }, [revalidator]);

  useEffect(() => {
    const pane = paneRef.current;
    if (!pane || !store) return;
    let cancelled = false;
    mountGlobe(pane)
      .then((globe) => {
        if (cancelled) return;
        globe.markers.clear();
        globe.reset();
        seen.current.clear();
        globeRef.current = globe;
      })
      .catch(() => setToast("The globe could not be loaded."));
    return () => {
      cancelled = true;
    };
  }, [store?.slug]);

  useEffect(() => {
    const onChange = () => {
      setFullscreen(Boolean(document.fullscreenElement));
      requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  /** assets/sale.mp3 from the prototype, on a real purchase only. */
  const chaching = () => {
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio("/sale.mp3");
        audioRef.current.preload = "auto";
      }
      audioRef.current.currentTime = 0;
      audioRef.current.volume = 0.6;
      audioRef.current.play().catch(() => undefined);
    } catch {
      /* no audio available */
    }
  };

  useEffect(() => {
    const globe = globeRef.current;
    if (!globe || !board) return;

    const cutoff = Date.now() - 30 * 60_000;
    for (const [id, at] of seen.current) if (at < cutoff) seen.current.delete(id);

    const fresh: RecentEvent[] = [];
    for (const event of [...board.recent].reverse()) {
      if (seen.current.has(event.id)) continue;
      if (!dotsOn) continue;
      seen.current.set(event.id, event.at);
      fresh.push(event);
      if (event.lat != null && event.lon != null) {
        globe.push({
          type: GLOBE_TYPE[event.type] ?? "visitor",
          id: event.sessionId,
          lat: event.lat,
          lon: event.lon,
          city: place(event),
          amount: event.amountCents ? event.amountCents / 100 : undefined,
        });
      }
    }

    const arrived = fresh.filter((event) => event.at >= mountedAt.current);
    if (arrived.some((event) => event.type === "purchase")) chaching();

    if (arrived.length) {
      const added = arrived.slice(-3).map((event) => ({
        key: event.id,
        title: `${EVENT_TITLE[event.type] ?? event.type} · ${place(event)}`,
        sub: event.amountCents
          ? formatMoney(event.amountCents, store!.currency)
          : event.source
            ? `from ${event.source}`
            : "direct visit",
      }));
      setGlassCards((current) => [...added, ...current].slice(0, 3));
      const ids = new Set(added.map((card) => card.key));
      timers.current.push(setTimeout(() => setGlassCards((current) => current.filter((card) => !ids.has(card.key))), 3_600));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, dotsOn]);

  const knownPlaces = useMemo(() => {
    const out = new Map<string, { lat: number; lon: number }>();
    for (const event of board?.recent ?? []) {
      if (event.lat == null || event.lon == null) continue;
      const label = place(event).toLowerCase();
      if (!out.has(label)) out.set(label, { lat: event.lat, lon: event.lon });
    }
    return out;
  }, [board]);

  const searchLocation = () => {
    const globe = globeRef.current;
    const wanted = locQuery.trim().toLowerCase();
    if (!globe || !wanted) return;
    const hit = [...knownPlaces.entries()].find(([label]) => label.includes(wanted));
    if (!hit) {
      setToast(`No location matches "${locQuery}"`);
      timers.current.push(setTimeout(() => setToast(null), 2_400));
      return;
    }
    globe.lookAt(hit[1].lat, hit[1].lon);
    globe.setZoom(1.6);
  };

  if (!store || !board) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ maxWidth: 640, margin: "40px auto", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "var(--shadow)", padding: 32, textAlign: "center" }}>
          <div style={{ fontWeight: 650 }}>No store yet</div>
          <div style={{ color: "var(--ink-2)" }}>Create a store first.</div>
        </div>
      </div>
    );
  }

  const newest = board.recent[0]?.at;
  const funnel = buildFunnel(board.activeCarts, board.checkingOut, board.purchased, board.sessionsToday);
  const behaviour = [
    { label: "Active carts", value: board.activeCarts, note: board.activeCarts ? "carts with items" : "nothing yet" },
    { label: "Checking out", value: board.checkingOut, note: board.checkingOut ? "reached checkout" : "nothing yet" },
    { label: "Purchased", value: board.purchased, note: board.purchased ? "paid orders today" : "nothing yet" },
  ];
  const locMax = Math.max(1, ...board.byLocation.map((row) => row.count));
  const cards = [
    { key: "v", label: "Visitors right now", value: String(board.activeVisitors) },
    { key: "s", label: "Total sales", value: money0(board.revenueToday, store.currency) },
    { key: "e", label: "Total sessions", value: board.sessionsToday.toLocaleString() },
    { key: "o", label: "Total orders", value: String(board.ordersToday) },
  ];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "row", background: "var(--bg)", overflow: "hidden", position: "relative" }}>
      <div style={{ flex: "none", width: "clamp(360px, 30%, 580px)", minWidth: 0, overflow: "auto", padding: "20px 20px 32px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, fontSize: 20, lineHeight: "28px", fontWeight: 650, display: "inline-flex", alignItems: "center", gap: 8 }}>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="var(--ink)" strokeWidth="1.5">
              <circle cx="10" cy="10" r="7.5" />
              <path d="M2.5 10h15M10 2.5c2.5 2.4 2.5 12.6 0 15M10 2.5c-2.5 2.4-2.5 12.6 0 15" />
            </svg>
            Live View
          </h1>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--ink-2)" }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#2E90FA" }} />
            {stamp(newest, now)}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <select
            value={store.slug}
            onChange={(event) => navigate(`/admin/live?store=${event.target.value}`)}
            style={{ height: 28, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--ink)", padding: "0 8px", fontSize: 12, fontWeight: 550, boxShadow: "var(--shadow)" }}
          >
            {stores.map((option) => (
              <option key={option.slug} value={option.slug}>
                {option.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {cards.map((card) => (
            <div
              key={card.key}
              style={{
                position: "relative",
                background: "linear-gradient(180deg,#FFFFFF 0%,#FCFCFD 100%)",
                border: "1px solid var(--border)",
                borderRadius: 14,
                boxShadow: "0 1px 2px rgba(16,12,32,.05),inset 0 1px 0 rgba(255,255,255,.9)",
                padding: "14px 16px 15px",
                minWidth: 0,
                overflow: "hidden",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".01em", color: "var(--ink-2)" }}>{card.label}</div>
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10, marginTop: 6 }}>
                <span style={{ display: "inline-block", padding: "2px 2px 4px 0" }}>
                  <span style={{ fontSize: 26, lineHeight: "32px", fontWeight: 650, letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums", display: "inline-block" }}>
                    {card.value}
                  </span>
                </span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ background: "linear-gradient(180deg,#FFFFFF,#FCFCFE)", border: "1px solid var(--border)", borderRadius: 14, boxShadow: "0 1px 2px rgba(16,12,32,.05),inset 0 1px 0 rgba(255,255,255,.9)", padding: "14px 16px 16px" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)" }}>Customer behavior</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 10 }}>
            {behaviour.map((column) => (
              <div key={column.label} style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: "15px", overflowWrap: "anywhere" }}>{column.label}</span>
                </div>
                <div style={{ fontSize: 20, lineHeight: "26px", fontWeight: 650, letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums", paddingTop: 2 }}>{column.value}</div>
              </div>
            ))}
          </div>
          <div style={{ position: "relative", height: 132, marginTop: 12 }}>
            <svg viewBox="0 0 300 132" preserveAspectRatio="none" style={{ width: "100%", height: 132, display: "block" }}>
              <path d={funnel.slope} fill="#2F5CF5" opacity=".16" />
              <rect x="2" y={funnel.y0} width="94" height={funnel.h0} rx="5" fill="#2F5CF5" />
              <rect x="103" y={funnel.y1} width="94" height={funnel.h1} rx="5" fill="#2F5CF5" />
              <rect x="204" y={funnel.y2} width="94" height={funnel.h2} rx="5" fill="#2F5CF5" />
              <rect x="2" y={funnel.y0} width="94" height={funnel.sh0} rx="5" fill="rgba(255,255,255,.22)" />
              <rect x="103" y={funnel.y1} width="94" height={funnel.sh1} rx="5" fill="rgba(255,255,255,.22)" />
              <rect x="204" y={funnel.y2} width="94" height={funnel.sh2} rx="5" fill="rgba(255,255,255,.22)" />
            </svg>
            {funnel.empty ? (
              <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "var(--ink-3)", fontSize: 12, background: "linear-gradient(180deg,rgba(255,255,255,.7),#fff)" }}>
                No sessions yet — nothing to chart
              </div>
            ) : null}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 6, fontSize: 11, color: "var(--ink-3)" }}>
            {behaviour.map((column) => (
              <span key={column.label} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {column.note}
              </span>
            ))}
          </div>
        </div>

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "var(--shadow)", padding: "14px 16px 16px" }}>
          <div style={{ fontSize: 13, fontWeight: 550, borderBottom: "1px dotted var(--border-strong)", paddingBottom: 3, display: "inline-block" }}>Sessions by location</div>
          {board.byLocation.length === 0 ? (
            <div style={{ padding: "22px 0 6px", textAlign: "center", color: "var(--ink-2)" }}>No data for this date range</div>
          ) : (
            board.byLocation.map((row) => (
              <div key={row.label} style={{ marginTop: 12 }}>
                <div style={{ fontSize: 13, color: "var(--ink-2)", marginBottom: 6 }}>{row.label}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ height: 26, borderRadius: 3, background: "#2E90FA", width: `${Math.max(12, Math.round((row.count / locMax) * 100))}%`, display: "block" }} />
                  <span style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{row.count}</span>
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "var(--shadow)", padding: "14px 16px 16px" }}>
          <div style={{ fontSize: 13, fontWeight: 550, borderBottom: "1px dotted var(--border-strong)", paddingBottom: 3, display: "inline-block" }}>New vs returning customers</div>
          <div style={{ padding: "22px 0 6px", textAlign: "center", color: "var(--ink-2)" }}>No data for this date range</div>
        </div>

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "var(--shadow)", overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 650 }}>Live activity</span>
            <span style={{ fontSize: 12, color: "var(--ink-2)" }}>{board.recent.length} events</span>
          </div>
          {board.recent.length === 0 ? (
            <div style={{ padding: "30px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, textAlign: "center" }}>
              <span style={{ width: 40, height: 40, borderRadius: 10, background: "var(--bg)", display: "grid", placeItems: "center", color: "var(--ink-3)" }}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 2 4 11h5l-1 7 7-9h-5z" />
                </svg>
              </span>
              <div style={{ fontWeight: 650 }}>No activity yet</div>
              <div style={{ color: "var(--ink-2)", maxWidth: 280 }}>Visitor and order events appear here the moment the storefront gets traffic. Nothing on this screen is simulated.</div>
            </div>
          ) : (
            board.recent.slice(0, 30).map((event) => (
              <button
                key={event.id}
                onClick={() => event.orderId && navigate(`/admin/orders/${event.orderId}?store=${store.slug}`)}
                style={{
                  width: "100%",
                  display: "flex",
                  gap: 10,
                  padding: "10px 16px",
                  border: 0,
                  borderBottom: "1px solid var(--border)",
                  borderLeft: `4px solid ${EVENT_COLOR[event.type] ?? "#B5B5B5"}`,
                  cursor: event.orderId ? "pointer" : "default",
                  textAlign: "left",
                  color: "var(--ink)",
                  background: "transparent",
                  animation: "kFeed .25s ease-out",
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: EVENT_COLOR[event.type] ?? "#B5B5B5", marginTop: 6, flex: "none" }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, overflowWrap: "anywhere" }}>
                      {EVENT_TITLE[event.type] ?? event.type} · {place(event)}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--ink-2)", flex: "none", fontVariantNumeric: "tabular-nums" }}>{clock(event.at)}</span>
                  </span>
                  <span style={{ display: "block", fontSize: 12, color: "var(--ink-2)", overflowWrap: "anywhere" }}>
                    {store.name}
                    {event.path ? ` · ${event.path}` : ""}
                    {event.source ? ` · ad ${event.source}` : " · direct"}
                  </span>
                </span>
                {event.amountCents ? (
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--success)", flex: "none", fontVariantNumeric: "tabular-nums" }}>
                    {formatMoney(event.amountCents, store.currency)}
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>
      </div>

      <div style={{ position: "relative", flex: "1 1 auto", minWidth: 0, height: "auto", minHeight: 0, overflow: "hidden", background: "var(--bg)" }}>
        <div style={{ position: "absolute", left: 20, top: 20, zIndex: 8, display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none", width: 226 }}>
          {glassCards.map((card) => (
            <div key={card.key} style={{ animation: "kGlassL 3.6s cubic-bezier(.22,.8,.28,1) forwards" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  padding: "8px 10px",
                  borderRadius: 14,
                  background: "rgba(255,255,255,.62)",
                  backdropFilter: "blur(22px) saturate(190%)",
                  WebkitBackdropFilter: "blur(22px) saturate(190%)",
                  border: "1px solid rgba(255,255,255,.85)",
                  boxShadow: "0 14px 40px rgba(28,12,56,.18)",
                }}
              >
                <span style={{ width: 26, height: 26, borderRadius: 8, background: "#1A1A1A", display: "grid", placeItems: "center", flex: "none", color: "#fff", fontSize: 12, fontWeight: 700, letterSpacing: "-.02em" }}>S</span>
                <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
                  <span style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 650, color: "#14102A", lineHeight: "15px" }}>{card.title}</span>
                    <span style={{ fontSize: 11, color: "#6B6280", flex: "none" }}>now</span>
                  </span>
                  <span style={{ fontSize: 11, color: "#4A4260", lineHeight: "14px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{card.sub}</span>
                </span>
              </div>
            </div>
          ))}
        </div>

        <div ref={paneRef} style={{ position: "absolute", inset: 0 }} />

        {toast ? (
          <div style={{ position: "absolute", left: "50%", top: 60, transform: "translateX(-50%)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 9, boxShadow: "var(--shadow-lg)", padding: "6px 10px", pointerEvents: "none", whiteSpace: "nowrap", zIndex: 3 }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{toast}</div>
          </div>
        ) : null}

        <div style={{ position: "absolute", top: 16, right: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ position: "relative", display: "inline-block" }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--ink-3)" strokeWidth="1.6" strokeLinecap="round" style={{ position: "absolute", left: 10, top: 9 }}>
              <circle cx="7" cy="7" r="4.5" />
              <path d="m10.5 10.5 3 3" />
            </svg>
            <input
              value={locQuery}
              onChange={(event) => setLocQuery(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && searchLocation()}
              placeholder="Search location"
              style={{ width: 230, height: 34, padding: "0 12px 0 32px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 13, boxShadow: "var(--shadow)", color: "var(--ink)" }}
            />
          </span>

          <GlobeButton
            title={dotsOn ? "Hide visitor dots" : "Show visitor dots"}
            active={dotsOn}
            onClick={() => {
              const globe = globeRef.current;
              setDotsOn((on) => {
                if (on && globe) globe.markers.clear();
                seen.current.clear();
                return !on;
              });
            }}
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M1.8 10S4.8 5.2 10 5.2s8.2 4.8 8.2 4.8-3 4.8-8.2 4.8S1.8 10 1.8 10z" />
              <circle cx="10" cy="10" r="2.1" />
              {!dotsOn ? <path d="M3.4 16.6 16.6 3.4" /> : null}
            </svg>
          </GlobeButton>

          <GlobeButton title="Reset the view" onClick={() => globeRef.current?.reset()}>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
              <path d="M2.5 6.5 7.5 4l5 2.5L17.5 4v9.5L12.5 16l-5-2.5L2.5 16z" />
              <path d="M7.5 4v9.5M12.5 6.5V16" />
            </svg>
          </GlobeButton>

          <GlobeButton
            title={fullscreen ? "Exit full screen" : "Full screen"}
            onClick={() => {
              const wrapper = paneRef.current?.parentElement;
              if (!wrapper) return;
              if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
              else wrapper.requestFullscreen().catch(() => undefined);
            }}
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M3 8V3h5M17 8V3h-5M3 12v5h5M17 12v5h-5" />
            </svg>
          </GlobeButton>
        </div>

        <div style={{ position: "absolute", bottom: 16, right: 64, display: "flex", gap: 8 }}>
          <LegendChip color="#8B5CF6" label="Orders" />
          <LegendChip color="#2E90FA" label="Visitors right now" />
        </div>

        <div style={{ position: "absolute", bottom: 16, right: 16, display: "flex", flexDirection: "column", border: "1px solid var(--border)", borderRadius: 9, overflow: "hidden", background: "var(--surface)", boxShadow: "var(--shadow)" }}>
          <button onClick={() => globeRef.current && globeRef.current.setZoom(globeRef.current.zoom * 1.15)} title="Zoom in" className="k-hover" style={{ width: 34, height: 32, border: 0, background: "transparent", color: "var(--ink)", cursor: "pointer", display: "grid", placeItems: "center", fontSize: 16 }}>
            +
          </button>
          <button onClick={() => globeRef.current && globeRef.current.setZoom(globeRef.current.zoom / 1.15)} title="Zoom out" className="k-hover" style={{ width: 34, height: 32, border: 0, borderTop: "1px solid var(--border)", background: "transparent", color: "var(--ink)", cursor: "pointer", display: "grid", placeItems: "center", fontSize: 16 }}>
            −
          </button>
        </div>
      </div>
    </div>
  );
}

function GlobeButton({ children, title, active, onClick }: { children: React.ReactNode; title: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="k-hover"
      style={{ width: 34, height: 34, borderRadius: 9, border: "1px solid var(--border)", background: active ? "var(--accent-soft)" : "var(--surface)", color: "var(--ink)", cursor: "pointer", display: "grid", placeItems: "center", boxShadow: "var(--shadow)" }}
    >
      {children}
    </button>
  );
}

function LegendChip({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 30, padding: "0 12px", borderRadius: 15, background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow)", fontSize: 12, fontWeight: 550 }}>
      <span style={{ width: 9, height: 9, borderRadius: "50%", background: color }} />
      {label}
    </span>
  );
}

/** The prototype's own funnel arithmetic, so the bars have the same shape. */
function buildFunnel(carts: number, checkouts: number, purchases: number, sessions: number) {
  const max = Math.max(carts, checkouts, purchases, sessions, 1);
  const height = (value: number) => (value ? Math.max(58, Math.round(38 + (value / max) * (122 - 38))) : 0);
  const h0 = height(carts);
  const h1 = height(checkouts);
  const h2 = height(purchases);
  const y = (h: number) => 128 - h;
  return {
    y0: y(h0),
    h0,
    y1: y(h1),
    h1,
    y2: y(h2),
    h2,
    sh0: Math.min(10, h0),
    sh1: Math.min(10, h1),
    sh2: Math.min(10, h2),
    slope: `M2 ${y(h0)} L96 ${y(h0)} L103 ${y(h1)} L197 ${y(h1)} L204 ${y(h2)} L298 ${y(h2)} L298 128 L2 128 Z`,
    empty: !(carts || checkouts || purchases),
  };
}

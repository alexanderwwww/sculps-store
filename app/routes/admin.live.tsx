/**
 * Live View, as designed: the board on the left, the globe on the right.
 *
 * Every number and every dot is a row in the events or orders table from the
 * last thirty minutes (today, for money). There is no simulator and there
 * never will be — an empty store shows an empty planet.
 *
 * The globe is the signed-off `public/shop-globe.js`, mounted through the
 * bridge in ~/admin/globe.ts and never edited.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useRevalidator } from "react-router";
import type { Route } from "./+types/admin.live";
import { requireUser } from "~/lib/auth.server";
import { resolveAdminStore, liveBoard } from "~/lib/admin.server";
import { formatMoney } from "~/lib/money";
import { mountGlobe, GLOBE_TYPE, type GlobeInstance } from "~/admin/globe";
import { card } from "~/admin/ui";

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

type RecentEvent = NonNullable<Route.ComponentProps["loaderData"]["board"]>["recent"][number];

const EVENT_LABEL: Record<string, string> = {
  view: "Viewing",
  cart: "Added to cart",
  checkout: "Checking out",
  purchase: "Purchased",
  leave: "Left",
};

const EVENT_COLOR: Record<string, string> = {
  view: "#4DA3FF",
  cart: "#FF9AE0",
  checkout: "#FF57C8",
  purchase: "#FF2FB9",
  leave: "#B5B5B5",
};

function place(event: { city: string | null; region: string | null; country: string | null }) {
  return [event.city, event.region].filter(Boolean).join(", ") || event.country || "Unknown location";
}

function relative(ms: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - ms) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.round(seconds / 60);
  return `${minutes} min ago`;
}

const SOUND_KEY = "kerberos.live.sound";

export default function LiveViewScreen({ loaderData }: Route.ComponentProps) {
  const { store, stores, board, now } = loaderData;
  const revalidator = useRevalidator();
  const navigate = useNavigate();

  const paneRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeInstance | null>(null);
  const seen = useRef(new Map<string, number>());
  const mountedAt = useRef(Date.now());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [soundOn, setSoundOn] = useState(true);
  const [soundUnlocked, setSoundUnlocked] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [dotsOn, setDotsOn] = useState(true);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [cards, setCards] = useState<{ key: string; title: string; sub: string; amount?: string }[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SOUND_KEY);
      if (stored === "off") setSoundOn(false);
    } catch {
      /* private mode */
    }
  }, []);

  // Poll every five seconds while the tab is visible.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.hidden) return;
      if (revalidator.state === "idle") revalidator.revalidate();
    }, 5_000);
    return () => clearInterval(timer);
  }, [revalidator]);

  // Mount the globe once the pane exists.
  useEffect(() => {
    const pane = paneRef.current;
    if (!pane || !store) return;
    let cancelled = false;
    mountGlobe(pane)
      .then((globe) => {
        if (!cancelled) globeRef.current = globe;
      })
      .catch(() => setToast("The globe could not be loaded."));
    return () => {
      cancelled = true;
    };
  }, [store?.slug]);

  // Fullscreen: keep state in sync and tell the globe its box changed.
  useEffect(() => {
    const onChange = () => {
      setFullscreen(Boolean(document.fullscreenElement));
      requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const chaching = () => {
    if (!soundOn) return;
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio("/sale.mp3");
        audioRef.current.preload = "auto";
      }
      audioRef.current.currentTime = 0;
      audioRef.current.volume = 0.6;
      audioRef.current.play().catch(() => undefined);
    } catch {
      /* no audio */
    }
  };

  // Feed new rows to the globe. Oldest first, once each, never replaying the
  // sound for rows that existed before this screen was opened.
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe || !board) return;

    const cutoff = Date.now() - 30 * 60_000;
    for (const [id, at] of seen.current) if (at < cutoff) seen.current.delete(id);

    const fresh: RecentEvent[] = [];
    for (const event of [...board.recent].reverse()) {
      if (seen.current.has(event.id)) continue;
      seen.current.set(event.id, event.at);
      fresh.push(event);

      if (dotsOn && event.lat != null && event.lon != null) {
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

    const arrivedSinceMount = fresh.filter((event) => event.at >= mountedAt.current);
    if (arrivedSinceMount.some((event) => event.type === "purchase")) chaching();

    if (arrivedSinceMount.length) {
      setCards((current) =>
        [
          ...arrivedSinceMount.slice(-3).map((event) => ({
            key: event.id,
            title: `${EVENT_LABEL[event.type] ?? event.type} · ${place(event)}`,
            sub: event.source ? `from ${event.source}` : "direct visit",
            amount: event.amountCents ? formatMoney(event.amountCents, store!.currency) : undefined,
          })),
          ...current,
        ].slice(0, 3),
      );
      setTimeout(
        () => setCards((current) => current.filter((c) => !arrivedSinceMount.some((e) => e.id === c.key))),
        3_600,
      );
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
    const wanted = query.trim().toLowerCase();
    if (!globe || !wanted) return;
    const hit = [...knownPlaces.entries()].find(([label]) => label.includes(wanted));
    if (!hit) {
      setToast(`No location matches "${query}"`);
      setTimeout(() => setToast(null), 2_400);
      return;
    }
    globe.lookAt(hit[1].lat, hit[1].lon);
    globe.setZoom(1.6);
  };

  const toggleDots = () => {
    const globe = globeRef.current;
    setDotsOn((on) => {
      if (on && globe) globe.markers.clear();
      if (!on) seen.current.clear();
      return !on;
    });
  };

  const toggleFullscreen = () => {
    const wrapper = paneRef.current?.parentElement;
    if (!wrapper) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    else wrapper.requestFullscreen().catch(() => undefined);
  };

  const toggleSound = () => {
    setSoundOn((on) => {
      try {
        localStorage.setItem(SOUND_KEY, on ? "off" : "on");
      } catch {
        /* private mode */
      }
      return !on;
    });
  };

  const unlockSound = () => {
    if (soundUnlocked) return;
    try {
      audioRef.current = new Audio("/sale.mp3");
      audioRef.current.volume = 0;
      audioRef.current.play().then(() => audioRef.current?.pause()).catch(() => undefined);
    } catch {
      /* no audio */
    }
    setSoundUnlocked(true);
  };

  if (!store || !board) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ maxWidth: 640, margin: "40px auto", ...card, padding: 32, textAlign: "center" }}>
          <div style={{ fontWeight: 650 }}>No store yet</div>
          <div style={{ color: "var(--ink-2)" }}>Create a store first.</div>
        </div>
      </div>
    );
  }

  const newest = board.recent[0]?.at;
  const funnelMax = Math.max(1, board.activeCarts, board.checkingOut, board.purchased);
  const locationMax = Math.max(1, ...board.byLocation.map((row) => row.count));

  return (
    <div
      onClick={unlockSound}
      style={{ height: "100%", display: "flex", background: "var(--bg)", overflow: "hidden", position: "relative" }}
    >
      {/* ----------------------------------------------------------- board */}
      <div
        style={{
          width: "clamp(360px, 30%, 580px)",
          flex: "none",
          overflow: "auto",
          padding: "20px 20px 32px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
            <circle cx="10" cy="10" r="7.5" />
            <path d="M2.5 10h15M10 2.5c2.6 2.4 2.6 12.6 0 15M10 2.5c-2.6 2.4-2.6 12.6 0 15" />
          </svg>
          <h1 style={{ margin: 0, fontSize: 20, lineHeight: "28px", fontWeight: 650 }}>Live View</h1>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#2E90FA" }} />
          <span style={{ fontSize: 13, color: "var(--ink-2)" }}>
            {newest ? relative(newest, now) : "Waiting for a visitor"}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <select
            value={store.slug}
            onChange={(event) => navigate(`/admin/live?store=${event.target.value}`)}
            style={{
              height: 32,
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              padding: "0 8px",
              fontSize: 13,
              color: "var(--ink)",
              boxShadow: "var(--shadow)",
            }}
          >
            {stores.map((option) => (
              <option key={option.slug} value={option.slug}>
                {option.name}
              </option>
            ))}
          </select>
          <button
            onClick={toggleSound}
            title={soundOn ? "Sale sound on" : "Sale sound off"}
            style={{
              height: 32,
              padding: "0 10px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: soundOn ? "var(--accent-soft)" : "var(--surface)",
              fontSize: 12,
              fontWeight: 550,
              cursor: "pointer",
              color: "var(--ink)",
            }}
          >
            {soundOn ? "🔔 Sound on" : "🔕 Sound off"}
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Stat label="Visitors right now" value={String(board.activeVisitors)} tone="#38A0FF" />
          <Stat label="Total sales" value={formatMoney(board.revenueToday, store.currency)} tone="#FF2FB9" />
          <Stat label="Total sessions" value={String(board.sessionsToday)} tone="#38A0FF" />
          <Stat label="Total orders" value={String(board.ordersToday)} tone="#38A0FF" />
        </div>

        <div style={{ ...card, padding: "14px 16px" }}>
          <div style={{ fontWeight: 650, marginBottom: 10 }}>Customer behavior</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
            {[
              { label: "Active carts", value: board.activeCarts, note: "carts with items" },
              { label: "Checking out", value: board.checkingOut, note: "reached checkout" },
              { label: "Purchased", value: board.purchased, note: "paid orders today" },
            ].map((column) => (
              <div key={column.label}>
                <div style={{ fontSize: 12, color: "var(--ink-2)", fontWeight: 550 }}>{column.label}</div>
                <div style={{ fontSize: 22, fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>{column.value}</div>
              </div>
            ))}
          </div>
          <div style={{ position: "relative", marginTop: 8 }}>
            <svg viewBox="0 0 300 132" style={{ width: "100%", height: 132, display: "block" }}>
              {[board.activeCarts, board.checkingOut, board.purchased].map((value, index) => {
                const height = Math.max(58, 38 + (value / funnelMax) * 84);
                const x = index * 100 + 8;
                return (
                  <g key={index}>
                    <rect x={x} y={132 - height} width={84} height={height} rx={6} fill="#2F5CF5" />
                    <rect x={x} y={132 - height} width={84} height={6} rx={3} fill="#fff" opacity={0.22} />
                  </g>
                );
              })}
            </svg>
            {board.sessionsToday === 0 ? (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "grid",
                  placeItems: "center",
                  background: "rgba(255,255,255,.72)",
                  color: "var(--ink-2)",
                  fontSize: 13,
                  borderRadius: 8,
                }}
              >
                No sessions yet — nothing to chart
              </div>
            ) : null}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 6, fontSize: 11, color: "var(--ink-3)" }}>
            <span>{board.activeCarts ? "carts with items" : "nothing yet"}</span>
            <span>{board.checkingOut ? "reached checkout" : "nothing yet"}</span>
            <span>{board.purchased ? "paid orders today" : "nothing yet"}</span>
          </div>
        </div>

        <div style={{ ...card, padding: "14px 16px" }}>
          <div style={{ fontWeight: 650, marginBottom: 10, textDecoration: "underline dotted var(--ink-3)", textUnderlineOffset: 4 }}>
            Sessions by location
          </div>
          {board.byLocation.length === 0 ? (
            <div style={{ color: "var(--ink-2)", textAlign: "center", padding: "14px 0" }}>No data for this date range</div>
          ) : (
            board.byLocation.map((row) => (
              <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ width: 150, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.label}</span>
                <span style={{ flex: 1, height: 26, borderRadius: 6, background: "var(--bg)", overflow: "hidden" }}>
                  <span style={{ display: "block", height: 26, width: `${Math.max(12, (row.count / locationMax) * 100)}%`, background: "#2E90FA", borderRadius: 6 }} />
                </span>
                <span style={{ width: 28, textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 12 }}>{row.count}</span>
              </div>
            ))
          )}
        </div>

        <div style={card}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", fontWeight: 650 }}>
            <span>Live activity</span>
            <span style={{ fontSize: 12, color: "var(--ink-2)", fontWeight: 450 }}>{board.recent.length} events</span>
          </div>
          {board.recent.length === 0 ? (
            <div style={{ padding: "28px 16px", textAlign: "center" }}>
              <div style={{ fontWeight: 600 }}>No activity yet</div>
              <div style={{ color: "var(--ink-2)", fontSize: 12 }}>
                Visitors appear here the moment the storefront gets traffic. Nothing is simulated.
              </div>
            </div>
          ) : (
            board.recent.slice(0, 30).map((event) => (
              <button
                key={event.id}
                onClick={() => event.orderId && navigate(`/admin/orders/${event.orderId}?store=${store.slug}`)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 14px 9px 12px",
                  border: 0,
                  borderBottom: "1px solid var(--border)",
                  borderLeft: `4px solid ${EVENT_COLOR[event.type] ?? "#B5B5B5"}`,
                  background: event.type === "purchase" ? "rgba(34,197,94,.08)" : "transparent",
                  cursor: event.orderId ? "pointer" : "default",
                  textAlign: "left",
                  color: "var(--ink)",
                  animation: "kFade .25s",
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: EVENT_COLOR[event.type] ?? "#B5B5B5", flex: "none" }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 550, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {EVENT_LABEL[event.type] ?? event.type} · {place(event)}
                  </span>
                  <span style={{ display: "block", fontSize: 12, color: "var(--ink-2)" }}>
                    {store.name}
                    {event.path ? ` · ${event.path}` : ""}
                    {event.source ? ` · ad ${event.source}` : " · direct"}
                  </span>
                </span>
                {event.amountCents ? (
                  <span style={{ fontWeight: 650, color: "#0C5132", fontVariantNumeric: "tabular-nums" }}>
                    +{formatMoney(event.amountCents, store.currency)}
                  </span>
                ) : null}
                <span style={{ fontSize: 11, color: "var(--ink-3)", width: 60, textAlign: "right" }}>{relative(event.at, now)}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ----------------------------------------------------------- globe */}
      <div style={{ flex: "1 1 auto", position: "relative", overflow: "hidden", background: "var(--bg)" }}>
        <div ref={paneRef} style={{ position: "absolute", inset: 0 }} />

        <div style={{ position: "absolute", left: 20, top: 20, zIndex: 8, display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none", width: 226 }}>
          {cards.map((item) => (
            <div
              key={item.key}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                padding: "10px 12px",
                borderRadius: 14,
                background: "rgba(255,255,255,.62)",
                backdropFilter: "blur(22px) saturate(190%)",
                WebkitBackdropFilter: "blur(22px) saturate(190%)",
                boxShadow: "0 8px 24px rgba(0,0,0,.12)",
                animation: "kPop .14s ease-out",
              }}
            >
              <span style={{ width: 26, height: 26, borderRadius: 8, background: "#1A1A1A", color: "#fff", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 12, flex: "none" }}>S</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.title}</span>
                <span style={{ display: "block", fontSize: 11, color: "var(--ink-2)" }}>{item.amount ?? item.sub}</span>
              </span>
              <span style={{ fontSize: 10, color: "var(--ink-3)" }}>now</span>
            </div>
          ))}
        </div>

        <div style={{ position: "absolute", top: 16, right: 16, zIndex: 9, display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ position: "relative" }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--ink-3)" strokeWidth="1.6" strokeLinecap="round" style={{ position: "absolute", left: 10, top: 10 }}>
              <circle cx="7" cy="7" r="4.5" />
              <path d="m10.5 10.5 3 3" />
            </svg>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && searchLocation()}
              placeholder="Search location"
              style={{ height: 34, width: 230, padding: "0 10px 0 30px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 13, boxShadow: "var(--shadow)" }}
            />
          </div>
          <Control onClick={toggleDots} active={dotsOn} title={dotsOn ? "Hide visitors" : "Show visitors"}>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M1.8 10S4.8 5.2 10 5.2s8.2 4.8 8.2 4.8-3 4.8-8.2 4.8S1.8 10 1.8 10z" />
              <circle cx="10" cy="10" r="2.1" />
              {!dotsOn ? <path d="M3.4 16.6 16.6 3.4" /> : null}
            </svg>
          </Control>
          <Control onClick={() => globeRef.current?.reset()} title="Reset view">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
              <path d="M3 9.5 10 3l7 6.5M4.5 8.5V17h11V8.5" />
            </svg>
          </Control>
          <Control onClick={toggleFullscreen} title={fullscreen ? "Exit full screen" : "Full screen"}>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M3 8V3h5M17 8V3h-5M3 12v5h5M17 12v5h-5" />
            </svg>
          </Control>
        </div>

        {toast ? (
          <div style={{ position: "absolute", top: 60, right: 16, zIndex: 9, background: "var(--ink)", color: "var(--bg)", padding: "8px 12px", borderRadius: 8, fontSize: 12, animation: "kPop .14s ease-out" }}>
            {toast}
          </div>
        ) : null}

        <div style={{ position: "absolute", bottom: 16, right: 64, zIndex: 9, display: "flex", gap: 8 }}>
          <Chip color="#FF2FB9" label="Orders" />
          <Chip color="#4DA3FF" label="Visitors right now" />
        </div>

        <div style={{ position: "absolute", bottom: 16, right: 16, zIndex: 9, display: "flex", flexDirection: "column", gap: 4 }}>
          <Control onClick={() => globeRef.current && globeRef.current.setZoom(globeRef.current.zoom * 1.15)} title="Zoom in">
            +
          </Control>
          <Control onClick={() => globeRef.current && globeRef.current.setZoom(globeRef.current.zoom / 1.15)} title="Zoom out">
            −
          </Control>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div style={{ ...card, padding: "14px 16px", borderRadius: 14, background: "linear-gradient(180deg,#fff,#fafafa)" }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)" }}>{label}</div>
      <div style={{ fontSize: 26, lineHeight: "32px", fontWeight: 650, fontVariantNumeric: "tabular-nums", color: tone === "#FF2FB9" ? "var(--ink)" : "var(--ink)" }}>{value}</div>
      <div style={{ height: 3, width: 28, borderRadius: 2, background: tone, marginTop: 6 }} />
    </div>
  );
}

function Control({ onClick, title, active, children }: { onClick: () => void; title: string; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 34,
        height: 34,
        borderRadius: 9,
        border: "1px solid var(--border)",
        background: active ? "var(--accent-soft)" : "var(--surface)",
        color: "var(--ink)",
        cursor: "pointer",
        display: "grid",
        placeItems: "center",
        boxShadow: "var(--shadow)",
        fontSize: 16,
        lineHeight: 1,
      }}
    >
      {children}
    </button>
  );
}

function Chip({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ height: 30, padding: "0 12px", borderRadius: 15, background: "var(--surface)", border: "1px solid var(--border)", display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 550, boxShadow: "var(--shadow)" }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
      {label}
    </span>
  );
}

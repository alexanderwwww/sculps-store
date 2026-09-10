/**
 * The admin shell: dark top bar, store switcher, notifications bell, ⌘K
 * palette, sidebar, mobile drawer.
 *
 * Transliterated from design/port/shell.html. Every style string here is the
 * prototype's. Three differences, all of them because the real thing knows
 * something the prototype did not:
 *
 *  - the prototype assumes a session and has no user menu; ours signs in and
 *    out for real, so the avatar opens a menu instead of being decoration;
 *  - the store list is whatever is in the database, including none at all;
 *  - the bell and the palette read real rows from /admin/notifications and
 *    /admin/search rather than the prototype's in-memory arrays.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useFetcher, useLocation, useNavigate } from "react-router";
import type { CSSProperties, ReactNode } from "react";
import type { loader as notificationsLoader } from "~/routes/admin.notifications";
import type { loader as searchLoader } from "~/routes/admin.search";
import { money0 } from "~/lib/money";

export interface ShellStore {
  id: string;
  slug: string;
  name: string;
  domain: string;
  color: string;
  /** money taken today, net of refunds, in cents */
  revenueCents: number;
  orderCount: number;
  health: "ok" | "attention";
  healthLabel: string;
}

export interface ShellUser {
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface ShellCounts {
  newOrders: number;
  products: number;
  reviews: number;
}

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  count?: number;
  indent?: boolean;
  trailing?: ReactNode;
}

function initials(user: ShellUser): string {
  const source = user.name || user.email;
  const parts = source.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?").toUpperCase() + (parts[1]?.[0]?.toUpperCase() ?? "");
}

const iconStroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinejoin: "round" as const,
};

export function AdminShell({
  user,
  stores,
  store,
  counts,
  children,
  fullBleed = false,
  saveBar = null,
}: {
  user: ShellUser;
  stores: ShellStore[];
  /** the store being viewed; the switcher's per-store figures are not needed here */
  store: Pick<ShellStore, "id" | "slug" | "name" | "domain" | "color"> | null;
  counts: ShellCounts;
  children: ReactNode;
  /** Live View and the theme editor manage their own padding. */
  fullBleed?: boolean;
  /**
   * The prototype's "Unsaved changes" bar. It only appears when a screen says
   * it has unsaved work; nothing reports that yet, so it stays closed rather
   * than pretending. (See the report: the layout would have to pass it.)
   */
  saveBar?: { onDiscard: () => void; onSave: () => void } | null;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [storeMenuOpen, setStoreMenuOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 900);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
      if (event.key === "Escape") {
        setPaletteOpen(false);
        setStoreMenuOpen(false);
        setBellOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Close the menus whenever the route changes.
  useEffect(() => {
    setStoreMenuOpen(false);
    setBellOpen(false);
    setPaletteOpen(false);
    setDrawerOpen(false);
  }, [location.key]);

  const suffix = store ? `?store=${store.slug}` : "";
  const withStore = (path: string) => `${path}${suffix}`;

  const nav: NavItem[] = [
    {
      to: withStore("/admin"),
      label: "Home",
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" {...iconStroke}>
          <path d="M3 9.5 10 3l7 6.5V17H12v-4.5H8V17H3z" />
        </svg>
      ),
    },
    {
      to: withStore("/admin/orders"),
      label: "Orders",
      count: counts.newOrders || undefined,
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" {...iconStroke}>
          <path d="M4 3h12v14l-2-1.5L12 17l-2-1.5L8 17l-2-1.5L4 17z" />
          <path d="M7 7h6M7 10h6" />
        </svg>
      ),
    },
    {
      to: withStore("/admin/products"),
      label: "Products",
      count: counts.products || undefined,
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" {...iconStroke}>
          <path d="M3 3h6.5l7.5 7.5-6.5 6.5L3 9.5z" />
          <circle cx="6.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
        </svg>
      ),
    },
    // navExtra in the prototype is Inventory, Customers, Reviews, Marketing,
    // in that order.
    {
      to: withStore("/admin/inventory"),
      label: "Inventory",
      icon: (
        <svg width="18" height="18" viewBox="0 0 20 20" {...iconStroke} strokeLinecap="round">
          <path d="M3 6.5 10 3l7 3.5v7L10 17l-7-3.5zM3 6.5 10 10l7-3.5M10 10v7" />
        </svg>
      ),
    },
    {
      to: withStore("/admin/customers"),
      label: "Customers",
      icon: (
        <svg width="18" height="18" viewBox="0 0 20 20" {...iconStroke} strokeLinecap="round">
          <path d="M10 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4 17c0-3 2.7-4.6 6-4.6S16 14 16 17" />
        </svg>
      ),
    },
    {
      to: withStore("/admin/reviews"),
      label: "Reviews",
      count: counts.reviews || undefined,
      icon: (
        <svg width="18" height="18" viewBox="0 0 20 20" {...iconStroke} strokeLinecap="round">
          <path d="M10 3l2.2 4.5 5 .7-3.6 3.5.9 4.9L10 14.3l-4.5 2.3.9-4.9L2.8 8.2l5-.7z" />
        </svg>
      ),
    },
    {
      to: withStore("/admin/marketing"),
      label: "Marketing",
      icon: (
        <svg width="18" height="18" viewBox="0 0 20 20" {...iconStroke} strokeLinecap="round">
          <path d="M3 7.5h3.5L13 4v12L6.5 12.5H3zM16 8.5v3" />
        </svg>
      ),
    },
    {
      to: withStore("/admin/analytics"),
      label: "Analytics",
      icon: (
        <svg width="18" height="18" viewBox="0 0 20 20" {...iconStroke} strokeLinecap="round">
          <path d="M4 16V9M10 16V4M16 16v-5" />
        </svg>
      ),
    },
    {
      to: withStore("/admin/live"),
      label: "Live View",
      indent: true,
      icon: null,
      trailing: (
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: "#22C55E",
            animation: "kPulse 1.6s ease-out infinite",
          }}
        />
      ),
    },
    {
      to: withStore("/admin/meta"),
      label: "Meta",
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" {...iconStroke}>
          {/* Meta's mark is a symmetric infinity. The old path was one
              lopsided squiggle that looked like a mistake. */}
          <path d="M10 10c-1.5-2.5-2.7-4.2-4.5-4.2C3.5 5.8 2 7.7 2 10s1.5 4.2 3.5 4.2c1.8 0 3-1.7 4.5-4.2zM10 10c1.5 2.5 2.7 4.2 4.5 4.2 2 0 3.5-1.9 3.5-4.2s-1.5-4.2-3.5-4.2c-1.8 0-3 1.7-4.5 4.2z" />
        </svg>
      ),
    },
  ];

  const channelNav: NavItem[] = [
    {
      to: withStore("/admin/online-store"),
      label: "Online Store",
      icon: (
        <svg width="18" height="18" viewBox="0 0 20 20" {...iconStroke}>
          <path d="M3 8l1.5-4h11L17 8M3 8v9h14V8M8 17v-5h4v5" />
        </svg>
      ),
      trailing: <CustomizeShortcut suffix={suffix} />,
    },
    {
      to: withStore("/admin/media"),
      label: "Media",
      icon: (
        <svg width="18" height="18" viewBox="0 0 20 20" {...iconStroke}>
          <rect x="3" y="4" width="14" height="12" rx="2" />
          <path d="m3 14 4.5-4.5 4 4 2.5-2.5 3 3" />
        </svg>
      ),
    },
  ];

  const isActive = (to: string) => {
    const path = to.split("?")[0];
    if (path === "/admin") return location.pathname === "/admin";
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  return (
    <div
      className="k-app"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "var(--bg)",
        color: "var(--ink)",
        overflow: "hidden",
      }}
    >
      <header
        style={{
          height: 56,
          flex: "none",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 16px",
          background: "var(--topbar)",
          color: "var(--topbar-ink)",
          position: "relative",
          zIndex: 50,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 9, flex: "none", marginRight: 4 }}>
          <img
            src="/logo-mark.png"
            alt="Shop Admin"
            style={{ width: 26, height: 26, objectFit: "contain", flex: "none", display: "block" }}
          />
          {!isMobile ? (
            <span
              style={{
                fontWeight: 650,
                fontSize: 13,
                color: "#fff",
                whiteSpace: "nowrap",
                letterSpacing: "-.01em",
              }}
            >
              Shop Admin
            </span>
          ) : null}
        </span>

        {isMobile ? (
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Menu"
            style={{
              width: 36,
              height: 36,
              border: 0,
              background: "transparent",
              borderRadius: 8,
              cursor: "pointer",
              color: "#fff",
              display: "grid",
              placeItems: "center",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M3 5h14M3 10h14M3 15h14" />
            </svg>
          </button>
        ) : null}

        <div style={{ position: "relative", flex: "none", order: 5 }}>
          <button
            onClick={() => {
              setBellOpen(false);
              setStoreMenuOpen((open) => !open);
            }}
            onMouseEnter={(event) => (event.currentTarget.style.background = "rgba(255,255,255,.12)")}
            onMouseLeave={(event) => (event.currentTarget.style.background = "rgba(255,255,255,.06)")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              height: 34,
              padding: "0 8px 0 10px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,.14)",
              background: "rgba(255,255,255,.06)",
              cursor: "pointer",
              color: "#fff",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: store?.color ?? "#8A8A8A",
                flex: "none",
              }}
            />
            {!isMobile ? (
              <span style={{ fontWeight: 600, fontSize: 13, whiteSpace: "nowrap" }}>
                {store ? store.name : "No store yet"}
              </span>
            ) : null}
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
              <path d="m4 6 4 4 4-4" />
            </svg>
          </button>

          {storeMenuOpen ? (
            <div
              style={{
                position: "absolute",
                right: 0,
                top: 40,
                width: 320,
                zIndex: 60,
                background: "var(--elev)",
                color: "var(--ink)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                boxShadow: "var(--shadow-lg)",
                padding: 6,
                animation: "kPop .14s ease-out",
              }}
            >
              <div
                style={{
                  padding: "6px 10px 4px",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--ink-2)",
                  textTransform: "uppercase",
                  letterSpacing: ".06em",
                }}
              >
                Switch store
              </div>
              {stores.length === 0 ? (
                <div style={{ padding: "10px", color: "var(--ink-2)" }}>No stores yet.</div>
              ) : null}
              {stores.map((option) => (
                <button
                  key={option.id}
                  className="k-hover"
                  onClick={() => {
                    const path = location.pathname.startsWith("/admin/orders/")
                      ? "/admin/orders"
                      : location.pathname;
                    navigate(`${path}?store=${option.slug}`);
                  }}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: 0,
                    background: option.id === store?.id ? "var(--accent-soft)" : "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                    color: "var(--ink)",
                  }}
                >
                  <span
                    title={option.healthLabel}
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: "50%",
                      background: option.health === "attention" ? "var(--critical)" : "var(--success)",
                      flex: "none",
                      boxShadow:
                        option.health === "attention"
                          ? "0 0 0 3px rgba(245,166,35,.18)"
                          : "0 0 0 3px rgba(34,197,94,.16)",
                    }}
                  />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        display: "block",
                        fontWeight: 550,
                        lineHeight: "16px",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {option.name}
                    </span>
                    <span
                      style={{
                        display: "block",
                        fontSize: 12,
                        lineHeight: "16px",
                        color: "var(--ink-2)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {option.domain}
                    </span>
                  </span>
                  <span style={{ textAlign: "right", flex: "none", fontVariantNumeric: "tabular-nums" }}>
                    <span style={{ display: "block", fontWeight: 600, lineHeight: "16px" }}>
                      {money0(option.revenueCents)}
                    </span>
                    <span style={{ display: "block", fontSize: 12, lineHeight: "16px", color: "var(--ink-2)" }}>
                      {option.orderCount} {option.orderCount === 1 ? "order" : "orders"}
                    </span>
                  </span>
                  {option.id === store?.id ? (
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--link)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}>
                      <path d="M3 8.5 6.5 12 13 4.5" />
                    </svg>
                  ) : null}
                </button>
              ))}
              <div style={{ borderTop: "1px solid var(--border)", marginTop: 6, paddingTop: 6 }}>
                <Link
                  to="/admin/stores/new"
                  className="k-hover"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 10px",
                    borderRadius: 8,
                    color: "var(--ink)",
                    fontWeight: 550,
                  }}
                >
                  <span style={{ fontSize: 15, lineHeight: "15px" }}>+</span> Add store
                </Link>
              </div>
            </div>
          ) : null}
        </div>

        <div style={{ flex: 1, display: "flex", justifyContent: "center", minWidth: 0 }}>
          <button
            onClick={() => setPaletteOpen(true)}
            onMouseEnter={(event) => (event.currentTarget.style.borderColor = "#616161")}
            onMouseLeave={(event) => (event.currentTarget.style.borderColor = "transparent")}
            style={{
              width: "100%",
              maxWidth: 520,
              height: 32,
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "0 10px",
              borderRadius: 8,
              border: "1px solid transparent",
              background: "var(--search)",
              color: "#B5B5B5",
              cursor: "text",
              textAlign: "left",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <circle cx="7" cy="7" r="4.5" />
              <path d="m10.5 10.5 3 3" />
            </svg>
            <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              Search
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "1px 6px",
                borderRadius: 5,
                border: "1px solid #616161",
                color: "#B5B5B5",
              }}
            >
              ⌘K
            </span>
          </button>
        </div>

        <NotificationsBell
          open={bellOpen}
          storeName={store?.name ?? ""}
          onToggle={() => {
            setStoreMenuOpen(false);
            setBellOpen((open) => !open);
          }}
          onClose={() => setBellOpen(false)}
          storeSlug={store?.slug ?? null}
        />

        <UserMenu user={user} />
      </header>

      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        {!isMobile ? (
          <aside
            style={{
              width: 240,
              flex: "none",
              background: "var(--side)",
              display: "flex",
              flexDirection: "column",
              height: "100%",
              borderRight: "1px solid var(--border)",
            }}
          >
            <nav
              style={{
                padding: "12px 12px 4px",
                display: "flex",
                flexDirection: "column",
                gap: 2,
                flex: 1,
                overflow: "auto",
              }}
            >
              {nav.map((item) => (
                <SideLink key={item.to + item.label} item={item} active={isActive(item.to)} />
              ))}
              <div
                style={{
                  padding: "14px 10px 4px",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--ink-2)",
                }}
              >
                Sales channel
              </div>
              {channelNav.map((item) => (
                <SideLink key={item.to + item.label} item={item} active={isActive(item.to)} />
              ))}
            </nav>
            <div style={{ padding: "8px 12px 12px", borderTop: "1px solid var(--border)" }}>
              <SideLink
                item={{
                  to: withStore("/admin/settings"),
                  label: "Settings",
                  icon: (
                    <svg width="20" height="20" viewBox="0 0 20 20" {...iconStroke}>
                      <circle cx="10" cy="10" r="2.6" />
                      <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" />
                    </svg>
                  ),
                }}
                active={isActive("/admin/settings")}
              />
            </div>
          </aside>
        ) : null}

        {drawerOpen ? (
          <>
            <div
              onClick={() => setDrawerOpen(false)}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 70,
                background: "rgba(0,0,0,.5)",
                animation: "kFade .15s",
              }}
            />
            <aside
              style={{
                position: "fixed",
                left: 0,
                top: 0,
                bottom: 0,
                width: 280,
                zIndex: 71,
                background: "var(--side)",
                display: "flex",
                flexDirection: "column",
                animation: "kSlide .2s ease-out",
                boxShadow: "var(--shadow-lg)",
                overflow: "auto",
              }}
            >
              <div style={{ padding: "14px 12px 8px", display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: "linear-gradient(135deg,#A78BFA,#6D3DF5)",
                    color: "#fff",
                    display: "grid",
                    placeItems: "center",
                    fontWeight: 700,
                    fontSize: 14,
                  }}
                >
                  S
                </span>
                <span style={{ flex: 1, fontWeight: 650 }}>Shop Admin</span>
                <button
                  onClick={() => setDrawerOpen(false)}
                  style={{ border: 0, background: "transparent", cursor: "pointer", color: "var(--ink-2)", padding: 6 }}
                >
                  ✕
                </button>
              </div>
              <div style={{ padding: "4px 12px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
                {stores.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => navigate(`${location.pathname}?store=${option.slug}`)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "6px 10px",
                      borderRadius: 8,
                      border: 0,
                      background: option.id === store?.id ? "var(--accent-soft)" : "transparent",
                      cursor: "pointer",
                      textAlign: "left",
                      color: "var(--ink)",
                    }}
                  >
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: option.color }} />
                    <span style={{ flex: 1, fontWeight: 550 }}>{option.name}</span>
                  </button>
                ))}
              </div>
              <nav
                style={{
                  padding: "8px 12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  borderTop: "1px solid var(--border)",
                }}
              >
                {[...nav, ...channelNav].map((item) => (
                  <Link
                    key={item.to + item.label}
                    to={item.to}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      height: 40,
                      padding: item.indent ? "0 10px 0 28px" : "0 10px",
                      borderRadius: 8,
                      border: 0,
                      cursor: "pointer",
                      fontWeight: item.indent ? 500 : 550,
                      textAlign: "left",
                      color: "var(--ink)",
                      background: isActive(item.to) ? "var(--side-active)" : "transparent",
                      textDecoration: "none",
                    }}
                  >
                    <span style={{ flex: 1 }}>{item.label}</span>
                    {item.count ? (
                      <span
                        style={{
                          minWidth: 22,
                          height: 20,
                          padding: "0 6px",
                          borderRadius: 6,
                          background: "var(--b-neutral-bg)",
                          color: "var(--b-neutral-fg)",
                          fontSize: 12,
                          fontWeight: 600,
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        {item.count}
                      </span>
                    ) : null}
                  </Link>
                ))}
              </nav>
            </aside>
          </>
        ) : null}

        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            height: "100%",
            position: "relative",
          }}
        >
          {saveBar ? (
            <div
              style={{
                height: 48,
                flex: "none",
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "0 16px",
                background: "var(--topbar)",
                color: "#fff",
                animation: "kDrop .18s ease-out",
              }}
            >
              <span style={{ fontWeight: 600, flex: 1 }}>Unsaved changes</span>
              <button
                onClick={saveBar.onDiscard}
                style={{
                  height: 30,
                  padding: "0 12px",
                  borderRadius: 8,
                  border: "1px solid #616161",
                  background: "transparent",
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 550,
                  cursor: "pointer",
                }}
              >
                Discard
              </button>
              <button
                onClick={saveBar.onSave}
                style={{
                  height: 30,
                  padding: "0 12px",
                  borderRadius: 8,
                  border: 0,
                  background: "#fff",
                  color: "#1A1A1A",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Save
              </button>
            </div>
          ) : null}
          <main
            onClick={() => {
              setStoreMenuOpen(false);
              setBellOpen(false);
            }}
            style={{
              flex: 1,
              minHeight: 0,
              overflow: fullBleed ? "hidden" : "auto",
              padding: fullBleed ? 0 : isMobile ? "16px" : "20px 24px 40px",
            }}
          >
            {children}
          </main>
        </div>
      </div>

      {paletteOpen ? (
        <CommandPalette
          store={store}
          onClose={() => setPaletteOpen(false)}
          onGo={(to) => {
            setPaletteOpen(false);
            navigate(to);
          }}
        />
      ) : null}
    </div>
  );
}

/** The inline "Customize" shortcut on the Online Store row. */
function CustomizeShortcut({ suffix }: { suffix: string }) {
  const navigate = useNavigate();
  return (
    <span
      role="link"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        navigate(`/admin/online-store${suffix}`);
      }}
      style={{ fontSize: 12, color: "var(--link)", fontWeight: 500, cursor: "pointer" }}
    >
      Customize
    </span>
  );
}

function SideLink({ item, active }: { item: NavItem; active: boolean }) {
  const style: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    height: item.indent ? 30 : 32,
    padding: item.indent ? "0 10px 0 40px" : "0 10px",
    borderRadius: 8,
    border: 0,
    cursor: "pointer",
    fontWeight: item.indent ? 500 : 550,
    fontSize: 13,
    textAlign: "left",
    color: "var(--ink)",
    background: active ? "var(--side-active)" : "transparent",
    boxShadow: active ? "var(--shadow)" : "none",
    borderLeft: `2px solid ${active ? "var(--accent)" : "transparent"}`,
    textDecoration: "none",
  };

  return (
    <Link to={item.to} className="k-side-item" style={style}>
      {item.icon ? (
        <span
          style={{
            width: 20,
            display: "grid",
            placeItems: "center",
            flex: "none",
            color: "var(--ink-2)",
          }}
        >
          {item.icon}
        </span>
      ) : null}
      <span style={{ flex: 1 }}>{item.label}</span>
      {item.count ? (
        <span
          style={{
            minWidth: 22,
            height: 20,
            padding: "0 6px",
            borderRadius: 6,
            background: "var(--b-neutral-bg)",
            color: "var(--b-neutral-fg)",
            fontSize: 12,
            fontWeight: 600,
            display: "grid",
            placeItems: "center",
          }}
        >
          {item.count}
        </span>
      ) : null}
      {item.trailing}
    </Link>
  );
}

function NotificationsBell({
  open,
  storeName,
  storeSlug,
  onToggle,
  onClose,
}: {
  open: boolean;
  storeName: string;
  storeSlug: string | null;
  onToggle: () => void;
  onClose: () => void;
}) {
  const fetcher = useFetcher<typeof notificationsLoader>();
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);

  // Only load when the bell is opened, and reload each time it opens so the
  // list is what the database says right now.
  useEffect(() => {
    if (!open) return;
    fetcher.load(`/admin/notifications${storeSlug ? `?store=${storeSlug}` : ""}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, storeSlug]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, onClose]);

  const notifications = fetcher.data?.notifications ?? [];
  const loading = fetcher.state === "loading";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={onToggle}
        onMouseEnter={(event) => (event.currentTarget.style.background = "rgba(255,255,255,.08)")}
        onMouseLeave={(event) => (event.currentTarget.style.background = "transparent")}
        aria-label="Notifications"
        style={{
          width: 34,
          height: 34,
          border: 0,
          background: "transparent",
          borderRadius: 8,
          cursor: "pointer",
          color: "#fff",
          display: "grid",
          placeItems: "center",
          position: "relative",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
          <path d="M5 14V9a5 5 0 0 1 10 0v5l1.5 1.5H3.5z" />
          <path d="M8.5 17.5a1.5 1.5 0 0 0 3 0" />
        </svg>
      </button>
      {open ? (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: 40,
            width: 340,
            background: "var(--elev)",
            color: "var(--ink)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            boxShadow: "var(--shadow-lg)",
            animation: "kPop .14s ease-out",
            overflow: "hidden",
            zIndex: 60,
          }}
        >
          <div
            style={{
              padding: "12px 14px",
              borderBottom: "1px solid var(--border)",
              fontWeight: 650,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            Notifications
            <span style={{ fontSize: 12, color: "var(--ink-2)", fontWeight: 450 }}>{storeName}</span>
          </div>
          {!loading && notifications.length === 0 ? (
            <div style={{ padding: "28px 16px", textAlign: "center", color: "var(--ink-2)" }}>
              Nothing yet. Orders, tracking emails and payment alerts land here.
            </div>
          ) : null}
          {notifications.map((item) => (
            <button
              key={item.id}
              className="k-hover"
              onClick={() => {
                onClose();
                navigate(item.to);
              }}
              style={{
                width: "100%",
                display: "flex",
                gap: 10,
                padding: "10px 14px",
                border: 0,
                borderBottom: "1px solid var(--border)",
                background: "transparent",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: item.color,
                  marginTop: 6,
                  flex: "none",
                }}
              />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", color: "var(--ink)" }}>{item.text}</span>
                <span style={{ display: "block", fontSize: 12, color: "var(--ink-2)" }}>{item.time}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function UserMenu({ user }: { user: ShellUser }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative", order: 6, flex: "none", marginLeft: 2 }}>
      <button
        onClick={() => setOpen((value) => !value)}
        style={{
          width: 30,
          height: 30,
          borderRadius: "50%",
          background: "#A78BFA",
          color: "#14102A",
          display: "grid",
          placeItems: "center",
          fontSize: 12,
          fontWeight: 650,
          border: 0,
          cursor: "pointer",
          overflow: "hidden",
          padding: 0,
        }}
      >
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          initials(user)
        )}
      </button>
      {open ? (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: 38,
            width: 240,
            background: "var(--elev)",
            color: "var(--ink)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            boxShadow: "var(--shadow-lg)",
            padding: 6,
            zIndex: 60,
            animation: "kPop .14s ease-out",
          }}
        >
          <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", marginBottom: 6 }}>
            <div style={{ fontWeight: 600 }}>{user.name || "Signed in"}</div>
            <div style={{ fontSize: 12, color: "var(--ink-2)", wordBreak: "break-all" }}>
              {user.email}
            </div>
          </div>
          <form method="post" action="/admin/logout">
            <button
              type="submit"
              className="k-hover"
              style={{
                width: "100%",
                textAlign: "left",
                padding: "8px 10px",
                border: 0,
                borderRadius: 8,
                background: "transparent",
                cursor: "pointer",
                color: "var(--ink)",
                fontSize: 13,
              }}
            >
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

interface PaletteItem {
  id: string;
  title: string;
  sub: string;
  to: string;
}

interface PaletteGroup {
  label: string;
  short: string;
  items: PaletteItem[];
}

function CommandPalette({
  store,
  onClose,
  onGo,
}: {
  store: Pick<ShellStore, "id" | "slug" | "name" | "domain" | "color"> | null;
  onClose: () => void;
  onGo: (to: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const fetcher = useFetcher<typeof searchLoader>();
  const suffix = store ? `?store=${store.slug}` : "";

  const load = useCallback(
    (value: string) => {
      const params = new URLSearchParams();
      if (value) params.set("q", value);
      if (store) params.set("store", store.slug);
      fetcher.load(`/admin/search?${params.toString()}`);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store?.slug],
  );

  // Debounced: one request per pause in typing, not one per keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => load(query.trim()), query ? 160 : 0);
    return () => window.clearTimeout(timer);
  }, [query, load]);

  useEffect(() => setIndex(0), [query]);

  const groups = useMemo<PaletteGroup[]>(() => {
    const q = query.trim().toLowerCase();
    const all: PaletteGroup[] = [...((fetcher.data?.groups ?? []) as PaletteGroup[])];

    // "Go to" is navigation this client already knows; it needs no round trip.
    const screens: [string, string][] = [
      ["Home", `/admin${suffix}`],
      ["Orders", `/admin/orders${suffix}`],
      ["Products", `/admin/products${suffix}`],
      ["Inventory", `/admin/inventory${suffix}`],
      ["Reviews", `/admin/reviews${suffix}`],
      ["Analytics", `/admin/analytics${suffix}`],
      ["Live View", `/admin/live${suffix}`],
      ["Meta", `/admin/meta${suffix}`],
      ["Online Store", `/admin/online-store${suffix}`],
      ["Media", `/admin/media${suffix}`],
      ["Settings", `/admin/settings${suffix}`],
      ["Add store", "/admin/stores/new"],
    ].filter(([label]) => !q || label.toLowerCase().includes(q)) as [string, string][];

    if (screens.length) {
      all.push({
        label: "Go to",
        short: "→",
        items: screens.map(([label, to]) => ({ id: to, title: label, sub: "Screen", to })),
      });
    }
    return all;
  }, [fetcher.data, query, suffix]);

  const flat = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const current = Math.min(index, Math.max(0, flat.length - 1));

  let counter = 0;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(0,0,0,.45)",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        paddingTop: "12vh",
        animation: "kFade .12s",
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(640px,calc(100vw - 32px))",
          background: "var(--elev)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          boxShadow: "var(--shadow-lg)",
          overflow: "hidden",
          animation: "kModal .16s ease-out",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "0 16px",
            height: 52,
            borderBottom: "1px solid var(--border)",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="var(--ink-2)" strokeWidth="1.6" strokeLinecap="round">
            <circle cx="7" cy="7" r="4.5" />
            <path d="m10.5 10.5 3 3" />
          </svg>
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setIndex((i) => Math.min(i + 1, flat.length - 1));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              }
              if (event.key === "Enter" && flat[current]) onGo(flat[current].to);
            }}
            placeholder="Search orders, products, settings…"
            style={{
              flex: 1,
              height: "100%",
              border: 0,
              background: "transparent",
              fontSize: 15,
              outline: "none",
              color: "var(--ink)",
            }}
          />
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "1px 6px",
              borderRadius: 5,
              border: "1px solid var(--border)",
              color: "var(--ink-2)",
            }}
          >
            esc
          </span>
        </div>
        <div style={{ maxHeight: 400, overflow: "auto", padding: 6 }}>
          {groups.map((group) => (
            <div key={group.label}>
              <div
                style={{
                  padding: "8px 10px 4px",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--ink-2)",
                  textTransform: "uppercase",
                  letterSpacing: ".06em",
                }}
              >
                {group.label}
              </div>
              {group.items.map((item) => {
                const i = counter++;
                return (
                  <button
                    key={group.label + item.id}
                    onClick={() => onGo(item.to)}
                    onMouseEnter={() => setIndex(i)}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "8px 10px",
                      border: 0,
                      borderRadius: 8,
                      background: i === current ? "var(--accent-soft)" : "transparent",
                      cursor: "pointer",
                      textAlign: "left",
                      color: "var(--ink)",
                    }}
                  >
                    <span
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 7,
                        background: "var(--bg)",
                        display: "grid",
                        placeItems: "center",
                        fontSize: 11,
                        fontWeight: 600,
                        color: "var(--ink-2)",
                        flex: "none",
                      }}
                    >
                      {group.short}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span
                        style={{
                          display: "block",
                          fontWeight: 550,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {item.title}
                      </span>
                      <span style={{ display: "block", fontSize: 12, color: "var(--ink-2)" }}>
                        {item.sub}
                      </span>
                    </span>
                    <span style={{ fontSize: 11, color: "var(--ink-3)", opacity: i === current ? 1 : 0 }}>
                      ↵
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
          {flat.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--ink-2)" }}>
              No results for “{query}”
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

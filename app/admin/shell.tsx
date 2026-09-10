/**
 * The admin shell: dark top bar, store switcher, sidebar, ⌘K palette.
 *
 * Ported from the approved prototype. The one behavioural difference is that
 * the store list is whatever is in the database — including none at all.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import type { CSSProperties, ReactNode } from "react";

export interface ShellStore {
  id: string;
  slug: string;
  name: string;
  domain: string;
  color: string;
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
}: {
  user: ShellUser;
  stores: ShellStore[];
  store: ShellStore | null;
  counts: ShellCounts;
  children: ReactNode;
  /** Live View and the theme editor manage their own padding. */
  fullBleed?: boolean;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [storeMenuOpen, setStoreMenuOpen] = useState(false);
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
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Close the menus whenever the route changes.
  useEffect(() => {
    setStoreMenuOpen(false);
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
    {
      to: withStore("/admin/inventory"),
      label: "Inventory",
      icon: (
        <svg width="18" height="18" viewBox="0 0 20 20" {...iconStroke} strokeLinecap="round">
          <path d="M3 7l7-4 7 4v6l-7 4-7-4z M3 7l7 4 7-4 M10 11v6" />
        </svg>
      ),
    },
    {
      to: withStore("/admin/reviews"),
      label: "Reviews",
      count: counts.reviews || undefined,
      icon: (
        <svg width="18" height="18" viewBox="0 0 20 20" {...iconStroke} strokeLinecap="round">
          <path d="m10 3 2.2 4.5 5 .7-3.6 3.5.9 4.9L10 14.3 5.5 16.6l.9-4.9L2.8 8.2l5-.7z" />
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
          <path d="M3 13.5c0-4.2 1.5-7 3.5-7 2.8 0 3.5 7 6.4 7 1.8 0 3.1-1.8 3.1-4.3S14.9 5 13.3 5C11 5 9.7 9.3 7.3 13.5" />
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
          <span
            style={{
              width: 26,
              height: 26,
              borderRadius: 8,
              background: "linear-gradient(135deg,#A78BFA,#6D3DF5)",
              color: "#fff",
              display: "grid",
              placeItems: "center",
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            S
          </span>
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
            onClick={() => setStoreMenuOpen((open) => !open)}
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
                left: 0,
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
                <div style={{ padding: "10px", color: "var(--ink-2)" }}>
                  No stores yet.
                </div>
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
                    background: option.id === store?.id ? "var(--sel)" : "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                    color: "var(--ink)",
                  }}
                >
                  <span
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: "50%",
                      background: option.color,
                      flex: "none",
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
                boxShadow: "var(--shadow-lg)",
                overflow: "auto",
                padding: "12px",
                gap: 2,
              }}
            >
              {[...nav, ...channelNav].map((item) => (
                <SideLink key={item.to + item.label} item={item} active={isActive(item.to)} />
              ))}
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
          <main
            style={{
              flex: 1,
              minHeight: 0,
              overflow: fullBleed ? "hidden" : "auto",
              padding: fullBleed ? 0 : "20px 24px 40px",
            }}
          >
            {children}
          </main>
        </div>
      </div>

      {paletteOpen ? (
        <CommandPalette
          stores={stores}
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

interface Command {
  label: string;
  hint: string;
  to: string;
}

function CommandPalette({
  stores,
  store,
  onClose,
  onGo,
}: {
  stores: ShellStore[];
  store: ShellStore | null;
  onClose: () => void;
  onGo: (to: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const suffix = store ? `?store=${store.slug}` : "";

  const commands = useMemo<Command[]>(() => {
    const base: Command[] = [
      { label: "Home", hint: "Go to", to: `/admin${suffix}` },
      { label: "Orders", hint: "Go to", to: `/admin/orders${suffix}` },
      { label: "Products", hint: "Go to", to: `/admin/products${suffix}` },
      { label: "Inventory", hint: "Go to", to: `/admin/inventory${suffix}` },
      { label: "Reviews", hint: "Go to", to: `/admin/reviews${suffix}` },
      { label: "Analytics", hint: "Go to", to: `/admin/analytics${suffix}` },
      { label: "Live View", hint: "Go to", to: `/admin/live${suffix}` },
      { label: "Meta", hint: "Go to", to: `/admin/meta${suffix}` },
      { label: "Online Store", hint: "Go to", to: `/admin/online-store${suffix}` },
      { label: "Media", hint: "Go to", to: `/admin/media${suffix}` },
      { label: "Settings", hint: "Go to", to: `/admin/settings${suffix}` },
      { label: "Add store", hint: "Create", to: "/admin/stores/new" },
    ];
    for (const option of stores) {
      base.push({ label: option.name, hint: "Switch store", to: `/admin?store=${option.slug}` });
    }
    return base;
  }, [stores, suffix]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => setIndex(0), [query]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(0,0,0,.35)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "12vh",
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(560px, calc(100% - 32px))",
          background: "var(--elev)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          boxShadow: "var(--shadow-lg)",
          overflow: "hidden",
        }}
      >
        <input
          autoFocus
          value={query}
          placeholder="Search the admin…"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setIndex((i) => Math.min(i + 1, results.length - 1));
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setIndex((i) => Math.max(i - 1, 0));
            }
            if (event.key === "Enter" && results[index]) onGo(results[index].to);
          }}
          style={{
            width: "100%",
            height: 48,
            border: 0,
            borderBottom: "1px solid var(--border)",
            padding: "0 16px",
            fontSize: 14,
            outline: "none",
            background: "transparent",
            color: "var(--ink)",
          }}
        />
        <div style={{ maxHeight: 320, overflow: "auto", padding: 6 }}>
          {results.length === 0 ? (
            <div style={{ padding: "20px 12px", color: "var(--ink-2)" }}>Nothing matches.</div>
          ) : null}
          {results.map((command, i) => (
            <button
              key={command.to + command.label}
              onMouseEnter={() => setIndex(i)}
              onClick={() => onGo(command.to)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 10px",
                borderRadius: 8,
                border: 0,
                background: i === index ? "var(--sel)" : "transparent",
                cursor: "pointer",
                textAlign: "left",
                color: "var(--ink)",
                fontSize: 13,
              }}
            >
              <span style={{ flex: 1 }}>{command.label}</span>
              <span style={{ fontSize: 12, color: "var(--ink-2)" }}>{command.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

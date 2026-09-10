/**
 * Online Store — Themes, Pages, Navigation, Preferences.
 *
 * Themes is Shopify's screen: the visibility pill over the store's real
 * password state, the Web Vitals strip built from measurements real browsers
 * reported, the live theme card showing the actual rendered storefront, and
 * the draft list. Nothing on it is a drawing. Layout stays in code;
 * a theme holds the words, images and videos, so duplicating one is safe and
 * editing the live one — the Shopify restriction — is allowed on purpose.
 */
import { useEffect, useRef, useState } from "react";
import { Form, Link, useNavigation } from "react-router";
import type { Route } from "./+types/admin.online-store";
import { requireUser } from "~/lib/auth.server";
import {
  resolveAdminStore,
  listThemes,
  liveTheme,
  renameTheme,
  duplicateTheme,
  publishTheme,
  deleteTheme,
  listPages,
  setPageVisible,
  createStandalonePage,
  productPageOfTheme,
  storeMenus,
  saveMenuLinks,
  saveStoreSettings,
} from "~/lib/admin.server";
import { MENU_HANDLES } from "~/lib/menus";
import { hashPassword } from "~/lib/password.server";
import { card, Empty, primaryButton, secondaryButton, input } from "~/admin/ui";
import { vitalsStrip, type VitalsStrip } from "~/admin/online-store.data.server";

export function meta() {
  return [{ title: "Online Store — Shop Admin" }];
}

const TABS = [
  ["themes", "Themes"],
  ["pages", "Pages"],
  ["navigation", "Navigation"],
  ["preferences", "Preferences"],
] as const;

export async function loader({ context, request }: Route.LoaderArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  if (!store) return { store: null, tab: "themes", live: null, drafts: [], pages: [], menus: [], destinations: [], productPageId: null, prefs: null, vitals: null as VitalsStrip | null };

  const wanted = url.searchParams.get("tab") || "themes";
  const tab = TABS.some(([key]) => key === wanted) ? wanted : "themes";

  const all = await listThemes(context.db, store.id);
  const live = all.find((theme) => theme.isLive) ?? null;

  let productPageId: string | null = null;
  if (live) {
    const productPage = await productPageOfTheme(context.db, live.id);
    productPageId = productPage?.id ?? null;
  }

  const pageRows = live ? await listPages(context.db, live.id) : [];
  const menus = await storeMenus(context.db, store.id);
  // The strip only shows on Themes, so the two extra queries only run there.
  const vitals = tab === "themes" ? await vitalsStrip(context.db, store.id) : null;

  return {
    store: { slug: store.slug, name: store.name, domain: store.domain },
    tab,
    vitals,
    productPageId,
    live: live ? { id: live.id, name: live.name, updatedAt: live.updatedAt } : null,
    drafts: all.filter((theme) => !theme.isLive).map((theme) => ({ id: theme.id, name: theme.name, updatedAt: theme.updatedAt })),
    pages: pageRows.map((page) => ({ id: page.id, title: page.title, handle: page.handle, kind: page.kind, visible: page.visible, updatedAt: page.updatedAt })),
    menus,
    destinations: [
      { value: "product", label: "Product page" },
      { value: "cart", label: "Cart" },
      ...pageRows.filter((page) => page.kind === "standalone").map((page) => ({ value: page.handle, label: page.title })),
    ],
    prefs: {
      seoTitle: store.seoTitle ?? "",
      metaDescription: store.metaDescription ?? "",
      socialImageUrl: store.socialImageUrl ?? "",
      faviconUrl: store.faviconUrl ?? "",
      passwordEnabled: store.passwordEnabled,
      hasPassword: Boolean(store.passwordHash),
      passwordMessage: store.passwordMessage ?? "",
    },
  };
}

export async function action({ context, request }: Route.ActionArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  if (!store) return { error: "Create a store first." };

  const form = await request.formData();
  const intent = String(form.get("intent") || "");
  const text = (name: string) => String(form.get(name) || "").trim();

  // Every theme id posted must belong to this store.
  const owned = async (themeId: string) => (await listThemes(context.db, store.id)).find((theme) => theme.id === themeId);

  if (intent === "rename") {
    const theme = await owned(text("themeId"));
    if (!theme) return { error: "That theme is not on this store." };
    const name = text("name");
    if (!name) return { error: "A theme needs a name." };
    await renameTheme(context.db, theme.id, name);
    return { ok: "Renamed." };
  }
  if (intent === "duplicate") {
    const theme = await owned(text("themeId"));
    if (!theme) return { error: "That theme is not on this store." };
    const name = text("name") || `${theme.name} copy`;
    await duplicateTheme(context.db, store.id, theme.id, name);
    return { ok: `Duplicated as "${name}". It is a draft until you publish it.` };
  }
  if (intent === "publish") {
    const theme = await owned(text("themeId"));
    if (!theme) return { error: "That theme is not on this store." };
    await publishTheme(context.db, store.id, theme.id);
    return { ok: `"${theme.name}" is live now.` };
  }
  if (intent === "delete-theme") {
    const theme = await owned(text("themeId"));
    if (!theme) return { error: "That theme is not on this store." };
    if (theme.isLive) return { error: "The live theme cannot be deleted. Publish another one first." };
    await deleteTheme(context.db, theme.id);
    return { ok: "Deleted." };
  }

  if (intent === "toggle-page") {
    const live = await liveTheme(context.db, store.id);
    const page = live ? (await listPages(context.db, live.id)).find((p) => p.id === text("pageId")) : null;
    if (!page) return { error: "That page is not on this store." };
    await setPageVisible(context.db, page.id, form.get("visible") === "1");
    return { ok: "Saved." };
  }
  if (intent === "add-page") {
    const live = await liveTheme(context.db, store.id);
    if (!live) return { error: "This store has no live theme." };
    const title = text("title") || "New page";
    const handle = text("handle") || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const existing = await listPages(context.db, live.id);
    if (existing.some((page) => page.handle === handle)) return { error: `A page with the handle "${handle}" already exists.` };
    await createStandalonePage(context.db, store.id, live.id, title, handle);
    return { ok: "Page created. It is hidden until you switch it on." };
  }

  if (intent === "save-menu") {
    const menuId = text("menuId");
    const labels = form.getAll("label").map(String);
    const destinations = form.getAll("destination").map(String);
    const urls = form.getAll("url").map(String);
    const links = [];
    for (let i = 0; i < labels.length; i++) {
      const label = labels[i].trim();
      const destination = destinations[i] || "";
      const link = urls[i]?.trim() || "";
      if (!label && !destination) continue;
      if (!label) return { error: `Link ${i + 1} needs a label.` };
      if (!destination) return { error: `"${label}" needs a destination.` };
      if (destination === "custom" && !/^(https?:\/\/|\/)/.test(link)) return { error: `"${label}" needs a full address starting with https:// or /.` };
      links.push({ label, destination, url: destination === "custom" ? link : null });
    }
    await saveMenuLinks(context.db, store.id, menuId, links);
    return { ok: "Menu saved. The storefront shows it on the next load." };
  }

  // The header pill writes the same column the Preferences pane writes:
  // password protection off = Public, on = Restricted.
  if (intent === "visibility") {
    const restricted = text("visibility") === "restricted";
    if (restricted && !store.passwordHash) return { error: "Set a password in Preferences before restricting the store." };
    await saveStoreSettings(context.db, store.id, { passwordEnabled: restricted });
    return { ok: restricted ? "Restricted. The storefront now asks for the password." : "Public. Anyone with the address can see the store." };
  }

  if (intent === "preferences") {
    const password = text("password");
    const enabled = form.get("passwordEnabled") === "on";
    if (enabled && !password && !store.passwordHash) return { error: "Set a password before turning protection on." };
    await saveStoreSettings(context.db, store.id, {
      seoTitle: text("seoTitle") || null,
      metaDescription: text("metaDescription") || null,
      socialImageUrl: text("socialImageUrl") || null,
      faviconUrl: text("faviconUrl") || null,
      passwordEnabled: enabled,
      passwordMessage: text("passwordMessage") || null,
      ...(password ? { passwordHash: await hashPassword(password) } : {}),
    });
    return { ok: enabled ? "Saved. The storefront now asks for the password." : "Saved." };
  }

  return { error: "Unknown action." };
}

function when(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h ago`;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function OnlineStore({ loaderData, actionData }: Route.ComponentProps) {
  const { store, tab, live, drafts, pages, menus, destinations, productPageId, prefs, vitals } = loaderData;
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";

  if (!store || !prefs) {
    return (
      <div style={{ maxWidth: 640, margin: "40px auto", ...card }}>
        <Empty title="No store yet" help="Create a store first." />
      </div>
    );
  }

  const pgCols = "minmax(0,1.4fr) minmax(0,1fr) 110px 80px";

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <StoreHeader store={store} prefs={prefs} busy={busy} />
      <div style={{ display: "flex", gap: 2, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 6, boxShadow: "var(--shadow)", width: "fit-content", flexWrap: "wrap" }}>
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            to={`/admin/online-store?store=${store.slug}&tab=${key}`}
            style={{ height: 30, padding: "0 14px", borderRadius: 8, border: 0, background: tab === key ? "var(--accent-soft)" : "transparent", color: tab === key ? "var(--ink)" : "var(--ink-2)", fontSize: 13, fontWeight: 550, cursor: "pointer", display: "inline-flex", alignItems: "center", textDecoration: "none" }}
          >
            {label}
          </Link>
        ))}
      </div>

      {actionData?.error ? <Notice kind="critical">{actionData.error}</Notice> : null}
      {actionData?.ok ? <Notice kind="success">{actionData.ok}</Notice> : null}

      {tab === "themes" ? (
        <>
          {vitals ? <VitalsStripCard vitals={vitals} /> : null}

          {!live ? (
            <div style={card}>
              <Empty title="No live theme" help="This store has no live theme, which should not happen. Duplicate a draft and publish it." />
            </div>
          ) : (
            <LiveThemeCard store={store} live={live} productPageId={productPageId} busy={busy} />
          )}

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 4 }}>
            <h2 style={{ margin: 0, fontSize: 14, lineHeight: "20px", fontWeight: 650 }}>Draft themes</h2>
            <span style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              {/* Nothing pretends: there is no theme-file format and no upload
                  endpoint behind Import, so it is disabled with the reason. */}
              <span style={{ fontSize: 12, color: "var(--ink-2)" }}>Importing needs a theme file format and an upload endpoint. Neither exists yet.</span>
              <button type="button" disabled title="Importing needs a theme file format and an upload endpoint. Neither exists yet." style={{ ...secondaryButton, opacity: 0.5, cursor: "not-allowed" }}>
                Import
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="m4 6 4 4 4-4" /></svg>
              </button>
            </span>
          </div>

          <div style={card}>
            {drafts.length === 0 ? (
              <div style={{ padding: "40px 16px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <div style={{ fontWeight: 650 }}>No draft themes yet</div>
                <div style={{ color: "var(--ink-2)", maxWidth: 360 }}>Duplicate the live theme from its ⋯ menu to keep a version you can roll back to.</div>
              </div>
            ) : (
              drafts.map((theme) => (
                <div key={theme.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", borderBottom: "1px solid var(--border)" }}>
                  {/* Prototype: a 56×40 "Preview" tile. Ours is the real draft, scaled. */}
                  <StorefrontThumb slug={store.slug} domain={store.domain} themeId={theme.id} width={56} height={40} scale={0.06} chrome={false} radius={7} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontWeight: 550, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{theme.name}</span>
                    <span style={{ display: "block", fontSize: 12, color: "var(--ink-2)" }}>Saved {when(theme.updatedAt)}</span>
                  </span>
                  <Form method="post" onSubmit={(e) => { if (!confirm(`Make "${theme.name}" the live theme? The current live theme becomes a draft.`)) e.preventDefault(); }}>
                    <input type="hidden" name="intent" value="publish" />
                    <input type="hidden" name="themeId" value={theme.id} />
                    <button type="submit" disabled={busy} style={{ height: 26, padding: "0 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--ink)", fontSize: 12, fontWeight: 550, cursor: "pointer" }}>Publish</button>
                  </Form>
                  <Form method="post" onSubmit={(e) => { if (!confirm(`Delete "${theme.name}"? This cannot be undone.`)) e.preventDefault(); }}>
                    <input type="hidden" name="intent" value="delete-theme" />
                    <input type="hidden" name="themeId" value={theme.id} />
                    <button type="submit" disabled={busy} style={{ height: 26, padding: "0 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--critical)", fontSize: 12, fontWeight: 550, cursor: "pointer" }}>Delete</button>
                  </Form>
                </div>
              ))
            )}
          </div>
        </>
      ) : null}

      {tab === "pages" ? (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "var(--shadow)", overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 650 }}>Pages</span>
            <Form method="post">
              <input type="hidden" name="intent" value="add-page" />
              <button type="submit" disabled={busy} style={{ height: 26, padding: "0 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--ink)", fontSize: 12, fontWeight: 550, cursor: "pointer" }}>Add page</button>
            </Form>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: pgCols, gap: 12, padding: "0 16px", height: 34, alignItems: "center", fontSize: 12, fontWeight: 550, color: "var(--ink-2)", borderBottom: "1px solid var(--border)" }}>
            <span>Title</span><span>Handle</span><span>Updated</span><span style={{ textAlign: "right" }}>Visible</span>
          </div>
          {pages.length === 0 ? (
            <Empty title="No pages" help="Policy pages and anything else you write live here." />
          ) : (
            pages.map((page) => (
              <div key={page.id} style={{ display: "grid", gridTemplateColumns: pgCols, gap: 12, alignItems: "center", padding: "0 16px", height: 46, borderBottom: "1px solid var(--border)" }}>
                <Link
                  to={page.kind === "product" ? `/admin/online-store/editor/${page.id}?store=${store.slug}` : `/admin/settings?store=${store.slug}&pane=policies`}
                  style={{ border: 0, background: "transparent", padding: 0, textAlign: "left", font: "inherit", fontWeight: 550, color: "var(--link)", cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textDecoration: "none" }}
                >
                  {page.title}
                </Link>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: "var(--ink-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>/{page.kind === "product" ? "" : `pages/${page.handle}`}</span>
                <span style={{ color: "var(--ink-2)", fontSize: 12 }}>{when(page.updatedAt)}</span>
                <span style={{ justifySelf: "end" }}>
                  <Form method="post">
                    <input type="hidden" name="intent" value="toggle-page" />
                    <input type="hidden" name="pageId" value={page.id} />
                    <input type="hidden" name="visible" value={page.visible ? "0" : "1"} />
                    <button type="submit" role="switch" aria-checked={page.visible} disabled={page.kind === "product"} title={page.kind === "product" ? "The product page is always on" : ""} style={{ width: 38, height: 22, borderRadius: 11, border: 0, background: page.visible ? "var(--accent)" : "var(--border-strong)", position: "relative", cursor: page.kind === "product" ? "default" : "pointer", opacity: page.kind === "product" ? 0.5 : 1 }}>
                      <span style={{ position: "absolute", top: 2, left: page.visible ? 18 : 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.3)", transition: "left .18s" }} />
                    </button>
                  </Form>
                </span>
              </div>
            ))
          )}
        </div>
      ) : null}

      {tab === "navigation" ? (
        <>
          {menus.map((menu) => (
            <MenuEditor key={menu.id} menu={menu} destinations={destinations} busy={busy} where={MENU_HANDLES.find(([handle]) => handle === menu.handle)?.[2] ?? "storefront"} />
          ))}
        </>
      ) : null}

      {tab === "preferences" ? (
        <Form method="post" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <input type="hidden" name="intent" value="preferences" />
          <PreferencesCards prefs={prefs} store={store} busy={busy} />
        </Form>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------- pieces */

function Notice({ kind, children }: { kind: "critical" | "success"; children: React.ReactNode }) {
  return <div style={{ background: `var(--b-${kind}-bg)`, color: `var(--b-${kind}-fg)`, borderRadius: 10, padding: "10px 12px", fontSize: 13 }}>{children}</div>;
}

/* ------------------------------------------------------- header row */

/**
 * Shopify's Online Store header: shop glyph and title on the left; the
 * visibility pill, View store and the ⋯ menu on the right.
 */
function StoreHeader({
  store,
  prefs,
  busy,
}: {
  store: { slug: string; name: string; domain: string };
  prefs: { passwordEnabled: boolean; hasPassword: boolean };
  busy: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <span style={{ width: 28, height: 28, borderRadius: 8, background: "var(--b-success-bg)", color: "var(--b-success-fg)", display: "grid", placeItems: "center", flex: "none" }}>
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
            <path d="M3.2 7.6 4.8 3.5h10.4l1.6 4.1" />
            <path d="M3.2 7.6a2.1 2.1 0 0 0 3.4 1.6 2.1 2.1 0 0 0 3.4 0 2.1 2.1 0 0 0 3.4 0 2.1 2.1 0 0 0 3.4-1.6" />
            <path d="M4.8 9.9v6.6h10.4V9.9" />
          </svg>
        </span>
        <h1 style={{ margin: 0, fontSize: 20, lineHeight: "28px", fontWeight: 650 }}>Online Store</h1>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, position: "relative" }}>
        <VisibilityPill prefs={prefs} slug={store.slug} busy={busy} />
        <a href={`/?store=${store.slug}`} target="_blank" rel="noreferrer" style={{ ...secondaryButton, height: 30, color: "var(--ink)", textDecoration: "none" }}>
          View store
        </a>
        <HeaderMore slug={store.slug} />
      </div>
    </div>
  );
}

/** Reads and writes `stores.passwordEnabled` — off is Public, on is Restricted. */
function VisibilityPill({ prefs, slug, busy }: { prefs: { passwordEnabled: boolean; hasPassword: boolean }; slug: string; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useCloseOnOutside<HTMLDivElement>(() => setOpen(false));
  const restricted = prefs.passwordEnabled;

  const choice = (value: "public" | "restricted", label: string, help: string, disabled?: boolean) => (
    <Form method="post">
      <input type="hidden" name="intent" value="visibility" />
      <input type="hidden" name="visibility" value={value} />
      <button
        type="submit"
        disabled={busy || disabled}
        title={disabled ? "Set a password in Preferences first." : undefined}
        className="k-hover"
        style={{ width: "100%", textAlign: "left", padding: "7px 10px", border: 0, borderRadius: 7, background: "transparent", cursor: disabled ? "not-allowed" : "pointer", fontSize: 13, color: "var(--ink)", opacity: disabled ? 0.5 : 1 }}
      >
        <span style={{ display: "block", fontWeight: 550 }}>{label}</span>
        <span style={{ display: "block", fontSize: 12, color: "var(--ink-2)" }}>{help}</span>
      </button>
    </Form>
  );

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ height: 30, padding: "0 10px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--ink)", fontSize: 12, fontWeight: 550, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, boxShadow: "var(--shadow)" }}
      >
        {restricted ? (
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M3 10s2.8-4.5 7-4.5S17 10 17 10s-2.8 4.5-7 4.5S3 10 3 10Z" />
            <path d="M3 3l14 14" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M3 10s2.8-4.5 7-4.5S17 10 17 10s-2.8 4.5-7 4.5S3 10 3 10Z" />
            <circle cx="10" cy="10" r="1.9" />
          </svg>
        )}
        {restricted ? "Restricted" : "Public"}
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="m4 6 4 4 4-4" /></svg>
      </button>
      {open ? (
        <div style={{ position: "absolute", right: 0, top: 36, width: 260, background: "var(--elev)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "var(--shadow-lg)", padding: 6, zIndex: 20, animation: "kPop .14s ease-out" }}>
          {choice("public", "Public", "Anyone with the address can see the store.")}
          {choice("restricted", "Restricted", prefs.hasPassword ? "Visitors need the storefront password." : "Set a password in Preferences first.", !prefs.hasPassword)}
        </div>
      ) : null}
    </div>
  );
}

/** The ⋯ next to View store. Only links that go somewhere real are in it. */
function HeaderMore({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const ref = useCloseOnOutside<HTMLDivElement>(() => setOpen(false));
  const itemStyle = { display: "block", padding: "7px 10px", borderRadius: 7, fontSize: 13, color: "var(--ink)", textDecoration: "none" } as const;
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label="More actions" style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--ink)", cursor: "pointer", boxShadow: "var(--shadow)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15, lineHeight: 1 }}>
        ⋯
      </button>
      {open ? (
        <div style={{ position: "absolute", right: 0, top: 36, width: 200, background: "var(--elev)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "var(--shadow-lg)", padding: 6, zIndex: 20, animation: "kPop .14s ease-out" }}>
          <Link to={`/admin/online-store?store=${slug}&tab=preferences`} className="k-hover" style={itemStyle}>Edit preferences</Link>
          <Link to={`/admin/settings?store=${slug}&pane=domains`} className="k-hover" style={itemStyle}>Manage domains</Link>
        </div>
      ) : null}
    </div>
  );
}

function useCloseOnOutside<T extends HTMLElement>(close: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  });
  return ref;
}

/* ------------------------------------------------------- web vitals */

/**
 * One card, five cells divided by vertical rules: the window, the three Core
 * Web Vitals at P75, and sessions by device. Every number is measured; a
 * metric without five samples says "Collecting" rather than showing a zero.
 */
function VitalsStripCard({ vitals }: { vitals: VitalsStrip }) {
  const cell = { padding: "13px 16px", minWidth: 0, display: "flex", flexDirection: "column" as const, justifyContent: "center" };
  const rule = { borderLeft: "1px solid var(--border)" };

  return (
    <div style={{ ...card, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
      <div style={{ ...cell, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ color: "var(--ink-2)", flex: "none" }}>
          <rect x="3" y="4.5" width="14" height="12.5" rx="2" />
          <path d="M3 8.5h14M7 3v3M13 3v3" />
        </svg>
        <span style={{ fontSize: 13, fontWeight: 550 }}>{vitals.days} days</span>
      </div>

      <MetricCell
        style={{ ...cell, ...rule }}
        label="LCP P75"
        definition="Largest Contentful Paint at the 75th percentile: how long the biggest thing on screen takes to appear, for the slowest quarter of visits."
        cellData={vitals.lcp}
        format={(value) => `${value} milliseconds`}
        grade={(value) => (value <= 2500 ? "good" : value <= 4000 ? "fair" : "poor")}
      />
      <MetricCell
        style={{ ...cell, ...rule }}
        label="INP P75"
        definition="Interaction to Next Paint at the 75th percentile: how long the page takes to respond to a tap or click, for the slowest quarter of visits."
        cellData={vitals.inp}
        format={(value) => `${value} milliseconds`}
        grade={(value) => (value <= 200 ? "good" : value <= 500 ? "fair" : "poor")}
      />
      <MetricCell
        style={{ ...cell, ...rule }}
        label="Cumulative Layout Shift"
        definition="How much the page moves around while it loads, at the 75th percentile. Zero means nothing jumped."
        cellData={vitals.cls}
        format={(value) => (value / 1000).toFixed(2)}
        grade={(value) => (value <= 100 ? "good" : value <= 250 ? "fair" : "poor")}
      />

      <div style={{ ...cell, ...rule, gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 550, color: "var(--ink-2)" }}>Sessions by Device Type</span>
        {vitals.devices.length === 0 ? (
          <span style={{ fontSize: 13, color: "var(--ink-3)" }}>No sessions yet</span>
        ) : (
          <span style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {vitals.devices.map((row) => (
              <span key={row.device} style={{ fontSize: 13 }}>
                <b style={{ fontWeight: 650 }}>{row.sessions}</b>{" "}
                <span style={{ color: "var(--ink-2)", textTransform: "capitalize" }}>{row.device}</span>
              </span>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}

function MetricCell({
  style,
  label,
  definition,
  cellData,
  format,
  grade,
}: {
  style: React.CSSProperties;
  label: string;
  definition: string;
  cellData: { p75: number | null; samples: number };
  format: (value: number) => string;
  grade: (value: number) => "good" | "fair" | "poor";
}) {
  const collecting = cellData.p75 === null;
  const barColor = collecting
    ? "var(--border)"
    : grade(cellData.p75 as number) === "good"
      ? "var(--b-success-fg)"
      : grade(cellData.p75 as number) === "fair"
        ? "var(--b-warning-fg)"
        : "var(--critical)";

  return (
    <div style={{ ...style, gap: 6 }}>
      <span
        title={definition}
        style={{ fontSize: 12, fontWeight: 550, color: "var(--ink-2)", textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 3, cursor: "help", width: "fit-content" }}
      >
        {label}
      </span>
      <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        {collecting ? (
          <span
            title={`${cellData.samples} ${cellData.samples === 1 ? "measurement" : "measurements"} so far. A P75 needs at least five, so there is no number to show yet.`}
            style={{ fontSize: 15, fontWeight: 650, color: "var(--ink-2)", cursor: "help" }}
          >
            Collecting
          </span>
        ) : (
          <span style={{ fontSize: 15, fontWeight: 650 }}>{format(cellData.p75 as number)}</span>
        )}
        <span title="No earlier 30-day window to compare against yet." style={{ fontSize: 12, color: "var(--ink-3)", cursor: "help" }}>—</span>
      </span>
      <span style={{ display: "block", height: 3, borderRadius: 2, background: barColor }} />
    </div>
  );
}

/* ------------------------------------------------------- live theme */

/** The weekday-and-time stamp Shopify prints under the domain. */
function lastSaved(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const day = date.toLocaleDateString("en-US", { weekday: "long" });
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${day} at ${time}`;
}

/**
 * The live theme as Shopify shows it: the real rendered storefront filling the
 * card, fading out at the bottom, with the domain and last-saved stamp bottom
 * left and Edit theme plus ⋯ bottom right.
 */
function LiveThemeCard({
  store,
  live,
  productPageId,
  busy,
}: {
  store: { slug: string; domain: string };
  live: { id: string; name: string; updatedAt: string | Date };
  productPageId: string | null;
  busy: boolean;
}) {
  const height = 420;
  const scale = 0.5;
  return (
    <div style={{ ...card, position: "relative" }}>
      <div style={{ position: "relative", height, overflow: "hidden", background: "#fff" }}>
        <iframe
          src={`/?store=${store.slug}&thumb=1`}
          title="Live theme preview"
          tabIndex={-1}
          loading="lazy"
          style={{ width: `${100 / scale}%`, height: height / scale, border: 0, display: "block", transform: `scale(${scale})`, transformOrigin: "top left", pointerEvents: "none" }}
        />
        <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 200, background: "linear-gradient(to bottom, rgba(255,255,255,0), var(--surface) 78%)", pointerEvents: "none" }} />
      </div>
      <div style={{ position: "absolute", left: 16, right: 16, bottom: 14, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontWeight: 650, fontSize: 14 }}>{store.domain}</span>
          <span style={{ display: "block", fontSize: 12, color: "var(--ink-2)" }}>
            <span style={{ textTransform: "uppercase" }}>{live.name}</span> · Last saved: {lastSaved(live.updatedAt)}
          </span>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 8, position: "relative" }}>
          {productPageId ? (
            <Link to={`/admin/online-store/editor/${productPageId}?store=${store.slug}`} style={{ height: 30, padding: "0 14px", borderRadius: 8, border: 0, background: "var(--accent)", color: "var(--accent-ink)", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
              Edit theme
            </Link>
          ) : null}
          <ThemeMenu theme={live} isLive slug={store.slug} busy={busy} dots />
        </span>
      </div>
    </div>
  );
}

/**
 * The real storefront in the prototype's browser chrome, scaled down.
 * `thumb=1` tells the storefront to skip visitor tracking and the pixel so
 * admin views never count as customers; `theme=` picks a draft.
 */
function StorefrontThumb({
  slug,
  domain,
  themeId,
  width,
  height = 300,
  scale = 0.32,
  chrome = true,
  radius = 10,
}: {
  slug: string;
  domain: string;
  themeId?: string;
  width?: number;
  height?: number;
  scale?: number;
  chrome?: boolean;
  radius?: number;
}) {
  const [loaded, setLoaded] = useState(false);
  const src = `/?store=${slug}${themeId ? `&theme=${themeId}` : ""}&thumb=1`;
  return (
    <div style={{ width: width ?? "100%", borderRadius: radius, border: "1px solid var(--border)", overflow: "hidden", background: "#fff", flex: "none" }}>
      {chrome ? (
        <div style={{ height: 26, background: "var(--bg)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 5, padding: "0 9px" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--border-strong)" }} />
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--border-strong)" }} />
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--border-strong)" }} />
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 10, color: "var(--ink-3)" }}>{domain}</span>
        </div>
      ) : null}
      <div style={{ position: "relative", height, overflow: "hidden", background: loaded ? "#fff" : "var(--bg)" }}>
        <iframe
          src={src}
          title="Storefront preview"
          tabIndex={-1}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          style={{ width: `${100 / scale}%`, height: height / scale, border: 0, display: "block", transform: `scale(${scale})`, transformOrigin: "top left", pointerEvents: "none" }}
        />
        <a href={`/?store=${slug}${themeId ? `&theme=${themeId}` : ""}`} target="_blank" rel="noreferrer" aria-label="Open the store" style={{ position: "absolute", inset: 0 }} />
      </div>
    </div>
  );
}

function ThemeMenu({ theme, isLive, slug, busy, dots }: { theme: { id: string; name: string }; isLive: boolean; slug: string; busy: boolean; dots?: boolean }) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const itemStyle = (danger?: boolean) => ({ width: "100%", textAlign: "left" as const, padding: "7px 10px", border: 0, borderRadius: 7, background: "transparent", cursor: "pointer", fontSize: 13, color: danger ? "var(--critical)" : "var(--ink)" });

  const item = (label: string, intent: string, extra?: Record<string, string>, danger?: boolean, confirmText?: string) => (
    <Form method="post" onSubmit={(e) => { if (confirmText && !confirm(confirmText)) e.preventDefault(); }}>
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="themeId" value={theme.id} />
      {Object.entries(extra ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <button type="submit" disabled={busy} className="k-hover" style={itemStyle(danger)}>{label}</button>
    </Form>
  );

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {dots ? (
        <button type="button" onClick={() => setOpen((v) => !v)} aria-label="Theme actions" style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--ink)", cursor: "pointer", boxShadow: "var(--shadow)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15, lineHeight: 1 }}>
          ⋯
        </button>
      ) : (
        <button type="button" onClick={() => setOpen((v) => !v)} style={{ height: 30, padding: "0 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--ink)", fontSize: 12, fontWeight: 550, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
          Actions
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="m4 6 4 4 4-4" /></svg>
        </button>
      )}
      {open ? (
        <div style={{ position: "absolute", ...(dots ? { right: 0, bottom: 36 } : { left: 0, top: 36 }), width: 200, background: "var(--elev)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "var(--shadow-lg)", padding: 6, zIndex: 20, animation: "kPop .14s ease-out" }}>
          {renaming ? (
            <Form method="post" style={{ padding: 6, display: "flex", flexDirection: "column", gap: 6 }}>
              <input type="hidden" name="intent" value="rename" />
              <input type="hidden" name="themeId" value={theme.id} />
              <input name="name" defaultValue={theme.name} autoFocus style={input} />
              <button type="submit" disabled={busy} style={primaryButton}>Rename</button>
            </Form>
          ) : (
            <>
              <a href={`/?store=${slug}${isLive ? "" : `&theme=${theme.id}`}`} target="_blank" rel="noreferrer" className="k-hover" style={{ display: "block", padding: "7px 10px", borderRadius: 7, fontSize: 13, color: "var(--ink)", textDecoration: "none" }}>Preview</a>
              <button type="button" onClick={() => setRenaming(true)} className="k-hover" style={itemStyle()}>Rename</button>
              {item("Duplicate", "duplicate", { name: `${theme.name} copy` })}
              {!isLive ? item("Publish", "publish", undefined, false, `Make "${theme.name}" the live theme? The current live theme becomes a draft.`) : null}
              {!isLive ? item("Delete", "delete-theme", undefined, true, `Delete "${theme.name}"? This cannot be undone.`) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

interface LinkRow { key: string; id: string; label: string; destination: string; url: string }

function MenuEditor({ menu, destinations, busy, where }: { menu: Route.ComponentProps["loaderData"]["menus"][number]; destinations: { value: string; label: string }[]; busy: boolean; where: string }) {
  const [rows, setRows] = useState<LinkRow[]>(() => menu.links.map((link, i) => ({ key: `l${i}`, id: link.id, label: link.label, destination: link.destination, url: link.url ?? "" })));
  const [dragging, setDragging] = useState<number | null>(null);
  const update = (i: number, patch: Partial<LinkRow>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const move = (from: number, to: number) => setRows((rs) => { const next = [...rs]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next; });
  const field = { height: 32, borderRadius: 8, border: "1px solid var(--input-border)", background: "var(--input)", fontSize: 13, color: "var(--ink)" } as const;

  return (
    <Form method="post" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "var(--shadow)", overflow: "hidden" }}>
      <input type="hidden" name="intent" value="save-menu" />
      <input type="hidden" name="menuId" value={menu.id} />
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 650 }}>{menu.title}</span>
        <span style={{ display: "flex", gap: 6 }}>
          <button type="button" onClick={() => setRows((rs) => [...rs, { key: `n${Date.now()}`, id: "", label: "", destination: "", url: "" }])} style={{ height: 26, padding: "0 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--ink)", fontSize: 12, fontWeight: 550, cursor: "pointer" }}>Add link</button>
          {/* The prototype keeps menu edits in memory; ours are written, so the menu needs a Save. */}
          <button type="submit" disabled={busy} style={{ height: 26, padding: "0 10px", borderRadius: 8, border: 0, background: "var(--accent)", color: "var(--accent-ink)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Save</button>
        </span>
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--ink-2)" }}>No links yet. Add one to show it in the {where}.</div>
      ) : (
        rows.map((row, i) => (
          <div key={row.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 16px", borderBottom: "1px solid var(--border)", background: dragging === i ? "var(--sel)" : "transparent" }}>
            <span
              draggable
              onDragStart={() => setDragging(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); if (dragging !== null && dragging !== i) move(dragging, i); setDragging(null); }}
              title="Drag to reorder"
              style={{ cursor: "grab", color: "var(--ink-3)", flex: "none" }}
            >
              ⠿
            </span>
            <input name="label" value={row.label} onChange={(e) => update(i, { label: e.target.value })} placeholder="Label" style={{ ...field, flex: 1, minWidth: 0, padding: "0 10px" }} />
            <select name="destination" value={row.destination} onChange={(e) => update(i, { destination: e.target.value })} style={{ ...field, width: 190, minWidth: 0, padding: "0 8px", fontSize: 12 }}>
              <option value="">Choose destination…</option>
              {destinations.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              <option value="custom">Custom URL…</option>
            </select>
            {row.destination === "custom" ? (
              <input name="url" value={row.url} onChange={(e) => update(i, { url: e.target.value })} placeholder="https://…" style={{ ...field, width: 170, padding: "0 10px", fontSize: 12 }} />
            ) : (
              <input type="hidden" name="url" value="" />
            )}
            <button type="button" onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))} style={{ width: 26, height: 26, borderRadius: 7, border: 0, background: "transparent", color: "var(--critical)", cursor: "pointer", flex: "none" }}>✕</button>
          </div>
        ))
      )}
    </Form>
  );
}

function PreferencesCards({ prefs, store, busy }: { prefs: NonNullable<Route.ComponentProps["loaderData"]["prefs"]>; store: { name: string; domain: string }; busy: boolean }) {
  const [title, setTitle] = useState(prefs.seoTitle);
  const [description, setDescription] = useState(prefs.metaDescription);
  const [social, setSocial] = useState(prefs.socialImageUrl);
  const [favicon, setFavicon] = useState(prefs.faviconUrl);
  const [protectedOn, setProtectedOn] = useState(prefs.passwordEnabled);
  const shownTitle = title || store.name;
  const prefCols = "minmax(0,1fr) minmax(0,1fr)";
  const labelStyle = { display: "flex", flexDirection: "column" as const, gap: 4, fontSize: 12, fontWeight: 550, color: "var(--ink-2)" };

  return (
    <>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "var(--shadow)", overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontWeight: 650 }}>Title and meta description</div>
        <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={labelStyle}>
            Store title
            <input name="seoTitle" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={store.name} style={{ height: 36, padding: "0 12px", borderRadius: 8, border: "1px solid var(--input-border)", background: "var(--input)", fontSize: 13, color: "var(--ink)" }} />
            <span style={{ fontWeight: 450, color: "var(--ink-3)" }}>{title.length} of 60 characters</span>
          </label>
          <label style={labelStyle}>
            Meta description
            <textarea name="metaDescription" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="One or two sentences describing the store" style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--input-border)", background: "var(--input)", fontSize: 13, resize: "vertical", color: "var(--ink)", fontFamily: "inherit" }} />
            <span style={{ fontWeight: 450, color: "var(--ink-3)" }}>{description.length} of 155 characters</span>
          </label>
          <div style={{ padding: 14, border: "1px solid var(--border)", borderRadius: 10, background: "#fff" }}>
            <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 4 }}>Search result preview</div>
            <div style={{ fontSize: 12, color: "#4A6B2A" }}>{store.domain} › product</div>
            <div style={{ fontSize: 18, lineHeight: "24px", color: "#1A0DAB" }}>{shownTitle}</div>
            <div style={{ fontSize: 13, lineHeight: "19px", color: "#4D5156" }}>{description || "Your meta description appears here. Google shows about 155 characters."}</div>
          </div>
        </div>
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "var(--shadow)", overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontWeight: 650 }}>Social sharing image</div>
        <div style={{ padding: "14px 16px", display: "grid", gridTemplateColumns: prefCols, gap: 16, alignItems: "start" }}>
          {/* The prototype opens a media picker here; there is none on this screen
              yet, so the address is typed — the same value, honestly collected. */}
          <label style={{ ...labelStyle, gap: 8 }}>
            Image address
            <input name="socialImageUrl" value={social} onChange={(e) => setSocial(e.target.value)} placeholder="https://…" style={{ height: 32, padding: "0 12px", borderRadius: 8, border: "1px solid var(--input-border)", background: "var(--input)", fontSize: 13, color: "var(--ink)" }} />
            <span style={{ fontSize: 12, fontWeight: 450, color: "var(--ink-2)" }}>1200 × 630 works best. Shown when a link is shared.</span>
          </label>
          <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", background: "#fff" }}>
            <span style={{ display: "block", aspectRatio: "1200/630", backgroundColor: "var(--bg)", backgroundImage: social ? `url("${social}")` : "none", backgroundSize: "cover", backgroundPosition: "center" }} />
            <span style={{ display: "block", padding: "9px 11px", borderTop: "1px solid var(--border)" }}>
              <span style={{ display: "block", fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase" }}>{store.domain}</span>
              <span style={{ display: "block", fontSize: 13, fontWeight: 600 }}>{shownTitle}</span>
            </span>
          </div>
        </div>
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "var(--shadow)", overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontWeight: 650 }}>Favicon</div>
        <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ width: 36, height: 36, borderRadius: 8, border: "1px solid var(--border)", backgroundColor: "var(--bg)", backgroundImage: favicon ? `url("${favicon}")` : "none", backgroundSize: "cover", flex: "none" }} />
          <input name="faviconUrl" value={favicon} onChange={(e) => setFavicon(e.target.value)} placeholder="https://…" style={{ flex: 1, minWidth: 0, height: 30, padding: "0 12px", borderRadius: 8, border: "1px solid var(--input-border)", background: "var(--input)", fontSize: 12, color: "var(--ink)" }} />
          <span style={{ fontSize: 12, color: "var(--ink-2)" }}>32 × 32 PNG</span>
        </div>
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "var(--shadow)", overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontWeight: 650 }}>Password protection</div>
        <label style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", borderBottom: "1px solid var(--border)", cursor: "pointer" }}>
          <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 1 }}>
            <span style={{ fontWeight: 550 }}>Restrict access with a password</span>
            <span style={{ fontSize: 12, color: "var(--ink-2)" }}>Use this before launch — Meta's crawler still gets through for domain verification.</span>
          </span>
          <span style={{ position: "relative", width: 38, height: 22, flex: "none" }}>
            <input type="checkbox" name="passwordEnabled" checked={protectedOn} onChange={(e) => setProtectedOn(e.target.checked)} className="k-switch" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", margin: 0, opacity: 0, cursor: "pointer" }} />
            <span className="k-switch-track" />
          </span>
        </label>
        {protectedOn ? (
          <div style={{ padding: "14px 16px", display: "grid", gridTemplateColumns: prefCols, gap: 12 }}>
            <label style={labelStyle}>
              Password{prefs.hasPassword ? " (one is set — leave blank to keep it)" : ""}
              <input name="password" type="text" autoComplete="off" placeholder={prefs.hasPassword ? "••••••••" : "Give this to anyone who needs a look"} style={{ height: 36, padding: "0 12px", borderRadius: 8, border: "1px solid var(--input-border)", background: "var(--input)", fontSize: 13, color: "var(--ink)", fontFamily: "'JetBrains Mono',monospace" }} />
            </label>
            <label style={labelStyle}>
              Message on the password page
              <textarea name="passwordMessage" defaultValue={prefs.passwordMessage} rows={2} placeholder="Opening soon." style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--input-border)", background: "var(--input)", fontSize: 13, resize: "vertical", color: "var(--ink)", fontFamily: "inherit" }} />
            </label>
          </div>
        ) : null}
      </div>

      {/* The prototype saves preferences as you type; ours writes on submit. */}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" disabled={busy} style={primaryButton}>{busy ? "Saving…" : "Save"}</button>
      </div>
    </>
  );
}

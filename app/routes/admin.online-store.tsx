/**
 * Online Store.
 *
 * Themes and Pages. Deliberately not Shopify's theme editor: the layout is
 * written in code per store and cannot be reached from here. What a theme
 * holds is the words, images and videos, which is why duplicating one is safe
 * and why editing the live one — the thing Shopify forbids — is allowed.
 */
import { Form, Link, useNavigation, useSearchParams } from "react-router";
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
} from "~/lib/admin.server";
import { sections as sectionsTable, pages as pagesTable } from "~/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { SECTIONS } from "~/lib/sections";
import {
  card,
  cardHeader,
  Badge,
  Empty,
  PageTitle,
  primaryButton,
  secondaryButton,
  criticalButton,
  input,
} from "~/admin/ui";

export function meta() {
  return [{ title: "Online Store — Shop Admin" }];
}

export async function loader({ context, request }: Route.LoaderArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  if (!store) return { store: null, themes: [], pages: [], tab: "themes", live: null };

  const tab = url.searchParams.get("tab") || "themes";
  const all = await listThemes(context.db, store.id);
  const live = all.find((theme) => theme.isLive) ?? null;

  // How many of the fifteen are actually showing on the live theme.
  let visibleCount = 0;
  let productPageId: string | null = null;
  if (live) {
    const productPage = await productPageOfTheme(context.db, live.id);
    productPageId = productPage?.id ?? null;
    if (productPage) {
      const rows = await context.db
        .select()
        .from(sectionsTable)
        .where(eq(sectionsTable.pageId, productPage.id));
      visibleCount = rows.filter((row) => !row.hidden).length;
    }
  }

  const pageRows = live ? await listPages(context.db, live.id) : [];

  return {
    store: { slug: store.slug, name: store.name, domain: store.domain },
    tab,
    productPageId,
    visibleCount,
    totalSections: SECTIONS.length,
    live: live
      ? { id: live.id, name: live.name, updatedAt: live.updatedAt, isLive: true }
      : null,
    themes: all
      .filter((theme) => !theme.isLive)
      .map((theme) => ({ id: theme.id, name: theme.name, updatedAt: theme.updatedAt })),
    pages: pageRows.map((page) => ({
      id: page.id,
      title: page.title,
      handle: page.handle,
      kind: page.kind,
      visible: page.visible,
      updatedAt: page.updatedAt,
    })),
  };
}

export async function action({ context, request }: Route.ActionArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  if (!store) return { error: "Create a store first." };

  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  if (intent === "rename") {
    const name = String(form.get("name") || "").trim();
    if (!name) return { error: "A theme needs a name." };
    await renameTheme(context.db, String(form.get("themeId")), name);
    return { ok: "Renamed." };
  }

  if (intent === "duplicate") {
    const source = String(form.get("themeId"));
    const all = await listThemes(context.db, store.id);
    const from = all.find((theme) => theme.id === source);
    const name = String(form.get("name") || "").trim() || `${from?.name ?? "Theme"} copy`;
    await duplicateTheme(context.db, store.id, source, name);
    return { ok: `Duplicated as "${name}".` };
  }

  if (intent === "publish") {
    await publishTheme(context.db, store.id, String(form.get("themeId")));
    return { ok: "That theme is live now." };
  }

  if (intent === "delete-theme") {
    await deleteTheme(context.db, String(form.get("themeId")));
    return { ok: "Deleted." };
  }

  if (intent === "toggle-page") {
    await setPageVisible(context.db, String(form.get("pageId")), form.get("visible") === "1");
    return { ok: "Saved." };
  }

  if (intent === "add-page") {
    const live = await liveTheme(context.db, store.id);
    if (!live) return { error: "This store has no live theme." };
    const title = String(form.get("title") || "").trim() || "New page";
    const handle =
      String(form.get("handle") || "").trim() ||
      title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    const existing = await listPages(context.db, live.id);
    if (existing.some((page) => page.handle === handle)) {
      return { error: `A page with the handle "${handle}" already exists.` };
    }
    await createStandalonePage(context.db, store.id, live.id, title, handle);
    return { ok: "Page created." };
  }

  return { error: "Unknown action." };
}

function when(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function OnlineStore({ loaderData, actionData }: Route.ComponentProps) {
  const { store, themes, live, pages, tab, visibleCount, totalSections, productPageId } = loaderData;
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";

  if (!store) {
    return (
      <div style={{ maxWidth: 640, margin: "40px auto", ...card }}>
        <Empty title="No store yet" help="Create a store first." />
      </div>
    );
  }

  const tabs = [
    { key: "themes", label: "Themes" },
    { key: "pages", label: "Pages" },
  ];

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <PageTitle title={`Online Store · ${store.name}`} />

      <div
        style={{
          display: "flex",
          gap: 2,
          ...card,
          padding: 6,
          width: "fit-content",
          flexWrap: "wrap",
        }}
      >
        {tabs.map((item) => (
          <Link
            key={item.key}
            to={`/admin/online-store?store=${store.slug}&tab=${item.key}`}
            className="k-hover"
            style={{
              height: 30,
              padding: "0 14px",
              borderRadius: 8,
              background: tab === item.key ? "var(--sel)" : "transparent",
              color: "var(--ink)",
              fontSize: 13,
              fontWeight: 550,
              display: "inline-flex",
              alignItems: "center",
              textDecoration: "none",
            }}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {actionData?.error ? <Notice kind="critical">{actionData.error}</Notice> : null}
      {actionData?.ok ? <Notice kind="success">{actionData.ok}</Notice> : null}

      {tab === "themes" ? (
        <>
          <div style={card}>
            <div style={cardHeader}>
              <span>Current theme</span>
              <Badge kind="success">Live</Badge>
            </div>
            {!live ? (
              <Empty title="No theme yet" help="This store has no live theme. That should not happen — tell Claude." />
            ) : (
              <div style={{ padding: 16, display: "grid", gridTemplateColumns: "220px minmax(0,1fr)", gap: 18, alignItems: "start" }}>
                <ThemePreview domain={store.domain} brand={store.name} />
                <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
                  <Form method="post" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <input type="hidden" name="intent" value="rename" />
                    <input type="hidden" name="themeId" value={live.id} />
                    <input name="name" defaultValue={live.name} style={{ ...input, maxWidth: 260, fontWeight: 600 }} />
                    <button type="submit" disabled={busy} style={secondaryButton}>
                      Rename
                    </button>
                  </Form>

                  <span style={{ fontSize: 12, color: "var(--ink-2)" }}>
                    Last updated {when(live.updatedAt)} · {visibleCount} of {totalSections} sections showing
                  </span>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
                    {productPageId ? (
                      <Link
                        to={`/admin/online-store/editor/${productPageId}?store=${store.slug}`}
                        style={{ ...primaryButton, height: 30, textDecoration: "none" }}
                      >
                        Customize
                      </Link>
                    ) : null}
                    <a
                      href={`/?store=${store.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ ...secondaryButton, height: 30, textDecoration: "none" }}
                    >
                      View store
                    </a>
                    <Form method="post">
                      <input type="hidden" name="intent" value="duplicate" />
                      <input type="hidden" name="themeId" value={live.id} />
                      <input type="hidden" name="name" value={`${live.name} copy`} />
                      <button type="submit" disabled={busy} style={{ ...secondaryButton, height: 30 }}>
                        Duplicate
                      </button>
                    </Form>
                  </div>

                  <span style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: "17px", marginTop: 4 }}>
                    The layout is written in code for this store. This editor changes words, images
                    and videos — and unlike Shopify, you can edit the live theme directly.
                  </span>
                </div>
              </div>
            )}
          </div>

          <div style={card}>
            <div style={cardHeader}>
              <span>Theme library</span>
              <span style={{ fontSize: 12, color: "var(--ink-2)", fontWeight: 450 }}>
                Saved versions of this design
              </span>
            </div>
            {themes.length === 0 ? (
              <div style={{ padding: "36px 16px", textAlign: "center" }}>
                <div style={{ fontWeight: 650 }}>No saved versions yet</div>
                <div style={{ color: "var(--ink-2)", maxWidth: 380, margin: "4px auto 0" }}>
                  Duplicate the current theme to keep a version you can go back to. Duplicating copies
                  the words and images; it can never change the layout.
                </div>
              </div>
            ) : (
              themes.map((theme) => (
                <div
                  key={theme.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "11px 16px",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <span
                    style={{
                      width: 56,
                      height: 40,
                      borderRadius: 7,
                      border: "1px solid var(--border)",
                      background: "var(--bg)",
                      flex: "none",
                      display: "grid",
                      placeItems: "center",
                      color: "var(--ink-3)",
                      fontSize: 9,
                    }}
                  >
                    Preview
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontWeight: 550 }}>{theme.name}</span>
                    <span style={{ display: "block", fontSize: 12, color: "var(--ink-2)" }}>
                      Saved {when(theme.updatedAt)}
                    </span>
                  </span>
                  <Form method="post">
                    <input type="hidden" name="intent" value="publish" />
                    <input type="hidden" name="themeId" value={theme.id} />
                    <button type="submit" disabled={busy} style={secondaryButton}>
                      Make live
                    </button>
                  </Form>
                  <Form method="post">
                    <input type="hidden" name="intent" value="delete-theme" />
                    <input type="hidden" name="themeId" value={theme.id} />
                    <button type="submit" disabled={busy} style={criticalButton}>
                      Delete
                    </button>
                  </Form>
                </div>
              ))
            )}
          </div>
        </>
      ) : null}

      {tab === "pages" ? (
        <div style={card}>
          <div style={cardHeader}>
            <span>Pages</span>
          </div>
          <Form
            method="post"
            style={{ display: "flex", gap: 8, padding: "10px 16px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}
          >
            <input type="hidden" name="intent" value="add-page" />
            <input name="title" placeholder="Page title" style={{ ...input, flex: 1, minWidth: 160 }} />
            <input name="handle" placeholder="handle (optional)" style={{ ...input, width: 200 }} />
            <button type="submit" disabled={busy} style={secondaryButton}>
              Add page
            </button>
          </Form>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1.4fr 1fr 100px",
              gap: 12,
              padding: "0 16px",
              height: 34,
              alignItems: "center",
              fontSize: 12,
              fontWeight: 550,
              color: "var(--ink-2)",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <span>Title</span>
            <span>Handle</span>
            <span>Updated</span>
            <span style={{ textAlign: "right" }}>Visible</span>
          </div>

          {pages.length === 0 ? (
            <Empty title="No pages" help="Policy pages and anything else you write live here." />
          ) : (
            pages.map((page) => (
              <div
                key={page.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1.4fr 1fr 100px",
                  gap: 12,
                  alignItems: "center",
                  padding: "0 16px",
                  height: 46,
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <Link
                  to={
                    page.kind === "product"
                      ? `/admin/online-store/editor/${page.id}?store=${store.slug}`
                      : `/admin/online-store/pages/${page.id}?store=${store.slug}`
                  }
                  style={{ fontWeight: 550, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                >
                  {page.title}
                </Link>
                <span
                  style={{
                    fontFamily: "'JetBrains Mono',monospace",
                    fontSize: 12,
                    color: "var(--ink-2)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  /{page.handle}
                </span>
                <span style={{ color: "var(--ink-2)", fontSize: 12 }}>{when(page.updatedAt)}</span>
                <Form method="post" style={{ justifySelf: "end" }}>
                  <input type="hidden" name="intent" value="toggle-page" />
                  <input type="hidden" name="pageId" value={page.id} />
                  <input type="hidden" name="visible" value={page.visible ? "0" : "1"} />
                  <button
                    type="submit"
                    role="switch"
                    aria-checked={page.visible}
                    style={{
                      width: 38,
                      height: 22,
                      borderRadius: 11,
                      border: 0,
                      background: page.visible ? "#22C55E" : "var(--border-strong)",
                      position: "relative",
                      cursor: "pointer",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        top: 2,
                        left: page.visible ? 18 : 2,
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        background: "#fff",
                        boxShadow: "0 1px 3px rgba(0,0,0,.3)",
                      }}
                    />
                  </button>
                </Form>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function Notice({ kind, children }: { kind: "critical" | "success"; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: `var(--b-${kind}-bg)`,
        color: `var(--b-${kind}-fg)`,
        borderRadius: 10,
        padding: "10px 12px",
        fontSize: 13,
      }}
    >
      {children}
    </div>
  );
}

/** The little browser-chrome thumbnail from the design. */
function ThemePreview({ domain, brand }: { domain: string; brand: string }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", background: "#fff" }}>
      <div
        style={{
          height: 26,
          background: "var(--bg)",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 5,
          padding: "0 9px",
        }}
      >
        {[0, 1, 2].map((dot) => (
          <span key={dot} style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--border-strong)" }} />
        ))}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: "var(--ink-3)" }}>{domain}</span>
      </div>
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 11, letterSpacing: "-.01em" }}>{brand}</span>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 9, color: "#9A9A9A" }}>Cart · 0</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div style={{ aspectRatio: "1", borderRadius: 6, background: "#F2F2F2" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ height: 9, borderRadius: 3, background: "#E9E9E9", width: "85%" }} />
            <div style={{ height: 6, borderRadius: 3, background: "#F0F0F0", width: "65%" }} />
            <div style={{ height: 22, borderRadius: 5, border: "1px solid #E6E6E6" }} />
            <div style={{ height: 22, borderRadius: 5, border: "1px solid #E6E6E6" }} />
            <div style={{ height: 22, borderRadius: 5, background: "#1A1A1A" }} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
          {[0, 1, 2].map((box) => (
            <div key={box} style={{ height: 26, borderRadius: 5, background: "#F4F4F4" }} />
          ))}
        </div>
        <div style={{ height: 8, borderRadius: 3, background: "#EDEDED", width: "45%" }} />
        <div style={{ height: 34, borderRadius: 6, background: "#F7F7F7" }} />
      </div>
    </div>
  );
}

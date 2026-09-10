/**
 * Orders.
 *
 * The screen he cannot run the business without: what sold, what still needs
 * placing with the supplier, what needs a tracking number. Filters, sort and
 * page live in the URL so a filtered view can be bookmarked and shared with
 * himself.
 *
 * The markup is a transliteration of design/port/orders.html. Extra filtering,
 * sorting and 25-per-page slicing happen here rather than in listOrders,
 * because that helper is shared and does not support them yet.
 */
import { useEffect, useRef, useState } from "react";
import { Form, Link, useNavigate, useSearchParams } from "react-router";
import type { Route } from "./+types/admin.orders._index";
import { requireUser } from "~/lib/auth.server";
import { resolveAdminStore, listOrders, setOrderState } from "~/lib/admin.server";
import { money } from "~/lib/money";
import { orderEvents } from "~/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import type { OrderState } from "~/db/schema";
import { Empty } from "~/admin/ui";

export function meta() {
  return [{ title: "Orders — Shop Admin" }];
}

const TABS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "new", label: "Unfulfilled" },
  { key: "ordered", label: "Ordered" },
  { key: "fulfilled", label: "Fulfilled" },
  { key: "refunded", label: "Refunded" },
  { key: "cancelled", label: "Cancelled" },
];

const STATE_LABEL: Record<string, string> = {
  new: "Unfulfilled",
  ordered: "Ordered with supplier",
  fulfilled: "Fulfilled",
  refunded: "Refunded",
  cancelled: "Cancelled",
};

const STATE_KIND: Record<string, string> = {
  new: "warning",
  ordered: "purple",
  fulfilled: "success",
  refunded: "neutral",
  cancelled: "neutral",
};

const PER = 25;

/** "2 × Deluxe kneeler" → "Deluxe kneeler", so the bundle filter matches a label. */
function labelsOf(summary: string): string[] {
  if (!summary || summary === "—") return [];
  return summary.split(", ").map((part) => part.replace(/^\d+ × /, ""));
}

export async function loader({ context, request }: Route.LoaderArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  if (!store) {
    return {
      store: null,
      rows: [],
      counts: {} as Record<string, number>,
      matched: 0,
      page: 0,
      pages: 1,
      state: "all",
      query: "",
      sort: "date",
      dir: "desc",
      filters: { payment: "", bundle: "", date: "" },
      bundleNames: [] as string[],
    };
  }

  const state = (url.searchParams.get("state") || "all") as OrderState | "all";
  const query = url.searchParams.get("q") || "";
  const page = Math.max(0, Number(url.searchParams.get("page") || 0) || 0);
  const sort = url.searchParams.get("sort") || "date";
  const dir = url.searchParams.get("dir") === "asc" ? "asc" : "desc";
  const fPayment = url.searchParams.get("payment") || "";
  const fBundle = url.searchParams.get("bundle") || "";
  const fDate = url.searchParams.get("date") || "";

  // listOrders paginates in SQL and knows nothing about these filters or the
  // sort, so the page is taken here instead. See the report: a listOrders that
  // took sort + payment/bundle/date would let this go back to the database.
  const { rows, counts } = await listOrders(context.db, {
    storeId: store.id,
    state,
    query,
    page: 0,
    perPage: 500,
  });

  const bundleNames = [...new Set(rows.flatMap((row) => labelsOf(row.itemSummary)))].sort();

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const dayMs = 24 * 60 * 60 * 1000;

  let list = rows;
  if (fPayment === "Paid") list = list.filter((r) => r.order.paymentStatus === "paid");
  if (fPayment === "Refunded")
    list = list.filter(
      (r) => r.order.paymentStatus === "refunded" || r.order.paymentStatus === "partially_refunded",
    );
  if (fBundle) list = list.filter((r) => labelsOf(r.itemSummary).includes(fBundle));
  if (fDate) {
    list = list.filter((r) => {
      const at = new Date(r.order.createdAt).getTime();
      if (fDate === "today") return at >= startOfToday.getTime();
      if (fDate === "yesterday")
        return at >= startOfToday.getTime() - dayMs && at < startOfToday.getTime();
      if (fDate === "7") return at >= startOfToday.getTime() - 6 * dayMs;
      return true;
    });
  }

  const sign = dir === "asc" ? 1 : -1;
  list = [...list].sort((a, b) => {
    if (sort === "total") return (a.order.totalCents - b.order.totalCents) * sign;
    if (sort === "customer") return a.order.customerName.localeCompare(b.order.customerName) * sign;
    if (sort === "number") return (a.order.number - b.order.number) * sign;
    return (new Date(a.order.createdAt).getTime() - new Date(b.order.createdAt).getTime()) * sign;
  });

  const matched = list.length;
  const pages = Math.max(1, Math.ceil(matched / PER));
  const current = Math.min(page, pages - 1);
  const pageRows = list.slice(current * PER, current * PER + PER);

  // The red dot on a row: an order with a chargeback event that Stripe opened.
  const disputed = pageRows.length
    ? await context.db
        .selectDistinct({ orderId: orderEvents.orderId })
        .from(orderEvents)
        .where(
          and(
            eq(orderEvents.type, "chargeback"),
            inArray(
              orderEvents.orderId,
              pageRows.map((r) => r.order.id),
            ),
          ),
        )
    : [];
  const disputedIds = new Set(disputed.map((d) => d.orderId));

  return {
    store: { slug: store.slug, name: store.name },
    state,
    query,
    page: current,
    pages,
    matched,
    counts,
    sort,
    dir,
    filters: { payment: fPayment, bundle: fBundle, date: fDate },
    bundleNames,
    rows: pageRows.map((row) => ({
      id: row.order.id,
      number: row.order.number,
      date: formatDate(row.order.createdAt),
      customer: row.order.customerName,
      shipTo: [row.order.city, row.order.region].filter(Boolean).join(", ") || "—",
      items: row.itemSummary,
      total: money(row.order.totalCents, row.order.currency),
      payment:
        row.order.paymentStatus === "refunded"
          ? "Refunded"
          : row.order.paymentStatus === "partially_refunded"
            ? "Partially refunded"
            : row.order.paymentStatus === "paid"
              ? "Paid"
              : row.order.paymentStatus,
      payKind: row.order.paymentStatus === "paid" ? "success" : "neutral",
      stateLabel: STATE_LABEL[row.order.state] ?? row.order.state,
      stateKind: STATE_KIND[row.order.state] ?? "neutral",
      storeColor: row.storeColor,
      tracking: row.order.tracking || "—",
      chargeback: disputedIds.has(row.order.id),
      canOrder: row.order.state === "new",
    })),
  };
}

/** Bulk "mark as ordered with supplier" from the selection bar and the row menu. */
export async function action({ context, request }: Route.ActionArgs) {
  await requireUser(context.db, request);
  const form = await request.formData();
  const ids = form.getAll("orderId").map(String);
  const intent = String(form.get("intent") || "");

  if (intent === "bulk-ordered" && ids.length) {
    for (const id of ids) {
      await setOrderState(context.db, id, "ordered", "Marked as ordered with supplier");
    }
    return { ok: true, changed: ids.length };
  }
  return { ok: false, changed: 0 };
}

function formatDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function Orders({ loaderData }: Route.ComponentProps) {
  const { store, rows, counts, state, query, matched, page, pages, sort, dir, filters, bundleNames } =
    loaderData;
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const close = () => {
      setFilterOpen(false);
      setSortMenuOpen(false);
      setMenuFor(null);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  if (!store) {
    return (
      <div
        style={{
          maxWidth: 640,
          margin: "40px auto",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          boxShadow: "var(--shadow)",
          overflow: "hidden",
        }}
      >
        <Empty title="No store yet" help="Create a store first — orders belong to a store." />
      </div>
    );
  }

  const link = (overrides: Record<string, string>) => {
    const next = new URLSearchParams(params);
    next.set("store", store.slug);
    for (const [key, value] of Object.entries(overrides)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    return `/admin/orders?${next}`;
  };
  const go = (overrides: Record<string, string>) => navigate(link(overrides));

  const filterCount = ["payment", "bundle", "date"].filter(
    (k) => filters[k as keyof typeof filters],
  ).length;
  const hasFilters = Boolean(query) || filterCount > 0 || state !== "all";
  const ordersEmpty = rows.length === 0;

  const sortOptions: { label: string; key: string; dir: string }[] = [
    { key: "date", label: "Newest first", dir: "desc" },
    { key: "date", label: "Oldest first", dir: "asc" },
    { key: "total", label: "Total: high to low", dir: "desc" },
    { key: "total", label: "Total: low to high", dir: "asc" },
    { key: "customer", label: "Customer A–Z", dir: "asc" },
  ];
  const sortMark: Record<string, string> = {};
  for (const key of ["number", "date", "customer", "total"]) {
    sortMark[key] = sort === key ? (dir === "asc" ? "↑" : "↓") : "";
  }
  const sortBy = (key: string) =>
    go({ sort: key, dir: sort === key && dir === "desc" ? "asc" : "desc", page: "" });

  const selectedIds = rows.filter((r) => selected[r.id]).map((r) => r.id);
  const allSelected = rows.length > 0 && rows.every((r) => selected[r.id]);
  const toggleAll = () => {
    const next = { ...selected };
    for (const row of rows) next[row.id] = !allSelected;
    setSelected(next);
  };

  const exportHref = (ids: string[]) => {
    const next = new URLSearchParams();
    next.set("store", store.slug);
    if (state !== "all") next.set("state", state);
    for (const id of ids) next.append("id", id);
    return `/admin/orders/export?${next}`;
  };

  const pageInfo = matched
    ? `${page * PER + 1}–${Math.min(matched, (page + 1) * PER)} of ${matched}`
    : "0 orders";

  return (
    <div ref={rootRef} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* The prototype's isMobile switch is a media query here, so the same HTML
          serves both without measuring the window on the server. */}
      <style>{`
        .k-orders-table{display:block}
        .k-orders-cards{display:none}
        @media (max-width: 720px){
          .k-orders-table{display:none}
          .k-orders-cards{display:block}
        }
      `}</style>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 20, lineHeight: "28px", fontWeight: 650 }}>Orders</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <a
            href={exportHref([])}
            className="k-hover"
            style={{
              height: 28,
              padding: "0 12px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--ink)",
              fontSize: 12,
              fontWeight: 550,
              cursor: "pointer",
              boxShadow: "var(--shadow)",
              display: "inline-flex",
              alignItems: "center",
              textDecoration: "none",
            }}
          >
            Export
          </a>
          {/* "Create order" has nothing behind it — orders are created by a real
              checkout, not from the admin — so it is disabled with the reason. */}
          <button
            type="button"
            disabled
            title="Orders are created by a customer checking out; there is no draft-order flow yet"
            style={{
              height: 28,
              padding: "0 12px",
              borderRadius: 8,
              border: 0,
              background: "var(--accent)",
              color: "var(--accent-ink)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "not-allowed",
              opacity: 0.5,
            }}
          >
            Create order
          </button>
        </div>
      </div>
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          boxShadow: "var(--shadow)",
          overflow: "visible",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            padding: "6px 8px",
            borderBottom: "1px solid var(--border)",
            overflowX: "auto",
          }}
        >
          {TABS.map((tab) => (
            <Link
              key={tab.key}
              to={link({ state: tab.key === "all" ? "" : tab.key, page: "" })}
              className="k-hover"
              style={{
                height: 30,
                padding: "0 10px",
                borderRadius: 8,
                border: 0,
                background: state === tab.key ? "var(--accent-soft)" : "transparent",
                color: state === tab.key ? "var(--ink)" : "var(--ink-2)",
                fontSize: 13,
                fontWeight: 550,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                whiteSpace: "nowrap",
                textDecoration: "none",
              }}
            >
              {tab.label}
              <span style={{ fontSize: 12, color: "var(--ink-2)", fontVariantNumeric: "tabular-nums" }}>
                {counts[tab.key] ?? 0}
              </span>
            </Link>
          ))}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 12px",
            borderBottom: "1px solid var(--border)",
            flexWrap: "wrap",
          }}
        >
          <Form method="get" style={{ flex: 1, minWidth: 180, position: "relative" }}>
            <input type="hidden" name="store" value={store.slug} />
            {state !== "all" ? <input type="hidden" name="state" value={state} /> : null}
            {sort !== "date" || dir !== "desc" ? (
              <>
                <input type="hidden" name="sort" value={sort} />
                <input type="hidden" name="dir" value={dir} />
              </>
            ) : null}
            {filters.payment ? <input type="hidden" name="payment" value={filters.payment} /> : null}
            {filters.bundle ? <input type="hidden" name="bundle" value={filters.bundle} /> : null}
            {filters.date ? <input type="hidden" name="date" value={filters.date} /> : null}
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="var(--ink-3)"
              strokeWidth="1.6"
              strokeLinecap="round"
              style={{ position: "absolute", left: 10, top: 8 }}
            >
              <circle cx="7" cy="7" r="4.5" />
              <path d="m10.5 10.5 3 3" />
            </svg>
            <input
              name="q"
              defaultValue={query}
              placeholder="Search by order, customer, email or city"
              style={{
                width: "100%",
                height: 32,
                padding: "0 10px 0 32px",
                borderRadius: 8,
                border: "1px solid var(--input-border)",
                background: "var(--input)",
                fontSize: 13,
              }}
            />
          </Form>
          <div style={{ position: "relative" }} onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              onClick={() => {
                setFilterOpen(!filterOpen);
                setSortMenuOpen(false);
              }}
              className="k-hover"
              style={{
                height: 32,
                padding: "0 10px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: "var(--ink)",
                fontSize: 12,
                fontWeight: 550,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                cursor: "pointer",
                boxShadow: "var(--shadow)",
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              >
                <path d="M2 4h12M4.5 8h7M7 12h2" />
              </svg>
              Filter
              {filterCount ? (
                <span
                  style={{
                    minWidth: 18,
                    height: 18,
                    padding: "0 5px",
                    borderRadius: 5,
                    background: "var(--accent)",
                    color: "var(--accent-ink)",
                    fontSize: 11,
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  {filterCount}
                </span>
              ) : null}
            </button>
            {filterOpen ? (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: 38,
                  width: 280,
                  background: "var(--elev)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  boxShadow: "var(--shadow-lg)",
                  padding: 12,
                  zIndex: 20,
                  animation: "kPop .14s ease-out",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                <label
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    fontSize: 12,
                    fontWeight: 550,
                    color: "var(--ink-2)",
                  }}
                >
                  Payment status
                  <select
                    value={filters.payment}
                    onChange={(event) => go({ payment: event.target.value, page: "" })}
                    style={{
                      height: 32,
                      borderRadius: 8,
                      border: "1px solid var(--input-border)",
                      background: "var(--input)",
                      padding: "0 8px",
                      fontSize: 13,
                      color: "var(--ink)",
                    }}
                  >
                    <option value="">Any</option>
                    <option value="Paid">Paid</option>
                    <option value="Refunded">Refunded</option>
                  </select>
                </label>
                <label
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    fontSize: 12,
                    fontWeight: 550,
                    color: "var(--ink-2)",
                  }}
                >
                  Bundle option
                  <select
                    value={filters.bundle}
                    onChange={(event) => go({ bundle: event.target.value, page: "" })}
                    style={{
                      height: 32,
                      borderRadius: 8,
                      border: "1px solid var(--input-border)",
                      background: "var(--input)",
                      padding: "0 8px",
                      fontSize: 13,
                      color: "var(--ink)",
                    }}
                  >
                    <option value="">Any</option>
                    {bundleNames.map((bundle) => (
                      <option key={bundle} value={bundle}>
                        {bundle}
                      </option>
                    ))}
                  </select>
                </label>
                <label
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    fontSize: 12,
                    fontWeight: 550,
                    color: "var(--ink-2)",
                  }}
                >
                  Date
                  <select
                    value={filters.date}
                    onChange={(event) => go({ date: event.target.value, page: "" })}
                    style={{
                      height: 32,
                      borderRadius: 8,
                      border: "1px solid var(--input-border)",
                      background: "var(--input)",
                      padding: "0 8px",
                      fontSize: 13,
                      color: "var(--ink)",
                    }}
                  >
                    <option value="">Any time</option>
                    <option value="today">Today</option>
                    <option value="yesterday">Yesterday</option>
                    <option value="7">Last 7 days</option>
                  </select>
                </label>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <button
                    type="button"
                    onClick={() => go({ payment: "", bundle: "", date: "", page: "" })}
                    style={{
                      border: 0,
                      background: "transparent",
                      color: "var(--link)",
                      fontSize: 12,
                      fontWeight: 550,
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    Clear all
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterOpen(false)}
                    style={{
                      height: 28,
                      padding: "0 12px",
                      borderRadius: 8,
                      border: 0,
                      background: "var(--accent)",
                      color: "var(--accent-ink)",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          <div style={{ position: "relative" }} onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              onClick={() => {
                setSortMenuOpen(!sortMenuOpen);
                setFilterOpen(false);
              }}
              style={{
                height: 32,
                padding: "0 10px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: "var(--ink)",
                fontSize: 12,
                fontWeight: 550,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                cursor: "pointer",
                boxShadow: "var(--shadow)",
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 3v10M5 13l-2.5-2.5M5 13l2.5-2.5M11 13V3M11 3 8.5 5.5M11 3l2.5 2.5" />
              </svg>
              Sort
            </button>
            {sortMenuOpen ? (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: 38,
                  width: 200,
                  background: "var(--elev)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  boxShadow: "var(--shadow-lg)",
                  padding: 6,
                  zIndex: 20,
                  animation: "kPop .14s ease-out",
                }}
              >
                {sortOptions.map((option) => {
                  const active = sort === option.key && dir === option.dir;
                  return (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => {
                        setSortMenuOpen(false);
                        go({ sort: option.key, dir: option.dir, page: "" });
                      }}
                      className="k-hover"
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "7px 10px",
                        border: 0,
                        borderRadius: 7,
                        background: active ? "var(--accent-soft)" : "transparent",
                        cursor: "pointer",
                        fontSize: 13,
                        display: "flex",
                        justifyContent: "space-between",
                        color: "var(--ink)",
                      }}
                    >
                      {option.label}
                      <span style={{ color: "var(--ink-2)" }}>{active ? "✓" : ""}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
          {/* "Save view" has no store for saved views yet, so it is disabled
              with the reason rather than pretending to save one. */}
          <button
            type="button"
            disabled
            title="Saved views are not stored anywhere yet — bookmark this URL instead, it carries the filters"
            style={{
              height: 32,
              padding: "0 8px",
              border: 0,
              background: "transparent",
              color: "var(--link)",
              fontSize: 12,
              fontWeight: 550,
              cursor: "not-allowed",
              opacity: 0.5,
            }}
          >
            Save view
          </button>
        </div>
        {selectedIds.length ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              borderBottom: "1px solid var(--border)",
              background: "var(--sel)",
              animation: "kFade .12s",
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontWeight: 600, marginRight: 4 }}>{selectedIds.length} selected</span>
            <Form method="post" onSubmit={() => setSelected({})}>
              <input type="hidden" name="intent" value="bulk-ordered" />
              {selectedIds.map((id) => (
                <input key={id} type="hidden" name="orderId" value={id} />
              ))}
              <button
                type="submit"
                style={{
                  height: 28,
                  padding: "0 10px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  color: "var(--ink)",
                  fontSize: 12,
                  fontWeight: 550,
                  cursor: "pointer",
                }}
              >
                Mark as ordered with supplier
              </button>
            </Form>
            <a
              href={exportHref(selectedIds)}
              style={{
                height: 28,
                padding: "0 10px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: "var(--ink)",
                fontSize: 12,
                fontWeight: 550,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                textDecoration: "none",
              }}
            >
              Export selected
            </a>
            <button
              type="button"
              onClick={() => setSelected({})}
              style={{
                marginLeft: "auto",
                height: 28,
                padding: "0 8px",
                border: 0,
                background: "transparent",
                color: "var(--ink-2)",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Clear
            </button>
          </div>
        ) : null}
        {ordersEmpty ? (
          <div
            style={{
              padding: "56px 16px",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: "var(--bg)",
                display: "grid",
                placeItems: "center",
                color: "var(--ink-3)",
              }}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              >
                <path d="M4 3h12v14l-2-1.5L12 17l-2-1.5L8 17l-2-1.5L4 17z" />
              </svg>
            </span>
            <div style={{ fontWeight: 650, fontSize: 14 }}>
              {hasFilters ? "No orders match" : "No orders yet"}
            </div>
            <div style={{ color: "var(--ink-2)", maxWidth: 320 }}>
              {hasFilters
                ? "Try a different search or clear the filters."
                : `Orders from ${store.name} will appear here the moment a customer pays.`}
            </div>
            <Link
              to={`/admin/orders?store=${store.slug}`}
              style={{
                marginTop: 6,
                height: 28,
                padding: "0 12px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: "var(--ink)",
                fontSize: 12,
                fontWeight: 550,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                textDecoration: "none",
              }}
            >
              Clear search and filters
            </Link>
          </div>
        ) : null}
        {!ordersEmpty ? (
          <div className="k-orders-table" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
              <thead>
                <tr
                  style={{
                    height: 40,
                    color: "var(--ink-2)",
                    fontSize: 12,
                    fontWeight: 550,
                    textAlign: "left",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <th style={{ width: 44, padding: "0 0 0 16px" }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      style={{
                        width: 16,
                        height: 16,
                        accentColor: "var(--focus)",
                        cursor: "pointer",
                        display: "block",
                      }}
                    />
                  </th>
                  <th style={{ padding: "0 12px", fontWeight: 550 }}>
                    <button
                      type="button"
                      onClick={() => sortBy("number")}
                      style={{
                        border: 0,
                        background: "transparent",
                        padding: 0,
                        font: "inherit",
                        color: "inherit",
                        cursor: "pointer",
                        display: "inline-flex",
                        gap: 4,
                      }}
                    >
                      Order<span>{sortMark.number}</span>
                    </button>
                  </th>
                  <th style={{ padding: "0 12px", fontWeight: 550 }}>
                    <button
                      type="button"
                      onClick={() => sortBy("date")}
                      style={{
                        border: 0,
                        background: "transparent",
                        padding: 0,
                        font: "inherit",
                        color: "inherit",
                        cursor: "pointer",
                        display: "inline-flex",
                        gap: 4,
                      }}
                    >
                      Date<span>{sortMark.date}</span>
                    </button>
                  </th>
                  <th style={{ padding: "0 12px", fontWeight: 550 }}>
                    <button
                      type="button"
                      onClick={() => sortBy("customer")}
                      style={{
                        border: 0,
                        background: "transparent",
                        padding: 0,
                        font: "inherit",
                        color: "inherit",
                        cursor: "pointer",
                        display: "inline-flex",
                        gap: 4,
                      }}
                    >
                      Customer<span>{sortMark.customer}</span>
                    </button>
                  </th>
                  <th style={{ padding: "0 12px", fontWeight: 550 }}>Ship to</th>
                  <th style={{ padding: "0 12px", fontWeight: 550 }}>Items</th>
                  <th style={{ padding: "0 12px", fontWeight: 550, textAlign: "right" }}>
                    <button
                      type="button"
                      onClick={() => sortBy("total")}
                      style={{
                        border: 0,
                        background: "transparent",
                        padding: 0,
                        font: "inherit",
                        color: "inherit",
                        cursor: "pointer",
                        display: "inline-flex",
                        gap: 4,
                      }}
                    >
                      Total<span>{sortMark.total}</span>
                    </button>
                  </th>
                  <th style={{ padding: "0 12px", fontWeight: 550 }}>Payment</th>
                  <th style={{ padding: "0 12px", fontWeight: 550 }}>Status</th>
                  <th style={{ padding: "0 12px", fontWeight: 550 }}>Tracking</th>
                  <th style={{ width: 44 }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((order) => (
                  <tr
                    key={order.id}
                    onClick={() => navigate(`/admin/orders/${order.id}?store=${store.slug}`)}
                    className="k-hover"
                    style={{
                      height: 44,
                      borderBottom: "1px solid var(--border)",
                      cursor: "pointer",
                      background: selected[order.id] ? "var(--sel)" : "transparent",
                    }}
                  >
                    <td style={{ padding: "0 0 0 16px" }} onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={Boolean(selected[order.id])}
                        onChange={() =>
                          setSelected({ ...selected, [order.id]: !selected[order.id] })
                        }
                        style={{
                          width: 16,
                          height: 16,
                          accentColor: "var(--focus)",
                          cursor: "pointer",
                          display: "block",
                        }}
                      />
                    </td>
                    <td
                      style={{
                        padding: "0 12px",
                        fontFamily: "'JetBrains Mono',monospace",
                        fontSize: 12,
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                      }}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: order.storeColor,
                          }}
                        />
                        #{order.number}
                      </span>
                      {order.chargeback ? (
                        <span
                          title="Chargeback open"
                          style={{
                            marginLeft: 6,
                            display: "inline-block",
                            width: 7,
                            height: 7,
                            borderRadius: "50%",
                            background: "var(--critical)",
                            verticalAlign: "middle",
                          }}
                        />
                      ) : null}
                    </td>
                    <td style={{ padding: "0 12px", whiteSpace: "nowrap", color: "var(--ink-2)" }}>
                      {order.date}
                    </td>
                    <td style={{ padding: "0 12px", whiteSpace: "nowrap", fontWeight: 500 }}>
                      {order.customer}
                    </td>
                    <td style={{ padding: "0 12px", whiteSpace: "nowrap", color: "var(--ink-2)" }}>
                      {order.shipTo}
                    </td>
                    <td
                      style={{
                        padding: "0 12px",
                        whiteSpace: "nowrap",
                        color: "var(--ink-2)",
                        maxWidth: 220,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {order.items}
                    </td>
                    <td
                      style={{
                        padding: "0 12px",
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                        fontWeight: 500,
                      }}
                    >
                      {order.total}
                    </td>
                    <td style={{ padding: "0 12px" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          height: 20,
                          padding: "0 8px",
                          borderRadius: 8,
                          fontSize: 12,
                          fontWeight: 550,
                          background: `var(--b-${order.payKind}-bg)`,
                          color: `var(--b-${order.payKind}-fg)`,
                          whiteSpace: "nowrap",
                        }}
                      >
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: "currentColor",
                            opacity: 0.8,
                          }}
                        />
                        {order.payment}
                      </span>
                    </td>
                    <td style={{ padding: "0 12px" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          height: 20,
                          padding: "0 8px",
                          borderRadius: 8,
                          fontSize: 12,
                          fontWeight: 550,
                          background: `var(--b-${order.stateKind}-bg)`,
                          color: `var(--b-${order.stateKind}-fg)`,
                          whiteSpace: "nowrap",
                        }}
                      >
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: "currentColor",
                            opacity: 0.8,
                          }}
                        />
                        {order.stateLabel}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: "0 12px",
                        whiteSpace: "nowrap",
                        fontFamily: "'JetBrains Mono',monospace",
                        fontSize: 11,
                        color: "var(--ink-2)",
                      }}
                    >
                      {order.tracking}
                    </td>
                    <td
                      style={{ padding: "0 8px", position: "relative" }}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => setMenuFor(menuFor === order.id ? null : order.id)}
                        className="k-hover"
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 7,
                          border: 0,
                          background: "transparent",
                          color: "var(--ink-2)",
                          cursor: "pointer",
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                          <circle cx="3.5" cy="8" r="1.4" />
                          <circle cx="8" cy="8" r="1.4" />
                          <circle cx="12.5" cy="8" r="1.4" />
                        </svg>
                      </button>
                      {menuFor === order.id ? (
                        <div
                          style={{
                            position: "absolute",
                            right: 8,
                            top: 38,
                            width: 230,
                            background: "var(--elev)",
                            border: "1px solid var(--border)",
                            borderRadius: 10,
                            boxShadow: "var(--shadow-lg)",
                            padding: 6,
                            zIndex: 25,
                            animation: "kPop .14s ease-out",
                          }}
                        >
                          <Link
                            to={`/admin/orders/${order.id}?store=${store.slug}`}
                            className="k-hover"
                            style={{
                              display: "block",
                              width: "100%",
                              textAlign: "left",
                              padding: "7px 10px",
                              border: 0,
                              borderRadius: 7,
                              background: "transparent",
                              cursor: "pointer",
                              fontSize: 13,
                              color: "var(--ink)",
                              textDecoration: "none",
                            }}
                          >
                            View order
                          </Link>
                          <Form method="post" onSubmit={() => setMenuFor(null)}>
                            <input type="hidden" name="intent" value="bulk-ordered" />
                            <input type="hidden" name="orderId" value={order.id} />
                            <button
                              type="submit"
                              disabled={!order.canOrder}
                              title={
                                order.canOrder
                                  ? undefined
                                  : "Only an unfulfilled order can be marked as ordered with the supplier"
                              }
                              className="k-hover"
                              style={{
                                width: "100%",
                                textAlign: "left",
                                padding: "7px 10px",
                                border: 0,
                                borderRadius: 7,
                                background: "transparent",
                                cursor: order.canOrder ? "pointer" : "not-allowed",
                                fontSize: 13,
                                color: "var(--ink)",
                                opacity: order.canOrder ? 1 : 0.5,
                              }}
                            >
                              Mark as ordered with supplier
                            </button>
                          </Form>
                          <Link
                            to={`/admin/orders/${order.id}?store=${store.slug}#tracking`}
                            className="k-hover"
                            style={{
                              display: "block",
                              width: "100%",
                              textAlign: "left",
                              padding: "7px 10px",
                              border: 0,
                              borderRadius: 7,
                              background: "transparent",
                              cursor: "pointer",
                              fontSize: 13,
                              color: "var(--ink)",
                              textDecoration: "none",
                            }}
                          >
                            Add tracking
                          </Link>
                          {/* No packing-slip document exists yet, so this stays
                              visibly disabled with the reason. */}
                          <button
                            type="button"
                            disabled
                            title="There is no packing-slip document to print yet"
                            style={{
                              width: "100%",
                              textAlign: "left",
                              padding: "7px 10px",
                              border: 0,
                              borderRadius: 7,
                              background: "transparent",
                              cursor: "not-allowed",
                              fontSize: 13,
                              color: "var(--ink)",
                              opacity: 0.5,
                            }}
                          >
                            Print packing slip
                          </button>
                          <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
                          <Link
                            to={`/admin/orders/${order.id}?store=${store.slug}&refund=1`}
                            className="k-hover"
                            style={{
                              display: "block",
                              width: "100%",
                              textAlign: "left",
                              padding: "7px 10px",
                              border: 0,
                              borderRadius: 7,
                              background: "transparent",
                              cursor: "pointer",
                              fontSize: 13,
                              color: "var(--critical)",
                              textDecoration: "none",
                            }}
                          >
                            Refund
                          </Link>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {!ordersEmpty ? (
          <div className="k-orders-cards">
            {rows.map((order) => (
              <Link
                key={order.id}
                to={`/admin/orders/${order.id}?store=${store.slug}`}
                style={{
                  width: "100%",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  padding: "12px 16px",
                  border: 0,
                  borderBottom: "1px solid var(--border)",
                  background: "transparent",
                  textAlign: "left",
                  color: "var(--ink)",
                  cursor: "pointer",
                  textDecoration: "none",
                }}
              >
                <span style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, fontWeight: 600 }}>
                    #{order.number}
                  </span>
                  <span style={{ color: "var(--ink-2)", fontSize: 12 }}>{order.date}</span>
                </span>
                <span style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
                  <span style={{ fontWeight: 500 }}>
                    {order.customer} · {order.shipTo}
                  </span>
                  <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{order.total}</span>
                </span>
                <span style={{ display: "flex", gap: 6 }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      height: 20,
                      padding: "0 8px",
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 550,
                      background: `var(--b-${order.payKind}-bg)`,
                      color: `var(--b-${order.payKind}-fg)`,
                    }}
                  >
                    {order.payment}
                  </span>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      height: 20,
                      padding: "0 8px",
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 550,
                      background: `var(--b-${order.stateKind}-bg)`,
                      color: `var(--b-${order.stateKind}-fg)`,
                    }}
                  >
                    {order.stateLabel}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        ) : null}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 8,
            padding: "10px 12px",
            color: "var(--ink-2)",
            fontSize: 12,
          }}
        >
          <span>{pageInfo}</span>
          <button
            type="button"
            onClick={() => go({ page: page - 1 > 0 ? String(page - 1) : "" })}
            disabled={page === 0}
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--ink)",
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
              opacity: page === 0 ? 0.4 : 1,
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m10 4-4 4 4 4" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => go({ page: String(page + 1) })}
            disabled={page >= pages - 1}
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--ink)",
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
              opacity: page >= pages - 1 ? 0.4 : 1,
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m6 4 4 4-4 4" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

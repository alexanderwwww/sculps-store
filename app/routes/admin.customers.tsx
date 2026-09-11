/**
 * Customers.
 *
 * A person is on this screen because they typed their email into this store's
 * own checkout — either they completed the email field, or they paid. Nothing
 * on this screen was bought from anyone, enriched from anywhere, or guessed
 * from an IP, and no record is joined across stores.
 *
 * A visitor who typed nothing is not here. That is not an omission: an
 * anonymous session is not a person, and listing one as a customer would be
 * the screen telling him something he does not actually know.
 *
 * Orders and total spent are recounted from the `orders` table whenever an
 * order is placed or paid, so the two numbers on a row are counted facts, not
 * running totals that could drift.
 *
 * Same material as Discounts and Meta: `.k-ground` behind, `.k-glass` panels
 * on it, `.k-lift` on what lifts. No new colours, no new radii.
 */
import { Form, Link, useSearchParams } from "react-router";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/admin.customers";
import { requireUser } from "~/lib/auth.server";
import { resolveAdminStore } from "~/lib/admin.server";
import { money } from "~/lib/money";
import { card, Empty } from "~/admin/ui";
import {
  abandonedCarts,
  customerDetail,
  customerList,
  type CustomerSort,
} from "~/lib/customers.server";
import {
  GlassGround,
  GlassPanel,
  StateBadge,
  Metric,
  QuietAction,
  glassBody,
  glassRule,
  glassInput,
} from "~/admin/connection-glass";

export function meta() {
  return [{ title: "Customers — Shop Admin" }];
}

const SORTS: CustomerSort[] = ["recent", "spend", "orders", "name"];
const PER_PAGE = 50;

const STATE_LABEL: Record<string, string> = {
  new: "Unfulfilled",
  ordered: "Ordered with supplier",
  fulfilled: "Fulfilled",
  refunded: "Refunded",
  cancelled: "Cancelled",
};

/** What a visitor event was, in his words rather than the column's. */
const EVENT_LABEL: Record<string, string> = {
  view: "Looked at",
  cart: "Added to cart",
  checkout: "Reached checkout",
  purchase: "Paid",
  leave: "Left",
};

function when(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ago(value: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

export async function loader({ context, request }: Route.LoaderArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  if (!store) {
    return { store: null, list: null, abandoned: [], detail: null, query: "", sort: "recent" as CustomerSort };
  }

  const query = url.searchParams.get("q") ?? "";
  const sortParam = url.searchParams.get("sort") ?? "recent";
  const sort = (SORTS.includes(sortParam as CustomerSort) ? sortParam : "recent") as CustomerSort;
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const openId = url.searchParams.get("customer");

  const [list, carts, detail] = await Promise.all([
    customerList(context.db, store.id, { query, sort, page, perPage: PER_PAGE }),
    abandonedCarts(context.db, store.id),
    openId ? customerDetail(context.db, store.id, openId) : Promise.resolve(null),
  ]);

  return {
    store: { slug: store.slug, name: store.name, currency: store.currency },
    query,
    sort,
    list: {
      ...list,
      rows: list.rows.map((row) => ({
        ...row,
        lastSeenAt: row.lastSeenAt.toISOString(),
        openCart: row.openCart
          ? { ...row.openCart, updatedAt: row.openCart.updatedAt.toISOString() }
          : null,
      })),
    },
    abandoned: carts.map((cart) => ({
      cartId: cart.cartId,
      customerId: cart.customerId,
      email: cart.email,
      name: cart.name,
      valueCents: cart.valueCents,
      updatedAt: cart.updatedAt.toISOString(),
      summary: cart.items
        .map((item) => (item.quantity > 1 ? `${item.quantity} × ${item.label}` : item.label))
        .join(", "),
    })),
    detail: detail
      ? {
          id: detail.customer.id,
          email: detail.customer.email,
          name: detail.customer.name ?? "",
          phone: detail.customer.phone ?? "",
          location: [detail.customer.city, detail.customer.region, detail.customer.country]
            .filter(Boolean)
            .join(", "),
          consent: detail.customer.marketingConsent,
          firstSeenAt: new Date(detail.customer.firstSeenAt).toISOString(),
          lastSeenAt: new Date(detail.customer.lastSeenAt).toISOString(),
          ordersCount: detail.customer.ordersCount,
          totalSpentCents: detail.customer.totalSpentCents,
          orders: detail.orders.map((order) => ({
            id: order.id,
            number: order.number,
            createdAt: order.createdAt.toISOString(),
            summary: order.summary,
            total: money(order.totalCents, order.currency),
            state: STATE_LABEL[order.state] ?? order.state,
            paid: order.paymentStatus === "paid",
          })),
          openCart: detail.openCart
            ? {
                valueCents: detail.openCart.valueCents,
                abandoned: detail.openCart.abandoned,
                updatedAt: detail.openCart.updatedAt.toISOString(),
                items: detail.openCart.items.map((item) => ({
                  label: item.label,
                  productTitle: item.productTitle,
                  quantity: item.quantity,
                  lineTotal: money(item.lineTotalCents),
                })),
              }
            : null,
          journey: detail.journey.map((step) => ({
            type: step.type,
            path: step.path ?? "",
            at: step.at.toISOString(),
          })),
          journeyUnavailable: detail.journeyUnavailable,
        }
      : null,
  };
}

export default function Customers({ loaderData }: Route.ComponentProps) {
  const { store, list, abandoned, detail, query, sort } = loaderData;
  const [params] = useSearchParams();

  if (!store || !list) {
    return (
      <div style={{ maxWidth: 640, margin: "40px auto", ...card }}>
        <Empty title="No store yet" help="Create a store first." />
      </div>
    );
  }

  const currency = store.currency;
  const suffix = `?store=${store.slug}`;
  const abandonedByEmail = new Set(abandoned.map((cart) => cart.email));
  const linkTo = (id: string) => {
    const next = new URLSearchParams(params);
    next.set("store", store.slug);
    next.set("customer", id);
    return `/admin/customers?${next}`;
  };
  const closeTo = () => {
    const next = new URLSearchParams(params);
    next.set("store", store.slug);
    next.delete("customer");
    return `/admin/customers?${next}`;
  };

  const abandonedValue = abandoned.reduce((sum, cart) => sum + cart.valueCents, 0);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 20, lineHeight: "28px", fontWeight: 650 }}>Customers · {store.name}</h1>
        <StateBadge
          state={list.total > 0 ? "on" : "off"}
          label={list.total > 0 ? `${list.total.toLocaleString("en-US")} known` : "Nobody yet"}
        />
      </div>

      <GlassGround>
        <GlassPanel
          title="Who this store knows"
          sub="A person is here because they typed their email at this checkout. A visitor who typed nothing stays anonymous and is not counted."
        >
          <div style={glassBody}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 14 }}>
              <Metric label="People" value={list.total} note="Gave an email here" />
              <Metric
                label="Carts left behind"
                value={abandoned.length}
                note={`Worth ${money(abandonedValue, currency)}`}
              />
              <Metric
                label="Accept marketing"
                value={list.rows.filter((row) => row.marketingConsent).length}
                note="On this page — what they ticked"
              />
            </div>
          </div>
        </GlassPanel>

        {detail ? (
          <GlassPanel
            title={detail.name || detail.email}
            sub={detail.name ? detail.email : "No name given — they only ever typed an email."}
            aside={
              <Link to={closeTo()} style={quietLink}>
                Back to everyone
              </Link>
            }
          >
            <div style={glassBody}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 14 }}>
                <Metric label="Orders" value={detail.ordersCount} note="Counted from orders" />
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-2)" }}>Total spent</span>
                  <span style={{ fontSize: 26, lineHeight: "32px", fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>
                    {money(detail.totalSpentCents, currency)}
                  </span>
                  <span style={{ fontSize: 11, lineHeight: "16px", color: "var(--ink-2)" }}>Net of refunds</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-2)" }}>Email marketing</span>
                  <span style={{ marginTop: 4 }}>
                    <StateBadge
                      state={detail.consent ? "on" : "off"}
                      label={detail.consent ? "They ticked the box" : "Did not tick the box"}
                    />
                  </span>
                  <span style={{ fontSize: 11, lineHeight: "16px", color: "var(--ink-2)" }}>
                    {detail.consent ? "You may email them." : "Do not email them marketing."}
                  </span>
                </div>
              </div>

              <hr style={glassRule} />

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14, fontSize: 13 }}>
                <Line label="Phone" value={detail.phone} />
                <Line label="Where they were" value={detail.location} />
                <Line label="First seen" value={when(detail.firstSeenAt)} />
                <Line label="Last seen" value={`${when(detail.lastSeenAt)} · ${ago(detail.lastSeenAt)}`} />
              </div>

              <hr style={glassRule} />

              <div style={{ fontSize: 12, fontWeight: 650 }}>In their cart right now</div>
              {detail.openCart ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
                  {detail.openCart.items.map((item, index) => (
                    <div key={index} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        {item.quantity > 1 ? `${item.quantity} × ` : ""}
                        {item.label}
                        <span style={{ color: "var(--ink-2)" }}> · {item.productTitle}</span>
                      </span>
                      <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 550 }}>{item.lineTotal}</span>
                    </div>
                  ))}
                  <div style={{ fontSize: 12, color: "var(--ink-2)" }}>
                    {money(detail.openCart.valueCents, currency)} · last touched {ago(detail.openCart.updatedAt)}
                    {detail.openCart.abandoned ? " · left behind" : ""}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "var(--ink-2)" }}>Nothing in their cart.</div>
              )}

              <hr style={glassRule} />

              <div style={{ fontSize: 12, fontWeight: 650 }}>Orders</div>
              {detail.orders.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--ink-2)" }}>They have never paid. Only the email was given.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {detail.orders.map((order) => (
                    <Link
                      key={order.id}
                      to={`/admin/orders/${order.id}${suffix}`}
                      className="k-hover"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 0",
                        borderBottom: "1px solid rgba(48,48,48,.08)",
                        color: "var(--ink)",
                        textDecoration: "none",
                        fontSize: 13,
                      }}
                    >
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span
                          style={{
                            display: "block",
                            fontFamily: "'JetBrains Mono',monospace",
                            fontSize: 12,
                            fontWeight: 600,
                            color: "var(--link)",
                          }}
                        >
                          #{order.number}
                        </span>
                        <span style={{ display: "block", fontSize: 12, color: "var(--ink-2)" }}>
                          {when(order.createdAt)}
                          {order.summary ? ` · ${order.summary}` : ""}
                        </span>
                      </span>
                      <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 550 }}>{order.total}</span>
                      <StateBadge state={order.paid ? "on" : "connecting"} label={order.state} />
                    </Link>
                  ))}
                </div>
              )}

              <hr style={glassRule} />

              <div style={{ fontSize: 12, fontWeight: 650 }}>Their journey</div>
              {detail.journeyUnavailable ? (
                <div style={{ fontSize: 13, color: "var(--ink-2)" }}>
                  No visit was recorded against this person, so there is nothing to show. This happens when they
                  arrived without tracking, or the order came in through the webhook rather than the page.
                </div>
              ) : detail.journey.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--ink-2)" }}>No pages recorded on their last visit.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                  {detail.journey.map((step, index) => (
                    <div key={index} style={{ display: "flex", gap: 10 }}>
                      <span style={{ width: 130, color: "var(--ink-2)", fontVariantNumeric: "tabular-nums" }}>
                        {when(step.at)}
                      </span>
                      <span style={{ fontWeight: 550 }}>{EVENT_LABEL[step.type] ?? step.type}</span>
                      <span style={{ color: "var(--ink-2)", overflowWrap: "anywhere" }}>{step.path}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </GlassPanel>
        ) : null}

        <GlassPanel
          title="Everyone"
          sub="Search by name, email or town. A row with a cart marker has something sitting in a cart that never became an order."
        >
          <div style={glassBody}>
            <Form method="get" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <input type="hidden" name="store" value={store.slug} />
              <input
                name="q"
                defaultValue={query}
                placeholder="Search name, email or town"
                style={{ ...glassInput, flex: "1 1 220px" }}
              />
              <select name="sort" defaultValue={sort} style={{ ...glassInput, flex: "0 0 auto", width: 170 }}>
                <option value="recent">Last seen</option>
                <option value="spend">Total spent</option>
                <option value="orders">Orders</option>
                <option value="name">Name</option>
              </select>
              <QuietAction type="submit">Search</QuietAction>
            </Form>

            {list.rows.length === 0 ? (
              <Empty
                title={query ? "Nothing matches" : "Nobody yet"}
                help={
                  query
                    ? "Try another search."
                    : "Someone appears here the moment they type their email at checkout — before they pay, and whether or not they ever do."
                }
              />
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--ink-2)", fontSize: 11, fontWeight: 600 }}>
                      <th style={cell}>Name</th>
                      <th style={cell}>Email</th>
                      <th style={cell}>Where</th>
                      <th style={{ ...cell, textAlign: "right" }}>Orders</th>
                      <th style={{ ...cell, textAlign: "right" }}>Total spent</th>
                      <th style={cell}>Last seen</th>
                      <th style={cell}>Cart</th>
                      <th style={cell}>Marketing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.rows.map((row) => {
                      const left = row.openCart?.abandoned || abandonedByEmail.has(row.email);
                      return (
                        <tr key={row.id}>
                          <td style={{ ...cell, fontWeight: 600 }}>
                            <Link to={linkTo(row.id)} style={{ color: "var(--link)", textDecoration: "none" }}>
                              {/* No name given stays blank — never a placeholder. */}
                              {row.name || row.email}
                            </Link>
                          </td>
                          <td style={{ ...cell, color: "var(--ink-2)", overflowWrap: "anywhere" }}>{row.email}</td>
                          <td style={{ ...cell, color: "var(--ink-2)" }}>{row.location || "—"}</td>
                          <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                            {row.ordersCount}
                          </td>
                          <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 550 }}>
                            {money(row.totalSpentCents, currency)}
                          </td>
                          <td style={{ ...cell, color: "var(--ink-2)", whiteSpace: "nowrap" }}>{ago(row.lastSeenAt)}</td>
                          <td style={cell}>
                            {row.openCart ? (
                              <StateBadge
                                state={left ? "connecting" : "on"}
                                label={`${left ? "Left behind" : "In cart"} · ${money(row.openCart.valueCents, currency)}`}
                              />
                            ) : (
                              <span style={{ color: "var(--ink-3)" }}>—</span>
                            )}
                          </td>
                          <td style={cell}>
                            <StateBadge state={row.marketingConsent ? "on" : "off"} label={row.marketingConsent ? "Yes" : "No"} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {list.pageCount > 1 ? (
              <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 12, color: "var(--ink-2)" }}>
                <span>
                  Page {list.page} of {list.pageCount}
                </span>
                {list.page > 1 ? (
                  <Link to={pageLink(params, store.slug, list.page - 1)} style={quietLink}>
                    Previous
                  </Link>
                ) : null}
                {list.page < list.pageCount ? (
                  <Link to={pageLink(params, store.slug, list.page + 1)} style={quietLink}>
                    Next
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        </GlassPanel>

        <GlassPanel
          title="Carts left behind"
          sub="An email was given, nothing was bought, and the cart has not been touched for an hour. This is the list a recovery email would go to."
        >
          <div style={glassBody}>
            {abandoned.length === 0 ? (
              <Empty
                title="None"
                help="A cart only appears here once someone has typed their email. A cart with no email belongs to nobody and is not listed."
              />
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--ink-2)", fontSize: 11, fontWeight: 600 }}>
                      <th style={cell}>Who</th>
                      <th style={cell}>In the cart</th>
                      <th style={{ ...cell, textAlign: "right" }}>Worth</th>
                      <th style={cell}>Last touched</th>
                    </tr>
                  </thead>
                  <tbody>
                    {abandoned.map((cart) => (
                      <tr key={cart.cartId}>
                        <td style={cell}>
                          {cart.customerId ? (
                            <Link to={linkTo(cart.customerId)} style={{ color: "var(--link)", textDecoration: "none" }}>
                              {cart.name || cart.email}
                            </Link>
                          ) : (
                            cart.email
                          )}
                        </td>
                        <td style={{ ...cell, color: "var(--ink-2)" }}>{cart.summary}</td>
                        <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 550 }}>
                          {money(cart.valueCents, currency)}
                        </td>
                        <td style={{ ...cell, color: "var(--ink-2)", whiteSpace: "nowrap" }}>{ago(cart.updatedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </GlassPanel>
      </GlassGround>
    </div>
  );
}

/** QuietAction's look on a link, since that helper only renders a button. */
const quietLink: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  height: 34,
  padding: "0 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,.8)",
  background: "rgba(255,255,255,.55)",
  color: "var(--ink)",
  fontSize: 13,
  fontWeight: 600,
  textDecoration: "none",
};

const cell: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid rgba(48,48,48,.08)",
  verticalAlign: "middle",
};

function pageLink(params: URLSearchParams, slug: string, page: number): string {
  const next = new URLSearchParams(params);
  next.set("store", slug);
  next.set("page", String(page));
  return `/admin/customers?${next}`;
}

/** A stored value, or a visible dash. Never a made-up one. */
function Line({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-2)" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: value ? "var(--ink)" : "var(--ink-3)", overflowWrap: "anywhere" }}>
        {value || "Not given"}
      </span>
    </div>
  );
}

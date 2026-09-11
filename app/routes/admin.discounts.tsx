/**
 * Discounts.
 *
 * Codes for this store, what they are worth, and how many real orders have
 * used them. Every number on this screen is counted from
 * `discount_redemptions`, which only gets a row when an order is paid — so a
 * code that has never sold anything says zero, and nothing here is a guess.
 *
 * Built in the same material as Meta: `.k-ground` behind, `.k-glass` panels on
 * it, `.k-lift` on the things that lift. No new colours, no new radii.
 */
import { useState } from "react";
import { useFetcher } from "react-router";
import { and, asc, eq, sql } from "drizzle-orm";
import type { Route } from "./+types/admin.discounts";
import { requireUser } from "~/lib/auth.server";
import { resolveAdminStore } from "~/lib/admin.server";
import { discounts, discountRedemptions } from "~/db/schema";
import { money, centsFromInput, centsToInput } from "~/lib/money";
import { card, Empty } from "~/admin/ui";
import {
  GlassGround,
  GlassPanel,
  GlassNotice,
  StateBadge,
  Metric,
  PrimaryAction,
  QuietAction,
  glassBody,
  glassRule,
  glassField,
  glassInput,
  type ConnState,
} from "~/admin/connection-glass";
import { DISCOUNT_KINDS, discountLabel, discountStatus, normaliseCode, redemptionTotals } from "~/lib/discounts.server";

export function meta() {
  return [{ title: "Discounts — Shop Admin" }];
}

/** A date input wants "YYYY-MM-DD"; null stays empty rather than becoming today. */
function dateInput(value: Date | string | null): string {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

/** Reads a date box. An empty box is null, never "now". */
function dateFromInput(value: string, endOfDay = false): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(`${trimmed}T${endOfDay ? "23:59:59" : "00:00:00"}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function loader({ context, request }: Route.LoaderArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  if (!store) return { store: null, rows: [] };

  const [codes, totals] = await Promise.all([
    context.db
      .select()
      .from(discounts)
      .where(eq(discounts.storeId, store.id))
      .orderBy(asc(discounts.code)),
    redemptionTotals(context.db, store.id),
  ]);

  const now = new Date();

  return {
    store: { slug: store.slug, name: store.name, currency: store.currency },
    rows: codes.map((row) => {
      const seen = totals.get(row.id) ?? { count: 0, amountCents: 0 };
      return {
        id: row.id,
        code: row.code,
        kind: row.kind,
        value: row.value,
        appliesTo: row.appliesTo,
        startsAt: row.startsAt ? new Date(row.startsAt).toISOString() : null,
        endsAt: row.endsAt ? new Date(row.endsAt).toISOString() : null,
        usageLimit: row.usageLimit,
        oncePerCustomer: row.oncePerCustomer,
        minimumSubtotalCents: row.minimumSubtotalCents,
        active: row.active,
        label: discountLabel(row, store.currency),
        status: discountStatus(row, now),
        /** counted from the redemption rows, not from the cached counter */
        usedCount: seen.count,
        discountedCents: seen.amountCents,
      };
    }),
  };
}

export async function action({ context, request }: Route.ActionArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  if (!store) return { error: "Create a store first." };

  const form = await request.formData();
  const intent = String(form.get("intent") || "save");
  const id = String(form.get("id") || "");

  if (intent === "toggle") {
    const active = form.get("active") === "on";
    await context.db
      .update(discounts)
      .set({ active })
      .where(and(eq(discounts.id, id), eq(discounts.storeId, store.id)));
    return { ok: active ? "That code is active again." : "That code is off. Nobody can use it now." };
  }

  if (intent === "delete") {
    // A code that has been used is part of an order's history. Deleting it
    // would take that history with it, so it is refused and the reason said.
    const [used] = await context.db
      .select({ n: sql<number>`cast(count(*) as int)` })
      .from(discountRedemptions)
      .where(eq(discountRedemptions.discountId, id));
    if ((used?.n ?? 0) > 0) {
      return {
        error: `This code has been used on ${used.n} order${used.n === 1 ? "" : "s"}, so it cannot be deleted — that would take those orders' history with it. Turn it off instead.`,
      };
    }
    await context.db
      .delete(discounts)
      .where(and(eq(discounts.id, id), eq(discounts.storeId, store.id)));
    return { ok: "Deleted." };
  }

  const code = normaliseCode(String(form.get("code") || ""));
  const kind = String(form.get("kind") || "percentage");
  const appliesTo = kind === "free_shipping" ? "shipping" : "order";

  if (!code) return { error: "A discount needs a code — that is what the customer types." };
  if (!/^[A-Z0-9._-]{2,40}$/.test(code)) {
    return { error: "A code can use letters, numbers, dots, dashes and underscores, 2 to 40 characters." };
  }
  if (!DISCOUNT_KINDS.includes(kind as (typeof DISCOUNT_KINDS)[number])) {
    return { error: "Pick what kind of discount this is." };
  }

  let value = 0;
  if (kind === "percentage") {
    value = Math.round(Number(form.get("percent")));
    if (!Number.isFinite(value) || value < 1 || value > 100) {
      return { error: "A percentage is a whole number from 1 to 100." };
    }
  } else if (kind === "fixed") {
    const cents = centsFromInput(String(form.get("amount") || ""));
    if (cents === null || cents < 1) {
      return { error: "Put the amount off in, like 10 or 10.00." };
    }
    value = cents;
  }

  const minimumRaw = String(form.get("minimum") || "").trim();
  let minimumSubtotalCents: number | null = null;
  if (minimumRaw) {
    const cents = centsFromInput(minimumRaw);
    if (cents === null) return { error: "The minimum order amount does not read as money." };
    minimumSubtotalCents = cents;
  }

  const limitRaw = String(form.get("usageLimit") || "").trim();
  let usageLimit: number | null = null;
  if (limitRaw) {
    const parsed = Number(limitRaw);
    if (!Number.isInteger(parsed) || parsed < 1) {
      return { error: "A usage limit is a whole number of uses, or leave it empty for no limit." };
    }
    usageLimit = parsed;
  }

  const startsAt = dateFromInput(String(form.get("startsAt") || ""));
  const endsAt = dateFromInput(String(form.get("endsAt") || ""), true);
  if (startsAt && endsAt && endsAt < startsAt) {
    return { error: "The end date is before the start date." };
  }

  const values = {
    code,
    kind,
    value,
    appliesTo,
    startsAt,
    endsAt,
    usageLimit,
    oncePerCustomer: form.get("oncePerCustomer") === "on",
    minimumSubtotalCents,
    active: form.get("active") === "on",
  };

  try {
    if (id) {
      await context.db
        .update(discounts)
        .set(values)
        .where(and(eq(discounts.id, id), eq(discounts.storeId, store.id)));
      return { ok: `${code} saved.` };
    }
    await context.db.insert(discounts).values({ storeId: store.id, ...values });
    return { ok: `${code} created.` };
  } catch (error) {
    // The unique index on (storeId, code) is what stops two of the same code.
    const message = error instanceof Error ? error.message : "";
    if (/unique|duplicate/i.test(message)) {
      return { error: `This store already has a code called ${code}.` };
    }
    throw error;
  }
}

/* --------------------------------------------------------------- screen --
   Presentation only below. Every figure comes from the loader, which counts
   real redemption rows; nothing on this screen is computed hopefully. */

type Row = Awaited<ReturnType<typeof loader>>["rows"][number];

const STATUS_STATE: Record<string, ConnState> = {
  active: "on",
  scheduled: "connecting",
  expired: "off",
  "limit reached": "off",
  inactive: "off",
};

export default function Discounts({ loaderData }: Route.ComponentProps) {
  const { store, rows } = loaderData;
  const fetcher = useFetcher<typeof action>();
  const [editing, setEditing] = useState<Row | null>(null);
  const [creating, setCreating] = useState(false);

  if (!store) {
    return (
      <div style={{ maxWidth: 640, margin: "40px auto", ...card }}>
        <Empty title="No store yet" help="Create a store first." />
      </div>
    );
  }

  const result = fetcher.data as { ok?: string; error?: string } | undefined;
  const busy = fetcher.state !== "idle";
  const currency = store.currency;

  const liveCount = rows.filter((row) => row.status === "active").length;
  const usedTotal = rows.reduce((sum, row) => sum + row.usedCount, 0);
  const discountedTotal = rows.reduce((sum, row) => sum + row.discountedCents, 0);

  const closeForm = () => {
    setEditing(null);
    setCreating(false);
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 20, lineHeight: "28px", fontWeight: 650 }}>Discounts · {store.name}</h1>
        <StateBadge
          state={liveCount > 0 ? "on" : "off"}
          label={liveCount > 0 ? `${liveCount} active` : "None active"}
        />
      </div>

      <GlassGround>
        <GlassPanel
          title="What codes have done"
          sub="Counted from orders that were actually paid. Typing a code records nothing."
        >
          <div style={glassBody}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 14 }}>
              <Metric label="Codes" value={rows.length} note={`${liveCount} usable right now`} />
              <Metric label="Times used" value={usedTotal} note="One per paid order" />
              <MoneyMetric label="Total discounted" cents={discountedTotal} currency={currency} />
            </div>
          </div>
        </GlassPanel>

        <GlassPanel
          title="Codes"
          sub="Status is worked out from the dates, the limit, and whether the code is switched on."
          aside={
            <PrimaryAction
              type="button"
              onClick={() => {
                setEditing(null);
                setCreating(true);
              }}
            >
              Create discount
            </PrimaryAction>
          }
        >
          <div style={glassBody}>
            {result?.error ? <GlassNotice kind="critical">{result.error}</GlassNotice> : null}
            {result?.ok ? (
              <div style={{ fontSize: 12, color: "var(--ink-2)" }}>{result.ok}</div>
            ) : null}

            {creating || editing ? (
              <DiscountForm
                key={editing?.id ?? "new"}
                row={editing}
                currency={currency}
                busy={busy}
                fetcher={fetcher}
                onCancel={closeForm}
              />
            ) : null}

            {rows.length === 0 ? (
              <Empty
                title="No discount codes yet"
                help="A code here is what a customer types at the cart or checkout. Nothing is applied until one exists."
              />
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--ink-2)", fontSize: 11, fontWeight: 600 }}>
                      <th style={cell}>Code</th>
                      <th style={cell}>Worth</th>
                      <th style={cell}>Status</th>
                      <th style={{ ...cell, textAlign: "right" }}>Used</th>
                      <th style={{ ...cell, textAlign: "right" }}>Discounted</th>
                      <th style={{ ...cell, textAlign: "right" }}>&nbsp;</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id}>
                        <td style={{ ...cell, fontFamily: "'JetBrains Mono',monospace", fontWeight: 600 }}>
                          {row.code}
                        </td>
                        <td style={cell}>
                          {row.label}
                          {row.minimumSubtotalCents ? (
                            <span style={{ color: "var(--ink-2)" }}>
                              {" "}
                              · over {money(row.minimumSubtotalCents, currency)}
                            </span>
                          ) : null}
                        </td>
                        <td style={cell}>
                          <StateBadge state={STATUS_STATE[row.status] ?? "off"} label={row.status} />
                        </td>
                        <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {row.usedCount.toLocaleString("en-US")}
                          {row.usageLimit != null ? (
                            <span style={{ color: "var(--ink-2)" }}> / {row.usageLimit}</span>
                          ) : null}
                        </td>
                        <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {money(row.discountedCents, currency)}
                        </td>
                        <td style={{ ...cell, textAlign: "right", whiteSpace: "nowrap" }}>
                          <QuietAction
                            type="button"
                            onClick={() => {
                              setCreating(false);
                              setEditing(row);
                            }}
                          >
                            Edit
                          </QuietAction>{" "}
                          <QuietAction
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              fetcher.submit(
                                { intent: "toggle", id: row.id, ...(row.active ? {} : { active: "on" }) },
                                { method: "post" },
                              )
                            }
                          >
                            {row.active ? "Turn off" : "Turn on"}
                          </QuietAction>{" "}
                          <QuietAction
                            type="button"
                            disabled={busy}
                            title={
                              row.usedCount > 0
                                ? "This code is on real orders, so it can only be turned off"
                                : undefined
                            }
                            style={{ color: "var(--critical)" }}
                            onClick={() => fetcher.submit({ intent: "delete", id: row.id }, { method: "post" })}
                          >
                            Delete
                          </QuietAction>
                        </td>
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

const cell: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid rgba(48,48,48,.08)",
  verticalAlign: "middle",
};

/** Money has no Metric of its own; this is Metric's shape with a money value. */
function MoneyMetric({ label, cents, currency }: { label: string; cents: number; currency: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-2)" }}>{label}</span>
      <span style={{ fontSize: 26, lineHeight: "32px", fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>
        {money(cents, currency)}
      </span>
      <span style={{ fontSize: 11, lineHeight: "16px", color: "var(--ink-2)" }}>Across every paid order</span>
    </div>
  );
}

function DiscountForm({
  row,
  currency,
  busy,
  fetcher,
  onCancel,
}: {
  row: Row | null;
  currency: string;
  busy: boolean;
  fetcher: ReturnType<typeof useFetcher<typeof action>>;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState(row?.kind ?? "percentage");

  return (
    <fetcher.Form
      method="post"
      style={{ display: "flex", flexDirection: "column", gap: 14, animation: "kFade .22s ease-out" }}
    >
      <input type="hidden" name="intent" value="save" />
      {row ? <input type="hidden" name="id" value={row.id} /> : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
        <label style={glassField}>
          Code
          <input
            name="code"
            defaultValue={row?.code ?? ""}
            placeholder="TEST99"
            style={{ ...glassInput, textTransform: "uppercase" }}
          />
        </label>

        <label style={glassField}>
          Kind
          <select name="kind" value={kind} onChange={(event) => setKind(event.target.value)} style={glassInput}>
            <option value="percentage">Percentage off</option>
            <option value="fixed">Amount off</option>
            <option value="free_shipping">Free shipping</option>
          </select>
        </label>

        {kind === "percentage" ? (
          <label style={glassField}>
            Percent off
            <input
              name="percent"
              type="number"
              min={1}
              max={100}
              defaultValue={row && row.kind === "percentage" ? row.value : ""}
              placeholder="99"
              style={glassInput}
            />
          </label>
        ) : null}

        {kind === "fixed" ? (
          <label style={glassField}>
            Amount off ({currency})
            <input
              name="amount"
              defaultValue={row && row.kind === "fixed" ? centsToInput(row.value) : ""}
              placeholder="10.00"
              style={glassInput}
            />
          </label>
        ) : null}

        <label style={glassField}>
          Minimum order ({currency})
          <input
            name="minimum"
            defaultValue={centsToInput(row?.minimumSubtotalCents ?? null)}
            placeholder="no minimum"
            style={glassInput}
          />
        </label>

        <label style={glassField}>
          Starts
          <input name="startsAt" type="date" defaultValue={dateInput(row?.startsAt ?? null)} style={glassInput} />
        </label>

        <label style={glassField}>
          Ends
          <input name="endsAt" type="date" defaultValue={dateInput(row?.endsAt ?? null)} style={glassInput} />
        </label>

        <label style={glassField}>
          Usage limit
          <input
            name="usageLimit"
            type="number"
            min={1}
            defaultValue={row?.usageLimit ?? ""}
            placeholder="no limit"
            style={glassInput}
          />
        </label>
      </div>

      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 12, color: "var(--ink-2)" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <input type="checkbox" name="active" defaultChecked={row ? row.active : true} />
          Switched on
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <input type="checkbox" name="oncePerCustomer" defaultChecked={row?.oncePerCustomer ?? false} />
          One use per customer
        </label>
      </div>

      <hr style={glassRule} />

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <PrimaryAction type="submit" disabled={busy}>
          {busy ? "Saving…" : row ? "Save changes" : "Create discount"}
        </PrimaryAction>
        <QuietAction type="button" onClick={onCancel}>
          Cancel
        </QuietAction>
      </div>
    </fetcher.Form>
  );
}

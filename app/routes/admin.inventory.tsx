/**
 * Inventory: stock per bundle option.
 *
 * Deliberately small — counts he types, not forecasting. Committed is derived
 * from orders that are paid but not yet fulfilled, so it cannot drift from
 * what the orders table actually says.
 */
import { Form, useSubmit } from "react-router";
import { useState } from "react";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/admin.inventory";
import { requireUser } from "~/lib/auth.server";
import { resolveAdminStore, listProducts } from "~/lib/admin.server";
import { variants as variantsTable } from "~/db/schema";
import { card, Empty } from "~/admin/ui";

export function meta() {
  return [{ title: "Inventory — Shop Admin" }];
}

export async function loader({ context, request }: Route.LoaderArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  if (!store) return { store: null, rows: [], total: 0, query: "", lowOnly: false };

  const query = (url.searchParams.get("q") || "").toLowerCase();
  const lowOnly = url.searchParams.get("low") === "on";

  const entries = await listProducts(context.db, store.id);
  const all = entries.flatMap((entry) =>
    entry.variants.map((variant) => ({
      id: variant.id,
      product: entry.product.title,
      variant: variant.label,
      sku: variant.sku ?? "",
      available: variant.available,
      committed: variant.committed,
      incoming: variant.incoming,
      threshold: variant.lowStockThreshold,
      low: variant.lowStockThreshold > 0 && variant.available <= variant.lowStockThreshold,
    })),
  );

  const rows = all
    .filter((row) => !query || `${row.product} ${row.variant} ${row.sku}`.toLowerCase().includes(query))
    .filter((row) => !lowOnly || row.low);

  return { store: { slug: store.slug, name: store.name }, rows, total: all.length, query, lowOnly };
}

export async function action({ context, request }: Route.ActionArgs) {
  await requireUser(context.db, request);
  const form = await request.formData();
  const intent = String(form.get("intent") || "");
  const id = String(form.get("variantId") || "");
  if (!id) return { error: "Nothing to change." };

  const [current] = await context.db
    .select()
    .from(variantsTable)
    .where(eq(variantsTable.id, id))
    .limit(1);
  if (!current) return { error: "That option no longer exists." };

  if (intent === "threshold") {
    const value = Math.max(0, Number(form.get("threshold")) || 0);
    await context.db.update(variantsTable).set({ lowStockThreshold: value }).where(eq(variantsTable.id, id));
    return { ok: true };
  }

  // Steppers and the adjustment modal are the same write: available moves by a
  // delta. There is no stock-ledger table, so the reason is not recorded.
  const delta =
    intent === "step"
      ? Number(form.get("delta")) || 0
      : intent === "adjust"
        ? Number(String(form.get("qty") || "").replace("−", "-")) || 0
        : 0;
  if (!delta) return { error: "Enter a quantity." };

  await context.db
    .update(variantsTable)
    .set({ available: Math.max(0, current.available + delta) })
    .where(eq(variantsTable.id, id));

  return { ok: true };
}

export default function Inventory({ loaderData }: Route.ComponentProps) {
  const { store, rows, total, query, lowOnly } = loaderData;
  const submit = useSubmit();
  const [adjust, setAdjust] = useState<{ id: string; name: string; from: number } | null>(null);
  const [adjustQty, setAdjustQty] = useState("");

  if (!store) {
    return (
      <div style={{ maxWidth: 640, margin: "40px auto", ...card }}>
        <Empty title="No store yet" help="Create a store first." />
      </div>
    );
  }

  const emptyTitle = total ? "Nothing matches" : "No stock to track yet";
  const emptyBody = total
    ? "Try another search, or turn off the low-stock filter."
    : "Add a product with bundle options in Products — each option becomes a tracked variant here.";

  const delta = Number(adjustQty.replace("−", "-")) || 0;
  const adjustTo = adjust ? Math.max(0, adjust.from + delta) : 0;

  return (
    <>
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <h1 style={{ margin: 0, fontSize: 20, lineHeight: "28px", fontWeight: 650 }}>Inventory</h1>
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            boxShadow: "var(--shadow)",
            overflow: "hidden",
          }}
        >
          <Form
            method="get"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              borderBottom: "1px solid var(--border)",
              flexWrap: "wrap",
            }}
          >
            <input type="hidden" name="store" value={store.slug} />
            <input
              name="q"
              defaultValue={query}
              placeholder="Search product or SKU"
              style={{
                flex: 1,
                minWidth: 170,
                height: 32,
                padding: "0 12px",
                borderRadius: 8,
                border: "1px solid var(--input-border)",
                background: "var(--input)",
                fontSize: 13,
              }}
            />
            {/* The store filter is omitted: there is one store. */}
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--ink-2)" }}>
              <input
                type="checkbox"
                name="low"
                defaultChecked={lowOnly}
                onChange={(event) => event.currentTarget.form?.requestSubmit()}
                style={{ width: 16, height: 16, accentColor: "var(--focus)" }}
              />
              Low stock only
            </label>
          </Form>
          {rows.length === 0 ? (
            <div
              style={{
                padding: "52px 16px",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
              }}
            >
              <div style={{ fontWeight: 650 }}>{emptyTitle}</div>
              <div style={{ color: "var(--ink-2)", maxWidth: 360 }}>{emptyBody}</div>
            </div>
          ) : null}
          {rows.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                <thead>
                  <tr
                    style={{
                      height: 36,
                      color: "var(--ink-2)",
                      fontSize: 12,
                      fontWeight: 550,
                      textAlign: "left",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <th style={{ padding: "0 16px", fontWeight: 550 }}>Product</th>
                    <th style={{ padding: "0 12px", fontWeight: 550 }}>Variant</th>
                    <th style={{ padding: "0 12px", fontWeight: 550 }}>SKU</th>
                    <th style={{ padding: "0 12px", fontWeight: 550, textAlign: "center" }}>Available</th>
                    <th style={{ padding: "0 12px", fontWeight: 550, textAlign: "right" }}>Committed</th>
                    <th style={{ padding: "0 12px", fontWeight: 550, textAlign: "right" }}>Incoming</th>
                    <th style={{ padding: "0 12px", fontWeight: 550, textAlign: "right" }}>Threshold</th>
                    <th style={{ padding: "0 16px" }} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} style={{ height: 48, borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "0 16px" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontWeight: 550 }}>{r.product}</span>
                          {r.low ? (
                            <span
                              style={{
                                height: 19,
                                padding: "0 7px",
                                borderRadius: 8,
                                background: "var(--b-warning-bg)",
                                color: "var(--b-warning-fg)",
                                fontSize: 11,
                                fontWeight: 600,
                                display: "inline-flex",
                                alignItems: "center",
                              }}
                            >
                              Low
                            </span>
                          ) : null}
                        </span>
                        <span style={{ display: "block", fontSize: 12, color: "var(--ink-2)" }}>{store.name}</span>
                      </td>
                      <td style={{ padding: "0 12px" }}>{r.variant}</td>
                      <td style={{ padding: "0 12px", fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: "var(--ink-2)" }}>
                        {r.sku || "—"}
                      </td>
                      <td style={{ padding: "0 12px" }}>
                        <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                          <button
                            type="button"
                            onClick={() =>
                              submit({ intent: "step", variantId: r.id, delta: "-1" }, { method: "post" })
                            }
                            style={{
                              width: 26,
                              height: 26,
                              borderRadius: 7,
                              border: "1px solid var(--border)",
                              background: "var(--surface)",
                              color: "var(--ink)",
                              cursor: "pointer",
                              fontSize: 14,
                              lineHeight: 1,
                            }}
                          >
                            −
                          </button>
                          <span style={{ minWidth: 34, textAlign: "center", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                            {r.available}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              submit({ intent: "step", variantId: r.id, delta: "1" }, { method: "post" })
                            }
                            style={{
                              width: 26,
                              height: 26,
                              borderRadius: 7,
                              border: "1px solid var(--border)",
                              background: "var(--surface)",
                              color: "var(--ink)",
                              cursor: "pointer",
                              fontSize: 14,
                              lineHeight: 1,
                            }}
                          >
                            +
                          </button>
                        </span>
                      </td>
                      <td style={{ padding: "0 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--ink-2)" }}>
                        {r.committed}
                      </td>
                      <td style={{ padding: "0 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--ink-2)" }}>
                        {r.incoming}
                      </td>
                      <td style={{ padding: "0 12px", textAlign: "right" }}>
                        <input
                          defaultValue={r.threshold}
                          inputMode="numeric"
                          onBlur={(event) => {
                            if (Number(event.target.value) === r.threshold) return;
                            submit(
                              { intent: "threshold", variantId: r.id, threshold: event.target.value },
                              { method: "post" },
                            );
                          }}
                          style={{
                            width: 56,
                            height: 30,
                            padding: "0 8px",
                            borderRadius: 8,
                            border: "1px solid var(--input-border)",
                            background: "var(--input)",
                            fontSize: 13,
                            textAlign: "right",
                            color: "var(--ink)",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        />
                      </td>
                      <td style={{ padding: "0 16px", textAlign: "right" }}>
                        <button
                          type="button"
                          onClick={() => {
                            setAdjust({ id: r.id, name: `${r.product} · ${r.variant}`, from: r.available });
                            setAdjustQty("");
                          }}
                          style={{
                            height: 26,
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
                          Adjust stock
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>

      {adjust ? (
        <div
          onClick={() => setAdjust(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 86,
            background: "rgba(0,0,0,.45)",
            display: "grid",
            placeItems: "center",
            padding: 16,
            animation: "kFade .12s",
          }}
        >
          <Form
            method="post"
            onClick={(event) => event.stopPropagation()}
            onSubmit={() => setAdjust(null)}
            style={{
              width: "min(460px,100%)",
              background: "var(--elev)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              boxShadow: "var(--shadow-lg)",
              overflow: "hidden",
              animation: "kModal .16s ease-out",
            }}
          >
            <input type="hidden" name="intent" value="adjust" />
            <input type="hidden" name="variantId" value={adjust.id} />
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", fontWeight: 650, fontSize: 15 }}>
              Adjust stock · {adjust.name}
            </div>
            <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 550, color: "var(--ink-2)" }}>
                  Change by
                  <input
                    name="qty"
                    value={adjustQty}
                    onChange={(event) => setAdjustQty(event.target.value)}
                    placeholder="e.g. 25 or −4"
                    style={{
                      height: 36,
                      padding: "0 12px",
                      borderRadius: 8,
                      border: "1px solid var(--input-border)",
                      background: "var(--input)",
                      fontSize: 13,
                      color: "var(--ink)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, fontWeight: 550, color: "var(--ink-2)" }}>
                  Reason
                  {/* Rule 2: there is no stock-ledger table, so the reason is
                      not stored anywhere. */}
                  <select
                    name="reason"
                    disabled
                    style={{
                      height: 36,
                      borderRadius: 8,
                      border: "1px solid var(--input-border)",
                      background: "var(--input)",
                      padding: "0 8px",
                      fontSize: 13,
                      color: "var(--ink)",
                      opacity: 0.5,
                    }}
                  >
                    <option>Received from supplier</option>
                    <option>Damaged</option>
                    <option>Correction after count</option>
                    <option>Returned to supplier</option>
                  </select>
                  <span style={{ fontWeight: 450 }}>Not recorded yet — there is no stock history table.</span>
                </label>
              </div>
              <div style={{ padding: "10px 12px", borderRadius: 8, background: "var(--bg)", fontSize: 12, color: "var(--ink-2)" }}>
                Available goes from <strong style={{ color: "var(--ink)" }}>{adjust.from}</strong> to{" "}
                <strong style={{ color: "var(--ink)" }}>{adjustTo}</strong>.
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 20px", borderTop: "1px solid var(--border)" }}>
              <button
                type="button"
                onClick={() => setAdjust(null)}
                style={{
                  height: 32,
                  padding: "0 12px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  color: "var(--ink)",
                  fontSize: 12,
                  fontWeight: 550,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                style={{
                  height: 32,
                  padding: "0 14px",
                  borderRadius: 8,
                  border: 0,
                  background: "var(--accent)",
                  color: "var(--accent-ink)",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Save adjustment
              </button>
            </div>
          </Form>
        </div>
      ) : null}
    </>
  );
}

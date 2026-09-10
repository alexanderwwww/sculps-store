/**
 * Inventory: stock per bundle option.
 *
 * Deliberately small — counts he types, not forecasting. Committed is derived
 * from orders that are paid but not yet fulfilled, so it cannot drift from
 * what the orders table actually says.
 */
import { Form, useNavigation } from "react-router";
import type { Route } from "./+types/admin.inventory";
import { requireUser } from "~/lib/auth.server";
import { resolveAdminStore, listProducts, saveStock } from "~/lib/admin.server";
import { card, cardHeader, Empty, PageTitle, primaryButton, input, Badge } from "~/admin/ui";

export function meta() {
  return [{ title: "Inventory — Shop Admin" }];
}

export async function loader({ context, request }: Route.LoaderArgs) {
  await requireUser(context.db, request);
  const url = new URL(request.url);
  const { store } = await resolveAdminStore(context.db, url);
  if (!store) return { store: null, rows: [] };

  const entries = await listProducts(context.db, store.id);
  const rows = entries.flatMap((entry) =>
    entry.variants.map((variant) => ({
      id: variant.id,
      product: entry.product.title,
      label: variant.label,
      sku: variant.sku ?? "",
      available: variant.available,
      committed: variant.committed,
      incoming: variant.incoming,
      lowStockThreshold: variant.lowStockThreshold,
    })),
  );

  return { store: { slug: store.slug, name: store.name }, rows };
}

export async function action({ context, request }: Route.ActionArgs) {
  await requireUser(context.db, request);
  const form = await request.formData();

  const ids = form.getAll("variantId").map(String);
  const available = form.getAll("available").map((v) => Number(v) || 0);
  const incoming = form.getAll("incoming").map((v) => Number(v) || 0);
  const threshold = form.getAll("threshold").map((v) => Number(v) || 0);

  await saveStock(
    context.db,
    ids.map((id, index) => ({
      id,
      available: Math.max(0, available[index] ?? 0),
      incoming: Math.max(0, incoming[index] ?? 0),
      lowStockThreshold: Math.max(0, threshold[index] ?? 0),
    })),
  );

  return { ok: true };
}

export default function Inventory({ loaderData, actionData }: Route.ComponentProps) {
  const { store, rows } = loaderData;
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";

  if (!store) {
    return (
      <div style={{ maxWidth: 640, margin: "40px auto", ...card }}>
        <Empty title="No store yet" help="Create a store first." />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <PageTitle
        title="Inventory"
        actions={actionData?.ok ? <span style={{ color: "var(--b-success-fg)", fontSize: 12, fontWeight: 550, alignSelf: "center" }}>Saved</span> : undefined}
      />

      <Form method="post" style={card}>
        <div style={cardHeader}>
          <span>Stock by option</span>
          <button type="submit" disabled={busy} style={primaryButton}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>

        {rows.length === 0 ? (
          <Empty
            title="Nothing to track yet"
            help="Stock is counted per bundle option. Add a product with at least one option first."
          />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
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
                  <th style={{ padding: "0 16px", fontWeight: 550 }}>Option</th>
                  <th style={{ padding: "0 8px", fontWeight: 550 }}>SKU</th>
                  <th style={{ padding: "0 8px", fontWeight: 550, width: 110 }}>Available</th>
                  <th style={{ padding: "0 8px", fontWeight: 550, width: 100 }}>Committed</th>
                  <th style={{ padding: "0 8px", fontWeight: 550, width: 110 }}>Incoming</th>
                  <th style={{ padding: "0 8px", fontWeight: 550, width: 120 }}>Low at</th>
                  <th style={{ padding: "0 16px", fontWeight: 550, width: 110 }}>State</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const low = row.lowStockThreshold > 0 && row.available <= row.lowStockThreshold;
                  return (
                    <tr key={row.id} style={{ height: 52, borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "0 16px" }}>
                        <input type="hidden" name="variantId" value={row.id} />
                        <div style={{ fontWeight: 550 }}>{row.label}</div>
                        <div style={{ fontSize: 12, color: "var(--ink-2)" }}>{row.product}</div>
                      </td>
                      <td style={{ padding: "0 8px", color: "var(--ink-2)", fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}>
                        {row.sku || "—"}
                      </td>
                      <td style={{ padding: "0 8px" }}>
                        <input
                          name="available"
                          type="number"
                          min={0}
                          defaultValue={row.available}
                          style={{ ...input, fontVariantNumeric: "tabular-nums" }}
                        />
                      </td>
                      <td style={{ padding: "0 8px", color: "var(--ink-2)", fontVariantNumeric: "tabular-nums" }}>
                        {row.committed}
                      </td>
                      <td style={{ padding: "0 8px" }}>
                        <input
                          name="incoming"
                          type="number"
                          min={0}
                          defaultValue={row.incoming}
                          style={{ ...input, fontVariantNumeric: "tabular-nums" }}
                        />
                      </td>
                      <td style={{ padding: "0 8px" }}>
                        <input
                          name="threshold"
                          type="number"
                          min={0}
                          defaultValue={row.lowStockThreshold}
                          style={{ ...input, fontVariantNumeric: "tabular-nums" }}
                        />
                      </td>
                      <td style={{ padding: "0 16px" }}>
                        {low ? <Badge kind="warning">Low</Badge> : <Badge kind="success">OK</Badge>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Form>
    </div>
  );
}

/**
 * Product detail: title, description, bundle options, supplier and cost.
 *
 * The saved-percent column is calculated as you type from price against
 * compare-at. It is never a field, because storing it is how a badge ends up
 * disagreeing with the price beside it.
 */
import { Form, Link, useNavigation } from "react-router";
import { useState } from "react";
import type { Route } from "./+types/admin.products.$id";
import { requireUser } from "~/lib/auth.server";
import { loadProduct, updateProduct, saveVariants, unitsSold } from "~/lib/admin.server";
import { centsFromInput, centsToInput, savedPercent, formatMoney } from "~/lib/money";
import {
  card,
  cardHeader,
  Field,
  input,
  textarea,
  primaryButton,
  secondaryButton,
  Badge,
} from "~/admin/ui";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: data?.product ? `${data.product.title} — Shop Admin` : "Product — Shop Admin" }];
}

export async function loader({ context, request, params }: Route.LoaderArgs) {
  await requireUser(context.db, request);
  const loaded = await loadProduct(context.db, params.id);
  if (!loaded) throw new Response("Product not found", { status: 404 });

  const sold = await unitsSold(context.db, loaded.product.storeId);
  const url = new URL(request.url);

  return {
    storeSlug: url.searchParams.get("store") || "",
    product: {
      id: loaded.product.id,
      title: loaded.product.title,
      handle: loaded.product.handle,
      description: loaded.product.description,
      status: loaded.product.status,
      supplierName: loaded.product.supplierName ?? "",
      supplierUrl: loaded.product.supplierUrl ?? "",
      cost: centsToInput(loaded.product.costCents),
    },
    variants: loaded.variants.map((variant) => ({
      id: variant.id,
      label: variant.label,
      sublabel: variant.sublabel ?? "",
      price: centsToInput(variant.priceCents),
      compareAt: centsToInput(variant.compareAtCents),
      sku: variant.sku ?? "",
      isDefault: variant.isDefault,
      sold: sold.get(variant.id) ?? 0,
    })),
  };
}

export async function action({ context, request, params }: Route.ActionArgs) {
  await requireUser(context.db, request);
  const form = await request.formData();

  const title = String(form.get("title") || "").trim();
  if (!title) return { error: "A product needs a title." };

  const handle =
    String(form.get("handle") || "").trim() ||
    title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  await updateProduct(context.db, params.id, {
    title,
    handle,
    description: String(form.get("description") || ""),
    status: String(form.get("status") || "draft"),
    supplierName: String(form.get("supplierName") || "").trim() || null,
    supplierUrl: String(form.get("supplierUrl") || "").trim() || null,
    costCents: centsFromInput(String(form.get("cost") || "")),
  });

  // The option rows arrive as parallel arrays, one entry per row still on screen.
  const ids = form.getAll("variantId").map(String);
  const labels = form.getAll("variantLabel").map(String);
  const sublabels = form.getAll("variantSublabel").map(String);
  const prices = form.getAll("variantPrice").map(String);
  const compares = form.getAll("variantCompare").map(String);
  const skus = form.getAll("variantSku").map(String);
  const defaultIndex = Number(form.get("defaultVariant") ?? -1);

  const submitted = [];
  for (let index = 0; index < labels.length; index++) {
    const label = labels[index].trim();
    const priceCents = centsFromInput(prices[index]);
    // A row with no label and no price is an empty row he never filled in.
    if (!label && priceCents === null) continue;
    if (!label) return { error: `Option ${index + 1} needs a label.` };
    if (priceCents === null) return { error: `"${label}" needs a price.` };

    submitted.push({
      id: ids[index] || undefined,
      label,
      sublabel: sublabels[index]?.trim() || null,
      priceCents,
      compareAtCents: centsFromInput(compares[index] ?? ""),
      sku: skus[index]?.trim() || null,
      position: index,
      isDefault: index === defaultIndex,
    });
  }

  if (submitted.length && !submitted.some((v) => v.isDefault)) submitted[0].isDefault = true;

  await saveVariants(context.db, params.id, submitted);
  return { ok: true, savedAt: new Date().toISOString() };
}

interface Row {
  key: string;
  id: string;
  label: string;
  sublabel: string;
  price: string;
  compareAt: string;
  sku: string;
  sold: number;
}

export default function ProductDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { product, variants, storeSlug } = loaderData;
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";

  const [rows, setRows] = useState<Row[]>(() =>
    variants.map((variant, index) => ({ key: `existing-${index}`, ...variant })),
  );
  const [defaultIndex, setDefaultIndex] = useState(() => {
    const found = variants.findIndex((variant) => variant.isDefault);
    return found >= 0 ? found : 0;
  });

  const update = (index: number, patch: Partial<Row>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const addRow = () =>
    setRows((current) => [
      ...current,
      {
        key: `new-${Date.now()}`,
        id: "",
        label: "",
        sublabel: "",
        price: "",
        compareAt: "",
        sku: "",
        sold: 0,
      },
    ]);

  const removeRow = (index: number) => {
    setRows((current) => current.filter((_, i) => i !== index));
    setDefaultIndex((current) => (current >= index && current > 0 ? current - 1 : current));
  };

  return (
    <Form method="post" style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Link to={`/admin/products?store=${storeSlug}`} style={{ ...secondaryButton, textDecoration: "none" }}>
          ←
        </Link>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 650 }}>{product.title}</h1>
        <Badge kind={product.status === "active" ? "success" : "neutral"}>
          {product.status === "active" ? "Active" : "Draft"}
        </Badge>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          {actionData?.ok ? (
            <span style={{ color: "var(--b-success-fg)", fontSize: 12, fontWeight: 550 }}>Saved</span>
          ) : null}
          <button type="submit" disabled={busy} style={primaryButton}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {actionData?.error ? (
        <div
          style={{
            background: "var(--b-critical-bg)",
            color: "var(--b-critical-fg)",
            borderRadius: 10,
            padding: "10px 12px",
            fontSize: 13,
          }}
        >
          {actionData.error}
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.7fr) minmax(0,1fr)", gap: 16, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <div style={{ ...card, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Title">
              <input name="title" defaultValue={product.title} style={{ ...input, height: 36, fontSize: 14 }} />
            </Field>
            <Field label="Description" help="Shown on the product page.">
              <textarea name="description" defaultValue={product.description} rows={6} style={textarea} />
            </Field>
            <Field label="Handle" help="The part of the storefront address that names this product.">
              <input name="handle" defaultValue={product.handle} style={input} />
            </Field>
          </div>

          <div style={card}>
            <div style={cardHeader}>
              <span>Bundle options</span>
              <button type="button" onClick={addRow} style={secondaryButton}>
                Add option
              </button>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 740 }}>
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
                    <th style={{ padding: "0 8px", fontWeight: 550 }}>Label</th>
                    <th style={{ padding: "0 8px", fontWeight: 550 }}>Sublabel</th>
                    <th style={{ padding: "0 8px", fontWeight: 550, width: 100 }}>Price</th>
                    <th style={{ padding: "0 8px", fontWeight: 550, width: 112 }}>Compare-at</th>
                    <th style={{ padding: "0 8px", fontWeight: 550, width: 76 }}>Saved</th>
                    <th style={{ padding: "0 8px", fontWeight: 550, width: 64 }}>Default</th>
                    <th style={{ width: 44 }} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => {
                    const priceCents = centsFromInput(row.price);
                    const compareCents = centsFromInput(row.compareAt);
                    const saved =
                      priceCents !== null ? savedPercent(priceCents, compareCents) : null;
                    return (
                      <tr key={row.key} style={{ borderBottom: "1px solid var(--border)", height: 48 }}>
                        <td style={{ padding: "0 8px" }}>
                          <input type="hidden" name="variantId" value={row.id} />
                          <input
                            name="variantLabel"
                            value={row.label}
                            onChange={(event) => update(index, { label: event.target.value })}
                            placeholder="Buy 2"
                            style={input}
                          />
                        </td>
                        <td style={{ padding: "0 8px" }}>
                          <input
                            name="variantSublabel"
                            value={row.sublabel}
                            onChange={(event) => update(index, { sublabel: event.target.value })}
                            placeholder="Most popular"
                            style={input}
                          />
                        </td>
                        <td style={{ padding: "0 8px" }}>
                          <input
                            name="variantPrice"
                            value={row.price}
                            onChange={(event) => update(index, { price: event.target.value })}
                            placeholder="0.00"
                            inputMode="decimal"
                            style={{ ...input, fontVariantNumeric: "tabular-nums" }}
                          />
                        </td>
                        <td style={{ padding: "0 8px" }}>
                          <input
                            name="variantCompare"
                            value={row.compareAt}
                            onChange={(event) => update(index, { compareAt: event.target.value })}
                            placeholder="0.00"
                            inputMode="decimal"
                            style={{ ...input, fontVariantNumeric: "tabular-nums" }}
                          />
                        </td>
                        <td
                          style={{
                            padding: "0 8px",
                            fontWeight: 600,
                            color: saved ? "var(--b-success-fg)" : "var(--ink-3)",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {saved ? `${saved}%` : "—"}
                        </td>
                        <td style={{ padding: "0 8px", textAlign: "center" }}>
                          <input
                            type="radio"
                            name="defaultVariant"
                            value={index}
                            checked={defaultIndex === index}
                            onChange={() => setDefaultIndex(index)}
                            style={{ width: 16, height: 16, accentColor: "var(--focus)", cursor: "pointer" }}
                          />
                        </td>
                        <td style={{ padding: "0 8px", textAlign: "center" }}>
                          <button
                            type="button"
                            onClick={() => removeRow(index)}
                            title={row.sold ? `${row.sold} sold — removing hides it from the storefront` : "Delete option"}
                            style={{
                              width: 26,
                              height: 26,
                              borderRadius: 7,
                              border: 0,
                              background: "transparent",
                              color: "var(--critical)",
                              cursor: "pointer",
                            }}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {rows.length === 0 ? (
              <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--ink-2)" }}>
                No bundle options yet. Add one to set pricing.
              </div>
            ) : null}
            <div style={{ padding: "10px 16px", borderTop: "1px solid var(--border)", fontSize: 12, color: "var(--ink-2)" }}>
              Saved percent is worked out from price against compare-at. Change a price and every
              badge on the storefront follows.
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <div style={{ ...card, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Status" help="Draft keeps it off the storefront.">
              <select name="status" defaultValue={product.status} style={{ ...input, padding: "0 8px" }}>
                <option value="draft">Draft</option>
                <option value="active">Active</option>
              </select>
            </Field>
          </div>

          <div style={{ ...card, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontWeight: 650 }}>Supplier &amp; cost</div>
            <Field label="Supplier name">
              <input name="supplierName" defaultValue={product.supplierName} style={input} />
            </Field>
            <Field label="Supplier link">
              <input name="supplierUrl" defaultValue={product.supplierUrl} style={input} />
            </Field>
            <Field label="Unit cost" help="What you pay. Used for the margin readout.">
              <input name="cost" defaultValue={product.cost} inputMode="decimal" style={input} />
            </Field>
          </div>
        </div>
      </div>
    </Form>
  );
}

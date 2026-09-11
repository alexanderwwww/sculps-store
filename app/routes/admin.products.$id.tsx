/**
 * Product detail: title, description, media, bundle options, supplier and cost.
 *
 * The saved-percent column is calculated as you type from price against
 * compare-at. It is never a field, because storing it is how a badge ends up
 * disagreeing with the price beside it. Margin is calculated the same way,
 * from unit cost against the default option's price.
 */
import { Form, Link, useNavigation } from "react-router";
import { useState } from "react";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/admin.products.$id";
import { requireUser } from "~/lib/auth.server";
import { loadProduct, updateProduct, saveVariants, unitsSold, addMedia, deleteMedia } from "~/lib/admin.server";
import { media as mediaTable, products as productsTable } from "~/db/schema";
import { centsFromInput, centsToInput, savedPercent, formatMoney } from "~/lib/money";
import { primaryButton } from "~/admin/ui";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: data?.product ? `${data.product.title} — Shop Admin` : "Product — Shop Admin" }];
}

/** detailCols, from the prototype view-model (desktop). */
const DETAIL_COLS = "minmax(0,1fr) 300px";

const panel = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  boxShadow: "var(--shadow)",
} as const;

const cellInput = {
  width: "100%",
  height: 32,
  padding: "0 10px",
  borderRadius: 8,
  border: "1px solid var(--input-border)",
  background: "var(--input)",
  fontSize: 13,
  color: "var(--ink)",
} as const;

const fieldLabelStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 12,
  fontWeight: 550,
  color: "var(--ink-2)",
} as const;

export async function loader({ context, request, params }: Route.LoaderArgs) {
  await requireUser(context.db, request);
  const loaded = await loadProduct(context.db, params.id);
  if (!loaded) throw new Response("Product not found", { status: 404 });

  const sold = await unitsSold(context.db, loaded.product.storeId);
  const url = new URL(request.url);

  // Media has no product column yet, so this is every image on the store.
  const mediaRows = await context.db
    .select()
    .from(mediaTable)
    .where(eq(mediaTable.storeId, loaded.product.storeId));

  return {
    storeSlug: url.searchParams.get("store") || "",
    // Uploads need a Cloudflare R2 bucket; the binding is added to
    // wrangler.jsonc when the bucket exists.
    storageReady: "MEDIA" in context.cloudflare.env,
    media: mediaRows.map((row) => ({ id: row.id, url: row.key, filename: row.filename })),
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
      imageUrl: variant.imageUrl ?? "",
      isDefault: variant.isDefault,
      sold: sold.get(variant.id) ?? 0,
    })),
  };
}

export async function action({ context, request, params }: Route.ActionArgs) {
  await requireUser(context.db, request);
  const form = await request.formData();
  const intent = String(form.get("intent") || "save");

  const loaded = await loadProduct(context.db, params.id);
  if (!loaded) throw new Response("Product not found", { status: 404 });
  const storeSlug = String(form.get("storeSlug") || "");

  if (intent === "delete") {
    if (String(form.get("confirm") || "") !== "delete") return { error: "Deletion was not confirmed." };
    await context.db.delete(productsTable).where(eq(productsTable.id, params.id));
    return new Response(null, {
      status: 302,
      headers: { Location: `/admin/products?store=${storeSlug}` },
    });
  }

  if (intent === "addMedia") {
    const link = String(form.get("mediaUrl") || "").trim();
    if (!link) return { error: "Paste an image address first." };
    await addMedia(context.db, loaded.product.storeId, {
      key: link,
      filename: link.split("/").pop()?.slice(0, 120) || link,
      mime: "image/*",
      sizeBytes: 0,
      alt: null,
    });
    return { ok: true, savedAt: new Date().toISOString() };
  }

  if (intent === "removeMedia") {
    const id = String(form.get("mediaId") || "");
    if (id) await deleteMedia(context.db, [id]);
    return { ok: true, savedAt: new Date().toISOString() };
  }

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

  // The option rows arrive as parallel arrays, one entry per row still on
  // screen, in the order they are shown — which is how a drag reorder is saved.
  const ids = form.getAll("variantId").map(String);
  const labels = form.getAll("variantLabel").map(String);
  const sublabels = form.getAll("variantSublabel").map(String);
  const prices = form.getAll("variantPrice").map(String);
  const compares = form.getAll("variantCompare").map(String);
  const skus = form.getAll("variantSku").map(String);
  const images = form.getAll("variantImage").map(String);
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
      imageUrl: images[index]?.trim() || null,
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
  imageUrl: string;
  sold: number;
}

export default function ProductDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { product, variants, storeSlug, media, storageReady } = loaderData;
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";

  const [rows, setRows] = useState<Row[]>(() =>
    variants.map((variant, index) => ({ key: `existing-${index}`, ...variant })),
  );
  const [defaultIndex, setDefaultIndex] = useState(() => {
    const found = variants.findIndex((variant) => variant.isDefault);
    return found >= 0 ? found : 0;
  });
  const [cost, setCost] = useState(product.cost);
  const [dragFrom, setDragFrom] = useState<number | null>(null);

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
        imageUrl: "",
        sold: 0,
      },
    ]);

  const removeRow = (index: number) => {
    setRows((current) => current.filter((_, i) => i !== index));
    setDefaultIndex((current) => (current >= index && current > 0 ? current - 1 : current));
  };

  const dropOn = (index: number) => {
    const from = dragFrom;
    setDragFrom(null);
    if (from === null || from === index) return;
    setRows((current) => {
      const next = current.slice();
      const [moved] = next.splice(from, 1);
      next.splice(index, 0, moved);
      return next;
    });
    setDefaultIndex((current) => {
      if (current === from) return index;
      if (from < current && index >= current) return current - 1;
      if (from > current && index <= current) return current + 1;
      return current;
    });
  };

  // Margin: default option's price against unit cost, worked out as you type.
  const costCents = centsFromInput(cost) ?? 0;
  const defaultPriceCents = centsFromInput(rows[defaultIndex]?.price ?? "") ?? 0;
  const margin = defaultPriceCents > 0 ? ((defaultPriceCents - costCents) / defaultPriceCents) * 100 : null;
  const marginText = margin === null ? "—" : `${margin.toFixed(0)}%`;
  const marginColor =
    margin === null ? "var(--ink-3)" : margin >= 60 ? "var(--success)" : margin >= 35 ? "var(--ink)" : "var(--critical)";
  const marginNote =
    margin === null
      ? "set a price and cost"
      : `${formatMoney(defaultPriceCents - costCents)} per unit on ${rows[defaultIndex]?.label || "default option"}`;

  const mediaNote = media.length
    ? `${media.length} image${media.length === 1 ? "" : "s"} · first one is the thumbnail`
    : "PNG or JPG. The first image is used as the thumbnail.";

  return (
    <Form method="post" style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <input type="hidden" name="storeSlug" value={storeSlug} />
      <input type="hidden" name="handle" value={product.handle} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Link
          to={`/admin/products?store=${storeSlug}`}
          className="k-hover"
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            color: "var(--ink)",
            cursor: "pointer",
            display: "grid",
            placeItems: "center",
            flex: "none",
            boxShadow: "var(--shadow)",
            textDecoration: "none",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="m10 4-4 4 4 4" />
          </svg>
        </Link>
        <h1 style={{ margin: 0, fontSize: 20, lineHeight: "28px", fontWeight: 650 }}>{product.title || "New product"}</h1>
        {/* The prototype saves from the shell's save bar, which is not this
            screen's markup — the Save button lives here instead. */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          {actionData && "ok" in actionData && actionData.ok ? (
            <span style={{ color: "var(--b-success-fg)", fontSize: 12, fontWeight: 550 }}>Saved</span>
          ) : null}
          <button type="submit" name="intent" value="save" disabled={busy} style={primaryButton}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {actionData && "error" in actionData && actionData.error ? (
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

      <div style={{ display: "grid", gridTemplateColumns: DETAIL_COLS, gap: 16, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <div style={{ ...panel, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={fieldLabelStyle}>
              Title
              <input
                name="title"
                defaultValue={product.title}
                placeholder="e.g. Garden Kneeler &amp; Seat"
                style={{
                  height: 36,
                  padding: "0 12px",
                  borderRadius: 8,
                  border: "1px solid var(--input-border)",
                  background: "var(--input)",
                  fontSize: 14,
                  color: "var(--ink)",
                }}
              />
            </label>
            <label style={fieldLabelStyle}>
              Description
              <textarea
                name="description"
                defaultValue={product.description}
                rows={6}
                placeholder="What it is, who it's for, what's in the box…"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--input-border)",
                  background: "var(--input)",
                  fontSize: 13,
                  resize: "vertical",
                  color: "var(--ink)",
                  fontFamily: "inherit",
                }}
              />
            </label>
          </div>

          <div style={{ ...panel, padding: 16 }}>
            <div style={{ fontWeight: 650, marginBottom: 10 }}>Media</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(96px,1fr))", gap: 10 }}>
              {media.map((m) => (
                <span
                  key={m.id}
                  style={{
                    position: "relative",
                    aspectRatio: 1,
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--bg)",
                    overflow: "hidden",
                    display: "block",
                    maxWidth: "100%",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      inset: 0,
                      backgroundImage: `url("${m.url}")`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                      display: "block",
                    }}
                  />
                  <button
                    type="submit"
                    name="intent"
                    value="removeMedia"
                    onClick={(event) => {
                      const form = event.currentTarget.form;
                      if (form) (form.elements.namedItem("mediaId") as HTMLInputElement).value = m.id;
                    }}
                    title="Remove"
                    style={{
                      position: "absolute",
                      top: 4,
                      right: 4,
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      border: 0,
                      background: "rgba(0,0,0,.6)",
                      color: "#fff",
                      cursor: "pointer",
                      fontSize: 11,
                    }}
                  >
                    ✕
                  </button>
                </span>
              ))}
              <input type="hidden" name="mediaId" value="" />
              {/* Rule 2: file upload needs a Cloudflare R2 bucket, which is not
                  bound to the Worker yet, so the tile is visibly disabled. */}
              <label
                style={{
                  aspectRatio: 1,
                  maxWidth: "100%",
                  borderRadius: 10,
                  border: "1px dashed var(--border-strong)",
                  background: "var(--bg)",
                  color: "var(--ink-2)",
                  cursor: "not-allowed",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 2,
                  fontSize: 12,
                  opacity: 0.5,
                }}
              >
                <span style={{ fontSize: 18 }}>＋</span>
                Upload
                <input type="file" accept="image/*" multiple disabled style={{ display: "none" }} />
              </label>
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 8 }}>{mediaNote}</div>
            <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 8 }}>
              {storageReady
                ? "Uploads are disabled here until this panel is wired to the media library."
                : "Uploading a file needs a Cloudflare R2 bucket, which is not connected yet. Until it is, add an image that is already on the internet by its address."}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <input
                name="mediaUrl"
                placeholder="https://…"
                style={{ ...cellInput, flex: 1, minWidth: 220, width: "auto" }}
              />
              <button
                type="submit"
                name="intent"
                value="addMedia"
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
                Add by URL
              </button>
            </div>
          </div>

          <div style={{ ...panel, overflow: "hidden" }}>
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontWeight: 650 }}>Bundle options</span>
              <button
                type="button"
                onClick={addRow}
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
                    <th style={{ width: 34 }} />
                    <th style={{ padding: "0 8px", fontWeight: 550 }}>Label</th>
                    <th style={{ padding: "0 8px", fontWeight: 550 }}>Sublabel</th>
                    <th style={{ padding: "0 8px", fontWeight: 550, width: 150 }}>Image</th>
                    <th style={{ padding: "0 8px", fontWeight: 550, width: 96 }}>Price</th>
                    <th style={{ padding: "0 8px", fontWeight: 550, width: 108 }}>Compare-at</th>
                    <th style={{ padding: "0 8px", fontWeight: 550, width: 76 }}>Saved</th>
                    <th style={{ padding: "0 8px", fontWeight: 550, width: 60 }}>Default</th>
                    <th style={{ width: 40 }} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => {
                    const priceCents = centsFromInput(row.price);
                    const compareCents = centsFromInput(row.compareAt);
                    const saved = priceCents !== null ? savedPercent(priceCents, compareCents) : null;
                    return (
                      <tr
                        key={row.key}
                        style={{ borderBottom: "1px solid var(--border)", height: 48 }}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault();
                          dropOn(index);
                        }}
                      >
                        <td style={{ textAlign: "center" }}>
                          <input type="hidden" name="variantId" value={row.id} />
                          <input type="hidden" name="variantSku" value={row.sku} />
                          <span
                            draggable
                            onDragStart={(event) => {
                              setDragFrom(index);
                              try {
                                event.dataTransfer.effectAllowed = "move";
                              } catch {
                                /* Safari refuses on some elements */
                              }
                            }}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => {
                              event.preventDefault();
                              dropOn(index);
                            }}
                            title="Drag to reorder"
                            style={{ cursor: "grab", color: "var(--ink-3)", display: "inline-block", padding: "4px 6px" }}
                          >
                            ⠿
                          </span>
                        </td>
                        <td style={{ padding: "0 8px" }}>
                          <input
                            name="variantLabel"
                            value={row.label}
                            onChange={(event) => update(index, { label: event.target.value })}
                            placeholder="Buy 2"
                            style={cellInput}
                          />
                        </td>
                        <td style={{ padding: "0 8px" }}>
                          <input
                            name="variantSublabel"
                            value={row.sublabel}
                            onChange={(event) => update(index, { sublabel: event.target.value })}
                            placeholder="Most popular"
                            style={cellInput}
                          />
                        </td>
                        <td style={{ padding: "0 8px" }}>
                          {/* The picture on this option's card. Nothing chosen
                              means the product's first photo, which is what
                              the card showed before there was a choice. */}
                          <select
                            name="variantImage"
                            value={row.imageUrl}
                            onChange={(event) => update(index, { imageUrl: event.currentTarget.value })}
                            style={{ width: "100%", height: 32, borderRadius: 8, border: "1px solid var(--border)", background: "var(--input)", color: "var(--ink)", fontSize: 13, padding: "0 8px" }}
                          >
                            <option value="">Product photo</option>
                            {media.map((item) => (
                              <option key={item.id} value={item.url}>
                                {item.filename}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: "0 8px" }}>
                          <input
                            name="variantPrice"
                            value={row.price}
                            onChange={(event) => update(index, { price: event.target.value })}
                            placeholder="0.00"
                            inputMode="decimal"
                            style={{ ...cellInput, fontVariantNumeric: "tabular-nums" }}
                          />
                        </td>
                        <td style={{ padding: "0 8px" }}>
                          <input
                            name="variantCompare"
                            value={row.compareAt}
                            onChange={(event) => update(index, { compareAt: event.target.value })}
                            placeholder="0.00"
                            inputMode="decimal"
                            style={{ ...cellInput, fontVariantNumeric: "tabular-nums" }}
                          />
                        </td>
                        <td
                          style={{
                            padding: "0 8px",
                            fontWeight: 600,
                            color: saved === null ? "var(--ink-3)" : "var(--success)",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {saved === null ? "—" : `${saved}%`}
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
          </div>

          <div style={{ ...panel, padding: 16 }}>
            <div style={{ fontWeight: 650, marginBottom: 10 }}>Supplier &amp; cost</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12 }}>
              <label style={fieldLabelStyle}>
                Supplier name
                <input
                  name="supplierName"
                  defaultValue={product.supplierName}
                  placeholder="Supplier"
                  style={{ ...cellInput, height: 36, padding: "0 12px" }}
                />
              </label>
              <label style={fieldLabelStyle}>
                Supplier URL
                <input
                  name="supplierUrl"
                  defaultValue={product.supplierUrl}
                  placeholder="https://…"
                  style={{ ...cellInput, height: 36, padding: "0 12px" }}
                />
              </label>
              <label style={fieldLabelStyle}>
                Cost per unit
                <input
                  name="cost"
                  value={cost}
                  onChange={(event) => setCost(event.target.value)}
                  placeholder="0.00"
                  inputMode="decimal"
                  style={{ ...cellInput, height: 36, padding: "0 12px", fontVariantNumeric: "tabular-nums" }}
                />
              </label>
              <div style={fieldLabelStyle}>
                Margin
                <div
                  style={{
                    height: 36,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 15,
                    fontWeight: 650,
                    color: marginColor,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {marginText}
                  <span style={{ fontSize: 12, fontWeight: 450, color: "var(--ink-2)" }}>{marginNote}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <div style={{ ...panel, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={fieldLabelStyle}>
              Status
              <select
                name="status"
                defaultValue={product.status}
                style={{
                  height: 34,
                  borderRadius: 8,
                  border: "1px solid var(--input-border)",
                  background: "var(--input)",
                  padding: "0 8px",
                  fontSize: 13,
                  color: "var(--ink)",
                }}
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
              </select>
            </label>
            {/* Store select and Meta content ID are omitted: no column exists
                for either, and there is one store. */}
          </div>
          <div style={{ ...panel, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontWeight: 650 }}>Danger zone</span>
            <button
              type="submit"
              name="intent"
              value="delete"
              onClick={(event) => {
                if (
                  !confirm(
                    "Delete this product? It will be removed from the store and from Meta catalogue syncs. This cannot be undone.",
                  )
                ) {
                  event.preventDefault();
                  return;
                }
                const form = event.currentTarget.form;
                if (form) (form.elements.namedItem("confirm") as HTMLInputElement).value = "delete";
              }}
              style={{
                height: 30,
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: "var(--critical)",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Delete product
            </button>
            <input type="hidden" name="confirm" value="" />
          </div>
        </div>
      </div>
    </Form>
  );
}

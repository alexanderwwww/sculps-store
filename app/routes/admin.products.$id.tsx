/**
 * Product detail: title, description, media, bundle options, supplier and cost.
 *
 * The saved-percent column is calculated as you type from price against
 * compare-at. It is never a field, because storing it is how a badge ends up
 * disagreeing with the price beside it. Margin is calculated the same way,
 * from unit cost against the default option's price.
 */
import { Form, Link, useFetcher, useNavigation } from "react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { eq } from "drizzle-orm";
import type { Route } from "./+types/admin.products.$id";
import { requireUser } from "~/lib/auth.server";
import { loadProduct, updateProduct, saveVariants, unitsSold, addMedia, deleteMedia, setProductImages, uploadMedia, type ProductImage } from "~/lib/admin.server";
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
    media: mediaRows.map((row) => ({ id: row.id, url: `/media/${row.key}`, filename: row.filename })),
    images: (loaded.product.images ?? []) as ProductImage[],
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

  // A file straight into the store's library, answered with its address so
  // the picture grid can take it without a round trip through the form.
  if (intent === "upload") {
    const bucket = context.cloudflare.env.MEDIA;
    if (!bucket) return { error: "No media bucket is bound to this Worker yet." };
    const file = form.get("file");
    if (!(file instanceof File)) return { error: "Choose a file first." };
    const result = await uploadMedia(bucket, context.db, loaded.product.storeId, file);
    return "error" in result ? result : { ok: "Uploaded.", url: result.url };
  }

  // The product's pictures, as an ordered list. Saved on their own, the
  // moment they change, so a reorder or a swap never waits on the big Save.
  if (intent === "setImages") {
    const urls = form.getAll("imageUrl").map(String);
    const alts = form.getAll("imageAlt").map(String);
    const images: ProductImage[] = urls
      .map((url, i) => ({ url: url.trim(), alt: (alts[i] ?? "").trim() }))
      .filter((x) => x.url);
    await setProductImages(context.db, params.id, images);
    return { ok: "Pictures saved." };
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
  const { product, variants, storeSlug, media, storageReady, images: savedImages } = loaderData;
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

          <ProductPictures
            productId={product.id}
            storeSlug={storeSlug}
            saved={savedImages}
            library={media}
            storageReady={storageReady}
          />

          <div style={{ ...panel, padding: 16 }}>
            <div style={{ fontWeight: 650, marginBottom: 10 }}>Add a picture by address</div>
            <div style={{ fontSize: 12, color: "var(--ink-2)", marginBottom: 8 }}>
              Something already on the internet. It goes into the library above, where it can be added to this product.
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


/* --------------------------------------------------------- the pictures */

/*
 * Every product picture is square before it is ever uploaded.
 *
 * The storefront carousel is built on a 1:1 frame — eight thumbnails down the
 * side of one big square. Drop a portrait photograph into it and the whole
 * thing deforms: the big frame stretches, the thumbnails turn into slivers,
 * and the page looks broken to every visitor. That is not something to
 * remember not to do; the shop has to make it impossible.
 *
 * So the picture is drawn onto a square canvas before it leaves the browser,
 * on WHITE, centred, scaled to fit without cropping. White because a supplier
 * photograph already cut out on white then extends its own background
 * seamlessly, which is the common case and the one that has to look perfect.
 * Nothing is ever cut off — a tall picture gets white either side rather than
 * losing its head.
 *
 * A picture that is already square passes through untouched, so nothing we
 * generated is re-encoded and degraded on the way in.
 */
async function toSquare(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;

  const bitmap = await createImageBitmap(file).catch(() => null);
  // Anything the browser cannot decode goes up untouched rather than being
  // dropped: a failed normalisation must never lose somebody's picture.
  if (!bitmap) return file;
  if (bitmap.width === bitmap.height) {
    bitmap.close();
    return file;
  }

  const side = Math.max(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, side, side);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, (side - bitmap.width) / 2, (side - bitmap.height) / 2);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.92),
  );
  if (!blob) return file;
  const name = file.name.replace(/\.[^.]+$/, "") + ".webp";
  return new File([blob], name, { type: "image/webp" });
}

/**
 * The product's pictures, the way Shopify's product page has them: a grid in
 * the order the storefront shows them, the first one being the thumbnail.
 * Add from what the store already has, upload something new, move a picture
 * left or right, take one out. Every change is saved the moment it is made —
 * there is no separate Save to remember, and the carousel on the site is
 * reading this list.
 */
function ProductPictures({
  productId,
  storeSlug,
  saved,
  library,
  storageReady,
}: {
  productId: string;
  storeSlug: string;
  saved: ProductImage[];
  library: { id: string; url: string; filename: string }[];
  storageReady: boolean;
}) {
  const [images, setImages] = useState<ProductImage[]>(saved);
  const [picking, setPicking] = useState(false);
  const save = useFetcher<{ ok?: string; error?: string }>();
  const upload = useFetcher<{ ok?: string; error?: string; url?: string }>();
  const fileRef = useRef<HTMLInputElement>(null);
  const action = `/admin/products/${productId}?store=${storeSlug}`;

  // Saved from the server after a full page save; keep in step.
  useEffect(() => setImages(saved), [saved]);

  const commit = useCallback(
    (next: ProductImage[]) => {
      setImages(next);
      const body = new FormData();
      body.set("intent", "setImages");
      body.set("storeSlug", storeSlug);
      for (const x of next) {
        body.append("imageUrl", x.url);
        body.append("imageAlt", x.alt);
      }
      save.submit(body, { method: "post", action });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storeSlug, action],
  );

  // A fresh upload joins the end of the list on its own.
  const taken = useRef<string | null>(null);
  useEffect(() => {
    const url = upload.data?.url;
    if (!url || taken.current === url) return;
    taken.current = url;
    commit([...images, { url, alt: "" }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upload.data]);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= images.length) return;
    const next = images.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    commit(next);
  };

  /*
   * Dragging a picture to where it should go.
   *
   * The arrows stay — they are the keyboard and the fine adjustment — but
   * moving the fifth picture to the front took four clicks and four saves,
   * and the order of the pictures IS the carousel. Picking one up and
   * dropping it where you want it is the whole interaction.
   *
   * `dragFrom` is the picture being carried, `dragOver` the slot it would
   * land in; the second one only draws the line, so nothing is written until
   * the drop actually happens.
   */
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const endDrag = () => {
    setDragFrom(null);
    setDragOver(null);
  };
  const drop = (to: number) => {
    if (dragFrom !== null && dragFrom !== to) move(dragFrom, to);
    endDrag();
  };
  const remove = (index: number) => commit(images.filter((_, i) => i !== index));
  const add = (url: string) => {
    if (images.some((x) => x.url === url)) return;
    commit([...images, { url, alt: "" }]);
    setPicking(false);
  };

  const have = new Set(images.map((x) => x.url));
  const tile: React.CSSProperties = {
    position: "relative",
    aspectRatio: 1,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg)",
    overflow: "hidden",
    display: "block",
  };
  const pic = (url: string): React.CSSProperties => ({
    position: "absolute",
    inset: 0,
    backgroundImage: `url("${url}")`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    display: "block",
  });
  const chip: React.CSSProperties = {
    width: 22,
    height: 22,
    borderRadius: 6,
    border: 0,
    background: "rgba(0,0,0,.6)",
    color: "#fff",
    cursor: "pointer",
    fontSize: 11,
    lineHeight: 1,
  };
  const busy = save.state !== "idle" || upload.state !== "idle";

  return (
    <div style={{ ...panel, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontWeight: 650 }}>Pictures</div>
        <div style={{ fontSize: 12, color: "var(--ink-2)" }}>
          {busy
            ? "Saving…"
            : save.data?.error ||
              upload.data?.error ||
              `${images.length} on the product · drag to reorder · first one is the thumbnail`}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(110px,1fr))", gap: 10 }}>
        {images.map((x, i) => (
          <span
            key={x.url}
            style={{
              ...tile,
              cursor: busy ? "default" : "grab",
              opacity: dragFrom === i ? 0.35 : 1,
              // The slot it would land in, marked on the edge it came from so
              // the line reads as "it goes here", not "this one is selected".
              boxShadow:
                dragOver === i && dragFrom !== null && dragFrom !== i
                  ? `inset ${dragFrom > i ? "3px" : "-3px"} 0 0 0 var(--accent, #0071e3)`
                  : undefined,
            }}
            draggable={!busy}
            onDragStart={(event) => {
              setDragFrom(i);
              event.dataTransfer.effectAllowed = "move";
              // Firefox refuses to start a drag without data on it.
              event.dataTransfer.setData("text/plain", String(i));
            }}
            onDragEnter={() => setDragOver(i)}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }}
            onDrop={(event) => {
              event.preventDefault();
              drop(i);
            }}
            onDragEnd={endDrag}
          >
            <span style={pic(x.url)} />
            {i === 0 ? (
              <span style={{ position: "absolute", left: 6, top: 6, fontSize: 10, fontWeight: 650, padding: "2px 7px", borderRadius: 999, background: "rgba(0,0,0,.6)", color: "#fff" }}>
                Thumbnail
              </span>
            ) : null}
            <span style={{ position: "absolute", right: 4, bottom: 4, display: "flex", gap: 4 }}>
              <button type="button" style={chip} title="Move left" disabled={i === 0 || busy} onClick={() => move(i, i - 1)}>‹</button>
              <button type="button" style={chip} title="Move right" disabled={i === images.length - 1 || busy} onClick={() => move(i, i + 1)}>›</button>
              <button type="button" style={chip} title="Remove from product" disabled={busy} onClick={() => remove(i)}>✕</button>
            </span>
          </span>
        ))}

        <button
          type="button"
          onClick={() => setPicking((on) => !on)}
          style={{ ...tile, border: "1px dashed var(--border-strong)", color: "var(--ink-2)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, fontSize: 12 }}
        >
          <span style={{ fontSize: 18 }}>＋</span>
          {picking ? "Close" : "Add from library"}
        </button>

        <button
          type="button"
          disabled={!storageReady || busy}
          title={storageReady ? undefined : "Uploading needs the media bucket, which is not connected yet."}
          onClick={() => fileRef.current?.click()}
          style={{ ...tile, border: "1px dashed var(--border-strong)", color: "var(--ink-2)", cursor: storageReady ? "pointer" : "not-allowed", opacity: storageReady ? 1 : 0.5, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, fontSize: 12 }}
        >
          <span style={{ fontSize: 18 }}>↑</span>
          {upload.state !== "idle" ? "Uploading…" : "Upload"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            const squared = await toSquare(file);
            const body = new FormData();
            body.set("intent", "upload");
            body.set("storeSlug", storeSlug);
            body.set("file", squared);
            upload.submit(body, { method: "post", action, encType: "multipart/form-data" });
          }}
        />
      </div>

      {picking ? (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
          <div style={{ fontSize: 12, color: "var(--ink-2)", marginBottom: 8 }}>
            Everything in this store's library. Click one to put it on the product.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(84px,1fr))", gap: 8, maxHeight: 280, overflowY: "auto" }}>
            {library.map((m) => (
              <button
                key={m.id}
                type="button"
                title={m.filename}
                disabled={have.has(m.url) || busy}
                onClick={() => add(m.url)}
                style={{ ...tile, cursor: have.has(m.url) ? "default" : "pointer", opacity: have.has(m.url) ? 0.35 : 1, padding: 0 }}
              >
                <span style={pic(m.url)} />
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

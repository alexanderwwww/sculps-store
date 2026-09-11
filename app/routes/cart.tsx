/**
 * The cart.
 *
 * Prices are read from the database every time this renders, never from the
 * browser, so a tampered form cannot change what anything costs.
 */
import { Form, Link } from "react-router";
import type { Route } from "./+types/cart";
import { resolveStore } from "~/lib/store.server";
import {
  readCartToken,
  priceCart,
  currentLines,
  setLineQuantity,
  saveCart,
  setCartDiscount,
  newCartToken,
  cartCookie,
} from "~/lib/cart.server";
import { checkDiscount, findDiscount, normaliseCode } from "~/lib/discounts.server";
import { eq } from "drizzle-orm";
import { metaConfig, variants } from "~/db/schema";
import { eventPixelScript, pixelScript } from "~/lib/meta.server";
import { formatMoney } from "~/lib/money";
import themeHref from "~/storefronts/garden-kneeler/theme.css?url";

export function links() {
  return [
    {
      rel: "stylesheet",
      href: "https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@600;700&family=Source+Sans+3:wght@400;600;700&display=swap",
    },
    { rel: "stylesheet", href: themeHref },
  ];
}

export function meta({ data }: Route.MetaArgs) {
  return [{ title: data?.store ? `Cart — ${data.store.name}` : "Cart" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const store = await resolveStore(context.db, context.hostname, url);
  if (!store) throw new Response("No store for this domain.", { status: 404 });

  // Garden Buddy's cart is the drawer on the product page. Anyone who lands
  // on this address — a no-script add-to-cart, an old bookmark — is sent to
  // the checkout, which is this store's own page and where they were headed.
  // This route's markup is the other store's, and a customer must never see
  // the wrong brand a step before paying.
  if (store.slug === "garden-buddy") {
    const to = new URL("/checkout", url);
    to.search = url.search;
    return new Response(null, { status: 302, headers: { Location: to.pathname + to.search } });
  }

  const cart = await priceCart(context.db, store, readCartToken(request));

  // The pixel, and the browser half of an AddToCart that /cart/add just sent
  // from the server. It carries the id that redirect handed us, so the two
  // halves deduplicate into one event.
  const [meta] = await context.db
    .select({ pixelId: metaConfig.pixelId })
    .from(metaConfig)
    .where(eq(metaConfig.storeId, store.id))
    .limit(1);

  let pixel = meta?.pixelId ? pixelScript(meta.pixelId) : null;
  const eventId = url.searchParams.get("fbe");
  const addedVariantId = url.searchParams.get("fbv");
  if (pixel && eventId && addedVariantId) {
    const [variant] = await context.db
      .select()
      .from(variants)
      .where(eq(variants.id, addedVariantId))
      .limit(1);
    if (variant) {
      pixel = `${pixel}\n${eventPixelScript({
        name: "AddToCart",
        eventId,
        valueCents: variant.priceCents,
        currency: store.currency,
        contents: [{ id: variant.id, quantity: 1, itemPrice: variant.priceCents }],
      })}`;
    }
  }

  return {
    store: { name: store.name, slug: store.slug, currency: store.currency },
    cart,
    taxRate: store.taxRate,
    pixel,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const url = new URL(request.url);
  const store = await resolveStore(context.db, context.hostname, url);
  if (!store) throw new Response("No store for this domain.", { status: 404 });

  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  // Applying or removing a code. Only the text is stored — what it is worth is
  // recomputed by priceCart on the server every time the cart is read.
  if (intent === "discount" || intent === "discount-remove") {
    let token = readCartToken(request);
    let setCookie: string | null = null;
    if (!token) {
      token = newCartToken();
      setCookie = cartCookie(token, url);
    }

    if (intent === "discount-remove") {
      await setCartDiscount(context.db, store.id, token, null);
      return Response.json(
        { ok: true, discountError: null },
        setCookie ? { headers: { "Set-Cookie": setCookie } } : undefined,
      );
    }

    const code = normaliseCode(String(form.get("code") || ""));
    if (!code) {
      return Response.json({ ok: false, discountError: "Please type a discount code." });
    }

    const cart = await priceCart(context.db, store, token);
    const found = await findDiscount(context.db, store.id, code);
    const check = checkDiscount(found, {
      subtotalCents: cart.subtotalCents,
      currency: store.currency,
    });
    if (!check.ok) {
      return Response.json(
        { ok: false, discountError: check.reason },
        setCookie ? { headers: { "Set-Cookie": setCookie } } : undefined,
      );
    }

    await setCartDiscount(context.db, store.id, token, check.discount.code);
    return Response.json(
      { ok: true, discountError: null },
      setCookie ? { headers: { "Set-Cookie": setCookie } } : undefined,
    );
  }

  const token = readCartToken(request);
  if (!token) return { ok: true, discountError: null };

  const variantId = String(form.get("variantId") || "");
  const quantity = Number(form.get("quantity") || 0);

  const lines = await currentLines(context.db, store.id, token);
  await saveCart(context.db, store.id, token, setLineQuantity(lines, variantId, quantity));
  return { ok: true, discountError: null };
}

export default function Cart({ loaderData, actionData }: Route.ComponentProps) {
  const { store, cart, pixel } = loaderData;
  const discountError = actionData?.discountError ?? null;
  const storeParam = `?store=${store.slug}`;

  return (
    <div className="gk">
      {pixel ? <script dangerouslySetInnerHTML={{ __html: pixel }} /> : null}
      <header className="gk-header">
        <Link className="gk-logo" to={`/${storeParam}`} style={{ textDecoration: "none" }}>
          {store.name}
        </Link>
      </header>

      <div className="gk-shell">
        <h1 style={{ marginTop: 0 }}>Your cart</h1>

        {cart.lines.length === 0 ? (
          <div className="gk-panel">
            <p style={{ fontSize: 20, marginTop: 0 }}>Your cart is empty.</p>
            <Link className="gk-cta" to={`/${storeParam}`} style={{ display: "inline-block", textDecoration: "none" }}>
              Back to the product
            </Link>
          </div>
        ) : (
          <>
            <div className="gk-panel">
              {cart.lines.map((line) => (
                <div className="gk-line" key={line.variantId}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ display: "block", fontSize: 20 }}>{line.label}</strong>
                    <span className="gk-quiet">{line.productTitle}</span>
                  </span>

                  <Form method="post" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="hidden" name="variantId" value={line.variantId} />
                    <input
                      className="gk-qty"
                      type="number"
                      name="quantity"
                      min={0}
                      max={20}
                      defaultValue={line.quantity}
                      aria-label={`Quantity of ${line.label}`}
                    />
                    <button
                      type="submit"
                      className="gk-cta"
                      style={{ padding: "0 18px", height: 48, lineHeight: "48px" }}
                    >
                      Update
                    </button>
                  </Form>

                  <span style={{ minWidth: 120, textAlign: "right", fontSize: 20, fontWeight: 700 }}>
                    {formatMoney(line.lineTotalCents, cart.currency)}
                  </span>
                </div>
              ))}
            </div>

            <div className="gk-panel" style={{ marginTop: 20 }}>
              <div className="gk-totals">
                <span>Subtotal</span>
                <span>{formatMoney(cart.subtotalCents, cart.currency)}</span>
              </div>
              {cart.discount ? (
                <div className="gk-totals">
                  <span>
                    {cart.discount.code} · {cart.discount.label}{" "}
                    <Form method="post" style={{ display: "inline" }}>
                      <input type="hidden" name="intent" value="discount-remove" />
                      <button type="submit" className="gk-quiet" style={{ background: "none", border: 0, padding: 0, cursor: "pointer", textDecoration: "underline" }}>
                        Remove
                      </button>
                    </Form>
                  </span>
                  <span>−{formatMoney(cart.discount.amountCents, cart.currency)}</span>
                </div>
              ) : null}
              {cart.taxCents > 0 ? (
                <div className="gk-totals">
                  <span>Tax</span>
                  <span>{formatMoney(cart.taxCents, cart.currency)}</span>
                </div>
              ) : null}
              <div className="gk-totals">
                <span>Shipping</span>
                <span>{cart.shippingCents ? formatMoney(cart.shippingCents, cart.currency) : "Free"}</span>
              </div>
              <div className="gk-totals" style={{ borderTop: "1px solid var(--gk-line)", marginTop: 8, paddingTop: 16 }}>
                <strong>Total</strong>
                <strong>{formatMoney(cart.totalCents, cart.currency)}</strong>
              </div>

              <Form method="post" style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <input type="hidden" name="intent" value="discount" />
                <input
                  className="gk-input"
                  type="text"
                  name="code"
                  placeholder="Discount code"
                  aria-label="Discount code"
                  defaultValue=""
                  style={{ flex: 1 }}
                />
                <button type="submit" className="gk-cta" style={{ padding: "0 18px", height: 48, lineHeight: "48px" }}>
                  Apply
                </button>
              </Form>
              {discountError ? (
                <p className="gk-quiet" role="alert" style={{ color: "#b23a2c", fontWeight: 600 }}>
                  {discountError}
                </p>
              ) : cart.discountReason ? (
                <p className="gk-quiet" role="alert" style={{ color: "#b23a2c", fontWeight: 600 }}>
                  {cart.discountReason}
                </p>
              ) : null}

              <Link
                className="gk-cta"
                to={`/checkout${storeParam}`}
                style={{ display: "block", textAlign: "center", marginTop: 20, textDecoration: "none", lineHeight: "28px" }}
              >
                Checkout
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

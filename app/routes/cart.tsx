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
} from "~/lib/cart.server";
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

  const cart = await priceCart(context.db, store, readCartToken(request));
  return {
    store: { name: store.name, slug: store.slug, currency: store.currency },
    cart,
    taxRate: store.taxRate,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const url = new URL(request.url);
  const store = await resolveStore(context.db, context.hostname, url);
  if (!store) throw new Response("No store for this domain.", { status: 404 });

  const token = readCartToken(request);
  if (!token) return { ok: true };

  const form = await request.formData();
  const variantId = String(form.get("variantId") || "");
  const quantity = Number(form.get("quantity") || 0);

  const lines = await currentLines(context.db, store.id, token);
  await saveCart(context.db, store.id, token, setLineQuantity(lines, variantId, quantity));
  return { ok: true };
}

export default function Cart({ loaderData }: Route.ComponentProps) {
  const { store, cart } = loaderData;
  const storeParam = `?store=${store.slug}`;

  return (
    <div className="gk">
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
              {cart.taxCents > 0 ? (
                <div className="gk-totals">
                  <span>Tax</span>
                  <span>{formatMoney(cart.taxCents, cart.currency)}</span>
                </div>
              ) : null}
              <div className="gk-totals">
                <span>Shipping</span>
                <span>Free</span>
              </div>
              <div className="gk-totals" style={{ borderTop: "1px solid var(--gk-line)", marginTop: 8, paddingTop: 16 }}>
                <strong>Total</strong>
                <strong>{formatMoney(cart.totalCents, cart.currency)}</strong>
              </div>

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

/**
 * Starting the payment — off the critical path.
 *
 * This used to happen inside the checkout loader, which meant every single
 * page load waited on a round trip to Stripe before one byte of HTML left the
 * Worker. Measured on the live store that was the difference between a 0.39s
 * home page and a 0.7–0.97s checkout: about half a second of blank screen on
 * the one page where a blank screen costs money.
 *
 * So the page renders first and asks for the intent immediately after, while
 * Stripe's own script is still downloading. Nothing about the money changed:
 * the amount is still the server's figure from priceCart, the intent is still
 * stored on the cart row, and the action still re-checks and re-prices it
 * before anything is confirmed.
 */
import type { ActionFunctionArgs } from "react-router";
import { resolveStore } from "~/lib/store.server";
import { priceCart, readCartToken, cartPaymentIntentId, setCartPaymentIntentId } from "~/lib/cart.server";
import { providerForStore, PaymentsNotConfigured } from "~/lib/payments.server";

/** Intent states that still belong to a payment that has not happened. */
const PAYABLE = new Set(["requires_payment_method", "requires_confirmation", "requires_action", "processing"]);

export async function action({ context, request }: ActionFunctionArgs) {
  const url = new URL(request.url);
  const store = await resolveStore(context.db, context.hostname, url);
  if (!store) return Response.json({ error: "No store for this domain." }, { status: 404 });

  const token = readCartToken(request);
  if (!token) return Response.json({ clientSecret: null, error: "No cart." }, { status: 400 });

  const form = await request.formData().catch(() => null);
  const region = String(form?.get("region") ?? "").trim().toUpperCase().slice(0, 3) || null;
  const cart = await priceCart(context.db, store, token, region);
  if (cart.lines.length === 0) return Response.json({ clientSecret: null, error: "Your cart is empty." }, { status: 400 });

  try {
    const provider = await providerForStore(context.db, context.cloudflare.env, store.id);
    if (!provider.publishableKey) {
      return Response.json({ clientSecret: null, error: "This store has no Stripe key set." }, { status: 400 });
    }

    const existingId = await cartPaymentIntentId(context.db, store.id, token);
    let intent = null;
    if (existingId) {
      try {
        const found = await provider.readIntent(existingId);
        // An intent that is already being paid belongs to a charge that is
        // happening. It is never reused or written over.
        if (PAYABLE.has(found.status)) intent = found;
      } catch {
        intent = null;
      }
    }

    if (intent) {
      if (intent.amountCents !== cart.totalCents) {
        intent = await provider.updateIntent(intent.id, {
          amountCents: cart.totalCents,
          currency: cart.currency,
        });
      }
    } else {
      intent = await provider.createIntent({
        amountCents: cart.totalCents,
        currency: cart.currency,
        orderReference: `${store.name} order`,
        metadata: { storeId: store.id },
      });
      await setCartPaymentIntentId(context.db, store.id, token, intent.id);
    }

    return Response.json({ clientSecret: intent.clientSecret, amountCents: cart.totalCents, error: null });
  } catch (error) {
    return Response.json(
      {
        clientSecret: null,
        error:
          error instanceof PaymentsNotConfigured
            ? error.message
            : `Payments are not available right now: ${error instanceof Error ? error.message : "Stripe did not answer."}`,
      },
      { status: 500 },
    );
  }
}

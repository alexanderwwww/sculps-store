/**
 * "This is who I am" — the one thing checkout posts before it has an order.
 *
 * The checkout page calls this the moment the email field is completed (on
 * blur, or on the first submit attempt). It records the address on the cart
 * row and creates or updates the `customers` row, so the person exists — and
 * an abandoned cart can be recovered — before any money moves.
 *
 * Everything it records is something the customer typed into this store's own
 * checkout. The only thing not typed is the city/region/country Cloudflare
 * already attached to their request, which is kept as *where the visit came
 * from*, not as an identity, and is never used to name anyone.
 *
 * It answers JSON and sets no cookie of its own, so it can be called from a
 * fetcher without disturbing the page the customer is filling in.
 */
import type { Route } from "./+types/checkout.identify";
import { resolveStore } from "~/lib/store.server";
import { cartRowByToken, readCartToken } from "~/lib/cart.server";
import { geoFromContext, readVisitorSession } from "~/lib/visitor.server";
import {
  attachCartToCustomer,
  looksLikeEmail,
  normaliseEmail,
  upsertCustomer,
} from "~/lib/customers.server";

export async function action({ request, context }: Route.ActionArgs) {
  const url = new URL(request.url);
  const store = await resolveStore(context.db, context.hostname, url);
  if (!store) return Response.json({ ok: false, reason: "no-store" }, { status: 404 });

  const form = await request.formData();
  const email = normaliseEmail(String(form.get("email") ?? ""));

  // A half-typed address is not a person. Nothing is written, and the page is
  // told plainly rather than being shown a success it did not get.
  if (!looksLikeEmail(email)) return Response.json({ ok: false, reason: "no-email" });

  // Consent is only recorded when checkout actually sent the box. A missing
  // field means "they did not say", which leaves whatever they last chose
  // alone — it never becomes a silent yes.
  const consentRaw = form.get("consent");
  const consent =
    consentRaw === null ? undefined : consentRaw === "on" || consentRaw === "true" || consentRaw === "1";

  const customer = await upsertCustomer(context.db, store.id, {
    email,
    name: String(form.get("name") ?? ""),
    phone: String(form.get("phone") ?? ""),
    geo: geoFromContext(context, request),
    consent,
    sessionId: readVisitorSession(request),
  });
  if (!customer) return Response.json({ ok: false, reason: "no-email" });

  const cart = await cartRowByToken(context.db, store.id, readCartToken(request));
  if (cart) await attachCartToCustomer(context.db, cart.id, customer.id, email);

  return Response.json({ ok: true });
}

/** A GET here is someone poking the address; say what it is for. */
export function loader() {
  return new Response("This endpoint records the email typed into checkout.", { status: 405 });
}

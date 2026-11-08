/**
 * One narrow, keyed door for Claude: re-send a paid order's own confirmation email.
 *
 *   POST /ops/<key>/resend-confirmation   { "store": "reaper", "number": 1005 }
 *
 * It can do exactly one thing: send the store's own confirmation template to the email address already on
 * that paid order, once per call. It cannot send to any other address, cannot send anything else, and cannot
 * read anything back except whether it worked.
 */
import { and, eq } from "drizzle-orm";
import type { Route } from "./+types/ops.$";
import { orders, stores, paymentProviders } from "~/db/schema";
import { decryptSecret } from "~/lib/crypto.server";
import { resendConfirmation } from "~/lib/fulfilment.server";

const KEY = "8900598f490c14b9515b49474fe5c99311f3a3fe6a957517";
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function loader() {
  throw new Response("Not found", { status: 404 });
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const [key, what] = (params["*"] ?? "").split("/").filter(Boolean);
  if (key === KEY && what === "stripe-health" && request.method === "POST") return stripeHealth(request, context);
  if (key === KEY && what === "stripe-link" && request.method === "POST") return stripeLink(request, context);
  if (key === KEY && what === "stripe-link-update" && request.method === "POST") return stripeLinkUpdate(request, context);
  if (key !== KEY || what !== "resend-confirmation" || request.method !== "POST") throw new Response("Not found", { status: 404 });
  let body: { store?: string; number?: number } = {};
  try { body = await request.json(); } catch { return json({ ok: false, error: "bad json" }, 400); }
  const number = Number(body.number);
  if (!body.store || !Number.isInteger(number)) return json({ ok: false, error: "store and number are required" }, 400);
  const [store] = await context.db.select().from(stores).where(eq(stores.slug, String(body.store))).limit(1);
  if (!store) return json({ ok: false, error: "no such store" }, 404);
  const [order] = await context.db.select().from(orders).where(and(eq(orders.storeId, store.id), eq(orders.number, number))).limit(1);
  if (!order) return json({ ok: false, error: "no such order" }, 404);
  const result = await resendConfirmation(context.db, context.cloudflare.env, order.id);
  return json({ ...result, to: order.email, number });
}

/** POST /ops/<key>/stripe-health {store}: READ-ONLY. Asks Stripe for the account, its requirements and balance. Changes nothing. (2026-11-07) */
async function stripeHealth(request: Request, context: Route.ActionArgs["context"]) {
  let body: { store?: string } = {}; try { body = await request.json(); } catch { /* empty */ }
  const [store] = await context.db.select().from(stores).where(eq(stores.slug, String(body.store || ""))).limit(1);
  if (!store) return json({ ok: false, error: "no such store" }, 404);
  const [row] = await context.db.select().from(paymentProviders).where(and(eq(paymentProviders.storeId, store.id), eq(paymentProviders.provider, "stripe"))).limit(1);
  const sk = row ? await decryptSecret(context.cloudflare.env, row.secretKeyEnc) : null;
  if (!sk) return json({ ok: false, error: "no stripe key" }, 404);
  const get = async (path: string) => { const r = await fetch(`https://api.stripe.com/v1/${path}`, { headers: { authorization: `Bearer ${sk}` } }); return r.json() as Promise<Record<string, any>>; };
  const [a, b, w] = await Promise.all([get("account"), get("balance"), get("webhook_endpoints?limit=10")]);
  return json({
    ok: true, livemode: String(sk).startsWith("sk_live"), id: a.id, email: a.email, country: a.country, business_name: a.business_profile?.name, url: a.business_profile?.url, mcc: a.business_profile?.mcc,
    charges_enabled: a.charges_enabled, payouts_enabled: a.payouts_enabled, details_submitted: a.details_submitted,
    requirements: a.requirements && { currently_due: a.requirements.currently_due, past_due: a.requirements.past_due, eventually_due: a.requirements.eventually_due, disabled_reason: a.requirements.disabled_reason, current_deadline: a.requirements.current_deadline, errors: a.requirements.errors },
    capabilities: a.capabilities, statement_descriptor: a.settings?.payments?.statement_descriptor, payout_schedule: a.settings?.payouts?.schedule,
    balance: b && { available: b.available, pending: b.pending },
    webhooks: (w?.data || []).map((x: Record<string, any>) => ({ url: x.url, status: x.status, events: (x.enabled_events || []).length })),
    error: a.error?.message || null,
  });
}

/** POST /ops/<key>/stripe-link {store, name, description, amountCents}: creates ONE Stripe Payment Link (product + price + link).
 *  No charge is made; the customer pays on Stripe's own page. Shipping address and phone are collected. (2026-11-08, Alex) */
async function stripeLink(request: Request, context: Route.ActionArgs["context"]) {
  let body: { store?: string; name?: string; description?: string; amountCents?: number } = {}; try { body = await request.json(); } catch { /* empty */ }
  const amount = Number(body.amountCents);
  if (!body.name || !Number.isInteger(amount) || amount < 100 || amount > 5_000_000) return json({ ok: false, error: "name and amountCents (100..5,000,000) required" }, 400);
  const [store] = await context.db.select().from(stores).where(eq(stores.slug, String(body.store || ""))).limit(1);
  if (!store) return json({ ok: false, error: "no such store" }, 404);
  const [row] = await context.db.select().from(paymentProviders).where(and(eq(paymentProviders.storeId, store.id), eq(paymentProviders.provider, "stripe"))).limit(1);
  const sk = row ? await decryptSecret(context.cloudflare.env, row.secretKeyEnc) : null;
  if (!sk) return json({ ok: false, error: "no stripe key" }, 404);
  const post = async (path: string, form: Record<string, string>) => { const r = await fetch(`https://api.stripe.com/v1/${path}`, { method: "POST", headers: { authorization: `Bearer ${sk}`, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form).toString() }); return r.json() as Promise<Record<string, any>>; };
  const prod = await post("products", { name: String(body.name), ...(body.description ? { description: String(body.description) } : {}) });
  if (!prod.id) return json({ ok: false, step: "product", error: prod.error?.message }, 400);
  const price = await post("prices", { product: prod.id, unit_amount: String(amount), currency: "usd" });
  if (!price.id) return json({ ok: false, step: "price", error: price.error?.message }, 400);
  const countries = ["US","CA","GB","AU","NZ","IE","DE","FR","NL","ES","IT","GR","BE","AT","CH","SE","DK","NO","FI","PT","PL","JP","KR","SG","HK","AE","CY","LU"];
  const form: Record<string, string> = { "line_items[0][price]": price.id, "line_items[0][quantity]": "1", "phone_number_collection[enabled]": "true", "metadata[store]": store.slug, "after_completion[type]": "hosted_confirmation", "after_completion[hosted_confirmation][custom_message]": "Thank you. Your piece is reserved and your Mysterious Archive certificate is being prepared." };
  countries.forEach((c, i) => { form[`shipping_address_collection[allowed_countries][${i}]`] = c; });
  const link = await post("payment_links", form);
  if (!link.url) return json({ ok: false, step: "link", error: link.error?.message }, 400);
  return json({ ok: true, url: link.url, id: link.id, amount, livemode: link.livemode });
}

/** POST /ops/<key>/stripe-link-update {store, id, message?, description?, images?[]}: edits a Payment Link we made (its thank-you message,
 *  its product's description and pictures). Read-modify only; no charge, no new link. */
async function stripeLinkUpdate(request: Request, context: Route.ActionArgs["context"]) {
  let body: { store?: string; id?: string; message?: string; description?: string; images?: string[]; active?: boolean } = {}; try { body = await request.json(); } catch { /* empty */ }
  if (!/^plink_[A-Za-z0-9]+$/.test(String(body.id || ""))) return json({ ok: false, error: "id must be a plink_" }, 400);
  const [store] = await context.db.select().from(stores).where(eq(stores.slug, String(body.store || ""))).limit(1);
  if (!store) return json({ ok: false, error: "no such store" }, 404);
  const [row] = await context.db.select().from(paymentProviders).where(and(eq(paymentProviders.storeId, store.id), eq(paymentProviders.provider, "stripe"))).limit(1);
  const sk = row ? await decryptSecret(context.cloudflare.env, row.secretKeyEnc) : null;
  if (!sk) return json({ ok: false, error: "no stripe key" }, 404);
  const call = async (method: string, path: string, form?: Record<string, string>) => { const r = await fetch(`https://api.stripe.com/v1/${path}`, { method, headers: { authorization: `Bearer ${sk}`, "content-type": "application/x-www-form-urlencoded" }, body: form ? new URLSearchParams(form).toString() : undefined }); return r.json() as Promise<Record<string, any>>; };
  const out: Record<string, unknown> = {};
  const lf: Record<string, string> = {};
  if (typeof body.message === "string") { lf["after_completion[type]"] = "hosted_confirmation"; lf["after_completion[hosted_confirmation][custom_message]"] = body.message; }
  if (typeof body.active === "boolean") lf.active = String(body.active);
  if (Object.keys(lf).length) { const l = await call("POST", `payment_links/${body.id}`, lf); out.link = l.error?.message || "updated"; }
  if (typeof body.description === "string" || Array.isArray(body.images)) {
    const items = await call("GET", `payment_links/${body.id}/line_items?limit=1`);
    const prodId = items?.data?.[0]?.price?.product; if (!prodId) return json({ ok: false, error: "no product on link", items }, 400);
    const pf: Record<string, string> = {};
    if (typeof body.description === "string") pf.description = body.description;
    (body.images || []).slice(0, 8).forEach((u, i) => { pf[`images[${i}]`] = String(u); });
    const pr = await call("POST", `products/${prodId}`, pf); out.product = pr.error?.message || "updated";
  }
  const l = await call("GET", `payment_links/${body.id}`);
  return json({ ok: true, ...out, url: l.url, active: l.active, methods: l.payment_method_types ?? "automatic (account settings)", message: l.after_completion?.hosted_confirmation?.custom_message });
}

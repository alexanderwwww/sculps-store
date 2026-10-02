/**
 * Klarna and Affirm, taken on the Aigis LLC's own Stripe account.
 *
 * Not the store's card processor. The cards and Apple Pay run on the primary
 * Stripe account; this is a second, separate Stripe account (a US company,
 * Aigis LLC) that carries only the pay-over-time methods. It is its own row in
 * payment_providers (`stripe_bnpl`), encrypted with the same master key as
 * every other secret, and a store without that row simply shows no
 * installment buttons.
 *
 * The flow is a redirect: the intent is created, the order is written, the
 * intent is confirmed with a return address, the customer goes to Klarna or
 * Affirm and comes back, and only then is the order marked paid — after
 * asking Stripe what happened, never from the redirect alone.
 */
import { and, eq } from "drizzle-orm";
import type { DB } from "~/db/client";
import { paymentProviders } from "~/db/schema";
import { decryptSecret } from "./crypto.server";

export type BnplMethod = "klarna" | "affirm";
export const BNPL_METHODS: readonly BnplMethod[] = ["klarna", "affirm"];

export interface BnplAccount {
  secretKey: string;
  publishableKey: string;
}

/** The store's pay-over-time account, or null when it has none. */
export async function bnplFor(db: DB, env: Env, storeId: string): Promise<BnplAccount | null> {
  const [row] = await db
    .select()
    .from(paymentProviders)
    .where(and(eq(paymentProviders.storeId, storeId), eq(paymentProviders.provider, "stripe_bnpl")))
    .limit(1);
  if (!row?.publishableKey) return null;
  const secretKey = await decryptSecret(env, row.secretKeyEnc);
  if (!secretKey) return null;
  return { secretKey, publishableKey: row.publishableKey };
}

async function call(account: BnplAccount, path: string, body?: URLSearchParams, idempotencyKey?: string): Promise<any> {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${account.secretKey}`,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body,
  });
  const payload = (await response.json()) as any;
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? `Stripe answered ${response.status}.`);
  }
  return payload;
}

export interface BnplCustomer {
  name: string;
  email: string;
  phone: string | null;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

/** An intent that accepts exactly one method, not yet confirmed. */
export async function createBnplIntent(
  account: BnplAccount,
  input: { amountCents: number; currency: string; method: BnplMethod; description: string; storeId: string },
): Promise<{ id: string }> {
  const body = new URLSearchParams({
    amount: String(input.amountCents),
    currency: input.currency.toLowerCase(),
    "payment_method_types[]": input.method,
    description: input.description,
    "metadata[storeId]": input.storeId,
    "metadata[method]": input.method,
  });
  const intent = await call(account, "payment_intents", body);
  return { id: intent.id as string };
}

/** Confirms the intent for the customer and returns where to send them. */
export async function confirmBnplIntent(
  account: BnplAccount,
  intentId: string,
  input: { method: BnplMethod; customer: BnplCustomer; returnUrl: string; orderId: string },
): Promise<{ status: string; redirectUrl: string | null }> {
  const c = input.customer;
  const body = new URLSearchParams({
    "payment_method_data[type]": input.method,
    "payment_method_data[billing_details][name]": c.name,
    "payment_method_data[billing_details][email]": c.email,
    "payment_method_data[billing_details][address][line1]": c.line1,
    "payment_method_data[billing_details][address][city]": c.city,
    "payment_method_data[billing_details][address][state]": c.state,
    "payment_method_data[billing_details][address][postal_code]": c.postalCode,
    "payment_method_data[billing_details][address][country]": c.country,
    "shipping[name]": c.name,
    "shipping[address][line1]": c.line1,
    "shipping[address][city]": c.city,
    "shipping[address][state]": c.state,
    "shipping[address][postal_code]": c.postalCode,
    "shipping[address][country]": c.country,
    return_url: input.returnUrl,
  });
  if (c.phone) body.set("payment_method_data[billing_details][phone]", c.phone);
  if (c.line2) {
    body.set("payment_method_data[billing_details][address][line2]", c.line2);
    body.set("shipping[address][line2]", c.line2);
  }
  const intent = await call(account, `payment_intents/${intentId}/confirm`, body);
  return {
    status: intent.status as string,
    redirectUrl: intent.next_action?.redirect_to_url?.url ?? null,
  };
}

export async function readBnplIntent(
  account: BnplAccount,
  intentId: string,
): Promise<{ id: string; status: string; amountCents: number }> {
  const intent = await call(account, `payment_intents/${intentId}`);
  return { id: intent.id, status: intent.status, amountCents: intent.amount };
}

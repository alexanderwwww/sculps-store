/**
 * Payments.
 *
 * Deliberately an interface with one implementation. Stripe is provider one;
 * adding PayPal later must not require touching orders or checkout, so nothing
 * outside this file knows what a Stripe object looks like.
 *
 * Credentials are read per store from payment_providers and decrypted with the
 * Worker's master key, so one frozen account cannot take the other stores down.
 */
import { eq, and } from "drizzle-orm";
import type { DB } from "~/db/client";
import { paymentProviders } from "~/db/schema";
import { decryptSecret } from "./crypto.server";

export interface PaymentIntent {
  id: string;
  clientSecret: string;
  status: string;
}

export interface RefundResult {
  id: string;
  status: string;
  amountCents: number;
}

export interface PaymentProvider {
  name: string;
  publishableKey: string | null;
  createIntent(input: {
    amountCents: number;
    currency: string;
    email: string;
    orderReference: string;
    metadata?: Record<string, string>;
  }): Promise<PaymentIntent>;
  capture(intentId: string): Promise<PaymentIntent>;
  refund(intentId: string, amountCents?: number): Promise<RefundResult>;
  readIntent(intentId: string): Promise<PaymentIntent>;
}

export class PaymentsNotConfigured extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentsNotConfigured";
  }
}

/**
 * Returns the store's payment provider, or throws with a reason a person can
 * act on. Never returns a half-configured provider that fails later at the
 * worst possible moment — during someone's checkout.
 */
export async function providerForStore(
  db: DB,
  env: Env,
  storeId: string,
): Promise<PaymentProvider> {
  const [row] = await db
    .select()
    .from(paymentProviders)
    .where(and(eq(paymentProviders.storeId, storeId), eq(paymentProviders.provider, "stripe")))
    .limit(1);

  if (!row) {
    throw new PaymentsNotConfigured("This store has no payment provider connected yet.");
  }

  const secretKey = await decryptSecret(env, row.secretKeyEnc);
  if (!secretKey) {
    throw new PaymentsNotConfigured(
      "This store's Stripe secret key could not be read. Re-enter it in Settings → Payments.",
    );
  }

  return new StripeProvider(secretKey, row.publishableKey, row.capture === "manual");
}

/** True when checkout can run, without throwing — for showing the state. */
export async function paymentsReady(db: DB, env: Env, storeId: string): Promise<boolean> {
  try {
    await providerForStore(db, env, storeId);
    return true;
  } catch {
    return false;
  }
}

class StripeProvider implements PaymentProvider {
  readonly name = "stripe";

  constructor(
    private readonly secretKey: string,
    readonly publishableKey: string | null,
    private readonly manualCapture: boolean,
  ) {}

  private async call(path: string, body?: Record<string, string>): Promise<any> {
    const response = await fetch(`https://api.stripe.com/v1/${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      },
      body: body ? new URLSearchParams(body) : undefined,
    });

    const payload = (await response.json()) as any;
    if (!response.ok) {
      // Stripe's own message is the useful one; passing it through beats a
      // generic failure that tells nobody what to fix.
      throw new Error(payload?.error?.message ?? `Stripe refused the request (${response.status}).`);
    }
    return payload;
  }

  async createIntent(input: {
    amountCents: number;
    currency: string;
    email: string;
    orderReference: string;
    metadata?: Record<string, string>;
  }): Promise<PaymentIntent> {
    const body: Record<string, string> = {
      amount: String(input.amountCents),
      currency: input.currency.toLowerCase(),
      "automatic_payment_methods[enabled]": "true",
      capture_method: this.manualCapture ? "manual" : "automatic",
      receipt_email: input.email,
      description: input.orderReference,
    };
    for (const [key, value] of Object.entries(input.metadata ?? {})) {
      body[`metadata[${key}]`] = value;
    }

    const intent = await this.call("payment_intents", body);
    return { id: intent.id, clientSecret: intent.client_secret, status: intent.status };
  }

  async capture(intentId: string): Promise<PaymentIntent> {
    const intent = await this.call(`payment_intents/${intentId}/capture`, {});
    return { id: intent.id, clientSecret: intent.client_secret, status: intent.status };
  }

  async readIntent(intentId: string): Promise<PaymentIntent> {
    const intent = await this.call(`payment_intents/${intentId}`);
    return { id: intent.id, clientSecret: intent.client_secret, status: intent.status };
  }

  async refund(intentId: string, amountCents?: number): Promise<RefundResult> {
    const body: Record<string, string> = { payment_intent: intentId };
    if (amountCents !== undefined) body.amount = String(amountCents);
    const refund = await this.call("refunds", body);
    return { id: refund.id, status: refund.status, amountCents: refund.amount };
  }
}

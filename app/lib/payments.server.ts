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
  /** what Stripe currently holds this intent at, in the smallest unit */
  amountCents: number;
}

/**
 * The statuses an intent can still be paid from. Anything else — succeeded,
 * processing, canceled — belongs to a payment that has already happened, so
 * checkout starts a fresh one rather than writing over it.
 */
export const PAYABLE_INTENT_STATUSES = new Set([
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
]);

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
    /** not known yet when the intent is made on page load */
    email?: string | null;
    orderReference: string;
    metadata?: Record<string, string>;
  }): Promise<PaymentIntent>;
  /**
   * Moves an existing intent to a new amount — and, once checkout knows them,
   * the receipt address and the metadata. One intent per cart: the total
   * changing must never leave a second intent behind, and must never let the
   * old amount reach confirmation.
   */
  updateIntent(
    intentId: string,
    input: {
      amountCents?: number;
      currency?: string;
      email?: string | null;
      metadata?: Record<string, string>;
    },
  ): Promise<PaymentIntent>;
  capture(intentId: string): Promise<PaymentIntent>;
  refund(intentId: string, amountCents: number | undefined, idempotencyKey: string): Promise<RefundResult>;
  readIntent(intentId: string): Promise<PaymentIntent>;
  /** Proves the secret key works, without charging anyone. */
  testConnection(): Promise<{ ok: true; account: string } | { ok: false; reason: string }>;
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

  private async call(path: string, body?: Record<string, string>, idempotencyKey?: string): Promise<any> {
    const response = await fetch(`https://api.stripe.com/v1/${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
        // A retried request with the same key returns the same refund rather
        // than creating a second one.
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
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
    email?: string | null;
    orderReference: string;
    metadata?: Record<string, string>;
  }): Promise<PaymentIntent> {
    const body: Record<string, string> = {
      amount: String(input.amountCents),
      currency: input.currency.toLowerCase(),
      "automatic_payment_methods[enabled]": "true",
      capture_method: this.manualCapture ? "manual" : "automatic",
      description: input.orderReference,
    };
    if (input.email) body.receipt_email = input.email;
    for (const [key, value] of Object.entries(input.metadata ?? {})) {
      body[`metadata[${key}]`] = value;
    }

    const intent = await this.call("payment_intents", body);
    return toIntent(intent);
  }

  async updateIntent(
    intentId: string,
    input: {
      amountCents?: number;
      currency?: string;
      email?: string | null;
      metadata?: Record<string, string>;
    },
  ): Promise<PaymentIntent> {
    const body: Record<string, string> = {};
    if (input.amountCents !== undefined) body.amount = String(input.amountCents);
    if (input.currency) body.currency = input.currency.toLowerCase();
    if (input.email) body.receipt_email = input.email;
    for (const [key, value] of Object.entries(input.metadata ?? {})) {
      body[`metadata[${key}]`] = value;
    }
    // Nothing to change is not a reason to spend a round trip.
    if (!Object.keys(body).length) return this.readIntent(intentId);
    const intent = await this.call(`payment_intents/${intentId}`, body);
    return toIntent(intent);
  }

  async capture(intentId: string): Promise<PaymentIntent> {
    const intent = await this.call(`payment_intents/${intentId}/capture`, {});
    return toIntent(intent);
  }

  async readIntent(intentId: string): Promise<PaymentIntent> {
    const intent = await this.call(`payment_intents/${intentId}`);
    return toIntent(intent);
  }

  async testConnection(): Promise<{ ok: true; account: string } | { ok: false; reason: string }> {
    try {
      // /v1/balance is the cheapest authenticated call Stripe has. A wrong or
      // revoked key fails here; a right one names the account's currency.
      const balance = await this.call("balance");
      const currency = balance?.available?.[0]?.currency?.toUpperCase() ?? "account";
      return { ok: true, account: currency };
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : "Stripe refused the key." };
    }
  }

  async refund(intentId: string, amountCents: number | undefined, idempotencyKey: string): Promise<RefundResult> {
    const body: Record<string, string> = { payment_intent: intentId };
    if (amountCents !== undefined) body.amount = String(amountCents);
    const refund = await this.call("refunds", body, idempotencyKey);
    return { id: refund.id, status: refund.status, amountCents: refund.amount };
  }
}

/** Stripe's intent shape, narrowed to the four things anything here needs. */
function toIntent(intent: any): PaymentIntent {
  return {
    id: intent.id,
    clientSecret: intent.client_secret,
    status: intent.status,
    amountCents: Number(intent.amount ?? 0),
  };
}

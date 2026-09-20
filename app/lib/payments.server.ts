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
import { paymentProviders, stores } from "~/db/schema";
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
  /**
   * What the provider is holding, in the smallest unit, or null when it will
   * not say. Null means "show nothing" — never "show a zero".
   */
  balance?(currency: string): Promise<{ availableCents: number; pendingCents?: number } | null>;
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
  /**
   * Charge the card that paid an earlier intent, without the customer
   * touching anything.
   *
   * This is what a post-purchase offer is: the details are already held, the
   * customer already consented to this shop taking money, and asking them to
   * type a card number again for a nineteen dollar add-on is why almost
   * nobody takes one. It reads the first intent for the customer and the
   * payment method, and charges off-session against both.
   *
   * It can legitimately fail. A card can decline off-session even when it
   * cleared a minute earlier — some banks require the customer to be present
   * for anything after the first charge — and that is a normal answer here,
   * not an error to retry.
   */
  chargeSaved(input: {
    fromIntentId: string;
    amountCents: number;
    currency: string;
    description: string;
    idempotencyKey: string;
    metadata?: Record<string, string>;
  }): Promise<{ ok: true; intentId: string } | { ok: false; reason: string }>;
  readIntent(intentId: string): Promise<PaymentIntent>;
  /** Proves the secret key works, without charging anyone. */
  testConnection(): Promise<{ ok: true; account: string } | { ok: false; reason: string }>;
  /**
   * Tell the processor this domain may show Apple Pay. Apple will not draw
   * the button on a site the merchant has not claimed, which is why the
   * button is missing rather than broken when this has never been called.
   * Optional: only the card processors have anything to register.
   */
  registerApplePayDomain?(domain: string): Promise<{ ok: true; domains: string[] } | { ok: false; reason: string }>;
  /** Every domain this account may show Apple Pay on. Null when it cannot be read. */
  applePayDomains?(): Promise<string[] | null>;
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

  /*
   * What the customer sees on their bank statement.
   *
   * Two stores on one Stripe account share one descriptor, and "BLACK REAPER"
   * on the statement of somebody who bought a garden kneeler is a chargeback
   * waiting to happen. Stripe lets each charge carry a suffix after the
   * account's own prefix, so every charge names the store it came from.
   * Letters, digits and spaces only, and short enough to fit beside the
   * prefix inside Stripe's twenty-two character limit.
   */
  const [named] = await db.select({ name: stores.name }).from(stores).where(eq(stores.id, storeId)).limit(1);
  const suffix = (named?.name ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 10) || null;
  return new StripeProvider(secretKey, row.publishableKey, row.capture === "manual", suffix);
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
    private readonly descriptorSuffix: string | null = null,
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
      ...(this.descriptorSuffix ? { statement_descriptor_suffix: this.descriptorSuffix } : {}),
      /*
       * Keep the card on file for a later charge.
       *
       * Without this the post-purchase offer cannot exist: Stripe discards
       * the payment method once the intent is done and the only way back is
       * to ask for the card again, which nobody does for a twenty dollar
       * add-on. With it, the customer's own bank sees a second charge from a
       * shop they just bought from, which is exactly what it is.
       *
       * The customer is created up front because off-session reuse needs one
       * — a saved method with nothing to attach it to cannot be charged.
       */
      setup_future_usage: "off_session",
    };
    if (!body.customer) {
      const customer = await this.call("customers", input.email ? { email: input.email } : {});
      if (customer?.id) body.customer = String(customer.id);
    }
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

  async chargeSaved(input: {
    fromIntentId: string;
    amountCents: number;
    currency: string;
    description: string;
    idempotencyKey: string;
    metadata?: Record<string, string>;
  }): Promise<{ ok: true; intentId: string } | { ok: false; reason: string }> {
    try {
      const first = await this.call(`payment_intents/${input.fromIntentId}`);
      const customer = first?.customer ? String(first.customer) : "";
      const method = first?.payment_method ? String(first.payment_method) : "";
      if (!customer || !method) {
        return { ok: false, reason: "that order's card was not kept on file" };
      }
      if (first?.status !== "succeeded") {
        return { ok: false, reason: "the first payment has not settled" };
      }

      const body: Record<string, string> = {
        amount: String(input.amountCents),
        currency: input.currency.toLowerCase(),
        customer,
        payment_method: method,
        off_session: "true",
        ...(this.descriptorSuffix ? { statement_descriptor_suffix: this.descriptorSuffix } : {}),
        confirm: "true",
        description: input.description,
      };
      for (const [k, v] of Object.entries(input.metadata ?? {})) body[`metadata[${k}]`] = v;

      const intent = await this.call("payment_intents", body, input.idempotencyKey);
      if (intent?.status === "succeeded" || intent?.status === "requires_capture") {
        return { ok: true, intentId: String(intent.id) };
      }
      // Anything else means the bank wants the customer present, which is a
      // no rather than a fault.
      return { ok: false, reason: "the bank asked for the card to be confirmed again" };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : "the card was declined" };
    }
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

  /** Every domain the account has claimed, or null if the key cannot read them. */
  async applePayDomains(): Promise<string[] | null> {
    try {
      const list = await this.call("apple_pay/domains");
      if (!Array.isArray(list?.data)) return null;
      return list.data.map((d: { domain_name?: string }) => d.domain_name ?? "").filter(Boolean);
    } catch {
      return null;
    }
  }

  /**
   * Claim a domain for Apple Pay, then read back every domain on the account.
   *
   * Apple's rule is that the button only appears on a domain the merchant has
   * registered and which serves Apple's verification file. Stripe hosts that
   * file for us, so registering here is the whole of it -- and registering a
   * domain that is already registered is not an error worth surfacing, so a
   * duplicate is folded back into the list.
   */
  async registerApplePayDomain(
    domain: string,
  ): Promise<{ ok: true; domains: string[] } | { ok: false; reason: string }> {
    try {
      try {
        await this.call("apple_pay/domains", { domain_name: domain });
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        // Already claimed by this account: nothing to do, and not a failure.
        if (!/already|exists/i.test(message)) throw error;
      }
      const list = await this.call("apple_pay/domains");
      const domains: string[] = Array.isArray(list?.data)
        ? list.data.map((d: { domain_name?: string }) => d.domain_name ?? "").filter(Boolean)
        : [];
      return { ok: true, domains };
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : "Stripe refused the request." };
    }
  }

  /**
   * What Stripe is holding for this account, in the smallest unit.
   * `available` is what is clear to be paid out; `pending` is what is still
   * settling. Null when the key cannot read it — a figure is only ever shown
   * when Stripe actually gave one.
   */
  async balance(currency: string): Promise<{ availableCents: number; pendingCents: number } | null> {
    try {
      const balance = await this.call("balance");
      const want = currency.toLowerCase();
      const sum = (rows: any[] | undefined) =>
        (rows ?? [])
          .filter((row) => String(row?.currency).toLowerCase() === want)
          .reduce((total, row) => total + (Number(row?.amount) || 0), 0);
      const available = sum(balance?.available);
      const pending = sum(balance?.pending);
      if (!balance?.available && !balance?.pending) return null;
      return { availableCents: available, pendingCents: pending };
    } catch {
      return null;
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

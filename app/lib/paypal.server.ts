/**
 * PayPal, as a second way to pay.
 *
 * Not a replacement for Stripe and not routed through it — PayPal is its own
 * company, its own API, its own money. The two run side by side and the
 * customer picks. For this store's customer that matters more than anything
 * else in the checkout: a 65-year-old who will never type a card into a shop
 * she has not heard of will happily press the PayPal button, because she has
 * had the account for fifteen years.
 *
 * It also carries Pay Later and Venmo at no extra cost, which is the only
 * buy-now-pay-later this Greek merchant can offer American customers without
 * a US entity.
 *
 * Credentials live per store in payment_providers, encrypted with the
 * Worker's master key, exactly like the Stripe keys.
 */
import { and, eq } from "drizzle-orm";
import type { DB } from "~/db/client";
import { paymentProviders } from "~/db/schema";
import { decryptSecret } from "./crypto.server";

const LIVE = "https://api-m.paypal.com";
const SANDBOX = "https://api-m.sandbox.paypal.com";

export interface PayPalCredentials {
  clientId: string;
  secret: string;
  /** live unless the stored key is explicitly a sandbox one */
  sandbox: boolean;
}

export interface PayPalOrder {
  id: string;
  status: string;
}

export interface PayPalCapture {
  orderId: string;
  captureId: string;
  status: string;
  amountCents: number;
  currency: string;
  payer: {
    email: string | null;
    firstName: string | null;
    lastName: string | null;
  };
  shipping: {
    name: string | null;
    line1: string | null;
    line2: string | null;
    city: string | null;
    region: string | null;
    postalCode: string | null;
    country: string | null;
  };
}

export class PayPalNotConfigured extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayPalNotConfigured";
  }
}

/** The store's PayPal credentials, or null when it has none. */
export async function paypalFor(
  db: DB,
  env: Env,
  storeId: string,
): Promise<PayPalClient | null> {
  const [row] = await db
    .select()
    .from(paymentProviders)
    .where(and(eq(paymentProviders.storeId, storeId), eq(paymentProviders.provider, "paypal")))
    .limit(1);

  if (!row?.publishableKey) return null;
  const secret = await decryptSecret(env, row.secretKeyEnc);
  if (!secret) return null;

  return new PayPalClient({
    clientId: row.publishableKey,
    secret,
    sandbox: row.accountName === "sandbox",
  });
}

export class PayPalClient {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(private readonly credentials: PayPalCredentials) {}

  get clientId() {
    return this.credentials.clientId;
  }

  get base() {
    return this.credentials.sandbox ? SANDBOX : LIVE;
  }

  /**
   * PayPal wants an OAuth token, not the secret, on every call. It lasts
   * hours; this holds it for the life of the request rather than asking for
   * a new one per call.
   */
  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 30_000) return this.token.value;

    const basic = btoa(`${this.credentials.clientId}:${this.credentials.secret}`);
    const response = await fetch(`${this.base}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    const payload = (await response.json()) as any;
    if (!response.ok) {
      throw new PayPalNotConfigured(
        payload?.error_description ?? `PayPal refused the credentials (${response.status}).`,
      );
    }

    this.token = {
      value: payload.access_token,
      expiresAt: Date.now() + Number(payload.expires_in ?? 3000) * 1000,
    };
    return this.token.value;
  }

  private async call(path: string, init: RequestInit = {}): Promise<any> {
    const token = await this.accessToken();
    const response = await fetch(`${this.base}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });

    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const detail = payload?.details?.[0]?.description ?? payload?.message;
      throw new Error(detail ?? `PayPal said ${response.status}.`);
    }
    return payload;
  }

  /** Proves the credentials work, without charging anyone. */
  async testConnection(): Promise<{ ok: true; account: string } | { ok: false; reason: string }> {
    try {
      await this.accessToken();
      return { ok: true, account: `${this.credentials.sandbox ? "Sandbox" : "Live"} · ${this.credentials.clientId.slice(0, 12)}…` };
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : "Unknown error." };
    }
  }

  /**
   * The order the buyer approves in the PayPal window.
   *
   * Amounts are sent as a decimal string because that is what PayPal takes —
   * the conversion from cents happens here and nowhere else, so no caller has
   * to remember which unit it is holding.
   */
  async createOrder(input: {
    amountCents: number;
    currency: string;
    reference: string;
    brandName: string;
    returnUrl?: string;
    cancelUrl?: string;
  }): Promise<PayPalOrder> {
    const payload = await this.call("/v2/checkout/orders", {
      method: "POST",
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: input.reference,
            amount: {
              currency_code: input.currency.toUpperCase(),
              value: (input.amountCents / 100).toFixed(2),
            },
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              brand_name: input.brandName,
              shipping_preference: "GET_FROM_FILE",
              user_action: "PAY_NOW",
              ...(input.returnUrl ? { return_url: input.returnUrl } : {}),
              ...(input.cancelUrl ? { cancel_url: input.cancelUrl } : {}),
            },
          },
        },
      }),
    });
    return { id: payload.id, status: payload.status };
  }

  /** Takes the money. Everything the order needs comes back in one call. */
  async captureOrder(orderId: string): Promise<PayPalCapture> {
    const payload = await this.call(`/v2/checkout/orders/${orderId}/capture`, {
      method: "POST",
      body: "{}",
    });

    const unit = payload?.purchase_units?.[0] ?? {};
    const capture = unit?.payments?.captures?.[0] ?? {};
    const amount = capture?.amount ?? {};
    const payer = payload?.payer ?? {};
    const ship = unit?.shipping ?? {};
    const address = ship?.address ?? {};

    return {
      orderId: payload.id,
      captureId: capture.id ?? "",
      status: capture.status ?? payload.status ?? "",
      amountCents: Math.round(Number(amount.value ?? 0) * 100),
      currency: (amount.currency_code ?? "USD").toUpperCase(),
      payer: {
        email: payer?.email_address ?? null,
        firstName: payer?.name?.given_name ?? null,
        lastName: payer?.name?.surname ?? null,
      },
      shipping: {
        name: ship?.name?.full_name ?? null,
        line1: address?.address_line_1 ?? null,
        line2: address?.address_line_2 ?? null,
        city: address?.admin_area_2 ?? null,
        region: address?.admin_area_1 ?? null,
        postalCode: address?.postal_code ?? null,
        country: address?.country_code ?? null,
      },
    };
  }

  /** Refund a capture, whole or in part. */
  async refund(captureId: string, amountCents: number | undefined, currency: string) {
    const body =
      amountCents === undefined
        ? {}
        : { amount: { value: (amountCents / 100).toFixed(2), currency_code: currency.toUpperCase() } };

    const payload = await this.call(`/v2/payments/captures/${captureId}/refund`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    return {
      id: payload.id as string,
      status: payload.status as string,
      amountCents: Math.round(Number(payload?.amount?.value ?? 0) * 100),
    };
  }
}

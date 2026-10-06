/**
 * Square, as the card processor for a store.
 *
 * Square's own hosted checkout page takes the payment: the customer fills in
 * their delivery details on our checkout, we create a Square payment link for
 * exactly the server-priced cart, and Square's page takes the card, Apple Pay,
 * Google Pay, Cash App or Afterpay. Card numbers never touch this Worker.
 *
 * One row per store in payment_providers (`square`): the publishable_key
 * column holds the Square location id (not a secret) and secret_key_enc holds
 * the access token, encrypted with the Worker's master key like every other
 * secret here. A store with no such row shows no Square option.
 *
 * Like the pay-over-time flow, an order is written (pending) before the
 * customer leaves, and is only marked paid after Square has been asked what
 * happened — never from the redirect alone.
 */
import { and, eq } from "drizzle-orm";
import type { DB } from "~/db/client";
import { paymentProviders } from "~/db/schema";
import { decryptSecret } from "./crypto.server";

const API = "https://connect.squareup.com/v2";
const VERSION = "2025-10-16";

export interface SquareAccount {
  accessToken: string;
  locationId: string;
}

/** The store's Square account, or null when it has none. */
export async function squareFor(db: DB, env: Env, storeId: string): Promise<SquareAccount | null> {
  const [row] = await db
    .select()
    .from(paymentProviders)
    .where(and(eq(paymentProviders.storeId, storeId), eq(paymentProviders.provider, "square")))
    .limit(1);
  if (!row?.publishableKey) return null;
  const accessToken = await decryptSecret(env, row.secretKeyEnc);
  if (!accessToken) return null;
  return { accessToken, locationId: row.publishableKey };
}

async function call(account: SquareAccount, method: string, path: string, body?: unknown): Promise<any> {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${account.accessToken}`,
      "Square-Version": VERSION,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as any;
  if (!response.ok) {
    const detail = payload?.errors?.[0]?.detail ?? payload?.errors?.[0]?.code;
    throw new Error(detail ? `Square: ${detail}` : `Square answered ${response.status}.`);
  }
  return payload;
}

export interface SquareLine {
  name: string;
  quantity: number;
  unitPriceCents: number;
}

export interface SquareCustomer {
  email: string;
  phone: string | null;
  line1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

/**
 * A hosted payment link for exactly this cart.
 *
 * The lines are sent itemised so the Square receipt reads like the order. If
 * Square's total for them is not exactly the server-priced total, the link is
 * thrown away and made again as one line for the whole amount — the customer
 * is only ever sent to a page that asks for the right money.
 */
export async function createPaymentLink(
  account: SquareAccount,
  input: {
    lines: SquareLine[];
    shippingCents: number;
    taxCents: number;
    protectionCents: number;
    discountCents: number;
    discountName: string | null;
    totalCents: number;
    currency: string;
    storeName: string;
    referenceId: string;
    redirectUrl: string;
    customer: SquareCustomer;
    supportEmail: string | null;
  },
): Promise<{ id: string; url: string; orderId: string }> {
  const currency = input.currency.toUpperCase();
  const money = (amount: number) => ({ amount, currency });

  const itemised = () => {
    const line_items = input.lines.map((line) => ({
      name: line.name.slice(0, 500),
      quantity: String(line.quantity),
      base_price_money: money(line.unitPriceCents),
    }));
    if (input.shippingCents > 0) line_items.push({ name: "Shipping", quantity: "1", base_price_money: money(input.shippingCents) });
    if (input.taxCents > 0) line_items.push({ name: "Tax", quantity: "1", base_price_money: money(input.taxCents) });
    if (input.protectionCents > 0) line_items.push({ name: "Shipping protection", quantity: "1", base_price_money: money(input.protectionCents) });
    const discounts = input.discountCents > 0
      ? [{ name: (input.discountName ?? "Discount").slice(0, 255), amount_money: money(input.discountCents), scope: "ORDER" }]
      : undefined;
    return { line_items, discounts };
  };
  const single = () => ({
    line_items: [{ name: `${input.storeName} order`.slice(0, 500), quantity: "1", base_price_money: money(input.totalCents) }],
    discounts: undefined,
  });

  const make = async (shape: { line_items: unknown[]; discounts: unknown[] | undefined }) => {
    const payload = await call(account, "POST", "/online-checkout/payment-links", {
      idempotency_key: crypto.randomUUID(),
      order: {
        location_id: account.locationId,
        reference_id: input.referenceId,
        line_items: shape.line_items,
        ...(shape.discounts ? { discounts: shape.discounts } : {}),
      },
      checkout_options: {
        redirect_url: input.redirectUrl,
        ask_for_shipping_address: false,
        accepted_payment_methods: { apple_pay: true, google_pay: true, cash_app_pay: true, afterpay_clearpay: true },
        ...(input.supportEmail ? { merchant_support_email: input.supportEmail } : {}),
      },
      pre_populated_data: {
        buyer_email: input.customer.email,
        ...(input.customer.phone ? { buyer_phone_number: input.customer.phone } : {}),
        buyer_address: {
          address_line_1: input.customer.line1,
          locality: input.customer.city,
          administrative_district_level_1: input.customer.state,
          postal_code: input.customer.postalCode,
          country: input.customer.country,
        },
      },
    });
    const link = payload.payment_link;
    const total: number | undefined = payload.related_resources?.orders?.[0]?.total_money?.amount;
    return { id: link.id as string, url: (link.url ?? link.long_url) as string, orderId: link.order_id as string, total };
  };

  let made = await make(itemised());
  if (made.total !== input.totalCents) {
    // Not the right money. Remove it and send one line for the exact amount.
    await call(account, "DELETE", `/online-checkout/payment-links/${made.id}`).catch(() => undefined);
    made = await make(single());
    if (made.total !== input.totalCents) {
      await call(account, "DELETE", `/online-checkout/payment-links/${made.id}`).catch(() => undefined);
      throw new Error("Square could not price this order correctly. Nothing has been charged.");
    }
  }
  return { id: made.id, url: made.url, orderId: made.orderId };
}

export interface SquareSettlement {
  /** the order has been paid in full */
  paid: boolean;
  paymentId: string | null;
  amountCents: number | null;
  /** Square has closed the order without payment */
  dead: boolean;
}

/**
 * What Square says happened to an order. Paid only when a COMPLETED payment on
 * that order carries the full amount — an open order, a pending payment or a
 * short one is not paid.
 */
export async function readSquareOrder(account: SquareAccount, squareOrderId: string): Promise<SquareSettlement> {
  const { order } = await call(account, "GET", `/orders/${squareOrderId}`);
  const tenders: any[] = order?.tenders ?? [];
  for (const tender of tenders) {
    const paymentId = tender.payment_id ?? tender.id;
    if (!paymentId) continue;
    const { payment } = await call(account, "GET", `/payments/${paymentId}`);
    if (payment?.status === "COMPLETED") {
      return {
        paid: true,
        paymentId: payment.id,
        amountCents: payment.total_money?.amount ?? payment.amount_money?.amount ?? null,
        dead: false,
      };
    }
  }
  return { paid: false, paymentId: null, amountCents: null, dead: order?.state === "CANCELED" };
}

export async function refundSquarePayment(
  account: SquareAccount,
  input: { paymentId: string; amountCents: number; currency: string; idempotencyKey: string; reason?: string },
): Promise<{ id: string; status: string }> {
  const { refund } = await call(account, "POST", "/refunds", {
    idempotency_key: input.idempotencyKey.slice(0, 45),
    payment_id: input.paymentId,
    amount_money: { amount: input.amountCents, currency: input.currency.toUpperCase() },
    ...(input.reason ? { reason: input.reason.slice(0, 192) } : {}),
  });
  return { id: refund.id, status: refund.status };
}

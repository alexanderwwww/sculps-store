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
  /**
   * Which ways to pay this store tells customers about: applepay, googlepay,
   * cashapp, afterpay. Kept in the provider row's label as `methods:a,b` so a
   * method is only advertised once somebody has seen it on Square's own page.
   */
  methods: string[];
  /** the Square application id the on-site card form is addressed with — public */
  appId: string | null;
}

export const SQUARE_METHODS = ["applepay", "googlepay", "cashapp", "afterpay"] as const;

/** The methods to advertise: the store's list, or all of them for `?methods=all`. */
export function advertisedMethods(account: SquareAccount | null, url: URL): string[] {
  if (!account) return [];
  return url.searchParams.get("methods") === "all" ? [...SQUARE_METHODS] : account.methods;
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
  const listed = /methods:([a-z,]*)/.exec(row.label ?? "")?.[1] ?? "";
  const methods = listed.split(",").filter((m): m is (typeof SQUARE_METHODS)[number] => (SQUARE_METHODS as readonly string[]).includes(m));
  const appId = /app:(sq0idp-[A-Za-z0-9_-]+)/.exec(row.label ?? "")?.[1] ?? null;
  return { accessToken, locationId: row.publishableKey, methods, appId };
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
  /** carried on the Square line so an order can be rebuilt from Square alone */
  variantId?: string;
  label?: string | null;
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
    /** known from the checkout form; absent on an express checkout */
    customer?: SquareCustomer;
    supportEmail: string | null;
    /**
     * Express checkout: the customer has typed nothing, so Square's own page
     * asks for the shipping address, and the whole order is stored on the
     * Square order so it can be rebuilt from it after payment.
     */
    express?: { storeId: string; discountCode: string | null };
  },
): Promise<{ id: string; url: string; orderId: string }> {
  const currency = input.currency.toUpperCase();
  const money = (amount: number) => ({ amount, currency });

  const itemised = () => {
    const line_items: any[] = input.lines.map((line) => ({
      name: line.name.slice(0, 500),
      quantity: String(line.quantity),
      base_price_money: money(line.unitPriceCents),
      ...(line.variantId
        ? { metadata: { variantId: line.variantId, ...(line.label ? { label: line.label.slice(0, 200) } : {}) } }
        : {}),
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
        ...(input.express
          ? {
              // Square rejects an empty metadata value, so a missing code is left out.
              metadata: {
                express: "1",
                storeId: input.express.storeId,
                ...(input.express.discountCode ? { code: input.express.discountCode.slice(0, 200) } : {}),
              },
            }
          : {}),
      },
      checkout_options: {
        redirect_url: input.redirectUrl,
        ask_for_shipping_address: Boolean(input.express),
        accepted_payment_methods: { apple_pay: true, google_pay: true, cash_app_pay: true, afterpay_clearpay: true },
        ...(input.supportEmail ? { merchant_support_email: input.supportEmail } : {}),
      },
      ...(input.customer
        ? {
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
          }
        : {}),
    });
    const link = payload.payment_link;
    const total: number | undefined = payload.related_resources?.orders?.[0]?.total_money?.amount;
    return { id: link.id as string, url: (link.url ?? link.long_url) as string, orderId: link.order_id as string, total };
  };

  let made = await make(itemised());
  if (made.total !== input.totalCents && input.express) {
    // An express order is rebuilt from its lines, so it cannot fall back to a
    // single line. Better no express than an order nobody can reconstruct.
    await call(account, "DELETE", `/online-checkout/payment-links/${made.id}`).catch(() => undefined);
    throw new Error("Express checkout could not price this order. Please use the normal checkout.");
  }
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

export interface SquareOrderLine {
  name: string;
  quantity: number;
  unitPriceCents: number;
  variantId: string | null;
  label: string | null;
}

export interface SquareBuyer {
  name: string;
  email: string;
  phone: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
}

export interface SquareSettlement {
  /** the order has been paid in full */
  paid: boolean;
  paymentId: string | null;
  amountCents: number | null;
  /** Square has closed the order without payment */
  dead: boolean;
  /** a payment exists but is not COMPLETED yet (Cash App, Afterpay, a slow card) */
  settling?: boolean;
  /** what Square holds about the order and who paid for it */
  order: {
    id: string;
    referenceId: string | null;
    metadata: Record<string, string>;
    lines: SquareOrderLine[];
    shippingCents: number;
    taxCents: number;
    protectionCents: number;
    discountCents: number;
    totalCents: number;
    buyer: SquareBuyer;
  };
}

const cents = (money: any): number => (typeof money?.amount === "number" ? money.amount : Number(money?.amount ?? 0));

function viewOf(order: any, payment: any | null): SquareSettlement["order"] {
  const lines: SquareOrderLine[] = [];
  let shippingCents = 0;
  let taxCents = 0;
  let protectionCents = 0;
  for (const item of order?.line_items ?? []) {
    const total = cents(item.base_price_money) * Number(item.quantity ?? 1);
    if (item.metadata?.variantId) {
      lines.push({
        name: item.name,
        quantity: Number(item.quantity ?? 1),
        unitPriceCents: cents(item.base_price_money),
        variantId: item.metadata.variantId,
        label: item.metadata.label || null,
      });
    } else if (item.name === "Shipping") shippingCents += total;
    else if (item.name === "Tax") taxCents += total;
    else if (item.name === "Shipping protection") protectionCents += total;
    else
      lines.push({ name: item.name, quantity: Number(item.quantity ?? 1), unitPriceCents: cents(item.base_price_money), variantId: null, label: null });
  }

  const recipient = order?.fulfillments?.find((f: any) => f?.shipment_details)?.shipment_details?.recipient ?? null;
  const address = recipient?.address ?? payment?.shipping_address ?? payment?.billing_address ?? null;
  // Square leaves a single space in the name until the buyer has typed one.
  const name =
    String(recipient?.display_name ?? "").trim() ||
    [address?.first_name, address?.last_name].filter(Boolean).join(" ").trim() ||
    "";
  return {
    id: order?.id ?? "",
    referenceId: order?.reference_id ?? null,
    metadata: order?.metadata ?? {},
    lines,
    shippingCents,
    taxCents,
    protectionCents,
    discountCents: cents(order?.total_discount_money),
    totalCents: cents(order?.total_money),
    buyer: {
      name,
      email: (recipient?.email_address || payment?.buyer_email_address || "").toLowerCase(),
      phone: recipient?.phone_number || null,
      line1: address?.address_line_1 ?? null,
      line2: address?.address_line_2 ?? null,
      city: address?.locality ?? null,
      state: address?.administrative_district_level_1 ?? null,
      postalCode: address?.postal_code ?? null,
      country: address?.country ?? null,
    },
  };
}

/**
 * What Square says happened to an order. Paid only when a COMPLETED payment on
 * that order carries the full amount — an open order, a pending payment or a
 * short one is not paid.
 */
export async function readSquareOrder(account: SquareAccount, squareOrderId: string): Promise<SquareSettlement> {
  const { order } = await call(account, "GET", `/orders/${squareOrderId}`);
  const tenders: any[] = order?.tenders ?? [];
  let settling = false;
  for (const tender of tenders) {
    const paymentId = tender.payment_id ?? tender.id;
    if (!paymentId) continue;
    const { payment } = await call(account, "GET", `/payments/${paymentId}`);
    if (payment?.status === "APPROVED" || payment?.status === "PENDING") settling = true;
    if (payment?.status === "COMPLETED") {
      return {
        paid: true,
        paymentId: payment.id,
        amountCents: payment.total_money?.amount ?? payment.amount_money?.amount ?? null,
        dead: false,
        order: viewOf(order, payment),
      };
    }
  }
  return { paid: false, paymentId: null, amountCents: null, dead: order?.state === "CANCELED", settling, order: viewOf(order, null) };
}

/**
 * Square orders at this location that are open or completed since a time —
 * the scheduled check uses this to find express orders that were paid and
 * never came back to the site, since those have no row of ours yet.
 */
export async function recentSquareOrderIds(account: SquareAccount, sinceIso: string): Promise<string[]> {
  const { orders } = await call(account, "POST", "/orders/search", {
    location_ids: [account.locationId],
    query: {
      filter: {
        state_filter: { states: ["OPEN", "COMPLETED"] },
        date_time_filter: { created_at: { start_at: sinceIso } },
      },
      sort: { sort_field: "CREATED_AT", sort_order: "DESC" },
    },
    limit: 100,
  });
  return (orders ?? []).filter((o: any) => o?.metadata?.express === "1" && (o.tenders ?? []).length > 0).map((o: any) => o.id as string);
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


/* ------------------------------------------------------- on-site payments */

/** What a customer should read when Square turns a card down. */
function friendlyDecline(code: string | undefined, detail: string | undefined): string {
  switch (code) {
    case "CARD_DECLINED":
    case "GENERIC_DECLINE":
    case "CARD_DECLINED_CALL_ISSUER":
    case "CARD_DECLINED_VERIFICATION_REQUIRED":
      return "Your card was declined. Nothing has been charged. Please try another card.";
    case "INSUFFICIENT_FUNDS":
      return "That card has insufficient funds. Nothing has been charged. Please try another card.";
    case "CVV_FAILURE":
      return "The security code did not match. Nothing has been charged. Please check it and try again.";
    case "ADDRESS_VERIFICATION_FAILURE":
    case "INVALID_POSTAL_CODE":
      return "The ZIP code did not match the card. Nothing has been charged. Please check it and try again.";
    case "CARD_EXPIRED":
    case "INVALID_EXPIRATION":
      return "That card has expired. Nothing has been charged. Please use another card.";
    case "PAN_FAILURE":
    case "INVALID_CARD":
      return "That card number was not accepted. Nothing has been charged. Please check it and try again.";
    default:
      return detail ? `${detail.replace(/[.\s]*$/, "")}. Nothing has been charged.` : "The payment could not be completed. Nothing has been charged.";
  }
}

export class SquareDeclined extends Error {}

/**
 * A Square order for exactly this cart, to pay against. Priced by Square from
 * the lines and checked against ours: if the totals differ, nothing is
 * charged.
 */
export async function createSquareOrder(
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
    referenceId: string;
  },
): Promise<{ id: string }> {
  const currency = input.currency.toUpperCase();
  const money = (amount: number) => ({ amount, currency });
  const line_items: any[] = input.lines.map((line) => ({
    name: line.name.slice(0, 500),
    quantity: String(line.quantity),
    base_price_money: money(line.unitPriceCents),
    ...(line.variantId ? { metadata: { variantId: line.variantId, ...(line.label ? { label: line.label.slice(0, 200) } : {}) } } : {}),
  }));
  if (input.shippingCents > 0) line_items.push({ name: "Shipping", quantity: "1", base_price_money: money(input.shippingCents) });
  if (input.taxCents > 0) line_items.push({ name: "Tax", quantity: "1", base_price_money: money(input.taxCents) });
  if (input.protectionCents > 0) line_items.push({ name: "Shipping protection", quantity: "1", base_price_money: money(input.protectionCents) });
  const payload = await call(account, "POST", "/orders", {
    idempotency_key: crypto.randomUUID(),
    order: {
      location_id: account.locationId,
      reference_id: input.referenceId,
      line_items,
      ...(input.discountCents > 0
        ? { discounts: [{ name: (input.discountName ?? "Discount").slice(0, 255), amount_money: money(input.discountCents), scope: "ORDER" }] }
        : {}),
    },
  });
  const order = payload.order;
  if (cents(order?.total_money) !== input.totalCents) {
    throw new Error("Square could not price this order correctly. Nothing has been charged.");
  }
  return { id: order.id as string };
}

/**
 * Charge a card (or wallet) token against a Square order. Completed when
 * Square says so; a decline throws SquareDeclined with words a customer can
 * act on.
 */
export async function createSquarePayment(
  account: SquareAccount,
  input: {
    sourceId: string;
    orderId: string;
    amountCents: number;
    currency: string;
    idempotencyKey: string;
    referenceId: string;
    buyerEmail: string;
  },
): Promise<{ id: string; status: string; amountCents: number }> {
  const response = await fetch(`${API}/payments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${account.accessToken}`, "Square-Version": VERSION, "Content-Type": "application/json" },
    body: JSON.stringify({
      source_id: input.sourceId,
      idempotency_key: input.idempotencyKey.slice(0, 45),
      amount_money: { amount: input.amountCents, currency: input.currency.toUpperCase() },
      order_id: input.orderId,
      location_id: account.locationId,
      reference_id: input.referenceId.slice(0, 40),
      buyer_email_address: input.buyerEmail,
      autocomplete: true,
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as any;
  if (!response.ok) {
    const err = payload?.errors?.[0];
    throw new SquareDeclined(friendlyDecline(err?.code, err?.detail));
  }
  const payment = payload.payment;
  return { id: payment.id, status: payment.status, amountCents: cents(payment.total_money ?? payment.amount_money) };
}

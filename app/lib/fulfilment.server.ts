/**
 * What happens once a payment is confirmed: the receipt goes out and Meta is
 * told about the purchase.
 *
 * Kept in one place because both routes to a confirmed payment — the customer
 * returning from Stripe, and the webhook — must do exactly the same thing, and
 * must do it only once however many times they fire.
 */
import { eq } from "drizzle-orm";
import type { DB } from "~/db/client";
import { orders, orderEvents, stores } from "~/db/schema";
import { loadOrder, recordOrderEvent } from "./admin.server";
import { sendOrderConfirmation, sendMerchantNewOrder, emailReady } from "./email.server";
import { metaSettings, sendPurchase } from "./meta.server";
import { redeemDiscount } from "./discounts.server";

/**
 * True when this side effect has already run for this order.
 *
 * The timeline is the record, so it is also the lock. No extra column, and it
 * survives anything that replays an event.
 */
async function alreadyDone(db: DB, orderId: string, type: string): Promise<boolean> {
  const rows = await db.select().from(orderEvents).where(eq(orderEvents.orderId, orderId));
  return rows.some((row) => row.type === type);
}

export async function afterPaymentConfirmed(
  db: DB,
  env: Env,
  orderId: string,
  request?: Request,
): Promise<void> {
  const loaded = await loadOrder(db, orderId);
  if (!loaded) return;
  const { order, store, items } = loaded;

  // 0. The discount redemption, if this order used a code.
  //
  // This is the only place a redemption is written: an order that is paid.
  // Typing a code records nothing. The usage limit and the once-per-customer
  // rule are enforced inside redeemDiscount, by a conditional increment, so
  // two people racing the last use cannot both take it.
  if (order.discountCode && !(await alreadyDone(db, orderId, "discount:redeemed"))) {
    const result = await redeemDiscount(db, {
      storeId: store.id,
      code: order.discountCode,
      orderId,
      email: order.email,
      amountCents: order.discountCents,
    });
    await recordOrderEvent(
      db,
      orderId,
      result.ok ? "discount:redeemed" : "discount:refused",
      result.ok
        ? `Discount ${order.discountCode} recorded · ${(order.discountCents / 100).toFixed(2)} ${order.currency} off`
        : `Discount ${order.discountCode} was charged at the discounted price but could not be recorded: ${result.reason}`,
    );
  }

  // 1. The receipt.
  if (!(await alreadyDone(db, orderId, "email:confirmation"))) {
    if (emailReady(env)) {
      await sendOrderConfirmation(db, env, orderId, {
        to: order.email,
        customerName: order.customerName,
        storeName: store.name,
        fromAddress: store.emailFrom,
        replyTo: store.contactEmail,
        // The store's own look, so the receipt is recognisably from the shop
        // she just bought from rather than from a white box with a name on it.
        domain: store.domain,
        logoUrl: store.logoUrl,
        brandColor: store.brandColor,
        accentColor: store.accentColor,
        orderNumber: order.number,
        currency: order.currency,
        lines: items.map((item) => ({
          label: item.label,
          quantity: item.quantity,
          lineTotalCents: item.unitPriceCents * item.quantity,
        })),
        subtotalCents: order.subtotalCents,
        taxCents: order.taxCents,
        shippingCents: order.shippingCents,
        totalCents: order.totalCents,
        discountCode: order.discountCode,
        discountCents: order.discountCents,
      });
    } else {
      // Say so on the timeline rather than leaving a silent gap that looks
      // like the email was sent.
      await recordOrderEvent(
        db,
        orderId,
        "email:skipped",
        "No confirmation email sent: email is not configured on this Worker yet.",
      );
    }
  }

  // 2. Tell him. Without this, nothing announces a sale unless he is looking.
  if (!(await alreadyDone(db, orderId, "email:merchant"))) {
    if (!store.contactEmail) {
      await recordOrderEvent(db, orderId, "email:skipped", "You were not emailed about this order: the store has no contact email in Settings → General.");
    } else if (emailReady(env)) {
      await sendMerchantNewOrder(db, env, orderId, {
        to: store.contactEmail,
        storeName: store.name,
        orderNumber: order.number,
        customerName: order.customerName,
        email: order.email,
        phone: order.phone,
        address: [order.address1, order.address2, order.city, order.region, order.postalCode, order.country].filter(Boolean).join(", "),
        paymentMethod: order.paymentProvider ? `paid via ${order.paymentProvider}` : "payment pending",
        placedAt: new Date(order.createdAt),
        totalCents: order.totalCents,
        currency: order.currency,
        lines: items.map((item) => ({
          label: item.label,
          quantity: item.quantity,
          lineTotalCents: item.unitPriceCents * item.quantity,
        })),
        adminUrl: `${env.ADMIN_ORIGIN || "https://kerberos.gardenbuddystore.workers.dev"}/admin/orders/${order.id}?store=${store.slug}`,
        fromAddress: store.emailFrom,
      });
    }
  }

  // 3. Meta's server-side Purchase, sharing the browser pixel's event id.
  if (!(await alreadyDone(db, orderId, "meta:purchase"))) {
    const settings = await metaSettings(db, env, store.id);
    if (!settings) {
      await recordOrderEvent(
        db,
        orderId,
        "meta:skipped",
        "No Meta Purchase event sent: this store has no pixel and token set.",
      );
    } else if (!order.metaEventId) {
      await recordOrderEvent(
        db,
        orderId,
        "meta:skipped",
        "No Meta Purchase event sent: this order has no event ID, so Meta could double count it.",
      );
    } else {
      const [firstName, ...restOfName] = order.customerName.split(" ");
      const result = await sendPurchase(settings, {
        eventId: order.metaEventId,
        eventTime: Math.floor(new Date(order.createdAt).getTime() / 1000),
        sourceUrl: `https://${store.domain}/checkout`,
        email: order.email,
        phone: order.phone,
        firstName,
        lastName: restOfName.join(" ") || null,
        city: order.city,
        region: order.region,
        postalCode: order.postalCode,
        country: order.country,
        valueCents: order.totalCents,
        currency: order.currency,
        contents: items.map((item) => ({
          id: item.variantId ?? item.id,
          quantity: item.quantity,
          itemPrice: item.unitPriceCents,
        })),
        clientIp: request?.headers.get("CF-Connecting-IP") ?? null,
        userAgent: request?.headers.get("User-Agent") ?? null,
        fbp: order.fbp,
        fbc: order.fbc,
      });

      await recordOrderEvent(
        db,
        orderId,
        result.ok ? "meta:purchase" : "meta:failed",
        result.ok
          ? `Meta Purchase event sent · ${order.metaEventId} · deduplicated with the browser pixel`
          : `Meta Purchase event failed · ${result.reason}`,
      );
    }
  }
}

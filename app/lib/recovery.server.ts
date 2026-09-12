/**
 * Abandoned cart and abandoned checkout recovery.
 *
 * Run from a scheduled Worker, not from a request, so it happens whether or
 * not anybody is on the site. Two messages, one cart:
 *
 *   checkout — she reached payment and stopped. Sent after one hour, with a
 *              discount, because she was close enough that a small nudge is
 *              worth the margin.
 *   cart     — she filled a cart and left. Sent after four hours, with no
 *              discount, because teaching people that leaving a cart earns
 *              money is how a store trains its own customers to wait.
 *
 * One email per cart, ever. The row is stamped before the send, so a retry of
 * the same run can never send twice.
 */
import { and, eq, isNotNull, isNull, lt, sql } from "drizzle-orm";
import type { DB } from "~/db/client";
import { carts, stores, products, variants } from "~/db/schema";
import { sendAbandonEmail, emailReady, type EmailLine } from "./email.server";

/** What a cart's `items` json actually holds, as far as this file cares. */
interface CartLine {
  variantId?: string;
  productId?: string;
  title?: string;
  label?: string;
  quantity?: number;
  priceCents?: number;
  unitPriceCents?: number;
  imageUrl?: string;
}

const HOUR = 3_600_000;

export interface RecoverySummary {
  considered: number;
  sent: number;
  failed: number;
  reasons: string[];
}

/**
 * One pass. Safe to run every fifteen minutes: a cart is only ever picked up
 * once, and the windows are wide enough that a late run still catches it.
 */
export async function runRecovery(db: DB, env: Env, now = new Date()): Promise<RecoverySummary> {
  const summary: RecoverySummary = { considered: 0, sent: 0, failed: 0, reasons: [] };

  if (!emailReady(env)) {
    summary.reasons.push("No Resend API key on the Worker — nothing was sent.");
    return summary;
  }

  const rows = await db
    .select({
      cart: carts,
      store: stores,
    })
    .from(carts)
    .innerJoin(stores, eq(stores.id, carts.storeId))
    .where(
      and(
        eq(carts.status, "open"),
        isNotNull(carts.email),
        isNull(carts.recoveryEmailedAt),
        // Reached payment an hour ago, or simply sat there for four.
        sql`(
          (${carts.paymentIntentId} is not null and ${carts.updatedAt} < ${new Date(now.getTime() - HOUR)})
          or ${carts.updatedAt} < ${new Date(now.getTime() - 4 * HOUR)}
        )`,
        // Older than three days is not a recovery, it is a cold email.
        sql`${carts.updatedAt} > ${new Date(now.getTime() - 72 * HOUR)}`,
        sql`jsonb_array_length(${carts.items}) > 0`,
      ),
    )
    .limit(50);

  for (const { cart, store } of rows) {
    summary.considered += 1;

    const kind: "cart" | "checkout" = cart.paymentIntentId ? "checkout" : "cart";
    const lines = await describeLines(db, cart.items as CartLine[]);
    if (!lines.length) continue;

    const total = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
    const site = `https://${store.domain}`;

    // Claim it first. If the send fails the cart is still marked — one
    // attempt is the promise, and a failed send is recorded in the reasons
    // rather than retried into somebody's inbox on the next pass.
    await db
      .update(carts)
      .set({ recoveryEmailedAt: new Date(), recoveryStage: kind })
      .where(and(eq(carts.id, cart.id), isNull(carts.recoveryEmailedAt)));

    const result = await sendAbandonEmail(env, kind, {
      to: cart.email as string,
      customerName: null,
      storeName: store.name,
      fromAddress: store.emailFrom,
      replyTo: store.contactEmail,
      currency: store.currency,
      lines,
      totalCents: total,
      // The token puts her cart back exactly as she left it.
      recoverUrl: `${site}/cart?recover=${encodeURIComponent(cart.token)}`,
      discountCode: kind === "checkout" ? "COMEBACK10" : null,
      discountPercent: kind === "checkout" ? 10 : null,
      imageUrl: absolute(site, firstImage(cart.items as CartLine[])),
      domain: store.domain,
      logoUrl: store.logoUrl,
      brandColor: store.brandColor,
      accentColor: store.accentColor,
    });

    if (result.ok) summary.sent += 1;
    else {
      summary.failed += 1;
      summary.reasons.push(`${store.slug} · ${cart.email} · ${result.reason}`);
    }
  }

  return summary;
}

/** An email client has no origin, so every image URL has to be absolute. */
function absolute(site: string, url: string | null): string | null {
  if (!url) return null;
  return url.startsWith("http") ? url : `${site}${url.startsWith("/") ? "" : "/"}${url}`;
}

function firstImage(items: CartLine[]): string | null {
  for (const item of items) if (item.imageUrl) return item.imageUrl;
  return null;
}

/**
 * Turn stored cart lines into something a person can read.
 *
 * The cart json carries whatever the storefront put there; where it has no
 * title the product is read back out of the database rather than the email
 * saying "item".
 */
async function describeLines(db: DB, items: CartLine[]): Promise<EmailLine[]> {
  const lines: EmailLine[] = [];

  for (const item of items) {
    const quantity = Math.max(1, Number(item.quantity) || 1);
    const unit = Number(item.priceCents ?? item.unitPriceCents ?? 0);
    let label = item.title || item.label || "";

    if (!label && item.variantId) {
      const [row] = await db
        .select({ product: products.title, variant: variants.label, image: variants.imageUrl })
        .from(variants)
        .innerJoin(products, eq(products.id, variants.productId))
        .where(eq(variants.id, item.variantId))
        .limit(1);
      if (row) label = [row.product, row.variant].filter(Boolean).join(" — ");
    }

    if (!label) continue;
    lines.push({ label, quantity, lineTotalCents: unit * quantity });
  }

  return lines;
}

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
import { and, eq, inArray, isNotNull, isNull, lt, notInArray, sql, asc } from "drizzle-orm";
import type { DB } from "~/db/client";
import { carts, stores, products, variants, discounts } from "~/db/schema";
import { isSuppressed, unsubscribeUrl } from "./suppression.server";
import { sendAbandonEmail, sendComebackEmail, sendEmail, emailReady, type EmailLine } from "./email.server";
import { COMEBACK_CENTS, COMEBACK_STORES, ensureComebackDiscount, isComebackCode, priceCart } from "./cart.server";
import { reaperCartEmail, reaperCheckoutEmail, reaperComebackEmail, type FlowLine } from "./emails/reaper-flows";
import { formatMoney } from "./money";
import { reaperProduct } from "./emails/reaper-products";
import { publicOffer } from "./discounts.server";

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

/**
 * The picture every recovery email leads with when a cart line has none.
 *
 * A resized copy lives in R2 next to the original: the storefront photo is
 * 2.2MB, which no inbox should be asked to download.
 */
const EMAIL_HERO = "/media/em-0e08493005adb744.jpg";

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

  // Black Reaper runs its own flow (below), and only once Alex has switched it on.
  await runReaperRecovery(db, env, now, summary);

  const rows = await db
    .select({
      cart: carts,
      store: stores,
    })
    .from(carts)
    .innerJoin(stores, eq(stores.id, carts.storeId))
    .where(
      and(
        notInArray(stores.slug, [...COMEBACK_STORES]),
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
    const archive = store.slug === "mysterious-archive";
    const lines = await describeLines(db, cart.items as CartLine[], archive);
    if (!lines.length) continue;

    const total = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
    const site = `https://${store.domain}`;

    // Asked not to be emailed: stamp the cart so it is never picked up again, and move on.
    if (await isSuppressed(db, cart.email as string)) {
      await db.update(carts).set({ recoveryEmailedAt: new Date() }).where(eq(carts.id, cart.id));
      continue;
    }
    const unsub = await unsubscribeUrl(env, site, cart.email as string);
    const postalAddress =
      [store.legalName ?? store.name, store.address1, store.city, [store.region, store.postalCode].filter(Boolean).join(" "), store.country]
        .filter(Boolean)
        .join(", ") || null;

    // The shop's own live code, in dollars. Read per store rather than
    // hardcoded, so turning the offer off in the admin turns it off in the
    // email too, and so the code in the email is one that actually works.
    const standing = await publicOffer(db, store.id);
    const liveRow = standing && standing.kind === "fixed" ? standing : null;
    const live = !archive && liveRow && Number(liveRow.value) > 0
      ? { code: liveRow.code, offCents: Number(liveRow.value) }
      : null;

    // Claim it first. If the send fails the cart is still marked — one
    // attempt is the promise, and a failed send is recorded in the reasons
    // rather than retried into somebody's inbox on the next pass.
    await db
      .update(carts)
      .set({ recoveryEmailedAt: new Date(), recoveryStage: kind })
      .where(and(eq(carts.id, cart.id), isNull(carts.recoveryEmailedAt)));

    /*
     * A cart that reached payment and stopped gets the come-back: fifty
     * dollars off, on a code minted for this cart alone, single use. Minted
     * rather than the store's public code because the number in this email
     * has to be bigger than the one she already saw, or there is no reason
     * to come back -- and because a code that any visitor can type is not an
     * offer, it is a price.
     */
    const COMEBACK_CENTS = 5000;
    let comeback: string | null = null;
    // Mysterious Archive makes no offers of its own: its reminder carries no minted code.
    if (kind === "checkout" && !archive) {
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const bytes = crypto.getRandomValues(new Uint8Array(6));
      comeback = "BACK" + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
      await db.insert(discounts).values({
        storeId: store.id,
        code: comeback,
        kind: "fixed",
        value: COMEBACK_CENTS,
        appliesTo: "order",
        usageLimit: 1,
        oncePerCustomer: true,
        active: true,
      });
    }

    const result = comeback
      ? await sendComebackEmail(env, {
          to: cart.email as string,
          customerName: null,
          storeName: store.name,
          fromAddress: store.emailFrom,
          replyTo: store.contactEmail,
          currency: store.currency,
          lines,
          totalCents: total,
          recoverUrl: `${site}/cart?recover=${encodeURIComponent(cart.token)}&code=${encodeURIComponent(comeback)}`,
          unsubscribeUrl: unsub,
          postalAddress,
          discountCode: comeback,
          discountOffCents: COMEBACK_CENTS,
          imageUrl: (await reaperHero(db, site, store.domain, cart.items as CartLine[])) ?? absolute(site, firstImage(cart.items as CartLine[])) ?? EMAIL_HERO,
          domain: store.domain,
          logoUrl: "/media/em-967546d2b092584a.jpg",
          brandColor: store.brandColor,
          accentColor: store.accentColor,
        })
      : await sendAbandonEmail(env, kind, {
      unsubscribeUrl: unsub,
      postalAddress,
      to: cart.email as string,
      customerName: null,
      storeName: store.name,
      fromAddress: store.emailFrom,
      replyTo: store.contactEmail,
      currency: store.currency,
      lines,
      totalCents: total,
      // The token puts her cart back exactly as she left it, and the code, when
      // there is one, rides along so it is applied rather than promised.
      recoverUrl: `${site}/cart?recover=${encodeURIComponent(cart.token)}${kind === "checkout" && live?.code ? `&code=${encodeURIComponent(live.code)}` : ""}`,
      // The shop's own live code, read from the database. It used to send
      // "COMEBACK10, 10% off" — a percentage, which this shop does not do,
      // and a code no row anywhere ever created, so anyone who tried it was
      // told it was invalid. A dead code is worse than no code.
      discountCode: kind === "checkout" ? (live?.code ?? null) : null,
      discountOffCents: kind === "checkout" ? (live?.offCents ?? null) : null,
      // The cart's own photo when it has one, otherwise the store's hero —
      // an email about a product with no product in it is a wasted send.
      imageUrl: (await reaperHero(db, site, store.domain, cart.items as CartLine[])) ?? absolute(site, firstImage(cart.items as CartLine[])) ?? EMAIL_HERO,
      domain: store.domain,
      logoUrl: "/media/em-967546d2b092584a.jpg",
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


/**
 * Black Reaper's recovery emails lead with the product's own approved email picture
 * (the same JPG the order emails use), found from the product in the cart. The cart's
 * stored photo is a storefront .webp that a lot of mail clients draw as nothing, and
 * the fallback below it is an old shop photo; neither is what a person who left a
 * Reaper product should see.
 */
export async function reaperHero(db: DB, site: string, domain: string | null, items: CartLine[]): Promise<string | null> {
  if (domain !== "blackreaper.us") return null;
  for (const item of items) {
    let productId = item.productId ?? null;
    if (!productId && item.variantId) {
      const [v] = await db.select({ productId: variants.productId }).from(variants).where(eq(variants.id, item.variantId)).limit(1);
      productId = v?.productId ?? null;
    }
    if (!productId) continue;
    const [p] = await db.select({ handle: products.handle }).from(products).where(eq(products.id, productId)).limit(1);
    const image = reaperProduct(p?.handle ?? null)?.image;
    if (image) return absolute(site, image);
  }
  return null;
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
async function describeLines(db: DB, items: CartLine[], archive = false): Promise<EmailLine[]> {
  const lines: EmailLine[] = [];

  for (const item of items) {
    const quantity = Math.max(1, Number(item.quantity) || 1);
    const unit = Number(item.priceCents ?? item.unitPriceCents ?? 0);
    let label = item.title || item.label || "";

    if (!label && item.variantId) {
      const [row] = await db
        .select({ product: products.title, variant: variants.label, image: variants.imageUrl, images: products.images, price: variants.priceCents })
        .from(variants)
        .innerJoin(products, eq(products.id, variants.productId))
        .where(eq(variants.id, item.variantId))
        .limit(1);
      if (row) {
        label = [row.product, row.variant].filter(Boolean).join(" — ");
        if (archive) {
          const first = row.images?.[0];
          const photo = first?.thumb ?? first?.url ?? null;
          lines.push({
            label,
            quantity,
            lineTotalCents: (unit || row.price) * quantity,
            title: row.product,
            variantId: item.variantId,
            variantLabel: row.variant,
            imageUrl: photo ? (photo.startsWith("http") ? photo : `https://mysteriousarchive.com${photo}`) : null,
          });
          continue;
        }
      }
    }

    if (!label) continue;
    lines.push({ label, quantity, lineTotalCents: unit * quantity });
  }

  return lines;
}


/* ===================================================================== *
 * Black Reaper's recovery flow (Alex, 2026-10-19).
 *
 *   #1  ~1h after a cart with an email was left: the cart email, or the
 *       checkout email when it reached payment. No code.
 *   #2  ~24h after #1, if the cart is still open: welcome back, $20 off, on a
 *       code minted for this cart alone and applied by the link.
 *
 * Off until the store's email_flows_on is true: nothing is sent and nothing is
 * stamped, so a cart left while it is off is still picked up once it is on.
 * Each step is claimed on the row before the send, so a run that repeats
 * cannot send twice.
 * ===================================================================== */
async function runReaperRecovery(db: DB, env: Env, now: Date, summary: RecoverySummary): Promise<void> {
  const live = await db
    .select()
    .from(stores)
    .where(and(inArray(stores.slug, [...COMEBACK_STORES]), eq(stores.emailFlowsOn, true)));
  for (const store of live) {
    const site = `https://${store.domain}`;
    const postalAddress =
      [store.legalName ?? store.name, store.address1, store.city, [store.region, store.postalCode].filter(Boolean).join(" "), store.country]
        .filter(Boolean)
        .join(", ") || null;

    // #1
    const first = await db
      .select()
      .from(carts)
      .where(
        and(
          eq(carts.storeId, store.id),
          eq(carts.status, "open"),
          isNotNull(carts.email),
          isNull(carts.recoveryEmailedAt),
          lt(carts.updatedAt, new Date(now.getTime() - HOUR)),
          sql`${carts.updatedAt} > ${new Date(now.getTime() - 72 * HOUR)}`,
          sql`jsonb_array_length(${carts.items}) > 0`,
        ),
      )
      .limit(50);
    for (const cart of first) {
      summary.considered += 1;
      const kind: "cart" | "checkout" = cart.paymentIntentId ? "checkout" : "cart";
      if (await isSuppressed(db, cart.email as string)) {
        await db.update(carts).set({ recoveryEmailedAt: now, recoveryStage: "suppressed" }).where(eq(carts.id, cart.id));
        continue;
      }
      const claimed = await db
        .update(carts)
        .set({ recoveryEmailedAt: now, recoveryStage: kind })
        .where(and(eq(carts.id, cart.id), isNull(carts.recoveryEmailedAt)))
        .returning({ id: carts.id });
      if (!claimed.length) continue;
      const view = await reaperCartView(db, store, cart.token);
      if (!view) continue;
      const input = {
        domain: store.domain,
        handle: view.handle,
        money: formatMoney,
        currency: store.currency,
        lines: view.lines,
        totalCents: view.totalCents,
        recoverUrl: `${site}/cart?recover=${encodeURIComponent(cart.token)}`,
        unsubscribeUrl: await unsubscribeUrl(env, site, cart.email as string),
        postalAddress,
      };
      const mail = kind === "checkout" ? reaperCheckoutEmail(input) : reaperCartEmail(input);
      await deliver(env, store, cart.email as string, mail, summary);
    }

    // #2, the comeback
    const second = await db
      .select()
      .from(carts)
      .where(
        and(
          eq(carts.storeId, store.id),
          eq(carts.status, "open"),
          isNotNull(carts.email),
          inArray(carts.recoveryStage, ["cart", "checkout"]),
          lt(carts.recoveryEmailedAt, new Date(now.getTime() - 24 * HOUR)),
          sql`${carts.recoveryEmailedAt} > ${new Date(now.getTime() - 72 * HOUR)}`,
          sql`jsonb_array_length(${carts.items}) > 0`,
        ),
      )
      .limit(50);
    for (const cart of second) {
      summary.considered += 1;
      const claimed = await db
        .update(carts)
        .set({ recoveryStage: "comeback" })
        .where(and(eq(carts.id, cart.id), inArray(carts.recoveryStage, ["cart", "checkout"])))
        .returning({ id: carts.id });
      if (!claimed.length) continue;
      // Never stacks: a cart already carrying another code gets no comeback email.
      if (cart.discountCode && !isComebackCode(cart.discountCode)) continue;
      if (await isSuppressed(db, cart.email as string)) continue;
      const view = await reaperCartView(db, store, cart.token);
      if (!view) continue;
      const code = await ensureComebackDiscount(db, store.id, cart.id);
      const mail = reaperComebackEmail({
        domain: store.domain,
        handle: view.handle,
        money: formatMoney,
        currency: store.currency,
        lines: view.lines,
        totalCents: view.subtotalCents,
        recoverUrl: `${site}/cart?recover=${encodeURIComponent(cart.token)}&code=${encodeURIComponent(code)}`,
        unsubscribeUrl: await unsubscribeUrl(env, site, cart.email as string),
        postalAddress,
        code,
        offCents: COMEBACK_CENTS,
      });
      await deliver(env, store, cart.email as string, mail, summary);
    }
  }
}

async function deliver(
  env: Env,
  store: typeof stores.$inferSelect,
  to: string,
  mail: { subject: string; html: string; text: string },
  summary: RecoverySummary,
) {
  const result = await sendEmail(env, {
    from: `${store.name} <${store.emailFrom || "orders@resend.dev"}>`,
    to,
    replyTo: store.contactEmail,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  });
  if (result.ok) summary.sent += 1;
  else {
    summary.failed += 1;
    summary.reasons.push(`${store.slug} · ${to} · ${result.reason}`);
  }
}

/**
 * The cart as the customer would see it, priced by the same priceCart the
 * checkout uses, without granting anything (the system is reading, not her).
 */
export async function reaperCartView(db: DB, store: typeof stores.$inferSelect, token: string) {
  const priced = await priceCart(db, store, token, null, { comeback: false });
  if (!priced.lines.length) return null;
  const [first] = await db
    .select({ handle: products.handle })
    .from(variants)
    .innerJoin(products, eq(products.id, variants.productId))
    .where(eq(variants.id, priced.lines[0].variantId))
    .limit(1);
  const lines: FlowLine[] = priced.lines.map((l) => ({
    label: l.label.toLowerCase().includes(l.productTitle.toLowerCase().replace(/^the /, "")) || l.label.toLowerCase().includes("scream")
      ? l.label
      : `${l.productTitle} \u2014 ${l.label}`,
    quantity: l.quantity,
    lineTotalCents: l.lineTotalCents,
  }));
  return { handle: first?.handle ?? null, lines, subtotalCents: priced.subtotalCents, totalCents: priced.totalCents };
}

/**
 * Mysterious Archive welcome pop-up: capture a lead (email and/or phone) and
 * hand back a welcome discount code that actually works at checkout.
 *
 * The browser never decides the amount. The percent is a store setting
 * (`welcome_popup_percent`, default 10 — Alex sets the exact %). The code is a
 * single standing percentage code, `WELCOME`, once per customer, with no usage
 * limit and no expiry; it is created or refreshed to the current percent each
 * time someone signs up, so changing the setting changes the code with no
 * deploy. It is `oncePerCustomer`, so `publicOffer()` never picks it up as the
 * store-wide shouted coupon — it stays the pop-up's own reward.
 */
import { and, eq } from "drizzle-orm";
import type { DB } from "~/db/client";
import { discounts, marketingSubscribers } from "~/db/schema";
import { looksLikeEmail, normaliseEmail, upsertCustomer } from "./customers.server";

export const WELCOME_CODE = "WELCOME";
export const DEFAULT_WELCOME_PERCENT = 10;

type PopupStore = {
  id: string;
  welcomePopupEnabled?: boolean | null;
  welcomePopupPercent?: number | null;
};

type Geo = { city?: string | null; region?: string | null; country?: string | null };

/** Keep leading + for international numbers; require at least 7 digits. */
function cleanPhone(value: string): string {
  const trimmed = (value || "").trim().replace(/[^\d+]/g, "");
  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15 ? trimmed : "";
}

/**
 * Create the `WELCOME` percentage code, or refresh it to the current percent.
 * Returns the percent actually in force (clamped 1–90).
 */
export async function ensureWelcomeDiscount(db: DB, storeId: string, percent: number): Promise<number> {
  const value = Math.min(90, Math.max(1, Math.round(percent)));
  await db
    .insert(discounts)
    .values({
      storeId,
      code: WELCOME_CODE,
      kind: "percentage",
      value,
      appliesTo: "order",
      oncePerCustomer: true,
      active: true,
    })
    .onConflictDoUpdate({
      target: [discounts.storeId, discounts.code],
      set: {
        kind: "percentage",
        value,
        appliesTo: "order",
        oncePerCustomer: true,
        usageLimit: null,
        endsAt: null,
        startsAt: null,
        active: true,
      },
    });
  return value;
}

export type SubscribeResult =
  | { ok: true; code: string; percent: number }
  | { ok: false; reason: string };

export async function subscribeLead(
  db: DB,
  store: PopupStore,
  input: { email?: string; phone?: string; sessionId?: string | null; geo?: Geo },
): Promise<SubscribeResult> {
  if (store.welcomePopupEnabled === false) {
    return { ok: false, reason: "Sign-ups are closed right now." };
  }
  const email = normaliseEmail(input.email ?? "");
  const phone = cleanPhone(input.phone ?? "");
  const hasEmail = looksLikeEmail(email);
  if (!hasEmail && !phone) {
    return { ok: false, reason: "Enter a valid email or phone number." };
  }

  const percent = await ensureWelcomeDiscount(db, store.id, store.welcomePopupPercent ?? DEFAULT_WELCOME_PERCENT);

  // Email leads also land in the customer list with marketing consent, so the
  // existing flows and the campaign audience see them.
  if (hasEmail) {
    await upsertCustomer(db, store.id, {
      email,
      phone: phone || undefined,
      consent: true,
      sessionId: input.sessionId ?? undefined,
      geo: input.geo,
    }).catch(() => null);
  }

  await db
    .insert(marketingSubscribers)
    .values({
      storeId: store.id,
      email: hasEmail ? email : null,
      phone: phone || null,
      code: WELCOME_CODE,
      source: "popup",
      city: input.geo?.city ?? null,
      region: input.geo?.region ?? null,
      country: input.geo?.country ?? null,
    })
    .onConflictDoNothing()
    .catch(() => null);

  return { ok: true, code: WELCOME_CODE, percent };
}

/**
 * Every address this store may email for marketing: checkout consent on paid
 * orders, consented customers (which includes pop-up email leads), and
 * marketing-subscriber emails. Lower-cased and de-duplicated.
 */
export async function audienceEmails(db: DB, storeId: string): Promise<string[]> {
  const { customers, orders } = await import("~/db/schema");
  const [orderRows, customerRows, subRows] = await Promise.all([
    db
      .select({ email: orders.email, consent: orders.marketingConsent })
      .from(orders)
      .where(eq(orders.storeId, storeId)),
    db
      .select({ email: customers.email })
      .from(customers)
      .where(and(eq(customers.storeId, storeId), eq(customers.marketingConsent, true))),
    db
      .select({ email: marketingSubscribers.email })
      .from(marketingSubscribers)
      .where(eq(marketingSubscribers.storeId, storeId)),
  ]);
  const set = new Set<string>();
  for (const r of orderRows) if (r.consent && r.email) set.add(r.email.toLowerCase());
  for (const r of customerRows) if (r.email) set.add(r.email.toLowerCase());
  for (const r of subRows) if (r.email) set.add(r.email.toLowerCase());
  return [...set];
}

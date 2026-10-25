/**
 * Mysterious Archive: accounts, offers and the message center.
 *
 * One offer (or chat) is one conversation, like a Vestiaire offer thread. The
 * customer signs in with an emailed one-time code (no password, no form beyond
 * the email), makes an offer on one piece, and Alex answers personally in Shop
 * Admin: accept, reject or write anything. No automatic replies.
 *
 * An accepted offer becomes a one-use, 12-hour fixed discount that is bound to
 * that one piece (see offerRefusal, called from priceCart) and is only ever
 * handed to the signed-in buyer whose email made the offer.
 */
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import type { DB } from "~/db/client";
import {
  customers,
  discounts,
  maLoginCodes,
  maOwnerAttempts,
  maOwnerCodes,
  maOwnerSessions,
  maMessages,
  maOffers,
  maSessions,
  products,
  variants,
} from "~/db/schema";
import { sendEmail, esc } from "./email.server";
import { OFFER_HOURS, dollars } from "./ma-shared";
export { OFFER_HOURS, dollars };
import { cartCookie, cartTokenForStore, readCartToken, saveCart, setCartDiscount, type CartLine } from "./cart.server";

export const MA_SLUG = "mysterious-archive";
export const OFFER_PREFIX = "OFFER-";
export const SESSION_COOKIE = "ma_session";
const SESSION_DAYS = 30;
const CODE_MINUTES = 10;
const MIN_OFFER_FRACTION = 0.5;
const OWNER_EMAIL = "getsculps@gmail.com";
const FROM = "Mysterious Archive <orders@blackreaper.us>";

export type OfferRow = typeof maOffers.$inferSelect;
type Store = { id: string; slug: string; name: string; currency: string; contactEmail?: string | null };

/* ------------------------------------------------------------------ helpers */

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomHex(bytes: number): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sixDigits(): string {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(a[0] % 1_000_000).padStart(6, "0");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function normEmail(raw: unknown): string | null {
  const email = String(raw ?? "").trim().toLowerCase();
  if (email.length < 5 || email.length > 254) return null;
  if (!/^[^\s@<>()",;:\\]+@[^\s@<>()",;:\\]+\.[^\s@<>()",;:\\]{2,}$/.test(email)) return null;
  return email;
}

/** A POST must come from this site. SameSite=Lax cookies are the second wall. */
export function sameOrigin(request: Request): boolean {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host === url.host;
    } catch {
      return false;
    }
  }
  const site = request.headers.get("sec-fetch-site");
  return !site || site === "same-origin" || site === "none";
}


/* ------------------------------------------------------------------ sessions */

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function sessionCookie(token: string, url: URL): string {
  const secure = url.protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`;
}

export function clearSessionCookie(url: URL): string {
  const secure = url.protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

/** The signed-in buyer for this store, or null. */
export async function readSession(db: DB, storeId: string, request: Request): Promise<{ email: string } | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token || token.length < 20) return null;
  const [row] = await db
    .select({ email: maSessions.email })
    .from(maSessions)
    .where(and(eq(maSessions.storeId, storeId), eq(maSessions.tokenHash, await sha256Hex(token)), gt(maSessions.expiresAt, new Date())))
    .limit(1);
  return row ?? null;
}

export async function endSession(db: DB, storeId: string, request: Request): Promise<void> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return;
  await db.delete(maSessions).where(and(eq(maSessions.storeId, storeId), eq(maSessions.tokenHash, await sha256Hex(token))));
}

/** Creates the customer-list row (email only) and a session. Used by every sign-in method. */
export async function startSession(db: DB, store: Store, email: string): Promise<string> {
  await db
    .insert(customers)
    .values({ storeId: store.id, email })
    .onConflictDoUpdate({ target: [customers.storeId, customers.email], set: { lastSeenAt: new Date() } });
  const token = randomHex(32);
  await db.insert(maSessions).values({
    storeId: store.id,
    email,
    tokenHash: await sha256Hex(token),
    expiresAt: new Date(Date.now() + SESSION_DAYS * 86400_000),
  });
  return token;
}

/* ------------------------------------------------------------------ email code */

async function notify(env: Env, to: string, subject: string, text: string, html: string): Promise<void> {
  try {
    await sendEmail(env, { from: FROM, to, subject, html, text });
  } catch {
    /* an email is never worth failing the action that caused it */
  }
}

function shell(body: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:28px;color:#171717">${body}<p style="margin-top:28px;font-size:12px;color:#777">Mysterious Archive</p></div>`;
}

export async function requestCode(db: DB, env: Env, store: Store, email: string): Promise<{ ok: boolean; reason?: string }> {
  const since = new Date(Date.now() - 3600_000);
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(maLoginCodes)
    .where(and(eq(maLoginCodes.storeId, store.id), eq(maLoginCodes.email, email), gt(maLoginCodes.createdAt, since)));
  if (n >= 5) return { ok: false, reason: "Too many codes requested. Try again in an hour." };
  const code = sixDigits();
  await db.insert(maLoginCodes).values({
    storeId: store.id,
    email,
    codeHash: await sha256Hex(`${store.id}:${email}:${code}`),
    expiresAt: new Date(Date.now() + CODE_MINUTES * 60_000),
  });
  const sent = await sendEmail(env, {
    from: FROM,
    to: email,
    subject: `${code} is your Mysterious Archive code`,
    text: `Your Mysterious Archive sign-in code is ${code}. It works for ${CODE_MINUTES} minutes.`,
    html: shell(`<p style="font-size:15px">Your sign-in code</p><p style="font-size:34px;letter-spacing:.2em;font-weight:700;margin:8px 0">${code}</p><p style="font-size:13px;color:#555">It works for ${CODE_MINUTES} minutes. If you did not ask for it, ignore this email.</p>`),
  }).catch(() => ({ ok: false as const, reason: "send failed" }));
  if (!sent.ok) {
    await db.delete(maLoginCodes).where(and(eq(maLoginCodes.storeId, store.id), eq(maLoginCodes.email, email), eq(maLoginCodes.codeHash, await sha256Hex(`${store.id}:${email}:${code}`))));
    return { ok: false, reason: "We could not send the email. Check the address and try again." };
  }
  return { ok: true };
}

export async function verifyCode(db: DB, store: Store, email: string, code: string): Promise<string | null> {
  const clean = code.replace(/\D/g, "");
  if (clean.length !== 6) return null;
  const [row] = await db
    .select()
    .from(maLoginCodes)
    .where(and(eq(maLoginCodes.storeId, store.id), eq(maLoginCodes.email, email), gt(maLoginCodes.expiresAt, new Date())))
    .orderBy(desc(maLoginCodes.createdAt))
    .limit(1);
  if (!row || row.usedAt || row.attempts >= 5) return null;
  const ok = safeEqual(row.codeHash, await sha256Hex(`${store.id}:${email}:${clean}`));
  if (!ok) {
    await db.update(maLoginCodes).set({ attempts: row.attempts + 1 }).where(eq(maLoginCodes.id, row.id));
    return null;
  }
  // The conditional write makes the code single-use even under a double submit.
  const used = await db
    .update(maLoginCodes)
    .set({ usedAt: new Date() })
    .where(and(eq(maLoginCodes.id, row.id), sql`${maLoginCodes.usedAt} is null`))
    .returning({ id: maLoginCodes.id });
  if (!used.length) return null;
  return startSession(db, store, email);
}

/* ------------------------------------------------------------------ offers */

export function minOfferCents(listCents: number): number {
  return Math.ceil(listCents * MIN_OFFER_FRACTION);
}

async function sellable(db: DB, store: Store, variantId: string) {
  const [row] = await db
    .select({
      variantId: variants.id,
      productId: products.id,
      title: products.title,
      handle: products.handle,
      priceCents: variants.priceCents,
      available: variants.available,
      label: variants.label,
    })
    .from(variants)
    .innerJoin(products, eq(products.id, variants.productId))
    .where(and(eq(variants.id, variantId), eq(products.storeId, store.id), eq(products.status, "active")))
    .limit(1);
  if (!row || row.available < 1 || /not for sale/i.test(row.label ?? "")) return null;
  return row;
}

async function touch(db: DB, offerId: string, who: "customer" | "owner" | "system", extra: Partial<typeof maOffers.$inferInsert> = {}) {
  await db
    .update(maOffers)
    .set({
      updatedAt: new Date(),
      ...(who === "customer" ? { ownerUnread: true } : {}),
      ...(who === "owner" ? { customerUnread: true } : {}),
      ...extra,
    })
    .where(eq(maOffers.id, offerId));
}

export async function addMessage(
  db: DB,
  env: Env,
  store: Store,
  offerId: string,
  sender: "customer" | "owner" | "system",
  bodyRaw: string,
  origin: string,
): Promise<{ ok: boolean; reason?: string }> {
  const body = bodyRaw.replace(/\r\n/g, "\n").trim().slice(0, 1500);
  if (!body) return { ok: false, reason: "Write a message first." };
  const [offer] = await db.select().from(maOffers).where(and(eq(maOffers.id, offerId), eq(maOffers.storeId, store.id))).limit(1);
  if (!offer) return { ok: false, reason: "Conversation not found." };
  if (sender === "customer") {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(maMessages)
      .where(and(eq(maMessages.offerId, offerId), eq(maMessages.sender, "customer"), gt(maMessages.createdAt, new Date(Date.now() - 86400_000))));
    if (n >= 40) return { ok: false, reason: "Too many messages today. Alex will answer soon." };
  }
  await db.insert(maMessages).values({ offerId, sender, body });
  await touch(db, offerId, sender);
  const [piece] = await db.select({ title: products.title }).from(products).where(eq(products.id, offer.productId)).limit(1);
  const title = (piece?.title ?? "a piece").replace(/^Chrome Hearts\s*/, "");
  if (sender === "customer") {
    await notify(
      env,
      store.contactEmail || OWNER_EMAIL,
      `New message from ${offer.email} · ${title}`,
      `${offer.email} wrote about ${title}:\n\n${body}\n\n${origin}/admin/archive-messages?store=${store.slug}&offer=${offer.id}`,
      shell(`<p><strong>${esc(offer.email)}</strong> wrote about <strong>${esc(title)}</strong>:</p><p style="white-space:pre-wrap">${esc(body)}</p><p><a href="${origin}/admin/archive-messages?store=${store.slug}&offer=${offer.id}">Open in Shop Admin</a></p>`),
    );
  } else if (sender === "owner") {
    await notify(
      env,
      offer.email,
      `Mysterious Archive replied about ${title}`,
      `${body}\n\nOpen your messages: ${origin}/archive/account?offer=${offer.id}`,
      shell(`<p style="white-space:pre-wrap">${esc(body)}</p><p><a href="${origin}/archive/account?offer=${offer.id}" style="display:inline-block;background:#171717;color:#fff;padding:12px 20px;text-decoration:none">Open your messages</a></p>`),
    );
  }
  return { ok: true };
}

/** A chat about one piece, with no price attached. */
export async function startChat(db: DB, env: Env, store: Store, email: string, variantId: string, text: string, origin: string): Promise<{ ok: boolean; reason?: string; offerId?: string }> {
  const item = await sellable(db, store, variantId);
  if (!item) return { ok: false, reason: "This piece is no longer available." };
  const [existing] = await db
    .select({ id: maOffers.id })
    .from(maOffers)
    .where(and(eq(maOffers.storeId, store.id), eq(maOffers.email, email), eq(maOffers.variantId, variantId), eq(maOffers.status, "chat")))
    .limit(1);
  let id = existing?.id;
  if (!id) {
    const [row] = await db
      .insert(maOffers)
      .values({ storeId: store.id, productId: item.productId, variantId, email, listCents: item.priceCents, amountCents: 0, status: "chat" })
      .returning({ id: maOffers.id });
    id = row.id;
  }
  const sent = await addMessage(db, env, store, id, "customer", text, origin);
  return sent.ok ? { ok: true, offerId: id } : sent;
}

export async function createOffer(
  db: DB,
  env: Env,
  store: Store,
  email: string,
  variantId: string,
  amountCents: number,
  note: string,
  origin: string,
): Promise<{ ok: boolean; reason?: string; offerId?: string }> {
  const item = await sellable(db, store, variantId);
  if (!item) return { ok: false, reason: "This piece is no longer available." };
  if (!Number.isInteger(amountCents) || amountCents <= 0) return { ok: false, reason: "Enter your offer in dollars." };
  if (amountCents >= item.priceCents) return { ok: false, reason: "Your offer is at the full price: use Buy now instead." };
  if (amountCents < minOfferCents(item.priceCents)) {
    return { ok: false, reason: `Offers start at ${dollars(minOfferCents(item.priceCents), store.currency)} for this piece.` };
  }
  const open = await db
    .select({ id: maOffers.id, status: maOffers.status, expiresAt: maOffers.expiresAt })
    .from(maOffers)
    .where(and(eq(maOffers.storeId, store.id), eq(maOffers.email, email), eq(maOffers.variantId, variantId), inArray(maOffers.status, ["pending", "countered", "accepted"])));
  const live = open.find((o) => o.status === "pending" || o.status === "countered" || (o.expiresAt && o.expiresAt > new Date()));
  if (live) return { ok: false, reason: "You already have an offer on this piece. Open it in your messages.", offerId: live.id };
  const [row] = await db
    .insert(maOffers)
    .values({ storeId: store.id, productId: item.productId, variantId, email, listCents: item.priceCents, amountCents })
    .returning({ id: maOffers.id });
  await db.insert(maMessages).values({ offerId: row.id, sender: "system", body: `Offer of ${dollars(amountCents, store.currency)} sent.` });
  if (note.trim()) await addMessage(db, env, store, row.id, "customer", note, origin);
  else {
    const title = item.title.replace(/^Chrome Hearts\s*/, "");
    await notify(
      env,
      store.contactEmail || OWNER_EMAIL,
      `New offer ${dollars(amountCents, store.currency)} · ${title}`,
      `${email} offered ${dollars(amountCents, store.currency)} (list ${dollars(item.priceCents, store.currency)}) for ${title}.\n\n${origin}/admin/archive-messages?store=${store.slug}&offer=${row.id}`,
      shell(`<p><strong>${esc(email)}</strong> offered <strong>${dollars(amountCents, store.currency)}</strong> (list ${dollars(item.priceCents, store.currency)}) for <strong>${esc(title)}</strong>.</p><p><a href="${origin}/admin/archive-messages?store=${store.slug}&offer=${row.id}">Answer in Shop Admin</a></p>`),
    );
  }
  return { ok: true, offerId: row.id };
}

export async function withdrawOffer(db: DB, store: Store, offerId: string, email: string): Promise<boolean> {
  const done = await db
    .update(maOffers)
    .set({ status: "withdrawn", updatedAt: new Date(), ownerUnread: true })
    .where(and(eq(maOffers.id, offerId), eq(maOffers.storeId, store.id), eq(maOffers.email, email), inArray(maOffers.status, ["pending", "countered"])))
    .returning({ id: maOffers.id });
  if (done.length) await db.insert(maMessages).values({ offerId, sender: "system", body: "Offer withdrawn." });
  return done.length > 0;
}

/** Alex accepts, optionally at a different price. 12 hours, one use, that piece only. */
export async function acceptOffer(db: DB, env: Env, store: Store, offerId: string, amountCents: number | null, origin: string): Promise<{ ok: boolean; reason?: string }> {
  const [offer] = await db.select().from(maOffers).where(and(eq(maOffers.id, offerId), eq(maOffers.storeId, store.id))).limit(1);
  if (!offer || offer.status === "chat") return { ok: false, reason: "Offer not found." };
  const live = offer.status === "accepted" && offer.expiresAt && offer.expiresAt > new Date();
  if (live) return { ok: false, reason: "Already accepted and still open." };
  const item = await sellable(db, store, offer.variantId);
  if (!item) return { ok: false, reason: "This piece is no longer available." };
  const price = amountCents ?? offer.amountCents;
  if (!Number.isInteger(price) || price <= 0 || price > item.priceCents) return { ok: false, reason: "Price must be between $1 and the list price." };
  if (offer.discountCode) await db.update(discounts).set({ active: false }).where(and(eq(discounts.storeId, store.id), eq(discounts.code, offer.discountCode)));
  const code = `${OFFER_PREFIX}${randomHex(5).toUpperCase()}`;
  const expiresAt = new Date(Date.now() + OFFER_HOURS * 3600_000);
  await db.insert(discounts).values({
    storeId: store.id,
    code,
    kind: "fixed",
    value: Math.max(0, item.priceCents - price),
    appliesTo: "order",
    endsAt: expiresAt,
    usageLimit: 1,
    oncePerCustomer: true,
    active: true,
  });
  await db
    .update(maOffers)
    .set({ status: "accepted", amountCents: price, discountCode: code, expiresAt, acceptedAt: new Date(), customerUnread: true, updatedAt: new Date() })
    .where(eq(maOffers.id, offerId));
  await db.insert(maMessages).values({ offerId, sender: "system", body: `Accepted at ${dollars(price, store.currency)}. Buy it within ${OFFER_HOURS} hours.` });
  const title = item.title.replace(/^Chrome Hearts\s*/, "");
  await notify(
    env,
    offer.email,
    `Your offer was accepted · ${title}`,
    `Mysterious Archive accepted ${dollars(price, store.currency)} for ${title}. Buy it within ${OFFER_HOURS} hours:\n${origin}/archive/account?offer=${offerId}`,
    shell(`<p style="font-size:16px"><strong>Accepted.</strong> ${esc(title)} is yours at <strong>${dollars(price, store.currency)}</strong>.</p><p>Buy it within ${OFFER_HOURS} hours.</p><p><a href="${origin}/archive/account?offer=${offerId}" style="display:inline-block;background:#171717;color:#fff;padding:12px 20px;text-decoration:none">Buy now</a></p>`),
  );
  return { ok: true };
}

export async function rejectOffer(db: DB, env: Env, store: Store, offerId: string, origin: string): Promise<{ ok: boolean; reason?: string }> {
  const [offer] = await db.select().from(maOffers).where(and(eq(maOffers.id, offerId), eq(maOffers.storeId, store.id))).limit(1);
  if (!offer || offer.status === "chat") return { ok: false, reason: "Offer not found." };
  if (offer.discountCode) await db.update(discounts).set({ active: false }).where(and(eq(discounts.storeId, store.id), eq(discounts.code, offer.discountCode)));
  await db.update(maOffers).set({ status: "rejected", customerUnread: true, updatedAt: new Date() }).where(eq(maOffers.id, offerId));
  await db.insert(maMessages).values({ offerId, sender: "system", body: "Offer declined." });
  const [piece] = await db.select({ title: products.title }).from(products).where(eq(products.id, offer.productId)).limit(1);
  const title = (piece?.title ?? "the piece").replace(/^Chrome Hearts\s*/, "");
  await notify(
    env,
    offer.email,
    `Update on your offer · ${title}`,
    `Mysterious Archive could not accept your offer on ${title}. Open your messages: ${origin}/archive/account?offer=${offerId}`,
    shell(`<p>Mysterious Archive could not accept your offer on <strong>${esc(title)}</strong>.</p><p><a href="${origin}/archive/account?offer=${offerId}">Open your messages</a></p>`),
  );
  return { ok: true };
}

/** Alex proposes a different price. The buyer then accepts or declines it, like Vestiaire's counter offer. */
export async function counterOffer(db: DB, env: Env, store: Store, offerId: string, counterCents: number, origin: string): Promise<{ ok: boolean; reason?: string }> {
  const [offer] = await db.select().from(maOffers).where(and(eq(maOffers.id, offerId), eq(maOffers.storeId, store.id))).limit(1);
  if (!offer || offer.status === "chat") return { ok: false, reason: "Offer not found." };
  if (offer.status !== "pending" && offer.status !== "countered") return { ok: false, reason: "This offer is already settled." };
  const item = await sellable(db, store, offer.variantId);
  if (!item) return { ok: false, reason: "This piece is no longer available." };
  if (!Number.isInteger(counterCents) || counterCents <= 0 || counterCents >= item.priceCents) return { ok: false, reason: "A counter offer must be below the list price." };
  await db.update(maOffers).set({ status: "countered", counterCents, customerUnread: true, updatedAt: new Date() }).where(eq(maOffers.id, offerId));
  await db.insert(maMessages).values({ offerId, sender: "system", body: `Counter offer: ${dollars(counterCents, store.currency)}.` });
  const title = item.title.replace(/^Chrome Hearts\s*/, "");
  await notify(
    env,
    offer.email,
    `Counter offer · ${title}`,
    `Mysterious Archive countered with ${dollars(counterCents, store.currency)} for ${title}. Accept or decline: ${origin}/archive/account?offer=${offerId}`,
    shell(`<p style="font-size:16px"><strong>Counter offer: ${dollars(counterCents, store.currency)}</strong> for ${esc(title)}.</p><p><a href="${origin}/archive/account?offer=${offerId}" style="display:inline-block;background:#171717;color:#fff;padding:12px 20px;text-decoration:none">Accept or decline</a></p>`),
  );
  return { ok: true };
}

/** The buyer takes the seller's counter: it becomes an accepted offer with the 12-hour buy window. */
export async function acceptCounter(db: DB, env: Env, store: Store, offerId: string, email: string, origin: string): Promise<{ ok: boolean; reason?: string }> {
  const [offer] = await db.select().from(maOffers).where(and(eq(maOffers.id, offerId), eq(maOffers.storeId, store.id), eq(maOffers.email, email))).limit(1);
  if (!offer || offer.status !== "countered" || !offer.counterCents) return { ok: false, reason: "There is no counter offer to accept." };
  const res = await acceptOffer(db, env, store, offerId, offer.counterCents, origin);
  if (res.ok) {
    await db.update(maOffers).set({ ownerUnread: true }).where(eq(maOffers.id, offerId));
    await notify(
      env,
      store.contactEmail || OWNER_EMAIL,
      `Counter accepted by ${offer.email}`,
      `${offer.email} accepted your counter of ${dollars(offer.counterCents, store.currency)}.\n${origin}/admin/archive-messages?store=${store.slug}&offer=${offerId}`,
      shell(`<p><strong>${esc(offer.email)}</strong> accepted your counter of <strong>${dollars(offer.counterCents, store.currency)}</strong>. They have ${OFFER_HOURS} hours to buy.</p>`),
    );
  }
  return res;
}

export async function declineCounter(db: DB, env: Env, store: Store, offerId: string, email: string, origin: string): Promise<boolean> {
  const done = await db
    .update(maOffers)
    .set({ status: "rejected", ownerUnread: true, updatedAt: new Date() })
    .where(and(eq(maOffers.id, offerId), eq(maOffers.storeId, store.id), eq(maOffers.email, email), eq(maOffers.status, "countered")))
    .returning({ id: maOffers.id });
  if (done.length) {
    await db.insert(maMessages).values({ offerId, sender: "system", body: "Counter offer declined." });
    await notify(env, store.contactEmail || OWNER_EMAIL, `Counter declined by ${email}`, `${email} declined your counter.\n${origin}/admin/archive-messages?store=${store.slug}&offer=${offerId}`, shell(`<p><strong>${esc(email)}</strong> declined your counter offer.</p>`));
  }
  return done.length > 0;
}

/** The customer is typing. Only the owner's view ever reads this; the customer never sees the owner typing. */
export async function setTyping(db: DB, store: Store, offerId: string, email: string): Promise<void> {
  await db
    .update(maOffers)
    .set({ customerTypingAt: new Date() })
    .where(and(eq(maOffers.id, offerId), eq(maOffers.storeId, store.id), eq(maOffers.email, email)));
}

/* ------------------------------------------------------------------ owner inbox */

export const OWNER_COOKIE = "ma_owner";
const OWNER_DAYS = 30;
const OWNER_WINDOW_MS = 15 * 60_000;

export function ownerCookie(token: string, url: URL): string {
  const secure = url.protocol === "https:" ? "; Secure" : "";
  return `${OWNER_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${OWNER_DAYS * 86400}${secure}`;
}
export function clearOwnerCookie(url: URL): string {
  const secure = url.protocol === "https:" ? "; Secure" : "";
  return `${OWNER_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

export function normOwnerCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function ownerCodeHash(storeId: string, code: string): Promise<string> {
  return sha256Hex(`owner:${storeId}:${normOwnerCode(code)}`);
}

/** True when the request carries a live owner session for this store. */
export async function readOwner(db: DB, storeId: string, request: Request): Promise<boolean> {
  const token = readCookie(request, OWNER_COOKIE);
  if (!token || token.length < 20) return false;
  const [row] = await db
    .select({ id: maOwnerSessions.id })
    .from(maOwnerSessions)
    .where(and(eq(maOwnerSessions.storeId, storeId), eq(maOwnerSessions.tokenHash, await sha256Hex(token)), gt(maOwnerSessions.expiresAt, new Date())))
    .limit(1);
  return Boolean(row);
}

export async function endOwner(db: DB, storeId: string, request: Request): Promise<void> {
  const token = readCookie(request, OWNER_COOKIE);
  if (!token) return;
  await db.delete(maOwnerSessions).where(and(eq(maOwnerSessions.storeId, storeId), eq(maOwnerSessions.tokenHash, await sha256Hex(token))));
}

/**
 * The owner signs in with one long private code. Wrong tries are counted per
 * address and across the whole store, and the page locks for 15 minutes. Every
 * success emails an alert, so a stranger getting in would be seen at once.
 */
export async function ownerSignIn(db: DB, env: Env, store: Store, code: string, request: Request): Promise<{ ok: true; token: string } | { ok: false; reason: string }> {
  const ip = (request.headers.get("cf-connecting-ip") ?? "unknown").slice(0, 64);
  const since = new Date(Date.now() - OWNER_WINDOW_MS);
  const failed = await db
    .select({ ip: maOwnerAttempts.ip })
    .from(maOwnerAttempts)
    .where(and(eq(maOwnerAttempts.storeId, store.id), eq(maOwnerAttempts.ok, false), gt(maOwnerAttempts.createdAt, since)));
  if (failed.filter((f) => f.ip === ip).length >= 5 || failed.length >= 15) {
    return { ok: false, reason: "Too many tries. Wait 15 minutes." };
  }
  const wanted = normOwnerCode(code);
  const rows = await db.select({ hash: maOwnerCodes.codeHash }).from(maOwnerCodes).where(and(eq(maOwnerCodes.storeId, store.id), eq(maOwnerCodes.active, true)));
  const given = wanted.length >= 16 ? await ownerCodeHash(store.id, wanted) : "";
  let match = false;
  for (const r of rows) if (given && safeEqual(r.hash, given)) match = true;
  await db.insert(maOwnerAttempts).values({ storeId: store.id, ip, ok: match });
  if (!match) return { ok: false, reason: "That code is not right." };
  const token = randomHex(32);
  await db.insert(maOwnerSessions).values({
    storeId: store.id,
    tokenHash: await sha256Hex(token),
    expiresAt: new Date(Date.now() + OWNER_DAYS * 86400_000),
  });
  const ua = (request.headers.get("user-agent") ?? "").slice(0, 160);
  await notify(
    env,
    store.contactEmail || OWNER_EMAIL,
    "Owner sign-in to your Mysterious Archive inbox",
    `Someone signed in to the owner inbox.\nIP: ${ip}\nDevice: ${ua}\nIf this was not you, tell Claude to change the owner code.`,
    shell(`<p><strong>Owner sign-in</strong> to your Mysterious Archive inbox.</p><p style="font-size:13px;color:#555">IP ${esc(ip)}<br>${esc(ua)}</p><p>If this was not you, tell Claude to change the owner code.</p>`),
  );
  return { ok: true, token };
}

/* ------------------------------------------------------------------ reading */

export interface ThreadView {
  offer: OfferRow;
  title: string;
  handle: string;
  image: string | null;
  available: number;
  purchased: boolean;
  messages: { id: string; sender: string; body: string; createdAt: string }[];
}

export async function listThreads(db: DB, store: Store, scope: { email: string } | "all"): Promise<(OfferRow & { title: string; handle: string; last: string | null })[]> {
  const where = scope === "all" ? eq(maOffers.storeId, store.id) : and(eq(maOffers.storeId, store.id), eq(maOffers.email, scope.email));
  const rows = await db
    .select({ offer: maOffers, title: products.title, handle: products.handle })
    .from(maOffers)
    .innerJoin(products, eq(products.id, maOffers.productId))
    .where(where)
    .orderBy(desc(maOffers.updatedAt))
    .limit(200);
  const out: (OfferRow & { title: string; handle: string; last: string | null })[] = [];
  for (const r of rows) {
    const [m] = await db.select({ body: maMessages.body }).from(maMessages).where(eq(maMessages.offerId, r.offer.id)).orderBy(desc(maMessages.createdAt)).limit(1);
    out.push({ ...r.offer, title: r.title, handle: r.handle, last: m?.body ?? null });
  }
  return out;
}

export async function getThread(db: DB, store: Store, offerId: string, scope: { email: string } | "all"): Promise<ThreadView | null> {
  const [row] = await db
    .select({ offer: maOffers, title: products.title, handle: products.handle, available: variants.available })
    .from(maOffers)
    .innerJoin(products, eq(products.id, maOffers.productId))
    .innerJoin(variants, eq(variants.id, maOffers.variantId))
    .where(and(eq(maOffers.id, offerId), eq(maOffers.storeId, store.id)))
    .limit(1);
  if (!row) return null;
  if (scope !== "all" && row.offer.email !== scope.email) return null;
  const messages = await db.select().from(maMessages).where(eq(maMessages.offerId, offerId)).orderBy(maMessages.createdAt);
  let purchased = false;
  if (row.offer.discountCode) {
    const [d] = await db.select({ used: discounts.usedCount }).from(discounts).where(and(eq(discounts.storeId, store.id), eq(discounts.code, row.offer.discountCode))).limit(1);
    purchased = (d?.used ?? 0) > 0;
  }
  const [pr] = await db.select({ images: products.images }).from(products).where(eq(products.id, row.offer.productId)).limit(1);
  const img = (pr?.images ?? [])[0];
  return {
    offer: row.offer,
    title: row.title,
    handle: row.handle,
    image: img?.url ?? null,
    available: row.available,
    purchased,
    messages: messages.map((m) => ({ id: m.id, sender: m.sender, body: m.body, createdAt: m.createdAt.toISOString() })),
  };
}

export async function markRead(db: DB, offerId: string, who: "customer" | "owner"): Promise<void> {
  await db.update(maOffers).set(who === "owner" ? { ownerUnread: false } : { customerUnread: false }).where(eq(maOffers.id, offerId));
}

export async function unreadForOwner(db: DB, storeId: string): Promise<number> {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(maOffers).where(and(eq(maOffers.storeId, storeId), eq(maOffers.ownerUnread, true)));
  return n;
}

/* ------------------------------------------------------------------ buying an accepted offer */

/**
 * Puts exactly this one piece in a fresh cart with the offer's code on it and
 * returns the cookies. The caller redirects to /checkout.
 */
export async function redeemOffer(
  db: DB,
  store: Store,
  request: Request,
  offerId: string,
  email: string,
): Promise<{ ok: true; cookie: string } | { ok: false; reason: string }> {
  const [offer] = await db.select().from(maOffers).where(and(eq(maOffers.id, offerId), eq(maOffers.storeId, store.id))).limit(1);
  if (!offer || offer.email !== email) return { ok: false, reason: "Offer not found." };
  if (offer.status !== "accepted" || !offer.discountCode || !offer.expiresAt) return { ok: false, reason: "This offer is not open." };
  if (offer.expiresAt <= new Date()) return { ok: false, reason: "This offer has expired. Message us to reopen it." };
  const item = await sellable(db, store, offer.variantId);
  if (!item) return { ok: false, reason: "This piece has been sold." };
  const [d] = await db.select().from(discounts).where(and(eq(discounts.storeId, store.id), eq(discounts.code, offer.discountCode))).limit(1);
  if (!d || !d.active || d.usedCount >= 1) return { ok: false, reason: "This offer has already been used." };
  const url = new URL(request.url);
  const token = await cartTokenForStore(db, store.id, readCartToken(request));
  const lines: CartLine[] = [{ variantId: offer.variantId, quantity: 1 }];
  await saveCart(db, store.id, token, lines);
  await setCartDiscount(db, store.id, token, offer.discountCode);
  return { ok: true, cookie: cartCookie(token, url) };
}

/**
 * Called from priceCart for every code that starts with OFFER-: the code is
 * worth nothing unless the cart is exactly the one piece it was made for.
 * Returns a sentence for the customer, or null when the cart matches.
 */
export async function offerRefusal(db: DB, storeId: string, code: string, lines: { variantId: string; quantity: number }[]): Promise<string | null> {
  const wanted = code.trim().toUpperCase();
  if (!wanted.startsWith(OFFER_PREFIX)) return null;
  const [offer] = await db.select().from(maOffers).where(and(eq(maOffers.storeId, storeId), eq(maOffers.discountCode, wanted))).limit(1);
  if (!offer || offer.status !== "accepted") return "That offer is no longer available";
  if (!offer.expiresAt || offer.expiresAt <= new Date()) return "This offer has expired";
  if (lines.length !== 1 || lines[0].variantId !== offer.variantId || lines[0].quantity !== 1) return "This offer is for one specific piece only";
  return null;
}

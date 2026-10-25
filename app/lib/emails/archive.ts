/**
 * Mysterious Archive's customer emails.
 *
 * The website's own look: a white page, hairlines, Arial, black buttons, the
 * script logo, one pale-blue "Authenticated" box. Tables and inline styles
 * only (Outlook understands nothing else), 560px wide, mobile first.
 *
 * Renderers here are pure: data in, { subject, html, text } out. The senders
 * in email.server.ts call them (only when the store's domain is
 * mysteriousarchive.com) and do the sending and the timeline entry, so every
 * other store's email is untouched.
 *
 * Copy law (Alex): confident and warm, never apologetic, never about delays,
 * problems or logistics beyond the tracking itself, no offers or codes he did
 * not give, no invented facts.
 */
import { and, eq, inArray } from "drizzle-orm";
import type { DB } from "~/db/client";
import { orderItems, products, variants } from "~/db/schema";

export const ARCHIVE_DOMAIN = "mysteriousarchive.com";
export const ARCHIVE_REPLY = "mysterious@mysteriousarchive.com";
const SITE = `https://${ARCHIVE_DOMAIN}`;
const LOGO = `${SITE}/archive-logo-script.png`;
const FONT = "Arial,Helvetica,sans-serif";

export function isArchiveDomain(domain: string | null | undefined): boolean {
  return domain === ARCHIVE_DOMAIN;
}

/* ------------------------------------------------------------------ helpers */

function esc(value: unknown): string {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** $2,850 for whole dollars, $2,850.50 otherwise: the way the site prints prices. */
export function usd(cents: number, currency = "USD"): string {
  const whole = cents % 100 === 0;
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(cents / 100);
}

export interface ArchivePiece {
  /** the piece name as listed, with or without the brand prefix */
  title: string;
  /** the condition, e.g. "One size · Pre-owned" */
  condition: string | null;
  /** MA-XXXXXX, the same reference the bag shows */
  reference: string;
  imageUrl: string | null;
  quantity: number;
  /** price of the line, in cents */
  totalCents: number;
}

export interface Mail {
  subject: string;
  html: string;
  text: string;
}

export function pieceReference(variantId: string | null | undefined): string {
  return `MA-${String(variantId ?? "").replace(/-/g, "").slice(0, 6).toUpperCase() || "ARCHIV"}`;
}

function absUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:/i.test(url)) return url;
  return `${SITE}${url.startsWith("/") ? "" : "/"}${url}`;
}

function cleanTitle(title: string): string {
  return title.replace(/^Chrome Hearts\s*/i, "").trim();
}

/* ------------------------------------------------------------------ data */

/**
 * Pieces for a list of variants (or order items), with their cropped catalogue
 * photo and condition. Falls back to what the caller already knows.
 */
export async function loadPieces(
  db: DB,
  lines: { variantId?: string | null; title?: string | null; label?: string | null; quantity: number; totalCents: number }[],
): Promise<ArchivePiece[]> {
  const ids = lines.map((l) => l.variantId).filter((id): id is string => Boolean(id));
  const rows = ids.length
    ? await db
        .select({ id: variants.id, title: products.title, label: variants.label, images: products.images })
        .from(variants)
        .innerJoin(products, eq(products.id, variants.productId))
        .where(inArray(variants.id, ids))
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  return lines.map((l) => {
    const row = l.variantId ? byId.get(l.variantId) : undefined;
    const first = row?.images?.[0];
    return {
      title: row?.title ?? l.title ?? l.label ?? "Your piece",
      condition: row?.label ?? l.label ?? null,
      reference: pieceReference(l.variantId),
      imageUrl: absUrl(first?.thumb ?? first?.url ?? null),
      quantity: l.quantity,
      totalCents: l.totalCents,
    };
  });
}

/** The pieces on an order, read from its items. */
export async function loadOrderPieces(db: DB, orderId: string): Promise<ArchivePiece[]> {
  const items = await db.select().from(orderItems).where(and(eq(orderItems.orderId, orderId)));
  return loadPieces(
    db,
    items.map((i) => ({ variantId: i.variantId, title: i.title, label: i.label, quantity: i.quantity, totalCents: i.unitPriceCents * i.quantity })),
  );
}

/* ------------------------------------------------------------------ frame */

function frame(opts: { preheader: string; body: string; marketing?: { unsubscribeUrl?: string | null; postalAddress?: string | null } }): string {
  const m = opts.marketing;
  const note = m?.unsubscribeUrl
    ? `<div style="margin-top:14px;font-size:11.5px;line-height:1.6;color:#999">You typed your email at checkout, so we sent this reminder. <a href="${esc(m.unsubscribeUrl)}" style="color:#999;text-decoration:underline">Unsubscribe</a>${m.postalAddress ? `<br>${esc(m.postalAddress)}` : ""}</div>`
    : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><title>Mysterious Archive</title></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:${FONT};color:#171717;-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#ffffff">${esc(opts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff"><tr><td align="center" style="padding:30px 18px 44px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td align="center" style="padding:6px 0 26px;border-bottom:1px solid #ebebeb">
<a href="${SITE}/archive" style="text-decoration:none"><img src="${LOGO}" width="260" alt="Mysterious Archive" style="display:block;width:260px;max-width:70%;height:auto;border:0;margin:0 auto"></a>
</td></tr>
<tr><td style="padding:34px 0 8px">
${opts.body}
</td></tr>
<tr><td style="padding:30px 0 0;border-top:1px solid #ebebeb;text-align:center;font-size:12px;line-height:1.7;color:#777">
<div style="letter-spacing:.14em;text-transform:uppercase;font-size:11px;color:#171717">Mysterious Archive &middot; New York</div>
<div style="margin-top:6px">Reply to this email: <a href="mailto:${ARCHIVE_REPLY}" style="color:#777;text-decoration:underline">${ARCHIVE_REPLY}</a></div>
${note}
</td></tr>
</table></td></tr></table></body></html>`;
}

const eyebrow = (t: string) =>
  `<div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#777;margin:0 0 12px">${esc(t)}</div>`;
const headline = (t: string) =>
  `<h1 style="margin:0 0 14px;font-family:${FONT};font-size:26px;line-height:1.25;font-weight:400;color:#171717">${esc(t)}</h1>`;
const paragraph = (t: string) => `<p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#444">${t}</p>`;

function button(label: string, href: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 26px"><tr><td align="center" bgcolor="#000000" style="background:#000000;border-radius:4px">
<a href="${esc(href)}" style="display:block;font-family:${FONT};font-size:16px;font-weight:700;line-height:50px;height:50px;color:#ffffff;text-decoration:none;border-radius:4px">${esc(label)}</a>
</td></tr></table>`;
}

function authBox(): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 26px"><tr><td style="border:1px solid #a9cdf7;background:#f3f8ff;border-radius:12px;padding:16px 18px">
<div style="font-size:17px;font-weight:700;color:#171717">&#10003;&nbsp; Authenticated</div>
<div style="margin-top:8px;font-size:14px;line-height:1.6;color:#4a5560">Inspected and authenticated by Mysterious Archive. A printed certificate of authenticity comes with every order.</div>
</td></tr></table>`;
}

function pieceRow(p: ArchivePiece): string {
  const photo = p.imageUrl
    ? `<img src="${esc(p.imageUrl)}" width="96" alt="${esc(cleanTitle(p.title))}" style="display:block;width:96px;height:120px;object-fit:contain;border:1px solid #ebebeb;background:#ffffff">`
    : `<div style="width:96px;height:120px;border:1px solid #ebebeb"></div>`;
  return `<tr>
<td width="110" valign="top" style="padding:0 14px 0 0">${photo}</td>
<td valign="top" style="padding:2px 0 0">
<div style="font-size:11px;letter-spacing:.14em;color:#777">CHROME HEARTS</div>
<div style="margin:4px 0 6px;font-size:16px;line-height:1.4;font-weight:700;color:#171717">${esc(cleanTitle(p.title))}</div>
<div style="font-size:13px;line-height:1.6;color:#777">Reference ${esc(p.reference)}${p.condition ? `<br>${esc(p.condition)}` : ""}</div>
</td>
<td valign="top" align="right" style="padding:2px 0 0 10px;font-size:16px;font-weight:700;color:#171717;white-space:nowrap">${esc(usd(p.totalCents))}</td>
</tr>`;
}

function pieces(list: ArchivePiece[]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #ebebeb;border-bottom:1px solid #ebebeb;margin:0 0 22px"><tr><td style="padding:22px 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${list
    .map((p, i) => `${i ? `<tr><td colspan="3" style="height:20px"></td></tr>` : ""}${pieceRow(p)}`)
    .join("")}</table>
</td></tr></table>`;
}

function totalsRow(label: string, value: string, strong = false): string {
  const s = strong ? "font-size:17px;font-weight:700;color:#171717" : "font-size:14px;color:#555";
  return `<tr><td style="padding:5px 0;${s}">${esc(label)}</td><td align="right" style="padding:5px 0;${s}">${esc(value)}</td></tr>`;
}

/* ------------------------------------------------------------------ emails */

export interface ArchiveConfirmationData {
  first: string;
  reference: string;
  currency: string;
  pieces: ArchivePiece[];
  subtotalCents: number;
  discountLabel: string | null;
  discountCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  shipName: string;
  shipLines: string[];
}

export function archiveOrderConfirmation(d: ArchiveConfirmationData): Mail {
  const first = d.first || "there";
  const body = `${eyebrow(`Order ${d.reference}`)}
${headline(`Thank you, ${first}.`)}
${paragraph("Your piece is yours. It comes to you with its printed Mysterious Archive certificate of authenticity.")}
${pieces(d.pieces)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px">
${totalsRow("Subtotal", usd(d.subtotalCents, d.currency))}
${d.discountCents ? totalsRow(d.discountLabel || "Discount", `−${usd(d.discountCents, d.currency)}`) : ""}
${totalsRow("Shipping", d.shippingCents ? usd(d.shippingCents, d.currency) : "Free")}
${d.taxCents ? totalsRow("Tax", usd(d.taxCents, d.currency)) : ""}
<tr><td colspan="2" style="padding:6px 0 0;border-top:1px solid #ebebeb"></td></tr>
${totalsRow("Total", usd(d.totalCents, d.currency), true)}
</table>
${authBox()}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 26px"><tr><td style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#777;padding:0 0 8px">Delivering to</td></tr>
<tr><td style="font-size:15px;line-height:1.6;color:#171717">${esc(d.shipName)}${d.shipLines.map((l) => `<br>${esc(l)}`).join("")}</td></tr>
<tr><td style="padding-top:14px;font-size:13px;color:#777">Every order requires a signature on delivery.</td></tr></table>
${button("Visit the archive", `${SITE}/archive`)}`;
  const text = [
    `Thank you, ${first}.`,
    ``,
    `Order ${d.reference}. Your piece comes to you with its printed Mysterious Archive certificate of authenticity.`,
    ``,
    ...d.pieces.map((p) => `${cleanTitle(p.title)} (${p.reference}${p.condition ? `, ${p.condition}` : ""}) — ${usd(p.totalCents)}`),
    ``,
    `Subtotal ${usd(d.subtotalCents, d.currency)}`,
    d.discountCents ? `${d.discountLabel || "Discount"} -${usd(d.discountCents, d.currency)}` : ``,
    `Shipping ${d.shippingCents ? usd(d.shippingCents, d.currency) : "Free"}`,
    d.taxCents ? `Tax ${usd(d.taxCents, d.currency)}` : ``,
    `Total ${usd(d.totalCents, d.currency)}`,
    ``,
    `Delivering to: ${[d.shipName, ...d.shipLines].join(", ")}`,
    `Every order requires a signature on delivery.`,
    ``,
    `Mysterious Archive, New York. Reply to this email: ${ARCHIVE_REPLY}`,
  ]
    .filter((l) => l !== undefined && l !== null)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
  return { subject: `Your Mysterious Archive order ${d.reference}`, html: frame({ preheader: `Order ${d.reference} · ${usd(d.totalCents, d.currency)}`, body }), text };
}

export interface ArchiveShippingData {
  first: string;
  reference: string;
  carrier: string | null;
  tracking: string;
  trackUrl: string | null;
  pieces: ArchivePiece[];
}

export function archiveShippingNotice(d: ArchiveShippingData): Mail {
  const first = d.first || "there";
  const body = `${eyebrow(`Order ${d.reference}`)}
${headline("Your piece is on its way.")}
${paragraph(`${esc(first)}, your Mysterious Archive piece has left us${d.carrier ? ` with ${esc(d.carrier)}` : ""}. Follow it all the way to your door.`)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px"><tr><td style="border:1px solid #ebebeb;padding:18px 20px">
${d.carrier ? `<div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#777">Carrier</div><div style="margin:4px 0 14px;font-size:16px;color:#171717">${esc(d.carrier)}</div>` : ""}
<div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#777">Tracking number</div>
<div style="margin-top:4px;font-family:Menlo,Consolas,'Courier New',monospace;font-size:17px;letter-spacing:.04em;color:#171717;word-break:break-all">${esc(d.tracking)}</div>
</td></tr></table>
${d.trackUrl ? button("Track your piece", d.trackUrl) : ""}
${pieces(d.pieces)}
${authBox()}
<p style="margin:0 0 26px;font-size:13px;color:#777">Every order requires a signature on delivery.</p>`;
  const text = [
    `Your piece is on its way.`,
    ``,
    `${first}, your Mysterious Archive piece has left us${d.carrier ? ` with ${d.carrier}` : ""}.`,
    `Order ${d.reference}`,
    d.carrier ? `Carrier: ${d.carrier}` : ``,
    `Tracking number: ${d.tracking}`,
    d.trackUrl ? `Track your piece: ${d.trackUrl}` : ``,
    ``,
    ...d.pieces.map((p) => `${cleanTitle(p.title)} (${p.reference})`),
    ``,
    `Every order requires a signature on delivery.`,
    ``,
    `Mysterious Archive, New York. Reply to this email: ${ARCHIVE_REPLY}`,
  ]
    .filter(Boolean)
    .join("\n");
  return { subject: "Your piece is on its way", html: frame({ preheader: `Order ${d.reference} · tracking ${d.tracking}`, body }), text };
}

export interface ArchiveRefundData {
  first: string;
  reference: string;
  amountCents: number;
  currency: string;
  full: boolean;
}

export function archiveRefund(d: ArchiveRefundData): Mail {
  const first = d.first || "there";
  const amount = usd(d.amountCents, d.currency);
  const body = `${eyebrow(`Order ${d.reference}`)}
${headline("Your refund")}
${paragraph(`${esc(first)}, we have refunded <strong style="color:#171717">${esc(amount)}</strong> on order ${esc(d.reference)}${d.full ? "" : " (a partial refund)"}. It goes back to the card or account you paid with, and most banks show it within 5 to 10 business days.`)}
${button("Visit the archive", `${SITE}/archive`)}`;
  const text = [
    `${first}, we have refunded ${amount} on order ${d.reference}${d.full ? "" : " (a partial refund)"}.`,
    `It goes back to the card or account you paid with, and most banks show it within 5 to 10 business days.`,
    ``,
    `Mysterious Archive, New York. Reply to this email: ${ARCHIVE_REPLY}`,
  ].join("\n");
  return { subject: `Your Mysterious Archive refund · ${d.reference}`, html: frame({ preheader: `${amount} refunded on order ${d.reference}`, body }), text };
}

export interface ArchiveAbandonData {
  kind: "cart" | "checkout";
  first: string | null;
  pieces: ArchivePiece[];
  recoverUrl: string;
  unsubscribeUrl?: string | null;
  postalAddress?: string | null;
}

export function archiveAbandon(d: ArchiveAbandonData): Mail {
  const head = d.kind === "checkout" ? "One step from yours." : "Still yours to take.";
  const lead =
    d.kind === "checkout"
      ? "You were one step from making this piece yours. It is waiting in your bag."
      : "This piece is waiting in your bag. Every piece in the archive is one of a kind, so there is only ever one.";
  const body = `${eyebrow("Your bag")}
${headline(head)}
${paragraph(lead)}
${pieces(d.pieces)}
${button("Return to your bag", d.recoverUrl)}
${authBox()}`;
  const text = [
    head,
    ``,
    lead,
    ``,
    ...d.pieces.map((p) => `${cleanTitle(p.title)} (${p.reference}) — ${usd(p.totalCents)}`),
    ``,
    `Return to your bag: ${d.recoverUrl}`,
    ``,
    `Mysterious Archive, New York. Reply to this email: ${ARCHIVE_REPLY}`,
  ].join("\n");
  return {
    subject: d.kind === "checkout" ? `${d.first ? `${d.first}, ` : ""}your piece is waiting` : `${d.first ? `${d.first}, ` : ""}your piece is in your bag`,
    html: frame({ preheader: "One of each piece. Yours is waiting.", body, marketing: { unsubscribeUrl: d.unsubscribeUrl, postalAddress: d.postalAddress } }),
    text,
  };
}

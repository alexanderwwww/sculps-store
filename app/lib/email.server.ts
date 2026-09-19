/**
 * Transactional email, through Resend.
 *
 * Every message wears the store's own brand — its logo, its colour, its
 * name — because an email that looks like a generic receipt from nobody is
 * the thing a customer reports as spam. The look is built once in `shell()`
 * and every message uses it.
 *
 * Sending never throws into a checkout. A failed email is recorded on the
 * order timeline and the order stands — losing the sale because the mail
 * server hiccuped would be the worse outcome.
 */
import type { DB } from "~/db/client";
import { recordOrderEvent } from "./admin.server";
import { formatMoney } from "./money";

export interface EmailLine {
  label: string;
  quantity: number;
  lineTotalCents: number;
  /** The picture on the variant that was bought, so the line shows that. */
  imageUrl?: string | null;
}

/**
 * The store's own look, carried on every message. All optional: a store with
 * no logo and no colours still gets a clean, branded-by-name email rather
 * than a broken image.
 */
export interface BrandFields {
  domain?: string | null;
  logoUrl?: string | null;
  brandColor?: string | null;
  accentColor?: string | null;
  /**
   * The product, large, at the top of the message.
   *
   * Nobody knows this shop's logo and nobody opens an email to look at one.
   * They open it to see the thing they nearly bought. So the picture leads
   * and the wordmark sits at the bottom where a signature belongs.
   */
  heroImageUrl?: string | null;
}

export interface OrderEmailInput extends BrandFields {
  to: string;
  customerName: string;
  storeName: string;
  fromAddress: string | null;
  replyTo: string | null;
  orderNumber: number;
  currency: string;
  lines: EmailLine[];
  subtotalCents: number;
  taxCents: number;
  shippingCents: number;
  totalCents: number;
  /** the code used, and what it took off — so the receipt adds up */
  discountCode?: string | null;
  discountCents?: number;
  /**
   * The customer's own town, written under the tracking line: "on its way to
   * Oviedo, FL". The animation is one file for everyone; this is the part
   * that is theirs, and it costs a string rather than a render per order.
   */
  shipCity?: string | null;
  shipRegion?: string | null;
  /** "GB084107" — the reference the customer quotes, not the row number. */
  reference?: string | null;
  /** The standing thank-you code, in dollars. */
  giftCode?: string | null;
  giftLabel?: string | null;
}

/**
 * The reference a customer sees.
 *
 * Deliberately not the order number: sequential numbering tells anyone who
 * looks that they are the fourth person to ever buy. Two letters for the
 * store and six random digits reads like a real system and gives nothing
 * away. Uniqueness does not matter — the row id is the key, this is a label.
 */
export function orderReference(storeSlug: string, orderNumber: number): string {
  const prefix = storeSlug
    .split("-")
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2)
    .padEnd(2, "X");
  // Seeded off the order number so the same order always shows the same
  // reference, on the receipt, in the admin, and on a second send.
  let h = orderNumber * 2654435761;
  h = (h ^ (h >>> 15)) >>> 0;
  return `${prefix}${String(h % 1_000_000).padStart(6, "0")}`;
}

export function emailReady(env: Env): boolean {
  return Boolean(env.RESEND_API_KEY);
}

async function send(
  env: Env,
  message: { from: string; to: string; replyTo?: string | null; subject: string; html: string; text: string },
): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  if (!env.RESEND_API_KEY) {
    return { ok: false, reason: "No Resend API key is set on the Worker." };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: message.from,
        to: [message.to],
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });

    const payload = (await response.json()) as any;
    if (!response.ok) {
      return { ok: false, reason: payload?.message ?? `Resend refused it (${response.status}).` };
    }
    return { ok: true, id: payload.id };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "Unknown error." };
  }
}

/** Every customer-typed string goes through this before it touches HTML. */
export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Public tracking pages per carrier. Unknown carrier → no link, never a guess. */
export function trackingUrl(carrier: string | null, tracking: string): string | null {
  const number = encodeURIComponent(tracking.replace(/\s+/g, ""));
  switch ((carrier ?? "").toLowerCase()) {
    case "usps": return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${number}`;
    case "ups": return `https://www.ups.com/track?tracknum=${number}`;
    case "fedex": return `https://www.fedex.com/fedextrack/?trknbr=${number}`;
    case "dhl": return `https://www.dhl.com/en/express/tracking.html?AWB=${number}`;
    case "yunexpress": case "yun express": return `https://www.yuntrack.com/parcelTracking?id=${number}`;
    case "4px": return `https://track.4px.com/#/result/0/${number}`;
    case "china post": return `https://track-chinapost.com/result_china.php?order_no=${number}`;
    default: return null;
  }
}

/**
 * What a message needs to look like the store it came from.
 *
 * Absolute URLs everywhere: an email client has no origin to resolve `/media`
 * against, so a relative logo renders as a broken image in every inbox.
 */
export interface EmailBrand {
  storeName: string;
  /** the store's own domain, for absolute links and images */
  domain: string | null;
  logoUrl: string | null;
  brandColor: string | null;
  accentColor: string | null;
  heroImageUrl: string | null;
}

/**
 * The frame every message sits in.
 *
 * Inline styles only and tables for layout, because Outlook understands
 * nothing else. The product picture, when there is one, is the first thing
 * in the card and it runs edge to edge — no padding, no rounded inset, no
 * logo above it competing for the first second of attention.
 */
function shell(brand: EmailBrand, body: string, preheader = "", hero = true): string {
  const ink = brand.brandColor || "#16223A";
  const site = brand.domain ? `https://${brand.domain}` : null;
  const heroSrc = hero ? abs(brand, brand.heroImageUrl) : null;
  const logoSrc = abs(brand, brand.logoUrl);

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"></head>
<body style="margin:0;padding:0;background:#EFECE4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${ink};-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EFECE4">
<tr><td align="center" style="padding:24px 14px 36px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px">

<tr><td style="background:#FFFFFF;border-radius:20px;overflow:hidden;box-shadow:0 2px 10px rgba(22,34,58,.08)">
${
  heroSrc
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:0;font-size:0;line-height:0">
${site ? `<a href="${site}">` : ""}<img src="${esc(heroSrc)}" width="580" alt="${esc(brand.storeName)}" style="display:block;width:100%;max-width:580px;height:auto;border:0">${site ? `</a>` : ""}
</td></tr></table>`
    : ""
}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:30px 28px 32px">
${body}
</td></tr></table>
</td></tr>

<tr><td style="padding:22px 8px 0;text-align:center">
${
  logoSrc
    ? `${site ? `<a href="${site}">` : ""}<img src="${esc(logoSrc)}" height="26" alt="${esc(brand.storeName)}" style="display:block;height:26px;width:auto;border:0;margin:0 auto;opacity:.75">${site ? `</a>` : ""}`
    : `<div style="font-size:14px;font-weight:700;color:#8C8678">${esc(brand.storeName)}</div>`
}
<div style="margin-top:8px;color:#8C8678;font-size:12px;line-height:1.6">
You are receiving this because you shopped with us.
</div>
</td></tr>

</table></td></tr></table></body></html>`;
}

/** Every send function builds its brand the same way. */
function brandOf(input: BrandFields & { storeName: string }): EmailBrand {
  return {
    storeName: input.storeName,
    domain: input.domain ?? null,
    logoUrl: input.logoUrl ?? null,
    brandColor: input.brandColor ?? null,
    accentColor: input.accentColor ?? null,
    heroImageUrl: input.heroImageUrl ?? null,
  };
}

/** Absolute or nothing — an email client has no origin to resolve against. */
function abs(brand: EmailBrand, url: string | null | undefined): string | null {
  if (!url) return null;
  // Already absolute, or inlined. Only a site-relative path needs the origin
  // bolted on — prefixing anything else produced a broken image.
  if (/^(https?:|data:|cid:)/i.test(url)) return url;
  if (!brand.domain) return null;
  return `https://${brand.domain}${url.startsWith("/") ? "" : "/"}${url}`;
}

/** The one button shape every message uses. */
function button(label: string, href: string, accent: string): string {
  // Centred with an outer full-width table: `margin:auto` is ignored by
  // Outlook, and a bare table hugs the left edge, which is what this looked
  // like before.
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:26px 0 4px"><tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td align="center" style="background:${accent};border-radius:999px;box-shadow:0 6px 18px rgba(232,179,60,.35)">
<a href="${esc(href)}" style="display:inline-block;padding:17px 44px;font-size:16.5px;font-weight:800;letter-spacing:-.01em;color:#16223A;text-decoration:none">${esc(label)}</a>
</td></tr></table>
</td></tr></table>`;
}

function lineRows(lines: EmailLine[], currency: string): string {
  return lines
    .map(
      (line) =>
        `<tr><td style="padding:8px 0;font-size:15px">${esc(line.label)} × ${line.quantity}</td><td style="padding:8px 0;text-align:right;font-size:15px">${formatMoney(line.lineTotalCents, currency)}</td></tr>`,
    )
    .join("");
}

/**
 * The order confirmation.
 *
 * Never claims a delivery date. A dropshipped order has no reliable date at
 * this point, and inventing one is how a chargeback starts.
 */
export async function sendOrderConfirmation(
  db: DB,
  env: Env,
  orderId: string,
  input: OrderEmailInput,
): Promise<boolean> {
  const from = input.fromAddress || "orders@resend.dev";
  const subject = `${input.storeName} — order #${input.orderNumber} confirmed`;

  const text = [
    `Thanks ${input.customerName}.`,
    ``,
    `Your order #${input.orderNumber} is confirmed.`,
    ``,
    ...input.lines.map((line) => `${line.label} × ${line.quantity} — ${formatMoney(line.lineTotalCents, input.currency)}`),
    ``,
    `Subtotal ${formatMoney(input.subtotalCents, input.currency)}`,
    input.discountCode && input.discountCents
      ? `${input.discountCode} −${formatMoney(input.discountCents, input.currency)}`
      : ``,
    input.taxCents ? `Tax ${formatMoney(input.taxCents, input.currency)}` : ``,
    `Total ${formatMoney(input.totalCents, input.currency)}`,
    ``,
    `We will email you the tracking number as soon as it ships.`,
  ]
    .filter(Boolean)
    .join("\n");

  /**
   * Every URL in a message goes through abs().
   *
   * There used to be a `base` built by asking abs() to resolve an empty
   * path — and abs() answers null for an empty path, so it came out as ""
   * and the tracking image's src was site-relative. A browser resolves that
   * against the page it is on; an email has no page, so it never loaded.
   */
  const ref = input.reference ?? String(input.orderNumber);
  const city = [input.shipCity, input.shipRegion].filter(Boolean).join(", ");
  const first = (input.customerName || "").split(" ")[0] || "there";

  /* Three browns, not one. The page and footer sit on the darkest, the
     tracking strip on the mid, the thread on the near-black — a single brown
     everywhere reads as one flat slab. */
  const DARKEST = "#1A1006";
  const PANEL = "#3B2A1B";
  const CHAT = "#120B03";
  const LIME = "#A8F32A";
  const LIMEINK = "#12290C";
  const YELLOW = "#FFC72C";
  const YELLOWINK = "#2B1D08";
  const SAND = "#F4EEE2";

  const line = (l: EmailLine) => `<tr>
<td valign="top">
<div style="font-size:22px;font-weight:800;letter-spacing:-.03em;color:#1C2318">${esc(l.label)}</div>
<div style="margin-top:6px;font-size:14.5px;color:#5D6657">Qty ${l.quantity}</div>
</td>
<td valign="top" align="right" style="font-size:22px;font-weight:800;color:#1C2318;white-space:nowrap">${formatMoney(l.lineTotalCents, input.currency)}</td>
</tr>`;

  const bubbleThem = (t: string) => `<tr><td style="padding:0 0 9px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="background:#2C2C2E;border-radius:19px 19px 19px 5px;padding:11px 16px;font-size:15px;line-height:1.4;color:#fff;max-width:340px">${t}</td>
</tr></table></td></tr>`;
  const bubbleUs = (t: string) => `<tr><td align="right" style="padding:0 0 9px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="background:${LIME};border-radius:19px 19px 5px 19px;padding:11px 16px;font-size:15px;line-height:1.4;color:${LIMEINK};max-width:340px">${t}</td>
</tr></table></td></tr>`;

  /**
   * The email-sized copy of a picture.
   *
   * The storefront's own files are up to 2.3 MB, and a mail client will not
   * wait for that — iCloud rendered nothing at all. Every image here points
   * at `em-<name>.jpg`: 640px, flattened onto white, under 80 KB. If no copy
   * has been made the original is used, which is slow but not broken.
   */
  const emailCopy = (url: string | null | undefined): string | null => {
    if (!url) return null;
    const m = url.match(/^\/media\/([^/]+)\.(png|jpe?g|webp)$/i);
    return m ? `/media/em-${m[1]}.jpg` : url;
  };

  const hero = abs(brandOf(input), emailCopy(input.heroImageUrl));
  const logo = abs(brandOf(input), input.logoUrl);

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:${DARKEST};font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">Order ${ref} confirmed &mdash; ${formatMoney(input.totalCents, input.currency)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${DARKEST}"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:640px;max-width:100%">

${logo ? `<tr><td style="background:${DARKEST};padding:22px 0;text-align:center">
<img src="${logo}" width="168" alt="${esc(input.storeName)}" style="width:168px;height:auto;display:inline-block">
</td></tr>` : ""}

<tr><td style="background:${LIME};padding:40px 34px 36px;text-align:center">
<div style="font-size:11px;font-weight:800;letter-spacing:.22em;text-transform:uppercase;color:${LIMEINK};opacity:.6">Order received</div>
<div style="margin:14px 0 8px;font-size:40px;line-height:1.05;font-weight:800;letter-spacing:-.04em;color:${LIMEINK}">We&rsquo;ve got it, ${esc(first)}.</div>
<div style="font-size:16px;line-height:1.6;color:${LIMEINK};opacity:.72">Our team is packing your order right now.</div>
<div style="display:inline-block;margin-top:22px;padding:13px 26px;background:${DARKEST};border-radius:999px">
<span style="font-size:10.5px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:${YELLOW}">Order</span>
<span style="font-size:19px;font-weight:800;letter-spacing:.11em;color:#F6EEE2;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">&nbsp;&nbsp;${esc(ref)}</span>
</div>
</td></tr>

<tr><td style="background:${PANEL};padding:0;font-size:0;line-height:0">
<img src="${abs(brandOf(input), "/media/gb-email-line.gif") ?? ""}" width="640" alt="On its way" style="width:100%;max-width:640px;height:auto;display:block">
</td></tr>
${city ? `<tr><td style="background:${PANEL};padding:4px 34px 28px;text-align:center">
<div style="font-size:10.5px;font-weight:800;letter-spacing:.2em;text-transform:uppercase;color:${YELLOW}">On its way to</div>
<div style="margin-top:7px;font-size:26px;font-weight:800;letter-spacing:-.03em;color:#F6EEE2">${esc(city)}</div>
</td></tr>` : ""}

${hero ? `<tr><td style="background:${SAND};padding:0;font-size:0;line-height:0">
<img src="${hero}" width="640" alt="" style="width:100%;max-width:640px;height:auto;display:block">
</td></tr>` : ""}

<tr><td style="background:#ffffff;padding:30px 34px 6px">
<div style="font-size:10.5px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:#5C8C1E;margin-bottom:14px">Your order</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${input.lines.map(line).join('<tr><td colspan="2" style="height:14px"></td></tr>')}</table>
</td></tr>

<tr><td style="background:#ffffff;padding:14px 34px 32px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #E8E3D6">
<tr><td style="padding:16px 0 3px;font-size:14.5px;color:#5D6657">Subtotal</td><td style="padding:16px 0 3px;text-align:right;font-size:14.5px;color:#1C2318">${formatMoney(input.subtotalCents, input.currency)}</td></tr>
${input.discountCode && input.discountCents ? `<tr><td style="padding:3px 0;font-size:14.5px;font-weight:700;color:#5C8C1E">${esc(input.discountCode)}</td><td style="padding:3px 0;text-align:right;font-size:14.5px;font-weight:700;color:#5C8C1E">&minus;${formatMoney(input.discountCents, input.currency)}</td></tr>` : ""}
<tr><td style="padding:3px 0;font-size:14.5px;color:#5D6657">Shipping</td><td style="padding:3px 0;text-align:right;font-size:14.5px;font-weight:700;color:#5C8C1E">${input.shippingCents ? formatMoney(input.shippingCents, input.currency) : "Free"}</td></tr>
${input.taxCents ? `<tr><td style="padding:3px 0;font-size:14.5px;color:#5D6657">Tax</td><td style="padding:3px 0;text-align:right;font-size:14.5px;color:#1C2318">${formatMoney(input.taxCents, input.currency)}</td></tr>` : ""}
<tr><td style="padding:14px 0 0;font-size:21px;font-weight:800;color:#1C2318">Total</td><td style="padding:14px 0 0;text-align:right;font-size:21px;font-weight:800;color:#1C2318">${formatMoney(input.totalCents, input.currency)}</td></tr>
</table>
</td></tr>

<tr><td style="background:${CHAT};padding:30px 34px 26px">
<div style="font-size:10.5px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:${YELLOW};text-align:center;margin-bottom:22px">Questions? Just reply</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${bubbleUs("just ordered 🙌 how long till it gets here?")}
${bubbleThem("1&ndash;2 days to leave us, then your tracking lands by email.")}
${bubbleUs("perfect")}
${bubbleThem("that&rsquo;s the idea. shout if you need anything.")}
</table>
</td></tr>

${input.giftCode ? `<tr><td style="background:#ECFCD2;padding:36px 34px;text-align:center">
<div style="font-size:10.5px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:#5C8C1E">A thank you</div>
<div style="margin:12px 0 6px;font-size:32px;font-weight:800;letter-spacing:-.035em;color:${LIMEINK}">${esc(input.giftLabel ?? "$10 off your next one.")}</div>
<div style="font-size:15px;line-height:1.6;color:#4A5544">No minimum, no expiry. Use it whenever you like.</div>
<div style="display:inline-block;margin-top:20px;padding:16px 38px;background:${YELLOW};border-radius:16px">
<span style="font-size:25px;font-weight:800;letter-spacing:.2em;color:${YELLOWINK};font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${esc(input.giftCode)}</span>
</div>
</td></tr>` : ""}

<tr><td style="background:${SAND};padding:26px 20px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td width="33%" style="text-align:center;font-size:12.5px;line-height:1.5;color:#5D6657"><strong style="display:block;color:#1C2318;font-size:13.5px;margin-bottom:2px">Free shipping</strong>already included</td>
<td width="33%" style="text-align:center;font-size:12.5px;line-height:1.5;color:#5D6657"><strong style="display:block;color:#1C2318;font-size:13.5px;margin-bottom:2px">30-day returns</strong>no questions</td>
<td width="33%" style="text-align:center;font-size:12.5px;line-height:1.5;color:#5D6657"><strong style="display:block;color:#1C2318;font-size:13.5px;margin-bottom:2px">Real people</strong>reply to this email</td>
</tr></table>
</td></tr>

<tr><td style="background:${DARKEST};padding:34px 34px 28px;text-align:center">
${logo ? `<img src="${logo}" width="128" alt="" style="width:128px;height:auto;display:inline-block;margin-bottom:14px">` : ""}
<div style="font-size:13.5px;line-height:1.7;color:#F6EEE2;opacity:.7">
Questions? Just reply &mdash; a person reads it.<br>
<span style="color:#F6EEE2;font-weight:700;opacity:1">${esc(input.storeName)}</span>${input.domain ? ` &middot; ${esc(input.domain)}` : ""}
</div>
</td></tr>

</table></td></tr></table></body></html>`;

  const result = await send(env, {
    from: `${input.storeName} <${from}>`,
    to: input.to,
    replyTo: input.replyTo,
    subject,
    html,
    text,
  });

  await recordOrderEvent(
    db,
    orderId,
    result.ok ? "email:confirmation" : "email:failed",
    result.ok
      ? `Order confirmation sent to ${input.to}`
      : `Order confirmation could NOT be sent to ${input.to} · ${result.reason}`,
    result.ok ? { id: result.id } : { reason: result.reason },
  );

  return result.ok;
}

export async function sendShippingNotice(
  db: DB,
  env: Env,
  orderId: string,
  input: BrandFields & {
    to: string;
    customerName: string;
    storeName: string;
    fromAddress: string | null;
    replyTo: string | null;
    orderNumber: number;
    tracking: string;
    carrier: string | null;
  },
): Promise<boolean> {
  const from = input.fromAddress || "orders@resend.dev";
  const carrier = input.carrier ? ` with ${input.carrier}` : "";
  const link = trackingUrl(input.carrier, input.tracking);

  const text = [
    `Good news ${input.customerName} — order #${input.orderNumber} is on its way.`,
    ``,
    `Tracking${carrier}: ${input.tracking}`,
    link ? `Track it: ${link}` : ``,
  ]
    .filter(Boolean)
    .join("\n");

  const accent = input.accentColor || "#E8B33C";
  const ink = input.brandColor || "#16223A";
  const html = shell(
    brandOf(input),
    `<div style="text-align:center;margin:0 0 22px">
<div style="font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:${accent}">On its way</div>
<h1 style="margin:10px 0 8px;font-size:28px;line-height:1.14;font-weight:800;letter-spacing:-.03em;color:${ink}">It shipped, ${esc(input.customerName)}.</h1>
<p style="margin:0;font-size:15.5px;color:#6E7480">Order <strong style="color:${ink}">#${input.orderNumber}</strong> is on its way${esc(carrier)}.</p>
</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${ink};border-radius:14px">
<tr><td style="padding:20px 16px;text-align:center">
<div style="font-size:11px;font-weight:800;letter-spacing:.12em;color:${accent};text-transform:uppercase">Tracking number</div>
<div style="margin-top:8px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:18px;font-weight:800;letter-spacing:.04em;color:#ffffff;word-break:break-all">${esc(input.tracking)}</div>
</td></tr></table>
${link ? button("Track your parcel", link, accent) : ""}
<p style="margin:22px 0 0;font-size:13px;line-height:1.6;color:#8C8678;text-align:center">Tracking can take a day or two to start updating after the first scan. That is normal.</p>`,
    `Order #${input.orderNumber} has shipped — tracking ${input.tracking}`,
    false,
  );

  const result = await send(env, {
    from: `${input.storeName} <${from}>`,
    to: input.to,
    replyTo: input.replyTo,
    subject: `${input.storeName} — order #${input.orderNumber} has shipped`,
    html,
    text,
  });

  await recordOrderEvent(
    db,
    orderId,
    result.ok ? "email:shipping" : "email:failed",
    result.ok
      ? `Shipping confirmation sent to ${input.to}`
      : `Shipping confirmation could NOT be sent to ${input.to} · ${result.reason}`,
    result.ok ? { id: result.id } : { reason: result.reason },
  );

  return result.ok;
}

/** The one that goes to him: a sale happened. Short, and it links to the order. */
export async function sendMerchantNewOrder(
  db: DB,
  env: Env,
  orderId: string,
  input: BrandFields & {
    to: string;
    storeName: string;
    orderNumber: number;
    customerName: string;
    email: string;
    phone: string | null;
    address: string;
    paymentMethod: string;
    placedAt: Date;
    totalCents: number;
    currency: string;
    lines: EmailLine[];
    adminUrl: string;
    fromAddress: string | null;
  },
): Promise<boolean> {
  const subject = `[${input.storeName}] New order #${input.orderNumber} · ${formatMoney(input.totalCents, input.currency)}`;
  const when = input.placedAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  const text = [
    `New order #${input.orderNumber} on ${input.storeName} · ${when}`,
    ``,
    `${input.customerName}`,
    input.email,
    input.phone ?? "",
    input.address,
    ``,
    ...input.lines.map((line) => `${line.label} × ${line.quantity} — ${formatMoney(line.lineTotalCents, input.currency)}`),
    `Total ${formatMoney(input.totalCents, input.currency)} · ${input.paymentMethod}`,
    ``,
    `Open it: ${input.adminUrl}`,
  ]
    .filter((line) => line !== "")
    .join("\n");

  const html = shell(
    brandOf(input),
    `<p style="font-size:16px;margin:0 0 4px">New order <strong>#${input.orderNumber}</strong> · <strong>${formatMoney(input.totalCents, input.currency)}</strong></p>
<p style="font-size:13px;color:#888;margin:0 0 14px">${esc(when)} · ${esc(input.paymentMethod)}</p>
<p style="font-size:15px;margin:0 0 2px"><strong>${esc(input.customerName)}</strong></p>
<p style="font-size:14px;color:#555;margin:0 0 2px">${esc(input.email)}${input.phone ? ` · ${esc(input.phone)}` : ""}</p>
<p style="font-size:14px;color:#555;margin:0 0 16px">${esc(input.address)}</p>
<table style="width:100%;border-collapse:collapse;border-top:1px solid #eee">${lineRows(input.lines, input.currency)}</table>
<a href="${esc(input.adminUrl)}" style="display:inline-block;margin-top:16px;background:#1A1A1A;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600">Open the order</a>`,
    `New order #${input.orderNumber} · ${formatMoney(input.totalCents, input.currency)}`,
  );

  const result = await send(env, {
    from: `${input.storeName} <${input.fromAddress || "orders@resend.dev"}>`,
    to: input.to,
    subject,
    html,
    text,
  });

  await recordOrderEvent(
    db,
    orderId,
    result.ok ? "email:merchant" : "email:failed",
    result.ok ? `You were emailed about this order at ${input.to}` : `Could not email you about this order · ${result.reason}`,
    result.ok ? { id: result.id } : { reason: result.reason },
  );
  return result.ok;
}

/** Tells the customer their money is on the way back. Not sending this is how a refund turns into a chargeback anyway. */
export async function sendRefundNotice(
  db: DB,
  env: Env,
  orderId: string,
  input: BrandFields & {
    to: string;
    customerName: string;
    storeName: string;
    fromAddress: string | null;
    replyTo: string | null;
    orderNumber: number;
    amountCents: number;
    currency: string;
    full: boolean;
  },
): Promise<boolean> {
  const amount = formatMoney(input.amountCents, input.currency);
  const text = [
    `Hi ${input.customerName},`,
    ``,
    `We have refunded ${amount} on order #${input.orderNumber}${input.full ? "" : " (a partial refund)"}.`,
    `It usually shows on your card within 5–10 business days, depending on your bank.`,
  ].join("\n");

  const html = shell(
    brandOf(input),
    `<h1 style="margin:0 0 14px;font-size:21px;font-weight:800;letter-spacing:-.02em">Your refund is on its way</h1>
<p style="margin:0 0 14px;font-size:15px;line-height:1.6">Hi ${esc(input.customerName)}, we have refunded <strong>${amount}</strong> on order <strong>#${input.orderNumber}</strong>${input.full ? "" : " (a partial refund)"}.</p>
<p style="margin:0;padding:14px 16px;background:#FAF8F3;border-radius:12px;font-size:14px;line-height:1.6;color:#6B6559">It usually shows on your card within 5&ndash;10 business days, depending on your bank. Nothing else is needed from you.</p>`,
    `Refund of ${amount} on order #${input.orderNumber}`,
  );

  const result = await send(env, {
    from: `${input.storeName} <${input.fromAddress || "orders@resend.dev"}>`,
    to: input.to,
    replyTo: input.replyTo,
    subject: `${input.storeName} — refund of ${amount} on order #${input.orderNumber}`,
    html,
    text,
  });

  await recordOrderEvent(
    db,
    orderId,
    result.ok ? "email:refund" : "email:failed",
    result.ok ? `Refund email sent to ${input.to}` : `Refund email could NOT be sent to ${input.to} · ${result.reason}`,
    result.ok ? { id: result.id } : { reason: result.reason },
  );
  return result.ok;
}


/* ------------------------------------------------------------ recovery --
   The two messages that go to someone who did not finish. They are the only
   emails here that are trying to win something back rather than reassure,
   so they are short, they lead with the thing she picked, and they never
   pretend to be a receipt. One send per cart, ever — a second one is spam
   and she will mark it as such, which costs every future email its inbox. */

export interface AbandonInput extends BrandFields {
  to: string;
  customerName: string | null;
  storeName: string;
  fromAddress: string | null;
  replyTo: string | null;
  currency: string;
  lines: EmailLine[];
  totalCents: number;
  /** the link that puts the cart back exactly as she left it */
  recoverUrl: string;
  /** only on the checkout one — a cart abandon gets no discount */
  discountCode?: string | null;
  /** The saving, in cents. Dollars only — this shop never says "%". */
  discountOffCents?: number | null;
  /** the hero image of what she left, absolute URL */
  imageUrl?: string | null;
}

/**
 * How long is left to have it for the night itself.
 *
 * Shipping has to land before the 31st to be worth anything, so the cut-off
 * is the 20th — and the sentence changes shape as it closes, because "11
 * days left" and "last day" are different arguments. Outside the season it
 * returns nothing and the email simply does not carry the line.
 */
function seasonalDeadline(now = new Date()): string | null {
  const year = now.getUTCFullYear();
  const cutoff = Date.UTC(year, 9, 20, 23, 59, 59); // 20 October
  const opens = Date.UTC(year, 8, 1); // 1 September
  const t = now.getTime();
  if (t < opens || t > cutoff) return null;

  const days = Math.ceil((cutoff - t) / 86_400_000);
  if (days <= 1) return "Last day to order for Halloween";
  if (days <= 3) return `${days} days left to order for Halloween`;
  if (days <= 10) return `Order within ${days} days to have it for Halloween`;
  return "Order by October 20 to have it for Halloween";
}

function abandonedBody(
  input: BrandFields & {
    storeName: string;
    currency: string;
    kind: "cart" | "checkout";
    customerName: string | null;
    lines: EmailLine[];
    totalCents: number;
    recoverUrl: string;
    discountCode?: string | null;
    /** The saving, in cents. Dollars only — this shop never says "%". */
  discountOffCents?: number | null;
    imageUrl?: string | null;
  },
): string {
  const brand = brandOf({ ...input, heroImageUrl: input.imageUrl ?? input.heroImageUrl });
  const accent = input.accentColor || "#E8B33C";
  const ink = input.brandColor || "#16223A";
  const heading = input.kind === "checkout" ? "You were one tap away." : "It's still in your cart.";
  const lead =
    input.kind === "checkout"
      ? "You got all the way to payment and stopped. Nothing is lost — everything is exactly where you left it."
      : "We saved it for you. One tap and it's yours.";

  /*
   * The deadline, when there is one.
   *
   * A recovery email's real job is answering "why now", and for a seasonal
   * product the honest answer is a date rather than a discount: nobody wants
   * a lawn decoration in November. The line only appears while it is true —
   * after the cut-off it says nothing rather than something false, because a
   * shop that keeps promising a date it has missed is a shop nobody believes
   * the second time.
   */
  const deadline = seasonalDeadline();

  return shell(
    brand,
    `<div style="text-align:center">
<div style="font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:${accent}">
${input.kind === "checkout" ? "Almost yours" : "Still waiting"}
</div>
<h1 style="margin:10px 0 10px;font-size:30px;line-height:1.12;font-weight:800;letter-spacing:-.03em;color:${ink}">${heading}</h1>
<p style="margin:0 0 ${deadline ? "18px" : "24px"};font-size:15.5px;line-height:1.6;color:#6E7480">${lead}</p>
${
  deadline
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px"><tr><td style="background:#0B0B0C;border-radius:999px;padding:9px 18px">
<span style="font-size:13px;font-weight:800;letter-spacing:.02em;color:#D6FF4F">${esc(deadline)}</span>
</td></tr></table>`
    : ""
}
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F5F0;border-radius:14px">
<tr><td style="padding:18px 20px">
${input.lines
  .map(
    (line) =>
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="font-size:16px;font-weight:700;line-height:1.4;color:${ink}">${esc(line.label)}</td>
<td width="90" style="text-align:right;font-size:16px;font-weight:800;white-space:nowrap;color:${ink}">${formatMoney(line.lineTotalCents, input.currency)}</td>
</tr></table>`,
  )
  .join('<div style="height:1px;background:#E6E1D6;margin:12px 0"></div>')}
<div style="height:1px;background:#E6E1D6;margin:14px 0"></div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="font-size:13px;color:#8C8678;font-weight:600">Free shipping included</td>
<td style="text-align:right;font-size:13px;color:#8C8678">Total <strong style="color:${ink};font-size:15px">${formatMoney(input.totalCents, input.currency)}</strong></td>
</tr></table>
</td></tr></table>

${
  input.discountCode && input.discountOffCents
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px"><tr>
<td style="padding:18px;background:${ink};border-radius:14px;text-align:center">
<div style="font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${accent}">Take $${((input.discountOffCents ?? 0) / 100).toFixed(0)} off</div>
<div style="margin-top:8px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:26px;font-weight:800;letter-spacing:.08em;color:#ffffff">${esc(input.discountCode)}</div>
<div style="margin-top:6px;font-size:12px;color:#A9B0BE">Applied automatically when you tap below</div>
</td></tr></table>`
    : ""
}

${button(input.kind === "checkout" ? "Finish my order" : "Take me back to it", input.recoverUrl, accent)}

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:26px;border-top:1px solid #EEEAE0">
<tr>
<td width="33%" style="padding:18px 6px 0;text-align:center;font-size:12px;line-height:1.5;color:#6E7480"><strong style="display:block;color:${ink};font-size:13px">Free shipping</strong>on every order</td>
<td width="33%" style="padding:18px 6px 0;text-align:center;font-size:12px;line-height:1.5;color:#6E7480"><strong style="display:block;color:${ink};font-size:13px">30-day returns</strong>no questions</td>
<td width="33%" style="padding:18px 6px 0;text-align:center;font-size:12px;line-height:1.5;color:#6E7480"><strong style="display:block;color:${ink};font-size:13px">Secure checkout</strong>Apple&nbsp;Pay &amp; card</td>
</tr></table>

<p style="margin:22px 0 0;font-size:12px;line-height:1.6;color:#A3A79E;text-align:center">
This is the only reminder we send. Changed your mind? Ignore it and we will leave you alone.
</p>`,
    input.kind === "checkout"
      ? `Your order is one tap from done${input.discountCode ? ` — and here is $${((input.discountOffCents ?? 0) / 100).toFixed(0)} off` : ""}`
      : "Your cart is still saved",
  );
}

/**
 * One recovery email. `kind` decides the words; everything else is the same.
 *
 * Returns false and says why rather than throwing — this runs on a schedule
 * with nobody watching, and a thrown error there is invisible.
 */
export async function sendAbandonEmail(
  env: Env,
  kind: "cart" | "checkout",
  input: AbandonInput,
): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const from = input.fromAddress || "orders@resend.dev";
  const name = input.customerName ? `${input.customerName}, ` : "";
  const subject =
    kind === "checkout"
      ? `${name}your order is one tap from done`
      : `${name}you left something in your cart`;

  const text = [
    input.customerName ? `Hi ${input.customerName},` : `Hi,`,
    ``,
    kind === "checkout"
      ? `You got as far as the checkout and stopped. Your cart is still saved.`
      : `You left this in your cart and we have kept it for you.`,
    ``,
    ...input.lines.map(
      (line) => `${line.label} x ${line.quantity} — ${formatMoney(line.lineTotalCents, input.currency)}`,
    ),
    ``,
    input.discountCode && input.discountOffCents
      ? `Use ${input.discountCode} for $${((input.discountOffCents ?? 0) / 100).toFixed(0)} off.`
      : ``,
    `Pick it up here: ${input.recoverUrl}`,
    ``,
    `Only one of these is ever sent.`,
  ]
    .filter(Boolean)
    .join("\n");

  return send(env, {
    from: `${input.storeName} <${from}>`,
    to: input.to,
    replyTo: input.replyTo,
    subject,
    html: abandonedBody({ ...input, kind }),
    text,
  });
}

/** The templates with example values, for Settings → Preview. Nothing is sent. */
export function previewEmail(
  kind: string,
  input: { storeName: string; currency: string } & BrandFields,
): string {
  const brand = brandOf(input);
  const accent = input.accentColor || "#E8B33C";
  const ink = input.brandColor || "#16223A";
  const lines: EmailLine[] = [
    { label: "Garden Buddy + Tool Set", quantity: 1, lineTotalCents: 9999 },
  ];

  if (kind === "shipping") {
    const link = trackingUrl("USPS", "9400100000000000000000");
    return shell(
      brand,
      `<div style="text-align:center;margin:0 0 22px">
<div style="font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:${accent}">On its way</div>
<h1 style="margin:10px 0 8px;font-size:28px;line-height:1.14;font-weight:800;letter-spacing:-.03em;color:${ink}">It shipped, Alex.</h1>
<p style="margin:0;font-size:15.5px;color:#6E7480">Order <strong style="color:${ink}">#1001</strong> is on its way with USPS.</p>
</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${ink};border-radius:14px">
<tr><td style="padding:20px 16px;text-align:center">
<div style="font-size:11px;font-weight:800;letter-spacing:.12em;color:${accent};text-transform:uppercase">Tracking number</div>
<div style="margin-top:8px;font-family:ui-monospace,monospace;font-size:18px;font-weight:800;letter-spacing:.04em;color:#fff">9400 1000 0000 0000 0000 00</div>
</td></tr></table>
${link ? button("Track my parcel", link, accent) : ""}`,
      "",
      false,
    );
  }

  if (kind === "refund") {
    return shell(
      brand,
      `<h1 style="margin:0 0 12px;font-size:26px;font-weight:800;letter-spacing:-.03em;color:${ink}">Your refund is on its way</h1>
<p style="margin:0 0 16px;font-size:15.5px;line-height:1.6;color:#6E7480">Hi Alex, we have refunded <strong style="color:${ink}">${formatMoney(9999, input.currency)}</strong> on order <strong style="color:${ink}">#1001</strong>.</p>
<p style="margin:0;padding:16px 18px;background:#F7F5F0;border-radius:14px;font-size:14px;line-height:1.65;color:#6E7480">It usually shows on your card within 5&ndash;10 business days. Nothing else is needed from you.</p>`,
      "",
      false,
    );
  }

  if (kind === "abandoned_cart" || kind === "abandoned_checkout") {
    return abandonedBody({
      ...input,
      kind: kind === "abandoned_cart" ? "cart" : "checkout",
      customerName: "Alex",
      lines,
      totalCents: 9999,
      recoverUrl: input.domain ? `https://${input.domain}/` : "#",
      // Preview only. The real send reads the shop's live code out of the
      // database — a hardcoded one errors at checkout, which is worse than
      // sending no code at all.
      discountCode: null,
      discountOffCents: null,
    });
  }

  return shell(
    brand,
    `<div style="text-align:center">
<div style="font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:${accent}">Order confirmed</div>
<h1 style="margin:10px 0 8px;font-size:30px;line-height:1.12;font-weight:800;letter-spacing:-.03em;color:${ink}">It's yours, Alex.</h1>
<p style="margin:0 0 26px;font-size:15.5px;line-height:1.6;color:#6E7480">Order <strong style="color:${ink}">#1001</strong> is paid and we are packing it now.</p>
</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F5F0;border-radius:14px">
<tr><td style="padding:18px 20px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="font-size:15.5px;font-weight:700;color:${ink}">Garden Buddy + Tool Set<span style="color:#8C8678;font-weight:600"> &times;1</span></td>
<td width="90" style="text-align:right;font-size:15.5px;font-weight:700;color:${ink}">${formatMoney(9999, input.currency)}</td>
</tr></table>
<div style="height:1px;background:#E6E1D6;margin:14px 0"></div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding:3px 0;color:#6E7480;font-size:14px">Subtotal</td><td style="padding:3px 0;text-align:right;font-size:14px">${formatMoney(9999, input.currency)}</td></tr>
<tr><td style="padding:3px 0;color:#6E7480;font-size:14px">Shipping</td><td style="padding:3px 0;text-align:right;font-size:14px;font-weight:700;color:#2F8A4C">Free</td></tr>
<tr><td style="padding:12px 0 0;font-weight:800;font-size:18px;color:${ink}">Total</td><td style="padding:12px 0 0;text-align:right;font-weight:800;font-size:18px;color:${ink}">${formatMoney(9999, input.currency)}</td></tr>
</table>
</td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;background:${ink};border-radius:14px">
<tr><td style="padding:20px 22px">
<div style="font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:${accent}">What happens next</div>
<div style="margin-top:8px;font-size:14.5px;line-height:1.65;color:#E7EAF0">We pack it, then we email you a tracking number the moment it leaves. Just reply to this email if anything comes up.</div>
</td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;border-top:1px solid #EEEAE0">
<tr>
<td width="33%" style="padding:18px 6px 0;text-align:center;font-size:12px;line-height:1.5;color:#6E7480"><strong style="display:block;color:${ink};font-size:13px">Free shipping</strong>already included</td>
<td width="33%" style="padding:18px 6px 0;text-align:center;font-size:12px;line-height:1.5;color:#6E7480"><strong style="display:block;color:${ink};font-size:13px">30-day returns</strong>no questions</td>
<td width="33%" style="padding:18px 6px 0;text-align:center;font-size:12px;line-height:1.5;color:#6E7480"><strong style="display:block;color:${ink};font-size:13px">Real people</strong>reply to this email</td>
</tr></table>`,
  );
}

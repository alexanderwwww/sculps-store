/**
 * Transactional email, through Resend.
 *
 * Two messages only: the order confirmation and the shipping notification.
 * Both are plain and short, because the job is to reassure someone who has
 * just spent money, not to market at them.
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
}

export interface OrderEmailInput {
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

function shell(storeName: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f6f6f6;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#242424">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">
<div style="font-size:18px;font-weight:700;margin-bottom:18px">${esc(storeName)}</div>
${body}
</div>
<div style="max-width:560px;margin:14px auto 0;color:#8a8a8a;font-size:12px;text-align:center">${esc(storeName)}</div>
</body></html>`;
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
    input.taxCents ? `Tax ${formatMoney(input.taxCents, input.currency)}` : ``,
    `Total ${formatMoney(input.totalCents, input.currency)}`,
    ``,
    `We will email you the tracking number as soon as it ships.`,
  ]
    .filter(Boolean)
    .join("\n");

  const html = shell(
    input.storeName,
    `<p style="font-size:16px;margin:0 0 12px">Thanks ${esc(input.customerName)}.</p>
<p style="font-size:16px;margin:0 0 18px">Your order <strong>#${input.orderNumber}</strong> is confirmed.</p>
<table style="width:100%;border-collapse:collapse;border-top:1px solid #eee">${lineRows(input.lines, input.currency)}</table>
<table style="width:100%;border-collapse:collapse;border-top:1px solid #eee;margin-top:8px">
<tr><td style="padding:6px 0;color:#666">Subtotal</td><td style="padding:6px 0;text-align:right">${formatMoney(input.subtotalCents, input.currency)}</td></tr>
${input.taxCents ? `<tr><td style="padding:6px 0;color:#666">Tax</td><td style="padding:6px 0;text-align:right">${formatMoney(input.taxCents, input.currency)}</td></tr>` : ""}
<tr><td style="padding:6px 0;font-weight:700">Total</td><td style="padding:6px 0;text-align:right;font-weight:700">${formatMoney(input.totalCents, input.currency)}</td></tr>
</table>
<p style="font-size:15px;color:#555;margin:20px 0 0">We will email you the tracking number as soon as it ships.</p>`,
  );

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
  input: {
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

  const html = shell(
    input.storeName,
    `<p style="font-size:16px;margin:0 0 12px">Good news ${esc(input.customerName)} — order <strong>#${input.orderNumber}</strong> is on its way.</p>
<p style="font-size:16px;margin:0 0 16px">Tracking${esc(carrier)}:<br><strong style="font-family:ui-monospace,monospace">${esc(input.tracking)}</strong></p>
${link ? `<a href="${esc(link)}" style="display:inline-block;background:#1A1A1A;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600">Track your parcel</a>` : ""}`,
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
  input: {
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
    input.storeName,
    `<p style="font-size:16px;margin:0 0 4px">New order <strong>#${input.orderNumber}</strong> · <strong>${formatMoney(input.totalCents, input.currency)}</strong></p>
<p style="font-size:13px;color:#888;margin:0 0 14px">${esc(when)} · ${esc(input.paymentMethod)}</p>
<p style="font-size:15px;margin:0 0 2px"><strong>${esc(input.customerName)}</strong></p>
<p style="font-size:14px;color:#555;margin:0 0 2px">${esc(input.email)}${input.phone ? ` · ${esc(input.phone)}` : ""}</p>
<p style="font-size:14px;color:#555;margin:0 0 16px">${esc(input.address)}</p>
<table style="width:100%;border-collapse:collapse;border-top:1px solid #eee">${lineRows(input.lines, input.currency)}</table>
<a href="${esc(input.adminUrl)}" style="display:inline-block;margin-top:16px;background:#1A1A1A;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600">Open the order</a>`,
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
  input: {
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
    input.storeName,
    `<p style="font-size:16px;margin:0 0 12px">Hi ${esc(input.customerName)},</p>
<p style="font-size:16px;margin:0 0 12px">We have refunded <strong>${amount}</strong> on order <strong>#${input.orderNumber}</strong>${input.full ? "" : " (a partial refund)"}.</p>
<p style="font-size:15px;color:#555;margin:0">It usually shows on your card within 5–10 business days, depending on your bank.</p>`,
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

/** The three templates with example values, for Settings → Preview. Nothing is sent. */
export function previewEmail(kind: string, input: { storeName: string; currency: string }): string {
  const lines: EmailLine[] = [{ label: "Example bundle × 1", quantity: 1, lineTotalCents: 12900 }];
  if (kind === "shipping") {
    const link = trackingUrl("USPS", "9400100000000000000000");
    return shell(
      input.storeName,
      `<p style="font-size:16px;margin:0 0 12px">Good news Alex — order <strong>#1001</strong> is on its way.</p>
<p style="font-size:16px;margin:0 0 16px">Tracking with USPS:<br><strong style="font-family:ui-monospace,monospace">9400 1000 0000 0000 0000 00</strong></p>
<a href="${esc(link ?? "#")}" style="display:inline-block;background:#1A1A1A;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600">Track your parcel</a>`,
    );
  }
  if (kind === "refund") {
    return shell(
      input.storeName,
      `<p style="font-size:16px;margin:0 0 12px">Hi Alex,</p>
<p style="font-size:16px;margin:0 0 12px">We have refunded <strong>${formatMoney(12900, input.currency)}</strong> on order <strong>#1001</strong>.</p>
<p style="font-size:15px;color:#555;margin:0">It usually shows on your card within 5–10 business days, depending on your bank.</p>`,
    );
  }
  return shell(
    input.storeName,
    `<p style="font-size:16px;margin:0 0 12px">Thanks Alex.</p>
<p style="font-size:16px;margin:0 0 18px">Your order <strong>#1001</strong> is confirmed.</p>
<table style="width:100%;border-collapse:collapse;border-top:1px solid #eee">${lineRows(lines, input.currency)}</table>
<table style="width:100%;border-collapse:collapse;border-top:1px solid #eee;margin-top:8px">
<tr><td style="padding:6px 0;color:#666">Subtotal</td><td style="padding:6px 0;text-align:right">${formatMoney(12900, input.currency)}</td></tr>
<tr><td style="padding:6px 0;font-weight:700">Total</td><td style="padding:6px 0;text-align:right;font-weight:700">${formatMoney(12900, input.currency)}</td></tr>
</table>
<p style="font-size:15px;color:#555;margin:20px 0 0">We will email you the tracking number as soon as it ships.</p>`,
  );
}

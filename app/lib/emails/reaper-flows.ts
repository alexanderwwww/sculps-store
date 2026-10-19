/**
 * Black Reaper's automated emails, in the receipt's look (./reaper-receipt.ts):
 * near-black ground, bone type, one orange, the logo, the product's own JPG.
 *
 *   cart       ~1h after a cart with an email was left (never reached payment)
 *   checkout   ~1h after a checkout was left at payment
 *   comeback   ~24h after the first one: $20 off, applied by the link
 *   shipped    when a tracking number is added in the admin
 *   delivered  the setup guide, from the existing aftercare timing
 *   review     a few nights after that
 *
 * Copy rules (AGENTS.md section 1): confident, sells the night, never a date,
 * a delay, a refund or an apology. Product facts come only from
 * ./reaper-products.ts, which is written from the product pages.
 *
 * Pure functions: no database, no sending. recovery.server.ts, aftercare.server.ts
 * and email.server.ts send what these return, and scripts/preview-reaper-emails
 * renders every one to a file so Alex sees them before anything goes out.
 */
import { reaperProduct } from "./reaper-products";

const C = { bg: "#0A0A0A", card: "#121212", bone: "#F3EEE6", meta: "#8D8A84", rule: "#26231F", orange: "#F5821F", body: "#CFCAC1" };
const F = "Archivo,'Helvetica Neue',Arial,sans-serif";
const B = "Inter,'Helvetica Neue',Arial,sans-serif";

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export interface ReaperEmail {
  subject: string;
  preheader: string;
  html: string;
  text: string;
}

/** The night each product sells. One line, the dream, never a spec sheet. */
const DREAM: Record<string, { short: string; line: string; hero: string }> = {
  "the-scream": {
    short: "The 16 ft Scream",
    line: "Sixteen feet of him over the lawn, lit from inside. Cars slow down. The whole street stops to film your house.",
    hero: "em-scr-hero.jpg",
  },
  "haunted-projector": {
    short: "The Ghost Projector",
    line: "One plug, and the whole house is haunted. Moving scenes across the garage, colour pouring over the walls. Your house is the one everyone films.",
    hero: "gp-gem-01-01.jpg",
  },
};

function dreamFor(handle: string | null) {
  return (handle && DREAM[handle]) || {
    short: reaperProduct(handle)?.name ?? "Your order",
    line: "The house the whole street stops for.",
    hero: "em-scr-hero.jpg",
  };
}

export interface FlowLine {
  label: string;
  quantity: number;
  lineTotalCents: number;
}

interface Base {
  domain: string;
  first?: string | null;
  handle: string | null;
  money: (cents: number, currency: string) => string;
  currency: string;
  /** marketing emails carry it; order emails do not */
  unsubscribeUrl?: string | null;
  postalAddress?: string | null;
}

/* ------------------------------------------------------------------ parts */

function frame(i: Base, body: string, preheader: string, hero: string | null): string {
  const site = `https://${i.domain}`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark">
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@700;800&family=Inter:wght@400;600&display=swap" rel="stylesheet"></head>
<body style="margin:0;background:${C.bg}"><div style="display:none;max-height:0;overflow:hidden">${esc(preheader)}</div>
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.bg}"><tr><td align="center" style="padding:0 0 40px">
<table width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px">
<tr><td align="center" style="padding:26px 32px 20px"><a href="${site}"><img src="${site}/media/em-br-logo.png" alt="BLACK REAPER" width="150" style="display:block;border:0;height:auto"></a></td></tr>
${hero ? `<tr><td style="padding:0;font-size:0;line-height:0;background:#000"><a href="${site}"><img src="${site}/media/${hero}" width="600" alt="" style="display:block;width:100%;max-width:600px;height:auto;border:0"></a></td></tr>` : ""}
${body}
<tr><td align="center" style="padding:30px 32px 0"><div style="font:800 12px ${F};letter-spacing:.22em;color:${C.meta}">BLACK REAPER</div>
<div style="margin-top:8px;font:12px/1.7 ${B};color:${C.meta}">Free shipping &middot; <a href="${site}" style="color:${C.meta}">${esc(i.domain)}</a></div>
${i.unsubscribeUrl ? `<div style="margin-top:6px;font:11.5px/1.7 ${B};color:${C.meta}">You typed your email at our checkout. <a href="${esc(i.unsubscribeUrl)}" style="color:${C.meta}">Unsubscribe</a></div>` : ""}
${i.postalAddress ? `<div style="margin-top:4px;font:11px/1.6 ${B};color:${C.meta}">${esc(i.postalAddress)}</div>` : ""}
</td></tr>
</table></td></tr></table></body></html>`;
}

const kicker = (t: string) => `<div style="font:700 12px ${F};letter-spacing:.2em;color:${C.orange}">${esc(t)}</div>`;
const headline = (t: string) => `<div style="margin-top:10px;font:800 32px/1.08 ${F};letter-spacing:-.02em;color:${C.bone}">${esc(t)}</div>`;
const para = (t: string, top = 14) => `<div style="margin-top:${top}px;font:16px/1.6 ${B};color:${C.body}">${esc(t)}</div>`;
const section = (inner: string, top = 30) => `<tr><td style="padding:${top}px 32px 0">${inner}</td></tr>`;

function button(label: string, href: string): string {
  return `<table cellpadding="0" cellspacing="0" style="margin-top:22px"><tr><td bgcolor="${C.orange}" style="border-radius:4px;background:${C.orange}"><a href="${esc(href)}" style="display:inline-block;padding:17px 36px;font:800 15px ${F};letter-spacing:.08em;text-transform:uppercase;color:#0A0A0A;text-decoration:none">${esc(label)}</a></td></tr></table>`;
}

function card(inner: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};border:1px solid ${C.rule};border-radius:12px"><tr><td style="padding:22px">${inner}</td></tr></table>`;
}

function cartCard(i: Base, lines: FlowLine[], totals: { label: string; value: string; accent?: boolean }[]): string {
  const m = (c: number) => i.money(c, i.currency);
  const rows = lines
    .map((l) => `<tr><td style="font:800 18px ${F};color:${C.bone}">${esc(l.label)}</td><td align="right" style="font:800 18px ${F};color:${C.bone};white-space:nowrap">${m(l.lineTotalCents)}</td></tr><tr><td colspan="2" style="padding:2px 0 14px;font:13px ${B};color:${C.meta}">Qty ${l.quantity}</td></tr>`)
    .join("");
  const tot = totals
    .map((t, n) => {
      const last = n === totals.length - 1;
      const pad = last ? `padding:14px 0 0;border-top:1px solid ${C.rule};` : "padding:6px 0;";
      return `<tr><td style="${pad}font:${last ? `800 17px ${F}` : `15px ${B}`};color:${last ? C.bone : C.meta}">${esc(t.label)}</td><td align="right" style="${pad}font:${last ? `800 22px ${F}` : `15px ${B}`};color:${last || t.accent ? C.orange : C.bone}">${esc(t.value)}</td></tr>`;
    })
    .join("");
  return card(`<div style="font:700 11px ${F};letter-spacing:.18em;color:${C.meta}">YOUR CART</div><table width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px">${rows}</table><table width="100%" cellpadding="0" cellspacing="0">${tot}</table>`);
}

function trustRow(): string {
  const cell = (a: string, b: string) => `<td width="33%" align="center" style="padding:0 4px;font:12px/1.5 ${B};color:${C.meta}"><b style="display:block;font:700 13px ${F};color:${C.bone}">${a}</b>${b}</td>`;
  return `<table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${C.rule}"><tr><td style="padding-top:20px"><table width="100%" cellpadding="0" cellspacing="0"><tr>${cell("Free shipping", "on every order")}${cell("Secure checkout", "Apple&nbsp;Pay &amp; card")}${cell("Real people", "reply any time")}</tr></table></td></tr></table>`;
}

function textFooter(i: Base): string {
  return i.unsubscribeUrl ? `\n\nUnsubscribe: ${i.unsubscribeUrl}${i.postalAddress ? `\n${i.postalAddress}` : ""}` : "";
}

/* ------------------------------------------------------------ recovery */

export interface RecoveryInput extends Base {
  lines: FlowLine[];
  totalCents: number;
  recoverUrl: string;
}

/** ~1h: a cart with an email on it, left before payment. */
export function reaperCartEmail(i: RecoveryInput): ReaperEmail {
  const d = dreamFor(i.handle);
  const subject = `${d.short} is still in your cart`;
  const preheader = "Be the house the whole street films this Halloween.";
  const hi = i.first ? `${i.first}, your` : "Your";
  const body = [
    section(`${kicker("SAVED FOR YOU")}${headline(`${hi} house is one tap from the one everyone films.`)}${para(d.line)}${para("Your cart is exactly as you left it.", 10)}${button("Finish my order", i.recoverUrl)}`),
    section(cartCard(i, i.lines, [{ label: "Shipping", value: "Free" }, { label: "Total", value: i.money(i.totalCents, i.currency) }])),
    section(trustRow(), 28),
  ].join("");
  const text = [
    `${hi} house is one tap from the one everyone films.`,
    ``,
    d.line,
    ``,
    ...i.lines.map((l) => `${l.label} x ${l.quantity} - ${i.money(l.lineTotalCents, i.currency)}`),
    `Total ${i.money(i.totalCents, i.currency)}, free shipping`,
    ``,
    `Finish your order: ${i.recoverUrl}`,
  ].join("\n") + textFooter(i);
  return { subject, preheader, html: frame(i, body, preheader, d.hero), text };
}

/** ~1h: reached payment and stopped. */
export function reaperCheckoutEmail(i: RecoveryInput): ReaperEmail {
  const d = dreamFor(i.handle);
  const subject = i.first ? `${i.first}, one tap left` : "One tap left";
  const preheader = `${d.short} is waiting at checkout, exactly as you left it.`;
  const body = [
    section(`${kicker("ALMOST YOURS")}${headline("One tap and it’s yours.")}${para(d.line)}${para("Everything is waiting at checkout, exactly as you left it. Apple Pay takes a second.", 10)}${button("Finish my order", i.recoverUrl)}`),
    section(cartCard(i, i.lines, [{ label: "Shipping", value: "Free" }, { label: "Total", value: i.money(i.totalCents, i.currency) }])),
    section(trustRow(), 28),
  ].join("");
  const text = [
    `One tap and it's yours.`,
    ``,
    d.line,
    ``,
    ...i.lines.map((l) => `${l.label} x ${l.quantity} - ${i.money(l.lineTotalCents, i.currency)}`),
    `Total ${i.money(i.totalCents, i.currency)}, free shipping`,
    ``,
    `Finish your order: ${i.recoverUrl}`,
  ].join("\n") + textFooter(i);
  return { subject, preheader, html: frame(i, body, preheader, d.hero), text };
}

export interface ComebackFlowInput extends RecoveryInput {
  code: string;
  offCents: number;
}

/** ~24h after the first: welcome back, $20 off, applied by the button. */
export function reaperComebackEmail(i: ComebackFlowInput): ReaperEmail {
  const d = dreamFor(i.handle);
  const off = i.money(i.offCents, i.currency).replace(/[.,]00\b/, "");
  const after = Math.max(0, i.totalCents - i.offCents);
  const subject = `Welcome back: ${off} off ${d.short}`;
  const preheader = `${off} off your order, already applied. Your cart is waiting.`;
  const codeCard = `<table width="100%" cellpadding="0" cellspacing="0" style="border:2px dashed ${C.orange};border-radius:12px"><tr><td align="center" style="padding:20px">
<div style="font:700 12px ${F};letter-spacing:.2em;color:${C.orange}">WELCOME BACK &mdash; ${esc(off.toUpperCase())} OFF</div>
<div style="margin-top:10px;font:800 26px ui-monospace,Menlo,monospace;letter-spacing:.08em;color:${C.bone}">${esc(i.code)}</div>
<div style="margin-top:8px;font:13px ${B};color:${C.meta}">Applied for you when you tap below</div></td></tr></table>`;
  const body = [
    section(`${kicker("WELCOME BACK")}${headline(`${off} off. It’s still yours.`)}${para(d.line)}${para(`Come back to it and ${off} comes off your order, on top of the price you saw.`, 10)}`),
    section(codeCard, 22),
    section(`${cartCard(i, i.lines, [
      { label: "Subtotal", value: i.money(i.totalCents, i.currency) },
      { label: "Welcome back", value: `−${off}`, accent: true },
      { label: "Shipping", value: "Free" },
      { label: "Total", value: i.money(after, i.currency) },
    ])}${button(`Claim my ${off} off`, i.recoverUrl)}`, 22),
    section(trustRow(), 28),
  ].join("");
  const text = [
    `${off} off. It's still yours.`,
    ``,
    d.line,
    ``,
    ...i.lines.map((l) => `${l.label} x ${l.quantity} - ${i.money(l.lineTotalCents, i.currency)}`),
    `Welcome back: -${off}`,
    `Total ${i.money(after, i.currency)}, free shipping`,
    ``,
    `Code ${i.code}, applied when you open this link: ${i.recoverUrl}`,
  ].join("\n") + textFooter(i);
  return { subject, preheader, html: frame(i, body, preheader, d.hero), text };
}

/* ---------------------------------------------------------- after order */

export interface ShippedInput extends Base {
  reference: string;
  tracking: string;
  carrier: string | null;
  trackUrl: string | null;
}

export function reaperShippedEmail(i: ShippedInput): ReaperEmail {
  const d = dreamFor(i.handle);
  const subject = `${d.short} is on its way`;
  const preheader = `Order ${i.reference} is on its way. Your tracking number is inside.`;
  const first = i.first || "there";
  const track = card(`<div style="font:700 11px ${F};letter-spacing:.18em;color:${C.meta}">TRACKING${i.carrier ? ` &middot; ${esc(i.carrier.toUpperCase())}` : ""}</div>
<div style="margin-top:10px;font:800 20px ui-monospace,Menlo,monospace;letter-spacing:.04em;color:${C.bone};word-break:break-all">${esc(i.tracking)}</div>
<div style="margin-top:6px;font:13px ${B};color:${C.meta}">Order ${esc(i.reference)}</div>`);
  const body = [
    section(`${kicker("ON ITS WAY")}${headline(`It’s coming, ${first}.`)}${para(d.line)}`),
    section(`${track}${i.trackUrl ? button("Track it", i.trackUrl) : ""}`, 22),
    section(`<div style="font:15px/1.6 ${B};color:${C.body}">Questions? <b style="color:${C.bone}">Just reply to this email.</b> A real person reads it.</div>`, 28),
  ].join("");
  const text = [
    `It's coming, ${first}.`,
    ``,
    d.line,
    ``,
    `Tracking${i.carrier ? ` (${i.carrier})` : ""}: ${i.tracking}`,
    i.trackUrl ? `Track it: ${i.trackUrl}` : ``,
    `Order ${i.reference}`,
  ].filter((l, n, a) => l !== "" || a[n - 1] !== "").join("\n");
  return { subject, preheader, html: frame(i, body, preheader, d.hero), text };
}

export interface AfterInput extends Base {
  reviewUrl?: string;
}

function list(title: string, items: string[], numbered: boolean): string {
  const rows = items
    .map((t, n) => `<tr><td valign="top" width="34" style="padding:8px 0">${numbered ? `<div style="width:24px;height:24px;border-radius:12px;background:${C.orange};text-align:center;font:800 13px/24px ${F};color:#0A0A0A">${n + 1}</div>` : `<div style="font:700 14px ${F};color:${C.orange}">&#10003;</div>`}</td><td style="padding:8px 0;font:15px/1.5 ${B};color:${C.bone}">${esc(t)}</td></tr>`)
    .join("");
  return `<div style="font:800 20px ${F};color:${C.bone}">${esc(title)}</div><table width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px">${rows}</table>`;
}

/** The setup guide, on the aftercare timing. */
export function reaperDeliveredEmail(i: AfterInput): ReaperEmail {
  const d = dreamFor(i.handle);
  const g = reaperProduct(i.handle);
  const first = i.first || "there";
  const subject = "Tonight, the street stops at your house";
  const preheader = `${d.short}: up in minutes. Here is everything you need for tonight.`;
  const body = [
    section(`${kicker("TONIGHT")}${headline(`Make it tonight, ${first}.`)}${para(d.line)}`),
    g ? section(list(i.handle === "the-scream" ? "Up in ninety seconds" : "Up in a minute", g.setupSteps, true)) : "",
    g ? section(card(`<div style="font:700 11px ${F};letter-spacing:.18em;color:${C.meta}">WORTH KNOWING</div>${g.setupTips.map((t) => `<div style="margin-top:10px;font:14.5px/1.55 ${B};color:${C.body}"><span style="color:${C.orange};font-weight:700">&ndash;</span>&nbsp; ${esc(t)}</div>`).join("")}`), 22) : "",
    g ? section(list("In the box", g.inBox, false), 26) : "",
    section(`<div style="font:15px/1.6 ${B};color:${C.body}">Questions? <b style="color:${C.bone}">Just reply to this email.</b> A real person reads it.</div>`, 28),
  ].join("");
  const text = [
    `Make it tonight, ${first}.`,
    ``,
    d.line,
    ``,
    ...(g ? [...g.setupSteps.map((s, n) => `${n + 1}. ${s}`), ``, ...g.setupTips.map((t) => `- ${t}`)] : []),
    ``,
    `Questions? Just reply to this email.`,
  ].join("\n");
  return { subject, preheader, html: frame(i, body, preheader, d.hero), text };
}

/** A few nights in: one ask, one button. */
export function reaperReviewEmail(i: AfterInput): ReaperEmail {
  const d = dreamFor(i.handle);
  const g = reaperProduct(i.handle);
  const first = i.first || "there";
  const url = i.reviewUrl ?? `https://${i.domain}/products/${i.handle ?? ""}#reviews`;
  const subject = "Did the street stop?";
  const preheader = g?.reviewAsk ?? "Tell us how it looks from the street.";
  const body = [
    section(`${kicker("A FEW NIGHTS IN")}${headline(`Did the street stop, ${first}?`)}${para(g?.reviewAsk ?? "Tell us how it looks from the street.")}${para("Two lines is plenty. A photo from the sidewalk is even better.", 10)}${button(`Review ${d.short}`, url)}`),
  ].join("");
  const text = [`Did the street stop, ${first}?`, ``, g?.reviewAsk ?? "", ``, `Leave a review: ${url}`].join("\n");
  return { subject, preheader, html: frame(i, body, preheader, d.hero), text };
}

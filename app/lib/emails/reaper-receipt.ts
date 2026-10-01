/**
 * Black Reaper's order confirmation: the product at the top, what happens next, what is in the box, how to
 * set it up. Inline styles and tables only (Outlook). Every picture is a JPG or PNG the size of an inbox:
 * a .webp renders as nothing in a lot of mail clients.
 *
 * Nothing here is invented: the box contents and the setup steps come from the product guide the product
 * page itself uses (./reaper-products.ts). No apologies, no hedging: the store speaks with confidence.
 */
import { reaperProduct } from "./reaper-products";

const C = { bg: "#0A0A0A", card: "#121212", bone: "#F3EEE6", meta: "#8D8A84", rule: "#26231F", orange: "#F5821F", body: "#CFCAC1" };
const F = "Archivo,'Helvetica Neue',Arial,sans-serif";
const B = "Inter,'Helvetica Neue',Arial,sans-serif";

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** The picture each product leads with: email-sized JPGs on the shop's own /media. */
const HERO: Record<string, string> = {
  "the-scream": "em-scr-hero.jpg",
  "haunted-projector": "em-hp-ip-s02.jpg",
  "black-reaper": "em-br-m1-hero.jpg",
  "crawling-zombie": "em-bw-zombie1.jpg",
  "halloween-movie-theater": "em-bw-thea1.jpg",
  "giant-skeleton-12ft": "em-bw-sk1.jpg",
};
const SHIP_TITLE: Record<string, string> = { "the-scream": "Up in ninety seconds", "haunted-projector": "Setting it up" };

export interface ReaperReceiptInput {
  domain: string;
  first: string;
  reference: string;
  handle: string | null;
  lines: { label: string; quantity: number; lineTotalCents: number }[];
  subtotalCents: number;
  discountCode?: string | null;
  discountCents?: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
  shipName: string;
  shipLines: string[];
  money: (cents: number, currency: string) => string;
}

export function reaperReceiptHtml(i: ReaperReceiptInput): string {
  const site = `https://${i.domain}`;
  const guide = reaperProduct(i.handle);
  const hero = i.handle && HERO[i.handle] ? `${site}/media/${HERO[i.handle]}` : null;
  const m = (c: number) => i.money(c, i.currency);
  const productName = guide?.name ?? i.lines[0]?.label ?? "order";
  const first = esc(i.first || "there");

  const step = (label: string, sub: string, on: boolean) => `<td valign="top" width="25%" style="padding:0 4px"><div style="height:4px;border-radius:2px;background:${on ? C.orange : C.rule};margin-bottom:10px"></div><div style="font:700 11px ${F};letter-spacing:.14em;color:${on ? C.bone : C.meta}">${label}</div><div style="margin-top:3px;font:12px/1.4 ${B};color:${C.meta}">${sub}</div></td>`;

  const lineRows = i.lines
    .map((l, n) => ({ ...l, label: n === 0 && guide && !l.label.toLowerCase().includes(guide.name.toLowerCase().replace(/^the /, "")) ? `${guide.name} — ${l.label}` : l.label }))
    .map((l) => `<tr><td style="font:800 20px ${F};color:${C.bone}">${esc(l.label)}</td><td align="right" style="font:800 20px ${F};color:${C.bone}">${m(l.lineTotalCents)}</td></tr><tr><td colspan="2" style="padding:2px 0 14px;font:13px ${B};color:${C.meta}">Qty ${l.quantity}</td></tr>`)
    .join("");
  const row = (a: string, b: string, color = C.bone) => `<tr><td style="padding:6px 0;font:15px ${B};color:${C.meta}">${a}</td><td align="right" style="font:15px ${B};color:${color}">${b}</td></tr>`;
  const totals = [
    row("Subtotal", m(i.subtotalCents)),
    i.discountCode && i.discountCents ? row(esc(i.discountCode), `&minus;${m(i.discountCents)}`, C.orange) : "",
    row("Shipping", i.shippingCents ? m(i.shippingCents) : "Free"),
    i.taxCents ? row("Tax", m(i.taxCents)) : "",
    `<tr><td style="padding:14px 0 0;border-top:1px solid ${C.rule};font:800 17px ${F};color:${C.bone}">Total paid</td><td align="right" style="padding:14px 0 0;border-top:1px solid ${C.rule};font:800 22px ${F};color:${C.orange}">${m(i.totalCents)}</td></tr>`,
  ].join("");

  const box = (guide?.inBox ?? [])
    .map((b) => `<tr><td valign="top" width="22" style="padding:7px 0;font:700 14px ${F};color:${C.orange}">&#10003;</td><td style="padding:7px 0;font:15px/1.45 ${B};color:${C.bone}">${esc(b)}</td></tr>`)
    .join("");
  const steps = (guide?.setupSteps ?? [])
    .map((s, n) => `<tr><td valign="top" width="34" style="padding:9px 0"><div style="width:24px;height:24px;border-radius:12px;background:${C.orange};text-align:center;font:800 13px/24px ${F};color:#0A0A0A">${n + 1}</div></td><td style="padding:9px 0;font:15px/1.5 ${B};color:${C.bone}">${esc(s)}</td></tr>`)
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark">
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@700;800&family=Inter:wght@400;600&display=swap" rel="stylesheet"></head>
<body style="margin:0;background:${C.bg}"><div style="display:none;max-height:0;overflow:hidden">Order ${esc(i.reference)} confirmed &middot; ${m(i.totalCents)} paid</div>
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.bg}"><tr><td align="center" style="padding:0 0 40px">
<table width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px">
<tr><td align="center" style="padding:26px 32px 20px"><a href="${site}"><img src="${site}/media/em-br-logo.png" alt="BLACK REAPER" width="150" style="display:block;border:0;height:auto"></a></td></tr>
${hero ? `<tr><td style="padding:0;font-size:0;line-height:0;background:#000"><a href="${site}"><img src="${hero}" width="600" alt="${esc(productName)}" style="display:block;width:100%;max-width:600px;height:auto;border:0"></a></td></tr>` : ""}
<tr><td style="padding:30px 32px 6px"><div style="font:700 12px ${F};letter-spacing:.2em;color:${C.orange}">ORDER CONFIRMED</div>
<div style="margin-top:10px;font:800 34px/1.08 ${F};letter-spacing:-.02em;color:${C.bone}">${i.handle === "the-scream" ? `Sixteen feet of nightmare is on its way, ${first}.` : `Your ${esc(productName.replace(/^The /, ""))} is on its way, ${first}.`}</div>
<div style="margin-top:14px;font:16px/1.6 ${B};color:${C.body}">Payment went through and your order is being packed. The next email has your tracking number.</div></td></tr>
<tr><td style="padding:24px 32px 4px"><table width="100%" cellpadding="0" cellspacing="0"><tr>${step("PAID", "Confirmed", true)}${step("PACKING", "Today", true)}${step("ON ITS WAY", "Heading to you", false)}${step("TRACKING", "By email", false)}</tr></table></td></tr>
<tr><td style="padding:26px 32px 0"><table width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};border:1px solid ${C.rule};border-radius:12px"><tr><td style="padding:22px 22px 8px">
<div style="font:700 11px ${F};letter-spacing:.18em;color:${C.meta}">YOUR ORDER &middot; ${esc(i.reference)}</div>
<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px">${lineRows}</table>
<table width="100%" cellpadding="0" cellspacing="0">${totals}</table></td></tr>
<tr><td style="padding:6px 22px 22px"><div style="margin-top:14px;font:700 11px ${F};letter-spacing:.18em;color:${C.meta}">SHIPPING TO</div><div style="margin-top:6px;font:16px/1.5 ${B};color:${C.bone}">${[i.shipName, ...i.shipLines].filter(Boolean).map(esc).join("<br>")}</div></td></tr></table></td></tr>
${box ? `<tr><td style="padding:26px 32px 0"><div style="font:800 20px ${F};color:${C.bone}">What&rsquo;s in the box</div><table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">${box}</table></td></tr>` : ""}
${steps ? `<tr><td style="padding:26px 32px 0"><div style="font:800 20px ${F};color:${C.bone}">${esc((i.handle && SHIP_TITLE[i.handle]) || "Setting it up")}</div><table width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px">${steps}</table></td></tr>` : ""}
<tr><td style="padding:28px 32px 0"><table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${C.rule}"><tr><td style="padding:20px 0 0;font:15px/1.6 ${B};color:${C.body}">Anything wrong, or a question before it arrives? <b style="color:${C.bone}">Just reply to this email.</b> A real person reads it and we answer fast.</td></tr></table></td></tr>
<tr><td align="center" style="padding:28px 32px 0"><div style="font:800 12px ${F};letter-spacing:.22em;color:${C.meta}">BLACK REAPER</div><div style="margin-top:8px;font:12px/1.7 ${B};color:${C.meta}">Free shipping &middot; 30 days to send it back &middot; <a href="${site}" style="color:${C.meta}">${esc(i.domain)}</a></div></td></tr>
</table></td></tr></table></body></html>`;
}

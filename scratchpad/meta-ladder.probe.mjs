/**
 * Drives the live-code storefront in a real Chromium and records what the
 * pixel actually sent. Not a unit test: this is the part that proves the gate
 * and the ladder behave in a browser.
 *
 * The browser's own reports to /px/tr are answered locally with a 1x1 rather
 * than forwarded, so this run cannot post test events into the real ad
 * account from the browser half.
 */
import { chromium } from "playwright";

const BASE = "http://localhost:5173/?store=reaper";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

const GIF = Buffer.from(
  "R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==",
  "base64",
);

const seen = [];
const rungs = [];

function note(url) {
  const u = new URL(url);
  const ev = u.searchParams.get("ev");
  if (ev) seen.push({ ev, at: Date.now(), id: u.searchParams.get("eid"), value: u.searchParams.get("cd[value]") });
}

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox"],
});
const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 900 } });

await ctx.route((u) => u.pathname.startsWith("/px/tr"), async (route) => {
  note(route.request().url());
  await route.fulfill({ status: 200, contentType: "image/gif", body: GIF });
});
// Anything that still goes straight to Meta is worth knowing about.
await ctx.route((u) => u.hostname.endsWith("facebook.com") && u.pathname.startsWith("/tr"), async (route) => {
  note(route.request().url());
  await route.fulfill({ status: 200, contentType: "image/gif", body: GIF });
});

const page = await ctx.newPage();
page.on("response", async (res) => {
  if (!res.url().includes("/rung")) return;
  try {
    rungs.push({ status: res.status(), body: await res.json() });
  } catch {}
});

const t0 = Date.now();
await page.goto(BASE, { waitUntil: "load" });
await page.waitForTimeout(4000);
const beforeScroll = seen.filter((e) => e.ev === "PageView").length;
console.log("A. after load, no interaction — PageView count:", beforeScroll, JSON.stringify(seen.map((e) => e.ev)));

await page.mouse.wheel(0, 900);
await page.waitForTimeout(2500);
console.log("B. after one scroll — events:", JSON.stringify(seen.map((e) => e.ev)));

// Deep scroll, so the Considered gate has something to pass.
for (let i = 0; i < 12; i++) {
  await page.mouse.wheel(0, 1400);
  await page.waitForTimeout(250);
}
await page.waitForTimeout(500);

// Engaged: touch a bundle tier.
const tier = page.locator("[data-variant]").nth(1);
if (await tier.count()) {
  await tier.scrollIntoViewIfNeeded();
  await tier.click({ force: true });
} else {
  console.log("!! no [data-variant] tier found");
}
await page.waitForTimeout(3000);
console.log("C. after touching a bundle tier — events:", JSON.stringify(seen.map((e) => e.ev)));
console.log("   /rung replies:", JSON.stringify(rungs));

// Considered: needs 60% scroll and 30 active seconds, both read from the
// heartbeat's own row, so this just waits the site out.
const deadline = Date.now() + 95_000;
while (Date.now() < deadline && !seen.some((e) => e.ev === "Considered")) {
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(3000);
}
console.log("D. after", Math.round((Date.now() - t0) / 1000), "s — events:", JSON.stringify(seen.map((e) => e.ev)));
console.log("   /rung replies:", JSON.stringify(rungs, null, 1));

// G. HotLead: reach checkout with something in the cart.
const variantId = await page.locator("[data-variant]").nth(1).getAttribute("data-variant");
await page.evaluate(async (id) => {
  const body = new URLSearchParams({ variantId: id, quantity: "1" });
  await fetch("/cart/add", { method: "POST", body });
}, variantId);
await page.goto("http://localhost:5173/checkout?store=reaper", { waitUntil: "load" });
await page.waitForTimeout(6000);
console.log("G. after reaching checkout — events:", JSON.stringify(seen.map((e) => e.ev)));
console.log("   /rung replies:", JSON.stringify(rungs.map((r) => r.body.name ?? r.body.reason)));

const cookies = await ctx.cookies();
console.log(
  "E. cookies:",
  JSON.stringify(
    cookies.filter((c) => ["_fbp", "_fbc", "kerberos_rungs", "kerberos_real"].includes(c.name)).map((c) => ({ n: c.name, v: c.value })),
  ),
);
console.log("F. full event log:", JSON.stringify(seen, null, 1));

await browser.close();

// The AGENT — turns brain decisions into real actions on the live TikTok browser.
// Called by live-browser.js when the user types a command or presses "Learn the Market".

import { getBrain } from "./brain.js";

const VPW = 360, VPH = 760;

async function swipe(client, x1, y1, x2, y2) {
  if (!client) return;
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x1, y: y1 }] });
  for (let i = 1; i <= 6; i++)
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x1 + (x2 - x1) * i / 6, y: y1 + (y2 - y1) * i / 6 }] });
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

async function exec(page, client, a, send) {
  try {
    switch (a.action) {
      case "search":
        send({ type: "agent", text: `searching TikTok: "${a.q}"` });
        await page.goto("https://www.tiktok.com/search?q=" + encodeURIComponent(a.q), { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
        break;
      case "scroll":
        send({ type: "agent", text: "scrolling the feed" });
        await swipe(client, VPW / 2, VPH * 0.78, VPW / 2, VPH * 0.22);
        break;
      case "scrollUp":
        await swipe(client, VPW / 2, VPH * 0.22, VPW / 2, VPH * 0.78);
        break;
      case "like":
        send({ type: "agent", text: "tapping like" });
        await page.touchscreen.tap(VPW - 28, VPH * 0.55).catch(() => {});
        break;
      case "open":
        send({ type: "agent", text: `opening result ${a.n || 1}` });
        await page.touchscreen.tap(VPW * 0.3, VPH * 0.4).catch(() => {});
        break;
      case "back":
        await page.goBack().catch(() => {});
        break;
    }
  } catch {}
}

// one typed command -> one action
export async function runCommand(page, client, text, send) {
  const brain = getBrain();
  const a = await brain.interpret(text);
  send({ type: "agent", text: `command "${text}" -> ${a.action}` });
  await exec(page, client, a, send);
}

// "Learn the Market" -> autonomous search + scroll loop
export async function runMarketScan(page, client, goal, send) {
  const brain = getBrain();
  const plan = await brain.marketPlan(goal);
  send({ type: "agent", text: `learning the market: "${plan.niche}" (brain: ${brain.name})` });
  for (const step of plan.steps) {
    await exec(page, client, step, send);
    await new Promise((r) => setTimeout(r, 1500)); // watch each step
  }
  send({ type: "agent", text: "market scan complete" });
}

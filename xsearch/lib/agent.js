// The AGENT — the "fingers". Turns commands into real desktop-TikTok actions:
// arrow keys to move the feed, real search, real like. (The "brain"/judging = Claude, next.)

import { getBrain } from "./brain.js";

async function exec(page, a, send) {
  try {
    switch (a.action) {
      case "search":
        send({ type: "agent", text: `searching TikTok for "${a.q}"` });
        await page.goto("https://www.tiktok.com/search?q=" + encodeURIComponent(a.q), { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
        await new Promise((r) => setTimeout(r, 2500));
        break;
      case "scroll": case "next":
        send({ type: "agent", text: "next video" });
        await page.keyboard.press("ArrowDown");
        break;
      case "scrollUp": case "prev":
        await page.keyboard.press("ArrowUp");
        break;
      case "like":
        send({ type: "agent", text: "liking this one" });
        await page.keyboard.press("l");
        break;
      case "open":
        await page.mouse.click(230, 380).catch(() => {});
        break;
      case "back":
        await page.goBack().catch(() => {});
        break;
    }
  } catch {}
}

// one typed command -> one action
export async function runCommand(page, _client, text, send) {
  const brain = getBrain();
  const a = await brain.interpret(text);
  send({ type: "agent", text: `"${text}" -> ${a.action}` });
  await exec(page, a, send);
}

// "Learn the Market" -> actually WATCH the For You feed: dwell on each video, then
// press Down for the next. Real doom-scroll. (Judging the videos = the Claude step.)
export async function runMarketScan(page, _client, goal, send) {
  send({ type: "agent", text: "opening the For You feed…" });
  await page.goto("https://www.tiktok.com/foryou", { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 3500));
  for (let i = 1; i <= 10; i++) {
    if (page.isClosed?.()) break;
    send({ type: "agent", text: `watching video ${i}…` });
    await new Promise((r) => setTimeout(r, 3000 + Math.random() * 2500)); // human-like dwell
    await page.keyboard.press("ArrowDown"); // next video
  }
  send({ type: "agent", text: "watched 10 videos for real. Next: the eye to judge them (Claude)." });
}

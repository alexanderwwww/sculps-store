// The AGENT — body + fingers, driven by the brain (heuristic or Claude).
// With Claude active, it understands commands AND judges each video (vision).

import { getBrain } from "./brain.js";

async function exec(page, a, send) {
  try {
    switch (a.action) {
      case "search":
        send({ type: "agent", text: `searching TikTok for "${a.q}"` });
        await page.goto("https://www.tiktok.com/search?q=" + encodeURIComponent(a.q), { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
        await new Promise((r) => setTimeout(r, 2500));
        break;
      case "next": case "scroll": send({ type: "agent", text: "next video" }); await page.keyboard.press("ArrowDown"); break;
      case "prev": case "scrollUp": await page.keyboard.press("ArrowUp"); break;
      case "like": send({ type: "agent", text: "liking it" }); await page.keyboard.press("l"); break;
      case "back": await page.goBack().catch(() => {}); break;
    }
  } catch {}
}

async function judgeCurrent(page, brain, send) {
  if (!brain.judge) { send({ type: "agent", text: "no brain to judge — add ANTHROPIC_API_KEY" }); return null; }
  const buf = await page.screenshot({ type: "jpeg", quality: 55 });
  const j = await brain.judge(buf.toString("base64"));
  if (j && j._err) send({ type: "agent", text: "brain error: " + j._err });
  return j;
}

// one typed command
export async function runCommand(page, _client, text, send) {
  const brain = getBrain();
  const a = await brain.interpret(text);
  send({ type: "agent", text: `"${text}" -> ${a.action}` });
  if (a._err) send({ type: "agent", text: "brain error: " + a._err });
  if (a.action === "analyze") {
    const j = await judgeCurrent(page, brain, send);
    if (j && j.isProduct) { send({ type: "product", product: j }); send({ type: "agent", text: `${j.title}: ${j.verdict} (X${j.xScore}) — ${j.why || ""}` }); }
    else if (j) send({ type: "agent", text: "that's not really a product video." });
    return;
  }
  if (a.action === "learn") return runMarketScan(page, _client, a.q, send);
  await exec(page, a, send);
}

// "Learn the Market" -> watch the feed AND judge each video with the brain
export async function runMarketScan(page, _client, goal, send) {
  const brain = getBrain();
  const url = goal && goal !== "for you" ? "https://www.tiktok.com/search?q=" + encodeURIComponent(goal) : "https://www.tiktok.com/foryou";
  send({ type: "agent", text: `opening ${goal && goal !== "for you" ? `search "${goal}"` : "For You feed"}…` });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 3500));

  let found = 0;
  for (let i = 1; i <= 10; i++) {
    if (page.isClosed?.()) break;
    send({ type: "agent", text: `watching video ${i}…` });
    await new Promise((r) => setTimeout(r, 2500 + Math.random() * 1500)); // human-like dwell
    if (brain.judge) {
      const j = await judgeCurrent(page, brain, send);
      if (j && j.isProduct) { found++; send({ type: "product", product: j }); send({ type: "agent", text: `found: ${j.title} — ${j.verdict} (X${j.xScore})` }); }
      else if (j) send({ type: "agent", text: "not a product — scrolling" });
    }
    await page.keyboard.press("ArrowDown"); // next video
  }
  send({ type: "agent", text: brain.judge ? `done — found ${found} products in 10 videos.` : "watched 10 videos (add ANTHROPIC_API_KEY so I can judge them)." });
}

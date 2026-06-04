// The AGENT — autonomous body + fingers, driven by the brain.
// Press XSEARCH -> it plans queries, opens the feed, MOVES (ArrowDown), screenshots
// each video, has Claude judge it, and streams real products (with the real frame as
// the thumbnail) to the UI. No babysitting.

import { getBrain } from "./brain.js";

async function exec(page, a, send) {
  try {
    switch (a.action) {
      case "search": send({ type: "agent", text: `searching "${a.q}"` }); await page.goto("https://www.tiktok.com/search?q=" + encodeURIComponent(a.q), { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {}); await new Promise((r) => setTimeout(r, 2500)); break;
      case "next": case "scroll": send({ type: "agent", text: "next video" }); await page.keyboard.press("ArrowDown"); break;
      case "prev": await page.keyboard.press("ArrowUp"); break;
      case "like": send({ type: "agent", text: "liking it" }); await page.keyboard.press("l"); break;
      case "back": await page.goBack().catch(() => {}); break;
    }
  } catch {}
}

// screenshot the current video, judge it, and attach the frame as the product image
async function judgeShot(page, brain) {
  const buf = await page.screenshot({ type: "jpeg", quality: 55 });
  const b64 = buf.toString("base64");
  const j = await brain.judge(b64);
  if (j && j.isProduct) j.image = "data:image/jpeg;base64," + b64;
  return j;
}

export async function runCommand(page, _c, text, send) {
  const brain = getBrain();
  const a = await brain.interpret(text);
  send({ type: "agent", text: `"${text}" -> ${a.action}` });
  if (a._err) send({ type: "agent", text: "brain err: " + a._err });
  if (a.action === "analyze") {
    if (!brain.judge) { send({ type: "agent", text: "add ANTHROPIC_API_KEY so I can judge" }); return; }
    const j = await judgeShot(page, brain);
    if (j && j.isProduct) { send({ type: "product", product: j }); send({ type: "agent", text: `${j.title}: ${(j.verdict || "").toUpperCase()} (X${j.xScore}) — ${j.why || ""}` }); }
    else send({ type: "agent", text: "not a product." });
    return;
  }
  if (a.action === "learn") return runMarketScan(page, _c, a.q, send);
  await exec(page, a, send);
}

// AUTONOMOUS hunt: plan -> open feed -> move + judge each video -> stream products
export async function runMarketScan(page, _c, goal, send) {
  const brain = getBrain();
  let niche = goal || "";
  if (brain.plan) { try { const pl = await brain.plan(goal); if (pl) { niche = pl.niche || niche; send({ type: "trends", niche: pl.niche, queries: pl.queries || [] }); } } catch {} }
  send({ type: "agent", text: `hunting ${niche ? `"${niche}"` : "the For You feed"} — going in.` });

  await page.goto("https://www.tiktok.com/foryou", { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 3500));

  if (!brain.judge) { // free fallback — just scroll
    for (let i = 1; i <= 10; i++) { if (page.isClosed?.()) break; send({ type: "agent", text: `watching video ${i}…` }); await new Promise((r) => setTimeout(r, 2500)); await page.keyboard.press("ArrowDown"); }
    send({ type: "agent", text: "watched 10 (add ANTHROPIC_API_KEY to judge)." });
    return;
  }

  let found = 0;
  for (let i = 1; i <= 12; i++) {
    if (page.isClosed?.()) break;
    send({ type: "agent", text: `watching video ${i}…` });
    await new Promise((r) => setTimeout(r, 2000 + Math.random() * 1200)); // human dwell
    try {
      const j = await judgeShot(page, brain);
      if (j && j._err) send({ type: "agent", text: "brain err: " + j._err });
      else if (j && j.isProduct) { found++; send({ type: "product", product: j }); send({ type: "agent", text: `found: ${j.title} — ${(j.verdict || "").toUpperCase()} (X${j.xScore})` }); }
      else send({ type: "agent", text: "skip — not a product" });
    } catch (e) { send({ type: "agent", text: "err: " + e.message }); }
    await page.keyboard.press("ArrowDown"); // MOVE to next video
  }
  send({ type: "agent", text: `hunt done — ${found} products found.` });
}

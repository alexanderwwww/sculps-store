// Live agent browser: a REAL Chromium (Playwright) mirrored into the phone.
// Uses DESKTOP TikTok (mobile web is crippled) + a PERSISTENT login profile, so the
// agent has reliable "hands": arrow keys to move the feed, real search, real clicks.
//
// Runs on YOUR machine. Requires: npm i playwright ws && npx playwright install chromium

import { WebSocketServer } from "ws";
import { runCommand, runMarketScan } from "./agent.js";

export const VPW = 460, VPH = 840;

export function attachLiveBrowser(server) {
  const wss = new WebSocketServer({ server, path: "/live" });

  wss.on("connection", async (ws) => {
    let ctx, page, client, closed = false;
    const send = (o) => { try { if (ws.readyState === 1) ws.send(JSON.stringify(o)); } catch {} };
    const cleanup = async () => { closed = true; try { await client?.send("Page.stopScreencast"); } catch {} try { await ctx?.close(); } catch {} };

    try {
      const { chromium } = await import("playwright");
      send({ type: "status", text: "launching browser" });
      const profileDir = process.env.TT_PROFILE_DIR || "./.tt-profile";
      ctx = await chromium.launchPersistentContext(profileDir, {
        headless: false,
        viewport: { width: VPW, height: VPH },
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
      });
      page = ctx.pages()[0] || await ctx.newPage();
      page.on("close", cleanup);

      send({ type: "status", text: "opening tiktok" });
      await page.goto("https://www.tiktok.com/foryou", { waitUntil: "domcontentloaded", timeout: 60000 })
        .catch((e) => send({ type: "status", text: "nav: " + e.message }));
      send({ type: "agent", text: "If the screen is blank, LOG IN to TikTok in the window that opened — saved for next time. Then press XSEARCH or type a command." });

      client = await ctx.newCDPSession(page);
      client.on("Page.screencastFrame", async (f) => {
        if (closed) return;
        send({ type: "frame", data: f.data });
        try { await client.send("Page.screencastFrameAck", { sessionId: f.sessionId }); } catch {}
      });
      await client.send("Page.startScreencast", { format: "jpeg", quality: 38, maxWidth: VPW, maxHeight: VPH, everyNthFrame: 1 });
      send({ type: "status", text: "live" });
    } catch (e) {
      send({ type: "status", text: "error: " + e.message + " (run: npm i playwright ws && npx playwright install chromium)" });
    }

    ws.on("message", async (raw) => {
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (!page || closed) return;
      try {
        if (m.type === "click") await page.mouse.click(m.x, m.y);                                  // real click
        else if (m.type === "swipe") await page.keyboard.press((m.y2 - m.y1) < 0 ? "ArrowDown" : "ArrowUp"); // swipe up = next video
        else if (m.type === "scroll") await page.keyboard.press(m.dy > 0 ? "ArrowDown" : "ArrowUp");
        else if (m.type === "key") await page.keyboard.type(String(m.text || ""));
        else if (m.type === "goto" && m.url) await page.goto(m.url, { waitUntil: "domcontentloaded" }).catch(() => {});
        else if (m.type === "command") await runCommand(page, client, m.text, send);
        else if (m.type === "learn") await runMarketScan(page, client, m.goal, send);
      } catch {}
    });

    ws.on("close", cleanup);
    ws.on("error", cleanup);
  });

  return wss;
}

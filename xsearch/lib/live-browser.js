// Live agent browser: a REAL Chromium (Playwright) mirrored into the phone.
// Uses a PERSISTENT profile so you log into TikTok ONCE and it sticks — otherwise
// TikTok shows a blank/white page to a guest and there's nothing to watch.
//
// Runs on YOUR machine. Requires: npm i playwright ws && npx playwright install chromium

import { WebSocketServer } from "ws";
import { runCommand, runMarketScan } from "./agent.js";

export const VPW = 360, VPH = 760;

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
        viewport: { width: VPW, height: VPH }, isMobile: true, hasTouch: true,
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
      });
      page = ctx.pages()[0] || await ctx.newPage();
      page.on("close", cleanup);

      send({ type: "status", text: "opening tiktok" });
      await page.goto("https://www.tiktok.com/foryou", { waitUntil: "domcontentloaded", timeout: 60000 })
        .catch((e) => send({ type: "status", text: "nav: " + e.message }));
      send({ type: "agent", text: "If the screen is blank/white, LOG IN to TikTok in the browser window that opened — then I can actually watch the feed. Your login is saved for next time." });

      // smooth screencast (browser pushes frames, ack-throttled)
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
        if (m.type === "click") await page.touchscreen.tap(m.x, m.y);
        else if (m.type === "swipe" && client) {
          await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: m.x1, y: m.y1 }] });
          for (let i = 1; i <= 6; i++) await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: m.x1 + (m.x2 - m.x1) * i / 6, y: m.y1 + (m.y2 - m.y1) * i / 6 }] });
          await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        }
        else if (m.type === "scroll") await page.mouse.wheel(0, m.dy);
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

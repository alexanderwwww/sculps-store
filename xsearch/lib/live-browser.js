// Live agent browser: a REAL Chromium (Playwright) mirrored into the phone.
// Control TikTok in the popped browser window; the phone shows a live, smooth stream.
//
// Streaming uses CDP Page.startScreencast (efficient, ack-throttled) instead of
// manual screenshots — far smoother and won't flood/lag.
//
// Runs on YOUR machine. Requires: npm i playwright ws && npx playwright install chromium

import { WebSocketServer } from "ws";

export const VPW = 360, VPH = 760;

export function attachLiveBrowser(server) {
  const wss = new WebSocketServer({ server, path: "/live" });

  wss.on("connection", async (ws) => {
    let browser, ctx, page, client, closed = false;
    const send = (o) => { try { if (ws.readyState === 1) ws.send(JSON.stringify(o)); } catch {} };
    const cleanup = async () => {
      closed = true;
      try { await client?.send("Page.stopScreencast"); } catch {}
      try { await browser?.close(); } catch {}   // close the real browser so reconnects don't pile up
    };

    try {
      const { chromium } = await import("playwright");
      send({ type: "status", text: "launching browser" });
      browser = await chromium.launch({ headless: false, args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"] });
      ctx = await browser.newContext({
        viewport: { width: VPW, height: VPH }, isMobile: true, hasTouch: true,
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      });
      page = await ctx.newPage();
      page.on("close", cleanup);
      browser.on("disconnected", () => { if (!closed) send({ type: "status", text: "browser closed" }); });

      send({ type: "status", text: "opening tiktok" });
      await page.goto("https://www.tiktok.com/foryou", { waitUntil: "domcontentloaded", timeout: 60000 })
        .catch((e) => send({ type: "status", text: "nav: " + e.message }));

      // efficient screencast via CDP — frames pushed by the browser, acked one at a time
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

    // optional: drive from the phone too (taps use real touch, matching TikTok mobile)
    ws.on("message", async (raw) => {
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (!page || closed) return;
      try {
        if (m.type === "click") await page.touchscreen.tap(m.x, m.y);
        else if (m.type === "scroll") await page.mouse.wheel(0, m.dy);
        else if (m.type === "key") await page.keyboard.type(String(m.text || ""));
        else if (m.type === "goto" && m.url) await page.goto(m.url, { waitUntil: "domcontentloaded" }).catch(() => {});
      } catch {}
    });

    ws.on("close", cleanup);
    ws.on("error", cleanup);
  });

  return wss;
}

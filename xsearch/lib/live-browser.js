// Live agent browser: a REAL Chromium (Playwright) streamed into the phone over a
// WebSocket. Frames go phone←browser; taps/scrolls go phone→browser. This is what
// makes the phone an actual live, clickable TikTok — not a painting.
//
// Runs on YOUR machine. Requires:  npm i playwright ws  &&  npx playwright install chromium
// TikTok fights automation — you can see captchas in the stream and tap to solve them.

import { WebSocketServer } from "ws";

export const VPW = 360, VPH = 760; // streamed viewport (phone aspect)

export function attachLiveBrowser(server) {
  const wss = new WebSocketServer({ server, path: "/live" });

  wss.on("connection", async (ws) => {
    let browser, ctx, page, timer, closed = false;
    const send = (o) => { try { if (ws.readyState === 1) ws.send(JSON.stringify(o)); } catch {} };

    try {
      const { chromium } = await import("playwright");
      send({ type: "status", text: "launching browser" });
      browser = await chromium.launch({ headless: false, args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"] });
      ctx = await browser.newContext({
        viewport: { width: VPW, height: VPH }, isMobile: true, hasTouch: true,
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      });
      page = await ctx.newPage();
      send({ type: "status", text: "opening tiktok" });
      await page.goto("https://www.tiktok.com/foryou", { waitUntil: "domcontentloaded", timeout: 60000 })
        .catch((e) => send({ type: "status", text: "nav: " + e.message }));
      send({ type: "status", text: "live" });

      const tick = async () => {
        if (closed) return;
        try { const buf = await page.screenshot({ type: "jpeg", quality: 45 }); send({ type: "frame", data: buf.toString("base64") }); }
        catch {}
        timer = setTimeout(tick, 280);
      };
      tick();
    } catch (e) {
      send({ type: "status", text: "error: " + e.message + " (install: npm i playwright ws && npx playwright install chromium)" });
    }

    ws.on("message", async (raw) => {
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (!page) return;
      try {
        if (m.type === "click") await page.mouse.click(m.x, m.y);
        else if (m.type === "scroll") await page.mouse.wheel(0, m.dy);
        else if (m.type === "key") await page.keyboard.type(String(m.text || ""));
        else if (m.type === "goto" && m.url) await page.goto(m.url, { waitUntil: "domcontentloaded" }).catch(() => {});
        else if (m.type === "back") await page.goBack().catch(() => {});
      } catch {}
    });

    ws.on("close", async () => { closed = true; clearTimeout(timer); try { await browser?.close(); } catch {} });
  });

  return wss;
}

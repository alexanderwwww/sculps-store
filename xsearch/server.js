// XSEARCH backend. Serves the UI, the scan API, and the LIVE browser stream.
// Keys + the real browser live here (server-side) — never in the page.

import express from "express";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { scan } from "./lib/pipeline.js";
import { attachLiveBrowser } from "./lib/live-browser.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// product scan (TikTok source → sourcing → brain → rank)
app.post("/api/scan", async (req, res) => {
  try {
    const { query = "winning products on tiktok", ...opts } = req.body || {};
    res.json(await scan(String(query), opts));
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
});

app.get("/api/health", (_req, res) => res.json({ ok: true, source: process.env.DATA_SOURCE || "mock" }));

const server = http.createServer(app);
attachLiveBrowser(server); // live, clickable TikTok browser over WebSocket at /live

const PORT = process.env.PORT || 3000;
server.listen(PORT, () =>
  console.log(`XSEARCH running → http://localhost:${PORT}  (source: ${process.env.DATA_SOURCE || "mock"})  | live browser: ws /live`)
);

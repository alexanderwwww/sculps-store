// XSEARCH backend. Serves the UI and exposes the scan API.
// Keys live here (server-side) — never in the browser.

import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { scan } from "./lib/pipeline.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// POST /api/scan { query, limit?, sinceDays?, region? }  -> ranked products
app.post("/api/scan", async (req, res) => {
  try {
    const { query = "winning products on tiktok", ...opts } = req.body || {};
    const result = await scan(String(query), opts);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/health", (_req, res) => res.json({ ok: true, source: process.env.DATA_SOURCE || "mock" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`XSEARCH running → http://localhost:${PORT}  (source: ${process.env.DATA_SOURCE || "mock"})`));

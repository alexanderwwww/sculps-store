// Free public APIs, no keys. One polite queue so GeckoTerminal's ~30 calls/min is never exceeded.
const GAP_MS = 2200;
let last = 0;
export async function getJson(url, { tries = 4 } = {}) {
  for (let i = 0; i < tries; i++) {
    const wait = last + GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    try {
      const r = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20000) });
      if (r.status === 429) { await new Promise((x) => setTimeout(x, 8000 * (i + 1))); continue; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) { if (i === tries - 1) throw new Error(`${url}: ${e.message}`); await new Promise((x) => setTimeout(x, 1500 * (i + 1))); }
  }
}

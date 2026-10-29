// The link: Ultra tells Claude what it is doing every 10 s and takes pause / resume / flatten / strategy-number orders back.
// Nothing secret is sent (no keys, no wallet secrets). The orders cannot raise a money limit: the worker only lets strategy numbers through.
export const DEFAULT_LINK = "https://kerberos.gardenbuddystore.workers.dev/ultra/YFu9uEm3fUwr928Yn70Qov73wVWbEZj";
export const SAFE_KEYS = ["whaleUsd", "loserCoolMin", "liveMinLiq", "lockFrom", "lockAt", "liveMinVol5", "liveBuyRatio", "momSecs", "momMin", "staleMin", "staleRet", "nearHigh", "minAgeMin", "maxAgeMin", "breakoutLookback", "volSpike", "minGreen", "minLiqUsd", "sl", "tp", "trailFrom", "trail", "maxHoldMin", "cooldownMin", "maxChase", "minBuyShare", "edgeMinN", "edgeFloor"];

export function startLink({ base = process.env.ULTRA_LINK || DEFAULT_LINK, getState, getEngine, onStart = null, onSet = null, fetchImpl = fetch, statusMs = 10000, orderMs = 4000 } = {}) {
  if (!base || base === "off") return { stop() {}, lastError: null };
  const root = String(base).replace(/\/+$/, "");
  const self = { lastError: null, applied: [], stop() { clearInterval(a); clearInterval(b); } };
  const call = async (method, slot, body) => {
    try {
      const res = await fetchImpl(`${root}/${slot}`, { method, headers: body === undefined ? {} : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(8000), cache: "no-store" });
      if (!res.ok) throw new Error(`${method} ${slot}: HTTP ${res.status}`);
      self.lastError = null; const t = await res.text(); return t ? JSON.parse(t) : null;
    } catch (e) { self.lastError = String(e.message || e); return undefined; }
  };
  let logged = 0;   // every decision (buy, sell, filter, skip) also goes to the log, so Claude collects the full history to tune from
  const a = setInterval(() => { try {
    const st = getState(); call("POST", "status", { at: Date.now(), ...st });
    const evs = (st.engine?.events || []).filter((x) => x.seq > logged);
    if (evs.length) { logged = evs[evs.length - 1].seq; call("POST", "log", { lines: evs.slice(-50) }); }
  } catch (e) { self.lastError = String(e.message || e); } }, statusMs);
  const b = setInterval(async () => {
    const o = await call("GET", "order"); const eng = getEngine();
    if (!o || !o.cmd) return;
    if (o.cmd === "start") { try { if (!eng && onStart) await onStart(); self.applied.push({ cmd: "start", at: Date.now() }); } catch (e) { self.lastError = `order start: ${e.message}`; } return; }
    if (!eng) return;
    try {
      if (o.cmd === "pause") eng.paused = true;
      else if (o.cmd === "resume") eng.paused = false;
      else if (o.cmd === "flatten") await eng.flatten();
      else if (o.cmd === "set" && o.cfg) { const ok = {}; for (const [k, v] of Object.entries(o.cfg)) if (SAFE_KEYS.includes(k) && Number.isFinite(v)) { eng.cfg[k] = v; ok[k] = v; } onSet?.(ok); }
      self.applied.push({ cmd: o.cmd, cfg: o.cfg, at: Date.now() }); self.applied = self.applied.slice(-10);
    } catch (e) { self.lastError = `order ${o.cmd}: ${e.message}`; }
  }, orderMs);
  a.unref?.(); b.unref?.();
  return self;
}

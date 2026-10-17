/*
 * The control plane: the live Kerberos route /research/<key>.
 *
 *   get(slot)          hunt | order (read-once) | runtime | skills -> JSON or null
 *   status(obj)        POST /status
 *   log(line)          buffered; flushed at most every 3 s, 20 lines a POST,
 *                      one POST at a time (the server appends read-modify-write)
 *   report(id, rep)    POST /report
 *   flush()            send what is buffered now (on exit)
 *
 * Nothing here throws. A network failure answers null / false, is remembered
 * in `lastError`, and the next call tries again; GETs back off while the
 * network is down so a dead Wi-Fi does not become a busy loop.
 */

export const DEFAULT_BASE = "https://kerberos.gardenbuddystore.workers.dev/research/SUSwMWKlnnu0jiEOVkEJuF1smRni9Lvk";

export function createCloud(base = process.env.ULTRA_CLOUD || DEFAULT_BASE, opts = {}) {
  const root = String(base).replace(/\/+$/, "");
  const timeoutMs = opts.timeoutMs ?? 15000;
  const flushEvery = opts.flushEvery ?? 3000;
  const echo = opts.echo ?? ((l) => console.log(l));
  let lastError = null;
  let failures = 0;
  let downUntil = 0;
  const buffer = [];
  let flushing = null;
  let timer = null;

  async function call(method, slot, body) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${root}/${slot}`, {
        method,
        headers: body === undefined ? {} : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`${method} ${slot}: HTTP ${res.status}`);
      const text = await res.text();
      failures = 0; downUntil = 0; lastError = null;
      if (!text) return null;
      try { return JSON.parse(text); } catch { return null; }
    } catch (e) {
      failures++;
      lastError = e && e.name === "AbortError" ? `${method} ${slot}: timed out` : String(e && e.message || e);
      downUntil = Date.now() + Math.min(60000, 1000 * 2 ** Math.min(failures, 6));
      return undefined;
    } finally {
      clearTimeout(t);
    }
  }

  async function get(slot) {
    if (Date.now() < downUntil) return undefined;
    return call("GET", slot);
  }

  async function post(slot, body) {
    const r = await call("POST", slot, body);
    return r !== undefined;
  }

  async function flush() {
    if (flushing) { await flushing; }
    if (!buffer.length) return true;
    flushing = (async () => {
      while (buffer.length) {
        const lines = buffer.slice(0, 20);
        const ok = await post("log", { lines });
        if (!ok) return false;
        buffer.splice(0, lines.length);
      }
      return true;
    })();
    try { return await flushing; } finally { flushing = null; }
  }

  function log(line) {
    const l = `${new Date().toISOString().slice(11, 19)} ${String(line)}`;
    echo(l);
    buffer.push(String(line).slice(0, 400));
    if (buffer.length > 400) buffer.splice(0, buffer.length - 400);
    if (!timer) {
      timer = setTimeout(async () => { timer = null; await flush(); if (buffer.length && !timer) timer = setTimeout(() => { timer = null; flush(); }, flushEvery); }, flushEvery);
      if (timer.unref) timer.unref();
    }
  }

  return {
    base: root,
    get,
    status: (s) => post("status", s),
    report: (id, report) => post("report", { id, report }),
    log,
    flush,
    get lastError() { return lastError; },
    get pending() { return buffer.length; },
  };
}

/** goals.md: simple `key: value` lines. Lenient; anything missing is null. */
export function parseGoals(text) {
  const out = { budget: null, daily_target: null, niches: null, never: null, currency: null };
  if (!text) return out;
  for (const raw of String(text).split(/\r?\n/)) {
    const m = /^\s*[-*]?\s*([a-z_ ]+?)\s*[:=]\s*(.+?)\s*$/i.exec(raw);
    if (!m) continue;
    const key = m[1].toLowerCase().replace(/\s+/g, "_");
    if (!(key in out)) continue;
    const v = m[2];
    if (key === "niches" || key === "never") out[key] = v.split(",").map((s) => s.trim()).filter(Boolean);
    else if (key === "budget" || key === "daily_target") {
      const n = Number(v.replace(/[^0-9.]/g, ""));
      out[key] = Number.isFinite(n) && v.replace(/[^0-9.]/g, "") ? n : null;
    } else out[key] = v;
  }
  return out;
}

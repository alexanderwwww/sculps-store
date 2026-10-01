/**
 * The line to Claude. The app reports what it is doing and asks for orders; nothing connects IN to the
 * Mac. Orders come from a short, fixed list (see app/routes/xugc.$.tsx) and every one is re-validated
 * by main.js before it does anything. There is no order that changes code, keys or spending limits.
 */
const BASE = "https://kerberos.gardenbuddystore.workers.dev/xugc/dc38a4e4a6a658a15bf83def99875381166d00015767c80f";

class Bridge {
  /** @param {{base?: string, getStatus: ()=>object, onOrder: (o:object)=>Promise<object>, fetch?: Function, intervalMs?: number}} o */
  constructor(o) {
    this.base = o.base || BASE; this.getStatus = o.getStatus; this.onOrder = o.onOrder;
    this.fetch = o.fetch || globalThis.fetch; this.intervalMs = o.intervalMs || 3000;
    this.seen = new Set(); this.pending = { ack: [], results: [] };
    this.connected = false; this.lastOk = 0; this.mcpSeen = null; this.timer = null; this.busy = false; this.log = [];
  }
  url() { return this.base + "/mcp"; }
  note(line) { this.log.push({ at: Date.now(), line }); this.log = this.log.slice(-25); }
  async post(p, body) { const r = await this.fetch(this.base + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(`${p} ${r.status}`); return r; }

  async tick() {
    if (this.busy) return; this.busy = true;
    try {
      await this.post("/status", this.getStatus());
      const r = await this.fetch(this.base + "/orders"); if (!r.ok) throw new Error("orders " + r.status);
      const { orders, mcpSeen } = await r.json(); this.mcpSeen = mcpSeen || null;
      for (const o of orders || []) {
        if (this.seen.has(o.id)) { this.pending.ack.push(o.id); continue; }
        this.seen.add(o.id); this.pending.ack.push(o.id);
        this.note(`Claude asked: ${o.type}`);
        this.pending.results.push({ id: o.id, state: "started" });
        Promise.resolve().then(() => this.onOrder(o)).then(
          (res) => { this.note(`${o.type}: ${res && res.ok === false ? "refused: " + res.error : "done"}`); this.pending.results.push({ id: o.id, state: res && res.ok === false ? "refused" : "done", ...(res || {}) }); },
          (err) => { this.note(`${o.type}: failed: ${err.message}`); this.pending.results.push({ id: o.id, state: "error", error: err.message, ...(err.costUsd ? { costUsd: err.costUsd } : {}) }); },
        );
      }
      if (this.pending.ack.length || this.pending.results.length) { const send = this.pending; this.pending = { ack: [], results: [] }; try { await this.post("/orders", send); } catch (e) { this.pending.ack.push(...send.ack); this.pending.results.push(...send.results); throw e; } }
      this.connected = true; this.lastOk = Date.now();
    } catch (e) { this.connected = false; this.lastError = e.message; }
    finally { this.busy = false; }
  }
  /** Send a finished video up so Claude can watch it. */
  async upload(name, buffer) {
    const r = await this.fetch(`${this.base}/take?name=${encodeURIComponent(name)}`, { method: "POST", headers: { "content-type": "video/mp4" }, body: buffer });
    if (!r.ok) throw new Error(`upload ${r.status}`); return (await r.json()).url;
  }
  start() { if (this.timer) return; this.tick(); this.timer = setInterval(() => this.tick(), this.intervalMs); }
  stop() { clearInterval(this.timer); this.timer = null; this.connected = false; }
}
module.exports = { Bridge, BASE };

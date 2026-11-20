// The Mac's side of finger-link. Three loops that never wait on each other: the heartbeat
// (every 5 s, whatever else is happening), the take loop, and the loop that posts results.
//
// A result is written to the outbox on disk BEFORE it is posted, and stays there until
// finger-link has taken it. So a result is never dropped because the link was down for a
// while, or because finger was restarted: it is posted again until it is accepted. The ids
// still waiting ride in every heartbeat ("undelivered").
import fs from 'node:fs';

const HEARTBEAT_MS = 5000;
const TAKE_MS = 500;
const KEEP_MS = 60 * 60 * 1000; // finger-link forgets a call after an hour (link/core.mjs), so does the outbox
// The most one result may weigh. A result is stored by finger-link as one SQLite string,
// and a Durable Object allows 8 MB for a string or a row (SOURCES.md section 4); this is
// half of that. link/core.mjs checks the same number on its side.
export const MAX_RESULT_BYTES = 4 * 1000 * 1000;

export class Link {
  // base: https://<worker>/k/<key>    getStatus(): the heartbeat body    onCommand(cmd): runs it, returns the result
  // outboxFile: where results wait until finger-link has them (null: kept in memory only)
  constructor({ base, getStatus, onCommand, outboxFile = null, heartbeatMs = HEARTBEAT_MS, takeMs = TAKE_MS, retryMs = 1000, now = Date.now }) {
    Object.assign(this, { base, getStatus, onCommand, outboxFile, heartbeatMs, takeMs, retryMs, now });
    this.running = false;
    this.lastError = null;
    this.lastOkAt = null;
    this.timers = {};  // one handle per loop
    this.outbox = {};  // id -> { tool, result, at }
    this.flushing = false;
    if (outboxFile && fs.existsSync(outboxFile)) {
      try { this.outbox = JSON.parse(fs.readFileSync(outboxFile, 'utf8')) || {}; } catch { this.outbox = {}; }
    }
  }

  async post(path, body) {
    const res = await fetch(`${this.base}/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`finger-link ${path} answered HTTP ${res.status}`);
    return res.json();
  }

  saveOutbox() {
    if (!this.outboxFile) return;
    const tmp = `${this.outboxFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.outbox));
    fs.renameSync(tmp, this.outboxFile);
  }

  async beat() {
    try {
      await this.post('heartbeat', { ...this.getStatus(), linkError: this.lastError, undelivered: Object.keys(this.outbox) });
      this.lastOkAt = Date.now();
      this.lastError = null;
    } catch (e) {
      this.lastError = e.message;
    }
  }

  async takeOnce() {
    let commands;
    try {
      ({ commands } = await this.post('take', {}));
    } catch (e) {
      this.lastError = e.message;
      return;
    }
    // Not awaited: each command runs in its phone's lane, and the take loop keeps turning.
    for (const cmd of Array.isArray(commands) ? commands : []) this.deliver(cmd).catch((e) => { this.lastError = e.message; });
  }

  async deliver(cmd) {
    let result;
    try {
      result = await this.onCommand(cmd);
    } catch (e) {
      result = { ok: false, code: e.code || 'ERROR', error: e.message };
    }
    const bytes = Buffer.byteLength(JSON.stringify(result === undefined ? null : result), 'utf8');
    if (bytes > MAX_RESULT_BYTES) {
      result = { ok: false, code: 'RESULT_TOO_BIG', error: `the result was ${bytes} bytes, over the ${MAX_RESULT_BYTES} that can be sent. The call itself was carried out; look again with mode "tree".` };
    }
    this.outbox[cmd.id] = { tool: cmd.tool, result, at: this.now() };
    this.saveOutbox();
    await this.flush();
  }

  // Posts everything in the outbox. An entry leaves only when finger-link answered for it.
  async flush() {
    if (this.flushing) { this.again = true; return; } // a result came in meanwhile: go round once more
    this.flushing = true;
    this.again = false;
    try {
      for (const [id, entry] of Object.entries(this.outbox)) {
        if (this.now() - entry.at > KEEP_MS) { delete this.outbox[id]; this.saveOutbox(); continue; }
        try {
          await this.post('result', { id, result: entry.result });
          delete this.outbox[id];
          this.saveOutbox();
        } catch (e) {
          this.lastError = `result for ${entry.tool} not delivered yet: ${e.message}`;
          this.again = false;
          break; // the link is down: try again on the next turn of the loop
        }
      }
    } finally {
      this.flushing = false;
    }
    if (this.again && this.running) await this.flush();
  }

  start() {
    this.running = true;
    const loop = (name, fn, ms) => {
      const tick = async () => {
        if (!this.running) return;
        try { await fn(); } catch (e) { this.lastError = e.message; } // a loop never dies
        if (this.running) this.timers[name] = setTimeout(tick, ms);
      };
      tick();
    };
    loop('beat', () => this.beat(), this.heartbeatMs);
    loop('take', () => this.takeOnce(), this.takeMs);
    loop('flush', () => this.flush(), this.retryMs);
  }

  stop() {
    this.running = false;
    Object.values(this.timers).forEach(clearTimeout);
    this.timers = {};
  }
}

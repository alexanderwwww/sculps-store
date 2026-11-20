// The Mac's side of finger-link. Two loops that never wait on each other: the heartbeat
// (every 5 s, whatever else is happening) and the take loop. A result is posted with
// retries, and the last error rides in the next heartbeat.
const HEARTBEAT_MS = 5000;
const TAKE_MS = 500;
const RESULT_TRIES = 5;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Link {
  // base: https://<worker>/k/<key>    getStatus(): the heartbeat body    onCommand(cmd): runs it, returns the result
  constructor({ base, getStatus, onCommand, heartbeatMs = HEARTBEAT_MS, takeMs = TAKE_MS, retryMs = 1000 }) {
    Object.assign(this, { base, getStatus, onCommand, heartbeatMs, takeMs, retryMs });
    this.running = false;
    this.lastError = null;
    this.lastOkAt = null;
    this.timers = [];
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

  async beat() {
    try {
      await this.post('heartbeat', { ...this.getStatus(), linkError: this.lastError });
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
    for (const cmd of commands || []) this.deliver(cmd);
  }

  async deliver(cmd) {
    let result;
    try {
      result = await this.onCommand(cmd);
    } catch (e) {
      result = { ok: false, code: e.code || 'ERROR', error: e.message };
    }
    for (let i = 0; i < RESULT_TRIES && this.running; i++) {
      try {
        await this.post('result', { id: cmd.id, result });
        return;
      } catch (e) {
        this.lastError = `result for ${cmd.tool} not delivered: ${e.message}`;
        await sleep(this.retryMs * (i + 1));
      }
    }
  }

  start() {
    this.running = true;
    const loop = (fn, ms) => {
      const tick = async () => {
        if (!this.running) return;
        await fn();
        if (this.running) this.timers.push(setTimeout(tick, ms));
      };
      tick();
    };
    loop(() => this.beat(), this.heartbeatMs);
    loop(() => this.takeOnce(), this.takeMs);
  }

  stop() {
    this.running = false;
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }
}

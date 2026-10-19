/*
 * The brain looks at 2-3 things at once: each lane is its own async loop with
 * its own timing (scan GMGN, read narratives, manage positions). A slow lane
 * never blocks another: they share data through plain maps, not through awaits
 * on each other. A lane that throws logs the error and keeps its rhythm.
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

export class Lanes {
  constructor({ log = () => {} } = {}) {
    this.log = log;
    this.lanes = [];
    this.stopped = false;
  }
  /** fn(now) runs every `everyMs` (measured start to start; a slow tick starts the next at once). */
  add(name, everyMs, fn) {
    this.lanes.push({ name, everyMs, fn, ticks: 0, errors: 0, lastMs: 0, busy: false, lastAt: 0 });
    return this;
  }
  stop() { this.stopped = true; }
  stats() { return Object.fromEntries(this.lanes.map((l) => [l.name, { ticks: l.ticks, errors: l.errors, lastMs: l.lastMs }])); }

  async run({ until = Infinity } = {}) {
    await Promise.all(this.lanes.map(async (l) => {
      while (!this.stopped && Date.now() < until) {
        const t0 = Date.now();
        l.busy = true;
        try { await l.fn(t0); } catch (e) { l.errors++; this.log({ type: "lane-error", lane: l.name, error: String(e && e.message || e).slice(0, 200) }); }
        l.busy = false;
        l.ticks++;
        l.lastMs = Date.now() - t0;
        l.lastAt = t0;
        const wait = l.everyMs - l.lastMs;
        // sleep in short slices so stop() is honoured quickly
        for (let left = Math.min(wait, until - Date.now()); left > 0 && !this.stopped; left -= 200) await sleep(Math.min(200, left));
      }
    }));
  }
}

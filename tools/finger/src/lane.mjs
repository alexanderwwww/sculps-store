// One lane per iPhone (per UDID). A lane does one thing at a time, in the order asked.
// Two lanes run side by side. The health check is lane work too: it only goes into the
// queue when the lane is idle, so it can never sit behind, or be mistaken for, a slow command
// (WDA answers every route on one queue: WebDriverAgentLib/Routing/FBWebServer.m:80).
import { WdaClient } from './wda-client.mjs';
import { WDA_PORT } from './routes.mjs';
import { LookStore } from './screen.mjs';
import { look, runSteps } from './actions.mjs';
import { Refusal } from './guard.mjs';

export const HEALTH_FAILS_TO_DEAD = 3;

export class Lane {
  constructor({ udid, usbmux, registry, profile = null, now = Date.now, resize = null }) {
    this.udid = udid;
    this.registry = registry;
    this.wda = new WdaClient({ connect: () => usbmux.connect(registry.deviceId(udid), WDA_PORT) });
    this.ctx = { wda: this.wda, looks: new LookStore(), udid, profile, now, resize };
    this.tail = Promise.resolve();
    this.pending = 0;
    this.state = 'UNKNOWN'; // ABSENT | STARTING | READY | LOCKED | ALERT | DEAD
    this.lastError = null;
    this.alert = null;
    this.healthFails = 0;
    this.lastLookAt = null;
  }

  get idle() { return this.pending === 0; }

  // Puts a job at the end of this lane's queue.
  run(job) {
    this.pending++;
    const next = this.tail.then(async () => {
      try { return await job(); } finally { this.pending--; }
    });
    this.tail = next.catch(() => {});
    return next;
  }

  note(e) {
    this.lastError = e.message;
    if (e.code === 'NOT_PLUGGED' || e.code === 'BAD_DEVICE') this.state = 'ABSENT';
    else if (e.code === 'REFUSED') this.state = 'STARTING';
  }

  // Before any command: plugged in, WDA answering, not locked, and one pop-up check.
  async preflight() {
    if (!this.registry.isAttached(this.udid)) {
      this.state = 'ABSENT';
      throw new Refusal('NOT_PLUGGED', `${this.registry.label(this.udid)}: not plugged in`);
    }
    let locked;
    try {
      locked = await this.wda.call('locked');
    } catch (e) {
      this.note(e);
      if (e.code === 'REFUSED') throw new Refusal('WDA_NOT_RUNNING', `${this.registry.label(this.udid)}: the phone is plugged in but finger is not running on it yet`);
      if (e.code === 'BAD_DEVICE' || e.code === 'NOT_PLUGGED') throw new Refusal('NOT_PLUGGED', `${this.registry.label(this.udid)}: not plugged in`);
      throw e;
    }
    if (locked === true) {
      this.state = 'LOCKED';
      throw new Refusal('LOCKED', `${this.registry.label(this.udid)}: unlock it`);
    }
    this.alert = await this.wda.alertText();
    this.state = this.alert === null ? 'READY' : 'ALERT';
    this.healthFails = 0;
  }

  async guarded(job) {
    try {
      return await job();
    } catch (e) {
      this.note(e);
      throw e;
    }
  }

  look(mode) {
    return this.run(() => this.guarded(async () => {
      await this.preflight();
      const seen = await look(this.ctx, mode);
      this.lastLookAt = this.ctx.now();
      return { ...seen, alert: this.alert };
    }));
  }

  act(steps, then = 'tree') {
    return this.run(() => this.guarded(async () => {
      if (!['tree', 'image', 'both', 'none'].includes(then)) throw new Refusal('BAD_REQUEST', 'then is tree, image, both or none');
      await this.preflight();
      const done = await runSteps(this.ctx, steps, { alertOpen: this.alert });
      // A failed step gets one pop-up check, because a pop-up is the usual reason.
      if (!done.ok) this.alert = await this.wda.alertText().catch(() => this.alert);
      else if (this.alert !== null) this.alert = await this.wda.alertText().catch(() => null);
      this.state = this.alert === null ? 'READY' : 'ALERT';
      let after = null;
      if (then !== 'none') {
        try {
          after = await look(this.ctx, then);
          this.lastLookAt = this.ctx.now();
        } catch (e) {
          after = { error: e.message, code: e.code || 'ERROR' };
        }
      }
      return { ...done, alert: this.alert, after };
    }));
  }

  // A job that needs the lane to itself with its checks done (the buy sequence).
  exclusive(job) {
    return this.run(() => this.guarded(async () => {
      await this.preflight();
      if (this.alert !== null) throw new Refusal('ALERT_OPEN', `a pop-up is open: "${this.alert}"`);
      return job(this.ctx);
    }));
  }

  // Called on a timer. Does nothing unless the lane is idle and the phone is plugged in.
  // Returns true when a check was queued.
  healthTick() {
    if (!this.idle || !this.registry.isAttached(this.udid)) return false;
    this.run(async () => {
      try {
        const s = await this.wda.call('status');
        if (!s || s.ready !== true) throw new Error('WDA says it is not ready');
        this.healthFails = 0;
        if (this.state === 'UNKNOWN' || this.state === 'STARTING' || this.state === 'DEAD' || this.state === 'ABSENT') this.state = 'READY';
      } catch (e) {
        this.lastError = e.message;
        if (e.code === 'REFUSED') { this.state = 'STARTING'; return; }
        if (e.code === 'BAD_DEVICE' || e.code === 'NOT_PLUGGED') { this.state = 'ABSENT'; return; }
        this.healthFails++;
        if (this.healthFails >= HEALTH_FAILS_TO_DEAD) this.state = 'DEAD';
      }
    });
    return true;
  }

  onDetach() { this.state = 'ABSENT'; this.alert = null; }
  onAttach() { if (this.state === 'ABSENT' || this.state === 'UNKNOWN') this.state = 'STARTING'; }

  status() {
    return {
      udid: this.udid,
      label: this.registry.label(this.udid),
      attached: this.registry.isAttached(this.udid),
      state: this.registry.isAttached(this.udid) ? this.state : 'ABSENT',
      alert: this.alert,
      lastError: this.lastError,
      lastLookAgeMs: this.lastLookAt === null ? null : this.ctx.now() - this.lastLookAt,
      busy: !this.idle,
    };
  }
}

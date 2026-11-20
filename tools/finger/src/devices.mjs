// Which iPhones are plugged in, keyed by UDID. An alias (1, 2, ...) is bound to a UDID the
// first time that phone is seen and never changes, so a replug in a different order cannot
// swap phones. usbmux's DeviceID changes on every attach and is re-read each time.
import fs from 'node:fs';

export class DeviceError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const key = (udid) => String(udid).toLowerCase();
const isAlias = (v) => /^\d{1,2}$/.test(String(v));

export class Registry {
  constructor({ file }) {
    this.file = file;
    this.known = {};      // key -> { alias, udid, firstSeen }
    this.attached = new Map(); // key -> deviceId
    if (fs.existsSync(file)) this.known = JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  attach({ deviceId, udid }) {
    const k = key(udid);
    if (!this.known[k]) {
      const used = Object.values(this.known).map((d) => d.alias);
      this.known[k] = { alias: used.length ? Math.max(...used) + 1 : 1, udid, firstSeen: new Date().toISOString() };
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.known, null, 2));
      fs.renameSync(tmp, this.file);
    }
    this.attached.set(k, deviceId);
    return this.known[k];
  }

  detach(deviceId) {
    for (const [k, id] of this.attached) {
      if (id === deviceId) { this.attached.delete(k); return this.known[k]; }
    }
    return null;
  }

  isAttached(udid) { return this.attached.has(key(udid)); }

  deviceId(udid) {
    const id = this.attached.get(key(udid));
    if (id === undefined) throw new DeviceError('NOT_PLUGGED', `${this.label(udid)}: not plugged in`);
    return id;
  }

  // "iPhone 1 (...A1B2)": alias plus the last four of the UDID, on every result.
  label(udid) {
    const d = this.known[key(udid)];
    return d ? `iPhone ${d.alias} (...${d.udid.slice(-4)})` : `unknown iPhone (...${String(udid).slice(-4)})`;
  }

  list() {
    return Object.entries(this.known)
      .map(([k, d]) => ({ udid: d.udid, alias: d.alias, last4: d.udid.slice(-4), attached: this.attached.has(k) }))
      .sort((a, b) => a.alias - b.alias);
  }

  // Turns what a tool call named into a UDID.
  //   forBuy: must be a full UDID. Never an alias, never left out.
  //   otherwise: UDID or alias; may be left out only when exactly one phone is plugged in.
  resolve(device, { forBuy = false } = {}) {
    if (forBuy) {
      if (typeof device !== 'string' || isAlias(device) || !this.known[key(device)]) {
        throw new DeviceError('BUY_NEEDS_UDID', 'a buy must name the phone by its full UDID');
      }
      return this.known[key(device)].udid;
    }
    if (device === undefined || device === null || device === '') {
      if (this.attached.size !== 1) {
        throw new DeviceError('DEVICE_REQUIRED', `say which phone: ${this.attached.size} are plugged in`);
      }
      return this.known[[...this.attached.keys()][0]].udid;
    }
    if (isAlias(device)) {
      const d = Object.values(this.known).find((x) => x.alias === Number(device));
      if (!d) throw new DeviceError('UNKNOWN_DEVICE', `no iPhone ${device} has ever been plugged in`);
      return d.udid;
    }
    const d = this.known[key(device)];
    if (!d) throw new DeviceError('UNKNOWN_DEVICE', `no phone with UDID ending ${String(device).slice(-4)} has been plugged in`);
    return d.udid;
  }
}

/** One small JSON file in the app's own folder. Nothing else is persisted. */
const fs = require("node:fs");
const path = require("node:path");

const DEFAULTS = () => ({
  settings: { mode: "demo", capJob: 5, capDay: 20, capTrain: 40 },
  spent: { day: "", usd: 0 },
  takes: [],
  dataset: [],
  models: [
    { id: "wan22", name: "Wan 2.2", kind: "base", note: "base · rented GPU" },
  ],
});

class Store {
  constructor(dir) { this.file = path.join(dir, "xugc.json"); fs.mkdirSync(dir, { recursive: true }); this.state = this.load(); }
  load() {
    try { const d = JSON.parse(fs.readFileSync(this.file, "utf8")); const base = DEFAULTS(); return { ...base, ...d, settings: { ...base.settings, ...d.settings } }; }
    catch { return DEFAULTS(); }
  }
  read() { return this.state; }
  update(fn) { fn(this.state); fs.writeFileSync(this.file + ".tmp", JSON.stringify(this.state)); fs.renameSync(this.file + ".tmp", this.file); return this.state; }
}
module.exports = { Store, DEFAULTS };

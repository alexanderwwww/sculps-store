/** One small JSON file in the app's own folder. Keys live in secrets.js; style files in their own folder. */
const fs = require("node:fs");
const path = require("node:path");

const BASE = { id: "xugc", name: "XUGC", kind: "base", note: "your engine" };
const DEFAULTS = () => ({
  settings: { capJob: 5, capDay: 20, volumeId: "", mcpOn: true, autoApprove: false },
  spent: { day: "", usd: 0 },
  styleOff: [],
  product: null,
  reference: null,
  takes: [],
  dataset: [],
  models: [BASE],
});

class Store {
  constructor(dir) { this.file = path.join(dir, "xugc.json"); fs.mkdirSync(dir, { recursive: true }); this.state = this.load(); }
  load() {
    try {
      const d = JSON.parse(fs.readFileSync(this.file, "utf8")); const base = DEFAULTS();
      const s = { ...base, ...d, settings: { ...base.settings, ...d.settings } };
      for (const k of ["mode", "capTrain"]) delete s.settings[k];
      delete s.seeded; delete s.proof;
      // Older builds left pretend takes and a Wan model behind. Only real takes and the engine entry stay.
      s.takes = s.takes.filter((t) => !t.demo);
      s.models = [BASE];
      s.dataset = s.dataset.filter((c) => !String(c.file || "").startsWith("assets/") && c.id !== "seed-1");
      return s;
    } catch { return DEFAULTS(); }
  }
  read() { return this.state; }
  update(fn) { fn(this.state); fs.writeFileSync(this.file + ".tmp", JSON.stringify(this.state)); fs.renameSync(this.file + ".tmp", this.file); return this.state; }
}
module.exports = { Store, DEFAULTS, BASE };

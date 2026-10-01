/** One small JSON file in the app's own folder. Nothing else is persisted (the RunPod key lives in secrets.js). */
const fs = require("node:fs");
const path = require("node:path");

const DEFAULTS = () => ({
  settings: { capJob: 5, capDay: 20, capTrain: 40, volumeId: "" },
  spent: { day: "", usd: 0 },
  proof: { dryTrain: false, firstClip: false },
  takes: [],
  dataset: [],
  models: [{ id: "wan22", name: "Wan 2.2", kind: "base", note: "base model" }],
});

class Store {
  constructor(dir) { this.file = path.join(dir, "xugc.json"); fs.mkdirSync(dir, { recursive: true }); this.state = this.load(); }
  load() {
    try {
      const d = JSON.parse(fs.readFileSync(this.file, "utf8")); const base = DEFAULTS();
      const s = { ...base, ...d, settings: { ...base.settings, ...d.settings }, proof: { ...base.proof, ...(d.proof || {}) } };
      delete s.settings.mode; delete s.seeded;
      // The old demo build left pretend takes, pretend models and a bundled sample clip behind. None of it is real.
      s.takes = s.takes.filter((t) => !t.demo);
      s.models = s.models.filter((m) => !m.demo);
      if (!s.models.some((m) => m.id === "wan22")) s.models.unshift(base.models[0]);
      s.dataset = s.dataset.filter((c) => !String(c.file || "").startsWith("assets/") && c.id !== "seed-1");
      return s;
    } catch { return DEFAULTS(); }
  }
  read() { return this.state; }
  update(fn) { fn(this.state); fs.writeFileSync(this.file + ".tmp", JSON.stringify(this.state)); fs.renameSync(this.file + ".tmp", this.file); return this.state; }
}
module.exports = { Store, DEFAULTS };

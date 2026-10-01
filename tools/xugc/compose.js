/**
 * The Style Bible and the prompt it builds.
 *
 * Every .md file has two machine-read sections: "## Prompt" (bullet lines that are WRITTEN INTO the
 * video prompt) and "## Never" (bullet lines folded into an "Avoid" sentence). Anything else in the file
 * is for humans. Only enabled files count. No model is involved here: the same inputs always produce the
 * same prompt, so a bad video can be traced to the words that made it.
 */
const fs = require("node:fs");
const path = require("node:path");

const NAME = /^[a-z0-9][a-z0-9-]{0,38}\.md$/;
const MAX_FILE = 20000;

const LOOKS = {
  Selfie: "She films herself selfie-style and talks straight to the camera.",
  Unboxing: "She unboxes the product on a table and shows it to the camera.",
  Demo: "She demonstrates the product and points at what it does.",
  Testimonial: "She talks to the camera like a friend recommending the product.",
};
const AVATARS = {
  broad: "An ordinary, real-looking person with everyday clothes and a lived-in room behind them.",
  maya: "Maya, 24, light brown skin, dark wavy hair in a clip, oversized grey hoodie, bedroom with a desk lamp.",
  jordan: "Jordan, 27, tall, short cropped hair, black t-shirt, living room with a plant and a sofa.",
  ava: "Ava, 31, freckles, red hair tied back, denim shirt, bright kitchen.",
  leo: "Leo, 22, stubble, beanie, green puffer vest, hallway with coats on hooks.",
  sofia: "Sofia, 35, long dark hair, cream knit sweater, cosy front room at night.",
};
const QUALITY = { draft: { w: 512, h: 896, label: "Draft 480p", cost: 0.5 }, hd: { w: 704, h: 1280, label: "HD 720p", cost: 1 }, full: { w: 1088, h: 1920, label: "Full 1080p", cost: 2.2 } };
const SECONDS = { 5: 121, 10: 241, 15: 361, 20: 481 };

function sections(md) {
  const out = { prompt: [], never: [] }; let cur = null;
  for (const line of String(md).split("\n")) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) { const k = h[1].toLowerCase(); cur = k === "prompt" ? "prompt" : k === "never" ? "never" : null; continue; }
    const b = /^\s*[-*]\s+(.+?)\s*$/.exec(line);
    if (cur && b) out[cur].push(b[1].replace(/\s+/g, " "));
  }
  return out;
}

class Style {
  /** @param {string} dir  where the .md files live  @param {string} seedDir  starter files shipped with the app */
  constructor(dir, seedDir) {
    this.dir = dir; fs.mkdirSync(dir, { recursive: true });
    if (!fs.readdirSync(dir).some((f) => f.endsWith(".md")) && seedDir && fs.existsSync(seedDir)) for (const f of fs.readdirSync(seedDir)) if (NAME.test(f)) fs.copyFileSync(path.join(seedDir, f), path.join(dir, f));
  }
  list(off = []) {
    return fs.readdirSync(this.dir).filter((f) => NAME.test(f)).sort().map((f) => {
      const text = fs.readFileSync(path.join(this.dir, f), "utf8"); const s = sections(text);
      const firstProse = text.split("\n").find((l) => l.trim() && !l.startsWith("#")) || "";
      return { name: f, on: !off.includes(f), note: firstProse.slice(0, 140), lines: s.prompt.length + s.never.length, chars: text.length };
    });
  }
  read(name) { if (!NAME.test(name)) throw new Error("File names are lowercase letters, numbers and dashes, ending in .md"); return fs.readFileSync(path.join(this.dir, name), "utf8"); }
  write(name, text) {
    if (!NAME.test(name)) throw new Error("File names are lowercase letters, numbers and dashes, ending in .md");
    const t = String(text || ""); if (!t.trim() || t.length > MAX_FILE) throw new Error("A style file must have text and be under 20,000 characters.");
    fs.writeFileSync(path.join(this.dir, name), t); return name;
  }
  remove(name) { if (!NAME.test(name)) throw new Error("Bad file name."); try { fs.unlinkSync(path.join(this.dir, name)); } catch {} }
  /** Lines to write into the prompt and lines to avoid, from the enabled files. */
  gather(off = []) {
    const prompt = [], never = [];
    for (const f of this.list(off)) { if (!f.on) continue; const s = sections(this.read(f.name)); prompt.push(...s.prompt); never.push(...s.never); }
    return { prompt, never };
  }
}

const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();
const sentence = (t) => { const s = clean(t); return s ? (/[.!?]$/.test(s) ? s : s + ".") : ""; };

/**
 * @param {{scene: string, look?: string, avatar?: string, avatarText?: string, product?: {title?: string, desc?: string}, seconds: number}} job
 * @param {{prompt: string[], never: string[]}} bible
 */
function compose(job, bible) {
  const parts = [];
  parts.push(sentence(AVATARS[job.avatar] || clean(job.avatarText) || AVATARS.broad));
  if (job.product && clean(job.product.title)) parts.push(sentence(`The product is ${clean(job.product.title)}${job.product.desc ? ": " + clean(job.product.desc).slice(0, 220) : ""}`));
  parts.push(sentence(LOOKS[job.look] || ""));
  parts.push(sentence(job.scene));
  if (bible.prompt.length) parts.push(bible.prompt.map(sentence).join(" "));
  if (bible.never.length) parts.push("Avoid: " + bible.never.map((l) => clean(l).replace(/[.]+$/, "")).join("; ") + ".");
  parts.push(`About ${job.seconds} seconds, one continuous take.`);
  return parts.filter(Boolean).join(" ");
}

module.exports = { Style, compose, sections, LOOKS, AVATARS, QUALITY, SECONDS, NAME };

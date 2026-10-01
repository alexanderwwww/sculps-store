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

const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();
const NAME = /^[a-z0-9][a-z0-9-]{0,38}\.md$/;
const MAX_FILE = 20000;

const LOOKS = {
  None: "",
  Selfie: "She films herself selfie-style and talks straight to the camera.",
  Unboxing: "She unboxes the product on a table and shows it to the camera.",
  Demo: "She demonstrates the product and points at what it does.",
  Testimonial: "She talks to the camera like a friend recommending the product.",
};
const AVATARS = {
  none: "",
  broad: "Ordinary, real-looking people in everyday clothes.",
  maya: "Maya, 24, light brown skin, dark wavy hair in a clip, oversized grey hoodie, bedroom with a desk lamp.",
  jordan: "Jordan, 27, tall, short cropped hair, black t-shirt, living room with a plant and a sofa.",
  ava: "Ava, 31, freckles, red hair tied back, denim shirt, bright kitchen.",
  leo: "Leo, 22, stubble, beanie, green puffer vest, hallway with coats on hooks.",
  sofia: "Sofia, 35, long dark hair, cream knit sweater, cosy front room at night.",
};
const QUALITY = { draft: { w: 512, h: 896, label: "Draft 480p", cost: 0.5 }, hd: { w: 704, h: 1280, label: "HD 720p", cost: 1 }, full: { w: 1088, h: 1920, label: "Full 1080p", cost: 2.2 } };
const LEVELS = ["Off", "Mood only", "Same story", "Same shots and timing"];
/** How much of a viral reference ad goes into the prompt: 0 nothing, 1 mood, 2 story beats, 3 shot-by-shot with timings. */
function referenceText(ref, productTitle) {
  if (!ref || !ref.level || !String(ref.beats || "").trim()) return "";
  const beats = String(ref.beats).replace(/\s+/g, " ").trim().slice(0, 1800);
  const own = productTitle ? `Our product is ${clean(productTitle)}: show it, not anything from the reference.` : "";
  const never = "Do not copy any faces, clothes, text or the product design from the reference.";
  const better = "Make it better than the reference: more real and different people, a more convincing product, richer real sound, more believable phone footage.";
  if (ref.level === 1) return `Capture only the mood and energy of a clip that went viral: ${beats.split(/[.;]/)[0]}. ${never} ${own} ${better}`;
  if (ref.level === 2) return `Follow the same story beats, in the same order, as a clip that went viral: ${beats} ${never} ${own} ${better}`;
  return `Copy the shot order and the timing of a clip that went viral as closely as possible. Shot list with timings: ${beats} ${never} ${own} ${better}`;
}
const MUSIC = {
  none: "",
  soft: "A faint, low-volume trending phone-speaker beat plays far in the background of the whole video, quiet and slightly distorted, as if a neighbour's speaker is on.",
  drop: "A trending TikTok-style beat plays from a phone speaker, low and slightly distorted, building quietly then dropping hard with one big bass drop at the biggest moment of the video.",
};
const SECONDS = { 5: 121, 10: 241, 15: 361, 20: 481 };

function sections(md) {
  const out = { prompt: [], never: [], captions: [] }; let cur = null;
  for (const line of String(md).split("\n")) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) { const k = h[1].toLowerCase(); cur = k === "prompt" ? "prompt" : k === "never" ? "never" : k === "captions" ? "captions" : null; continue; }
    const b = /^\s*[-*]\s+(.+?)\s*$/.exec(line);
    if (cur && b) out[cur].push(b[1].replace(/\s+/g, " "));
  }
  return out;
}

class Style {
  /** @param {string} dir  where the .md files live  @param {string} seedDir  starter files shipped with the app */
  constructor(dir, seedDir) {
    this.dir = dir; fs.mkdirSync(dir, { recursive: true });
    // Starter files are copied once per name: new starters reach an existing install, deleted ones stay deleted.
    const seenFile = path.join(dir, ".seeded.json"); let seen = [];
    try { seen = JSON.parse(fs.readFileSync(seenFile, "utf8")); } catch { seen = fs.readdirSync(dir).filter((f) => NAME.test(f)); }
    if (seedDir && fs.existsSync(seedDir)) for (const f of fs.readdirSync(seedDir)) if (NAME.test(f) && !seen.includes(f)) { if (!fs.existsSync(path.join(dir, f))) fs.copyFileSync(path.join(seedDir, f), path.join(dir, f)); seen.push(f); }
    fs.writeFileSync(seenFile, JSON.stringify(seen));
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
  /** A 👎 teaches the Avoid list: append one line under "## Never" in never-do.md. */
  addNever(line) {
    const l = clean(line).slice(0, 200); if (!l) return false;
    let t = fs.existsSync(path.join(this.dir, "never-do.md")) ? fs.readFileSync(path.join(this.dir, "never-do.md"), "utf8") : "# never-do.md\n\n## Never\n";
    if (!/^##\s+Never/m.test(t)) t += "\n## Never\n";
    fs.writeFileSync(path.join(this.dir, "never-do.md"), t.replace(/\s*$/, "\n") + "- " + l + "\n"); return true;
  }
  /** Lines to write into the prompt and lines to avoid, from the enabled files. */
  gather(off = []) {
    const prompt = [], never = [], captions = [];
    for (const f of this.list(off)) { if (!f.on) continue; const s = sections(this.read(f.name)); prompt.push(...s.prompt); never.push(...s.never); captions.push(...s.captions); }
    return { prompt, never, captions: captions.map(parseCaption).filter(Boolean) };
  }
}

/** "0-4 | BREAKING NEWS" or "10-15 | Comment spooky | bottom" -> {start, end, text, pos} */
function parseCaption(x) {
  if (x && typeof x === "object") { const t = clean(x.text); const s = Number(x.start), e = Number(x.end); return t && Number.isFinite(s) && Number.isFinite(e) && e > s ? { text: t.slice(0, 160), start: s, end: e, pos: x.pos === "bottom" ? "bottom" : "top" } : null; }
  const m = /^\s*(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*\|\s*(.+?)\s*(?:\|\s*(top|bottom)\s*)?$/i.exec(String(x || ""));
  return m ? parseCaption({ start: m[1], end: m[2], text: m[3], pos: (m[4] || "top").toLowerCase() }) : null;
}
const sentence = (t) => { const s = clean(t); return s ? (/[.!?]$/.test(s) ? s : s + ".") : ""; };

/**
 * @param {{scene: string, look?: string, avatar?: string, avatarText?: string, product?: {title?: string, desc?: string}, seconds: number}} job
 * @param {{prompt: string[], never: string[]}} bible
 */
function compose(job, bible) {
  const parts = [];
  if (job.avatar !== "none") parts.push(sentence(AVATARS[job.avatar] || clean(job.avatarText) || AVATARS.broad));
  if (job.product && clean(job.product.title)) parts.push(sentence(`The product is ${clean(job.product.title)}${job.product.desc ? ": " + clean(job.product.desc).slice(0, 220) : ""}`));
  parts.push(sentence(LOOKS[job.look] || ""));
  parts.push(sentence(job.scene));
  const rt = referenceText(job.reference, job.product && job.product.title); if (rt) parts.push(rt);
  if (bible.prompt.length) parts.push(bible.prompt.map(sentence).join(" "));
  if (MUSIC[job.music]) parts.push(MUSIC[job.music]);
  if (bible.never.length) parts.push("Avoid: " + bible.never.map((l) => clean(l).replace(/[.]+$/, "")).join("; ") + ".");
  parts.push(`About ${job.seconds} seconds, one continuous take.`);
  return parts.filter(Boolean).join(" ");
}

module.exports = { LEVELS, referenceText, parseCaption, Style, compose, sections, LOOKS, AVATARS, QUALITY, SECONDS, NAME, MUSIC };

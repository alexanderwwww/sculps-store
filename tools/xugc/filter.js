"use strict";
// XUGC prompt filter: every generation passes through here, whatever the model.
// Rules come from design/xugc/real-life/05-directors-bible.md (sections 4, 5, 6).
// Anything the bible marks [verify] sits behind FLAGS and defaults OFF.

const FLAGS = {
  houseCaps: false,      // [verify] bible gives no word cap for kling/ltx/wan/hunyuan; ON applies house caps below
  negativeField: false,  // [verify] bible knows of no negative-prompt field for any engine; ON emits one for open models
};
const HOUSE_CAPS = { kling: 220, ltx: 120, wan: 120, hunyuan: 120 };
const OPEN_NEGATIVE = "text, captions, subtitles, letters, logos, watermark, extra people, deformed hands, extra fingers, distorted face, morphing, flicker";

const ENGINES = {
  veo:      { maxWords: 120, notes: "Bible 5.1: 60-120 words, dialogue in quotes not counted; 8 s reference mode, max 3 refs; no negative lists; never write subtitles/caption.", sound: true, aspectInFields: true },
  seedance: { maxWords: 100, notes: "Bible 5.2: 60-100 words, five slots, ONE camera move; no aspect/duration in text; audio notation per provider route [verify].", sound: true, aspectInFields: true },
  kling:    { maxWords: null, notes: "Bible 5.3: master 2 sentences plus labelled shots, 3-15 s, up to 6 shots; no word cap stated.", sound: true, aspectInFields: true },
  ltx:      { maxWords: null, notes: "Not covered by the bible: no cap or notation known [verify].", sound: false, aspectInFields: false },
  wan:      { maxWords: null, notes: "Not covered by the bible: no cap or notation known [verify].", sound: false, aspectInFields: false },
  hunyuan:  { maxWords: null, notes: "Not covered by the bible: no cap or notation known [verify].", sound: false, aspectInFields: false },
};

const CLEAN_FRAME = "No text, captions, letters, logos or graphics in the picture.";
const CLEAN_RE = /no text, captions, letters, logos or graphics in the picture/i;
const HANDS = "Natural hands, five fingers visible.";
const HANDS_RE = /natural hands,?\s*five fingers/i;
const SOLO = "Only one person in frame.";
const SOLO_RE = /only one person in (the )?frame|no other people/i;

function engineOf(e) { const x = ENGINES[e]; if (!x) throw new Error("unknown engine: " + e); return x; }
function cap(engine) { const m = engineOf(engine).maxWords; return m != null ? m : (FLAGS.houseCaps ? HOUSE_CAPS[engine] || null : null); }

// quote-aware sentence split
function sentences(t) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i]; cur += c;
    if (c === '"') q = !q;
    if (!q && /[.!?]/.test(c) && (i + 1 >= t.length || /\s/.test(t[i + 1]))) { out.push(cur.trim()); cur = ""; }
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}
function norm(t) {
  return String(t || "").replace(/\s+/g, " ").replace(/\s+([,.;:!?])/g, "$1").replace(/([,;:])\s*(?=[.!?])/g, "").replace(/,\s*,+/g, ",")
    .replace(/(^|[.!?]\s)[,;:]\s*/g, "$1").replace(/\b(Style|Camera|Audio):\s*(?=[.!?]|$)/g, "").replace(/\s+/g, " ").trim();
}
function stripQuotes(t) { return t.replace(/"[^"]*"/g, " "); }
function wordCount(t, engine) { const s = engine === "veo" ? stripQuotes(t) : t; return (s.match(/[A-Za-z0-9@'’$%-]+/g) || []).length; }
function withoutClean(t) { return t.split(/(?<=[.!?])\s+/).filter(s => !CLEAN_RE.test(s)).join(" "); }

const CINE = /\b(cinematic(ally)?|8k|epic|stunning|masterpiece|studio[- ]lights?|studio[- ]lighting|beauty(?:[- ]filter)?|flawless|perfect skin|gimbal[- ]smooth|gimbal)\b/gi;
const CAM = [
  ["pan", /\bpan(s|ning|ned)?\b/i], ["tilt", /\btilt(s|ing)?\b/i],
  ["push", /\b(push[- ]?in|push[- ]?out|pull[- ]?back|pull[- ]?out|dolly|zoom(s|ing)?)\b/i],
  ["orbit", /\b(orbit(s|ing)?|arc shot|circles? around)\b/i], ["crane", /\b(crane|drone|aerial)\b/i],
  ["track", /\b(tracking shot|tracks? (with|alongside))\b/i], ["whip", /\bwhip[- ]?pan\b/i],
];
const CROWD = /\b(crowd(ed)?|people|friends|group of|bystanders?|passers?-?by|family|audience|everyone|strangers)\b/i;
const OTHER_PERSON = /\b(neighbou?r|husband|wife|boyfriend|girlfriend|mom|dad|man|kids?|child(ren)?)\b/i;
const MINOR = /\b(child|children|kid|kids|boy|girl|teen(ager)?s?|baby|toddler|minor|schoolgirl|schoolboy|under ?18|(?:[1-9]|1[0-7])[- ]?(?:years?|yrs?)[- ]?old|(?:[1-9]|1[0-7])yo)\b/i;
const EMOTION = /\b(happy|excited|sad|angry|surprised|shocked|amazed|thrilled|delighted|proud|nervous|anxious|joyful|upset|furious|overjoyed)\b/i;
const BEHAVIOUR = /\b(smil\w+|laugh\w*|grin\w*|frown\w*|gasp\w*|widen\w*|rais\w+|nod\w*|shak\w+|lean\w*|blink\w*|eyebrows?|eyes|jaw|claps?|clap\w*|exhales?|sighs?|covers? (her|his) mouth|bites?)\b/i;
const VAGUE = /\b(moves?|moving|walks?|camera moves?) (around|about)\b|\bdynamic (movement|motion)\b|\bsome movement\b|\bcamera moves\b(?! (slowly )?(in|out|left|right|up|down|forward|back))/i;
const FACE_W = /\b(face|eyes|skin|nose|lips|freckles|jawline|cheekbones|eyebrows|complexion)\b/i;
const HELD = /\b(holds?|holding|held|grips?|gripping|lifts?|lifting|picks? up|hands? (him|her|the)|shows? (the|a) product)\b/i;
const COPY_ASK = /\b(copy|copies|replicate|reproduce|recreate|match|reuse|keep|same|repeat|include|show)\b[^.]{0,60}\b(text|words|wording|graphics?|infographic|collage|logos?|labels?|callouts?|badges?|layout|lettering|typography|numbers|prices?)\b[^.]{0,60}\b(reference|photos?|images?|carousel|panel|picture|@\w+)/i;
const COPY_ASK2 = /\b(carousel|infographic|collage)\b[^.]{0,60}\b(text|graphics?|logos?|labels?|callouts?|layout|lettering)\b[^.]{0,30}\b(copy|copied|replicate|same|exactly|as is)|\b(copy|replicate|reproduce)\b[^.]{0,30}\b(carousel|infographic|collage)\b/i;
const OVERLAY_ASK = /(?<!\bno\s)(?<!\bwithout\s)\b(add|adds|with|show|shows|display|displays|include|burned[- ]in|overlay|generate|write|put)\b[^.]{0,25}\b(captions?|subtitles?|text overlay|on-screen text|title card|lower third)\b/i;
const REF_MENTION = /\b(reference|@image\d?|@product|@avatar|first image|second image|product photo|carousel|infographic)\b/i;
const ASPECT = /(?:\b(?:in|at)\s+)?\b(?:9:16|16:9|1:1|4:5)\b(?:\s+(?:vertical|portrait|landscape|square|format|aspect ratio))?/gi;

function split(prompt) { return prompt.split(/(?=\bShot \d)|(?=\b\d+\s*-\s*\d+s:)|(?=\[\d\d:\d\d)/i); }

function lint(prompt, engine, opts = {}) {
  const e = engineOf(engine); const p = String(prompt || ""); const problems = [];
  const add = (code, severity, text, fix) => problems.push({ code, severity, text, fix });
  const body = withoutClean(p);
  const n = wordCount(p, engine), c = cap(engine);
  if (c != null && n > c) add("TOO_LONG", "block", `${n} words, cap for ${engine} is ${c}.`, `Cut to ${c} words; keep one action, one camera idea.`);
  if (CINE.test(body)) add("CINEMATIC_WORDS", "block", "Cinematic/beauty wording makes the video look like AI.", "Remove: cinematic, 8K, epic, studio lighting, beauty, flawless.");
  CINE.lastIndex = 0;
  for (const seg of split(body)) {
    const kinds = CAM.filter(([, re]) => re.test(seg)).map(([k]) => k);
    if (kinds.length > 1) { add("TWO_CAMERA_MOVES", "block", `Camera moves stacked in one shot: ${kinds.join(" + ")}.`, "Keep ONE camera move per shot; delete the rest."); break; }
  }
  if (HELD.test(body) && !HANDS_RE.test(p)) add("NO_HANDS_RULE", "block", "Product is held but there is no hands rule.", `Add: "${HANDS}"`);
  if (COPY_ASK.test(body) || COPY_ASK2.test(body) || OVERLAY_ASK.test(body)) add("CAROUSEL_TEXT", "block", "Prompt asks the model to copy or generate text/graphics/captions; it will garble them.", "Never ask for text. Describe the product by shape and colour only; captions are added in post.");
  if (!opts.allowCrowd && CROWD.test(body)) add("CROWD", "warn", "Crowd/extra-people wording.", 'Name exactly who is in frame, or use "Only one person in frame."');
  if (MINOR.test(body)) add("MINOR_FACE", "block", "Prompt describes a minor.", "Use an adult (20s+) only.");
  if (EMOTION.test(body) && !BEHAVIOUR.test(body)) add("EMOTION_NO_TRIGGER", "warn", "Emotion word with no visible behaviour.", 'Give it a visible trigger: "smiles, eyebrows up, laughs once".');
  if (VAGUE.test(body)) add("VAGUE_MOTION", "warn", "Vague motion wording.", 'Use an explicit verb chain or camera verb ("steps to the counter, picks up the box").');
  if (sentences(body).filter(s => FACE_W.test(s) && !/same (face|look)/i.test(s)).length > 1) add("FACE_REDESCRIBED", "warn", "Face described in more than one sentence.", "One sentence for the face; the reference image carries identity.");
  if (REF_MENTION.test(body) && !CLEAN_RE.test(p)) add("COPIED_TEXT_RISK", "warn", "References are used with no clean-frame sentence; text on them can be copied into the video.", `Add: "${CLEAN_FRAME}"`);
  if (e.aspectInFields && (ASPECT.test(body))) add("ASPECT_IN_PROMPT", "warn", "Aspect ratio is an API field for this engine.", "Remove it from the prompt text.");
  ASPECT.lastIndex = 0;
  return { ok: !problems.some(x => x.severity === "block"), problems };
}

function repair(prompt, engine) {
  const e = engineOf(engine); const changes = []; let t = norm(prompt);
  const before = t;
  if (e.aspectInFields && ASPECT.test(t)) { t = norm(t.replace(ASPECT, "")); changes.push("removed aspect ratio from text"); }
  ASPECT.lastIndex = 0;
  if (CINE.test(t)) { CINE.lastIndex = 0; t = norm(t.replace(CINE, "")); changes.push("removed cinematic/beauty words"); }
  CINE.lastIndex = 0;
  const body = withoutClean(t);
  let add = [];
  if (HELD.test(body) && !HANDS_RE.test(t)) { add.push(HANDS); changes.push("added hands rule"); }
  if (!CROWD.test(body) && !OTHER_PERSON.test(body) && !SOLO_RE.test(t) && !CLEAN_RE.test(t) && /\b(woman|she|her|creator|avatar|person|@avatar)\b/i.test(body)) { add.push(SOLO); changes.push("added single-person sentence"); }
  if (!CLEAN_RE.test(t)) { add.push(CLEAN_FRAME); changes.push("added clean-frame sentence"); }
  if (add.length) t = norm(t + " " + add.join(" "));
  const c = cap(engine);
  if (c != null && wordCount(t, engine) > c) {
    let ss = sentences(t);
    const protectedS = s => HANDS_RE.test(s) || CLEAN_RE.test(s) || SOLO_RE.test(s) || /"/.test(s);
    let dropped = 0;
    for (let i = ss.length - 1; i > 0 && wordCount(ss.join(" "), engine) > c; i--) {
      if (!protectedS(ss[i])) { ss.splice(i, 1); dropped++; }
    }
    if (dropped) { t = ss.join(" "); changes.push(`trimmed ${dropped} sentence(s) to fit ${c} words`); }
  }
  if (t === before) changes.length = 0;
  return { prompt: t, changes };
}

function render({ scene, beatsText, refsPlan, seconds, engine, lora } = {}) {
  const e = engineOf(engine); const warnings = [];
  const refs = Array.isArray(refsPlan) ? refsPlan.join(" ") : (refsPlan || "");
  const open = !e.aspectInFields;
  const raw = [open && lora ? String(lora) : "", refs, scene || "", beatsText || ""].filter(Boolean).join(" ");
  const r = repair(raw, engine);
  const l = lint(r.prompt, engine);
  for (const c of r.changes) warnings.push("repaired: " + c);
  for (const p of l.problems) warnings.push(`${p.severity === "block" ? "BLOCK" : "warn"} ${p.code}: ${p.text}`);
  if (engine === "veo" && seconds != null && ![4, 6, 8].includes(Number(seconds))) warnings.push("warn: veo durations are 4, 6 or 8 s (8 s in reference mode).");
  const negative = FLAGS.negativeField && open ? OPEN_NEGATIVE : null;
  return { prompt: r.prompt, negative, warnings, ok: l.ok, fields: { seconds: seconds == null ? null : Number(seconds), aspectInFields: e.aspectInFields } };
}

function check(input, engine) {
  if (input && typeof input === "object") { const r = render({ ...input, engine }); const l = lint(r.prompt, engine); return { ok: l.ok, prompt: r.prompt, problems: l.problems, changes: r.warnings.filter(w => w.startsWith("repaired: ")).map(w => w.slice(10)) }; }
  const r = repair(input, engine); const l = lint(r.prompt, engine);
  return { ok: l.ok, prompt: r.prompt, problems: l.problems, changes: r.changes };
}

module.exports = { ENGINES, FLAGS, lint, repair, render, check };

import test from "node:test"; import assert from "node:assert/strict"; import { createRequire } from "node:module";
const require = createRequire(import.meta.url); const f = require("../filter.js");
const has = (p, e, code) => f.lint(p, e).problems.some(x => x.code === code);
const BASE = "Front-camera selfie video, handheld. The woman from @avatar talks to the lens in her kitchen, window light. No text, captions, letters, logos or graphics in the picture.";
const CASES = {
  TOO_LONG: ["word ".repeat(130).trim() + ".", BASE, "veo"],
  CINEMATIC_WORDS: ["A cinematic 8K epic shot of a woman in a kitchen.", BASE],
  TWO_CAMERA_MOVES: ["A woman in a kitchen. Camera: slow pan then dolly in.", "A woman in a kitchen. Camera: slow push-in."],
  NO_HANDS_RULE: ["She holds the mug up to the lens.", "She holds the mug up to the lens. Natural hands, five fingers visible."],
  CAROUSEL_TEXT: ["Copy the text from the carousel photo onto the box.", "The box is matte white with one orange stripe."],
  CROWD: ["A crowd of people watch her in the kitchen.", BASE],
  MINOR_FACE: ["A 12 year old girl holds the mug.", "A woman in her late 20s stands in a kitchen."],
  EMOTION_NO_TRIGGER: ["She is excited about the mug.", "She is excited: eyebrows up, she laughs once."],
  VAGUE_MOTION: ["She moves around the kitchen.", "She steps to the counter and picks up the box."],
  FACE_REDESCRIBED: ["Olive skin and freckles on her face. She has bright eyes and a small nose.", "Olive skin, freckles and bright eyes. She stands in a kitchen."],
  COPIED_TEXT_RISK: ["The woman from the first reference image stands in a kitchen.", "The woman from the first reference image stands in a kitchen. No text, captions, letters, logos or graphics in the picture."],
};
for (const [code, [bad, good, eng]] of Object.entries(CASES)) {
  test(code + " fails then passes", () => { assert.ok(has(bad, eng || "seedance", code), "bad should flag"); assert.ok(!has(good, eng || "seedance", code), "good should pass"); });
}
test("captions asked of the model are blocked", () => assert.ok(has("She talks to the lens with captions on screen.", "veo", "CAROUSEL_TEXT")));
test("clean-frame sentence itself does not trip CAROUSEL_TEXT", () => assert.ok(!has(BASE, "veo", "CAROUSEL_TEXT")));
test("prompt asking to copy text from the carousel photo is blocked even after repair", () => {
  const r = f.check("The woman holds the box. Copy the text and graphics from the carousel photo exactly.", "seedance");
  assert.equal(r.ok, false); assert.ok(r.problems.some(x => x.code === "CAROUSEL_TEXT"));
});
test("repair removes cinematic words, adds hands and clean frame", () => {
  const r = f.repair("A cinematic shot. She holds the mug up to the lens with flawless skin.", "seedance");
  assert.ok(!/cinematic|flawless/i.test(r.prompt)); assert.match(r.prompt, /Natural hands, five fingers/); assert.match(r.prompt, /No text, captions, letters, logos or graphics in the picture/);
  assert.ok(r.changes.length >= 3);
});
test("repair is idempotent", () => {
  for (const eng of Object.keys(f.ENGINES)) for (const p of ["A cinematic 8K shot in 9:16. She holds the mug. " + "She walks to the sink. ".repeat(40), BASE]) {
    const a = f.repair(p, eng); const b = f.repair(a.prompt, eng); assert.equal(b.prompt, a.prompt); assert.deepEqual(b.changes, []);
  }
});
test("repair never invents story", () => {
  const r = f.repair("She holds the mug up.", "veo"); const extra = r.prompt.replace("She holds the mug up.", "");
  assert.match(extra, /^[\sA-Za-z,.]*$/); assert.ok(!/walks|says|smiles/.test(extra));
});
test("word cap enforced per engine", () => {
  const long = "The woman from @avatar holds the mug. " + "She steps to the counter and looks at the lens. ".repeat(30) + 'She says, "Look at this."';
  for (const [eng, cap] of [["veo", 120], ["seedance", 100]]) {
    const r = f.check(long, eng); assert.equal(r.ok, true, eng); const wc = r.prompt.replace(/"[^"]*"/g, " ").match(/\S+/g).length; assert.ok(eng === "veo" ? wc <= cap : r.prompt.match(/\S+/g).length <= cap, eng); assert.match(r.prompt, /Look at this/);
  }
  assert.ok(has(long, "seedance", "TOO_LONG"));
});
test("engines without a bible cap stay uncapped until the flag is on", () => {
  const long = "word ".repeat(300);
  assert.ok(!has(long, "wan", "TOO_LONG")); f.FLAGS.houseCaps = true; assert.ok(has(long, "wan", "TOO_LONG")); f.FLAGS.houseCaps = false;
});
test("render deterministic, no negative by default, aspect not in prompt", () => {
  const a = { scene: "The woman from @avatar holds the mug in 9:16 vertical.", beatsText: "She smiles.", refsPlan: ["@Image1 = the creator.", "@Image2 = the product."], seconds: 8, engine: "seedance" };
  const x = f.render(a), y = f.render(a); assert.equal(x.prompt, y.prompt); assert.deepEqual(x, y);
  assert.equal(x.negative, null); assert.ok(!/9:16/.test(x.prompt)); assert.equal(x.fields.seconds, 8);
});
test("lora trigger prepended for open models only; negative only behind flag", () => {
  const a = { scene: "A woman walks to the counter.", lora: "xugc_girl", engine: "wan", seconds: 5 };
  assert.match(f.render(a).prompt, /^xugc_girl /); assert.equal(f.render(a).negative, null);
  f.FLAGS.negativeField = true; assert.ok(f.render(a).negative); assert.equal(f.render({ ...a, engine: "veo" }).negative, null); f.FLAGS.negativeField = false;
  assert.ok(!/xugc_girl/.test(f.render({ ...a, engine: "veo" }).prompt));
});
test("check returns ok:true for a clean prompt", () => { const r = f.check(BASE, "veo"); assert.equal(r.ok, true); });
test("all six engines defined with required fields", () => {
  assert.deepEqual(Object.keys(f.ENGINES).sort(), ["hunyuan", "kling", "ltx", "seedance", "veo", "wan"]);
  for (const e of Object.values(f.ENGINES)) assert.ok("maxWords" in e && "notes" in e && "sound" in e && "aspectInFields" in e);
});

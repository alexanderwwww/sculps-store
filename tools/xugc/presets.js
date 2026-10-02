"use strict";
// XUGC preset library: tested recipes per ad type, built to the director's bible
// (design/xugc/real-life/05-directors-bible.md). One 8 s clip per beat list; longer ads join clips.
const { goldenTimes, CLIP } = require("./google.js");
const G = goldenTimes(CLIP); // [0,1.17,3.06,4.94,6.11,8]

const COMMON_AVOID = ["cinematic", "8K", "epic", "beauty filter", "flawless", "studio lighting", "perfect skin", "crowd", "text overlay", "captions", "logo not on the product"];
const HAND = "Natural hands, five fingers visible, holding the product by its {part}.";
const mk = (o) => ({ defaultSeconds: 16, tier: "lite", avoid: COMMON_AVOID, ...o });

const PRESETS = {
  review: mk({
    id: "review", name: "Review (talking head)", blurb: "She talks straight to the camera and tells you what she thinks of it.",
    needs: ["product", "avatar"], capture: "selfie",
    beats: [
      { at: G[0], action: "She holds the product up beside her face with one hand, front camera, small refocus.", say: "Okay, I have to tell you about this.", sfx: "room tone, soft handheld rustle" },
      { at: G[2], action: "She turns the product once to show its front, eyes flick from screen to lens.", say: "I have used it every day for a week.", sfx: "light tap of fingers on the product" },
      { at: G[3], action: "She lowers the product to chest height and nods, tiny reframe after speaking.", say: "And honestly, it just works.", sfx: "quiet breath" },
      { at: G[5], action: "She smiles and settles, holding the product in frame.", sfx: "room tone" },
    ],
    rules: ["Front-camera selfie, arm's-length, slight handheld sway, wide phone lens.", "Hands: natural hands, five fingers visible, holding the product by its {part}.", "Face: one steady look, small expression changes only, no extreme close-up.", "Motion: one slow push-in at most; no whip moves.", "Continuity: same wardrobe sentence and room in every clip."],
  }),
  "product-only": mk({
    id: "product-only", name: "Product only (voiceover)", blurb: "Just hands and the product, with a voiceover telling the story.",
    needs: ["product"], capture: "pov",
    beats: [
      { at: G[0], action: "Hands lift the product into frame from the table, POV, hands only.", say: "This is the one everyone keeps asking me about.", sfx: "table tap, fabric slide" },
      { at: G[2], action: "One hand turns the product slowly to show its main feature, the other steadies it.", say: "Look at how it is built.", sfx: "soft click" },
      { at: G[3], action: "Thumb presses or touches the key part and it responds.", say: "One press and it is done.", sfx: "button click" },
      { at: G[5], action: "Hands set the product back down and hold still.", sfx: "gentle set-down thud" },
    ],
    rules: ["POV, hands visible at the bottom of frame, no face shown.", "Hands: natural hands, five fingers visible, holding the product by its {part}.", "Motion: turn the product once, at most 90 degrees.", "Voiceover only: no lip sync, voice sounds like a phone recording.", "Continuity: same table, same light side in every clip."],
  }),
  unboxing: mk({
    id: "unboxing", name: "Unboxing", blurb: "A box on the counter, tape cut, product lifted out, first reaction.",
    needs: ["product", "avatar"], capture: "pov",
    beats: [
      { at: G[0], action: "POV, her free hand cuts the tape on the box with scissors, flaps spring up.", say: "Guess what came today.", sfx: "tape rip, cardboard crackle" },
      { at: G[2], action: "Both hands lift the product out of the packing, slight dip from its weight.", sfx: "foam squeak, cardboard slide" },
      { at: G[3], action: "She turns the product once to show its feature, then sets it on the counter.", say: "Okay, it is better than the pictures.", sfx: "soft set-down" },
      { at: G[5], action: "Hands rest either side of the product and hold still.", sfx: "room tone" },
    ],
    rules: ["POV first-person, hands visible, phone in one hand.", "Hands: natural hands, five fingers visible, holding the product by its {part}.", "Motion: static POV, hands only; the unbox is the single camera idea.", "Continuity: box size matches the product, same counter and window light.", "No person other than the avatar."],
  }),
  "try-on": mk({
    id: "try-on", name: "Try-on", blurb: "She puts it on, checks the mirror and reacts.",
    needs: ["product", "avatar"], capture: "propped",
    beats: [
      { at: G[0], action: "Phone propped at waist height, she holds the product up and says what it is.", say: "Trying this on for the first time.", sfx: "fabric rustle" },
      { at: G[2], action: "She puts the product on, adjusts it with both hands.", sfx: "fabric slide, small clasp click" },
      { at: G[3], action: "She steps back, does one slow half turn to show the fit.", say: "Oh wow, it fits perfectly.", sfx: "footsteps on floor" },
      { at: G[5], action: "She smiles at the camera and holds the pose.", sfx: "room tone" },
    ],
    rules: ["Phone propped, locked off with slight handheld sway, full body or waist up.", "Hands: natural hands, five fingers visible, holding the product by its {part} before it goes on.", "Face: stays natural, no heavy makeup change between shots.", "Motion: one half turn only; no dance.", "Continuity: same outfit under the product, same room."],
  }),
  tutorial: mk({
    id: "tutorial", name: "Tutorial (steps)", blurb: "Show how to use it in three clear steps, one action each.",
    needs: ["product", "avatar"], capture: "propped",
    beats: [
      { at: G[0], action: "She faces the camera and holds the product up to introduce step one.", say: "Step one, get it ready.", sfx: "room tone" },
      { at: G[2], action: "Hands do the first action on the product, close on hands and product.", say: "Step two, press here.", sfx: "click" },
      { at: G[4], action: "The product responds and she shows the result to the camera.", say: "Step three, that is it.", sfx: "soft whir" },
      { at: G[5], action: "She nods and holds the product beside her face.", sfx: "room tone" },
    ],
    rules: ["Phone propped on a stand, steady frame with slight handheld sway.", "Hands: natural hands, five fingers visible, holding the product by its {part}.", "Motion: one action per step, never two at once.", "Step captions are NOT generated; they are added later in editing.", "Continuity: same table, same light."],
  }),
  "breaking-news-start": mk({
    id: "breaking-news-start", name: "Breaking-news hook", blurb: "Opens like a phone-filmed breaking-news clip, then turns into the real product moment.",
    needs: ["product", "avatar"], capture: "friend-holds",
    beats: [
      { at: G[0], action: "Handheld phone shot of a busy street, a reporter-style voice off-camera speaks fast and urgent, camera swings toward her.", say: "You will not believe what is happening right here.", sfx: "street traffic, wind on mic" },
      { at: G[2], action: "Hard cut on a swing: the same woman now in a room, holding the product by its edge and turning to the camera.", say: "This is the thing everyone is talking about.", sfx: "room tone replaces street noise" },
      { at: G[3], action: "She shows the product working, steady handheld, one gesture.", say: "Watch what it does.", sfx: "product sound" },
      { at: G[5], action: "She grins at the lens and holds the product up.", sfx: "room tone" },
    ],
    rules: ["First 3.06 s: phone-filmed street scene, urgent on-the-spot voice, no graphics, no on-screen text, no news logos or tickers in the frame.", "Hands: natural hands, five fingers visible, holding the product by its {part}.", "Motion: one swing at the cut, cut on action, then steady.", "Continuity: same woman and wardrobe before and after the cut.", "Street has a few distant passers-by only, no crowd close to camera, no minors' faces."],
    avoid: COMMON_AVOID.concat(["news logo", "ticker", "lower-third", "chyron", "breaking news banner"]),
  }),
  "demo-in-motion": mk({
    id: "demo-in-motion", name: "Demo in motion", blurb: "The product doing its job, shown in one continuous action.",
    needs: ["product", "avatar"], capture: "friend-holds",
    beats: [
      { at: G[0], action: "She steps into frame holding the product by its handle area, phone follows at chest height.", say: "Watch this.", sfx: "footsteps, fabric" },
      { at: G[2], action: "She starts the product and it begins its main motion.", sfx: "product starts, soft whir" },
      { at: G[3], action: "The product reaches its full effect while she steps back and watches.", say: "Look at that.", sfx: "product sound rising" },
      { at: G[5], action: "She looks at the lens and shrugs, grinning.", sfx: "room tone" },
    ],
    rules: ["Friend-holds-phone, slight handheld sway, one slow push-in at most.", "Hands: natural hands, five fingers visible, holding the product by its {part}.", "Motion: the product's motion is the only large movement; keep it believable and physical.", "Continuity: same place and light through the demo.", "No people other than the avatar."],
  }),
  "before-after": mk({
    id: "before-after", name: "Before and after", blurb: "The problem first, a hand wipe, then the same spot fixed.",
    needs: ["product", "avatar"], capture: "selfie",
    beats: [
      { at: G[0], action: "Front camera, she points at the problem in the frame with one hand.", say: "This is how it looked this morning.", sfx: "room tone" },
      { at: G[2], action: "She sweeps her hand across the lens as a wipe, covering the camera.", sfx: "hand swish on lens" },
      { at: G[3], action: "Same spot and same framing, hand moves away, the problem is fixed and the product sits beside it.", say: "And now look.", sfx: "room tone" },
      { at: G[5], action: "She smiles and points at the result.", sfx: "quiet breath" },
    ],
    rules: ["Selfie arm's-length, identical framing before and after the wipe.", "Hands: natural hands, five fingers visible, holding the product by its {part}.", "Motion: the hand wipe is the single camera idea and the cut point.", "Continuity: same wardrobe, light and place; only the problem changes.", "No exaggerated or medical claims on screen or in speech."],
  }),
};

const MINORS = "No close identifiable faces of minors; no crowds.";
const LOOK = "Unpolished iPhone video, natural window light, slight handheld sway, auto-exposure hunt, phone-camera softness, ambient room sound, no music.";
const PARTS = "body";
const PARTMAP = { selfie: "edge", propped: "edge", pov: "base", "friend-holds": "side" };

function list() { return Object.values(PRESETS).map(({ id, name, blurb }) => ({ id, name, blurb })); }
function get(id) { const p = PRESETS[id]; if (!p) throw new Error("unknown preset: " + id); return p; }
const mmss = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, "0")}`;
const one = (s) => String(s || "").replace(/\s+/g, " ").trim();

function fill(id, inputs = {}) {
  const p = get(id);
  const prod = inputs.product || {};
  const title = one(prod.title) || "the product";
  const feats = (prod.features || []).map(one).filter(Boolean).slice(0, 3);
  const seconds = Number(inputs.seconds) > 0 ? Number(inputs.seconds) : p.defaultSeconds;
  const part = PARTMAP[p.capture] || PARTS;
  const hand = (s) => s.replace(/\{part\}/g, part);
  const beatsText = p.beats.map((b) => `${mmss(b.at)} ${hand(b.action)}${b.say ? ` She says: "${b.say}"` : ""} SFX: ${b.sfx}.`).join("\n");
  const face = one(inputs.avatarText) || "a relaxed woman in her late twenties with natural skin and loose hair";
  const room = one(inputs.scene) || "an ordinary lived-in room with a few everyday objects";
  const scene = [
    `Phone video, ${p.capture} capture. ${face.replace(/[.]+$/, "")}. Setting: ${room.replace(/[.]+$/, "")}.`,
    `The product is ${title}${feats.length ? `, with ${feats.join(", ")}` : ""}. Use the exact product from the product reference image: read colours, shape and label from the image, do not redesign it, add no logos or text that are not in the image.`,
    beatsText.replace(/\n/g, " "),
    p.rules.map(hand).join(" "),
    LOOK, MINORS, "No text, no captions, no graphics in the frame.",
  ].join("\n");
  const refsPlan = [
    p.needs.includes("avatar") && { role: "avatar", job: "Governs the face, hair and wardrobe of the one person in every shot; keep identical." },
    { role: "product", job: "Governs the exact shape, colour and label of the product; copy it exactly, never redesign." },
    { role: "room", job: "Governs the room, light direction and background only; do not copy its framing." },
  ].filter(Boolean);
  return { scene, beatsText, refsPlan, seconds };
}

/**
 * Per-clip prompts for an ad made of 8 s clips (Veo caps a prompt at about 120 words, dialogue not counted).
 * The preset's beats are shared out across the clips in order and re-timed to the golden points inside each clip,
 * so no line is said twice and nothing is cut by the word cap. The full scene text goes to the IMAGE model (no cap).
 */
const SLOTS = { 1: [0], 2: [0, 4.94], 3: [0, 3.06, 4.94], 4: [0, 1.17, 3.06, 4.94], 5: [0, 1.17, 3.06, 4.94, 6.11] };
function clips(id, inputs = {}, n = 2) {
  const p = get(id); const f = fill(id, inputs);
  const prod = inputs.product || {}; const title = one(prod.title) || "the product";
  const part = PARTMAP[p.capture] || PARTS; const hand = (x) => x.replace(/\{part\}/g, part);
  const face = one(inputs.avatarText) || "a relaxed woman in her late twenties with natural skin and loose hair";
  const room = one(inputs.scene) || "an ordinary lived-in room with a few everyday objects";
  const handsRule = (p.rules.map(hand).find((r) => /^Hands:/i.test(r)) || "Hands: natural hands, five fingers visible, holding the product by its " + part + ".");
  const core = `Unpolished iPhone video, ${p.capture} capture, handheld, natural light, ambient sound. ${face.replace(/[.]+$/, "")}. Setting: ${room.replace(/[.]+$/, "")}. The product is ${title}, exactly as in the first frame; do not redesign it.`;
  const per = Math.ceil(p.beats.length / n), out = [];
  for (let i = 0; i < n; i++) {
    let bs = p.beats.slice(i * per, (i + 1) * per);
    if (!bs.length) bs = [{ action: "She keeps using the product naturally, then settles and holds it in frame", sfx: "room tone" }];
    const slots = SLOTS[Math.min(5, bs.length)];
    const beats = bs.map((b, k) => `${mmss(slots[k])} ${hand(b.action).replace(/[.]+$/, "")}.${b.say ? ` She says: "${b.say}"` : ""} SFX: ${String(b.sfx).replace(/[.]+$/, "")}.`).join(" ");
    out.push([core, i ? "Same person, same room, continuing without a cut." : "", beats, handsRule].filter(Boolean).join(" "));
  }
  return { image: f.scene, clips: out, refsPlan: f.refsPlan };
}

module.exports = { PRESETS, list, get, fill, clips };

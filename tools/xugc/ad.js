/**
 * One ad, start to finish, on Google's own API: hidden landmark pictures -> 8 s Veo clips between them -> one video.
 *   1. clips = ceil(seconds / 8). Landmark pictures = clips + 1 (the start of each clip and the end of the last), made by the image model.
 *      Alex's reference rule: raw product photos only ever go to the IMAGE model, never to Veo (it copies carousel text into the ad).
 *   2. clip i runs from landmark i to landmark i+1 (Veo first frame + last frame), its action timed at the golden-ratio points.
 *   3. ffmpeg joins the clips. The landmarks stay in the take's folder, hidden from the screens.
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { goldenTimes, clipsFor, beatPrompt, landmarkPrompt, CLIP } = require("./google.js");

const MOMENTS = (n, total) => (i) =>
  i === 0 ? "the very first frame of the video: the person has just started filming, handheld, product visible in frame"
    : i === total ? "the last frame of the video: the person holds the product toward the camera, the payoff moment, everything in focus"
    : `the frame at second ${i * CLIP} of the video, in the middle of the action, same person, same room, same product`;

function run(bin, args) { return new Promise((res, rej) => execFile(bin, args, { maxBuffer: 1 << 26 }, (e, so, se) => (e ? rej(new Error("ffmpeg: " + String(se || e.message).split("\n").slice(-4).join(" "))) : res(se)))); }

async function join(ffmpeg, files, out) {
  if (files.length === 1) { fs.copyFileSync(files[0], out); return; }
  const list = out + ".txt"; fs.writeFileSync(list, files.map((f, i) => `file '${f.replace(/'/g, "'\\''")}'` + (i ? "\ninpoint 0.05" : "")).join("\n"));
  await run(ffmpeg, ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", out]);
  fs.unlinkSync(list);
}

/**
 * @param {{google, ffmpeg: string, dir: string, scene: string, seconds: number, tier: string, refs: {bytes: Buffer, mime?: string}[], signal?: {cancelled: boolean}, onStage?: Function}} o
 * @returns {{file: string, usd: number, clips: number, landmarks: string[]}}
 */
async function makeAd(o) { let paid = { usd: 0 }; try { return await makeAdInner(o, paid); } catch (e) { e.costUsd = Math.round(paid.usd * 100) / 100; throw e; } }
async function makeAdInner({ google, images, video, imageUsd, clipCost, ffmpeg, dir, scene, imageScene, clipPrompts, seconds, tier = "lite", refs = [], signal = {}, onStage = () => {} }, paid) {
  const { VEO, IMAGE_USD } = require("./google.js");
  // any provider with .image() and .clip(): Google direct, or fal (Seedance, Kling, Veo, Wan) — same frames, same money rules
  images = images || google; video = video || google;
  if (imageUsd == null) imageUsd = IMAGE_USD;
  if (clipCost == null) clipCost = CLIP * (VEO[tier] || VEO.lite).perSec;
  const clips = clipsFor(seconds), total = clips;
  fs.mkdirSync(dir, { recursive: true });
  const moment = MOMENTS(clips, total);
  let usd = 0; const lms = [], lmFiles = [];
  const stop = () => { if (signal.cancelled) { const e = new Error("Cancelled."); e.code = "cancelled"; throw e; } };
  for (let i = 0; i <= clips; i++) {
    stop(); onStage({ stage: "pictures", step: i + 1, of: clips + 1, usd });
    // the previous landmark rides along so the person and the room stay the same
    const img = await images.image(landmarkPrompt(imageScene || scene, moment(i)), [...refs, ...(lms.length ? [lms[lms.length - 1]] : [])].slice(0, 14));
    usd += imageUsd; paid.usd = usd; lms.push(img);
    const f = path.join(dir, `landmark-${i}.png`); fs.writeFileSync(f, img.bytes); lmFiles.push(f);
  }
  const files = [];
  for (let i = 0; i < clips; i++) {
    stop(); onStage({ stage: "making", step: i + 1, of: clips, usd });
    const v = await video.clip({ prompt: (clipPrompts && clipPrompts[i]) || beatPrompt(scene, i ? "Continue the same scene without a cut." : ""), tier, first: lms[i], last: lms[i + 1], signal, onStarted: () => { usd += clipCost; paid.usd = usd; } });
    const f = path.join(dir, `clip-${i + 1}.mp4`); fs.writeFileSync(f, v.bytes); files.push(f);
  }
  stop(); onStage({ stage: "finishing", usd });
  const out = path.join(dir, "ad.mp4");
  await join(ffmpeg, files, out);
  return { file: out, usd: Math.round(usd * 100) / 100, clips, landmarks: lmFiles };
}
module.exports = { makeAd, join };

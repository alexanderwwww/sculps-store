import test from "node:test"; import assert from "node:assert/strict"; import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { execFileSync } from "node:child_process"; import { createRequire } from "node:module";
const require = createRequire(import.meta.url); const { makeAd } = require("../ad.js");
const ff = path.resolve("bin/ffmpeg-linux-x64");
function tiny(sec) { const f = path.join(os.tmpdir(), `t${sec}-${Math.random()}.mp4`); execFileSync(ff, ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `testsrc=s=160x284:d=${sec}:r=24`, "-f", "lavfi", "-i", `sine=d=${sec}`, "-shortest", "-pix_fmt", "yuv420p", f]); return fs.readFileSync(f); }
test("a 16 s ad: 3 pictures, 2 clips between them, one joined video, cost counted", async () => {
  const log = []; const mp4 = tiny(2);
  const google = {
    image: async (p, refs) => { log.push(["image", p, refs.length]); return { bytes: Buffer.from("PNG" + log.length), mime: "image/png" }; },
    clip: async (o) => { log.push(["clip", o.first.bytes.toString(), o.last.bytes.toString(), o.tier]); return { bytes: mp4 }; },
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ad-"));
  const r = await makeAd({ google, ffmpeg: ff, dir, scene: "A woman films a mug on a street.", seconds: 16, tier: "lite", refs: [{ bytes: Buffer.from("REF") }] });
  assert.equal(log.filter((l) => l[0] === "image").length, 3); assert.equal(log.filter((l) => l[0] === "clip").length, 2);
  assert.ok(log.filter((l) => l[0] === "image").every((l) => /NO text/.test(l[1])));
  const c = log.filter((l) => l[0] === "clip"); assert.equal(c[0][2], c[1][1]); // clip 1 ends on the picture clip 2 starts from
  assert.equal(r.usd, 1.0); assert.equal(r.landmarks.length, 3);
  const info = (() => { try { execFileSync(ff, ["-i", r.file]); } catch (e) { return String(e.stderr); } })();
  assert.match(info, /Duration: 00:00:0[34]/); assert.match(info, /Audio/);
});
test("cancel stops before anything is paid for", async () => {
  const google = { image: async () => { throw new Error("should not run"); }, clip: async () => { throw new Error("no"); } };
  await assert.rejects(() => makeAd({ google, ffmpeg: ff, dir: fs.mkdtempSync(path.join(os.tmpdir(), "ad-")), scene: "x", seconds: 8, signal: { cancelled: true } }), /Cancelled/);
});

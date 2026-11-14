---
name: whatif
description: WHAT IF — faceless YouTube Shorts made entirely from code (three.js world + local voice + word captions + ffmpeg sound), no AI video and no paid API. Use when Alex drops a "what if" premise, says WHAT IF, the what-if channel, or "make the next one".
---
# WHAT IF shorts (tools/whatif)

## What it is
A pipeline that turns one `script.json` into a finished 1080x1920, 30 fps, H.264 Short (30-50 s).
Method copied from a viral reel (method only, never footage): a one-line "what if" nobody has posted ->
a real source for every fact -> code builds a 3D world and animates it -> look at your own frames and
fix the weak ones -> render locally -> voice, captions, sound.

## The look: "aesthetic blocks" (Alex, 2026-11-14) — LOCKED default, confirmed by Alex
Heartwarming, magical, cozy: warm golden light, glowing magic, cozy blocky fantasy with a
World-of-Warcraft-like feel. Every WHAT IF video uses it unless Alex himself names another look.

Blocky voxel / low-poly fantasy world with a WoW-like *vibe*: warm saturated colours, chunky shapes,
glowing magic (bloom), epic twilight sky, dramatic light. ORIGINAL only: no Blizzard (or any game)
characters, names, logos or assets. Preset lives in `tools/whatif/scene/world.js` (palette, sky, island,
houses, towers, people, trees, sparkles, captions). `"style": "aesthetic-blocks"` in script.json.

## The command
```
node tools/whatif/make.mjs tools/whatif/videos/<id>/script.json            # full video -> tools/whatif/out/<id>.mp4
node tools/whatif/make.mjs <script.json> --stills 1.5,6,11 --stills-dir DIR  # preview frames only (do this first)
  --keep        reuse voice/timing and already-rendered frames
  --workers N   parallel Chromium renderers (3 on the 4-core container)
  --skip-facts  skip the source check (only after it has passed once)
```
Steps inside: fact check (curl each source, the `quote` must appear on the page or it stops) -> piper
voice per line (python3.13, `lib/voice.py`) -> faster-whisper word timings (python3 = 3.11, `lib/words.py`;
faster-whisper breaks under 3.13) -> frames: `scene/page.html` in headless Chromium (SwiftShader), t = frame/30,
captions/chips/title drawn on a 2D canvas over the WebGL frame -> ffmpeg synth bed (pad + soft kick, ducked
under the voice), whooshes and impacts at the lines' `sfx` -> loudnorm -14 LUFS -> mp4.

## A new video when Alex drops a premise
1. Write `videos/<nnn>-<slug>/script.json` (copy the shape of 001): premise, title, 6-10 lines (hook in the
   first 2 s, short and confident, payoff/twist at the end), `shot` per line, optional `chip` (the fact on
   screen) and `sfx` (`whoosh`, `impact`, `whoosh+impact`), and `facts[]` with `source` + exact `quote`.
   Fetch every source and copy the quote from the page. No invented numbers. A hypothetical is said as one
   ("imagine", "what if"), never as if it exists today.
2. Write `scene/scenes/<slug>.js`: `build(world, {script, timing})` returns `update(t)` with one `case` per shot
   name. Pure function of t. Reuse world.js props.
3. Render 6-9 stills, LOOK at them as a contact sheet, fix, repeat. Then the full render.
4. Upload: `npx wrangler r2 object put gardenbuddy-media/whatif-<nnn>.mp4 --file <abs path> --content-type video/mp4 --remote`
   and check `https://blackreaper.us/media/whatif-<nnn>.mp4` answers 200 with the same size.

## Numbers
- Render: ~2 s per frame per Chromium on this container; 3 workers -> a 40 s short in ~15-20 min.
- Voice: piper `en_US-lessac-medium` in `tools/whatif/models/` (gitignored; from huggingface rhasspy/piper-voices).

## Lessons (paid for on 001)
- Bloom eats anything bright: glow halos, 122 candle flames and a white UI card all turned into white blobs.
  Keep emissive ~1-2, halos small, and draw UI (notifications, counters) on the 2D overlay, not in 3D.
- Cameras must sit above the terrain: use `flat(x,z) + h`, or a hill fills the frame with green.
- Hide crowd members in close-ups; anything between camera and subject becomes a wall of colour.
- `Object.assign(mesh, {position})` throws in three r186 (position is read-only) — use `P(mesh, x, y, z)`.
- Module pages need http, not file:// — make.mjs serves the repo on a local port.
- Whisper splits "great-great" into "-great": words.py strips leading hyphens.
- Piper output length changes a little each run; timings always come from the run's own audio.

## Style LOCKED (Alex, 2026-11-14)
"Keep this style of nice World of Warcraft, the heartwarming magical thing." Blocky fantasy world with a WoW-like vibe: warm golden light, glowing magic, cozy chunky shapes, epic skies, heartwarming tone. Original designs only (no Blizzard characters, names, logos or assets). Every video uses this unless Alex says otherwise. Alex drops the premise; only make the premises he gives.

## Premise queue (Alex)
1. Anti-aging as easy as having a phone — in production (whatif-001).
2. "What if you woke up as the God-Emperor of a galaxy-wide empire?" — Alex's idea was "the Emperor of Mankind from Warhammer". Make it ORIGINAL: no Warhammer/40k/Games Workshop names, Golden Throne, aquila, Space Marines or other GW designs (GW takes fan content down). Same feel: golden armour, giant throne, endless worshippers and wars, funny + epic, our blocky magical style.
Rule: famous IP in a premise -> make an original look-alike, never the real names/designs.

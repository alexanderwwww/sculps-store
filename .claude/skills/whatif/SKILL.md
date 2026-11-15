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

## Lessons (paid for on 002)
- Never read a world position with `getWorldPosition` inside update(t): matrices are from the previous render, so the
  first frame (and every still) gets a stale point. Compute positions from the numbers you placed them with.
- Portrait frame is narrow: at fov 60 a target 360 away only shows about +-117 units across. Put markers inside that.
- A close object between a side camera and a face covers the face (parallax). Keep props near the subject's plane.
- Whisper writes "100,000" as "100" + ",000": words.py now glues them back.
- The end-card text is per video: return `notifyText: [app line, title, sub]` from update(); default is 001's card.
- 002 (God-Emperor): original look-alike only (sun-ray crown, gold armour, stepped throne, robed crowd, blocky fleets).

## Style v2 (Alex, 2026-11-14): textures, golden ratio, the recipe — default from whatif-003 on
Switch: `STYLE.v2` in `scene/world.js` (true). 001 and 002 were rendered before it and are not re-rendered.
- **Painted textures, all procedural (canvas 256px, no files):** grass (blotches + 4-7px tufts), dirt strata, chunky
  bricks with light top-left / dark bottom-right edges, cobbles, wood planks with grain, scalloped roof tiles, cloth
  weave, leaf dabs, and a soft brush "paint" for everything else. `mat(color)` picks one by colour (`texFor`);
  `mat(color, {tex:'brick'})` forces one, `{tex:'none'}` turns it off. Mapped in world space (`painted()`), so tall
  columns never stretch. Scales: grass .14, dirt .18, brick/cobble/tile .3, wood .35, leaf .35, cloth .7, paint .15.
  Textures must be strong (lows ~120-150 of 255) or they vanish at phone size — the first, gentler pass was invisible.
- **Baked AO feel:** terrain sides darken toward the water (x0.7 at y=-4 -> x1 at y=7), painted bands per block unit,
  grass tops get a lighter rim at each cell edge (x1.13).
- **Golden ratio:** captions at H*0.618, chip ~H*0.236, title ~H*0.146; ornaments sit on 0.382/0.618 points; size steps
  1 : 0.618 : 0.382; colour proportion 62% warm (honey/coral/plum light) / 38% cool (mint-teal magic, teal shadows).
- **Palette "Aurum Dusk" (ours only):** sky 0x1a0f3d / 0x6b2d86 / 0xff9a5a, fog 0x7e4a8a, honey gold 0xffc23d,
  mint-teal magic 0x46f0d2, rose 0xff6f91.
- **2D vector magic over the 3D (`ornaments()` in overlay):** twinkling 4-point stars on phi points (honey / mint),
  a rotating rune ring behind the title (13 glyphs, two rings r=300 and r*0.618+70, glow 18px), a flat honey->mint
  swoosh under the caption. Drawn under title, chips and captions.

### The recipe (colour) — exact numbers, one grade for every video
1. Tone map ACES filmic, exposure 1.05 (renderer).
2. Bloom (UnrealBloom) radius .55, threshold .88 (only magic/lights pass), strength .7 default (shots may go .6-1.0).
3. Grade pass (`GRADE` ShaderPass after OutputPass, display space):
   white balance x(1.04, 1.00, 0.94); shadows += (-0.020, 0.035, 0.060)*(1-L)^2 (teal);
   highlights += (0.050, 0.022, -0.030)*L^2 (honey); saturation 1.12; S-curve mix 0.18 of smoothstep;
   vignette 1 - 0.36*smoothstep(0.36, 1.0, r) with r = |uv-0.5| * (0.5625, 1) * 1.6.
4. Emissive stays 1-2; never a bright white surface (bloom blobs).

## Style LOCKED (Alex, 2026-11-14)
"Keep this style of nice World of Warcraft, the heartwarming magical thing." Blocky fantasy world with a WoW-like vibe: warm golden light, glowing magic, cozy chunky shapes, epic skies, heartwarming tone. Original designs only (no Blizzard characters, names, logos or assets). Every video uses this unless Alex says otherwise. Alex drops the premise; only make the premises he gives.

## Premise queue (Alex)
1. Anti-aging as easy as having a phone — in production (whatif-001).
2. (whatif-002, made 2026-11-14) "What if you woke up as the God-Emperor of a galaxy-wide empire?" — Alex's idea was "the Emperor of Mankind from Warhammer". Make it ORIGINAL: no Warhammer/40k/Games Workshop names, Golden Throne, aquila, Space Marines or other GW designs (GW takes fan content down). Same feel: golden armour, giant throne, endless worshippers and wars, funny + epic, our blocky magical style.
Rule: famous IP in a premise -> make an original look-alike, never the real names/designs.

## Alex 2026-11-14 after video 001: "it's good"
- Style v2 wanted: textures on every 3D object like WoW (hand-painted grass, stone, wood, roof tiles, tiles everywhere) + golden-ratio framing/proportions. "Something easy." Must be a look nobody else has. Perfect the style before mass posting.
- Alex made the channel himself; he uploads 001. Plan: post daily; TikTok + Instagram for the what-if channel coming. Connect his new channel in mob when he presses Connect.

## RULE (Alex, 2026-11-14): science, not nonsense
"The stuff you make, make it scientific, not just nonsense." Every what-if is a real cause->effect chain of sourced facts (min 5, each fetched). The magical/funny character is only the vehicle; jokes max 1-2, the twist at the end. Viewer must learn something real.

## RULE: science first, a sourced chain of consequences (Alex, 2026-11-14, on 003: "make it scientific, not just nonsense")
The funny premise is only the vehicle. The body of every video is real science, told as cause -> effect so the viewer
learns something: at least 5 real facts, each with a fetched source and an exact quote in script.json (make.mjs checks them).
Keep the jokes to 1-2 beats (the hook and the twist). Never state a number the source does not give.

## Style preset `lowpolyMagic` (Alex, 2026-11-14, from @lowpolyshorts reels he liked) — `"style": "lowpoly-magic"`
PS1-style retro low-poly PLUS our magic. Opt-in per script; v2 stays the default and is untouched.
- 3D renders at 270x480 (`STYLE.LW/LH`), page.html upscales nearest-neighbour to 1080x1920 (and renders ~3x faster).
- Vertex wobble: every mesh material gets a clip-space snap (`ps1()`, grid LW/4 x LH/4) via `world.prepare()` after build.
- Textures 32px NearestFilter (the v2 painted ones, downsampled); no antialias; shadow map 1024.
- Grade pass adds a 4x4 Bayer dither and 24 levels per channel (after the v2 recipe: ACES, bloom, grade, vignette).
- On top, crisp at 1080: v2 ornaments (phi stars, rune ring, swoosh), chips, and captions with a thick YELLOW outline,
  a dark inner stroke, white words and the current word mint (#7ff5e0).
- Scene canvas textures should check `world.lowpoly` and use 64px + NearestFilter.

## Lessons (paid for on 003)
- `-(x) ** 2` is a SyntaxError in JS: write `-((x) ** 2)`.
- A camera placed outside the trench band sat inside solid ground: the frame was black. Put cameras inside the cut you film.
- Backlit shots (camera facing the sun) wash a small character out: turn the camera so the sun is behind it.
- Title lines over ~13 characters at 104px overflow the 1080 width: break into 3 lines.
- Space stage: put it high (y=600) inside the 900 sky dome and push fog near/far out; hide `world.island` for a custom world.
- 003 = 13 lines, 62 s with 10 sourced facts — long for a Short; aim for 9-11 lines next time.

## 004 + 005 (made 2026-11-15, night run; NOT posted: the what-if channel is not connected in mob yet)
- whatif-004 "What if the Moon vanished?" (scenes/moon.js, 41 s, 7 NASA/NOAA facts) -> https://blackreaper.us/media/whatif-004.mp4
- whatif-005 "What if you fell into a black hole?" (scenes/blackhole.js, 40 s, 7 NASA facts) -> https://blackreaper.us/media/whatif-005.mp4
- 9 lines ~= 40 s. That is the length to aim for.
- Whisper mishears: "pull" -> "pole", "Closer in" -> "Ploser in". Read the captions on the contact sheet and reword the line when a word comes out wrong.
- In space scenes the world's sky sun term (`skyU.sunCol`) paints an orange glare. Set it dark at night and in space.
- Glowing disks are made of many small emissive blocks, so keep emissive at .35-.6 and bloom at .5-.6, or the whole frame turns white.
- Reset every per-shot scale each frame. The eclipse shot shrank the Moon to 0 and it stayed gone in the next shot.
- A house between the camera and the wizard hides the wizard. Keep the camera's line of sight clear when placing props.

## Alex rejected the 001–005 look (2026-11-15) — style v3 brief, his words
"I don't like his videos… not Minecraft, bad-looking blocks. PS1 mixed with World of Warcraft, nice movements. Low-poly 3D models made properly, textured properly. Crazy shit with good lighting, crisp, vibrant colours, real rendering, very developed code in every video. Brain-rot entertaining."
- NOT: cube/voxel people, flat lighting, muddy dither, random sparkle spam passed off as "magic".
- YES: real modeled low-poly characters (silhouette, faces, hands, proportions WoW-like: big hands/shoulders), crisp hand-painted textures, real lighting (key + rim + bounce, soft shadows, ACES tonemap, bloom only on emissive), vibrant saturated palette, smooth character animation, camera moves with intent, fast brain-rot pacing.
- Process: style study FIRST (stills Alex picks from), then videos. No video is made in the old look again.

## Style v3 study (2026-11-15) — code in `tools/whatif/scene/styles/v3-*.js`; old styles untouched
Render: `node tools/whatif/scene/styles/v3-render.mjs <dir> stills A,B,C,D` / `... motion A`. Video: script.json `"style": "v3", "look": "A", "scene": "styles/v3-moon.js"` -> make.mjs uses `styles/v3-video.html`.
Shared by all 4 (v3-core.js): modeled hero (lathe barrel chest, 2-plate pauldrons, capsule fingers, sphere head with eyes/pupils/glints, brows, ears, beard, topknot, cape, tabard with original sun-leaf emblem, staff + crystal);
diorama (polar-grid plateau with ONE 2048px painted ground canvas: grass strokes, cobble path, flowers, painted contact AO; strata cliff; stone/plaster/timber cottage with shingle roof; lathe tree + noisy icosa canopy with vertex AO; mossy rock);
textures 512px canvas, world-scale UVs (`wuv`), anisotropy 8; key + rim + bounce + hemi + PMREM of the sky (IBL); shadow 4096 PCF radius 4 (r186 removed PCFSoft: it silently falls back);
GTAO; MSAA x4 half-float target; ACES; SELECTIVE bloom (BLOOM layer, everything else drawn black in the bloom pass); display-space grade.
- A Golden Hour: key 0xffc890 3.4 from (14,9,10), rim 0xffe2b0 2.2, bounce green .5, sky 0x2a5ad0/0x7aa8f0/0xffc890, grade sat 1.12 con .2. **PICKED.**
- B Rim-lit Night: moon key 0x8aa8ff 1.4, rim cyan 5.5, pink bounce, stars + moon, grade con .28 vig .42. Moody but the teal goes muddy on grass.
- C Candy: white-pink key 3.0, pink trees, mint grass, violet roof, sat 1.25. Loud; skin/pink compete.
- D PS1 Lit Dusk: dusk orange key, vertex snap 320x568 + affine UVs, 128px nearest textures. Most "PS1", reads darker/less crisp.
Lessons: polar index winding wrong = ground culled (hero floats on fog) — check a top view; a torus strap read as a tongue; the moon on the bloom layer is a white blob (keep it off bloom, emissive .3);
don't put the house between camera and sky targets; motion test on R2: https://blackreaper.us/media/whatif-style-v3-motion.mp4
Weak still: hands/boots are chunky primitives, cloth texture is busy, no facial animation.

# Decisions, conflicts and open items — everything the specialist team found (2026-10-02)

Gathered from the reports of: the preset-library, filter, engines, realism/lessons/judge, presets/intake specialists, the three build inspectors, and the fal engineer. A decision is final unless Alex changes it. An open item must be verified (never guessed) before it is relied on.

## A. Decisions made (and why)
| # | Decision | Source of the conflict | Why |
|---|---|---|---|
| D1 | **Crowd only when asked; for the Reaper news ad use 3 distinct adult neighbours + the unseen filmer**, not 7–10 | style/crowd-realism wants 6–10; bible bans crowds unless asked | bigger crowds give blurry/cloned faces; Alex asked for "people filming" → 3, two filming (one phone vertical, one horizontal); more can be added later |
| D2 | **Peak lands at 4.94 s** (golden rule), not one third | tiktok-pacing says ~1/3 | Alex's golden-ratio rule wins |
| D3 | **Show the finished state, no inflation sequence** (inflatables: a 3–6 s fill is its own recipe) | realism-rules says never show inflation; bible says write a fill | a distilled model can't do a heap becoming a giant |
| D4 | **A skull-faced Grim Reaper is allowed** (it is the Black Reaper product); never a white/pointed hood, faceless hood, several hooded figures, crosses, fire or flags; keep skull face + lantern + ghost-souls visible | bible 12.2a bans hooded robes (hate-group resemblance) | the product IS a skull-faced reaper; rule kept for what it protects |
| D5 | **`inflatable-physics.md` applies only to inflatables** (Scream, Skeleton). The Reaper is a fabric prop on a stake | the app merged every style file into every prompt (the first test became a robed "ghost" figure) | wrong physics = wrong product |
| D6 | **No raw product photo ever reaches a video model**; only clean, text-free frames | carousel text pasted into video | fixed in the app (`landmarkPrompt`) |
| D7 | **Personal-use testimonial lines are banned** ("I have used it every day for a week") and the bible hooks #15–18 and #63–65 are blocked | recipe decision D7 in 00-real-life-recipe.md | no fabricated personal experience |
| D8 | **Captions are burned on afterwards by ffmpeg**, never drawn by a model; "BREAKING NEWS" is a caption, not a spoken line, no anchor/TV | breaking-news.md vs the old breaking-news preset (spoke a reporter line, cut to a room) | models garble text; style file is the law |
| D9 | **The Reaper is battery powered** (lantern silent, no cord/fan/blower/solar) | bible plug-and-fan demos | HANDOFF.md: "never a cord, never solar" |
| D10 | **One question maximum to Alex per prompt**, with the recommended answer pre-chosen; defaults stated in one line | bible 12.4 + AGENTS | he hates questions |
| D11 | **Filter never cuts timed actions**; over-cap prompts lose adjectives and SFX first; "no zoom" bans are not camera moves | filter specialist + build-12 inspector | actions are the direction |
| D12 | **Adults only** in every prompt (no teen/child faces) | filter MINOR_FACE | safety + policy |

## B. Open items (verify before relying on them)
1. **Kling:** MCP prompt cap and per-call credit cost [UNVERIFIED]; fal Kling gets 9:16 from the start image [UNVERIFIED]; the account showed 0 credits on the MCP but 66 + 3 free 1080p trials on the web.
2. **fal:** Veo reference-image count, Wan 3.0 max duration and prompt cap, Seedance 2.0 fast 480p price, Seedance audio notation per route, reference-strength exposure, minimum top-up and spend limits, Nano Banana "9:16" works in code but is absent from the schema enum.
3. **Own engines (LTX/Hunyuan/Wan 2.2):** prompt caps/notation, whether LTX makes sound (generate.sh says yes, filter.js says no), last-frame identity; all scripts "not proven". Wan 2.2 training failed twice (torch 2.4 then torchaudio); fix is in train_lora.sh (torch/torchvision/torchaudio 2.6.0 + preflight) but has not been re-run.
4. **Higgsfield:** preset internals, credit prices and parameters are not in the repo (only names and Marketing Studio).
5. **Recipes not sourced:** delivery/doorbell, Reaper stake-POV and shipping-box details, Scream/Skeleton appearance (`{INFL}` placeholder), the "3 hooks × 2 personas" grid (only the 3-hook split test is sourced), platform AI-label rules.
6. **Composed (untested) judge pieces:** the ffmpeg extraction lines (fps=2, hand crop, tile) and the codes LANDMARK_DRIFT, CROWD_CLONE, SCALE, SILENCE, STYLE_AD are composed; the 12 design-doc codes are quoted as written.
7. **Billing nuance:** Veo/Google counts a clip when the operation starts; fal bills only successful outputs (08-fal-api.md) — the app counts fal when the job starts (safe side).
8. **Stake-prop lesson and Klan-robe incident** have no repo record beyond the SKILL text and the first real clip; kept as lessons.
9b. **AI-disclosure on Meta/TikTok:** the official policy pages did not load for the specialist; the rules in micro-trust/references/formula-and-psychology.md §7 come from secondary blogs. Working decision: label every ad that shows synthetic people as AI-generated on both platforms until the official wording is read and recorded here.
9. **Real-footage study:** 237 pieces from 41 public creator videos live only on Alex's Mac (pile/); their transcripts/captions are the best source for authentic speech and have not been mined into the skills yet.

## C. App fixes still owed (the app's presets.js / compose.js still get these wrong)
From the presets specialist (13 items; the first ones matter most):
1. `presets.js` hard-codes "holding the product by its {part}" and "She" → add a **product class** field (handheld / wearable / yard prop / inflatable) and a **person** field (man/woman/unseen filmer).
2. Default setting is an indoor room → class-dependent settings (front lawn at dusk for the Reaper).
3. `COMMON_AVOID` has "crowd" and `MINORS` says "no crowds" → make class-dependent so neighbours-react can have 2–3 people.
4. `review` preset contains a personal-use line (blocked by D7) → rewrite.
5. `compose.js` merges **every** style file into **every** prompt → apply per class (inflatable-physics only for inflatables; crowd only when asked).
6. Breaking-news preset speaks a reporter line then cuts to a room → align to caption-only, one continuous shot (D8).
7. `defaultSeconds: 16` and `refsPlan` roles are avatar/product/room only → add `yard` and `second-person` roles for classes (c)/(d).
8. Missing recipes: neighbours-react, delivery/doorbell, day-vs-night reveal, scale-reveal, setup-in-5-minutes.
9. The app's per-clip prompts should carry the micro-trust pass (skill `micro-trust`) as timed events.

## D. Checks that already ran (so nobody repeats them blindly)
- Build-12/13/14 inspectors found and fixed: missing packed files, filter cutting actions, "Kids"/"Baby" title false positives, uncounted spend on cancel, approval edits ignored, Wan T5 file, fal no-photo frames (text model fallback), Claude orders defaulting to GPU, timeout-without-cancel at fal, wrong prices on cards, pinned musubi commit.
- The filter has 24 tests; every fal request body is validated against fal's saved OpenAPI schemas (21 tests).

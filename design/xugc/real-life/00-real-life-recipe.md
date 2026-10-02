# XUGC Real Life - The Recipe (00)

Chair: lead. Date: 2026-10-02. Inputs: reports 01 to 06, `.claude/skills/xugc/SKILL.md`, `AGENTS.md`.
Nothing in this meeting ran a GPU, spent money or used a key.

Evidence tags used everywhere below:
- **[V]** verified on the official page by a specialist this session.
- **[S]** secondary source (reseller, tutorial). Re-read from the official page before coding.
- **[N]** not verified at all. Do not code against it.
- **[ours]** a threshold or rule set by this team. Calibrated on real clips before it is trusted.

Real Life is a SYSTEM: closed engines rented from their makers (no middleman), a judge that scores every take, a director layer that turns a short scene into a shot spec, product and avatar reference locking, an audio post chain, a stitcher, the Style Bible, and the small LTX LoRA "Dawn".

---

## 1. The meeting: where the six disagree or overlap, and the decision

| # | Topic | What each said | DECISION and reason |
|---|---|---|---|
| D1 | Judge cost vs takes per shot | 04: 3 engines in parallel, up to 7 generations. 05: 3 takes of the hook, 1-2 of the rest. 06: cheap scout wave, then one full-tier render. | **Scout then final.** Scout tier = Veo Lite 720p. Hook shot: 3 scouts. Every other shot: 1 scout. Pass, then 1 final-tier render, judged again. **Max 5 generations per shot, at most 2 at final tier.** A scout tests the prompt and the spec, not the pixels: a re-render is a new sample (Veo seed only "slightly improves" determinism [V]), so the final is always judged on its own. Judge cost is negligible next to generation, so every take is judged. |
| D2 | Who owns the forbidden list | 04 has a default list (adds pets, mirrors showing a second person, medical claims, music). 05 has a standing list (adds hoods and robes, franchises, impossible physics). | **The director owns it.** One file `forbidden.default.json` = the union of both lists. The director prints it into every spec as `forbidden[]`. The judge checks only what the spec contains, never its own list. Style Bible `## Never` lines and approved thumbs-down rules append to it. |
| D3 | Veo 8 s vs 5 s clips | Skill says 5/10/15/20 s clips. Veo allows 4/6/8 s and **requires 8 s with reference images, 1080p and 4k [V]**. | **The unit is an 8 s clip.** Every product-locked shot uses reference images, so it is 8 s on Veo. Trim 0.15-0.3 s each end, about 7.5 s usable. 15 s ad = 2 clips. 30 s ad = 4 clips. Seedance and Kling take 4-15 s [S]: use 8 s there too for a common grid. 4 s and 6 s Veo clips are only for reference-free b-roll. Beats in a spec never exceed 8 s. |
| D4 | Seedance face rule | 06: realistic human faces in input images are rejected [S]. 05 routes Seedance to creator shots. | **Seedance gets no avatar-face shots until test M17 passes** with a synthetic face. Until then Seedance is routed only to face-free shots (hands, POV, product, scale reveals) with the product reference. Avatars are always synthetic faces, never a real person. |
| D5 | Audio in-model vs post | 03: speech inside the engine, post chain on top. 06: generate one voiceover and lay it over. 05: one speaker, one engine per ad. | **Visible mouth: native speech. No visible mouth: native ambience plus (Midnight) voiceover.** Every engine output is a raw stem that goes through the post chain. Speaking clips in one ad all come from one engine. **Veo has no voice lock between clips [03]: an avatar speaking in clip 1 and clip 3 will have two voices.** So in Daylight an ad has exactly one speaking on-camera Veo clip (the hook). Other speech goes to Kling with a voice-bound Element or Seedance with an audio reference, only after tests M17-M18 pass. Otherwise the line becomes a burned caption on a clip with ambience only. |
| D6 | "No subtitles" wording | 03: put "No subtitles, no on-screen text" in every Veo prompt. 05: never write "subtitle" or "caption" on Veo, state the positive. Google's guide prefers the positive form [05 src 1]. | **Default = 05** (positive form, the word "subtitle" never appears). 03's wording is the A/B variant. Test M14 runs both for $0.80 and picks. The OCR gate catches any rendered text either way. |
| D7 | Testimonial hooks vs the law | 05's hook library and 3 of its 10 shot lists use first-person usage claims ("it's been N days", "I almost returned this", "I'm not being paid to say this", "best $ I've spent", "my husband said"). 03: FTC Endorsement Guides and the Consumer Reviews and Testimonials Rule bar fabricated testimonials; a synthetic person cannot report personal use. | **Blocked by default.** Hooks 15-18, 63-65 and the "skeptic to believer", "testimonial" and "gifting" lists are tagged `testimonial_claim` and the compliance gate rejects any spoken line carrying a personal-use or purchase-experience claim. Allowed: problem, demonstration, reveal, scale, price (only if in the product record), seasonal, comparison, open-loop. Those formats stay as demo-voiced versions ("Here is how it works", "Watch this"). Confident copy only: no "sorry", "unfortunately", "hope", hedges in any line (AGENTS.md). |
| D8 | Judge numbers that conflict inside 04 | Tie-break at "0.4" (0-5 scale) vs "4 points" (0-100). Max 5 takes (section 6) vs 7 (section 10.6). Duration tolerance 20% vs 10%. | Tie-break at **4 points of 100**. Max **5** generations (D1). File gate: duration off by more than 20% = BROKEN_FILE; spec check: more than 10% off = fail. |
| D9 | Loudness | 03: -14 LUFS, -1.5 dBTP, final. 04: -16 LUFS speech target. 06: loudnorm -16 per clip, -14 final. | **Per clip: level-match to -16 LUFS before stitching. Finished ad: two-pass loudnorm -14 LUFS, -1.5 dBTP.** Take-level judging uses Stage 0 numbers only (has audio, speech present when the spec has speech, no clipping, no digital silence). The strict audio checks 1-9 of 03 run on the post-chain audio, not on raw takes. |
| D10 | Multi-shot | 05: Kling native multi-shot (up to 6 cuts, Element identity). 06: ffmpeg stitching. | **Daylight stitches single-shot clips** (frame-chaining: last frame of clip N is the reference for clip N+1). **Kling multi-shot enters in Golden Hour** after the Kling tests. |
| D11 | Who runs the director and the judge | 04: Claude API judge. Skill: no chat box, Claude is the brain through MCP. | **Pilot: Claude in the session, over MCP** (`xugc_share` lets Claude watch a take; new MCP tools carry the spec and the verdict). Zero API dollars. **Automation: an Anthropic API key** is added only when measured judge volume makes the session too slow, and only when Claude asks Alex. The app always computes the weighted total and applies hard-fail zeroing itself, never the model. |
| D12 | Local captioning | 02: Qwen3-Omni captioner "on Alex's Mac". Alex's Mac is Intel. | **Captioning runs on the rented GPU** (the existing pod pipeline). Mac-side work = ffmpeg gates, PySceneDetect, small Whisper, OCR. Which captioner the LTX trainer ships is read from its own source before any run (rule 15). Hosted captioners (Gemini Flash) stay off. |
| D13 | Seedance facts conflict | 01: native 480p/720p. 03: 2.5 id `dreamina-seedance-2-5-260628`, 4-30 s, price about $1.03/10 s at 480p and $2.31/10 s at 720p. 06: 2.0 id `dreamina-seedance-2-0-260128`, 480p to 4k, 720p about $0.15/s, 2.5 id [N]. | **Nothing from Seedance is trusted until read from the BytePlus console.** Plan on 720p, 8 s. Seedance cost is excluded from every ad total below. |
| D14 | Role of Dawn (the LTX LoRA) | 01: a LoRA moves texture and camera feel, adds no anatomy; closed models cannot take a LoRA. | Dawn is the **draft and fallback engine** (about $0.29 per 15 s clip on RunPod, measured) and the first-frame/IC-LoRA experiment. It does not improve Veo, Seedance or Kling. **Dawn 2 is one training run, capped (section 9).** No further LoRA spend until the judge's data shows Dawn drafts help. |
| D15 | Take selection | 06: face-embedding similarity pre-rank. 04: Claude judge. | **Claude judge is the authority.** Embedding similarity is an optional later number fed to the judge. Not built in Daylight. |
| D16 | Speech length | 03: 5-10 words per sentence, one line per 8 s. 05: 8-18 words per 8 s. 04: edit distance on transcript. | **Sentence <= 10 words, total <= 18 words per 8 s clip, rate 1.8-3.2 words/s.** Hook: word 1 by 0.3 s, line <= 10 words. |
| D17 | Thumb reason chips | 04: 6 chips. 02: 7 chips. | One set of 8, one tap, optional: Face/skin fake (FACE), Hands wrong (HANDS), Product wrong (WRONG_PRODUCT), Voice/audio fake (audio), Moves wrong (PHYSICS), Looks too clean/AI (realism), Room wrong (SETTING_DRIFT), Text/logo on screen (TEXT_OR_CAPTION). |
| D18 | Prompt composer | Skill: `compose.js` joins Style Bible + product + scene. 05: the engine prompt is a rendering of a spec. | **`compose.js` stays for the LTX/Dawn path. Closed engines use the spec renderer.** Style Bible `## Prompt` lines fill spec `camera` and style defaults; `## Never` lines append to `forbidden[]`. Engines with no negative field get the avoid list as positive phrases (Veo official advice). Kling's negative field is used only if the official page confirms it. |
| D19 | Hook source | 05: 80-hook library. 02: ad cards with measured hook frequencies. | Library is the starting set. Once 10 ad cards exist for a category, the weekly roll-up (02 section 6.5) chooses hook types and pacing; the library fills the wording. Ad cards hold no frames and never train anything. |
| D20 | Training on outputs | 02 and 04 agree; 05 and 06 silent. | **Veo, Seedance and Kling outputs are never training data.** They produce prompt recipes, judge calibration and preference signal only. Preference training (DPO) needs at least 2,000 pairs from our own LTX outputs; the 👍 scorer needs 300 labelled outputs. Neither is in this build order. |
| D21 | Unlicensed training footage | 02: clips are creators' public videos, cannot be un-trained. Skill rule says never scraped. | Alex decided (2026-10-01) and the data stays on his Mac. Recorded once: the source list stays so any creator can be removed and the LoRA retrained. No new scraping scale-up; Dawn 2 uses the existing 237 pieces plus a capped gap-fill. |

---

## 2. Architecture

```
 Alex (one sentence + product + avatar)         Claude (brain, over MCP)
              |                                          |
              v                                          v
 +----------------------------- XUGC Mac app (Electron main process) ---------------------------+
 |  Keychain keys (never in renderer)   Approve screen (worst-case $)   Ledger (SQLite)          |
 |                                                                                               |
 |  1 DIRECTOR  raw scene -> parse -> contradictions -> SHOT SPEC -> 14-point self-check         |
 |       |        (hooks, ad cards, Style Bible, forbidden.default.json, product + avatar records)|
 |       v                                                                                       |
 |  2 RENDERER  spec -> engine prompt (Veo / Kling / Seedance / LTX templates)                   |
 |       |                                                                                       |
 |       v        reference locking: product photo(s) + synthetic avatar still + last-frame chain|
 |  3 ROUTER -----+--------------+--------------+--------------+                                |
 |                v              v              v              v                                |
 |           Veo 3.1        Kling 3.0     Seedance 2.x    LTX + Dawn (RunPod)                    |
 |           Lite/Fast/Std  std/pro       Mini/Fast/Std   drafts, fallback                       |
 |                \              |              |              /                                |
 |                 +-------- take files (downloaded at once; Veo expires in 2 days) ---+        |
 |                                           v                                                  |
 |  4 JUDGE  Stage 0 ffmpeg gates -> Stage 1 Claude vision + spec_check -> Stage 2 tie-break     |
 |       |   pass: no hard fail, total >= 70, every spec field PASS                              |
 |       |   fail: repair ONLY the failing field's sentence -> re-roll (max 5 gens per shot)     |
 |       v                                                                                       |
 |  5 SOUND  raw stem -> phone EQ -> room-tone floor -> handling/foley -> (music) -> loudnorm     |
 |  6 STITCH  normalize -> trim -> cut on action -> colour match + grain -> captions -> end card |
 |       v                                                                                       |
 |  Library + 👍/👎 chips -> Style Bible rule proposals -> judge calibration -> Dawn data pile    |
 +-----------------------------------------------------------------------------------------------+
```

---

## 3. Which engine does which job (provisional until tests M10-M19 report)

| Job | Engine | Reason / status |
|---|---|---|
| Hook clip, talking head, close product-in-hand, English speech | **Veo 3.1** (8 s, 3 refs: avatar, product hero, product detail or location) | Best documented API [V]; voice realism and room tone [05]. One speaking clip per ad (D5). |
| Scouts (all shots) | **Veo 3.1 Lite 720p** | $0.40 per 8 s [V]. Whether Lite accepts reference images is [N]: test M12. If it does not, scouts use Fast 720p ($0.80 per 8 s [V]). |
| Final tier, Daylight and Golden Hour | **Veo 3.1 Fast 1080p** | $0.96 per 8 s [V]. |
| Final tier, Midnight | **Veo 3.1 Standard 1080p** | $3.20 per 8 s [V]. 4k is skipped for social ads (01); optional hero shot Fast 4k at $2.40 per 8 s [V]. |
| Multi-beat demo, two people in one shot, Spanish, voice-bound avatar across clips | **Kling 3.0** | Elements and speaker tags (05, 03). Entire row depends on tests M18-M19. Golden Hour. |
| Face-free shots: POV hands, assembly, scale reveals, longer takes | **Seedance** | Depends on M16-M17 and the official schema read. |
| Drafts, fallback when a closed engine rejects, first-frame experiments | **LTX + Dawn on RunPod** | Already built and proven; audio always post-processed (the first clip had near-silence at 0-2 s and 10-15 s). |
| Avatar and product still images | **Not specified by any report.** Candidate: a Gemini image model on the same Google key; the Magic Wand cut-out for product photos. | **Unverified.** M3 lists the Google model list (free call) and M9a tests one avatar still before any video. Avatar = synthetic face, one hair/outfit sentence, fixed forever. |

Routing changes only from measured judge scores and Alex's thumbs, not from vendor claims.

---

## 4. The exact pipeline for ONE SHOT

Input: a shot spec (section 6) that passed the self-check. Output: one judged, post-processed clip.

1. **Reserve money.** Price the plan from the table (section 8). Worst case for the shot = 3 scouts + 2 finals. Check against the per-shot, per-ad and per-day caps. Over the cap = cannot be approved. Alex taps Approve once for the ad (section 7).
2. **Render the engine prompt** from the spec (deterministic: same spec, same prompt). Attach references with a job sentence each: "first reference image = the woman, face/hair/outfit; second = the product, shape, colour, label exactly." Veo: `personGeneration: allow_adult` for image modes [V], `durationSeconds: 8`, `aspectRatio: 9:16`. Seedance and Kling: aspect and duration go in API fields, not in the prompt (05).
3. **Scout wave at scout tier.** Hook shot: 3 takes (2 on the routed engine, 1 on the second-choice engine). Every other shot: 1 take. Submit with an idempotency key `shot.id + takeIndex`. Poll (Veo and Seedance every 10 s, Kling every 15 s). Download the moment `done`. Persist state so a quit mid-poll resumes polling, never resubmits.
4. **Judge each take.**
   - Stage 0 (ffmpeg, free): ffprobe (9:16, >= 720x1280, duration within 20%), `blackdetect`, `freezedetect`, flicker from `signalstats`, sharpness, `silencedetect`, `ebur128`, `scdet` for cuts inside a shot. Hard fail = BROKEN_FILE.
   - Stage 1 (one Claude vision call): spec-driven frames (F1, start and end of every beat, 2 hand close-ups at the beat that touches the product, last frame, cap 14), the product and avatar references first, file facts, transcript with word timestamps (Whisper). Output: hard-fail booleans with frame evidence, defect list, 7 scores, `spec_check[]`, one `fix_hint`.
   - The app computes the weighted total and zeroes hard fails.
   - Stage 2: if the top two totals differ by less than 4 points, pairwise A/B twice with order swapped; accept only if both agree.
5. **Decide.** Pass = no hard fail, total >= 70, every `spec_check` field PASS.
   - Pass at scout tier: render **one final-tier take** with the same spec and prompt, judge it. Pass: go to step 7. Fail: the scout take is the fallback.
   - No pass: **repair loop.** The judge's `repair` edits only the failing field's sentence (PHYSICS: make the cause explicit and slower; EXTRA_PERSON: "only one person in the frame, empty background"; TEXT_OR_CAPTION: positive-form clean-frame phrase; WRONG_PRODUCT: re-attach the reference and state shape/colour/label first; SETTING_DRIFT: shorten the shot or lock the prop list; SPEECH_MISMATCH: shorten the line). Re-roll. A field that fails identically twice is a spec problem: the director simplifies the field instead of burning takes.
   - At 5 generations the app stops, shows the best take with the failing fields in plain words ("hands are fused in the middle beat"), and offers one button: "Try 2 more" or "Accept". It never loops past the cap.
6. **Never auto-retry** a `rejected` (safety) or `failed` generation. Surface it. A network error after submit with unknown outcome is marked `unknown` and its maximum cost stays reserved.
7. **Sound.** Raw stem to the post chain (section 10). **Post-check** (judge checks 1-9 on the post-chain audio).
8. Save the winner, keep losers 7 days as cutaways, log engine, seed, prompt, judge JSON and voice source tag.

## 5. The exact pipeline for a 15-30 s AD

1. **Director.** Alex's sentence (or Claude's brief) + product record + avatar record -> parse (product, person, place, action, mood, duration, ad type, quoted speech) -> contradiction pass (C1-C14) -> at most 2 questions to Alex, each with a recommended answer already chosen -> defaults for everything else, listed in `notes` -> the 14-point self-check -> the ad plan.
2. **Ad plan** (the 05 pacing law): hook 0-3 s, demonstration about 40% of runtime, proof or reaction about 25%, CTA 10-15%, end card 1 s on the product. Cut every 2-4 s. 15 s ad = 2 clips (hook + payoff). 30 s ad = 4 clips. Each clip is one shot: one action, one camera idea, one line.
3. **Continuity block** pasted verbatim into every clip: CHARACTER (reference + one wardrobe sentence), PRODUCT (reference + size in human terms), PLACE (one noun, one light), CAPTURE. Frame-chaining whenever clips continue one moment: the last frame of clip N is the first-frame reference of clip N+1.
4. **Price the whole ad** (section 8), show worst case on the Approve screen with the cheap-scout total and the final total side by side. One Approve for the ad.
5. **Run each shot through the one-shot pipeline**, shots in order (parallel inside a shot, one ad at a time). Hook first: if the hook has no passing take at the cap, the ad stops there and Alex decides before more money goes on the body.
6. **Seam audit** at every cut: face, product colour and label, clothing, background objects, light direction. Reject and re-roll the offending clip; never stretch.
7. **Stitch.** Normalize (1080x1920, 30 fps, yuv420p, 48 kHz stereo), trim 0.15-0.3 s each end, cut on action (end each clip mid-motion), one colour reference frame + one phone LUT + 1-2% grain, hard cuts by default (crossfade 0.25 s only when a cut shows a seam). Room tone as a constant bed under the cuts, 40-80 ms audio fades at each cut.
8. **Captions and text** burned in the app (never rendered by an engine): 2-3 words per second, bold sans, safe zone 150 px top and 270 px bottom. Price, URL and label come from the product record, in post.
9. **Final mix:** two-pass loudnorm to -14 LUFS, -1.5 dBTP; export H.264 High, yuv420p, 30 fps, 1080x1920, `-movflags +faststart`.
10. **Whole-ad judge pass:** audio checks 1-14 on the finished mix, compliance gate (claims list, voice source tag, no personal-use claim), a contact sheet of seams to Alex. The system never auto-publishes.
11. **Split test:** export 3 different hooks (clip 1 only changes) over the same body: the cheapest test.

---

## 6. The merged SHOT SPEC (director's 11 sections + judge's fields)

Every field is mandatory. "n/a" needs a one-line reason. Each field names the check that verifies it.

```
spec_id, ad_type, engine_plan[shot -> engine, tier]          check: schema validator
goal { ad_goal, viewer_action (ONE), hook_type (# from library) }   check: self-check 1; shot 1 shows product/effect by 3 s
product { name, shape, colour[], material/finish, parts[], label_text (exact, from reference only),
          size_cm, size_human ("16 ft = 4.9 m, 2.7x a 1.8 m adult"), size_vs_hand (ratio),
          use_steps[], must_never[], reference_image_ids[], look_description (shape+colour only) }
                                                                check: WRONG_PRODUCT; label equals label_text; size ratio on hand close-ups
person { count, age_range, gender, build, skin_tone, hair, eyes, wardrobe (ONE sentence, verbatim every shot),
         accessories, identity_ref_id, voice_descriptor, voice_source: native|stock|consented:<release id> }
                                                                check: FACE, EXTRA_PERSON; same person in F1, middle, last
setting { room (ONE noun, constant), surfaces, props_allowed[3 stable], time_of_day, season, weather,
          light_direction, light_colour, colour_temp, absent[] }  check: SETTING_DRIFT; props appear or vanish
camera { phone_look ("iPhone 15 main camera, 1x, auto-exposure hunt"), capture_mode: selfie|propped|POV|friend|mirror,
         hold (sway low|med), movement (ONE), framing, lens_look, aspect 9:16 (API field) }
                                                                check: handheld-plausible (physics Q6); one move per shot
beats[] { id, t_start, t_end (all inside 8 s),
          action (one verb chain), cause, effect, physics (touch, force direction, weight, timing),
          camera_state, emotion_trigger (visible), sound (tied to the physical event) }
                                                                check: beat start/end frames; PHYSICS; a beat with an effect and no cause is rejected by the director
speech { line (verbatim, <= 18 words per 8 s, sentences <= 10), language, speaker, delivery, start_beat }
                                                                check: transcript edit distance <= 10%; speech starts inside start_beat; mouth open at word onsets; SPEECH_MISMATCH
text_rules { allowed_text[], captions: false, watermark: false, onscreen_text: none | exact string rendered in post }
                                                                check: TEXT_OR_CAPTION (OCR every 0.5 s before our captions)
forbidden[] = forbidden.default.json + job extras                check: FORBIDDEN, UNSAFE
continuity { first_frame_ref, last_frame_handoff (position, motion, product state), inherits }
                                                                check: seam audit
duration (s)                                                    check: ffprobe within 10%
notes[] (resolutions and defaults applied), repair_log[]
```

**forbidden.default.json (union):** crowds, extra people, bystanders, pets (unless specified), children's faces, mirrors showing a second person; captions, subtitles, watermarks, UI overlays, price or URL text inside the generation; any logo, brand mark or label not on the product reference; hateful, cult-like, occult or extremist imagery, robed or hooded figures, white pointed hoods, cloaked ritual figures, group-chant scenes, flags or symbols of any group; sexual or violent content; real celebrities, film or TV characters, franchises, by name or lookalike; product change between shots; a second camera move; "cinematic", "8K", "epic" grading words; beauty-filter faces; medical, cure, guarantee claims and unverified superlatives; personal-use testimonial claims (D7); music in the generation; anything physically impossible for the product (an inflatable standing before the fan runs, a plugged-in product with no cable, a box that opens itself).

**Self-check (director, 14 points, all yes or fix):** one viewer action and product by 3 s; product facts copied from the record, same sentence every shot; same wardrobe sentence and avatar ref with a job sentence; one place, one time, one light direction; one camera move and a capture mode the action allows; every beat cause-then-effect with plausible timing (inflation 3-6 s); hand-off at every cut matches; line verbatim within limits and free of apologies and hedges; sound tied to physical events, music none; text none unless asked; forbidden list printed and absent; engine word counts (Seedance 60-100, Veo 60-120 plus dialogue, Kling master 2 sentences plus shots); minimum people, props, locations; natural-flow read-through.

**Contradictions (C1-C14)** resolve by "latest and most specific wins", one line in `notes`. Ask Alex only for: impossible scale/setting (C2), unspecified speaker with several avatars, a claim or price not in the product record, or a plan over budget.

---

## 7. Judge rubric summary

Scores 0-5 per criterion, total = sum(weight x score) / 5 x 100. **Ship threshold 70.**

| Criterion | Weight |
|---|---|
| Product fidelity | 25% |
| Hands and body | 20% |
| Face and identity stability | 15% |
| iPhone realism | 15% |
| Motion and physics | 10% |
| Brief adherence | 10% |
| Audio | 5% |

**Hard-fail codes** (take scores 0): `WRONG_PRODUCT`, `HANDS`, `FACE`, `EXTRA_PERSON`, `TEXT_OR_CAPTION`, `PHYSICS`, `SETTING_DRIFT`, `SPEECH_MISMATCH`, `FORBIDDEN`, `UNSAFE`, `CLAIM`, `BROKEN_FILE`.

**Physics questions per beat pair (any YES to 1 or 2, or NO to 3, is PHYSICS):** 1 object moves with no contact; 2 object appears, vanishes, multiplies, changes size or colour; 3 hands grip with plausible contact; 4 liquid, fabric, hair respond to gravity and momentum; 5 shadows keep the spec light direction; 6 camera motion is handheld-plausible; 7 human pace of action.

**Pass** = no hard fail, total >= 70, every `spec_check` field PASS. The judge returns `spec_check[{field, verdict, frames, observed, expected, code, repair}]` where `field` is the spec path, so the app edits exactly that sentence.

**Bias controls:** absolute checklist first; pairwise only for the top two, run twice with order swapped; rationale capped at 15 words per score; no take is made by Claude; judge sees frames and measured audio facts only and writes NOT_VISIBLE rather than inventing. **Calibration:** run the 20 Alex-rated takes as a fixed regression set for any judge-prompt change; log judge-pick vs Alex-pick agreement and the thumbs-up rate of picked vs median take per engine; tune take counts after about 50 shots. No agreement number is claimed until the app prints it.

**Alex's feedback:** one tap 👍/👎 on the winner, the 8 chips (D17), "this one is better" on a non-winner (strongest signal: a judge miss). A rule is proposed when the same defect appears on >= 3 thumbs-down takes across >= 2 shots; Alex sees "Add this rule? Yes / No" once. Rules carry an engine tag. A rule with no improvement after 10 uses is flagged for removal.

---

## 8. Cost per shot and per ad (verified prices only)

**Verified prices: Veo 3.1 only [V], per second, audio included, 9:16 or 16:9:**

| Variant | 720p | 1080p | 4k |
|---|---|---|---|
| Lite | $0.05 | $0.08 | n/a |
| Fast | $0.10 | $0.12 | $0.30 |
| Standard | $0.40 | $0.40 | $0.60 |

Per 8 s clip: Lite 720p $0.40 | Lite 1080p $0.64 | Fast 720p $0.80 | Fast 1080p $0.96 | Fast 4k $2.40 | Std 720p/1080p $3.20 | Std 4k $4.80.

Tier plan (scout = Lite 720p, $0.40):

| Tier | Final | Standard shot (1 scout + 1 final) | Hook shot (3 scouts + 1 final) | 15 s ad (hook + 1) | 30 s ad (hook + 3) |
|---|---|---|---|---|---|
| Draft (scouts only, no final) | Lite 720p | $0.40 | $1.20 | $1.60 | $2.40 |
| **Daylight / Golden Hour** | Fast 1080p $0.96 | **$1.36** | **$2.16** | **$3.52** | **$6.24** |
| **Midnight** | Std 1080p $3.20 | **$3.60** | **$4.40** | **$8.00** | **$15.20** |

**Worst case (the number on the Approve screen)** = 3 scouts + 2 finals per shot: Daylight/Golden Hour **$3.12 per shot**, 15 s ad $6.24, 30 s ad $12.48. Midnight **$7.60 per shot**, 15 s ad $15.20, 30 s ad $30.40.

Default caps (Alex changes them only in the app; Claude has no tool to change a cap): per-ad Daylight/Golden 15 s $5.50, 30 s $9.50; Midnight 15 s $10.00, 30 s $16.00; per-day $5.00 until M20 passes, then $15.00.

Not in the totals:
- **Judge:** zero API dollars in the pilot (D11). With an Anthropic key the budget line is $0.05 per take, enforced as a cap; the real figure is read from API usage at M7b. 04's "a cent or two" is an estimate, not a measurement.
- **Dawn (LTX on RunPod):** $0.29 for one 15 s 704x1280 clip, 5 min, measured 2026-10-01. Speed and cost estimates for other lengths are guesses until measured.
- **Seedance and Kling [S], per 8 s, for planning only:** Kling Std 720p with audio $0.112-0.126/s = $0.90-$1.01. Kling Pro 1080p with audio $0.140-0.168/s = $1.12-$1.34. Seedance 2.0 720p $0.15/s = $1.20 (audio inclusion [N]). Seedance Mini 720p $0.08/s = $0.64. Seedance 2.5 [N] and in conflict (D13). Kling and Seedance are prepaid packs: Kling's cheapest listed package is $9.80 [S] and subscription credits do not transfer [S]. These prices become real when read from the consoles (section 12).

---

## 9. Data and training plan for the next Dawn update ("Dawn 2")

Dawn 1: 100 clips, $3.81. 01 and 02 agree the ceiling is coverage and caption quality, not count. A LoRA moves texture, camera feel, room and sound; it adds no anatomy. Dawn 2 is one capped training run, run after Daylight exists.

**Target set:** 320 train + 36 holdout (4 whole creators, about 10%) = 356 kept clips from about 500 collected. Three axes tagged on every clip: behavior (12 buckets), place (10 buckets, <= 18% in any one), sound (8 buckets; speech in >= 60% of clips). At least 20% in non-ideal light. Caps: <= 6 clips per source video, <= 12 per creator, <= 3 of the same room/angle/person. Framing 55% chest-up selfie, 25% hands and product, 20% wider; 9:16 only. Demographic spread within 2:1.

**Filter order (02 section 3, every drop logged in `curation.sqlite`):** technical (decodes, has audio, >= 720 short side, 3.0-6.5 s) -> internal shot cut (PySceneDetect and TransNetV2 must both find none) -> motion band calibrated on clips Alex liked -> blur -> text/overlay (< 8% area, no persistent box) -> watermark/logo (60% crop rule) -> borders/collage -> aesthetic floor at the 5th percentile (not a ceiling; phone footage must survive) -> brightness -> audio (> -32 LUFS, no clipping, no silence > 1 s) -> music-dominated reject -> people (face visible >= 60% of frames, no filters, no minors, no nudity) -> dedup (k-means, cosine >= 0.95 drops the twin). Phone-real score ranks clips inside over-full cells. All [ours] thresholds are calibrated by the dry run (M9) and not trusted before.

**Captions:** one paragraph per clip in the LTX-2 marker format `[VISUAL] [SPEECH] [SOUNDS] [TEXT]`, 90-160 words, assembled by a script from a structured JSON record (so wording is consistent), flaws named as facts, banned words ("cinematic", "beautiful", "stunning", "professional"), no creator, brand or platform names, verbatim ASR in `[SPEECH]`. Trigger `xugciphone` is added by the trainer. Caption dropout 10-15%. Alex reviews a 10% sample (35 clips); a failure rate over 15% re-runs the set.

**Plan and money (RunPod balance about $9, auto top-up off, rule 15 applies to every flag):**
1. Free, on the Mac: gates + grid + gap report on the 237 pieces (M9). Output: a shopping list ("need 11 more: car interior + product sound").
2. Read the LTX trainer's own source and `--help` for the exact installed version: caption script, `process_dataset.py`, `train.py` flags, checkpoint file names. Build 11 already read `process_dataset.py` and `config.py`; `train.py` and the checkpoint step were never verified.
3. **Smoke run, cap $2.00:** 12 clips captioned, preprocessed, 50 training steps, one sample render, LoRA file comes home, pod deleted. It must fail loudly and early (visible report, Build 10's "LAST TRAINING").
4. **Real run, cap $5.00,** only after the smoke run passes and Alex says go. Checkpoints every 250 steps; a 40-prompt fixed eval (seeds fixed) renders 8 prompts per checkpoint; blind A/B against base: ships if it wins >= 70% of 40; memorisation check (cosine > 0.95 to a training clip is reported). Total $7.00 of $9; any RunPod shortfall waits for Alex's top-up.
5. Thumbs on Dawn outputs: 👎 goes to `never-do.md` and the hard-negative bank at once. 👍 is not a training target. Retrain only when 40 new passing clips fill red cells or the same failure appears in 5 consecutive generations.

**Reference-ad analyzer (ad cards):** local ffmpeg + PySceneDetect + Whisper + OCR on the Mac; a frames-only VLM read is a per-ad opt-in. The card (hook, beats, pacing, audio, claims, `template`, `do_not_copy`, `similarity_guard` n-gram overlap <= 0.35) is the only output. Footage is never in a training pool, never a conditioning image, deleted after analysis unless Alex pins it.

---

## 10. Audio chain summary (ffmpeg; all commands in 03 section 5 are untested until M1)

Targets: integrated -14 LUFS, true peak -1.5 dBTP, LRA about 7-9 LU, 48 kHz, AAC 192 kbps stereo.

1. **Extract** the engine audio as the raw stem. Do not denoise (denoising makes AI voices sound underwater); only `afftdn=nr=8:nf=-45` if a hiss fails the noise check.
2. **Phone-mic voice:** highpass 90 Hz, lowpass 11 kHz, -2 dB at 250 Hz, +3 dB at 3 kHz, compressor (threshold -21 dB, ratio 3), `aecho` 28 ms at 10%, limiter 0.89. The `aecho` numbers are the only guessed values: listen on the first 10 clips, fix, freeze.
3. **Room-tone floor** under the whole clip at about -52 dBFS (recorded loop per scene type from the owned library, else pink noise through lowpass 1800 Hz), second layer at about -42 dBFS.
4. **Handling and foley:** 3-6 events per 10 s at -27 dBFS, seeded random times, never within 150 ms before a syllable. Source: our own recordings or bought commercial-licence files (about 60 files). **MMAudio checkpoints are non-commercial: never used. HunyuanVideo-Foley licence is custom: not used before it is read.**
5. **Music (optional, Midnight):** only owned or commercially licensed, -24 dBFS before `sidechaincompress`, ducked about 10 dB under speech. Never chart music.
6. **Mix** with fixed stem order (same inputs, same file), 30 ms head fade, 120 ms tail fade (phone clips never end on digital silence), **two-pass loudnorm** (single pass pumps on short clips), mux with `-c:v copy`.
7. **Judge audio checks** (03 section 7): stream present, length within 100 ms, loudness -14 +/- 1 (finished ad), true peak <= -1.0, zero digital silence, no dead gaps, noise floor -58 to -38 dBFS, zero clipped samples, no abrupt end, Whisper word error <= 15% with the first word intact, 1.8-3.2 words/s, OCR finds no model-rendered text, lip-sync (warn first, hard after calibration on 30 clips), compliance (voice source tag, no personal-use claims). A hard fail regenerates once with the audio block shortened or moved, then switches to the post-sound path.
8. **Prompt blocks** per engine (03 section 4): audio is its own labelled paragraph after the visual description (Dialogue, Ambience, Handling, Mix); the speaker is described visually; `AUDIO. Recorded on an iPhone microphone` opens it; no music requested from any engine.
9. **Voice law:** engine-invented voice, a stock voice, or a clone of a person with a signed written release naming advertising use. Never a real creator, customer, or public figure. The `consented voices` table (name, release id, scope, expiry) exists before any clone feature ships. Provenance watermarks (Veo SynthID, Chatterbox Perth) are never stripped. Reference audio for Seedance and Kling comes only from the consented library, as MP3 of 3-8 s [community].

---

## 11. Money rules

1. Plan = shots x engines x takes. `estimate()` is pure (no network): max = price x seconds with no discount. The Approve screen shows **worst case**, never the average, with the scout total and the final total side by side.
2. Over the per-ad or per-day cap = cannot be approved; the app offers fewer takes or a cheaper tier.
3. **Reservation ledger:** Approve writes a reservation per take at its maximum. Reservations count against the daily cap until the take settles at `actualCost`. A crash cannot lose committed spend.
4. **Cheap scout first** (D1). One job at a time; parallelism lives inside the job (2 concurrent calls per vendor until the account's real limit is read).
5. **No auto-retry** of `rejected` or `failed`; automatic retry only for HTTP 429, 5xx, network reset (backoff 2, 4, 8, 16, 32 s, cap 60 s, 5 attempts, honour `Retry-After`). A submit with unknown outcome is never resubmitted blind (Kling `external_task_id` lookup; Veo and Ark inspect first), marked `unknown`, max cost stays reserved.
6. Prepaid vendors (Seedance, Kling): track the pack balance estimate and block when it is below the worst case. A prepaid pack is spent money: buy only the smallest pack, only when its test milestone is next.
7. **Kill switch:** Cancel calls `cancel()` on every in-flight take and stops submitting; unfinished takes stay reserved until the vendor confirms.
8. Hard timeout 15 min per take. Veo files expire in 2 days [V]: a resume sweep downloads every `done` take on launch.
9. Keys live in the Keychain (`safeStorage`), only in the Electron main process, never logged (redact `x-goog-api-key`, `Authorization`, JWTs), Kling as two entries. The renderer never sees a key. There is **no MCP tool** that changes a key, a cap or the app's code (already the rule).
10. **Google billing has no hard stop that this team has verified.** The app ledger is the cap. Alex also sets a budget alert in Google. Whether the Gemini API accepts prepaid credit is [N]: M-A reads it from the billing screen.
11. RunPod: auto top-up off; pod deleted at job end; pod deadline from the dollar cap; ceiling $4.00/h (the existing rules stay).
12. Judge and director spend count in the ledger as a line, zero in the pilot.

---

## 12. Risks and what is unverified

### Risks, ranked
1. **Voice continuity across clips** (D5). Veo has no voice lock. Mitigation in the plan; Kling Element voice binding and Seedance audio reference are untested.
2. **Seedance face rule** [S] (D4). Could remove Seedance from every avatar shot.
3. **The judge is unproven.** Agreement with Alex's picks is unknown until M7 prints it. A bad judge picks the wrong take with confidence. Mitigation: hard gates are mechanical; Alex sees the winner and the failing fields in plain words.
4. **Best-of-N gain is unmeasured** on closed APIs (04 found no number). The app logs it; take counts change after about 50 shots.
5. **Reference-locked product still drifts** in motion (rotations over 90 degrees per shot are forbidden by house rule). Fidelity rests on the judge catching WRONG_PRODUCT.
6. **Prepaid sunk cost:** the Kling pack ($9.80 [S]) and the BytePlus pack are spent when bought, even if the engine fails its tests. Mitigation: buy each only when its test is next in the order.
7. **Legal:** fabricated testimonials (blocked, D7); AI-content labelling on TikTok and Meta (not researched; read both policies before the first paid campaign and label where required); each vendor's terms for commercial ad use and watermark behaviour (not read); NO FAKES Act not law (built as if it will be); training data is unlicensed third-party footage (D21).
8. **Veo SynthID** is on every output and cannot be removed. Seedance watermark default [N].
9. **Dawn adds nothing to the closed engines** (D14). It is not a quality lever for the paid chain.
10. The per-clip price grid depends on Lite accepting references [N]; if not, scouts cost $0.80, not $0.40, and every Daylight number rises by $0.40 per scout.
11. `ffmpeg` builds differ: `blurdetect` exists only in newer builds. Gate thresholds are [ours] until calibrated on 10 real and 10 bad clips.

### Every [S]/[N] item that must be read from an official page at integration time
Opening the BytePlus and Kling consoles needs a logged-in browser: Codex does this (AGENTS.md section 6). It copies the exact schema into `06-orchestration-apis.md`, replacing each mark.

**Google (verify from the account or a first response):** numeric rate limits and any per-project video concurrency cap [N]; prepaid vs postpaid billing [N]; the JSON nesting of `referenceImages` (re-read the page when coding); whether Lite accepts reference images, `lastFrame`, 4 s, 9:16 and audio [N]; the exact rejection fields (`raiMediaFilteredCount` / `raiMediaFilteredReasons` names) from a real rejected response at M13; which model ids are current (`veo-3.1-generate-preview`, `-fast-`, `-lite-` read from the free list-models call); image-model id for avatar stills [N]; English as the only fully supported speech language.

**BytePlus ModelArk / Seedance:** base URL `https://ark.ap-southeast.bytepluses.com/api/v3` [S]; auth `Authorization: Bearer` and env name [S]; region isolation of keys [S]; model ids 2.0 `dreamina-seedance-2-0-260128` [S], 2.5 `dreamina-seedance-2-5-260628` [S/N] and the Fast/Mini ids [N]; submit path `/contents/generations/tasks` [N]; poll path and statuses [S]; body fields `content[]` roles `reference_image` / `first_frame` / `last_frame` / `reference_video` / `reference_audio`, `duration`, `ratio`, `resolution`, `generate_audio`, `watermark`, `seed` [S]; durations 4-15 s (2.0) vs 4-30 s (2.5) [S]; resolutions (480p to 4k vs 480p/720p) [S]; ratios [S]; the face rule and whether synthetic faces pass [S]; audio notation `{dialogue}` `<sfx>` `( music )` `【subtitle】` [S, ClipDance]; reference-strength parameter [N]; audio-reference format (MP3 reliable, WAV/AAC/FLAC reported failing) [community]; negative-prompt field [N]; billing, token rates, per-second prices, video-reference surcharge [S]; watermark default and invisible credentials [N]; URL expiry, task retention, rate limits, safety codes, account requirements [N].

**Kling 3.0 (official developer API):** JWT HS256 claims `iss`, `exp`, `nbf` [S]; base URL `https://api-singapore.klingai.com` vs `https://api.klingai.com` [S]; kling-v3 endpoint paths (`/v1/videos/text2video`, `/v1/videos/image2video` are for older versions) [N]; body fields `model_name`, `prompt`, `negative_prompt`, `duration`, `aspect_ratio`, `mode`, `cfg_scale`, `camera_control`, `callback_url`, `external_task_id` [S]; multi-shot schema (up to 6 shots, per-shot prompt and duration, 15 s total) [S]; Element creation and voice binding through the API [N]; sound flag [S]; durations 3-15 s, ratios, modes `std`/`pro`/`4k` [S]; prompt limit 2,500 characters [S]; poll statuses `submitted / processing / succeed / failed` [S]; output URL lifetime [N]; prepaid package sizes $9.80 to $7,560 and per-second rates [S]; rate limits and concurrency [N]; safety rejection codes, watermark behaviour [N]; speech languages for the API (consumer page lists ZH, EN, JA, KO, ES) [S].

**Tooling and policy:** every `ffmpeg` filter in the chain with `ffmpeg -filters` on the bundled build, and the sound chain values (CHECK-ON-MAC, untested until M1); Whisper on the Intel Mac; LTX trainer: `train.py` flags, checkpoint names, available captioners, speed, license files (the repo has several; read before commercial use); the Chatterbox and ElevenLabs terms (Midnight only); HunyuanVideo-Foley licence (not used until read); TikTok and Meta AI-label policies; FTC Government and Business Impersonation extension to individuals (still a proposal on the page read).

---

## 13. BUILD ORDER

Rules for every milestone: Claude runs it (not Alex's terminal), drives the loop with a test (not a syntax check), asserts every edit anchor, and shows Alex what he will see before he sees it. No spend until M10. Alex's thumbs and Approve are the only gates.

**Phase A: free (no key, no GPU, no money)**

| M | Milestone | Test that proves it |
|---|---|---|
| M0 | Write these decisions into `.claude/skills/xugc/SKILL.md` (D1-D21, the version names, the first paid test). | Skill diff read back; recipe path linked. |
| M1 | Run the audio chain and Stage 0 gates on the existing real clips (03 section 5, 04 section 5). First `ffmpeg -filters` check of every filter used. | Measured output prints -14 LUFS +/- 1 and TP <= -1.5 on a real clip; the near-silent LTX clip fails the silence gate. If the sandbox cannot fetch `ffmpeg-static`, the same script runs inside the app on the Mac and reports back. |
| M2 | `Engine` interface, takes table in SQLite, reservation ledger, caps, backoff, resume sweep, kill switch, all against a **mock vendor server**. | 06 drills: kill the app mid-poll and resume without resubmit; forced 429 retries; unknown-outcome submit stays reserved; over-cap job refuses approval. |
| M3 | Settings fields per engine with masked paste, Keychain storage, "Test" button wired to the free calls (Veo list models; Ark list tasks; Kling JWT sign + task-list GET). | App test: fake key stored, never present in renderer or logs; Test hits the mock. |
| M4 | Shot spec schema + validator + the 14-point self-check + contradiction rules C1-C14 + `forbidden.default.json` + testimonial-claim gate (D7). | Examples A, B, C from 05 section 12.6 produce valid specs; 10 deliberately broken specs (beat with no cause, wardrobe sentence differing, 40-word line in 8 s, hooded figure, "it's been 30 days") are each rejected for the right reason. |
| M5 | Renderer: spec to Veo, Seedance, Kling and LTX prompts from the templates; word-count caps; deterministic. | Golden files: same spec twice = same bytes; each engine prompt within its word cap; the unverified fields (Seedance `{}` `<>` notation, Kling negative field) are emitted behind a flag that stays off until section 12 is read. |
| M6 | Judge Stage 0 + spec-driven frame sampler + calibration of thresholds on 10 real phone clips (the 237-piece pile) and 10 known-bad generations. | Thresholds stored in settings; hard-fail fires on a known black clip, frozen clip, silent clip. |
| M7 | Judge Stage 1: prompt, JSON parse, app-side weighted total and hard-fail zeroing, `spec_check` repair mapping. Run by Claude in the session over MCP on 20 clips via `xugc_share`. | A known wrong-product clip and a known bad-hands clip hard-fail; agreement with Alex's picks on the 20 is printed. |
| M7b | Measure the real per-judge-call token use. | Number printed; decides whether an Anthropic key is ever needed. |
| M8 | Stitcher: normalize, trim, cut on action, colour match + grain, captions, end card, final two-pass mix, seam contact sheet. | 3 existing clips become one 1080x1920 file; ffprobe + loudness verified; Alex looks at the contact sheet. |
| M9 | Data dry run: gates over the 237 pieces, the three grids, the gap report (no captioning yet). | Table of drops per gate printed on the Mac; shopping list produced. |
| M9a | New screens (Approve table, take grid, thumbs and chips, Settings keys) built in the existing glass style and rendered in Chromium; I look at them before Alex does. | Screenshots reviewed by me; Alex sees them and approves or changes. |

**Phase B: Daylight (first spend; each step passes before the next; all 9:16)**

| M | Milestone | Max cost |
|---|---|---|
| **M10 (FIRST PAID TEST)** | **Veo 3.1 Lite, 720p, 4 s, text-to-video, ONE clip, prompt: a ceramic mug on a kitchen counter, phone camera, no people.** Proves auth, submit, poll, download, 2-day-expiry handling, audio present. If Lite accepts only 8 s, the same test runs once at 8 s. | **$0.20 at 4 s, $0.40 ceiling.** |
| M11 | Lite 8 s image-to-video with `allow_adult` and one product photo. | $0.40 |
| M12 | Lite 8 s with 1-3 reference images (avatar still, product, detail). If Lite refuses references: repeat on Fast 720p and re-price section 8. | $0.40 (or $0.80 on Fast) |
| M13 | One deliberately rejected prompt; capture the real rejection field names for the adapter. | $0 expected, $0.40 ceiling |
| M14 | Subtitle A/B: the same 8 s dialogue prompt, variant D6-default vs variant D6-alt. | $0.80 |
| **Veo block total** | M10 to M14 | **$2.20 ceiling** |
| M15 | One hook shot end to end: spec -> 3 scouts -> judge -> 1 Fast 1080p final -> sound chain. | $2.16 |
| M16 | Seedance Mini 480p 4 s with a product reference, no face, after Codex pastes the official schema. | about $0.16 [S] |
| M17 | Seedance with a synthetic-face input: confirm the rejection behaviour (D4). | about $0.16 [S] |
| M18 | Kling std 3 s silent, then 5 s with sound (JWT, paths, statuses, audio price). Requires the smallest Kling pack. | about $0.25 + $0.63 [S], plus the pack |
| M19 | All three engines on one shot at cheapest tier: parallel runner, ledger, selection grid, stitch. | about $1.00 |
| **M20 (Daylight acceptance)** | One 15 s ad, two shots, avatar and product locked, judge on, stitched and mixed. | **$3.52 typical, $5.50 cap** |

Daylight is done when Alex says the M20 ad is ad-grade, or he names the exact frame that is not and the next round fixes it. The result sets the routing table, the take counts and whether a classifier or an Anthropic key is needed.

**Phase C: Golden Hour**

| M | Milestone | Test |
|---|---|---|
| M21 | Director layer live over MCP (Claude writes the spec from Alex's sentence; the app validates it; at most 2 questions). | 20 raw sentences, including impossible scale, hooded figure, 40-word script: all handled without a question that changes taste. $0. |
| M22 | Spec-checking judge with the repair loop on mocked fails, then live on M20's ad with one broken field injected. | The failing field's sentence changes, nothing else does. About $1.50. |
| M23 | Frame-chaining across clips and a 30 s ad (4 clips). | Seam audit passes; $6.24 typical, $9.50 cap. |
| M24 | Kling multi-shot (if M18 passed) and Kling voice-bound Element for a second speaking clip (D5). | One 8 s multi-shot clip, about $1.34 [S]. |
| M25 | Ad cards: analyzer on 5 ads, weekly roll-up, `similarity_guard`. | Card JSON validates; footage deleted after analysis. $0. |
| M26 | Thumbs to Style Bible: rule proposals, per-engine tags, weekly calibration report. | 30 rated takes produce one proposal Alex can accept with one tap. $0. |

**Phase D: Dawn 2 (capped, after Phase B)**

| M | Milestone | Max cost |
|---|---|---|
| M27 | Read the LTX trainer's own source for caption, preprocess and train flags; validate the config with its own validator. | $0 |
| M28 | Smoke run on the pod (section 9, step 3). | $2.00 |
| M29 | Real training run after the smoke run passes and Alex says go. | $5.00 |
| M30 | 40-prompt blind A/B vs base and the memorisation check. | $0 (renders count inside the $5.00) |

**Phase E: Midnight**

| M | Milestone | Test |
|---|---|---|
| M31 | Owned foley and room-tone library (about 60 files) and the `consented voices` table. | Library mixed into a clip; judge noise-floor check passes. $0 |
| M32 | Midnight tier: Veo Standard 1080p finals and the optional Fast 4k hero shot. | One shot at $3.20 and one 4k hero at $2.40. |
| M33 | Voiceover for no-mouth shots (Chatterbox or a stock/consented voice) and the voice-continuity fix for multi-clip speech. | Same voice in 2 clips; judge check 14 passes. Pod time under $1.00. |
| M34 | Lip-sync scorer calibrated on 30 reference clips; the check moves from warn to hard fail. | Offset within +/- 100 ms on the reference set. $0 |
| M35 | Finished-ad pass: licensed music with ducking, end card, 3-hook split export. | Midnight 15 s ad at $8.00 typical, $10.00 cap. |

---

## 14. What ALEX must do (in this order, one step at a time)

Claude tells Alex when each field exists in XUGC Settings; he never opens a terminal.

1. **Google (now).** Open Google AI Studio with the Google account for this business. Create an API key named `xugc`. Open its billing, switch to the paid tier, and add $20 as prepay if Google offers prepay; if Google offers only a card, put a budget alert at $20 and send Claude a screenshot of the billing screen. *Paste nothing yet.*
2. **Paste the Google key** into XUGC > Settings > "Google key" when Claude says the field is ready (after M3). Press Test.
3. **Press Approve on M10** when the Approve screen shows "max $0.20". That is the first money spent.
4. **Pick the avatar:** Claude shows 4 synthetic faces (M9a/M12); Alex taps one. **Send one clean product photo** per store: white or plain background, **no text, no diagram, no infographic** (a photo with text is pasted into the video with the text).
5. **Tap 👍 or 👎** on every take Claude shows, and the chip when it is 👎. Nothing else is asked of him in Daylight.
6. **Send one message to Codex** (it has the live browser): "Open the BytePlus ModelArk docs 'Create a video generation task' and the 'Dreamina Seedance 2.5 tutorial', and the Kling developer API reference; copy the exact request schema, model ids, prices, rate limits and the face rule into `design/xugc/real-life/06-orchestration-apis.md`, replacing every [S] and [N] mark." Claude supplies this text; Alex pastes it.
7. **BytePlus (after M15 passes).** Create the ModelArk account, create an API key, buy the smallest prepaid pack. Paste the key into Settings > "BytePlus key".
8. **Kling (after M17 passes).** Create the developer-API account (global site, not China), buy the smallest resource pack ($9.80 [S]), create the Access Key and the Secret Key. Paste both into Settings > "Kling access key" and "Kling secret key".
9. **RunPod: do nothing.** Keep about $9, auto top-up off. Claude tells him before Dawn 2 whether a top-up is needed (the plan needs $7.00).
10. **Anthropic API key: not now.** Claude asks only if M7b shows the session cannot carry the judge.

## 15. What I (Claude) do FIRST

1. Write the decisions into the xugc skill (M0) before the conversation moves on, as the rules require.
2. Run M1: the audio chain and gates on a real clip, and print the numbers.
3. Build M2 to M5 in that order (ledger and mock first, so no money can leave before the caps work), running the loop tests, not syntax checks.
4. Run M6 to M9: calibrate the gates on the clips he already has, and give him the gap report for the data.
5. Render the new screens (M9a) and look at them myself before showing Alex.
6. Hand Alex step 1 of section 14 as the first thing he does. Report each milestone as what he has now, then stop.
7. Do not spend, rent or call a vendor until Alex presses Approve on M10, and never claim an engine fact that carries an [S] or [N] mark.

---

## D22. Landmark frames (Alex, 2026-10-02): hidden keyframes shared by every engine

**Problem (Alex):** three engines read the same prompt three ways and draw three different shots.
**Decision:** before any video render, a "curator" step makes hidden still images ("landmarks") of the shot at its key moments (typical: 0 s, 2 s, 4 s, 6 s, 8 s of an 8 s clip). All landmarks share one person, one product and one place (made from the locked product photo and avatar). They are never shown in the ad.

**How the engines use them**
- Veo 3.1 [V, Google docs]: first frame `image`, last frame `lastFrame` (duration must be 8), up to 3 `referenceImages` (duration must be 8). So an 8 s clip = landmark 0 as first frame, landmark 8 as last frame, landmarks 2/4/6 described in the prompt and, if room remains, passed as reference images.
- Seedance [S, unverified until Codex reads the BytePlus console]: roles `first_frame`, `last_frame`, `reference_image` reported.
- Kling 3.0 [S, unverified]: start/end frames and elements reported.
- A 15 s or 30 s ad: the last landmark of clip n is the first frame of clip n+1 (continuity chain from the director's bible).

**Judge use:** sample the finished clip at the landmark seconds and compare each frame with its landmark (product, person, place, light, pose). A frame that is far from its landmark fails the take; the failing second and field go back into the repair prompt. A cheap image-similarity check runs first; the vision judge decides the rest.

**What is NOT yet known (verify before building):** which image model makes the landmarks (candidate: a Gemini image model on the same Google key [N]); its price per image [N]; whether it keeps one person and one product identical across 5 stills when given the product photo and avatar as references [N] (a $1 test decides); whether Seedance and Kling accept a last frame [S].

**Build placement:** new milestone before the first full-ad render, after M12 (avatar and product stills). First test: make 3 landmarks of one simple shot with the locked product photo, then render the same 8 s shot twice on Veo Lite (with and without landmarks) and compare. Cost to be quoted from the verified price of the image model before Alex approves anything.

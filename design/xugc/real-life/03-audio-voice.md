# 03 - Audio, voice and lip-sync for Real Life (XUGC)

Author: audio/voice/lipsync engineer. Written 2026-10-02.
Scope: how each engine makes sound, when to make it in-model vs afterwards, the ffmpeg chain, prompt blocks, voice law, and an automatic judge checklist.

Honesty labels used below:
- **[official]** = vendor documentation or repository.
- **[community]** = third-party guide or blog. Treat as a starting point and verify on the first test batch.
- **[untested here]** = ffmpeg commands: this sandbox has no ffmpeg installed, so the chain below was written from the ffmpeg filter documentation and NOT executed. Step 0 of the build is to run it on one real clip (rule 1 and rule 15 of AGENTS.md).

---

## 1. The answer in ten lines

1. Generate sound **inside** Veo 3.1, Seedance 2.5 and Kling 3.0. All three make speech, ambience and effects in the same pass as the picture, which is what gives true lip-sync. Do not replace their speech with a separate TTS unless a clip fails the judge.
2. Treat the model's audio as a **raw stem**. Always run it through the same post chain (section 5): phone-mic EQ, light compression, a room-tone floor, loudness to -14 LUFS / -1.5 dBTP.
3. Keep spoken lines **short**: 5-10 words per sentence, one speaker, one line per 8 seconds is the safe load. All three engines degrade on long lines.
4. Prompt audio in its own labelled block (Dialogue / Ambience / Handling / Music), not mixed into the visual description. Audio goes in the prompt even for a silent-looking scene, because every engine invents audio when it is left blank, and "no dead silence" is a rule.
5. Veo can render **on-screen subtitles** from dialogue text. XUGC burns its own captions, so every Veo prompt carries "No subtitles, no on-screen text".
6. Add sound afterwards only for: (a) a clip whose audio fails the judge, (b) an engine with no audio (LTX self-hosted fallback), (c) the room-tone floor and any music bed, (d) a different language than the engine does well.
7. Voices: use the engine's own invented voice, a licensed stock TTS voice, or a clone of a person who gave **recorded written consent**. Never clone a real person, creator or celebrity without consent.
8. Synthetic "customers" cannot say they personally used the product for N weeks. That is a deceptive testimonial (section 8). Scripts are written as demonstration plus claims the store can back up.
9. The judge runs 14 automatic checks (section 7). Fail any hard check = regenerate once, then fall back to the post-sound path.
10. Music is optional and low. Native model music is quarantined from the speech stem and ducked; commercial tracks are never used unless licensed.

---

## 2. What each engine does with audio

### 2.1 Veo 3.1 (Google)
- Native audio, always on: Google's docs state "Veo 3.1 is a model for generating video with native audio." [official: https://ai.google.dev/gemini-api/docs/video]
- Third-party descriptions say audio is 48 kHz and cannot be switched off [community: https://www.atlascloud.ai/blog/ai-updates/veo-3.1-prompt-guide]. The claim "lip-sync under 120 ms" is a vendor-reseller marketing number; Google's own material does not publish a lip-sync guarantee and says natural, consistent spoken audio "remains an area of active development" [community summary: https://www.keyvalue.systems/blog/veo-models-at-a-glance/]. Plan on measuring sync with the judge, not trusting it.
- Dialogue syntax that works: prose with the line in double quotes, attached to an attribution clause with the delivery direction before the quote: `A woman in a grey hoodie says, calmly and a bit out of breath, "I did not think this would work."` [community: https://prompt-architects.com/blog/101-veo-dialogue-prompts]
- Load: an 8 s clip carries one substantial line or two brief ones. Read the line aloud at the pace you want and time it; leave a beat of silence at head and tail. If the line is rushed, cut words; do not ask for "slower". [community: same source]
- Multi-speaker: no published syntax. Attach each line to a visual description ("the woman in the red coat says..."), not a name. Voice is not persistent between clips; there is no voice-lock. [community: same source]
- Failure modes: dialogue ignored when it sits late in a long prompt (move it to the first third, trim style text); close-ups expose sync errors, medium/wide shots hide them; invented on-screen subtitles; wrong voice character unless the visual description of the speaker is specific. [community: same source; subtitle behaviour is widely reported, also check on first test]
- Sound effects and ambience are prompted as plain labelled sentences: [community: https://prompt-architects.com/blog/150-prompting-audio-in-veo-3-1-sound-music-ambience]

### 2.2 Seedance 2.5 (ByteDance, official API via BytePlus ModelArk)
- Released 2026-07-31; model id `dreamina-seedance-2-5-260628`; 4-30 s clips, 480p/720p, native synchronized audio including speech; up to 10 audio references at model level (an API may expose fewer). [official product page: https://www.byteplus.com/en/product/seedance ; summaries: https://the-decoder.com/bytedances-seedance-2-5-generates-30-second-video-clips-with-built-in-audio/ and https://dev.to/masonreed1/seedance-25-in-practice-capabilities-api-workflow-and-cost-4pfm]
- The dev.to piece itself says audio sync "needs to be measured with your own material" and does not document lip-sync languages for 2.5. The language and syntax details below come from guides on **Seedance 2.0**, the immediate predecessor, and are carried over as the working assumption until the first 2.5 batch confirms them. [community, 2.0: https://www.cutout.pro/learn/blog-seedance-2-0-audio-guide/ , https://www.ambienceai.com/tutorials/seedance-prompting-guide]
- Dialogue syntax (2.0 guides): `Character speaks in English: "line"`; put the literal line in quotes and name the language; write non-Latin scripts natively, not romanised. Lines of 5-10 words, slower delivery, medium close-up with a locked camera, front or three-quarter face give the best sync. Mandarin and English are strongest; Japanese and Korean drift on long phrases. Languages claimed: English, Chinese, Japanese, Korean, Spanish, French, German, Portuguese. [community]
- Effects: name the source and surface ("boots on wet cobblestone"), anchor with timestamps (`SFX: door slam at 3s`), keep to 2-3 simultaneous layers, state the mix ("Dialogue clean and prominent, music low, ambient subtle"). [community: cutout.pro]
- Failure modes: audio cut off mid-clip when audio references are long (trim references to 3-8 s); reference audio in MP3 is reliable while WAV/AAC/FLAC were reported to fail silently; singing is unreliable; professional sound design still beats native audio. [community: cutout.pro]
- Cost note for the app's price display: 10 s clip about $1.03 (480p) or $2.31 (720p); budget about 3x per accepted clip. [community: dev.to link above]

### 2.3 Kling 3.0 (Kuaishou, official API)
- Voice, effects and background audio generated in the same pass; dialogue in Chinese, English, Japanese, Korean and Spanish, with accents (American, British, Indian English) and code-switching in one video; clip length 3-15 s; optional reference audio to steer the voice. [official: https://kling.ai/feature/text-to-speech]
- Dialogue syntax: name each speaker and tag lines: `[Character Name]: "Dialogue text"`, and describe language, pace, tone and delivery in the prompt. Multi-character coreference keeps the right line with the right speaker. [official: same page]
- Kling is the best of the three for two people talking in one shot and for Spanish. It is not documented for French, German or Portuguese; do not promise those on Kling.
- Failure modes are not published by Kling; run the judge. [community: https://morphic.com/resources/how-to/kling-3.0-guide]

### 2.4 LTX-2 (self-hosted fallback already in XUGC)
- Generates synchronized audio and video; has an audio-to-video pipeline and a "DubIt" pipeline that rephrases speech while matching speaker identity and lips. Prompting: chronological description, about 200 words, no special audio syntax. [official: https://github.com/Lightricks/LTX-2]
- The first real LTX clip had near-silence at 0-2 s and 10-15 s (xugc skill). So LTX audio is **always** post-processed with the floor layer in section 5.3, and the judge's silence checks are hard fails for it.

### 2.5 Comparison for routing

| Need | Veo 3.1 | Seedance 2.5 | Kling 3.0 | LTX-2 |
|---|---|---|---|---|
| Native speech | yes | yes | yes | yes (weaker) |
| Multi-speaker | weak, by description | by description (assumed) | best, named tags | weak |
| Languages (documented) | English strongest | EN ZH JA KO ES FR DE PT (2.0 claim) | ZH EN JA KO ES | EN mainly |
| Voice control | none | audio reference | audio reference | prompt only |
| Max length | 8 s | 30 s | 15 s | 20 s |
| Subtitle artefact risk | high | low | low | low |
| Route | single-speaker hero, English | long one-take talking head | two-person, Spanish | cheap drafts |

---

## 3. Inside the model or afterwards

Decision rule, executed per clip by the app:

1. Does the shot have a **visible mouth speaking**? Use the engine's native speech. Replacing it later needs a lip-sync model and almost always looks worse than native.
2. No visible speaking (hands-only demo, b-roll, voiceover)? Generate the picture with native ambience, then lay **voiceover** from TTS in post. Voiceover has no sync problem.
3. Native speech fails the judge twice (wrong words, drift, rushed)? Fallback: regenerate the picture with the face turned away or the line moved to voiceover.
4. Always add in post, regardless: room-tone floor, optional music bed, loudness. Never rely on the model for these.
5. Foley after the fact (product click, zip, pour) is allowed when the model missed it. Open tools:
   - HunyuanVideo-Foley: video to sound effects, Tencent Hunyuan Community License. That licence is custom, not MIT/Apache; read its territory and revenue conditions before shipping it in a paid app. [official: https://github.com/Tencent-Hunyuan/HunyuanVideo-Foley ; the NOTICE file does not itself state the terms]
   - MMAudio: code MIT, but the **pretrained checkpoints are CC-BY-NC 4.0 (non-commercial)** and the authors do not guarantee commercial suitability. **Do not use in XUGC paid output.** [official: https://github.com/hkchengrex/MMAudio]
   - Safest foley source: a small library of recordings we own or buy under a commercial licence (zip, tap, cloth, pour, door, footsteps, phone-handling thumps), mixed at timestamps. This is the default.
6. Voice tools for voiceover:
   - Chatterbox: MIT, 23+ languages, zero-shot clone from about 10 s of reference, every output carries an imperceptible Perth watermark. Good self-hosted choice; keep the watermark. [official: https://github.com/resemble-ai/chatterbox]
   - ElevenLabs (hosted): requires the user to confirm the right to clone a voice; cloning public figures is prohibited. Use their stock voices or a consented clone. [community summary of policy: https://margabagus.com/elevenlabs-voice-consent-policy/ ; confirm in their current terms before launch]
   - Other open TTS models carry non-commercial licences more often than not; check each licence file before adding one.
7. Lip-sync-after (dubbing a finished clip into another language): LTX-2 DubIt is the open option already in our stack [official link above]. Use it only for translations of our own generated clips.

---

## 4. Per-engine audio prompt blocks

Rules for all blocks:
- Audio is a separate paragraph after the visual description, with fixed labels.
- Speaker is always visually described (works for every engine; Kling also gets the tag).
- Max 1 spoken sentence per 4 seconds, max 10 words per sentence, contractions, no brand-name tongue-twisters, numbers written as words.
- Always include imperfect-human cues: one breath, one small hesitation, "slight room echo", "phone microphone".
- Always end with the negative line, because the distilled/API prompts have no negative field for most engines.
- Replace `{...}` from the scene brief.

### 4.1 Veo 3.1 block (8 s)
```
AUDIO. Recorded on an iPhone microphone, no studio polish.
Dialogue (starts at 1 s, nothing before it but breath): The woman in the {outfit} says, in a relaxed {tone} voice, slightly close to the phone, "{line, max 12 words}"
Ambience: {room, e.g. small kitchen} room tone, faint refrigerator hum, distant street traffic through a window, occasional cloth rustle.
Handling noise: soft thumps and finger taps on the phone body, a small wind puff once.
Mix: voice clearest, ambience low but never silent, no music.
No subtitles, no captions, no on-screen text, no logos, no voiceover narrator, no laugh track.
```
Put the dialogue sentence in the first third of the whole prompt if it is ignored.

### 4.2 Seedance 2.5 block (10-30 s)
```
AUDIO. Phone-recorded sound, one continuous room.
Voice: the {age} {gender} on screen speaks in English: "{line 1}" (about 1 s). Pause, quick breath. Then: "{line 2}" (about 6 s). Calm, conversational, slightly fast, not a presenter voice.
Ambience: {room} tone, soft traffic outside, a distant door.
SFX: {product sound} at {t}s, cloth rustle when she moves.
Mix: dialogue clean and prominent, ambient subtle, no music.
No subtitles, no text overlay, no singing.
```
For a voice reference, pass one MP3 of 3-8 s from a consented recording (or a licensed stock voice); the cutout guide reports longer references can cut off audio and WAV/AAC/FLAC can fail silently.

### 4.3 Kling 3.0 block (up to 15 s)
```
Audio: natural phone-recorded sound with room tone and soft street noise, never silent.
[Maya]: "{line}" - American English, mid-20s female, relaxed, a little out of breath, medium pace.
[Jordan]: "{reply}" - American English, male, amused, quieter.
Handling noise: light thumps on the phone. No music, no subtitles, no text on screen.
```
Use one character if the brief has one person.

### 4.4 LTX-2 (about 200 words total, audio inside the story)
Write the sound as part of the chronological action: "She says, 'line', in a close, quiet voice; behind her a fridge hums and cars pass." Then always apply section 5.3.

### 4.5 Block that must go into the Style Bible (`sound-layers.md`)
Keep the existing file; add these lines under `## Prompt`: "recorded on a phone microphone", "continuous room tone, never silent", "one small breath before the first word", "no music unless stated". Add to `## Never`: "studio-clean voice", "announcer voice", "subtitles or on-screen text from the model", "silence longer than half a second", "laughing track", "brand jingles".

---

## 5. Post-production chain (Mac, ffmpeg)

All commands are **[untested here]** (no ffmpeg in this sandbox). The first task in the build is to run them on one real clip and view the waveform. Filter names and options are from the ffmpeg filter documentation: https://ffmpeg.org/ffmpeg-filters.html . Loudness background: https://ffmpeg-cookbook.com/en/articles/loudness-normalization/ and EBU R128 (-23 LUFS broadcast, -1 dBTP ceiling) https://en.wikipedia.org/wiki/EBU_R_128 .

Targets (choose and keep): **integrated -14 LUFS, true peak -1.5 dBTP, LRA about 7-9 LU**, 48 kHz, AAC 192 kbps, stereo. -14 is the level the short-form platforms are commonly normalised around [community: ffmpeg-cookbook link above]. Phone clips are naturally dynamic; -14 with light compression sounds like a loud phone video without sounding mastered. Do not go louder than -13.

### 5.1 Step A: separate and clean the model audio
```
ffmpeg -i in.mp4 -vn -ac 2 -ar 48000 raw.wav
```
Do not denoise the model's own room tone; denoising makes AI voices sound underwater. Only remove a hiss that fails the judge's noise check (section 7) with `afftdn=nr=8:nf=-45`, never stronger.

### 5.2 Step B: phone-microphone voice
```
ffmpeg -i raw.wav -af "
highpass=f=90,
lowpass=f=11000,
equalizer=f=250:t=q:w=1.2:g=-2,
equalizer=f=3000:t=q:w=1.0:g=3,
acompressor=threshold=-21dB:ratio=3:attack=6:release=90:makeup=3,
aecho=0.9:0.2:28:0.10,
alimiter=limit=0.89
" voice.wav
```
Reasoning: a phone mic has little below 90 Hz, a small proximity-cut around 250 Hz, a presence lift near 3 kHz (phone speech processing), a ceiling around 11 kHz, mild AGC-style compression, and a 28 ms 10 percent echo that stands in for a small hard-walled room. `aecho` values are the only guessed part; the judge's reverb check does not exist, so review by ear on the first 10 clips and fix the numbers, then freeze them.

### 5.3 Step C: room-tone floor (kills dead silence and covers the LTX gaps)
Generated pink noise shaped to a room, at about -52 dBFS, running the full length:
```
ffmpeg -f lavfi -i "anoisesrc=color=pink:amplitude=0.02:sample_rate=48000:duration=DURATION" \
 -af "lowpass=f=1800,highpass=f=40,volume=-6dB" floor.wav
```
Better when available: a recorded 30 s room-tone loop from our library per scene type (kitchen, bedroom, car, street, bathroom, gym). Loop with `-stream_loop -1` and trim. Add a second layer, street or HVAC, at -40 to -45 dBFS, scene-dependent.

### 5.4 Step D: handling noise and foley events
Mix 3-6 tiny events per 10 s from the owned library (finger tap, phone thump, cloth rustle), each 0.1-0.4 s, at -30 to -24 dBFS, random timings, never within 150 ms before a spoken syllable:
```
-i tap.wav -filter_complex "[1:a]adelay=2350|2350,volume=-27dB[t1]; ..."
```
Place them from a timestamp list produced by the app (seeded random so the same clip is reproducible).

### 5.5 Step E: music bed with ducking (optional)
Only a track we own or license for ads (library music bought under a commercial licence, or generated music from a service whose terms allow commercial use). Level -24 dBFS before ducking. Voice sidechains the music:
```
[music][voice]sidechaincompress=threshold=0.04:ratio=8:attack=20:release=350[ducked]
```
`sidechaincompress` takes the main signal first and the key signal second.

### 5.6 Step F: final mix and loudness (two-pass)
```
# mix
ffmpeg -i voice.wav -i floor.wav -i events.wav -i music_ducked.wav -filter_complex \
 "[0][1][2][3]amix=inputs=4:normalize=0:duration=first[m]" -map "[m]" mix.wav
# measure
ffmpeg -i mix.wav -af loudnorm=I=-14:TP=-1.5:LRA=9:print_format=json -f null -
# apply with the measured_* values, linear=true
ffmpeg -i mix.wav -af "loudnorm=I=-14:TP=-1.5:LRA=9:measured_I=..:measured_LRA=..:measured_TP=..:measured_thresh=..:offset=..:linear=true" -ar 48000 final.wav
# mux with the captioned video, audio last
ffmpeg -i captioned.mp4 -i final.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest out.mp4
```
Two-pass is required: a single-pass `loudnorm` works dynamically and can pump on short clips.

Fade 30 ms at the head and 120 ms at the tail (`afade`) so the cut is not abrupt; phone clips never end on digital silence.

### 5.7 Defaults the app should ship
Voice stem at 0 dB reference; floor at -52 dBFS; second ambience layer at -42; events at -27; music at -24 pre-duck, ducked about -10 dB more under speech. Order of stems is fixed so the same inputs yield the same file.

---

## 6. How to prompt for realistic sound (rules)

1. Name the **recording device and the room**, not "high quality audio".
2. Specify **sources and surfaces**, not adjectives: "fridge hum, rubber soles on tile".
3. Imperfection is a feature: breath, a swallow, a half-second false start. State one, not five.
4. Never leave silence unspecified. Every block names a continuous bed.
5. Speech: short sentences, contractions, one speaker, natural pace; the model's rushing comes from long lines.
6. Keep the voice description tied to the person's look (age, gender, accent, energy), since Veo has no voice lock and Kling/Seedance use references.
7. Do not ask for music, jingles or lyrics from the model. Add music in post.
8. Ban words the model turns into captions: "text", "subtitle", "caption" appear only in negations.
9. One scene = one continuous acoustic space; don't ask a model to cut between a quiet and a loud room inside one clip.
10. Regenerate with the line moved earlier or shortened before changing anything else.

---

## 7. Judge checklist (automatic, run on every finished clip)

Tools: ffmpeg/ffprobe, an open speech-to-text model (Whisper-class) on the Mac or worker, and an optional lip-sync scorer. Thresholds marked "calibrate" are starting values to tune after the first 30 clips.

| # | Check | How | Pass | Hard fail? |
|---|---|---|---|---|
| 1 | Has an audio stream | `ffprobe -select_streams a` | 1 stream, 48 kHz, >= 2 ch or mono duplicated | yes |
| 2 | Audio length matches video | compare durations | within 100 ms | yes |
| 3 | Integrated loudness | `ebur128` / loudnorm json | -14 LUFS +/- 1 | yes |
| 4 | True peak | same | <= -1.0 dBTP | yes |
| 5 | No digital silence | `silencedetect=noise=-70dB:d=0.1` | zero hits | yes |
| 6 | No dead-quiet gaps | `silencedetect=noise=-58dB:d=0.5` | zero hits (a room floor at -52 never trips this) | yes |
| 7 | Noise floor in non-speech frames | `astats` on speech-free windows | RMS between -58 and -38 dBFS (calibrate) | no, warn |
| 8 | Clipping | `astats` Number of clipped samples | 0 | yes |
| 9 | Abrupt end | RMS of last 150 ms vs previous second | fades below -6 dB, or room floor continues; no truncated syllable | yes |
| 10 | Words match script | Whisper transcript vs script, normalised WER | <= 15 percent (calibrate) and the first word is not cut | yes when clip has dialogue |
| 11 | Speech rate | words per second from transcript | 1.8-3.2 w/s; above 3.6 = rushed | warn / fail above 3.6 |
| 12 | Lip-sync | SyncNet-class scorer (research code; check its licence before bundling) or a frame-sampled mouth-open vs speech-energy correlation | offset within +/- 100 ms; correlation above threshold set from 30 reference clips | warn, hard after calibration |
| 13 | No model subtitles / garbled on-screen text | OCR a frame every 0.5 s before captions are burned | none other than our own captions | yes |
| 14 | Compliance | script text against the claims list; voice source tag is `native`, `stock` or `consented:<release id>` | tag present; no first-person usage claims (see 8.3) | yes |

On a hard fail the app regenerates once with the audio block shortened/moved, then switches to the post-sound path (voiceover + floor) and re-judges. Fails are logged with check numbers into the 👎 pile ("what failed") like the existing take feedback.

---

## 8. Legal and ethical rules for voices

Not legal advice; these are the operating rules to build into the app. Confirm with a lawyer before scaling spend.

1. **No cloning a real person's voice without their recorded, written consent for this specific use.** This includes creators, customers, celebrities, politicians, and anyone found on TikTok. Store the signed release id with the voice; the judge's check 14 requires it. Consent should state: purpose (advertising), brands, territories, duration, the right to withdraw.
2. **Public figures: never**, even with a "parody" excuse in an ad. ElevenLabs likewise prohibits it and suspends accounts [community: https://margabagus.com/elevenlabs-voice-consent-policy/].
3. **Voice actors/creators we pay** sign a release that covers AI cloning explicitly; the training-data rule already in the xugc skill (own, paid with release, or licensed) applies to voices too.
4. **Federal landscape (US, the target market):**
   - FTC finalised its Government and Business Impersonation Rule on 2024-02-15, and proposed extending it to impersonating individuals, including AI voice cloning, with possible liability for those who provide tools knowing they will be used for it. The individual-impersonation extension was still a proposal on the page read. [official: https://www.ftc.gov/news-events/news/press-releases/2024/02/ftc-proposes-new-protections-combat-ai-impersonation-individuals]
   - The TAKE IT DOWN Act (signed 2025-05-19) criminalises non-consensual intimate deepfakes and requires platforms to remove them on request; never produce any intimate content of real people. [community: https://www.congress.gov/crs-product/LSB11314]
   - The NO FAKES Act (unauthorised digital replicas of voice or likeness) advanced out of Senate Judiciary and a revised version was introduced in May 2026; it was not law on the pages found. Build as if it will pass. [community: https://www.blackburn.senate.gov/2026/5/technology/blackburn-coons-salazar-dean-colleagues-introduce-revised-version-of-no-fakes-act ; https://salazar.house.gov/media/press-releases/rep-salazars-no-fakes-act-advances-out-senate-judiciary-committee-unanimous]
5. **Advertising law (this is the one that actually bites an ad business):**
   - FTC Endorsement Guides (16 CFR 255) and the Consumer Reviews and Testimonials Rule (16 CFR 465) bar fake or misleading reviews and testimonials; businesses may not write, procure or pay for fake reviews. [official: https://www.ftc.gov/business-guidance/advertising-marketing/endorsements-influencers-reviews]
   - Consequence for XUGC: an AI person must not claim "I've used this for three weeks and it changed my life". Scripts allowed: demonstration ("here is how it works"), features, price, and claims the store can substantiate. Disclosures that a person is a synthetic or paid actor go in the ad/landing copy as the platform requires.
   - Platform AI-content labelling rules (TikTok, Meta) were not researched here; check each platform's current policy before the first paid campaign and label AI-generated ads where required.
6. **Watermarks stay on.** Chatterbox's Perth watermark and the video vendors' own provenance marks are not stripped.
7. **Reference audio** supplied to Seedance/Kling comes only from our consented library, never from a downloaded video.
8. **Logging:** each finished clip records engine, voice source tag, release id (if any), seed and prompt, so a takedown request can be answered in minutes.

---

## 9. What to build, in order (audio only)

1. Run the section 5 chain on one existing clip; view the waveform and listen. Fix numbers, freeze them. (No GPU or spend needed.)
2. Add the judge checks 1-9 (pure ffmpeg, deterministic) first; add Whisper (10, 11), OCR (13), and the compliance check (14) next; lip-sync (12) last, calibrated on 30 clips.
3. Build the owned foley and room-tone library (about 60 files). Without it step 5.3/5.4 falls back to synthetic noise, which is acceptable for the floor but not for handling events.
4. First paid test per engine, cheapest settings: same 8 s script on Veo, Seedance 2.5 (480p) and Kling, same speaker description, then judge and listen. Record which checks each engine fails; update section 2.5 routing from those results rather than from this document.
5. Add a `consented voices` table (name, release id, scope, expiry) before any clone feature ships.

## Sources
- Veo 3.1 overview: https://ai.google.dev/gemini-api/docs/video
- Veo dialogue guide: https://prompt-architects.com/blog/101-veo-dialogue-prompts
- Veo audio prompts: https://prompt-architects.com/blog/150-prompting-audio-in-veo-3-1-sound-music-ambience
- Veo 3.1 overview/community: https://www.atlascloud.ai/blog/ai-updates/veo-3.1-prompt-guide , https://www.keyvalue.systems/blog/veo-models-at-a-glance/
- Seedance 2.5: https://www.byteplus.com/en/product/seedance , https://the-decoder.com/bytedances-seedance-2-5-generates-30-second-video-clips-with-built-in-audio/ , https://dev.to/masonreed1/seedance-25-in-practice-capabilities-api-workflow-and-cost-4pfm
- Seedance 2.0 audio guides (carried-over assumptions): https://www.cutout.pro/learn/blog-seedance-2-0-audio-guide/ , https://www.ambienceai.com/tutorials/seedance-prompting-guide
- Kling 3.0: https://kling.ai/feature/text-to-speech , https://morphic.com/resources/how-to/kling-3.0-guide
- LTX-2: https://github.com/Lightricks/LTX-2
- Foley/TTS: https://github.com/Tencent-Hunyuan/HunyuanVideo-Foley , https://github.com/hkchengrex/MMAudio , https://github.com/resemble-ai/chatterbox
- Loudness/ffmpeg: https://ffmpeg.org/ffmpeg-filters.html , https://ffmpeg-cookbook.com/en/articles/loudness-normalization/ , https://en.wikipedia.org/wiki/EBU_R_128
- Law: https://www.ftc.gov/news-events/news/press-releases/2024/02/ftc-proposes-new-protections-combat-ai-impersonation-individuals , https://www.ftc.gov/business-guidance/advertising-marketing/endorsements-influencers-reviews , https://www.congress.gov/crs-product/LSB11314 , https://margabagus.com/elevenlabs-voice-consent-policy/

# 04 — Sound: iPhone-UGC audio layer for the LoRA spec

Scope: what real phone-recorded ad audio sounds like, how to caption it, how LTX-2.x trains on it, and what makes generated audio sound fake. No GPU or spend implied. Mixing numbers below are engineering targets from standard loudness practice (TikTok/Instagram normalise to roughly -14 LUFS integrated; phone mic speech lands around -20 to -16 LUFS short-term raw). Treat them as the spec; verify by measuring the reference clips with ffmpeg `loudnorm`/`ebur128`.

## 1. Which open models can learn audio

| Model | Audio? | Notes |
|---|---|---|
| LTX-2 / 2.3 / 2.5 (Lightricks) | Yes, joint audio+video in one DiT, with audio VAE + vocoder | Only open-weights family where a LoRA learns picture-synced sound. Trainer: https://github.com/Lightricks/LTX-2 (packages/ltx-trainer). Paper: https://arxiv.org/pdf/2601.03233 |
| Wan 2.2 | No (video only) | Needs a separate V2A/TTS pass. |
| HunyuanVideo-Foley, MMAudio | Video-to-audio only | Post-hoc sound for silent video; a fallback, not a joint learner. |

Decision: the sound-bearing LoRA is trained on LTX-2.x. Wan stays silent and gets audio bolted on.

## 2. What the LTX trainer expects (verified from docs)

Source: https://github.com/Lightricks/LTX-2/blob/main/packages/ltx-trainer/docs/dataset-preparation.md and the fal wrapper https://fal.ai/models/fal-ai/ltx23-trainer-v2/t2v

- Audio latents are extracted automatically from the video file's audio track at preprocessing. `--skip-audio` disables it.
- Standalone audio goes in an `audio` column (.wav); `reference_audio` (IC-LoRA) and `audio_mask` (inpainting) are also recognised. Audio-only sets use `--audio-durations "2.0;4.0;8.0"`.
- Captions must describe visual AND audio (speech, music, ambient). The trainer prepends `--lora-trigger` automatically.
- All-or-nothing: on the fal trainer, if any clip is silent the whole run trains video-only. Every clip needs a real audio track. A silent clip, or a clip with a stripped track, kills audio learning for the run. Do not mix silent clips in; use a separate video-only run if needed.
- Inspect results with `scripts/decode_latents.py --with-audio`.
- Dataset on fal: one zip of mp4 plus same-basename .txt.
- Audio-bearing captions should use the section format the LTX captioner emits:
```
[VISUAL]: <trigger>. ...
[SPEECH]: "exact words" or None
[SOUNDS]: ...
[TEXT]: on-screen text or None
```
- Inference prompts (https://ltx.io/blog/ltx-2-3-prompt-guide, https://runware.ai/docs/models/lightricks-ltx-2-5-pro/guides/prompting): one flowing present-tense paragraph; dialogue in quotation marks; give volume cues (whisper, mutter, shout); name source, acoustic character, spatial quality and relative mix. Train captions in the same vocabulary so train and inference match.

## 3. Captioning rules for audio

1. Every clip gets a `[SOUNDS]` line, always the same slot order: room -> voice -> body -> product -> environment -> music -> artifacts.
2. `[SPEECH]` is verbatim transcript in quotes (run Whisper, hand-fix). Never paraphrase. Language and accent tagged once: `American English, female, casual`.
3. Describe the recording, not the ideal: "recorded on a phone" phrases ARE the style handle. Keep the same stock phrases across clips so they bind (see taxonomy).
4. Describe presence AND absence on controlled clips ("no music", "no wind") so the model learns that silence of a layer is selectable.
5. Levels in words, not dB: "faint", "low in the mix", "close and loud", "barely audible".
6. Trigger token goes in `[VISUAL]` only; do not put it in audio lines.
7. Caption drop: 10-15% of clips with `[SOUNDS]` blank so the audio is learnable without text; never drop `[SPEECH]` text on speaking clips.

## 4. Sound-layer taxonomy (caption phrases)

Format: layer — what it is in a real iPhone clip — caption phrase.

### A. Room and space
1. Quiet-room tone — low broadband hiss of HVAC/fridge, -55 to -48 dBFS — "quiet bedroom room tone, faint air hum"
2. Hard-surface reverb — bathroom/kitchen tile, short 0.3-0.6 s tail on voice — "slightly echoey bathroom, hard tile reverb"
3. Small furnished room — dead, close, slightly boxy — "dry carpeted living room, close and boxy"
4. Car interior — low rumble, speech boomy and compressed — "voice recorded inside a parked car, low cabin rumble"
5. Large open room/garage — long flutter echo — "empty garage, noticeable echo"
6. Fridge/HVAC cycle — hum that kicks on mid-clip — "refrigerator hum starts in the background"
7. Electrical buzz — mains 50/60 Hz from lights/chargers — "faint electrical buzz"

### B. Environment and street
8. Distant street — blurred traffic wash, no discrete cars — "distant street traffic through a closed window"
9. Passing car/siren — one-shot Doppler event — "a car passes outside, brief road noise"
10. Outdoor wind on mic — low-frequency buffeting bursts, voice dips — "wind buffeting the phone microphone, gusts"
11. Outdoor ambience — birds, leaves, distant kids — "birds and light outdoor ambience"
12. Café/shop babble — unintelligible murmur, dish clinks — "indistinct cafe chatter behind her"
13. Gym/store PA — muffled music and announcements — "faint store speakers playing music far away"
14. Neighbor/TV through wall — dull murmur — "muffled TV in another room"
15. Dog/pet/household — bark, meow, door — "a dog barks once somewhere in the house"

### C. Handling and device
16. Handling rumble — thumb/palm shifting, low thuds — "soft handling noise as the phone is adjusted"
17. Phone set-down/prop thump — "phone is set on the counter with a small thud"
18. Fabric rustle — sleeve/hoodie brushing mic, scratchy — "clothing rustle near the microphone"
19. Tap/screen-tap — fingernail on glass at start/end of recording — "a tap on the screen as recording starts"
20. Mic wind-cover/wipe — hand passes over bottom mic, rush — "hand briefly covers the microphone"
21. Auto-gain pumping — noise floor rises in pauses, drops when she speaks — "background noise swells in pauses, automatic gain pumping"
22. Recording start/stop clip edge — abrupt cut of room tone at start/end, no fade — "audio starts abruptly mid-room-tone"

### D. Voice
23. Close-proximity voice — 15-30 cm, strong low end (proximity effect), intimate — "voice close to the phone, warm and slightly bassy"
24. Arm's-length selfie voice — 50-70 cm, thinner, more room — "voice at arm's length, thinner with room sound"
25. Phone compression — AAC/voice-processing, narrow, slightly dull above 8 kHz, light pumping — "compressed phone-microphone voice, slightly dull"
26. Plosives/pops — b/p hits on mic — "occasional plosive pop on p sounds"
27. Sibilance harshness — "a little harsh on s sounds"
28. Breath before speaking — "an audible inhale before she speaks"
29. Mid-sentence breath/laugh-breath — "short breath mid-sentence, a small laugh"
30. Mouth sounds — lip smack, saliva click, tongue — "soft lip smack and mouth clicks"
31. Disfluency — "um", restart, trailing off — "um, like—" captured verbatim in `[SPEECH]`
32. Voice level variation — leaning in/out, volume drift as she moves — "voice level changes as she moves the phone"
33. Whisper/ASMR close mic — "whispering close to the microphone"
34. Excited/shout clipping — peaks distort slightly — "voice peaks and slightly distorts when she gets loud"

### E. Product sounds
35. Click/snap/latch — "product lid clicks shut"
36. Tap on surface — nail tapping plastic/glass — "fingernail taps the product, hollow plastic sound"
37. Pour/spray/squirt — liquid or mist — "lotion squirts out, wet sound"
38. Packaging — box open, paper, plastic crinkle, velcro — "crinkling plastic packaging"
39. Motor/vibration/fan — device running, constant tone — "small motor whirring, steady"
40. Button beep — device UI tone — "short electronic beep"
41. Zipper/fabric/skin — "zipper pulled", "hand rubbed on skin"
42. Water/ice/fizz — "bottle fizz, ice clinks"

### F. Music and overlays
43. No music (raw clip) — "no music, only natural sound"
44. Trending-sound bed — low-fi track under voice, ducked — "quiet pop track under the voice, ducked"
45. Hard-music ad — beat-forward bed with voiceover mixed above — "upbeat music loud, voiceover on top"
46. Voiceover over b-roll — studio-clean VO, no room — "clean voiceover, no room sound, recorded separately"
47. Text-to-speech/CapCut voice — flat, steady pacing — "synthetic text-to-speech voice" (caption only if intended; it is a distinct style class)
48. Sound effect overlay — whoosh, pop, ding added in edit — "added whoosh sound effect on the cut"
49. Caption-pop/notification sound — "small pop sound as the text appears"

### G. Artifacts
50. Clipping/distortion — "audio clips on the loud word"
51. Dropout/stutter — brief dead air at cut — "tiny gap in audio at the cut"
52. Bluetooth/AirPods mic — narrow, band-limited, noise-gated — "voice from earbuds microphone, narrow and tinny"
53. Video-edit hard cut — room tone jumps between shots — "room tone changes abruptly at the cut"

53 items; use at least 2-4 per clip.

## 5. Layering and mixing levels (targets)

Final loudness: -16 to -13 LUFS integrated for the finished ad (TikTok/Meta normalise near -14); true peak below -1 dBTP. Raw un-edited UGC: voice -20 to -16 LUFS short-term, peaks -6 to -3 dBFS.

| Layer | Level vs voice (dB) | Notes |
|---|---|---|
| Voice | 0 reference | -18 to -14 LUFS |
| Room tone | -35 to -28 | audible only in pauses |
| Distant street | -30 to -22 | continuous, no discrete events |
| Wind buffeting | -20 to -6 (bursts) | voice ducks 3-6 dB |
| Handling thumps | -12 to -4 (transient) | rare, 1-3 per clip |
| Product sound | -6 to +3 | closer to mic than voice often; the hero event |
| Music bed under talk | -22 to -16 | ducked 6-10 dB when voice active |
| Music-led ad | -8 to -4 | VO above |
| Overlay SFX | -10 to -3 | on cuts only |

Rules:
- Pumping: phone AGC raises noise floor 6-12 dB in pauses over ~0.3-0.8 s; reproduce in data, do not remove it.
- Voice proximity: 20 cm adds +4 to +8 dB below 200 Hz vs 60 cm; rolloff above ~9 kHz from AAC at 64-96 kbps mono voice mode. Dataset audio: keep AAC-encoded 44.1/48 kHz stereo-or-mono as source; do not upsample or "clean".
- Layer order of salience: voice > product event > handling > music > room > street.
- Ambient continuity inside one shot; allowed to change at hard cuts (item 53).

## 6. What makes generated audio sound synthetic

1. Too-clean silence — digital zero or perfectly flat noise between words. Real clips always have a living noise floor with AGC rise.
2. Constant-level room tone — no hum cycles, no distant events, no slow drift.
3. Voice with no room — studio-dry voice in a visibly bathroom/kitchen scene; reverb must match geometry.
4. Wrong proximity — arm's-length framing with intimate close-mic sound or the reverse.
5. No breaths/mouth sounds/disfluency — metronomic, over-articulated delivery; perfect sentences.
6. Uniform sibilance and no plosives.
7. Foley that is not synced to a visible contact — click arrives 80+ ms off the frame it happens on (check at 24/25 fps; target within +/-40 ms).
8. Repeating loops — identical bird/traffic loop every few seconds, a vocoder tell.
9. Music too polished — full-bandwidth mastered stock music under a "phone" voice.
10. Missing handling noise and wind where a handheld outdoor shot demands it.
11. Vocoder artifacts — metallic ring, warble on sustained vowels, high-frequency "fizz" above 12 kHz that phones never record; inspect spectrograms; phone audio should roll off.
12. Identical mix across all shots — real edits jump in level at cuts.
13. Overlong, unbroken speech without breath at a natural point (>6 s of speech without a breath).

Training-data counter-measures: keep real phone audio untouched; caption the imperfections; include 20% clips with weak or no speech (ambience + handling + product only) so the model does not hallucinate speech in every clip.

## 7. Dataset recommendations for the audio LoRA

- 100% of clips must have audio (all-or-nothing rule). Verify with `ffprobe -show_streams` that an audio stream exists and is not digital silence (`ffmpeg -af volumedetect`, reject mean_volume below -70 dB).
- Cover: >=25% outdoor/windy, >=25% indoor quiet, >=15% hard-surface rooms, >=20% with product contact sounds, >=15% with music beds.
- No normalisation that flattens dynamics; at most gain-match clips to -20 to -14 LUFS to stop level skew.
- Clip length 3-10 s; keep first 0.2 s of start-of-recording behaviour (item 22).
- Audio-only clips for ambience/product sounds can ride in the `audio` column for audio-duration buckets "2.0;4.0;8.0".

## Sources
- https://github.com/Lightricks/LTX-2 and the trainer docs https://github.com/Lightricks/LTX-2/blob/main/packages/ltx-trainer/docs/dataset-preparation.md
- https://fal.ai/models/fal-ai/ltx23-trainer-v2/t2v (audio all-or-nothing, zip + txt format)
- https://arxiv.org/pdf/2601.03233 (LTX-2 joint audio-visual model, captioning of both tracks)
- https://ltx.io/blog/ltx-2-3-prompt-guide, https://ltx.io/blog/a-guide-to-ltx-2-3-audio, https://runware.ai/docs/models/lightricks-ltx-2-5-pro/guides/prompting (prompting for audio)
- Mixing numbers (-14 LUFS platform normalisation, true-peak limits) are common platform loudness practice, not fetched from a single page here.

# micro-trust: SOUND, WORLD, PRODUCT-IN-PLACE

Tags: [S path] = in this repo. [W url] = web page read this session. [C] = composed, untested (keep only what survives the judge).
Clip = 8 s, golden times 0.00 / 1.17 / 3.06 / 4.94 / 6.11 / 8.00 (tools/xugc/presets.js `goldenTimes`) [S].
Reaper facts (never contradict): 8 ft 6 in, 4.2 lb, skull face, black hood, tattered robe with pale strips, metal lantern lit cold blue with small ghost-souls on the chain, batteries (never cord/solar), silent lantern, sectional steel stake (sandbag loops on hard ground) [S app/lib/emails/reaper-products.ts, HANDOFF.md, micro-trust/SKILL.md; skull/hood/strips from the brief].

## 0. How a phone mic really behaves (the physics behind every cue)
- Phones run automatic gain control: it lowers gain when loud noise arrives and raises it in quiet, so levels swell and dip; continuous gain changes are audible as pumping [W patents.google.com/patent/US8135148B2].
- Phones detect wind with a mic near the case opening plus sub-mics and suppress it, so wind arrives as bursts that dip the voice, not as a steady hiss [W same patent family, image-ppubs.uspto.gov/.../11043228].
- Repo numbers: AGC raises the floor 6-12 dB in pauses over 0.3-0.8 s; 20 cm voice adds +4 to +8 dB below 200 Hz vs 60 cm; AAC voice roll-off above ~9 kHz; wind -20 to -6 dB bursts and voice ducks 3-6 dB; handling thumps 1-3 per clip [S design/xugc/training/04-sound.md §5].
- Post chain for model audio: highpass 90, lowpass 11k, 3 kHz +3, light compression, floor -52 dBFS, -14 LUFS, -1.5 dBTP, two-pass loudnorm, 120 ms tail fade, never digital silence [S design/xugc/real-life/03-audio-voice.md §5; untested there].
- Salience order: voice > product event > handling > music > room > street [S 04-sound.md §5].

## 1. The 40 SOUND micro-cues (paste as timed events; times assume the 8 s clip)
### Bed (continuous, 0.00-8.00)
1. [S real-sound] "Sound is audible from the first frame to the last, no quiet gap, no fade."
2. [S sound-layers] "Wind buffets the phone microphone in short gusts; the nearest voice dips 3-6 dB each gust."
3. [S] "Distant traffic as a blurred wash, no single car you can count." (street layer -30 to -22 dB vs voice)
4. [C] "One car passes behind the houses at 2.0 s, tyres on dry road, brief rise then gone."
5. [S] "Dry leaves skitter on asphalt and rustle underfoot."
6. [S] "A dog barks once far away at 0.3 s; a second dog answers lower at 5.2 s."
7. [C] "Faint crickets and a distant garage-door motor, low, uneven; nothing loops."
8. [S 04-sound C21] "Background noise swells in the pauses between voices and drops when someone speaks (automatic gain pumping)."
9. [C] "Far kids shouting once at 6.6 s, two houses down, muffled by distance."
10. [S] "The room tone is never constant: slow drift, small events, no repeating loop." (loop = vocoder tell, 04-sound §6.8)
### Close (the filmer)
11. [S] "The filmer's breathing is the loudest close sound, quick and slightly out of breath."
12. [S] "Footsteps on damp leaves and pavement, uneven stride, one heavier step at 1.4 s."
13. [S] "Fabric rubs the phone body: sleeve swish at 1.0 s and 3.3 s."
14. [S 04-sound C16] "Soft handling thumps as the grip shifts, one at 3.06 s."
15. [S C19] "A fingernail tap on the glass as the recording is already running." (0.00-0.2)
16. [S C22] "Audio starts abruptly mid-room-tone: no fade-in, no pre-roll silence."
17. [C] "A short hand-over-mic rush at 5.8 s when the filmer lifts the phone."
18. [C] "One plosive pop on a 'b' from the nearest voice."
### Voices
19. [S] "Overlapping voices at different distances: one low and close, others louder and further."
20. [S 04-sound C23] "Nearest voice 15-30 cm: warm, slightly bassy, quiet; far voice thinner with more air."
21. [S C28-29] "An audible inhale before the first line; a small breath-laugh inside a sentence."
22. [S C31] "Restart and trail-off, e.g. 'wait- wait, what-'."
23. [S crowd-realism] "A man's voice, a woman's voice, a young voice, never two alike."
24. [S sound-layers] "An adult swears under his breath ('oh shit'); a child shouts excitedly."
25. [C] "One person talks to the person next to them, not to the phone, half off-mic."
26. [S C34] "When someone gets loud, the voice peaks and slightly distorts; AGC drops the bed for a moment."
27. [S library §2] Lines: "Bro, look at that." / "No way." / "Is that real?" / "Hold on, I'm filming." / "That is not- okay that is huge."
28. [C] "A leash clink and a dog's nails on concrete as it sits."
### Product
29. [S library] "The lantern makes no sound: no cord hum, no fan, no blower." Silence of the product is itself a cue; do NOT add a motor.
30. [C] "Robe strips flick softly in the gusts: a dry cloth flutter, quiet, 6-10 dB under the voices."
31. [C] "A faint creak of the stake or hood fabric at 4.7 s as a gust leans the figure."
32. [C] "A tiny metallic chain tick of the lantern at 5.1 s."
### Peak
33. [S real-sound] "One single deep low-frequency hit at 4.94 s." Never a second one.
34. [C] "The hit clips the phone mic: a short flat, slightly crunchy distortion for ~150 ms, then the AGC pulls everything 4 dB down and it recovers over ~0.6 s."
35. [S sound-layers] "Reactions arrive half a second after the hit (5.4 s): gasp, laugh, swear, overlapping."
36. [C] "A phone shutter click or two at 5.6 s and 6.3 s, from different phones."
### Ending
37. [S] "The ending is loud and ongoing: voices, wind, traffic still running; no fade."
38. [C] "Cut mid-gust at 8.00; the last voice is mid-word."
39. [S judge #9] "No digital silence at the tail; the room floor continues to the final sample."
40. [C] "Wind gust peaks at 7.4 s and is still decaying when the clip ends."

### Second-by-second map, Black Reaper 'neighbours film it at dusk' (8 s)
| t | sound events |
|---|---|
| 0.00 | Abrupt start mid room tone [16]; filmer's quick breath [11]; fingernail tap [15]; wind gust on mic [2]; far dog [6]; traffic wash [3]; sleeve swish [13] |
| 0.5 | First footstep on leaves [12]; AGC floor rising in the gap [8] |
| 1.17 | Focus hunts: handling thump [14]; a car passes behind, tyres rise [4]; first far voice, indistinct murmur [19] |
| 2.0 | Car decays; leaves skitter [5]; heavier step at 1.4 [12] |
| 3.06 | Thumb brush on the case [14][13]; man (puffer) stops: leash clink [28]; close low voice "Bro, look at that." [20][27]; far woman louder, thinner |
| 3.8 | Inhale before the next line [21]; wind dips the voice [2] |
| 4.7 | Hood/stake creak as a gust leans him [31] |
| 4.94 | DEEP LOW HIT [33]; mic clips 150 ms then AGC ducks bed 4 dB [34]; lantern chain tick follows [32] |
| 5.4 | Reactions overlap: gasp, "No way.", nervous laugh, child shouts, "oh shit" [35][24]; AGC pumps, floor swells [8] |
| 5.6-6.3 | Two shutter clicks, different phones [36]; hand-over-mic rush as phone lifts [17] |
| 6.11 | Voices settle to murmur; "Is that real?" half-whispered [27]; robe strips flutter [30] |
| 6.6 | Far kids [9]; second dog [6] |
| 7.4 | Biggest wind gust, voices ducked [40][2] |
| 8.00 | Cut mid-gust, mid-word, floor continuing [37-40] |
Mix targets vs nearest voice: room -35 to -28, street -30 to -22, wind bursts -20 to -6, thumps -12 to -4, product -6 to +3 [S 04-sound §5]. The low hit is the loudest event in the clip.

## 2. The 40 WORLD micro-cues
### Objects (mildly inconvenient positions) [C unless tagged]
1. Trash and recycling bins at the kerb, one lid slightly ajar, not aligned. [S library §5]
2. Garage door closed, one panel scuffed, a basketball hoop or bike rack beside it. [S 03-environments S3]
3. Parked car with dew on the roof, wheels turned a little, reflecting the lantern in its window. [S library; 03-env rule 5]
4. A kid's bike on its side on the lawn edge. [S library]
5. Mailbox leaning slightly, its flag half up.
6. Garden hose coiled badly beside the wall, one loop across the path.
7. Cracked sidewalk slab, lifted edge. [S library]
8. Uneven lawn with a bare brown patch and a few wet leaves on it. [S library]
9. Dry leaf litter against the kerb and under the car wheel.
10. A pumpkin on the neighbour's step, not carved, off-centre.
### Light (see recipe below)
11. Mismatched porch lamps: one warm 2700 K, one dim bulb with a visible bug, one dark. [S 03-env S2; W color temps]
12. Blue sky 7000 K+ on the sky-facing side of every face and surface. [W photopills/dpreview thread]
13. Cold lantern glow spills on the grass in a tight pool and on the nearest faces. [C]
14. Lit windows in the houses, curtains different colours, one with a TV flicker. [S 03-env S4]
15. Streetlamp down the road just turned on, still orange-pink. [S 03-env S2]
16. Highlights bloom around bare bulbs, shadows crushed and noisy. [S phone-flaws]
17. Faces: warm on one cheek, blue on the other; none evenly lit. [S 03-env rule 1]
18. Car windows and house glass reflect the lantern and a lamp. [S 03-env rule 5]
### Weather / air
19. Wind consistent in one direction: leaves, robe strips, a flag and tree branches all lean the same way. [C]
20. Dry dusk, no fog or volumetric rays (never-do bans god rays). [S never-do]
21. Cool October air: someone in a hoodie with hands in the pouch, someone in a puffer half-zipped. [S library]
22. Cloud bands a little darker than the sky, no dramatic sunset. [C]
### Behaviour of people around an unusual large object
23. They stop mid-stride, then take one step back before stepping closer. [S crowd-realism: step back, stare] 
24. One peers over another's shoulder; one stands behind a person partly hidden. [S crowd-realism]
25. Three phones, three ways: vertical, horizontal, two hands/arm's length. [S people]
26. Not everyone films: one holds a drink, one holds a child's hand. [C]
27. Someone points up, then lowers the arm when noticing the filmer. [C]
28. A person walks through the shot without looking. [S crowd-realism]
29. A person is half in frame at the edge, cut by the border. [S crowd-realism]
30. Reactions at different speeds: delayed gasp, nervous laugh, swear. [S crowd-realism]
31. Nobody looks at the lens; two people look at each other, not at the figure. [S never-do, bible]
32. Two kids in costumes (plastic mask pushed up, cape too long) hang back, then one steps up. [C; crowd list in S]
### Dogs, cars, decorations
33. A leashed dog sits, sniffs the grass, looks away; leash goes tight then slack. [S library; presets Veo example in 05-directors-bible]
34. A second dog far off pulls toward a gate. [C]
35. A car rolls slowly past with headlights on, driver turns the head. [S 03-env S4]
36. A parked car door opens in the background, a neighbour steps out. [C]
37. Neighbour's decorations are modest and mismatched: a few string lights on a bush, a paper ghost in a window, a half-hung cobweb. [S library "half-hung decoration"]
38. A deflated or crooked yard sign; a wreath slightly off. [C]
39. A neighbour's inflatable, if any, is small and sagging, never competing with the Reaper. [C]
40. Text in scene is mundane and illegible: house numbers blurred, no readable signs. [S 03-env rule 9]

### Dusk light recipe [C, grounded in W colour temps]
- Sources, 4, in disagreement: (a) sky 7000 K+ blue at the top and behind; (b) warm porch lamps ~2700 K at left, one stronger; (c) cold lantern glow, bluer than the sky, local and small; (d) one distant streetlamp, orange.
- Sky and lamp luminance about equal: that is why blue hour works [W canon academy, photopills]. Do not make the sky black or the lamps blown.
- Phone white balance sits in the middle (~4000-5000 K): warm things read orange, shadows read blue, lantern reads teal-blue. Never correct all to neutral. [W dpreview thread; photographers use 3400-5000 K to push blues]
- Faces: warm key from the porch side, blue fill from the sky side, lantern rim on the near edge only when close to the figure.
- Exposure: phone brightens shadows (noise visible) and lets lamp highlights bloom; lantern may clip slightly at 4.94 s then settle as exposure pumps.
- Banned: even light, teal-orange grade, god rays, bokeh [S never-do].

### Stability across six frames (must NEVER change)
Same: house colour and window count; garage door; bin positions; parked car colour, side and position; sky colour and cloud shape; lamp positions (left warm, right sky); lantern colour (cold blue) and ghost-souls on the chain; robe strip count and lean direction; stake/ground contact; each person's clothes, hair and phone orientation; wind direction; leaf pattern; dog colour and sit/stand state. [S realism-rules: setting stays put; one subject same size, shape, colour]
May change: people's arms and gaze, one person walking in/out, focus, exposure, lantern flare intensity, the passing car's position.
Write a one-sentence continuity block pasted verbatim in every frame [S 05-directors-bible §Continuity Block].

## 3. PRODUCT-IN-PLACE cues by class
Universal: ground contact visible; a person or fixed object beside it for scale; wind response matching the world's wind; light spill on nearby surfaces; one partial occlusion; off-centre; never hero-lit; all identity features still visible. [S micro-trust/SKILL.md, library §6]
### A. Yard prop on a stake (the Reaper)
- Ground: stake base barely visible, grass bent around it, a few leaves caught at the base. Hard ground: sandbag loops at the base. [S reaper-products.ts]
- Scale: 8 ft 6 in is taller than the front door, head near the porch eave, an adult's head at his belt line; mailbox, car roof and garage door in the same frame. [S reaper-products.ts "taller than your front door"]
- Wind: robe pale strips lift unevenly and slowly, hood fabric lags a beat, figure leans on the stake a few degrees, 4.2 lb so it sways easily. Never rigid, never an inflated cone (that is the Scream; the Reaper has a stake and a lantern). [S HANDOFF product table]
- Light: lantern lit cold blue with small ghost-souls moving on the chain; it pools on the grass and the nearest faces; it flickers a little; robe stays dark with pale strips catching the porch lamp. No cord, no blower, no plug. [S HANDOFF]
- Occlusion: a person's silhouette crosses the figure's lower robe at 3.06; a branch or the car edge cuts a corner. Skull face, lantern and ghost-souls are fully visible at 4.94 and 6.11-8.00.
- Not hero-lit: no rim light, no spotlight from nowhere; the only light on him is dusk + porch + his own lantern.
### B. Inflatable (Scream / movie theater: separate product facts) [S inflatable-physics]
- Ropes taut to stakes, hose to the roaring blower, fabric wrinkles and seams, sways on ropes, light from inside red for the Scream; blower noise is the product sound. Never a person in a robe.
### C. Handheld product
- Weight in the hands, clumsy grip, label or tag edge showing, a thumb partly over a corner; product sharp, background soft; its own sound (click, zip, hum) close and louder than the voice. [S micro-trust SKILL, 04-sound E]
### D. Wearable
- Fabric folds and creases where the body bends, tag or seam showing, a hair strand across it, light from the real source only, hands adjusting it; sound is cloth, zip, buckle. [C]

## 4. AI sound/world tells to ban, with replacement sentences
| tell | replacement sentence |
|---|---|
| Studio-clean voice outdoors [W]| "Recorded on a phone mic in wind: voices thin, gusts dip them." |
| Street with no wind or traffic [W] | "Wind on the mic, traffic wash, a far dog, leaves; never silent." |
| Voice with no room [S 04 §6.3] | "Voices carry open-air, no reverb, slight air hiss." |
| Constant-level tone, loops [S 04 §6.1-6.8] | "Floor swells in pauses; every event different; nothing repeats." |
| Foley off by 80+ ms [S 04 §6.7] | "Leash clink lands on the frame the leash tightens." |
| Everyone reacts at once [S crowd-realism] | "Gasp at 5.4, laugh at 5.9, swear at 6.2, one person silent." |
| Empty tidy street [W budgetpixel/picassoia] | "Bins, a car with dew, a bike on its side, leaves." |
| Centred, symmetric [W] | "Subject off-centre, top almost cut, horizon off a few degrees." |
| Even light [S 03-env] | "Warm lamp left, blue sky right, cold lantern pool." |
| Backgrounds change, objects appear [W/S realism-rules] | "Setting stays put: same house, car, bins, sky." |
| Floating props | "Stake in the grass, grass bent, leaves at the base." |
| Music bed / mastered stock [S 04 §6.9] | "No music; only the street." |
| Bokeh, teal-orange, god rays [S never-do] | "Phone depth, everything legible, noisy shadows." |
| Narration / voiceover / subtitles [S real-sound, 03-audio] | "No voiceover; no subtitles or on-screen text." |
| Product hums or blows | "The lantern is silent." |

## 5. How engines treat audio instructions (repo/web evidence only)
- Seedance 2.5 on fal: body `generate_audio: true`; Kling 3.0 Pro on fal: `generate_audio: true`; Veo 3.1 (fal first-last-frame): `generate_audio: true`; Wan 3.0: `audio: true` [S tools/xugc/fal.js lines 22-32]. So audio is always on in this app, and the sound text must live inside `prompt`.
- Names `enable_audio` and `audio_prompt` appear nowhere in tools/xugc (grep returned only the four above) and the fal Kling guide I read does not document them [W blog.fal.ai/kling-3-0-prompting-guide]: do not use them unverified. Rule 15: open the endpoint's schema before adding any new field.
- Veo 3.1: native audio always on; dialogue in quotes with attribution; ambience as labelled sentences; says it matches the room; keep dialogue in the first third of the prompt; add "No subtitles, no on-screen text" [S 03-audio-voice §2.1, §4.1; W cloud.google.com Veo 3.1 guide in results].
- Seedance: `Character speaks in English: "line"`, 2-3 timestamped SFX layers (`SFX: ... at 3s`), state the mix [S 03-audio-voice §2.2, community].
- Kling 3.0: name each speaker `[Name]: "line"`; describe physical actions and surfaces (concrete, fabric, footsteps) rather than sound adjectives; tell who speaks and when [S 03-audio-voice §2.3; W kling3 native audio search result].
- LTX-2: sound written into the chronological paragraph; near-silence at 0-2 s and 10-15 s seen on the first clip, so always add the floor layer [S 03-audio-voice §2.4].
- All: engines invent audio when blank; the low hit at 4.94 is a prompt event, and the clipping, AGC pump and handling noise are cheaper to add in post [S 03-audio-voice §3].
- Seedance/Kling word budget: 1 sentence per 4 s, max 10 words [S 03-audio-voice §4]. Keep 3-6 sound events, not 40: pick per the map.

## 6. The DESIRE layer (visual)
Goal: "I want that in my yard", never sadness or hype [S micro-trust/SKILL.md formula].
- Framing: the figure is the tallest thing in frame, off-centre, with the porch and door beside it so scale is felt; people stand lower and look up.
- Glow: the cold blue lantern is the only saturated colour against the warm lamps; it lands on faces as a soft pool: faces lit = fascination.
- Reactions: wonder and curiosity (step back, stare, grab a friend's arm, phones up), not fear or screaming and not smiling at camera.
- Desire holds (6.11-8.00): skull face, lantern and ghost-souls in focus, correctly exposed, the street still alive around them.
- No hype: no slow motion, no zoom-in effect, no hero pose, no text [S never-do].
### 'Crisp product inside a soft phone world' recipe [C]
- Product: focus lands on the face and lantern at 4.94 and holds through 8.00; lantern exposure lands just under clip after the pump; ghost-souls readable as tiny cold dots; robe texture visible.
- World: softer, noisier shadows, slight oversaturation, wobble, bloom on lamps, 1-2 dust specks of noise.
- Never: smoothing of the whole frame; a mushy product; a sharpness boost that makes the robe plastic; a lit-from-nowhere product.

## 7. Inspection checklist (score each 0-3: 0 absent/wrong, 1 weak, 2 present, 3 convincing)
### Sound (/12)
- [ ] Audible from frame 0 to the last sample; no digital silence, abrupt tail [03-audio-voice judge 5,6,9]
- [ ] Wind bursts dip voices; floor swells in pauses (AGC pump)
- [ ] Voices at different distances; near voice quiet, far voice louder; overlaps; no ad language
- [ ] One low hit at 4.94 with brief mic clipping; reactions 0.5 s later; no second hit
### World (/12)
- [ ] Dusk light with 4 disagreeing sources; no even light
- [ ] 5+ mundane objects, asymmetric (bin, car, bike, leaves, garage)
- [ ] People behave as in section 2 (step back, peer, three phones, half-in-frame); nobody into the lens
- [ ] Stable over six frames (list in section 2); wind direction consistent
### Product (/12)
- [ ] Ground contact: stake, bent grass, leaves; scale vs door/car/person
- [ ] Wind response uneven; lantern cold blue with ghost-souls; silent; no cord, no blower
- [ ] Partial occlusion once; off-centre; not hero-lit
- [ ] Skull face, lantern, ghost-souls crisp at 4.94 and 6.11-8.00; world stays phone-soft
Pass: each block >= 8/12 and no line at 0 [matches library §7 pass rule; scale composed]. Any AI tell in section 4 fails its block. Repair the lowest block first by rewriting the missing cue as a timed event on a golden time.

## 8. Sources
Repo: tools/xugc/assets/style/*.md; design/xugc/real-life/03-audio-voice.md; 05-directors-bible.md; design/xugc/training/03-environments.md, 04-sound.md; tools/xugc/fal.js, presets.js; app/lib/emails/reaper-products.ts; HANDOFF.md.
Web (read via search results this session): patents.google.com/patent/US8135148B2 (AGC); image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/11043228 (wind detection); dpreview.com/forums/threads/white-balance-in-blue-hour.4682256 and photopills.com/articles/blue-hour-photography-guide (blue hour balance); budgetpixel.com/blog/why-ai-videos-feel-fakeand-how-consistency-changes-everything, blog.picassoia.com/4-reasons-your-ai-video-looks-fake, morphic.com/resources/how-to/how-to-make-ai-video-look-real (AI tells); blog.fal.ai/kling-3-0-prompting-guide (fetched).
Not verified on the web: behaviour of crowds around odd objects (composed from repo crowd-realism), dusk soundscape specifics, any engine param beyond fal.js.


---
CORRECTION (lead, verified from Kling MCP `who_am_i`, 2026-10-02): through the **Kling MCP**, `enable_audio` (true/false) IS a documented argument on kling-video-v3_0, v3_0_omni and v2_5/v2_6 (v2_6 only at 1080p, not with a tail image); `audio_prompt`, `music_prompt` and `enable_asmr` exist ONLY on kling-video-v2_5. Through **fal**, the fields are `generate_audio` (Seedance, Kling, Veo) and `audio` (Wan) as fal.js sends them. Use the field names of the route you call. [design/xugc/real-life/09-kling-mcp.md]

# speech-and-tone — WORDS and TONE channels of micro-trust (US English, Black Reaper, suburban dusk)

Tags: [S path] = in this repo · [W url] = page actually fetched/read this session (search-result summaries marked "summary") · [C] = composed, untested until a render passes the judge. Nothing below is invented as fact: every line in the bank is [C] unless marked.
Adults only in every ad: man 50s, woman 30s, guy 20s, woman 50s, man 30s. No teen voices, no child voices, no kid faces [S design/xugc/real-life/05-directors-bible.md "Forbidden: kids' faces"].
Speaker codes: **M50** man 50s · **W30** woman 30s · **G20** guy 20s · **W50** woman 50s · **M30** man 30s · **F** filmer (the voice nearest the mic, may be off-screen).
Loudness/distance codes: **N** near mic, low, breathy · **M** mid, 3-6 m, normal · **D** distant, 8 m+, louder but thinner.

## 0. Why these rules (evidence in one paragraph)
Fillers can be "upwards of 20% of 'words' in conversation"; disfluencies (filled pauses, false starts, repetitions, self-repairs) carry alertness/emotion rather than being errors [W https://en.wikipedia.org/wiki/Speech_disfluency]. Listeners flag synthetic speech by repeated prosody (every sentence starts on the same pitch, same curve, metronomic drops at punctuation), uniform pacing and missing breaths; clips with controlled disfluencies and breaths were frequently labelled human [W search summary, results incl. https://arxiv.org/pdf/2602.20061 and https://dev.to/julianbrown/why-ai-voices-sound-incredible-for-30-seconds-and-unbearable-after-three-minutes-1mfi; pages themselves not opened]. Repo: lines are short (2-5 words typical, <=14 max), overlap, restart, trail off, never ad cadence [S .claude/skills/micro-trust/SKILL.md "Words"]; no scripted perfect delivery [S tools/xugc/assets/style/never-do.md]. Conclusion for prompts: write less, break it, aim it at a neighbour not the lens, vary every voice.

## 1. The 12 laws of real speech for prompts (before -> after)
1. **Short.** 2-5 words typical; hard cap 14; one line per speaker per 4 s [S library.md §2; S 03-audio-voice.md §4].
 Before: "Wow, look at how huge and glowing that skeleton is, it's amazing!" After: "Bro. Look at that."
2. **Fragments, not sentences.** Subject and verb go missing. Before: "That is a very large decoration." After: "That is— that's huge."
3. **Restart / self-repair.** One false start max per line (a dash, not stage directions). Before: "Whose house is that from?" After: "Wait, who— whose is that?"
4. **Trail off.** Last word dies or is swallowed by a reaction. Before: "I cannot believe it is real." After: "I can't even— huh."
5. **Overlap.** Second speaker starts before first finishes, at a different distance; write the overlap as an event, not as two clean turns. Before: M50 "Look." W30 "Wow." After: M50 "Look at—" W30 (D, over him) "Oh my God, is that—" [S real-sound.md "People speak over each other"].
6. **Guess a number, not a spec.** "Like eight feet?" never "8 ft 6 in". The product's true height lives in the visual prompt, never the mouth [C].
7. **Say what they SEE, not what it IS.** "It's moving." not "It's an animated glowing skull lantern." [S library.md §2]
8. **No brand name, ever** (neighbours do not know it). Nobody says "Black Reaper". Closest real thing: "that skeleton thing", "the reaper guy" [C].
9. **No CTA, no price, no benefit, no feature list, no "link in bio"** inside a neighbour clip. Any CTA is burned afterwards as lowercase caption text, never spoken [S bible 12.x "captions in post"; C].
10. **Talk to the person next to you, never to the audience.** "Honey, come look." not "Guys, you have to see this." Address words must be a real relationship: honey, dude, man, babe, Dave [C].
11. **Different phrasing per person; same emotion never at the same time.** Three people, three different reactions and three different second-beats (laugh / swear / silence). Before: all say "wow". After: M50 "huh." W30 "no way." G20 "bro." [S people.md "each person reacts in their own way"].
12. **React before the thought is finished, and let a non-word carry weight.** Gasp, "oh", "hh", a half laugh, "mm" are lines. Before: "Oh, I see, it is a Halloween decoration." After: "Oh— oh, that's a— okay."
Prompt hygiene for all: put quotes around the exact line; add one physical trigger (stops, leash tightens) before it; add one breath cue; name loudness ("close to the phone, quiet" / "further away, louder"); never write "says enthusiastically" (use a trigger instead) [C; S bible "verbs beat adjectives"].

## 2. LINE BANK (140 lines) — all [C] unless marked [S]. Format: "line" speaker·loudness
Use: pick 1 line per visible beat, never more than 3 speakers in 8 s. Mix codes so no two lines in one clip share a speaker, distance and mood.

**A. First sight of a big object (stopped mid-step; quiet to loud)**
1 "Bro, look at that." G20·M [S sound-layers/library] 2 "No way." G20·M [S sound-layers] 3 "Oh shit." M30·N [S real-sound] 4 "Whoa." M50·N 5 "Huh." M50·N 6 "Is that— okay that's huge." W30·M 7 "What the—" G20·M 8 "Oh my God." W30·N 9 "Wait. Wait, wait." W30·N 10 "That is not— no." W50·M 11 "Dude. Dude." G20·M [S library] 12 "Whoa, whoa." M50·M 13 "Okay, that's big." M30·N 14 "How long's that been there?" M50·M [S library variant] 15 "Hold on." W30·N 16 "Oh, that's sick." G20·D 17 "Look up. Look up." W50·M 18 "Is that new?" W30·M 19 "That's— huh." M50·N 20 "Oh, come on." M30·N

**B. Scale guesses (specific, wrong, never exact)**
21 "Like eight feet?" G20·M [S library] 22 "That's taller than the garage." M50·M 23 "It's gotta be nine feet." M30·M 24 "That's higher than the porch light." W30·N 25 "That's like two of me." G20·D 26 "How is that even standing?" M50·M 27 "It's over the roof, almost." W50·M 28 "Nine, ten feet. Easy." M30·M 29 "That's bigger than my car." G20·M 30 "Somebody's got a ladder for that." M50·N

**C. Neighbour reactions to each other (aimed at the person beside them)**
31 "Honey, come look at this." M50·M [S library] 32 "Babe. Babe, look." W30·N 33 "Are you seeing this?" W30·N 34 "Dave! Dave, come here." W50·D 35 "Tell me you see that." M30·N 36 "Whose house is that?" W30·M 37 "That's the Hendersons'? No." M50·M 38 "They did not have that yesterday." W50·M 39 "I walk by here every day." M30·N 40 "I didn't even see it till now." W30·N 41 "Is that real? Is that a real one?" W50·M 42 "Come here, you gotta see this." G20·D 43 "Look at the— look at the face." W30·N 44 "Hang on, I'm getting my phone." M50·M 45 "Take a picture. Take a picture." W50·M 46 "Are you filming this?" W30·N 47 "Yeah, I'm filming." F·N 48 "Did you see that? The light." G20·M 49 "Okay that's actually kind of great." M50·N 50 "Mine looks sad now." M30·N (laugh)

**D. Filmer asides (always closest, breathy, tied to the camera act)**
51 "Hold on, hold on, I'm filming." F·N [S library] 52 "Okay— okay, hang on." F·N 53 "Wait, let me get closer." F·N 54 "It's getting dark, hang on." F·N 55 "Can you see it?" F·N 56 "Look at that. Look at that." F·N 57 "I'm not even kidding." F·N 58 "Move, move, I can't see." F·N 59 "Ah, the focus— there." F·N 60 "Okay, okay, okay." F·N 61 "Is it recording?" F·N 62 "Ha— no." F·N 63 "I'm literally shaking." F·N 64 "Walk with me." F·N 65 "Over there, by the garage." F·N

**E. Kids-adjacent, ADULT voices only (a parent or neighbour talks about, never as, a child; no child audio)**
66 "Okay, he's gonna lose it." W30·N 67 "She's going to want to see this." M30·N 68 "Don't tell the kids it's out here." M50·N 69 "Our little one would freak." W30·M 70 "Can we walk the long way home?" M30·N 71 "That's going to be on the news at school." W50·M 72 "My nephew's gonna lose his mind." G20·M 73 "Okay, we're doing this next year." W30·M 74 "Good luck sleeping tonight." M50·M (dry) 75 "We're taking the trick-or-treaters this way." W50·M 76 "I'm bringing them by here tomorrow." M30·N

**F. Delivery / unboxing at the doorstep (only if the product is carried, not the yard hero)**
77 "It's heavier than I thought." M30·N 78 "Okay, the box is huge." W30·N 79 "Hang on, I can't— okay." W30·N 80 "Oh, it's the big one." M50·N 81 "That came fast." W30·N 82 "Got something. Hang on." G20·N 83 "Whoa, there's a lot in here." M30·N 84 "Where do I even put this?" W30·N 85 "Is that the whole thing?" M50·N 86 "Okay, the stake's real long." G20·N 87 "That's not going to fit in the car." M50·N 88 "Help me with this end." W30·N 89 "Wait, it's got a— huh." G20·N 90 "I'm not opening that out here." W30·N (laugh)

**G. "Is that real?" / suspicion (the real-life question, never a claim)**
91 "Is that real?" W30·M [S library] 92 "Wait, is that a person?" M50·M 93 "That's not a person, right?" W30·N 94 "Is it a blow-up?" G20·M 95 "Somebody's inside that." M30·N 96 "It moved. It moved, right?" W30·N 97 "Is that a light or a— okay." M50·N 98 "Is that on a timer?" M30·N 99 "Is it plugged in?" W50·M 100 "There's no cord. Where's the cord?" M30·N 101 "That's got to be a trick." M50·M 102 "How's it doing that?" G20·M 103 "It's looking at us." W30·N (nervous laugh) 104 "Okay, who's doing that?" M50·M

**H. Mild swearing (bleep-free, PG-13 max; platform-safe, no slurs)**
105 "Oh shit." M30·N [S real-sound] 106 "Holy shit." G20·M 107 "What the hell." M50·N 108 "Damn." G20·M 109 "Oh, hell no." W30·M (laugh) 110 "Jesus." M50·N 111 "Shit, that's cool." G20·D 112 "Oh my— damn." W30·N 113 "No f— no way." G20·M 114 "Okay, that's some bullshit, that's good." M30·N (admiring; use sparingly, one swear per clip)

**I. Disbelief (quiet, drops in volume)**
115 "No. No way." M50·N 116 "I'm not— no." W30·N 117 "That's insane." M30·M [S library] 118 "That cannot be real." W50·M 119 "I'm sorry, what?" W30·N 120 "You're kidding me." M50·N 121 "Nope. Nope." G20·M (laugh) 122 "That's not allowed." M30·N (joking) 123 "Man, they went all out." M50·N 124 "...it's moving." (low murmur) W30·N [S library]

**J. Laughter / nervous laugh / awe (non-verbal and tiny words; time them to the visible trigger)**
125 (breath-laugh) "Ha— okay." W30·N 126 (short snort) "Hah." M50·N 127 (nervous high giggle) "Oh my God, stop." W30·M 128 (sharp inhale) "Ooh." W50·N 129 (low whistle) M50·M 130 (laugh while talking) "That's— hah— that's so good." G20·M 131 (exhale) "Wow." M50·N 132 (gasp then silence) W30·N 133 "Oh, that's beautiful." W50·N (awe, no sarcasm) 134 "Look at the— the glow." W30·N 135 "That's actually really cool." M30·N 136 "Okay, I want one." G20·M (desire beat; only after the peak, never to camera) 137 "Where would you even put that?" W30·N 138 "That'd look good by our fence." M50·N 139 "We need that." W30·N 140 "I'd put that right by the door." M30·N

Reaper-safe notes: the Reaper's lantern is silent [S library §4], so no line may mention a fan, motor or blower. Product word pool for mouths: skeleton, reaper, skull, ghost, thing, that, it.

## 3. TONE palette (sound + the VISIBLE trigger that must precede it)
Rule: no emotion without a trigger written into the same sentence of the prompt [S SKILL.md "Tone"; S bible "verbs beat adjectives"].
| tone | how it sounds | visible trigger (write this, not the adjective) | volume |
|---|---|---|---|
| Understated surprise | flat, low pitch, short vowel, small drop at the end ("huh.") | man mid-stride stops, leash tightens, dog sits [S library §8] | N, quiet |
| Disbelief | slower, pitch falls, breath out before the line ("no... way.") | he takes one step back, looks left and right for confirmation | N to M |
| Curiosity | rising lilt on the last word, quieter, forward-leaning ("is that... real?") | she steps closer, head tilts, phone lifts | N |
| Nervous laugh | laugh sits inside the line, high, breathy, cut short | blue flare, she half-turns, grabs a friend's arm [S SKILL "grabbing a friend's arm"] | M |
| Awe | very quiet, long exhale, no joke, sometimes silence | all faces lit blue, nobody moves for a beat | N |
| Hype (AVOID) | even pitch, bright, big smile, sentence-final lift ("This is AMAZING!") | none | loud, mic-clean (reads as ad) |
Prosody notes [C]: pitch should differ per speaker and per line; never two lines with the same melody; one voice breaks or drops; the far voice is louder and thinner, the near one is quiet; wind buffets the mic under any line. For AI-detectability, avoid evenly spaced sentences and perfect punctuation breaks [W search summary above].
**Surprise vs hype:** surprise is a short vocal drop plus a gap before the word (0.3 s breath), hype is sustained pitch rise with no gap. Always choose surprise [C].

### The DESIRE arc as spoken/behavioural beats (not sadness; Alex's formula [S SKILL.md "viewer-brain formula"])
Golden times from the repo: 0.00 hook, 1.17-3.06 impress/security, 4.94 peak, 6.11-8.00 desire hold.
| beat | time | spoken | behaviour |
|---|---|---|---|
| HOOK | 0.0-0.4 | none or F breath; word 1 by 0.3 s if used [S bible §3] | already moving, breath on mic |
| IMPRESS | 1.17-3.06 | "Bro, look at that." M50 stopping mid-stride [S library §8] | focus hunts, dog sits |
| MICRO-TRUST | all | overlap, guess "like eight feet?", a swear, F aside | thumb edge, wobble, three phones |
| SECURITY | 3.06-4.94 | ordinary tone: "Whose house is that?" "Honey, come look." | calm neighbours, nobody scared, nobody selling |
| PEAK | 4.94 | low hit; half-second later "No way." / gasp | blue flare on faces |
| DESIRE | 6.11-8.00 | "Okay, I want one." / "That'd look good by our fence." G20/M30·M, to a friend, never to lens | phone raised, step closer, crisp product, off-centre, ends mid-moment, sound continues |
Desire is carried by want-statements aimed at a neighbour and by behaviour (step closer, phone up, stares), never by sell words [C].

## 4. Writing speech inside prompts, per engine (+ word caps)
Global: one shot = one action + one line; keep dialogue in the first third; no "subtitles/captions" except in negation; add "no voiceover, no music" [S bible §12; S 03-audio §4,§6]. Resolution of a repo conflict: bible allows 8-18 words per 8 s [S bible rule 7] while micro-trust caps neighbour lines at 14 and typically 2-5; use 18 only for a single selfie sentence, otherwise <=14 total per speaker per 8 s [C].
- **Kling 3.0** [S bible §12.x; S 03-audio §2.3]: `[Speaker, tone]: "line"`, speaker label = a fixed visual name used the same way every time, action before dialogue, linking words ("Immediately", "Then", "Pause").
 `[Man in grey puffer, low, stunned, close to the phone]: "Huh... bro, look at that." [Woman in red coat, further away, louder, half-laughing]: "Oh my God, is that—"` Cap: 2 speakers, <=12 words each per shot, 6-8 words ideal. Best for two-person overlap.
- **Veo 3.1** [S 03-audio §2.1, §4.1]: prose, line in double quotes after an attribution and delivery clause: `A man in a grey puffer stops mid-stride, the leash tightens, and he says quietly, a little out of breath, "Huh. Bro, look at that."` Describe each speaker visually, no names, dialogue in first third, one substantial line or two brief per 8 s; no voice lock across clips so keep one speaker per engine per ad [S bible]. Always "No subtitles, no on-screen text." Cap: <=12 words per line, <=18 per clip.
- **Seedance 2.5** [S bible 12.x notation; 03-audio §2.2, labelled assumption from 2.0]: `{He says in English, low and stunned: Huh, bro, look at that.} <leash clink, wind on mic> no music.` Alternate 2.0 style: `Character speaks in English: "line"`. Cap 5-10 words, 60-100-word prompt overall; verify the accepted notation on the first 2.5 batch [S bible "[verify at integration]"].
- **LTX-2** [S 03-audio §2.4, §4.4]: put speech inside the chronological story, ~200 words, no special syntax; always post-sound floor; dataset format has [SPEECH] verbatim with fillers kept [S design/xugc/real-life/02-data-curation.md]. Cap: <=10 words.
- Overlap trick for engines with no multi-speaker syntax [C]: do not request overlap; generate speakers in separate shots (near voice, far voice) or add the far voice in post at lower level (consented/stock voices only [S 03-audio §8]).
- Write delivery as physics: "close to the phone, quiet" / "further away, louder, thinner" / "breath before the first word", not "excitedly".

## 5. Captions, hook text, ad-safe language
Captions and hook text are burned after generation, never drawn by the model [S never-do.md; S bible 12.x].
Style [C unless marked]: lowercase, 1-5 words per card, no punctuation except ? or ..., native TikTok/Reels look, stay out of the 150 px top / 270 px bottom UI zones [S bible §12.x], phrased like a friend texting. Examples: "wait for it" · "the neighbours stopped" · "ok who did this" · "is that real" · "8 feet?" · "not me needing one". Max 1 hook card in first 2 s, caption mirrors the on-screen question, never quotes the spoken line verbatim.
**Ad-safe list (use):** look, wait, huh, whoa, no way, is that real, that's huge, whose is that, I want one, that'd look great by the door, honestly, kinda, like (as hedge), okay.
**Banned phrases:** introducing, game-changer, limited time, link in bio, you guys, hey guys, welcome back, sold out / they sell out, get yours, shop now, buy now, best ever, life-changing, must-have, check it out, trust me, I'm obsessed, unbelievable price, "I've used this every day for a week" (see below), "step one / step two" (tutorial cadence) [S never-do.md "advertising language", S SKILL.md "AI/ad tells"; C].
Also banned for Alex's rule: any "sorry", "unfortunately", "we hope", hedge in text a customer sees [S AGENTS.md; S bible line ~193].
**Claims/tone constraints [W]:** FTC bars fake or misleading reviews/testimonials and requires substantiation; an actor posing as a typical user needs disclosure [W https://www.ftc.gov/business-guidance/advertising-marketing/endorsements-influencers-reviews]. TikTok requires an AIGC label or clear disclaimer on significantly AI-generated ad content, and prohibits absolute/miracle claims and fake before-and-after; Meta standards still bar fake testimonials and unbackable implied results [W search summary, e.g. https://browsermedia.agency/blog/ai-disclosure-in-ads-what-you-need-to-know/ ; policy pages themselves not opened, re-check before spending]. Consequences: AI neighbours may react to a product but must not testify to personal use or results; no medical claims; the Reaper is a decoration, so claims stay about what is seen (size, glow). Repo-wide: first-person usage claims fail judge check 14 [S 03-audio §7, §8.5].
**Defects found in current repo lines [S tools/xugc/presets.js lines 16-18, 60-62]:** "I have used it every day for a week" (first-person usage testimonial, violates §8.5), "Okay, I have to tell you about this" and "Step one/two/three" (ad cadence), bible hook "Link's in my bio" / "they sell out every October" (banned list). Replace with neighbour-reaction lines from §2 for Reaper clips.

## 6. Localise (note)
US suburb: bro, dude, man, no way, shit/damn, honey/babe, garage, yard, porch, trick-or-treat. UK/AU: mate, bloody, "proper", "no way" stays, "garden" not "yard". Spanish (Kling only [S 03-audio §2.3]): "no manches" (MX), "mira eso", "¿es de verdad?"; keep the same laws (short, overlap, no CTA) and re-test sync. Never translate word for word; translate the situation. Greek store copy is not needed for these US ads. [C]

## 7. Speech micro-trust inspection checklist and scoring (0-3)
Run on a Whisper-class verbatim transcript with timestamps plus a listen [S 03-audio §7 checks 10-11]. Score each row 0 absent/wrong, 1 weak, 2 present, 3 convincing.
| # | check | 0 | 3 |
|---|---|---|---|
| 1 | Length: lines 2-5 words typical, none over 14 | monologue / full sentences | all fragments |
| 2 | Disfluency: one restart, trail-off, breath or filler in the clip | none, perfect sentences | natural and varied |
| 3 | Overlap/distance: >=2 voices, different distances, one overlap | one clean voice | layered, near quiet / far loud |
| 4 | Specificity: guess or concrete thing seen, not a feature | spec or benefit sentence | "like eight feet?" |
| 5 | Addressee: aimed at a neighbour, not the lens | to-camera pitch | pure peer talk |
| 6 | Banned words/CTA/brand name: zero | any banned phrase | none, no price/brand |
| 7 | Prosody variety: different melodies/pitch per speaker | all same cadence/pitch | each voice distinct, one drop or crack |
| 8 | Tone/trigger: each emotion has a visible trigger just before it | emotion w/o cause | cause then 0.3 s gap then line |
| 9 | Rate: 1.8-3.2 words/s; word 1 by 0.3-1 s; no rushed read [S 03-audio §7 #11] | >3.6 w/s, or dead air start | natural pace, breaths |
| 10 | Compliance: no personal-use claim, no result claim, adults only, AI label plan | testimonial or child voice | clean |
Scoring: total /30. Pass >= 22 and no row at 0 (rows 6, 10 at 0 = hard fail, regenerate). 15-21: repair lowest rows by editing the line, not adding adjectives. <15: rewrite from §2. Rows 1-5 map to library.md §7 "Words" and 7-8 to "Tone" [S library.md]: Words channel score = round(avg rows 1-6 x 1), Tone = avg rows 7-9, rounded.
Repair order [C]: (1) cut words, (2) add one restart or breath, (3) move the line off the lens to a neighbour, (4) add the trigger sentence, (5) change the speaker's phrasing so no two voices match.

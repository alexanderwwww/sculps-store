---
name: leonida-daily
description: Leonida Daily — Alex's GTA 6 YouTube Shorts channel and the machine that makes it (clips, edit, voice, captions, upload). Use when he says the GTA channel, Shorts, YouTube machine, Leonida, or "the channel".
---
# Leonida Daily (decided 2026-11-10)

Idea from a reel Alex sent (faceless Shorts, 30-day plan, paid from YouTube views). Kids channel rejected (made-for-kids pays a fraction, AI kids content is targeted). GTA 6 chosen.

- **Name:** Leonida Daily (Leonida = the GTA 6 state). Short, searchable, ours.
- **Alex's method:** "take clips from here and there". Rule that keeps it paid: every Short is TRANSFORMED — short clip moments (a few seconds each), our voice-over, our captions, our angle (news, leak explained, theory, map detail). Never a re-upload of someone's video. YouTube demonetises reused/repetitive content and Rockstar claims raw trailer uploads.
- **Machine:** find topic (what is trending in GTA 6 today) → script (hook in 1 s, 20–40 s) → clips cut with ffmpeg → voice (cheap TTS) → burned captions → 9:16 MP4 → upload through YouTube Studio in Alex's browser via ultracursor (no API keys needed).
- Paid steps (voice credits) are stated with the price before running (AGENTS rule 27 spirit).

## Claude-only machine (Alex 2026-11-10: "only through Claude, just build a skill", no Mac app, he does nothing)
Runs from a cloud session on a schedule. Proven pieces (2026-11-10):
1. **Source = Twitch clips (works from the cloud; YouTube blocks cloud IPs with "confirm you're not a bot").** Top clips of the last day:
   `curl -s https://gql.twitch.tv/gql -H "Client-Id: kimne78kx3ncx6brgo4mv6wki5h1ko" -d '{"query":"{ game(name: \"Grand Theft Auto V\") { clips(first: 20, criteria: {period: LAST_DAY, sort: VIEWS_DESC}) { edges { node { slug title viewCount durationSeconds broadcaster { login } } } } } }"}'`
   Also "Grand Theft Auto VI" (small today, grows toward launch). Download: `yt-dlp -o x.mp4 https://clips.twitch.tv/<slug>`.
2. **Cut:** `python3 tools/clipper/clip.py x.mp4 out.mp4` (needs `pip install faster-whisper`). Picks the best 20–40 s, 9:16, blurred fill, word captions. Tested on an xQc GTA RP clip.
3. **Post:** needs ONE connection by Alex (unavoidable: Google asks the channel owner). Options: Metricool connector (has createScheduledPost + getBestTimeToPostByNetwork) or YouTube Studio via ultracursor in his Chrome.
4. **Schedule:** 3 Shorts a day at the times Metricool's best-time tool gives (default 12:00, 17:00, 21:00 US Eastern). Never the same clip twice (keep a list of used slugs). Credit the streamer in the title/description ("🎥 twitch.tv/<login>").
- "viewmax" from the reel is not in the connector registry; vidIQ (trending, outliers, keywords) is the closest and is optional.

## LIVE setup (2026-11-10)
- Channel: **ORAKTYS** (Alex's own name, keep it). YouTube id UCF6z0XOYoC8N8Sl0Q5O9Uzw. Metricool brand blogId **8014971**, timezone Europe/Athens.
- Daily run: `python3 tools/clipper/daily.py 3` (needs `pip install faster-whisper yt-dlp`, ffmpeg, wrangler creds) → prints [{url, streamer, name, title, said}]; videos at blackreaper.us/media/oraktys-*.mp4 (flat keys only, no slashes); used clips in oraktys-used.json.
- Post each with Metricool createScheduledPost: youtubeData {type "short", privacy "public", category "GAMING", madeForKids false}, title = punchy hook from what was said + " #gta #shorts" (<70 chars), text ends with "🎥 twitch.tv/<streamer>". Slots Athens 17:00, 21:00, 01:00 (= 10am / 2pm / 6pm New York). Never a time in the past.
- First posts: xQc Brick Boy (2026-11-10 21:30), Crystalst garage juke (2026-11-11 17:00).
- Alex 2026-11-10: GTA 6 clips first (8x weight) — streamer + GTA 6 footage on screen in the same clip keeps people watching. Never the bare trailer alone (copyright). GTA 6 launches Nov 19: launch week go to 6 a day.

## Daily run v2 (2026-11-10): two steps, red headline, 80% GTA 6
1. `python3 tools/clipper/daily.py pick 3` -> candidates with what is SAID (English + 25+ words only; junk dropped). 80% GTA 6 (Twitch + Kick "GTA VI" week, 30+ views), GTA 5 fills the rest. Before the Nov 19 launch there is almost no good GTA 6 clip, so most will be GTA 5 until then: that is expected.
2. For each: write an IGN-style headline from what is SAID (max ~6 words, the hook, e.g. "SHE ASKED HIM TO KILL JUN"), then `python3 tools/clipper/daily.py make <slug> "<headline>"` -> {url, credit}. Look at one frame before posting.
3. Schedule with Metricool; text ends with "🎥 <credit>" (twitch.tv/... or kick.com/...).

## Daily run v3 (2026-11-10, Alex: "ONLY GTA 6", "12 every day", "go for GTA 6 trailer reactions")
- 12 Shorts a day, every 2 h (Athens 03:00 → 01:00 next day = all US hours). Daily run 13:23 Athens schedules the NEXT day.
- Source order: Twitch "Grand Theft Auto VI" category clips (last week, last month, all time: every big trailer/reveal reaction lives there — Jynxzi, Kai Cenat, IShowSpeed, xQc, Asmongold, Charlie, DDG), then Kick GTA VI (100+ views), then watchlist streamers' clips whose SPEECH is about GTA. Never GTA 5.
- Watchlist (research 2026-11-10): Kai Cenat (announced a no-end GTA 6 launch marathon), IShowSpeed, Adin Ross (Kick), N3on (Kick), xQc. Launch Nov 19: their live clips first.
- Rules from research: no story spoilers (Rockstar takes those down), no AI-fake "leaks", reaction clips over raw trailer. Slurs are masked in captions.
- Money before YouTube pays: Whop "Content Rewards" clipping campaigns pay $1–5 per 1,000 views. Check contentrewards.com/discover around Nov 17–19 for GTA 6 / streamer campaigns and tell Alex.
- Alex 2026-11-11: more Kai Cenat (BOOST kaicenat x4 in daily.py). His reveal-crash Short was first to take off (190 views day 1).
- Alex 2026-11-11: 80% Kai, 20% others (quota in daily.py pick; Kai's own clips last day/week/month whose speech is about GTA count too). Pre-launch Kai supply is limited (test: 3 of 5).

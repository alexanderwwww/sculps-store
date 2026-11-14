---
name: cursor-clipper
description: Cursor Clipper — Alex's clipping-only Mac app that lets Claude work Whop Content Rewards and YouTube for ORAKTYS in its own Chrome. Use when he says Cursor Clipper, the clipper app, Whop, Content Rewards, or "go" on clipping. NO trading, ever.
---
# Cursor Clipper (2026-11-13)
Alex, after ultracursor and "Clipper" both opened GMGN: "Remake a whole new app from scratch. Call it Cursor Clipper. New logo, new everything. Only clipping." and "Don't put any fucking trading in this app."

- Code: tools/cursor-clipper, written new (src/app.mjs ~300 lines, src/run.command). Only shared with ultracursor: the link mailbox (same ultra_* MCP tools: ultra_status / ultra_act / ultra_result).
- Its own Chrome: profile ~/.cursor-clipper-chrome, port 9555, opens on https://contentrewards.com/. Work dir ~/Library/Application Support/Cursor Clipper, copied fresh from the bundle every launch.
- Sites: contentrewards.com, whop.com, youtube.com, youtu.be, accounts.google.com. Navigate anywhere else = refused. Any tab on another site is sent to Content Rewards at connect and whenever it appears.
- No trading, no research, NO self-update: a new build is only ever a new zip. Never add any of these.
- Final clicks (final != none) and Enter show an Approve/Deny card on the page; never types into password/secret fields; no uploads.
- Logo: design/cursor-clipper/icon-1024.png, purple gradient, a mouse cursor cut in two (yellow top, white bottom).
- pack.sh proves: 13-check runner test against real Chrome + stub link, then a REAL first launch of the unzipped app (npm install, own Chrome, heartbeat "Cursor Clipper" build N on contentrewards). Zip only if all pass.
- Build 1: https://blackreaper.us/media/cursor-clipper-1-593da21ec32ced52.zip
- Why the earlier apps opened GMGN (never repeat): ultracursor's run.command START_URL was gmgn.ai, its runner sent the first tab to gmgn.ai on connect, the cloud flag uc-trader.json was on, and "Clipper" self-updated at startup from ultracursor's runtime. Shared runtime rs-runtime.json is now {"build":"1","files":{}}.

## Build 2 (2026-11-13)
- Alex: "get all the jobs done and don't stop… I just want you to make money." Joins, submits and Enter on clipping pages go through with NO card. Pages whose URL says settings/payout/earning/withdraw/billing/bank/account still ask, and nothing there happens unanswered.
- Bug fixed: the heartbeat ran in the command loop, so a card waiting >30 s made the link say "not connected". Heartbeat now on its own 5 s timer (tested).
- Zip: https://blackreaper.us/media/cursor-clipper-2-6c396771e1f2699c.zip (16/16 runner checks + real first launch).
- Logged in on contentrewards.com as "sculps". First target campaign: Stream House LA (/c/campaigns/5f6b6ac5-9878-4ad6-b90f-c2f2a3392e91, $2/1K YouTube, max $500/clip, rules unlock after join).

## Content Rewards state (2026-11-13 evening)
- JOINED: Stream House LA (/c/campaigns/5f6b6ac5-9878-4ad6-b90f-c2f2a3392e91). Brief: no botting; every clip needs a title; account must be a branded streamer account with 5k followers OR soft-dedicated; top-3 audience USA/UK/CA; hashtags #streamhouselacwe #streamhousela #cwetv on every clip; must post a story on IG and TikTok (link / QR provided). ORAKTYS does not meet 5k yet -> submissions likely rejected until it does.
- Lesson: read every brief after joining for follower minimums and story requirements before making clips for it. Rules unlock only after Join.
- Discover page snapshots are huge (2000+ lines): use read_text, or open campaigns by URL. The FaZe card in "Top clips" has no URL in the snapshot.
- Next: open FaZe Tournament, SkiiMaskTimmy, Warzone, Jason Pool briefs; keep only those with no follower minimum and YouTube allowed; then make/post Shorts to their rules and submit.
- Also joined RoCode (/c/campaigns/91425ed7-...): needs real Roblox Studio screen recordings made on a PC. Claude cannot film that; only Alex can. Not a fit for ORAKTYS.
- Call of Duty MW4 (/c/campaigns/78b4e379-...): TikTok + Instagram only, NOT YouTube. Most big campaigns are TikTok/IG only -> an Instagram account (Alex: "we can make an insta later") unlocks them.
- YouTube-friendly streamer targets still to open: FaZe Tournament ($1/1K, $8.5K), $2,500 SkiiMaskTimmy, $9K Jason Pool (JasonTheWeen). Their card links are not in the Discover snapshot; open via the campaign search / "All campaigns" list.

## SkiiMaskTimmy — the first campaign that fits (2026-11-14)
- JOINED /c/campaigns/9a53cf91-e0ac-4157-bed0-81eb7095827d ($1/1K, YouTube allowed, max $150/clip, no follower minimum).
- Rules: only his Twitch streams/VODs; facecam visible; twitch.tv/skiimasktimmy overlay on every clip AND in the caption; his voice audible (no music over it); min 7 s, vertical 9:16; comments/likes on; no reuploads of his own TikToks/Shorts.
- Recipe that passes: tools/clipper daily.user_clips('skiimasktimmy','LAST_WEEK') -> yt-dlp https://clips.twitch.tv/<slug> -> ffmpeg full clip (clip.py windows cut them under 7 s), blurred 9:16 fill, red title box at y=330, purple (#9146FF) "twitch.tv/skiimasktimmy" box at h-300. R2 key oraktys-timmy-*.mp4. Metricool YouTube short, category GAMING, caption with twitch.tv/skiimasktimmy.
- First 3 scheduled 14 Nov 12:10/16:10/20:10 Athens; reminder at 21:00 to submit their YouTube links via "Submit clip".

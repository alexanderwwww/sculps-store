---
name: learn-links
description: Standing rule: when Alex pastes a reel/video/post link (Instagram, YouTube, TikTok, X), watch it immediately and extract the knowledge, with no asking. Use every time a link arrives in the chat, or when he says "I sent you a reel", "watch this", "learn this".
---
# learn-links (Alex, 2026-11-16: "learn how to watch them automatically when I just sent them and extract all the knowledge; I'm sending more, there are a lot of ideas and we must make it work")

## Trigger
Any URL from instagram.com, youtu.be/youtube.com, tiktok.com, x.com/twitter.com in Alex's message. Do not ask permission, do not wait for "go". Watching is read-only.

## Procedure (one link = about 3 tool calls; batch several links in one Bash call)
1. Instagram: `node tools/reel-reader/reel.mjs <url> 8 4` (opens it in Aquarius's logged-in Chrome, presses play, saves caption + comments + frames to /tmp/reels/<id>/). If caption.txt shows a login wall, tell Alex in ONE line to log into Instagram in Aquarius's Chrome. Then make one contact sheet of the frames (PIL) and look at it.
   Other platforms: use the `watch` skill (yt-dlp + frames + transcript); if it cannot download, say so in one line.
2. Extract, no inventing: what it is (author, claim), every tool/repo/product named on screen with its exact name, the method or numbers shown, the call to action (comment-for-DM funnels are marketing, say so).
3. Verify cheaply before trusting: search the named repo/tool once (license, what it really does, stars, last commit). Mark each idea tested / untested / hype.
4. Save: `.claude/skills/<domain>/reels/<id>.md` (trading ideas go to `.claude/skills/trading-lab/reels/`), add one line to that domain's `reels/INDEX.md`, and one aquarius_brain row if there is a concrete money idea (cost and expected_return are numbers, plus kill_date and source).
5. Reply in 3 lines: what it is, the one idea worth testing, the verdict (hype / worth a test / already have it). Never claim an idea works without a test (recipe skill: backtest with real costs first).
6. Commit and push the notes.

## Limits (state them once, not every time)
Instagram gives frames only, no audio. On-screen text carries most trading reels.

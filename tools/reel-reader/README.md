# reel-reader
Alex sends a reel link, Claude watches it.
`node tools/reel-reader/reel.mjs <url> [frames=8] [gapSeconds=4] [outDir]`
Opens the link in Aquarius's logged-in Chrome, presses play, saves the caption/comments and N screenshots (default /tmp/reels/<id>/). Claude then reads the frames (on-screen text carries most of the trading reels) and writes the notes.
Limits: no audio (screenshots only). For public YouTube/TikTok/X links use the `watch` skill (yt-dlp + frames + transcript). Instagram cannot be downloaded without a login, so Instagram goes through this tool.
Needs the Aquarius link key (env AQ_LINK_KEY or tools/aquarius/.keys.json, gitignored).

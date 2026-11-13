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

---
name: cursor
description: Cursor — Alex's personal agent app that goes out on the real internet and does things (like ChatGPT's agent, but cheaper). Use when the work touches Cursor, the on-screen cursor, the hands, driving a browser, "go do this on Depop/Grailed/Vestiaire", or the agent app. Name and look are settled.
---

# Cursor

Alex's own agent app. Name is **Cursor** — settled, personal use only, no trademark discussion (30 Sep 2026: "is my app, lets call it cursor, is only personal"). Do not suggest other names again.

## What it is
A Mac app with the plug glass look and a real browser inside. Claude is the brain and commands it through a link, the way Magic Wand is commanded; there is no chat box of its own and no "supercomputer" inside it. It exists because ChatGPT's agent burns his credits.

## The hands (built, tested)
`tools/plugapp/agent.js` — a visible cursor, real trusted mouse and keyboard input, a numbered text snapshot of the page (cheaper than screenshots), upload, scroll, navigate. Tested in a real Chromium under xvfb by `tools/plugapp/test/hands.test.mjs` (5 clean runs). A stale element number is refused, never guessed.

## The cursor look (settled)
Black like the Mac arrow, as **clear liquid glass**: dark tint, real backdrop blur clipped to the arrow, bright rim, specular sheen. Click ring is clear glass. Do not go back to the white arrow with an orange ring.

## Not built yet
1. The link that lets Claude command it (the Wand pattern).
2. Wiring the hands into the plug window's shop views.
3. Any run against a real site — Depop's selectors are unverified.

## Rules
Same as everything here: never send what you have not run; one step at a time; he is not a developer and never runs a terminal.

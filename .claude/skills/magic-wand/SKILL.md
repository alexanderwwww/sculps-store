---
name: magic-wand
description: Magic Wand — Alex's Mac app that types prompts into his own signed-in Gemini/ChatGPT and saves the pictures, commanded by Claude through wand_* tools. Use for anything about the Wand: jobs, frames, accounts, the glass, the icon, publishing a new build, or when it "does not move".
---

# Magic Wand (tools/promptbot)

## How it works (do not re-derive)
Dock icon → Terminal → `run.command` starts a REAL Chrome with a debug port (profile `~/.magicwand-chrome`) → `live.mjs` (Playwright over CDP) drives the chat page; `wand.mjs` holds the overlay (glass panels, cursor) injected into the page. Claude talks to it through the worker route `app/routes/wand.$.tsx` (queue / order / status / runtime / shots). `wand_queue_set` REPLACES the queue; it cannot be empty.
- **Why real Chrome, never an embedded window:** Google refuses "Continue with Google" inside any embedded web view (AGENTS rule 14). Alex's ChatGPT accounts are Google accounts. An Electron rewrite would lock him out.
- **Changing account:** do it in the Wand's Chrome window itself. Build 72: the overlay never draws on sign-in pages (accounts.google.com, auth.openai.com, /auth, /login, /logout) and the runner waits while any tab is on one. Before 72 the overlay was injected on every page load, including the login screens.

## Self-update (how a build reaches his Mac)
Runner polls `.../runtime`; if `build` differs it downloads ONLY `live.mjs` and `wand.mjs` from the URLs listed and restarts. Publish = `wrangler r2 object put gardenbuddy-media/wand-N-live.mjs` (+ wand), check the bytes at `https://blackreaper.us/media/wand-N-*.mjs`, then POST `{build, files}` to `/wand/<key>/runtime`. The icon, `run.command` and Info.plist are NOT updated this way: they need a new app zip (`magic-wand-N-<hex>.zip` in R2).

## Look
Clear liquid glass from `flip-ui`: tint ≤6% white, blur 24, saturate 170, 1.6px rim at 35% white, inner shadow bottom-weighted, outer 24px at 12%, type holds itself with a text-shadow. Rendered over striped clutter and looked at before shipping (a render script in the session's /tmp, not kept).

## Icon
Dock icon content must fill 820 of 1024 px (bbox 102–922), like XUGC's. The old one was 744 and looked small. Written with `tools/plug/make-icon.mjs <png> <icns>`.

## Tests (tools/promptbot/test)
Pass: attachbug, card, flow, harness, job-shape, order, save, sound, sparkle, zip, signin. **endtoend, pause, pin, refs, resilience fail identically on the untouched Sep 20 code in the sandbox (fixture/environment), so they prove nothing about changes** — fix their fixtures before relying on them for loop changes.

## Build log
- 74: pill keeps Pause/Add pictures with long job names, no breathing-glow timer, no nested blur (lag). 73: composer probe.
- 72 (2026-10-02): clear glass, 820-grid icon, hands off sign-in pages.

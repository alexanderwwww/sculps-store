---
name: never-again
description: Every sloppy mistake made on Alex's work, and the rule that stops each one. LOAD BEFORE building, shipping, sending a zip, answering about a running app, or touching money/checkout. Trigger on any build, app, zip, deploy, "it's fixed", or when Alex is angry.
---
# Never again (Alex, 2026-11-13: "Save all this bullshit you have done since the day you met me. Make a skill not to do them again.")

## The pattern behind all of it
I copy code without reading what it does, guess instead of checking, test a piece instead of the whole thing, and then say "done". Every rule below is a version of: **read it, run it end to end like Alex will, then speak.**

## Building apps
1. **Never copy an app to make a "new" one.** Copied code carries its old behavior with it. ultracursor → "Clipper" kept a GMGN start URL, a connect-time jump to GMGN, a trading flag in the cloud and a self-update that pulled the old app back. Three builds opened GMGN after Alex said no trading. If he says new, write it new (Cursor Clipper).
2. **Before shipping, grep the WHOLE bundle for every word Alex banned** (gmgn, trade, wallet, depop, research…) and read each hit. The launcher, start URL, cloud flags and runtime manifests count, not just the source.
3. **Prove the first launch from the zip itself.** Unzip it, run the real launcher, real install, real Chrome, and see the app report back. Unit tests passing is not "it works". (Clipper build 1 passed tests and failed at second 1.)
4. **No self-update unless it can only ever fetch that app's own files.** A shared runtime turned one app into another.
5. **A heartbeat must never share a loop with work that can wait.** A card waiting for Alex made the app look disconnected.
6. **Tests are fixed by fixing the test only when the test is wrong** (e.g. a ref format). Never weaken a check to get green; remove only tests of features Alex had removed.
7. **Look at every logo/design before sending it.** The first Clipper logo read as a "blocked video" sign.
8. Build number on screen and in the heartbeat, always; the bundle is the truth.

## Talking to Alex
9. **Lead with the answer, one step, no essays, no hedging.** He is not a developer; no terminal steps, ever.
10. **Don't send him to debug.** "Send a screenshot" after he said remake it = handing work back.
11. **When he says it's broken, he is right.** Find the evidence (logs, status, the live page) and fix exactly that.
12. **Answer the exact question asked.** Read his words before answering (money forms, "can you update it").
13. **Never claim connected/fixed/live without reading it live** (ultra_status, the R2 object, the page).
14. **Don't guess names, links, prices or shops.** If search did not return it, say so in one line and give the search to run; never invent a store or a link. (Skroutz: give .gr links when he is in Greece.)
15. **Act when he says do it; build only when he says build.** Don't ask "say go".
16. **Customer copy: confident, no apologies, no logistics.** Show customer emails before sending.

## Money and accounts
17. No live test charges, no fake cards, no checkout change without evidence (AGENTS rules 18, 20, 22, 25).
18. Never re-introduce a coupon or code he did not give (REAPER20).
19. Never hold or ask for seed phrases, private keys, passwords. Payout, bank, ID pages are his.

## Known incidents (for reference)
- ultracursor/Clipper opened GMGN 4 times (Nov 13) — causes: START_URL, connect-time goto, uc-trader.json on, startup self-update.
- Magic Wand restyled while he waited for a fix (Oct 2) — fix only what was asked.
- Flip builds shipped unrun (5 builds) — run before sending.
- Ultra build 113 shipped with a failed edit unnoticed — assert every edit landed.
- Stripe/PayPal closed by a wrong-store account and a live $1 test (Oct) — payments checklist.

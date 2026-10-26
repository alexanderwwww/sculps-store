---
name: spartan-forge
description: SPARTAN FORGE: BATMAN — Alex's personal weight, calories and activity tracker for his Intel Mac (diet to 96 kg, secondary 90 kg, mission ends 25 Dec 2026 inclusive). Use whenever the work touches the diet app, the weight/calorie log, the forecast, the eagle icon, or the zip for his Mac. Decisions here were set by him on 2026-10-26 and are not to be re-derived.
---

# SPARTAN FORGE: BATMAN

Alex's name for it, given by him (the "no ancient Greek names" rule is about names an agent invents, not his). Personal, for his diet. Built by Claude on 2026-10-26 (he said ChatGPT "is just a kid" and the last attempt failed him: do not copy that attempt).

## Settled by him
- Intel Mac, ZIP with a working `.app`, same delivery idea as ultracursor (needs Node 20+; Chrome optional). No Xcode, no compiling, no Terminal window.
- Mission ends **25 Dec 2026, inclusive**. Never restarts or extends. History stays after it. The end date is not editable in the app.
- Goals: primary **96.00 kg**, secondary **90.00 kg**, always shown separately. Starting weight is NEVER assumed: the first real weight he enters is the start.
- Profile: age 29, 185 cm, measured resting rate 1,800 kcal, moderate-activity estimate 2,790 kcal.
- Daily routine: weight (decimals), calories, optional activity/sleep/stress, Save, see results at once.
- Fasting / zero intake is a **logging shortcut** with a confirmation and an undo. Missing intake is unknown, never zero. No fasting timers, streaks, encouragement or calorie targets.
- Forecasts only with enough data, always with a range, and a clear reason when unavailable. A goal date after 25 Dec does not extend the mission.
- Dock icon: realistic gold eagle of Zeus, no lightning, no text, readable at Dock sizes. He must SEE it before it is final. The current one is a hand-drawn vector proposal (`design/make-icon.mjs`); a photoreal one needs an image model and his OK on the price first.
- 2026-10-26: "maybe it should be a widget, fast, efficient and nice": the window opens small (440x820), glance first (latest, to goal, days left), form right under it, everything else behind one expander. Wide windows show the full dashboard.

## Where it lives
`tools/forge/` — `src/` (server + page), `test/`, `pack.sh`, `design/`, `app/` bundle skeleton, `BUILD` number.
- Records: `~/Library/Application Support/SpartanForge/data/state.json` (+ `backups/`, `draft.json`). The program is installed beside it in `runtime/` and replaced whenever the bundle's BUILD differs, in either direction. The data folder is never touched by an update.
- Build: `tools/forge/pack.sh <out.zip>` runs every test, then runs the PACKED launcher with `open`/`osascript` stubbed. Nothing ships if a check fails.

## Estimates (documented in the app too)
Resting rate = measured 1,800 + 10 kcal/day per kg above/below the first logged weight (Mifflin-St Jeor weight term). Baseline multiplier = 2,790/1,800. Logged exercise adds only minutes above the 30-minute baseline allowance, net of resting: (MET-1) x kg x hours, MET 3/5/8. Energy balance only from complete days, labelled an estimate.

## What was and was not proven (be honest about it)
Proven here (Linux): formulas, storage, corrections, zero-calorie days, the 25 Dec deadline, CSV, backups and recovery, the real page in a real browser, the packed launcher's logic. NOT proven here: the window opening on a Mac, Gatekeeper, macOS notifications, the icon in the Dock. First open: right-click the app, Open.

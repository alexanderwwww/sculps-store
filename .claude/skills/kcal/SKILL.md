---
name: kcal
description: kcal — Alex's personal weight and calorie tracker for his Intel Mac (was called SPARTAN FORGE: BATMAN in builds 1-3). Goal 96 kg (secondary 90), tracking from his first morning weight until 25 Dec 2026 inclusive. Use whenever the work touches the diet app, the weight/calorie log, the goal bar, insights, the forecast, the icon, or the zip for his Mac. Decisions here were set by him on 2026-10-26 and are not to be re-derived.
---

# kcal

Personal app for his diet. He named it: "just call the app kcal" (lowercase, 2026-10-26). Earlier names SPARTAN FORGE and BATMAN were his first words and are retired. Built by Claude (he said ChatGPT "is just a kid"; do not copy the failed earlier attempt).

## What he asked for, in his words
- "I want to go somewhere to log in one time and to have a track of every day": one app, nothing to sign in to, records saved on the Mac.
- "Log my exact weight when I wake up", starting **2026-10-27**, until **25 Dec 2026**, goal **96 kg**. The first weight he enters is the start; nothing is assumed.
- Like the Cal AI calorie app: clean, simple, satisfying. **A loading bar to the goal is always on screen.**
- "Nice graphics and motion when I press", "put the calories I finished so it has a track", "analytics and stuff", liquid glass, "satisfying, motivating".
- **Not gold.** Icon: first a mint ring + flame (Claude drew it), then he asked "do batman logo bro lol ... do it dark like the dark knight": a near-black glass squircle with a cold moonlit glow and the bat emblem in black glass with a steel rim, no text. Claude's own drawing, not official artwork; for his personal use. `design/make-icon.mjs` (the ring version is in git history). The app screens stay light liquid glass with the mint goal tube; he has not asked for a dark theme (offer it if he does).

## Rules that stay (from his first brief)
- Mission ends 25 Dec 2026 inclusive; never restarts or extends; history stays; end date not editable.
- Secondary goal 90 kg always shown separately.
- Zero intake only through the confirmed "No food today" shortcut, with undo. Missing is never zero. No fasting timers, streak rewards for fasting, calorie targets or encouragement to eat less. The streak counts mornings WEIGHED, not food skipped.
- Forecast only with enough data, always with a range and a reason when absent; a date after 25 Dec does not extend the mission.
- Profile: age 29, 185 cm, resting 1,800 kcal, baseline 2,790. Estimates are labelled estimates and the working is shown in the app.
- Intel Mac, ZIP with a working `.app`, same idea as ultracursor (needs Node 20+, Chrome optional), no Xcode, no Terminal window.

## How the screen works
- Sticky glass goal tube (kg now, kg to go, % of the way, days left). It animates from the old value to the new one on every save, with a count-up and a short confetti burst; milestones (each whole kg below the start, 10/25/50/75/100% of the way) and new lows get a toast, bigger confetti for milestones.
- Today: "Today's read" (facts only, calm about a gain, from `coach()`), Morning weight card, Calories card (meals add up live: breakfast/lunch/dinner/snack/drink; the day stays "open" until Finish the day; a typed total is still possible), optional Activity card. Wide windows add the stats, chart, forecast.
- Insights: logging streak and consistency, lowest weight, biggest one-day drop, mornings heatmap, milestones, week-by-week table, calories by weekday, last 14 days logged vs estimated burn, calories and energy cards.
- Narrow window (440x820) is the widget layout: read, forms, one expander for the rest.

## Where it lives
`tools/kcal/` — `src/lib/{calc,store,csv,time}.mjs`, `src/server.mjs`, `src/ui/`, `test/`, `pack.sh`, `design/`, `app/kcal.app` skeleton, `BUILD`.
- Records: `~/Library/Application Support/kcal/data/` (`state.json`, `backups/`, `draft.json`). Builds 1-3 used `.../SpartanForge/`; the launcher copies that folder across once and never deletes it. The program is installed beside the data in `runtime/` and replaced whenever the bundle's BUILD differs (either direction).
- Build: `tools/kcal/pack.sh <out.zip>` runs the unit/server tests, the real-browser test, then runs the PACKED launcher with `open`/`osascript` stubbed. Nothing ships if a check fails.

## Estimates
Resting = measured 1,800 + 10 kcal/day per kg above/below the first logged weight. Baseline multiplier = 2,790/1,800. Logged exercise adds only minutes above the 30-minute baseline allowance, net of resting: (MET-1) x kg x hours, MET 3/5/8. Balance only from complete days, always labelled an estimate.

## What is proven and what is not (say it)
Proven on Linux: formulas, analytics, storage, corrections, meals, zero-calorie days, the 25 Dec deadline, CSV, backups and recovery, the page in a real browser (incl. the animation end states), the packed launcher's logic. NOT proven: the window opening on a Mac, Gatekeeper, macOS notifications, the Dock icon, how the motion feels on his screen. First open: right-click, Open.

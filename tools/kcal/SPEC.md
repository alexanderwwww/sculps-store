# kcal — what it is and how it is checked

See `.claude/skills/kcal/SKILL.md` for the decisions. This file is the map.

| Part | File |
|---|---|
| Formulas, forecast, estimates | `src/lib/calc.mjs` |
| Calendar days, zones, the 25 Dec boundary | `src/lib/time.mjs` |
| Records, corrections, backups, recovery, drafts | `src/lib/store.mjs` |
| CSV | `src/lib/csv.mjs` |
| Local server, reminders | `src/server.mjs` |
| The page | `src/ui/` |
| Dock launcher | `app/kcal.app/Contents/MacOS/kcal` |
| Icon | `design/make-icon.mjs` (draws icon.svg, rasterises the pngs, writes AppIcon.icns) |

Checks: `node --test test/*.test.mjs` (unit + server), `node test/e2e.mjs` (page in a browser), `test/launcher-check.mjs` (the packed launcher). `pack.sh` runs all three and only then writes the zip.

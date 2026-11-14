---
name: lean
description: Token saver — makes Alex's Claude usage last longer. Always on. Use in every session, especially long ones, browser driving (ultra_act snapshots), big files and video work. The safe version of the "free unlimited Claude" reels (ponytail / graph / omniroute) without sending code to other providers.
---
# lean (Alex, 2026-11-14: "do it")
Alex hits usage limits and that stops the business (AGENTS §4). Every rule cuts tokens without cutting quality.

## Output (the "ponytail" idea)
- Replies: answer first, 3-8 lines, no recap, no option lists. Code: write only what the task needs.
- Never print whole files, long logs or JSON back; tail/grep to the lines that matter (`| tail -5`, `grep -c`).

## Reading (the "graph" idea)
- Find before you read: Grep/Glob for the exact symbol, then Read only that range (offset/limit). Never re-read a file already in context.
- Keep a map: each skill file is the map of its project — read the skill, not the whole codebase.

## Browser driving (biggest cost)
- ultra_act returns a page snapshot every step. Prefer `find` and `read_text` over `look`; navigate straight to URLs you already know instead of clicking through lists; batch independent steps.

## Heavy work
- Long jobs (renders, multi-file builds) go to ONE background agent with a tight brief; read only its final report, never its transcript.
- Don't re-run a test or re-check a URL that already passed.

## Limits
- When the limit is near: commit + push work in progress first (nothing is lost), then stop cleanly.
- Never switch to unknown free model routers: they get the repo and secrets.

#!/bin/bash
# Send the running Magic Wand an order: continue | pause | stop | pictures
# Run from the repo root with .dev.vars loaded. The app reads it within two
# seconds wherever it is, including mid-picture.
set -eu
CMD="${1:?continue|pause|stop|pictures|skip|chatgpt|gemini|unpin|goto <url>}"
TMP="$(mktemp)"
printf '{ "cmd": "%s", "at": %s }\n' "$CMD" "$(date +%s)000" > "$TMP"
npx wrangler r2 object put gardenbuddy-media/wand-control.json --file "$TMP" --content-type application/json --remote >/dev/null
rm -f "$TMP"
echo "sent: $CMD"

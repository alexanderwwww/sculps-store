#!/bin/bash
#
# Double-click this file.
#
# It opens a Chrome with the debug port on (a separate profile, so your normal
# Chrome and its tabs are untouched), waits for you to be logged in, then runs
# the wand over whatever is in prompts.txt.
#
# Everything it needs is checked before anything happens, and it says which
# thing is missing rather than failing halfway.

cd "$(dirname "$0")" || exit 1
set -u

SITE="${SITE:-gemini}"
PROMPTS="${PROMPTS:-prompts.txt}"
OUT="${OUT:-./images}"
PORT=9222
PROFILE="$HOME/.promptbot-chrome"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

say() { printf "\n\033[1m%s\033[0m\n" "$1"; }
die() { printf "\n\033[31m%s\033[0m\n\n" "$1"; echo "Press any key to close."; read -r -n 1; exit 1; }

say "Black Reaper — image wand"

# --- the things that have to exist ---------------------------------------

command -v node >/dev/null 2>&1 || die "Node isn't installed.
Get it from https://nodejs.org (the big green LTS button), then double-click this again."

[ -f "$CHROME" ] || die "Google Chrome isn't in your Applications folder.
Install Chrome, then double-click this again."

[ -f "$PROMPTS" ] || die "There's no $PROMPTS next to this file.
Make one: a plain text file, one prompt per block, a blank line between blocks."

if [ ! -d node_modules ]; then
  say "First run — installing (a couple of minutes, once only)…"
  npm install --silent || die "npm install failed. Scroll up for why."
  npx --yes playwright install chromium || die "Couldn't fetch the browser engine."
fi

# --- Chrome with the door open -------------------------------------------

# Already listening? Then a debug Chrome is up and we leave it alone — quitting
# it would throw away whatever you have open in it.
if curl -s --max-time 2 "http://localhost:$PORT/json/version" >/dev/null 2>&1; then
  say "Chrome is already open with the port on. Using it."
else
  say "Opening Chrome…"
  # Its own profile directory, so this never touches your everyday Chrome.
  "$CHROME" --remote-debugging-port=$PORT --user-data-dir="$PROFILE" \
    "https://gemini.google.com/app" >/dev/null 2>&1 &

  printf "Waiting for it"
  for _ in $(seq 1 30); do
    curl -s --max-time 1 "http://localhost:$PORT/json/version" >/dev/null 2>&1 && break
    printf "."
    sleep 1
  done
  echo

  curl -s --max-time 2 "http://localhost:$PORT/json/version" >/dev/null 2>&1 || die \
"Chrome didn't come up with the port open.

Almost always this means a normal Chrome was still running. Quit Chrome
completely — Cmd+Q, not just closing the window — and double-click this again."
fi

say "Log into $SITE in that Chrome window if it isn't already."
echo "Then come back here and press Return to start. The wand appears in the browser."
echo "Press Esc in the browser at any point to stop it."
read -r

# --- go -------------------------------------------------------------------

node run.mjs --site "$SITE" --prompts "$PROMPTS" --out "$OUT"

say "Your images are in: $OUT"
echo "Press any key to close."
read -r -n 1

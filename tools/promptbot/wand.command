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

PROMPTS="${PROMPTS:-prompts.txt}"
OUT="${OUT:-./images}"
PORT=9222
PROFILE="$HOME/.promptbot-chrome"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

say() { printf "\n\033[1m%s\033[0m\n" "$1"; }
die() { printf "\n\033[31m%s\033[0m\n\n" "$1"; echo "Press any key to close."; read -r -n 1; exit 1; }

say "Black Reaper — image wand"

# --- which one ------------------------------------------------------------
#
# This used to be an environment variable, which meant ChatGPT was only
# reachable by someone willing to open Terminal. Both sites are free and they
# fail differently — one refuses a prompt the other answers — so running both
# is often the point rather than a fallback.
if [ -z "${SITE:-}" ]; then
  echo
  echo "  1   Gemini"
  echo "  2   ChatGPT"
  echo "  3   Both — every prompt through each, saved separately"
  echo
  printf "Which one? [1] "
  read -r pick
  case "${pick:-1}" in
    2) SITE="chatgpt" ;;
    3) SITE="both" ;;
    *) SITE="gemini" ;;
  esac
fi

case "$SITE" in
  chatgpt) HOME_URL="https://chatgpt.com/" ;;
  *)       HOME_URL="https://gemini.google.com/app" ;;
esac

# --- the things that have to exist ---------------------------------------

if ! command -v node >/dev/null 2>&1; then
  # Homebrew installs node somewhere the Finder's PATH doesn't reach, so a
  # perfectly good install looks missing when the script is double-clicked.
  for candidate in /usr/local/bin /opt/homebrew/bin; do
    [ -x "$candidate/node" ] && PATH="$candidate:$PATH"
  done
fi

if ! command -v node >/dev/null 2>&1; then
  printf "\n\033[31mNode isn't installed — the wand needs it to run.\033[0m\n\n"
  echo "Opening nodejs.org for you. Click the big green LTS button, then"
  echo "double-click the .pkg it downloads and click through the installer."
  echo "It's signed by Apple, so there's no security warning on that one."
  echo
  echo "When it's finished, double-click wand.command again."
  sleep 2
  open "https://nodejs.org/en/download" 2>/dev/null
  echo "Press any key to close."
  read -r -n 1
  exit 1
fi

[ -f "$CHROME" ] || die "Google Chrome isn't in your Applications folder.
Install Chrome, then double-click this again."

# --- whatever Claude wrote last ------------------------------------------
#
# This is the whole connection. Claude can't reach your browser from where it
# runs, but it can write prompts where this can fetch them, so a double-click
# runs whatever it wrote last and "give me the Scream shots" and "load new
# prompts" become the same action.
#
# Two ways in, because this folder ships both inside the repo and on its own.
# Either way your own typing wins: a prompts.txt you have edited is never
# replaced, and a fetch that fails leaves what's already here alone.
FEED="https://kerberos.gardenbuddystore.workers.dev/media/prompts.txt"

if git rev-parse --git-dir >/dev/null 2>&1 && [ -d ../../.git ]; then
  if git -C ../.. diff --quiet -- tools/promptbot/prompts.txt 2>/dev/null; then
    say "Checking for new prompts..."
    git -C ../.. pull --quiet --ff-only 2>/dev/null \
      && echo "Up to date." \
      || echo "Couldn't reach GitHub - using the prompts already here."
  else
    echo "You've edited prompts.txt, so it's left alone."
  fi
elif [ ! -f .prompts-edited ]; then
  say "Checking for new prompts..."
  # Into a temp file first: a half-downloaded feed must never become the
  # prompts we then type into somebody's browser.
  if curl -fsS --max-time 10 "$FEED" -o .prompts-new 2>/dev/null && [ -s .prompts-new ]; then
    if cmp -s .prompts-new "$PROMPTS" 2>/dev/null; then
      echo "Up to date."
    else
      mv .prompts-new "$PROMPTS"
      echo "New prompts loaded."
    fi
  else
    echo "Couldn't reach the feed - using the prompts already here."
  fi
  rm -f .prompts-new
fi

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
    "$HOME_URL" >/dev/null 2>&1 &

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

if [ "$SITE" = "both" ]; then
  say "Log into BOTH Gemini and ChatGPT in that Chrome window."
  echo "Open a tab for each. It needs both signed in before it starts."
else
  say "Log into $SITE in that Chrome window if it isn't already."
fi
echo "Then come back here and press Return to start. The wand appears in the browser."
echo "Press Esc in the browser at any point to stop it."
read -r

# --- go -------------------------------------------------------------------

if [ "$SITE" = "both" ]; then
  # Separate folders, because the whole reason to run both is to compare them.
  node run.mjs --site gemini  --prompts "$PROMPTS" --out "$OUT/gemini"
  echo
  say "Gemini done. Now ChatGPT."
  node run.mjs --site chatgpt --prompts "$PROMPTS" --out "$OUT/chatgpt"
  say "Your images are in: $OUT/gemini and $OUT/chatgpt"
else
  node run.mjs --site "$SITE" --prompts "$PROMPTS" --out "$OUT"
  say "Your images are in: $OUT"
fi
echo "Press any key to close."
read -r -n 1

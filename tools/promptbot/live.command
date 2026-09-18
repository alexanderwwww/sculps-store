#!/bin/bash
#
# Double-click this to open the wand and leave it listening.
#
# Same first-run checks as wand.command. The difference is what it starts:
# wand.command works through prompts.txt once and quits, this one stays open
# so Claude can queue the next batch without anybody downloading anything.

cd "$(dirname "$0")" || exit 1
set -u

OUT="${OUT:-./images}"
PORT=9222
PROFILE="$HOME/.promptbot-chrome"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

say() { printf "\n\033[1m%s\033[0m\n" "$1"; }
die() { printf "\n\033[31m%s\033[0m\n\n" "$1"; echo "Press any key to close."; read -r -n 1; exit 1; }

say "Black Reaper — image wand (live)"

if ! command -v node >/dev/null 2>&1; then
  # A double-clicked script doesn't inherit the shell's PATH, so a Homebrew
  # node reads as missing unless we go and look.
  for c in /usr/local/bin /opt/homebrew/bin; do [ -x "$c/node" ] && PATH="$c:$PATH"; done
fi
command -v node >/dev/null 2>&1 || die "Node isn't installed. Run wand.command first — it walks you through it."
[ -f "$CHROME" ] || die "Google Chrome isn't in your Applications folder."
[ -d node_modules ] || die "Not set up yet. Double-click wand.command first, let it finish, then come back."

echo
echo "  1   Gemini"
echo "  2   ChatGPT"
echo
printf "Which one? [1] "
read -r pick
case "${pick:-1}" in
  2) SITE="chatgpt"; HOME_URL="https://chatgpt.com/" ;;
  *) SITE="gemini";  HOME_URL="https://gemini.google.com/app" ;;
esac

if curl -s --max-time 2 "http://localhost:$PORT/json/version" >/dev/null 2>&1; then
  say "Chrome is already open with the port on. Using it."
else
  say "Opening Chrome..."
  "$CHROME" --remote-debugging-port=$PORT --user-data-dir="$PROFILE" "$HOME_URL" >/dev/null 2>&1 &
  printf "Waiting for it"
  for _ in $(seq 1 30); do
    curl -s --max-time 1 "http://localhost:$PORT/json/version" >/dev/null 2>&1 && break
    printf "."; sleep 1
  done
  echo
  curl -s --max-time 2 "http://localhost:$PORT/json/version" >/dev/null 2>&1 || die \
"Chrome didn't come up with the port open.

A normal Chrome was still running. Quit it properly - Cmd+Q, not the red dot -
then double-click this again."
fi

say "Sign into $SITE in that Chrome window if you aren't already."
echo "Then press Return here and leave this window open."
read -r

node live.mjs --site "$SITE" --out "$OUT"

say "Your images are in: $OUT"
echo "Press any key to close."
read -r -n 1

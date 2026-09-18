#!/bin/bash
#
# What the Dock icon starts.
#
# Lives inside the bundle so there is one thing to drag to Applications and
# nothing loose beside it. Everything it writes goes to a folder in Pictures,
# because an app has no business writing into its own bundle and because that
# is where somebody looks for pictures.

cd "$(dirname "$0")" || exit 1
set -u

OUT="$HOME/Pictures/Magic Wand"
PORT=9222
PROFILE="$HOME/.magicwand-chrome"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

say() { printf "\n\033[1m%s\033[0m\n" "$1"; }
die() { printf "\n\033[31m%s\033[0m\n\n" "$1"; echo "Press any key to close."; read -r -n 1; exit 1; }

printf "\033]0;Magic Wand\007"
say "Magic Wand"

if ! command -v node >/dev/null 2>&1; then
  # A Dock launch inherits almost no PATH, so a perfectly good Homebrew or
  # pkg install reads as missing unless we go and look in both places.
  for c in /usr/local/bin /opt/homebrew/bin; do [ -x "$c/node" ] && PATH="$c:$PATH"; done
fi

if ! command -v node >/dev/null 2>&1; then
  printf "\n\033[31mNode isn't installed — Magic Wand needs it.\033[0m\n\n"
  echo "Opening nodejs.org. Click the big green LTS button, double-click the"
  echo ".pkg it downloads, click through. Apple signs it, so no warnings."
  echo
  echo "Then open Magic Wand again."
  sleep 2
  open "https://nodejs.org/en/download" 2>/dev/null
  echo "Press any key to close."; read -r -n 1; exit 1
fi

[ -d "/Applications/Google Chrome.app" ] || die "Google Chrome isn't installed."

if [ ! -d node_modules ]; then
  say "First run — setting up. A couple of minutes, once only."
  npm install --silent || die "Setup failed. Scroll up for why."
  npx --yes playwright install chromium || die "Couldn't fetch the browser engine."
fi

mkdir -p "$OUT"

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
  say "Chrome is already open and ready."
else
  say "Opening Chrome..."
  # Its own profile directory, so this never touches your everyday Chrome.
  "$CHROME" --remote-debugging-port=$PORT --user-data-dir="$PROFILE" "$HOME_URL" >/dev/null 2>&1 &
  printf "Waiting for it"
  for _ in $(seq 1 30); do
    curl -s --max-time 1 "http://localhost:$PORT/json/version" >/dev/null 2>&1 && break
    printf "."; sleep 1
  done
  echo
  curl -s --max-time 2 "http://localhost:$PORT/json/version" >/dev/null 2>&1 || die \
"Chrome didn't open with the door on.

A normal Chrome was still running. Quit it properly - Cmd+Q, not the red dot -
then open Magic Wand again."
fi

say "Sign into $SITE in that Chrome window if you aren't already."
echo "Then press Return here and leave this window open."
read -r

node live.mjs --site "$SITE" --out "$OUT"

say "Your pictures are in: $OUT"
open "$OUT" 2>/dev/null
echo "Press any key to close."
read -r -n 1

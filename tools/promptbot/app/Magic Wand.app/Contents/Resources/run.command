#!/bin/bash
#
# What the Dock icon starts.
#
# It does its work in Application Support rather than inside the bundle, and
# that is not tidiness — it is the only thing that works. macOS runs a
# downloaded, unsigned app from a read-only copy in /var/folders (it calls
# this App Translocation), so anything that installs into its own Resources
# folder fails on the first run with a permission error that reads like a
# broken download. Copying the few small files out and installing there sides
# steps the whole mechanism, and it means an app update never wipes the
# hundred megabytes of browser engine underneath it.

set -u

BUNDLE="$(cd "$(dirname "$0")" && pwd)"
BUILD="9"
WORK="$HOME/Library/Application Support/Magic Wand/$BUILD"
OUT="$HOME/Downloads/Magic Wand"
PORT=9222
PROFILE="$HOME/.magicwand-chrome"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

say() { printf "\n\033[1m%s\033[0m\n" "$1"; }
die() { printf "\n\033[31m%s\033[0m\n\n" "$1"; echo "Press any key to close."; read -r -n 1; exit 1; }

printf "\033]0;Magic Wand\007"
say "Magic Wand"

# Finding Node.
#
# An app launched from the Dock gets a bare PATH — not the one your Terminal
# has — so a working install is invisible unless we go looking. There are four
# ways it lands on a Mac and they all put it somewhere different, which is why
# this is a search rather than a check.
if ! command -v node >/dev/null 2>&1; then
  # The two installers: Apple's .pkg, and Homebrew on Apple Silicon.
  for c in /usr/local/bin /opt/homebrew/bin /opt/local/bin; do
    [ -x "$c/node" ] && PATH="$c:$PATH"
  done
fi

if ! command -v node >/dev/null 2>&1; then
  # nvm keeps versions in its own tree and only puts them on PATH when a
  # shell starts, so take the newest it has.
  NVM_NODE=$(ls -d "$HOME/.nvm/versions/node"/*/bin/node 2>/dev/null | sort -V | tail -1)
  [ -n "${NVM_NODE:-}" ] && PATH="$(dirname "$NVM_NODE"):$PATH"
fi

if ! command -v node >/dev/null 2>&1; then
  # Last resort: ask a login shell, which reads the profile files that would
  # have set this up for a Terminal window.
  SHELL_PATH=$("$SHELL" -lic 'command -v node' 2>/dev/null | tail -1)
  [ -x "${SHELL_PATH:-}" ] && PATH="$(dirname "$SHELL_PATH"):$PATH"
fi

if ! command -v node >/dev/null 2>&1; then
  printf "\n\033[31mNode isn't installed — Magic Wand needs it.\033[0m\n\n"
  echo "Opening nodejs.org. Click the big green LTS button, double-click the"
  echo ".pkg it downloads, click through it. Apple signs that one, so there's"
  echo "no security warning."
  echo
  echo "Then open Magic Wand again."
  echo
  echo "Or close this and double-click \"Install Node\" — it fetches the right"
  echo "version for your Mac and opens Apple's installer for you."
  sleep 2
  open "https://nodejs.org/en/download" 2>/dev/null
  echo "Press any key to close."; read -r -n 1; exit 1
fi

[ -d "/Applications/Google Chrome.app" ] || die "Google Chrome isn't installed."

mkdir -p "$WORK" "$OUT" || die "Couldn't create $WORK"
# Always refresh the scripts, never the installed packages: this is also how
# an updated app picks up new code without reinstalling anything.
cp "$BUNDLE"/*.mjs "$BUNDLE/package.json" "$WORK/" 2>/dev/null
cd "$WORK" || die "Couldn't open $WORK"

if [ ! -d node_modules ]; then
  say "Setting up. A couple of minutes, once only."
  npm install --silent || die "Setup failed. Scroll up for why."
  npx --yes playwright install chromium || die "Couldn't fetch the browser engine."
fi

# No question here any more.
#
# It used to ask which site to use, which made a decision at launch that
# properly belongs to the job — Claude knows which one it wants for a given
# batch, and asking meant restarting to change your mind. It opens on Gemini
# and a job can say chatgpt, at which point it switches itself.
SITE="gemini"
HOME_URL="https://gemini.google.com/app"

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

say "Sign into Gemini in that Chrome window if you aren't already."
echo
echo "Sign into ChatGPT in a second tab as well, and Claude can send a job to"
echo "either one without you doing anything."
echo
echo "Then press Return here and leave this window open."
read -r

node live.mjs --site "$SITE" --out "$OUT"

printf "\n\033[1m========================================\033[0m\n"
printf "\033[1m  YOUR PICTURES ARE ON THE DESKTOP\033[0m\n"
printf "\033[1m  as one zip, named after the job.\033[0m\n"
printf "\033[1m========================================\033[0m\n"
echo "Press any key to close."
read -r -n 1

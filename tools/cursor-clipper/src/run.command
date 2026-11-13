#!/bin/bash
# Cursor Clipper — what the Dock icon opens in Terminal.
# Copies the app beside itself, installs its one package once, opens its own
# Chrome (own profile, own port) on Content Rewards, and runs the clipper.
# No trading. No self-update: the bundle is the truth, every launch.

BUILD="2"
APP="Cursor Clipper"
BUNDLE="$(cd "$(dirname "$0")" && pwd)"
WORK="${CC_WORK:-$HOME/Library/Application Support/Cursor Clipper}"
PROFILE="${CC_PROFILE:-$HOME/.cursor-clipper-chrome}"
PORT="${CC_PORT:-9555}"
START_URL="https://contentrewards.com/"

printf "\033]0;%s\007" "$APP · build $BUILD"
printf "\n\033[1m%s · build %s\033[0m\n\n" "$APP" "$BUILD"
die() { printf "\n\033[31m%s\033[0m\n\n" "$1"; exit 1; }

# Node 20+
NODE=""
for n in "$(command -v node 2>/dev/null)" /opt/homebrew/bin/node /usr/local/bin/node; do
  [ -n "$n" ] && [ -x "$n" ] && { NODE="$n"; break; }
done
if [ -z "$NODE" ] || [ "$("$NODE" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)" -lt 20 ]; then
  open "https://nodejs.org/en/download" >/dev/null 2>&1
  die "Cursor Clipper needs Node 20 or newer. The download page is open: install it, then open Cursor Clipper again."
fi
NPM="$(dirname "$NODE")/npm"

# Chrome
CHROME=""
for c in "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" "$HOME/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; do
  [ -x "$c" ] && { CHROME="$c"; break; }
done
[ -n "${CC_CHROME:-}" ] && CHROME="$CC_CHROME"
[ -n "$CHROME" ] || { open "https://www.google.com/chrome/" >/dev/null 2>&1; die "Google Chrome isn't installed. Install it, then open Cursor Clipper again."; }

# The bundle is the truth: copy it in fresh every launch (keep the installed package).
mkdir -p "$WORK" || die "Couldn't create $WORK"
cp "$BUNDLE/app.mjs" "$BUNDLE/package.json" "$WORK/" || die "Couldn't copy the app into $WORK"
if [ ! -d "$WORK/node_modules/playwright-core" ]; then
  echo "First launch: installing (one minute)…"
  ( cd "$WORK" && "$NPM" install --no-audit --no-fund --silent ) || die "The install failed. Check the internet connection, then open Cursor Clipper again."
fi

# Its own Chrome
up() { curl -s --max-time 1 "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1; }
if ! up; then
  "$CHROME" --remote-debugging-port="$PORT" --user-data-dir="$PROFILE" \
    --no-first-run --no-default-browser-check "$START_URL" >/dev/null 2>&1 &
  for _ in $(seq 1 60); do up && break; sleep 0.5; done
  up || die "Chrome didn't open for Cursor Clipper. Close every Chrome window and open Cursor Clipper again."
fi
echo "Chrome is open on Content Rewards. Sign in there once; Chrome remembers you."
echo "Leave this window open while Cursor Clipper works."
echo

cd "$WORK" && CC_BUILD="$BUILD" CC_PORT="$PORT" "$NODE" app.mjs
printf "\n\033[1m%s has stopped (build %s).\033[0m\n" "$APP" "$BUILD"

#!/bin/bash
#
# What the ultracursor Dock icon opens in Terminal.
#
# Built on Magic Wand's run.command, which is proven on his Mac: find Node,
# check Chrome, work out of Application Support (a downloaded unsigned app runs
# from a read-only translocated copy, so nothing can be installed inside the
# bundle), open a real Chrome with its own profile and a debug port, then run
# the runner in a loop that restarts it when it has updated itself.
#
# Written for the bash that ships with macOS (3.2): no bash 4 features.
# Every path is quoted: WORK has a space in it ("Application Support").

set -u

BUNDLE="$(cd "$(dirname "$0")" && pwd)"
BUILD="1"
WORK="$HOME/Library/Application Support/ultracursor/runtime"
PORT="${ULTRA_TEST_PORT:-9333}"
PROFILE="$HOME/.ultracursor-chrome"
START_URL="https://www.tiktok.com/"

say() { printf "\n\033[1m%s\033[0m\n" "$1"; }
title() { printf "\033]0;%s\007" "ultracursor · build $1"; }
die() {
  printf "\n\033[31m%s\033[0m\n\n" "$1"
  echo "You can close this window."
  exit 1
}

title "$BUILD"
say "ultracursor · build $BUILD"

# ---------------------------------------------------------------- Node
#
# An app started from the Dock gets a bare PATH, not the one a Terminal has,
# so a working install is invisible unless we go looking. Node lands in a
# different place for every way of installing it. playwright-core 1.63 needs
# Node 20 or newer, so an older one is passed over, not used.

node_major() { "$1" -p 'process.versions.node.split(".")[0]' 2>/dev/null; }

NODE=""
OLD_NODE=""
try_node() {
  [ -n "$NODE" ] && return 0
  [ -n "${1:-}" ] && [ -x "$1" ] || return 1
  M="$(node_major "$1")"
  case "$M" in ''|*[!0-9]*) return 1 ;; esac
  if [ "$M" -ge 20 ]; then NODE="$1"; else OLD_NODE="v$M"; fi
}

try_node "$(command -v node 2>/dev/null)"
# Apple's .pkg installer, Homebrew on Intel and Apple Silicon, MacPorts.
for c in /usr/local/bin/node /opt/homebrew/bin/node /opt/local/bin/node; do try_node "$c"; done
# nvm and Volta keep Node in their own trees; newest nvm version first.
if [ -z "$NODE" ] && [ -d "$HOME/.nvm/versions/node" ]; then
  # shellcheck disable=SC2012  # version folder names, never spaces
  while IFS= read -r c; do try_node "$c"; done < <(ls -d "$HOME/.nvm/versions/node"/*/bin/node 2>/dev/null | sort -rV)
fi
try_node "$HOME/.volta/bin/node"
# Last resort: a login shell reads the profile files that set Node up for a
# Terminal window.
if [ -z "$NODE" ]; then
  try_node "$("${SHELL:-/bin/zsh}" -lic 'command -v node' 2>/dev/null | tail -1)"
fi

if [ -z "$NODE" ]; then
  if [ -n "$OLD_NODE" ]; then
    printf "\n\033[31mThe Node on this Mac is %s. ultracursor needs version 20 or newer.\033[0m\n\n" "$OLD_NODE"
  else
    printf "\n\033[31mNode isn't installed. ultracursor needs it.\033[0m\n\n"
  fi
  echo "Opening nodejs.org. Click the big green LTS button, double-click the"
  echo ".pkg it downloads and click through it. Apple signs that one, so there"
  echo "is no security warning."
  echo
  echo "Then open ultracursor again."
  sleep 2
  open "https://nodejs.org/en/download" >/dev/null 2>&1
  echo
  echo "You can close this window."
  exit 1
fi
# npm lives beside node; put that folder first so both are the same install.
PATH="$(dirname "$NODE"):$PATH"
export PATH

# ---------------------------------------------------------------- Chrome
#
# A real Google Chrome, because sign-ins to TikTok, Instagram, Facebook and
# Google only work there (an embedded web view breaks them).
CHROME="${ULTRA_TEST_CHROME:-}"
if [ -z "$CHROME" ]; then
  for c in "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
           "$HOME/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; do
    if [ -x "$c" ]; then CHROME="$c"; break; fi
  done
fi
if [ -z "$CHROME" ] || [ ! -x "$CHROME" ]; then
  printf "\n\033[31mGoogle Chrome isn't installed. ultracursor works inside it.\033[0m\n\n"
  echo "Opening the Chrome download page. Install it, then open ultracursor again."
  sleep 2
  open "https://www.google.com/chrome/" >/dev/null 2>&1
  echo
  echo "You can close this window."
  exit 1
fi

mkdir -p "$WORK" || die "Couldn't create $WORK"
cd "$WORK" || die "Couldn't open $WORK"

# ---------------------------------------------------------------- one at a time
#
# Two runners would split Claude's orders between them and drive the same
# Chrome at once. A second click on the Dock icon while ultracursor runs
# therefore leaves the running one alone. The one exception: its Chrome has
# been closed. Then this window takes over and opens Chrome again.
cdp_up() { curl -s --max-time 1 "http://localhost:$PORT/json/version" >/dev/null 2>&1; }

PIDFILE="$WORK/runner.pid"
OLD=""
[ -f "$PIDFILE" ] && OLD="$(tr -cd '0-9' < "$PIDFILE" 2>/dev/null)"
if [ -n "$OLD" ] && [ "$OLD" != "$$" ] && kill -0 "$OLD" 2>/dev/null \
   && ps -p "$OLD" -o command= 2>/dev/null | grep -q "run.command"; then
  if cdp_up; then
    say "ultracursor is already running in its other window."
    echo "Nothing else to do here. You can close this window."
    echo "If that other window looks stuck, close it and open ultracursor again."
    exit 0
  fi
  say "Chrome was closed. Restarting ultracursor in this window."
  pkill -TERM -f -P "$OLD" "ultra.mjs" >/dev/null 2>&1
  kill -TERM "$OLD" >/dev/null 2>&1
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    kill -0 "$OLD" 2>/dev/null || break
    sleep 0.5
  done
fi
echo "$$" > "$PIDFILE"
# shellcheck disable=SC2317  # called by the EXIT trap
cleanup() {
  if [ "$(tr -cd '0-9' < "$PIDFILE" 2>/dev/null)" = "$$" ]; then rm -f "$PIDFILE"; fi
}
trap cleanup EXIT

# ---------------------------------------------------------------- scripts
#
# ALWAYS refresh the scripts from the bundle, every launch, in either
# direction (AGENTS rule 13). A self-update may have left newer files here;
# they are replaced by the bundle's, and the runner fetches the current build
# again on its first check. Installed packages and state.json are kept.
rm -rf "$WORK/.next"
rm -f "$WORK/build.txt"
for f in "$WORK"/*.mjs "$WORK"/*.js; do
  [ -e "$f" ] || continue
  [ -e "$BUNDLE/$(basename "$f")" ] || rm -f "$f"
done
COPIED=0
for src in "$BUNDLE"/*; do
  [ -e "$src" ] || continue
  name="$(basename "$src")"
  case "$name" in run.command|*.icns) continue ;; esac
  rm -rf "${WORK:?}/$name"
  cp -R "$src" "$WORK/$name" || die "Couldn't copy $name into $WORK"
  COPIED=$((COPIED + 1))
done
[ -f "$WORK/ultra.mjs" ] || die "This copy of ultracursor is incomplete: ultra.mjs is missing. Download the app again."

# ---------------------------------------------------------------- packages
#
# Only the Playwright library, once, and again only if package.json asks for a
# different version. Never a browser download: it drives his own Chrome.
WANT="$(node -p 'require("./package.json").dependencies["playwright-core"]' 2>/dev/null)"
HAVE="$(node -p 'require("./node_modules/playwright-core/package.json").version' 2>/dev/null)"
NEED=0
if [ -z "$HAVE" ]; then
  NEED=1
else
  case "$WANT" in
    ''|*[!0-9.]*) ;;
    *) [ "$WANT" = "$HAVE" ] || NEED=1 ;;
  esac
fi
if [ "$NEED" = "1" ]; then
  say "Setting up. A minute or two, once only."
  npm install --omit=dev --no-audit --no-fund || die \
"Setup couldn't download what it needs.
Check the internet connection, then open ultracursor again."
  [ -f "$WORK/node_modules/playwright-core/package.json" ] || die \
"Setup finished without the Playwright library.
Check the internet connection, then open ultracursor again."
fi

# ---------------------------------------------------------------- open Chrome
if cdp_up; then
  say "Chrome is already open and ready."
else
  say "Opening Chrome..."
  # Its own profile, so this never touches his everyday Chrome, and its own
  # port (Magic Wand has 9222), so the two apps never meet.
  "$CHROME" --remote-debugging-port="$PORT" --user-data-dir="$PROFILE" "$START_URL" >/dev/null 2>&1 &
  printf "Waiting for it"
  for _ in $(seq 1 60); do
    cdp_up && break
    printf "."; sleep 1
  done
  echo
  if ! cdp_up; then
    printf "\n\033[31m%s\033[0m\n" "Chrome didn't open for ultracursor."
    echo "Quit Chrome completely (Cmd+Q in Chrome, not the red dot), then open"
    echo "ultracursor again. ultracursor keeps running and tells Claude it is"
    echo "waiting for Chrome."
  fi
fi

say "Sign into TikTok, Instagram and Facebook once in that Chrome window."
echo "Chrome remembers you after that. ultracursor only reads: it never likes,"
echo "follows, comments, messages, posts or buys anything."
echo
echo "Leave this window open. Claude sends the research and you can watch the"
echo "cursor work in Chrome."
echo

# ---------------------------------------------------------------- the loop
#
# Exit 97 means the runner downloaded a newer build next to itself: start it
# again with the number it wrote in build.txt. Any other exit ends the sitting.
RUN_BUILD="$BUILD"
CODE=0
while true; do
  title "$RUN_BUILD"
  ULTRA_BUILD="$RUN_BUILD" node ultra.mjs
  CODE=$?
  [ "$CODE" = "97" ] || break
  if [ -f "$WORK/build.txt" ]; then
    NEXT="$(tr -d '[:space:]' < "$WORK/build.txt")"
    [ -n "$NEXT" ] && RUN_BUILD="$NEXT"
  fi
  printf "\n\033[1mUpdated to build %s. Starting again.\033[0m\n\n" "$RUN_BUILD"
  sleep 1
done

printf "\n\033[1multracursor has stopped (build %s).\033[0m\n" "$RUN_BUILD"
echo "Open it from the Dock to start it again. You can close this window."
exit "$CODE"

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
# Written for the bash that ships with macOS (3.2.57): no bash 4 features.
# Every path is quoted: WORK has a space in it ("Application Support").
# Nothing here ever asks him to type anything into this window.

set -u

BUNDLE="$(cd "$(dirname "$0")" && pwd)"
BUILD="35"
WORK="$HOME/Library/Application Support/ultracursor/runtime"
# The two ULTRA_TEST_ values exist for test/pack.test.mjs only. On his Mac
# they are never set: port 9333 (Magic Wand has 9222) and his real Chrome.
PORT="${ULTRA_TEST_PORT:-9333}"
PROFILE="$HOME/.ultracursor-chrome"
START_URL="https://gmgn.ai/?chain=sol"

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
# different place for every way of installing it. playwright-core 1.63 says
# "node": ">=20" in its package.json, so an older Node is passed over.

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
  while IFS= read -r c; do try_node "$c"; done < <(ls -d "$HOME/.nvm/versions/node"/*/bin/node 2>/dev/null | sort -rV 2>/dev/null)
fi
try_node "$HOME/.volta/bin/node"
# Last resort: a login shell reads the profile files that set Node up for a
# Terminal window. Its input is /dev/null, so a profile that asks a question
# (oh-my-zsh's "update now?") gets an answer instead of hanging this window.
if [ -z "$NODE" ]; then
  try_node "$("${SHELL:-/bin/zsh}" -lic 'command -v node' </dev/null 2>/dev/null | tail -1)"
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
# been closed after it was up and running. Then this window takes over and
# opens Chrome again. A window still setting up (installing, opening Chrome)
# is never interrupted: killing an install half way is how a setup breaks.
cdp_up() { curl -s --max-time 1 "http://localhost:$PORT/json/version" >/dev/null 2>&1; }

PIDFILE="$WORK/runner.pid"
LOOPFILE="$WORK/runner.looping"
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
  if [ "$(tr -cd '0-9' < "$LOOPFILE" 2>/dev/null)" != "$OLD" ]; then
    say "ultracursor is still starting in its other window."
    echo "Nothing else to do here. You can close this window."
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
rm -f "$LOOPFILE"
# shellcheck disable=SC2317,SC2329  # called by the EXIT trap
cleanup() {
  if [ "$(tr -cd '0-9' < "$PIDFILE" 2>/dev/null)" = "$$" ]; then rm -f "$PIDFILE" "$LOOPFILE"; fi
}
trap cleanup EXIT

# ---------------------------------------------------------------- scripts
#
# ALWAYS refresh the scripts from the bundle, every launch, in either
# direction (AGENTS rule 13): the bundle in front of us is the truth. A
# self-update may have left newer files here; they are replaced by the
# bundle's, build.txt goes, and the runner fetches the current build again on
# its first check. Installed packages and state.json are kept.
rm -rf "$WORK/.next"
rm -f "$WORK/build.txt"
for f in "$WORK"/*.mjs "$WORK"/*.js; do
  [ -e "$f" ] || continue
  [ -e "$BUNDLE/$(basename "$f")" ] || rm -f "$f"
done
for src in "$BUNDLE"/*; do
  [ -e "$src" ] || continue
  name="$(basename "$src")"
  case "$name" in
    run.command|*.icns) continue ;;
    # What lives only here, never in a bundle: never replace it.
    node_modules|package-lock.json|state.json|build.txt|runner.pid|runner.looping) continue ;;
  esac
  rm -rf "${WORK:?}/$name"
  cp -R "$src" "$WORK/$name" || die "Couldn't copy $name into $WORK"
done
[ -f "$WORK/ultra.mjs" ] || die "This copy of ultracursor is incomplete: ultra.mjs is missing. Download the app again."

# ---------------------------------------------------------------- packages
#
# Every library package.json lists (Playwright; from build 2 also Claude's
# official SDK for the agent): installed once, and again only when package.json
# asks for one that is not there or for another version. Never a browser
# download: it drives his own Chrome. (None of them has install scripts.)
DEPS_JS='
const deps = require("./package.json").dependencies || {};
const out = [];
for (const [name, want] of Object.entries(deps)) {
  let have = null;
  try { have = require("./node_modules/" + name + "/package.json").version; } catch (e) { have = null; }
  if (!have || (/^[0-9.]+$/.test(String(want)) && want !== have)) out.push(name);
}
// "deps:" first, so a node that could not run this at all reads as "install".
process.stdout.write("deps:" + out.join(" "));
'
NEED="$("$NODE" -e "$DEPS_JS" 2>/dev/null)"
if [ "$NEED" != "deps:" ] || [ ! -d "$WORK/node_modules" ]; then
  say "Setting up. A minute or two, once only."
  npm install --omit=dev --no-audit --no-fund || die \
"Setup couldn't download what it needs.
Check the internet connection, then open ultracursor again."
  MISSING="$("$NODE" -e "$DEPS_JS" 2>/dev/null)"
  [ "$MISSING" = "deps:" ] || die \
"Setup finished without: ${MISSING#deps:}.
Check the internet connection, then open ultracursor again."
fi

# ---------------------------------------------------------------- open Chrome
if cdp_up; then
  say "Chrome is already open and ready."
else
  say "Opening Chrome..."
  # Its own profile, so this never touches his everyday Chrome, and its own
  # port (Magic Wand has 9222), so the two apps never meet. The two --no-
  # switches skip Chrome's welcome tab and default-browser question in a new
  # profile; Playwright passes the same two to every Chrome it starts.
  "$CHROME" --remote-debugging-port="$PORT" --user-data-dir="$PROFILE" \
    --no-first-run --no-default-browser-check "$START_URL" >/dev/null 2>&1 &
  printf "Waiting for it"
  for _ in $(seq 1 60); do
    cdp_up && break
    printf "."; sleep 1
  done
  echo
  if ! cdp_up; then
    printf "\n\033[31m%s\033[0m\n" "Chrome didn't open for ultracursor."
    echo "Quit Chrome completely (Cmd+Q in Chrome, not the red dot), then open"
    echo "ultracursor again from the Dock. Until then ultracursor keeps"
    echo "running and tells Claude it is waiting for Chrome."
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
echo "$$" > "$LOOPFILE"
RUN_BUILD="$BUILD"
CODE=0
while true; do
  title "$RUN_BUILD"
  ULTRA_BUILD="$RUN_BUILD" "$NODE" ultra.mjs
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

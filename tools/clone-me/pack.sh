#!/bin/bash
# Build CloneMe.zip from the checkout: the worker goes into the bundle's
# Resources, the archive extracts to CloneMe.app, and the archive is then
# opened and checked the way the launcher would use it.
set -eu
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:-/tmp/claude-0/CloneMe.zip}"
RES="$HERE/app/CloneMe.app/Contents/Resources/worker"
SWIFT="$HERE/app/CloneMe.app/Contents/Resources/Shell/main.swift"
[ -f "$SWIFT" ] || { echo "no main.swift — the bundle has no window"; exit 1; }
# Nothing ships without this: the Swift cannot be compiled here, so every name
# in it is checked instead. A wrong one reaches Alex as "Apple's build tools
# are broken", which is a lie the launcher cannot help telling.
node "$HERE/check-swift.mjs" "$SWIFT"
# The page's code is rebuilt from its parts, so the bundle can never carry a
# stale one: agent.built.js is generated, never edited.
node "$HERE/worker/agent/build.mjs"
# Only now is the old bundle worker thrown away. Emptying it first meant any
# failure in the two steps above left Resources/worker empty under `set -eu`,
# and an empty worker reaches Alex as the same alert we are here to fix.
rm -rf "$RES"; mkdir -p "$RES"
# Every build gets a number, and the number always goes up.
#
# This is not bookkeeping — it is the difference between shipping and not. The
# launcher copies the bundle's worker over the installed one only when the
# bundle's build is HIGHER. Both were hardcoded to 1, so the very first install
# pinned the machine to the first worker and every rebuild after it was
# silently ignored. A whole afternoon of "it still does not work" was one
# stale file that no amount of re-downloading could dislodge.
BUILD="$(date +%s)"
/usr/bin/sed -i.bak "s/^BUNDLE_BUILD=.*/BUNDLE_BUILD=$BUILD/" "$HERE/app/CloneMe.app/Contents/MacOS/CloneMe"
rm -f "$HERE/app/CloneMe.app/Contents/MacOS/CloneMe.bak"
echo "build $BUILD"
cp "$HERE"/worker/*.mjs "$HERE"/worker/package.json "$HERE"/worker/agent.built.js "$RES/"
rm -f "$OUT"; mkdir -p "$(dirname "$OUT")"
( cd "$HERE/app" && zip -qr "$OUT" CloneMe.app -x '*.DS_Store' -x '*/node_modules/*' )
# check the archive, not the checkout
T="$(mktemp -d)"; ( cd "$T" && unzip -q "$OUT" )
C="$T/CloneMe.app/Contents"
[ -x "$C/MacOS/CloneMe" ] || { echo "launcher not executable"; exit 1; }
bash -n "$C/MacOS/CloneMe"
for f in "$C"/Resources/worker/*.mjs; do node --check "$f"; done
[ -f "$C/Resources/worker/agent.built.js" ] || { echo "the page's code is missing"; exit 1; }
node --check "$C/Resources/worker/agent.built.js"
[ -f "$C/Resources/AppIcon.icns" ] || { echo "icon missing"; exit 1; }
[ "$(ls "$C"/Resources/*.icns | wc -l)" -eq 1 ] || { echo "more than one icon file"; exit 1; }
grep -q "CFBundleExecutable" "$C/Info.plist" || { echo "plist incomplete"; exit 1; }
# The bundle id is the Mac's key for everything saved under it. Change it and
# every Fiverr login in the window is gone, with nothing on screen to say why.
grep -q "us.blackreaper.cloneme" "$C/Info.plist" || { echo "bundle id changed — that signs him out of Fiverr"; exit 1; }
# The worker runs from "Application Support". A path helper that cannot cope
# with the space in it serves a 500 and the window blames the port.
! grep -n "import.meta.url).pathname" "$C"/Resources/worker/*.mjs || { echo "percent-encoded path — breaks under Application Support"; exit 1; }
# And prove it, rather than trusting the grep: run the packed bridge from a
# directory whose name has a space in it. It sits inside the checkout so `ws`
# still resolves — /tmp has no node_modules above it and the check would then
# fail for the wrong reason.
S="$HERE/.packcheck with space"
rm -rf "$S"; mkdir -p "$S"; cp "$C"/Resources/worker/* "$S/"
node "$HERE/check-space-path.mjs" "$S" || { rm -rf "$S"; echo "the bridge cannot serve from a path with a space"; exit 1; }
rm -rf "$S"
echo "  ok  the bridge serves from a path with a space"
rm -rf "$T"
echo "built $OUT  ($(du -h "$OUT" | cut -f1))"

#!/bin/bash
# Build CloneMe.zip from the checkout: the worker goes into the bundle's
# Resources, the archive extracts to Clone Me.app, and the archive is then
# opened and checked the way the launcher would use it.
set -eu
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:-/tmp/claude-0/CloneMe.zip}"
RES="$HERE/app/CloneMe.app/Contents/Resources/worker"
rm -rf "$RES"; mkdir -p "$RES"
# Nothing ships without this: the Swift cannot be compiled here, so every name
# in it is checked instead. A wrong one reaches Alex as "Apple's build tools
# are broken", which is a lie the launcher cannot help telling.
node "$HERE/check-swift.mjs" "$HERE/app/CloneMe.app/Contents/Resources/Shell/main.swift"
# The page's code is rebuilt from its parts, so the bundle can never carry a
# stale one: agent.built.js is generated, never edited.
node "$HERE/worker/agent/build.mjs"
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
rm -rf "$T"
echo "built $OUT  ($(du -h "$OUT" | cut -f1))"

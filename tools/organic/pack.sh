#!/bin/bash
# Build Organic.zip from the checkout: the worker goes into the bundle's
# Resources, the archive extracts to Organic.app, and the archive is then
# opened and checked the way the launcher would use it.
set -eu
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:-/tmp/claude-0/Organic.zip}"
RES="$HERE/app/Organic.app/Contents/Resources/worker"
rm -rf "$RES"; mkdir -p "$RES"
# The crew's code is rebuilt from its parts, so the bundle can never carry a
# stale one: agent.built.js is generated, not edited.
node "$HERE/worker/agent/build.mjs"
cp "$HERE"/worker/*.mjs "$HERE"/worker/package.json "$HERE"/worker/agent.built.js "$RES/"
[ -d "$HERE/worker/skills" ] && cp -R "$HERE/worker/skills" "$RES/skills" || true
rm -f "$OUT"
( cd "$HERE/app" && zip -qr "$OUT" Organic.app -x '*.DS_Store' -x '*/node_modules/*' )
# check the archive, not the checkout
T="$(mktemp -d)"; ( cd "$T" && unzip -q "$OUT" )
C="$T/Organic.app/Contents"
[ -x "$C/MacOS/Organic" ] || { echo "launcher not executable"; exit 1; }
bash -n "$C/MacOS/Organic"
for f in "$C"/Resources/worker/*.mjs; do node --check "$f"; done
[ -f "$C/Resources/worker/agent.built.js" ] || { echo "the crew's code is missing"; exit 1; }
node --check "$C/Resources/worker/agent.built.js"
[ -f "$C/Resources/AppIcon.icns" ] || { echo "icon missing"; exit 1; }
[ "$(ls "$C"/Resources/*.icns | wc -l)" -eq 1 ] || { echo "more than one icon file"; exit 1; }
grep -q "us.blackreaper.organic<" "$C/Info.plist"
[ -f "$C/Resources/Shell/main.swift" ] || { echo "swift shell missing"; exit 1; }
rm -rf "$T"
echo "ok: $OUT ($(du -h "$OUT" | cut -f1)) — $(unzip -l "$OUT" | tail -1)"

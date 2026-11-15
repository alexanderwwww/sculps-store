#!/bin/bash
# Builds the Aquarius Chrome extension zip and proves it first. Nothing is zipped unless every check passes.
#   tools/aquarius/pack.sh <out.zip> [shotsDir]
set -eu
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$1"; SHOTS="${2:-$(mktemp -d)}"
case "$OUT" in /*) ;; *) OUT="$PWD/$OUT" ;; esac
fail() { printf 'FAIL  %s\n' "$1" >&2; exit 1; }
ok() { printf '  ok  %s\n' "$1"; }
export AQ_BUILD="${AQ_BUILD:-6}"
[ -f "$HERE/.keys.json" ] || fail "no .keys.json (feed + link keys)"
( cd "$HERE" && node --test test/wake.test.mjs >/dev/null ) || fail "wake word test"; ok "wake word parser"
( cd "$HERE" && node test/shots.mjs "$SHOTS" | grep -q "no page errors" ) || fail "the genie page has errors"; ok "genie renders: every face, suit, typing ($SHOTS)"
( cd "$HERE" && node test/ext.test.mjs "$SHOTS" ) || fail "extension e2e test"
T="$(mktemp -d)"; X="$T/Aquarius"
node "$HERE/ext/build.mjs" "$X" >/dev/null || fail "build"
# Written for Aquarius alone: no other app's name anywhere in what ships.
if grep -l -i -E "clipper|plug|ultra|gmgn|wand" -r "$X"; then fail "another app's name is in the extension"; fi
ok "no other app's name in the extension"
( cd "$T" && zip -qr "$T/aq.zip" Aquarius )
C="$T/unzipped here"; mkdir -p "$C"; ( cd "$C" && unzip -q "$T/aq.zip" )
M="$C/Aquarius"
node -e 'const m=JSON.parse(require("fs").readFileSync(process.argv[1]));if(m.manifest_version!==3||m.version_name!=="build "+process.argv[2])process.exit(1)' "$M/manifest.json" "$AQ_BUILD" || fail "manifest"
node --check "$M/content.js" || fail "content.js parse"
cp "$M/background.js" "$T/bg.mjs"; node --check "$T/bg.mjs" || fail "background.js parse"
for n in 16 32 48 128; do [ -f "$M/icon-$n.png" ] || fail "icon $n missing"; done
grep -q "mob.gardenbuddystore.workers.dev" "$M/background.js" || fail "not pointed at the live mailbox"
ok "unzipped into a path with spaces: manifest, scripts and icons check out"
cp "$T/aq.zip" "$OUT"; rm -rf "$T"
echo "built $OUT (build $AQ_BUILD)"

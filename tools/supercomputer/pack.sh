#!/bin/bash
# Builds the supercomputer zip and proves it first. Nothing is zipped unless every check passes.
#   tools/supercomputer/pack.sh [shotsDir]        (SC_BUILD=<n> SC_UPDATE_URL=<url of version.json> optional)
set -eu
HERE="$(cd "$(dirname "$0")" && pwd)"
SHOTS="${1:-$HERE/dist/shots}"
fail() { printf 'FAIL  %s\n' "$1" >&2; exit 1; }
ok() { printf '  ok  %s\n' "$1"; }
export SC_BUILD="${SC_BUILD:-1}"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
( cd "$HERE" && node --test test/unit.test.mjs >"$T/unit.log" 2>&1 ) || { cat "$T/unit.log"; fail "unit tests"; }
ok "unit tests: $(grep -E '^# pass' "$T/unit.log")"
node "$HERE/build.mjs" "$T/test-ext" --test >/dev/null || fail "test build"
( cd "$HERE" && node test/e2e.mjs "$T/test-ext" "$SHOTS" >"$T/e2e.log" 2>&1 ) || { cat "$T/e2e.log"; fail "end-to-end test"; }
ok "end-to-end on live Kraken data: $(grep -c '^  ok' "$T/e2e.log") checks, screenshots in $SHOTS"
X="$T/supercomputer"
node "$HERE/build.mjs" "$X" >/dev/null || fail "release build"
# eyes only: nothing that can trade, read an account, or click the page
if grep -l -E "/0/private|AddOrder|CancelOrder|sendorder|API-Sign|API-Key|\.click\(\)|dispatchEvent" -r "$X"; then fail "trading or clicking code in the bundle"; fi
ok "eyes only: no private API, no order call, no synthetic clicks"
if grep -l -i -E "gmgn|ultracursor|aquarius|wand|depop|127\.0\.0\.1" -r "$X"; then fail "another app's name or the test address is in the release"; fi
ok "no other app's name, no test address in the release"
( cd "$T" && zip -qr "$T/sc.zip" supercomputer )
C="$T/unzipped here"; mkdir -p "$C"; ( cd "$C" && unzip -q "$T/sc.zip" ); M="$C/supercomputer"
node -e 'const m=JSON.parse(require("fs").readFileSync(process.argv[1]));if(m.manifest_version!==3||m.version_name!=="build "+process.argv[2]||m.content_scripts[0].matches.join()!=="https://pro.kraken.com/*")process.exit(1)' "$M/manifest.json" "$SC_BUILD" || fail "manifest"
node --check "$M/content.js" || fail "content.js parse"
cp "$M/background.js" "$T/bg.mjs"; node --check "$T/bg.mjs" || fail "background.js parse"
for n in 16 32 48 128; do [ -f "$M/icon-$n.png" ] || fail "icon $n missing"; done
( cd "$HERE" && node test/release-launch.mjs "$M" "$SHOTS" ) || fail "release did not start from the zip"
ok "unzipped into a path with spaces: manifest, scripts, icons check out; it starts in Chromium"
mkdir -p "$HERE/dist"; Z="$HERE/dist/supercomputer-build-$SC_BUILD.zip"; cp "$T/sc.zip" "$Z"
printf '{"build":"%s","zip":"%s","notes":""}\n' "$SC_BUILD" "${SC_ZIP_URL:-supercomputer-build-$SC_BUILD.zip}" > "$HERE/dist/version.json"
rm -rf "$SHOTS/.profile" "$SHOTS/.release-profile"
echo "built $Z (build $SC_BUILD)"

#!/bin/bash
#
# Build the Ultra zip and check what is inside it.
#
#   tools/autotrader/pack.sh <out.zip>
#
# Order: stamp one build number -> every test must pass (formulas, storage, the
# server, the real page in a real browser) -> stage the bundle -> zip -> unzip
# under a path with a space and run the PACKED launcher the way the Mac does.
# The zip only appears at <out.zip> once every check has passed.
#
# Runs here (Linux). It cannot draw the window on a Mac; that part is only
# proven on his machine. See SPEC.md.

set -eu

HERE="$(cd "$(dirname "$0")" && pwd)"
fail() { printf 'FAIL  %s\n' "$1" >&2; exit 1; }
ok() { printf '  ok  %s\n' "$1"; }

[ $# -ge 1 ] && [ -n "$1" ] || { echo "usage: pack.sh <out.zip>" >&2; exit 2; }
case "$1" in /*) OUT="$1" ;; *) OUT="$PWD/$1" ;; esac
case "$OUT" in *.zip) ;; *) fail "the output must be a .zip: $OUT" ;; esac
mkdir -p "$(dirname "$OUT")"
rm -f "$OUT"

NAME="Ultra.app"
APP="$HERE/app/$NAME"
PLIST="$APP/Contents/Info.plist"
LAUNCHER="$APP/Contents/MacOS/ultra"
SRC="$HERE/src"
REQUIRED="server.mjs lib/exec-browser.mjs lib/chrome.mjs lib/web/gmgn-panel.mjs lib/web/probe.mjs lib/web/wallet.mjs lib/engine.mjs lib/strategy.mjs lib/rug.mjs lib/gmgn.mjs lib/exec-gmgn.mjs lib/exec-jupiter.mjs lib/solana.mjs lib/journal.mjs lib/secrets.mjs lib/rpc.mjs lib/gecko.mjs lib/net.mjs lib/feed.mjs ui/index.html ui/app.js ui/style.css ui/icon.png"

for f in "$PLIST" "$LAUNCHER" "$HERE/BUILD" "$HERE/design/AppIcon.icns"; do [ -f "$f" ] || fail "missing $f"; done
for f in $REQUIRED; do [ -f "$SRC/$f" ] || fail "src/$f is missing"; done

BUILD="$(tr -d '[:space:]' < "$HERE/BUILD")"
case "$BUILD" in ''|*[!0-9]*) fail "BUILD must be a whole number, found '$BUILD'" ;; esac
echo "Ultra build $BUILD"

WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/ultra-pack.XXXXXX")"
trap 'rm -rf "$WORKDIR"' EXIT

# ------------------------------------------------------------ 1. stamp
count() { grep -c -e "$1" "$2" || true; }
[ "$(count '<key>CFBundleVersion</key>[[:space:]]*<string>[^<]*</string>' "$PLIST")" = "1" ] || fail "Info.plist must have exactly one CFBundleVersion"
[ "$(count '<key>CFBundleShortVersionString</key>[[:space:]]*<string>[^<]*</string>' "$PLIST")" = "1" ] || fail "Info.plist must have exactly one CFBundleShortVersionString"
sed -e "s#\(<key>CFBundleVersion</key>[[:space:]]*<string>\)[^<]*\(</string>\)#\1$BUILD\2#" \
    -e "s#\(<key>CFBundleShortVersionString</key>[[:space:]]*<string>\)[^<]*\(</string>\)#\1$BUILD\2#" "$PLIST" > "$WORKDIR/Info.plist.new"
cat "$WORKDIR/Info.plist.new" > "$PLIST"
[ "$(count "<string>$BUILD</string>" "$PLIST")" -ge 2 ] || fail "Info.plist was not stamped"
bash -n "$LAUNCHER" || fail "the launcher is not valid bash"
ok "build $BUILD stamped; launcher parses"

while IFS= read -r f; do node --check "$f" || fail "node --check failed: ${f#"$HERE"/}"; done < <(find "$SRC" "$HERE/test" -type f \( -name '*.mjs' -o -name '*.js' \) | sort)
ok "every .mjs/.js parses"

# ------------------------------------------------------------ 2. every test
printf '\n== unit and server tests\n'
( cd "$HERE" && node --test test/*.test.mjs ) > "$WORKDIR/unit.log" 2>&1 || { tail -60 "$WORKDIR/unit.log"; fail "unit tests failed: nothing packed"; }
grep -E '^# (tests|pass|fail)' "$WORKDIR/unit.log"
printf '\n== the real page in a real browser\n'
( cd "$HERE" && TMPDIR="${ULTRA_TEST_TMPDIR:-/tmp}" node test/e2e.mjs ) || fail "e2e failed: nothing packed"
ok "all tests passed"

# ------------------------------------------------------------ 3. stage
STAGE="$WORKDIR/stage"
B="$STAGE/$NAME"
RES="$B/Contents/Resources"
mkdir -p "$B/Contents/MacOS" "$RES/app"
cp -p "$PLIST" "$B/Contents/Info.plist"
cp -p "$LAUNCHER" "$B/Contents/MacOS/ultra"
chmod 755 "$B/Contents/MacOS/ultra"
( cd "$SRC" && tar --exclude=.DS_Store -cf - . ) | ( cd "$RES/app" && tar -xf - )
PWCORE="$HERE/../../node_modules/playwright-core"
[ -d "$PWCORE" ] || fail "no playwright-core in the repo's node_modules: cannot ship the Chrome driver"
mkdir -p "$RES/app/node_modules" && cp -R "$PWCORE" "$RES/app/node_modules/playwright-core"
( cd "$RES/app" && node -e 'require("playwright-core")' ) || fail "the bundled playwright-core does not load"
cp -p "$HERE/design/AppIcon.icns" "$RES/AppIcon.icns"
printf '%s\n' "$BUILD" > "$RES/BUILD"
ok "bundle staged"

# ------------------------------------------------------------ 4. zip
TMPZIP="$WORKDIR/out.zip"
( cd "$STAGE" && zip -qry "$TMPZIP" "$NAME" -x '*.DS_Store' )
ok "zipped ($(du -h "$TMPZIP" | cut -f1))"

# ------------------------------------------------------------ 5. check the zip, not the checkout
CHECK="$WORKDIR/Unzip Here/check"
mkdir -p "$CHECK"
( cd "$CHECK" && unzip -q "$TMPZIP" )
TOP="$(cd "$CHECK" && find . -mindepth 1 -maxdepth 1 | sed 's#^\./##')"
[ "$TOP" = "$NAME" ] || fail "the zip must hold exactly $NAME, found: $TOP"
C="$CHECK/$NAME/Contents"
[ -x "$C/MacOS/ultra" ] || fail "the launcher is not executable inside the zip"
bash -n "$C/MacOS/ultra" || fail "the packed launcher is not valid bash"
for f in AppIcon.icns BUILD app/server.mjs app/ui/index.html app/ui/app.js app/ui/style.css app/ui/icon.png app/lib/engine.mjs app/lib/exec-gmgn.mjs app/lib/exec-jupiter.mjs app/lib/solana.mjs app/lib/exec-browser.mjs app/lib/web/gmgn-panel.mjs app/node_modules/playwright-core/package.json; do [ -s "$C/Resources/$f" ] || fail "Resources/$f missing from the zip"; done
[ "$(head -c 4 "$C/Resources/AppIcon.icns")" = "icns" ] || fail "AppIcon.icns is not an icns file"
python3 - "$C/Info.plist" "$BUILD" <<'PY' || fail "Info.plist check failed"
import plistlib, sys
p = plistlib.load(open(sys.argv[1], "rb"))
assert p["CFBundleExecutable"] == "ultra"
assert p["CFBundleVersion"] == sys.argv[2] == p["CFBundleShortVersionString"], p
assert p["CFBundlePackageType"] == "APPL"
assert p["CFBundleIconFile"] == "AppIcon"
print("  ok  Info.plist reads back (build %s, %s)" % (p["CFBundleVersion"], p["CFBundleDisplayName"]))
PY
printf '\n== the packed launcher, run the way the Mac runs it\n'
node "$HERE/test/launcher-check.mjs" "$CHECK/$NAME" || fail "the packed launcher failed its checks: nothing shipped"

mv "$TMPZIP" "$OUT"
ok "wrote $OUT ($(du -h "$OUT" | cut -f1))"

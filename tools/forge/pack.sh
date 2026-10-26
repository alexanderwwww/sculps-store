#!/bin/bash
#
# Build the SPARTAN FORGE: BATMAN zip and check what is inside it.
#
#   tools/forge/pack.sh <out.zip>
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

NAME="SPARTAN FORGE BATMAN.app"
APP="$HERE/app/$NAME"
PLIST="$APP/Contents/Info.plist"
LAUNCHER="$APP/Contents/MacOS/forge"
SRC="$HERE/src"
REQUIRED="server.mjs lib/calc.mjs lib/store.mjs lib/csv.mjs lib/time.mjs ui/index.html ui/app.js ui/style.css ui/icon.png"

for f in "$PLIST" "$LAUNCHER" "$HERE/BUILD" "$HERE/design/AppIcon.icns"; do [ -f "$f" ] || fail "missing $f"; done
for f in $REQUIRED; do [ -f "$SRC/$f" ] || fail "src/$f is missing"; done

BUILD="$(tr -d '[:space:]' < "$HERE/BUILD")"
case "$BUILD" in ''|*[!0-9]*) fail "BUILD must be a whole number, found '$BUILD'" ;; esac
echo "SPARTAN FORGE: BATMAN build $BUILD"

WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/forge-pack.XXXXXX")"
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
cp -p "$LAUNCHER" "$B/Contents/MacOS/forge"
chmod 755 "$B/Contents/MacOS/forge"
( cd "$SRC" && tar --exclude=.DS_Store -cf - . ) | ( cd "$RES/app" && tar -xf - )
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
[ -x "$C/MacOS/forge" ] || fail "the launcher is not executable inside the zip"
bash -n "$C/MacOS/forge" || fail "the packed launcher is not valid bash"
for f in AppIcon.icns BUILD app/server.mjs app/ui/index.html app/ui/app.js app/ui/style.css app/ui/icon.png app/lib/calc.mjs; do [ -s "$C/Resources/$f" ] || fail "Resources/$f missing from the zip"; done
[ "$(head -c 4 "$C/Resources/AppIcon.icns")" = "icns" ] || fail "AppIcon.icns is not an icns file"
python3 - "$C/Info.plist" "$BUILD" <<'PY' || fail "Info.plist check failed"
import plistlib, sys
p = plistlib.load(open(sys.argv[1], "rb"))
assert p["CFBundleExecutable"] == "forge"
assert p["CFBundleVersion"] == sys.argv[2] == p["CFBundleShortVersionString"], p
assert p["CFBundlePackageType"] == "APPL"
assert p["CFBundleIconFile"] == "AppIcon"
print("  ok  Info.plist reads back (build %s, %s)" % (p["CFBundleVersion"], p["CFBundleDisplayName"]))
PY
printf '\n== the packed launcher, run the way the Mac runs it\n'
node "$HERE/test/launcher-check.mjs" "$CHECK/$NAME" || fail "the packed launcher failed its checks: nothing shipped"

mv "$TMPZIP" "$OUT"
ok "wrote $OUT ($(du -h "$OUT" | cut -f1))"

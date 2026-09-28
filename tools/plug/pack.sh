#!/bin/bash
# Build Plug.zip from the checkout: the worker goes into the bundle's
# Resources, the archive extracts to Plug.app, and the archive is then
# opened and checked the way the launcher would use it.
set -eu
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:-/tmp/claude-0/Plug.zip}"
RES="$HERE/app/Plug.app/Contents/Resources/worker"
SWIFT="$HERE/app/Plug.app/Contents/Resources/Shell/main.swift"
[ -f "$SWIFT" ] || { echo "no main.swift — the bundle has no window"; exit 1; }
# Nothing ships without this: the Swift cannot be compiled here, so every name
# in it is checked instead. A wrong one reaches Alex as "Apple's build tools
# are broken", which is a lie the launcher cannot help telling.
node "$HERE/check-swift.mjs" "$SWIFT"
# The mark is his, and it is rebuilt from his artwork every time — so nobody can
# ever quietly leave another app's icon in this bundle again.
[ -f "$HERE/design/icon-source.png" ] && node "$HERE/make-icon.mjs" \
  "$HERE/design/icon-source.png" "$HERE/app/Plug.app/Contents/Resources/AppIcon.icns"
# The same artwork as a PNG, because the welcome screen carries it as a data
# url and a loadHTMLString page has no base url to reach a file beside it.
cp "$HERE/design/icon-source.png" "$HERE/app/Plug.app/Contents/Resources/AppIcon.png"
# The page's code is rebuilt from its parts, so the bundle can never carry a
# stale one: agent.built.js is generated, never edited.
node "$HERE/worker/agent/build.mjs"
# THE GATE. Nothing about plug matters if he cannot stay signed in, so this
# runs before anything else: on BOTH marketplaces, the two buttons that can
# never complete inside an embedded web view are off the page and stay off when
# it re-renders — and every other site on the web is untouched.
( cd "$HERE" && node test/signin.test.mjs )
# Vestiaire's reader, in a real browser: four-figure prices, sold badges rather
# than the word, and the authentication leg that Depop does not have.
( cd "$HERE" && node test/vestiaire.test.mjs )
# Brick three: the pass itself — the door before the shelf, a shut shop never
# reported as a quiet one, and one site being closed never stopping the other.
( cd "$HERE" && node test/pass.test.mjs )
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
/usr/bin/sed -i.bak "s/^BUNDLE_BUILD=.*/BUNDLE_BUILD=$BUILD/" "$HERE/app/Plug.app/Contents/MacOS/Plug"
rm -f "$HERE/app/Plug.app/Contents/MacOS/Plug.bak"
echo "build $BUILD"
cp "$HERE"/worker/*.mjs "$HERE"/worker/package.json "$HERE"/worker/agent.built.js "$RES/"
# The playbook ships with the app. His own copy, dropped into knowledge/ under
# the support directory, is read on top of this and wins on a name clash.
mkdir -p "$RES/knowledge"
cp "$HERE"/knowledge/*.md "$RES/knowledge/" 2>/dev/null || true
rm -f "$OUT"; mkdir -p "$(dirname "$OUT")"
( cd "$HERE/app" && zip -qr "$OUT" Plug.app -x '*.DS_Store' -x '*/node_modules/*' )
# check the archive, not the checkout
T="$(mktemp -d)"; ( cd "$T" && unzip -q "$OUT" )
C="$T/Plug.app/Contents"
[ -x "$C/MacOS/Plug" ] || { echo "launcher not executable"; exit 1; }
bash -n "$C/MacOS/Plug"
for f in "$C"/Resources/worker/*.mjs; do node --check "$f"; done
[ -f "$C/Resources/worker/agent.built.js" ] || { echo "the page's code is missing"; exit 1; }
node --check "$C/Resources/worker/agent.built.js"
[ -d "$C/Resources/worker/knowledge" ] && [ -n "$(ls -A "$C/Resources/worker/knowledge")" ] || { echo "no playbook in the bundle — it would list blind"; exit 1; }
[ -f "$C/Resources/AppIcon.icns" ] || { echo "icon missing"; exit 1; }
[ "$(ls "$C"/Resources/*.icns | wc -l)" -eq 1 ] || { echo "more than one icon file"; exit 1; }
grep -q "CFBundleExecutable" "$C/Info.plist" || { echo "plist incomplete"; exit 1; }
# The bundle id is the Mac's key for everything saved under it. Change it and
# every Fiverr login in the window is gone, with nothing on screen to say why.
grep -q "us.blackreaper.plug" "$C/Info.plist" || { echo "bundle id changed — that signs him out of Fiverr"; exit 1; }
# The worker runs from "Application Support". A path helper that cannot cope
# with the space in it serves a 500 and the window blames the port.
! grep -n "import.meta.url).pathname" "$C"/Resources/worker/*.mjs || { echo "percent-encoded path — breaks under Application Support"; exit 1; }
# And prove it, rather than trusting the grep: run the packed bridge from a
# directory whose name has a space in it. It sits inside the checkout so `ws`
# still resolves — /tmp has no node_modules above it and the check would then
# fail for the wrong reason.
S="$HERE/.packcheck with space"
rm -rf "$S"; mkdir -p "$S"; cp -R "$C"/Resources/worker/. "$S/"
node "$HERE/check-space-path.mjs" "$S" || { rm -rf "$S"; echo "the bridge cannot serve from a path with a space"; exit 1; }
rm -rf "$S"
echo "  ok  the bridge serves from a path with a space"
# Boot it. The whole reason this line exists: a build went out that died on
# launch with "cloud.knowledge is not a function", because every check here was
# a syntax check and syntax was never the problem. Nothing ships unless the
# packed worker actually runs.
# The loop, against a page that answers. The smoke test only proves the worker
# starts — which is why five builds shipped with onePass never once executed by
# anything before his Mac.
rm -rf "$T"
echo "built $OUT  ($(du -h "$OUT" | cut -f1))"

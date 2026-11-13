#!/bin/bash
# Builds "Cursor Clipper.app" into a zip, then proves it:
#   1. test/app.test.mjs (the runner against a real Chrome and a stub link)
#   2. unzips into a path with spaces and launches run.command for real
#      (real npm install, real Chrome on its own profile, stub link) and
#      waits for the heartbeat: "Cursor Clipper", build N, Chrome connected,
#      Chrome on Content Rewards' address.
# The zip is written only when every check passed.
#   tools/cursor-clipper/pack.sh <out.zip>
set -eu
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
OUT="$1"; case "$OUT" in /*) ;; *) OUT="$PWD/$OUT" ;; esac
rm -f "$OUT"
fail() { printf 'FAIL  %s\n' "$1" >&2; exit 1; }
ok() { printf '  ok  %s\n' "$1"; }

BUILD="$(grep -m1 '^BUILD=' "$HERE/src/run.command" | cut -d'"' -f2)"
echo "Cursor Clipper build $BUILD"
grep -q "CFBundleVersion</key><string>$BUILD<" "$HERE/Info.plist" || fail "Info.plist build is not $BUILD"

( cd "$HERE" && TMPDIR=/tmp node test/app.test.mjs ) || fail "app.test.mjs"
ok "runner test passed"

T="$(mktemp -d /tmp/cc-pack.XXXXXX)"
B="$T/stage/Cursor Clipper.app/Contents"
mkdir -p "$B/MacOS" "$B/Resources"
cp "$HERE/Info.plist" "$B/Info.plist"
cat > "$B/MacOS/Cursor Clipper" <<'SH'
#!/bin/bash
# The Dock icon: opens a Terminal window on the launcher inside the bundle.
HERE="$(cd "$(dirname "$0")/../Resources" && pwd)"
open -a Terminal "$HERE/run.command"
SH
cp "$HERE/src/app.mjs" "$HERE/src/package.json" "$HERE/src/run.command" "$B/Resources/"
chmod 755 "$B/MacOS/Cursor Clipper" "$B/Resources/run.command"
node "$REPO/tools/plug/make-icon.mjs" "$REPO/design/cursor-clipper/icon-1024.png" "$B/Resources/AppIcon.icns" >/dev/null || fail "icon"
( cd "$T/stage" && zip -qry "$T/cc.zip" "Cursor Clipper.app" )
ok "zipped"

# Real first launch from the unzipped copy.
C="$T/unzipped here"; mkdir -p "$C"; ( cd "$C" && unzip -q "$T/cc.zip" )
R="$C/Cursor Clipper.app/Contents/Resources"
[ -x "$R/run.command" ] && [ -x "$C/Cursor Clipper.app/Contents/MacOS/Cursor Clipper" ] || fail "launchers not executable after unzip"
bash -n "$R/run.command" || fail "run.command does not parse"
STATUS="$T/status.jsonl"
node -e '
const http=require("http"),fs=require("fs");
http.createServer(async(q,s)=>{let b="";for await(const c of q)b+=c;const w=q.url.split("/").pop();
 if(w==="status")fs.appendFileSync(process.argv[1],b+"\n");s.setHeader("content-type","application/json");s.end(w==="next"?"null":"{}");}).listen(9911);' "$STATUS" &
STUB=$!
CHROMEBIN="$(node -e 'console.log(require("playwright").chromium.executablePath())')"
cat > "$T/chrome" <<SH
#!/bin/bash
exec "$CHROMEBIN" --headless=new --no-sandbox "\$@"
SH
chmod 755 "$T/chrome"
( CC_WORK="$T/work dir" CC_PROFILE="$T/profile" CC_PORT=9912 CC_CHROME="$T/chrome" CC_LINK="http://127.0.0.1:9911/KEY" \
  timeout 150 bash "$R/run.command" > "$T/launch.log" 2>&1 ) &
LAUNCH=$!
GOT=""
for _ in $(seq 1 140); do
  if [ -s "$STATUS" ] && node -e '
    const l=require("fs").readFileSync(process.argv[1],"utf8").trim().split("\n").map(JSON.parse);
    process.exit(l.some(s=>s.app==="Cursor Clipper"&&s.build===process.argv[2]&&s.chrome===true&&/contentrewards\.com/.test(s.url||""))?0:1)' "$STATUS" "$BUILD"; then GOT=1; break; fi
  sleep 1
done
kill $LAUNCH $STUB 2>/dev/null || true; pkill -f "remote-debugging-port=9912" 2>/dev/null || true
[ -n "$GOT" ] || { tail -20 "$T/launch.log"; tail -3 "$STATUS" 2>/dev/null; fail "first launch never reported Cursor Clipper with Chrome on Content Rewards"; }
ok "first launch from the zip: installed, opened its own Chrome on Content Rewards, reported build $BUILD"
grep -qi "gmgn" "$R/app.mjs" "$R/run.command" && fail "GMGN appears in the app" || ok "no GMGN anywhere in the app"

cp "$T/cc.zip" "$OUT"
echo "built $OUT (build $BUILD)"

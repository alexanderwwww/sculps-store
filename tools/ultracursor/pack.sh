#!/bin/bash
#
# Build the ultracursor app zip, then open the zip and check what is inside it.
#
#   tools/ultracursor/pack.sh <out.zip>
#
# Order: stamp ONE build number everywhere -> every test must pass -> stage the
# bundle (run.command + src/** + AppIcon.icns in Resources) -> zip it keeping
# exec bits -> unzip into a folder whose path has a space and check the bundle
# the way his Mac will meet it. The zip only appears at <out.zip> once every
# check has passed; a failure leaves no zip behind to be mistaken for a build.
#
# Runs here (Linux), never on his Mac. Env, for tests only:
#   ULTRA_REPO           repo root (default: two levels up from this file)
#   ULTRA_ICON_PREVIEW   also write the icon's 1024px PNG to this path
#   ULTRA_TEST_TMPDIR    TMPDIR for the tests (default /tmp: Chromium crashes
#                        when TMPDIR points into the scratchpad)

set -eu

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="${ULTRA_REPO:-$(cd "$HERE/../.." && pwd)}"

fail() { printf 'FAIL  %s\n' "$1" >&2; exit 1; }
ok() { printf '  ok  %s\n' "$1"; }

if [ $# -lt 1 ] || [ -z "$1" ]; then echo "usage: pack.sh <out.zip>" >&2; exit 2; fi
case "$1" in /*) OUT="$1" ;; *) OUT="$PWD/$1" ;; esac
case "$OUT" in *.zip) ;; *) fail "the output must be a .zip: $OUT" ;; esac
mkdir -p "$(dirname "$OUT")"
# A zip left from an earlier run must never pass for this one.
rm -f "$OUT"

# pack.test.mjs runs pack.sh on a copy of this folder; that copy has no
# pack.test.mjs of its own, but never let a mistake there recurse forever.
DEPTH="${ULTRA_PACK_DEPTH:-0}"
[ "$DEPTH" -lt 2 ] || fail "pack.sh started itself twice over (ULTRA_PACK_DEPTH=$DEPTH)"
export ULTRA_PACK_DEPTH=$((DEPTH + 1))

SRC="$HERE/src"
APP="$HERE/app/ultracursor.app"
RUNCMD="$HERE/run.command"
PLIST="$APP/Contents/Info.plist"
LAUNCHER="$APP/Contents/MacOS/ultracursor"
ICON_SRC="$REPO/design/ultracursor/icon-1024.png"
MAKE_ICON="$REPO/tools/plug/make-icon.mjs"
PWCORE="$REPO/node_modules/playwright-core"

# What SPEC.md says the runner is made of. A missing one is a runner that dies
# on his Mac at its first import, so it is checked before anything else.
REQUIRED="ultra.mjs cloud.mjs ui.mjs overlay.js signals.mjs q4.mjs report.mjs
sites/adlibrary.mjs sites/tiktok.mjs sites/instagram.mjs sites/trends.mjs sites/stores.mjs
skills/q4.md package.json"

for f in "$RUNCMD" "$PLIST" "$LAUNCHER" "$HERE/BUILD" "$ICON_SRC" "$MAKE_ICON"; do
  [ -f "$f" ] || fail "missing $f"
done
for f in $REQUIRED; do
  [ -f "$SRC/$f" ] || fail "src/$f is missing (SPEC.md lists it)"
done
[ -d "$PWCORE" ] || fail "no playwright-core in $REPO/node_modules: cannot prove the bundle loads"

BUILD="$(tr -d '[:space:]' < "$HERE/BUILD")"
case "$BUILD" in ''|*[!0-9]*) fail "BUILD must be a whole number, found '$BUILD'" ;; esac
echo "ultracursor build $BUILD"

WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/ultracursor-pack.XXXXXX")"
trap 'rm -rf "$WORKDIR"' EXIT

# ------------------------------------------------------------ 1. stamp
#
# One number, everywhere: run.command's BUILD=, the plist's CFBundleVersion and
# CFBundleShortVersionString. ultra.mjs gets it from run.command as ULTRA_BUILD.
# Each anchor must exist exactly once: a replace that matches nothing fails
# silently, and that is how a build ships announcing the wrong number.
count() { grep -c -e "$1" "$2" || true; }
[ "$(count '^BUILD="[^"]*"$' "$RUNCMD")" = "1" ] || fail "run.command must have exactly one BUILD=\"...\" line"
[ "$(count '<key>CFBundleVersion</key>[[:space:]]*<string>[^<]*</string>' "$PLIST")" = "1" ] \
  || fail "Info.plist must have exactly one CFBundleVersion line"
[ "$(count '<key>CFBundleShortVersionString</key>[[:space:]]*<string>[^<]*</string>' "$PLIST")" = "1" ] \
  || fail "Info.plist must have exactly one CFBundleShortVersionString line"
# cat > file keeps the file's own mode (run.command stays executable).
sed -e "s/^BUILD=\"[^\"]*\"\$/BUILD=\"$BUILD\"/" "$RUNCMD" > "$WORKDIR/run.command.new"
cat "$WORKDIR/run.command.new" > "$RUNCMD"
sed -e "s#\(<key>CFBundleVersion</key>[[:space:]]*<string>\)[^<]*\(</string>\)#\1$BUILD\2#" \
    -e "s#\(<key>CFBundleShortVersionString</key>[[:space:]]*<string>\)[^<]*\(</string>\)#\1$BUILD\2#" \
    "$PLIST" > "$WORKDIR/Info.plist.new"
cat "$WORKDIR/Info.plist.new" > "$PLIST"
grep -q "^BUILD=\"$BUILD\"\$" "$RUNCMD" || fail "run.command was not stamped"
[ "$(count "<string>$BUILD</string>" "$PLIST")" -ge 2 ] || fail "Info.plist was not stamped"
bash -n "$RUNCMD" || fail "run.command is not valid bash"
bash -n "$LAUNCHER" || fail "MacOS/ultracursor is not valid bash"
ok "build $BUILD stamped into run.command and Info.plist"

# Syntax first: cheap, and a test run against a file that cannot parse wastes
# minutes saying so.
while IFS= read -r f; do
  node --check "$f" || fail "node --check failed: ${f#"$HERE"/}"
done < <(find "$SRC" -type f \( -name '*.mjs' -o -name '*.js' \) ! -path '*/node_modules/*' | sort)
ok "every src .mjs/.js parses"

# ------------------------------------------------------------ 2. every test
TEST_TMP="${ULTRA_TEST_TMPDIR:-/tmp}"
TO=()
if command -v timeout >/dev/null 2>&1; then TO=(timeout 900); fi
RAN=0
TESTS=()
for t in "$HERE"/test/*.test.mjs; do [ -f "$t" ] && TESTS+=("$t"); done
[ -f "$HERE/test/e2e.mjs" ] && TESTS+=("$HERE/test/e2e.mjs")
[ "${#TESTS[@]}" -gt 0 ] || fail "no tests in test/: nothing ships that has not run"
for t in "${TESTS[@]}"; do
  name="${t#"$HERE"/}"
  printf '\n== %s\n' "$name"
  if ( cd "$HERE" && TMPDIR="$TEST_TMP" ${TO[@]+"${TO[@]}"} node "$t" ); then
    RAN=$((RAN + 1))
  else
    fail "$name failed: nothing packed"
  fi
done
echo
ok "$RAN test file(s) passed"

# ------------------------------------------------------------ 3. stage
STAGE="$WORKDIR/stage"
B="$STAGE/ultracursor.app"
RES="$B/Contents/Resources"
mkdir -p "$B/Contents/MacOS" "$RES"
cp -p "$PLIST" "$B/Contents/Info.plist"
cp -p "$LAUNCHER" "$B/Contents/MacOS/ultracursor"
cp -p "$RUNCMD" "$RES/run.command"
chmod 755 "$B/Contents/MacOS/ultracursor" "$RES/run.command"
# src/** goes in whole: sites/ and skills/ included, node_modules never.
( cd "$SRC" && tar --exclude=node_modules --exclude=.DS_Store -cf - . ) | ( cd "$RES" && tar -xf - )
for n in run.command AppIcon.icns; do
  [ ! -e "$SRC/$n" ] || fail "src/$n would collide with the bundle's own $n"
done

# The icon, rebuilt from his artwork every time with plug's make-icon.mjs.
# make-icon needs Pillow; find a python3 that has it and put it first on PATH
# for that one command only.
PY=""
for p in python3 /usr/bin/python3 /usr/local/bin/python3 /opt/homebrew/bin/python3; do
  if command -v "$p" >/dev/null 2>&1 && "$p" -c 'import PIL' >/dev/null 2>&1; then PY="$(command -v "$p")"; break; fi
done
[ -n "$PY" ] || fail "no python3 with Pillow here: make-icon.mjs needs it"
mkdir -p "$WORKDIR/py"
ln -s "$PY" "$WORKDIR/py/python3"
# The art is a full-bleed squircle; inset to 820 of 1024 (102..922), the size
# the Wand's and XUGC's Dock icons already sit at, so it matches beside them.
PATH="$WORKDIR/py:$PATH" PLUG_ICON_INSET=0.801 node "$MAKE_ICON" "$ICON_SRC" "$RES/AppIcon.icns" \
  || fail "make-icon.mjs failed"
ok "AppIcon.icns built"

# ------------------------------------------------------------ 4. zip
TMPZIP="$WORKDIR/ultracursor.zip"
( cd "$STAGE" && zip -qry "$TMPZIP" ultracursor.app -x '*.DS_Store' -x '*/node_modules/*' )
ok "zipped ($(du -h "$TMPZIP" | cut -f1))"

# ------------------------------------------------------------ 5. check the zip, not the checkout
#
# Unzipped under a path with a space in it, because on his Mac the runner lives
# under "Application Support" and a space has broken an app of his before.
CHECK="$WORKDIR/Application Support/check"
mkdir -p "$CHECK"
( cd "$CHECK" && unzip -q "$TMPZIP" )
TOP="$(cd "$CHECK" && find . -mindepth 1 -maxdepth 1 | sed 's#^\./##' | tr '\n' ' ')"
[ "$TOP" = "ultracursor.app " ] || fail "the zip must hold exactly ultracursor.app, found: $TOP"
C="$CHECK/ultracursor.app/Contents"
R="$C/Resources"

[ -x "$C/MacOS/ultracursor" ] || fail "MacOS/ultracursor is not executable inside the zip"
[ -x "$R/run.command" ] || fail "Resources/run.command is not executable inside the zip"
bash -n "$C/MacOS/ultracursor" || fail "packed MacOS/ultracursor is not valid bash"
bash -n "$R/run.command" || fail "packed run.command is not valid bash"
ok "MacOS/ultracursor and run.command are executable and parse"

# The plist, read as a plist rather than grepped.
python3 - "$C/Info.plist" "$BUILD" <<'PY' || fail "Info.plist check failed"
import plistlib, sys
p = plistlib.load(open(sys.argv[1], "rb"))
build = sys.argv[2]
want = {
    "CFBundleName": "ultracursor",
    "CFBundleDisplayName": "ultracursor",
    "CFBundleExecutable": "ultracursor",
    "CFBundleIdentifier": "com.blackreaper.ultracursor",
    "CFBundleIconFile": "AppIcon",
    "CFBundlePackageType": "APPL",
    "CFBundleVersion": build,
    "CFBundleShortVersionString": build,
}
bad = [f"{k}={p.get(k)!r} (want {v!r})" for k, v in want.items() if p.get(k) != v]
if bad:
    print("Info.plist: " + "; ".join(bad))
    sys.exit(1)
PY
ok "Info.plist names ultracursor, id com.blackreaper.ultracursor, build $BUILD"

[ "$(grep -c "^BUILD=\"$BUILD\"\$" "$R/run.command")" = "1" ] || fail "packed run.command does not say BUILD=\"$BUILD\""
[ "$(tr -d '[:space:]' < "$HERE/BUILD")" = "$BUILD" ] || fail "BUILD changed during the pack"
ok "build $BUILD in BUILD, run.command and Info.plist"

# Every src file, byte for byte, and nothing in Resources that nobody put there.
N=0
while IFS= read -r rel; do
  cmp -s "$SRC/$rel" "$R/$rel" || fail "src/$rel is missing or different inside the zip"
  N=$((N + 1))
done < <(cd "$SRC" && find . -type f ! -path '*/node_modules/*' ! -name .DS_Store | sed 's#^\./##' | sort)
while IFS= read -r rel; do
  case "$rel" in run.command|AppIcon.icns) continue ;; esac
  [ -f "$SRC/$rel" ] || fail "unexpected file in the bundle: Resources/$rel"
done < <(cd "$R" && find . -type f | sed 's#^\./##' | sort)
unzip -l "$TMPZIP" | grep -q node_modules && fail "node_modules got into the zip"
ok "all $N src files present and identical, nothing extra"

while IFS= read -r f; do
  node --check "$f" || fail "node --check failed inside the zip: ${f#"$C"/}"
done < <(find "$R" -type f \( -name '*.mjs' -o -name '*.js' \) | sort)
ok "node --check passes on every .mjs/.js inside the zip"

# Imports. The tree here sits under the repo's node_modules, so a package
# nobody listed in package.json still resolves here and dies on his Mac,
# where only package.json is installed. Every relative import must be in the
# bundle, every bare one a Node builtin or a listed dependency, and no path may
# be built with .pathname (it percent-encodes the space in Application Support).
node - "$R" <<'JS' || fail "import check failed"
const fs = require("fs"), path = require("path"), { builtinModules } = require("module");
const root = process.argv[2];
const deps = new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).dependencies || {}));
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const bad = [];
for (const file of walk(root).filter((f) => f.endsWith(".mjs"))) {
  const rel = path.relative(root, file);
  const text = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const specs = [];
  for (const re of [
    /^\s*(?:import|export)\b[^'"`;]*?\bfrom\s*["']([^"']+)["']/gm,
    /^\s*import\s*["']([^"']+)["']/gm,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ]) for (const m of text.matchAll(re)) specs.push(m[1]);
  for (const m of text.matchAll(/new\s+URL\(\s*["'](\.{1,2}\/[^"']+)["']\s*,\s*import\.meta\.url\s*\)/g)) specs.push(m[1]);
  for (const s of specs) {
    if (s.startsWith(".") || s.startsWith("/")) {
      const target = path.resolve(path.dirname(file), s);
      if (!fs.existsSync(target)) bad.push(`${rel}: "${s}" is not in the bundle`);
    } else if (s.startsWith("node:") || builtinModules.includes(s)) {
      // builtin
    } else {
      const name = s.startsWith("@") ? s.split("/").slice(0, 2).join("/") : s.split("/")[0];
      if (!deps.has(name)) bad.push(`${rel}: "${s}" is not a dependency in package.json`);
    }
  }
  if (/import\.meta\.url\s*\)+\s*\.pathname/.test(text)) bad.push(`${rel}: builds a path with .pathname (use fileURLToPath)`);
}
if (bad.length) { console.log(bad.join("\n")); process.exit(1); }
JS
ok "every import resolves inside the bundle or package.json"

# And load them for real, from the space path, with ONLY what package.json
# installs on his Mac (playwright-core). ultra.mjs is the entry and would start
# the runner, so it is parsed above but not loaded here.
mkdir -p "$R/node_modules"
ln -s "$PWCORE" "$R/node_modules/playwright-core"
node - "$R" <<'JS' || fail "a module did not load from the packed bundle"
const fs = require("fs"), path = require("path"), { pathToFileURL } = require("url");
const root = process.argv[2];
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.name === "node_modules" ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const mods = walk(root).filter((f) => f.endsWith(".mjs") && path.relative(root, f) !== "ultra.mjs").sort();
const timer = setTimeout(() => { console.log("a module hung while loading"); process.exit(1); }, 20000);
(async () => {
  for (const f of mods) {
    try { await import(pathToFileURL(f).href); }
    catch (e) { console.log(`${path.relative(root, f)}: ${e.message}`); process.exit(1); }
  }
  clearTimeout(timer);
  console.log(`  ok  ${mods.length} module(s) load from "${root.includes(" ") ? "a path with a space" : root}"`);
  process.exit(0);
})();
JS
rm -rf "$R/node_modules"

# The icon: a real icns, every size Apple reads, the art at 820 of 1024.
"$PY" - "$R/AppIcon.icns" "${ULTRA_ICON_PREVIEW:-}" <<'PY' || fail "AppIcon.icns check failed"
import struct, sys
data = open(sys.argv[1], "rb").read()
assert data[:4] == b"icns", "not an icns"
assert struct.unpack(">I", data[4:8])[0] == len(data), "icns length field is wrong"
want = {"ic10": 1024, "ic14": 512, "ic13": 256, "ic09": 512, "ic08": 256, "ic07": 128, "ic12": 64, "ic11": 32}
seen, i, big = {}, 8, None
while i < len(data):
    t = data[i:i + 4].decode("latin1"); n = struct.unpack(">I", data[i + 4:i + 8])[0]
    png = data[i + 8:i + n]
    assert png[:8] == b"\x89PNG\r\n\x1a\n", f"{t} is not a PNG"
    w, h = struct.unpack(">II", png[16:24])
    seen[t] = (w, h)
    if t == "ic10": big = png
    i += n
for t, s in want.items():
    assert seen.get(t) == (s, s), f"{t}: {seen.get(t)} (want {s}x{s})"
if sys.argv[2]:
    open(sys.argv[2], "wb").write(big)
import io
from PIL import Image
a = Image.open(io.BytesIO(big)).convert("RGBA").split()[3]
box = a.point(lambda v: 255 if v >= 128 else 0).getbbox()
assert box and all(abs(x - y) <= 2 for x, y in zip(box, (102, 102, 922, 922))), f"art bbox {box}, want about (102,102,922,922)"
print(f"  ok  icon art sits at {box} of 1024")
PY
[ "$(find "$R" -maxdepth 1 -name '*.icns' | wc -l)" -eq 1 ] || fail "more than one .icns in Resources"
ok "AppIcon.icns has all 8 sizes"

# The Dock icon itself: run the packed launcher with a stand-in for macOS's
# open, and check it asks Terminal to run the packed run.command.
mkdir -p "$WORKDIR/fakebin"
cat > "$WORKDIR/fakebin/open" <<'SH'
#!/bin/bash
printf '%s\n' "$@" > "$OPEN_LOG"
SH
chmod +x "$WORKDIR/fakebin/open"
OPEN_LOG="$WORKDIR/open.log" PATH="$WORKDIR/fakebin:$PATH" "$C/MacOS/ultracursor" || fail "the launcher exited non-zero"
printf -- '-a\nTerminal\n%s\n' "$R/run.command" | cmp -s - "$WORKDIR/open.log" \
  || fail "the launcher asked for: $(tr '\n' ' ' < "$WORKDIR/open.log")"
ok "the Dock icon opens Terminal on the packed run.command"

mv "$TMPZIP" "$OUT"
echo
echo "built $OUT  (build $BUILD, $(du -h "$OUT" | cut -f1), $(unzip -l "$OUT" | tail -1 | awk '{print $2}') files)"

#!/bin/bash
# Publish a live update: every program file in src/ goes to R2 as ul-runtime.json with its sha256, at build <n>.
# Ultra picks it up within 2 minutes if <n> is newer than what it runs. Run the tests first (pack.sh does).
#   tools/autotrader/publish-live.sh <n>        needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment
set -eu
HERE="$(cd "$(dirname "$0")" && pwd)"
N="${1:?usage: publish-live.sh <build number>}"
case "$N" in ''|*[!0-9]*) echo "build must be a whole number" >&2; exit 2 ;; esac
OUT="$(mktemp -d)/ul-runtime.json"
node -e '
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const src = process.argv[1], n = Number(process.argv[2]), files = {};
const walk = (d, rel = "") => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f), r = rel ? rel + "/" + f : f; if (fs.statSync(p).isDirectory()) walk(p, r); else if (/^(server\.mjs|lib\/[\w-]+\.mjs|ui\/(index\.html|app\.js|style\.css|icon\.png))$/.test(r)) { const b = fs.readFileSync(p); files[r] = { b64: b.toString("base64"), sha256: crypto.createHash("sha256").update(b).digest("hex") }; } } };
walk(src);
fs.writeFileSync(process.argv[3], JSON.stringify({ build: n, at: new Date().toISOString(), files }));
console.log(Object.keys(files).length + " files, build " + n);
' "$HERE/src" "$N" "$OUT"
cd "$HERE/../.."
npx wrangler r2 object put "gardenbuddy-media/ul-runtime.json" --file "$OUT" --content-type application/json --remote
echo "published build $N"

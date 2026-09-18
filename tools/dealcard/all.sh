#!/bin/bash
#
# One deal card per product, priced from the database.
#
# Run it after any price change and every card is right again — which is the
# whole reason these are drawn instead of generated.
#
#   set -a; . ./.dev.vars; set +a
#   bash tools/dealcard/all.sh <photo-dir> <out-dir>
set -eu
PHOTOS="${1:-}"
OUT="${2:-./cards}"
mkdir -p "$OUT"

node --input-type=module -e '
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const [s] = await sql`select id from stores where slug=${"reaper"}`;
const rows = await sql`select p.handle, p.title,
    min(v.price_cents)::int as price,
    max(coalesce(v.compare_at_cents, 0))::int as compare
  from products p join variants v on v.product_id = p.id
  where p.store_id = ${s.id} and p.status = ${"active"}
  group by p.handle, p.title order by p.handle`;
for (const r of rows) console.log([r.handle, r.title, r.price, r.compare].join("\t"));
' | while IFS=$'\t' read -r handle title price compare; do
  photo="$PHOTOS/$handle.jpg"
  [ -f "$photo" ] || { echo "skip $handle (no $photo)"; continue; }
  python3 tools/dealcard/make.py \
    --photo "$photo" --out "$OUT/$handle.jpg" \
    --title "$title" --price "$price" --compare "$compare" \
    --ribbon "LIMITED TIME"
done

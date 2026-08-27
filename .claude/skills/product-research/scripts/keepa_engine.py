#!/usr/bin/env python3
"""
Keepa product-research engine — the autonomous version.

Keepa is Amazon's data layer: real sales-rank history, price history, and
rank-DROP velocity (a rank drop = a unit sold). Its API answers from this
environment (tested: api.keepa.com -> 200). With a key, this script does real
product discovery from here — no logins to bypass, no IP walls.

Get a key: keepa.com/#!api  (~€19/mo, cancel anytime).
Run in the Higgsfield sandbox:
    KEEPA_KEY=xxxx python3 keepa_engine.py --category home --min-price 80 --max-price 350

What it does:
  1. Product Finder query -> products in a category, filtered by price band,
     sorted by 30-day sales-rank DROPS (the real "selling fast right now" signal).
  2. For each hit, pulls rank + price history to compute a velocity score and
     flag whether the rank is RISING (accelerating) vs flat.
  3. Prints a ranked shortlist: title, price, est. monthly sales, velocity, ASIN.

This is the "7-14 day mover" data the free sources can't give. Keepa tracks it.
"""
import os, sys, json, gzip, io, urllib.request, urllib.parse, argparse

KEY = os.environ.get("KEEPA_KEY", "")
BASE = "https://api.keepa.com"

# Amazon US category node ids (domain=1). Extend as needed.
CATS = {
    "home":    1055398,   # Home & Kitchen
    "health":  3760901,   # Health & Household
    "sports":  3375251,   # Sports & Outdoors
    "patio":   2972638011,# Patio, Lawn & Garden
    "pets":    2619533011,# Pet Supplies
    "toys":    165793011, # Toys & Games
    "beauty":  3760911,   # Beauty & Personal Care
}

def _get(path, params):
    params["key"] = KEY
    url = f"{BASE}/{path}?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    raw = urllib.request.urlopen(req, timeout=40).read()
    try:
        raw = gzip.GzipFile(fileobj=io.BytesIO(raw)).read()
    except OSError:
        pass
    return json.loads(raw)

def find(category, min_price, max_price, limit=40):
    """Product Finder: category, price band, sorted by 30d sales-rank drops."""
    node = CATS.get(category, category)
    selection = {
        "categories_include": [int(node)],
        "current_AMAZON_gte": int(min_price * 100),   # price in cents
        "current_AMAZON_lte": int(max_price * 100),
        "salesRankDrops30_gte": 50,                    # >=50 sales in 30d
        "sort": [["salesRankDrops30", "desc"]],
        "perPage": limit, "page": 0,
    }
    res = _get("query", {"domain": 1, "selection": json.dumps(selection)})
    return res.get("asinList", [])

def detail(asins):
    if not asins: return []
    res = _get("product", {"domain": 1, "asin": ",".join(asins[:100]),
                            "stats": 90, "history": 0})
    out = []
    for p in res.get("products", []):
        st = p.get("stats", {}) or {}
        drops30 = st.get("salesRankDrops30", 0)
        drops90 = st.get("salesRankDrops90", 0)
        price = (st.get("current", [None])[0] or 0) / 100 if st.get("current") else 0
        # rising if the 30d rate outpaces the 90d rate (accelerating sales)
        rising = (drops30 * 3) > drops90 and drops90 > 0
        out.append({
            "asin": p.get("asin"), "title": (p.get("title") or "")[:70],
            "price": round(price, 2), "sales30": drops30, "sales90": drops90,
            "rising": rising,
        })
    out.sort(key=lambda r: -r["sales30"])
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--category", default="home")
    ap.add_argument("--min-price", type=float, default=80)
    ap.add_argument("--max-price", type=float, default=350)
    a = ap.parse_args()
    if not KEY:
        print("Set KEEPA_KEY. Get one at keepa.com/#!api (~€19/mo)."); sys.exit(1)
    asins = find(a.category, a.min_price, a.max_price)
    rows = detail(asins)
    print(f"\n{'RISE':4} {'SALES/30d':>9} {'PRICE':>8}  ASIN         TITLE")
    for r in rows:
        flag = "^^" if r["rising"] else "  "
        print(f"{flag:4} {r['sales30']:>9} {r['price']:>8}  {r['asin']}  {r['title']}")
    print(f"\n{len(rows)} products · category={a.category} · ${a.min_price:.0f}-{a.max_price:.0f} · sorted by 30-day sales velocity")
    print("^^ = sales accelerating (30d rate > 90d rate) = rising NOW")

if __name__ == "__main__":
    main()

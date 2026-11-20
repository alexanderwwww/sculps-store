"""Pulls every executed trade of each round from data-api.polymarket.com/v2/trades?condition=<conditionId>&limit=1000(&cursor=..)
and aggregates them into 5-second buckets -> data/poly_trades5s_<coin>.csv. Resumable.
Real response (checked): {"data":[{side:"BUY"|"SELL", outcome:"Up"|"Down", price, size, timestamp(unix s), ...}], "pagination":{has_more,next_cursor}}
One row per transaction; `side` is the side of the listed wallet (about 80% BUY in samples).
Row: start, sec (bucket start, seconds from round start, -60..355), token (up/down), n, shares, vwap, last, min, max,
buy_n, buy_vwap, sell_n, sell_vwap.   buy_vwap ~ what buyers paid (near the ask), sell_vwap ~ what sellers got (near the bid).
Usage: fetch_trades.py <coin> <days> [threads]"""
import sys, os, csv, time
from concurrent.futures import ThreadPoolExecutor
from lib import get_json, DATA
coin, days = sys.argv[1], float(sys.argv[2]); threads = int(sys.argv[3]) if len(sys.argv) > 3 else 6
D = os.path.join(os.path.dirname(__file__), "..", "data")
out = os.path.join(D, f"poly_trades5s_{coin}.csv")
done = set()
if os.path.exists(out):
    with open(out) as f:
        next(f, None)
        for line in f: done.add(int(line.split(",", 1)[0]))
cut = time.time() - days * 86400
todo = [(int(r["start"]), r["condition_id"]) for r in csv.DictReader(open(os.path.join(D, f"rounds_{coin}.csv")))
        if int(r["start"]) >= cut and r["condition_id"] and r["outcome"] and int(r["start"]) not in done]
todo.sort(reverse=True)
def one(a):
    s, c = a; tr = []; cur = None
    try:
        for _ in range(60):
            d = get_json(f"{DATA}/trades?condition={c}&limit=1000" + (f"&cursor={cur}" if cur else ""), tries=5, timeout=30)
            tr += d["data"]; cur = d["pagination"].get("next_cursor")
            if not d["pagination"].get("has_more") or not cur: break
        else: return s, None, "too many pages"
    except Exception as e: return s, None, str(e)
    b = {}
    for x in tr:
        sec = x["timestamp"] - s
        if sec < -60 or sec >= 360: continue
        k = (sec // 5 * 5, x["outcome"].lower()); b.setdefault(k, []).append((x["timestamp"], x["price"], x["size"], x["side"]))
    rows = []
    for (sec, tok), v in sorted(b.items()):
        v.sort(key=lambda z: z[0])  # API order is newest first; ties inside one second keep API order reversed
        sh = sum(z[2] for z in v); bu = [z for z in v if z[3] == "BUY"]; se = [z for z in v if z[3] == "SELL"]
        vw = lambda q: round(sum(z[1] * z[2] for z in q) / sum(z[2] for z in q), 4) if q and sum(z[2] for z in q) > 0 else ""
        rows.append([s, sec, tok, len(v), round(sh, 2), vw(v), v[-1][1], min(z[1] for z in v), max(z[1] for z in v), len(bu), vw(bu), len(se), vw(se)])
    return s, rows, len(tr)
f = open(out, "a", newline=""); w = csv.writer(f)
if not done: w.writerow(["start","sec","token","n","shares","vwap","last","min","max","buy_n","buy_vwap","sell_n","sell_vwap"])
n = fail = 0; t0 = time.time()
with ThreadPoolExecutor(threads) as ex:
    for s, rows, info in ex.map(one, todo):
        n += 1
        if rows is None: fail += 1; print("FAIL", s, info, flush=True); continue
        if not rows: w.writerow([s, "", "", 0, "", "", "", "", "", "", "", "", ""])
        w.writerows(rows)
        if n % 200 == 0: f.flush(); print(coin, n, "/", len(todo), "fail", fail, f"{n/(time.time()-t0):.1f}/s", flush=True)
print(coin, "DONE", n, "fail", fail, flush=True)

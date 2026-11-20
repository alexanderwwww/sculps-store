"""For each round in data/rounds_<coin>.csv (newest <days> days) pulls the Up token price history from
clob.polymarket.com/prices-history?market=<up_token>&startTs=<start-60>&endTs=<start+330>&fidelity=1
and appends to data/poly_prices_<coin>.csv as rows start,t,sec,p (sec = t - start). Resumable.
Real response (checked): {"history":[{"t":unix_s,"p":price}, ...]}, about one point per minute (fidelity=1 is the finest).
Usage: fetch_poly_prices.py <coin> <days> [threads]"""
import sys, os, csv, time
from concurrent.futures import ThreadPoolExecutor
from lib import get_json, CLOB
coin, days = sys.argv[1], float(sys.argv[2]); threads = int(sys.argv[3]) if len(sys.argv) > 3 else 12
D = os.path.join(os.path.dirname(__file__), "..", "data")
out = os.path.join(D, f"poly_prices_{coin}.csv")
done = set()
if os.path.exists(out):
    with open(out) as f:
        next(f, None)
        for line in f: done.add(int(line.split(",", 1)[0]))
cut = time.time() - days * 86400
todo = [(int(r["start"]), r["up_token"]) for r in csv.DictReader(open(os.path.join(D, f"rounds_{coin}.csv")))
        if int(r["start"]) >= cut and r["up_token"] and r["outcome"] and int(r["start"]) not in done]
todo.sort(reverse=True)
def one(a):
    s, tok = a
    try: return s, get_json(f"{CLOB}/prices-history?market={tok}&startTs={s-60}&endTs={s+330}&fidelity=1", tries=5, timeout=20).get("history", [])
    except Exception as e: return s, None
f = open(out, "a", newline=""); w = csv.writer(f)
if not done: w.writerow(["start", "t", "sec", "p"])
n = fail = empty = 0; t0 = time.time()
with ThreadPoolExecutor(threads) as ex:
    for s, h in ex.map(one, todo):
        n += 1
        if h is None: fail += 1; continue
        if not h: empty += 1; w.writerow([s, "", "", ""]); continue
        for x in h: w.writerow([s, x["t"], x["t"] - s, x["p"]])
        if n % 500 == 0: f.flush(); print(coin, n, "/", len(todo), "fail", fail, "empty", empty, f"{n/(time.time()-t0):.1f}/s", flush=True)
print(coin, "DONE", n, "fail", fail, "empty", empty, flush=True)

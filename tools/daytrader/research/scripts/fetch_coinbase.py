"""Downloads 1-minute candles from Coinbase Exchange public API into data/coinbase_<coin>_1m.csv.
Real response (checked 2026-11-20): JSON array, NEWEST FIRST, each row [time, low, high, open, close, volume],
time = candle open in unix seconds UTC, max 300 rows per call. Minutes with no trade are simply absent.
Usage: fetch_coinbase.py <days>"""
import sys, os, csv, time
from concurrent.futures import ThreadPoolExecutor
from lib import get_json, COINS
days = int(sys.argv[1]) if len(sys.argv) > 1 else 120
D = os.path.join(os.path.dirname(__file__), "..", "data")
end = int(time.time()) // 60 * 60 - 60          # last fully closed minute
begin = end - days * 86400
def chunk(args):
    prod, a = args
    b = min(a + 299 * 60, end)
    return get_json(f"https://api.exchange.coinbase.com/products/{prod}/candles?granularity=60&start={a}&end={b}")
for coin, prod in COINS.items():
    starts = list(range(begin, end + 1, 300 * 60))
    rows = {}
    with ThreadPoolExecutor(4) as ex:
        for res in ex.map(chunk, [(prod, a) for a in starts]):
            for t, lo, hi, op, cl, vol in res:
                if begin <= t <= end: rows[t] = (t, op, hi, lo, cl, vol)
    ts = sorted(rows)
    with open(os.path.join(D, f"coinbase_{coin}_1m.csv"), "w", newline="") as f:
        w = csv.writer(f); w.writerow(["time", "open", "high", "low", "close", "volume"])
        for t in ts: w.writerow(rows[t])
    exp = (end - begin) // 60 + 1
    print(coin, "rows", len(ts), "expected", exp, "missing", exp - len(ts), "from", ts[0], "to", ts[-1], flush=True)

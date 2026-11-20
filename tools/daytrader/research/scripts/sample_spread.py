"""Polls the live CLOB order book of the current 5-minute round for BTC/ETH/SOL (Up and Down tokens)
and appends best bid/ask/sizes to data/spread_samples.csv. Usage: sample_spread.py <minutes>"""
import sys, time, json, csv, os, threading
from concurrent.futures import ThreadPoolExecutor
from lib import get_json, GAMMA, CLOB
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "spread_samples.csv")
mins = float(sys.argv[1]) if len(sys.argv) > 1 else 10
toks = {}
def tokens(coin, start):
    k = (coin, start)
    if k not in toks:
        m = get_json(f"{GAMMA}/events?slug={coin}-updown-5m-{start}")[0]["markets"][0]
        toks[k] = json.loads(m["clobTokenIds"])
    return toks[k]
def top(tok):
    b = get_json(f"{CLOB}/book?token_id={tok}", tries=2, timeout=10)
    bids = [(float(x["price"]), float(x["size"])) for x in b.get("bids", [])]
    asks = [(float(x["price"]), float(x["size"])) for x in b.get("asks", [])]
    bb = max(bids) if bids else (None, None); ba = min(asks) if asks else (None, None)
    def cost(levels, usd):  # average price to fill `usd` dollars walking the asks
        need, sh = usd, 0.0
        for p, s in sorted(levels):
            take = min(need, p * s); sh += take / p; need -= take
            if need <= 1e-9: return usd / sh
        return None
    return bb[0], bb[1], ba[0], ba[1], cost(asks, 10), cost(asks, 100), b.get("tick_size"), b.get("timestamp")
new = not os.path.exists(OUT)
f = open(OUT, "a", newline=""); w = csv.writer(f)
if new: w.writerow(["poll_ts","coin","round_start","sec_into_round","side","best_bid","bid_size","best_ask","ask_size","avg_ask_fill_10usd","avg_ask_fill_100usd","tick_size","book_ts_ms"])
end = time.time() + mins * 60
ex = ThreadPoolExecutor(6)
while time.time() < end:
    t0 = time.time(); start = int(t0) // 300 * 300
    jobs = []
    for coin in ("btc", "eth", "sol"):
        try: up, dn = tokens(coin, start)
        except Exception as e: continue
        jobs += [(coin, "up", ex.submit(top, up)), (coin, "down", ex.submit(top, dn))]
    for coin, side, fu in jobs:
        try: r = fu.result()
        except Exception as e: continue
        w.writerow([round(t0, 2), coin, start, round(t0 - start, 1), side, *r])
    f.flush()
    time.sleep(max(0, 3 - (time.time() - t0)))

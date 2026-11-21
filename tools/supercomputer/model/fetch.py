"""Fetch months of real 1-minute candles for the training set.

Kraken's public OHLC only returns the latest 720 bars (12 hours of 1m), which is too short to
train or test on, so history comes from Coinbase Exchange's public candles (USD pairs, same coins).
Coinbase row format (read live): [time, low, high, open, close, volume], newest first, max 300 rows.

    python3 fetch.py <outDir> <days> COIN [COIN ...]
"""
import sys, os, time, json, threading
from concurrent.futures import ThreadPoolExecutor
import requests

out, days, coins = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
os.makedirs(out, exist_ok=True)
URL = "https://api.exchange.coinbase.com/products/{}-USD/candles"
lock = threading.Lock()
last = [0.0]

def pace():
    # stay under Coinbase's public limit (~10 req/s): one request every 0.15 s across all threads
    with lock:
        wait = last[0] + 0.15 - time.time()
        if wait > 0: time.sleep(wait)
        last[0] = time.time()

def chunk(coin, start):
    end = start + 300 * 60 - 60
    for attempt in range(8):
        pace()
        try:
            r = requests.get(URL.format(coin), params={"granularity": 60, "start": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(start)),
                             "end": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(end))}, timeout=20, headers={"User-Agent": "candle-fetch"})
            if r.status_code == 429: time.sleep(1 + attempt); continue
            r.raise_for_status()
            return r.json()
        except Exception as e:
            time.sleep(1 + attempt)
    raise RuntimeError(f"{coin} {start} failed")

now = int(time.time()) // 60 * 60 - 120
t0 = now - days * 86400
for coin in coins:
    f = os.path.join(out, f"{coin}.json")
    if os.path.exists(f): print("have", coin); continue
    starts = list(range(t0, now, 300 * 60))
    with ThreadPoolExecutor(6) as ex: parts = list(ex.map(lambda s: chunk(coin, s), starts))
    rows = {}
    for p in parts:
        for t, lo, hi, op, cl, vol in p: rows[int(t)] = [int(t), op, hi, lo, cl, vol]
    data = [rows[t] for t in sorted(rows)]
    json.dump(data, open(f, "w"))
    print(coin, len(data), "bars", time.strftime("%Y-%m-%d", time.gmtime(data[0][0])), "->", time.strftime("%Y-%m-%d %H:%M", time.gmtime(data[-1][0])), flush=True)

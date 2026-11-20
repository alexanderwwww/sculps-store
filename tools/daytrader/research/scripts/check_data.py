"""Sanity checks and the numbers quoted in DATA.md. Reads only files in ../data. Standard library only."""
import csv, os, statistics as st, collections, datetime as dt
D = os.path.join(os.path.dirname(__file__), "..", "data")
iso = lambda t: dt.datetime.fromtimestamp(int(t), dt.timezone.utc).strftime("%Y-%m-%d %H:%M")
def q(v, p): v = sorted(v); return v[min(len(v) - 1, int(p * len(v)))] if v else None
for coin in ("btc", "eth", "sol"):
    print(f"\n===== {coin.upper()} =====")
    cb = {}
    with open(os.path.join(D, f"coinbase_{coin}_1m.csv")) as f:
        for r in csv.DictReader(f): cb[int(r["time"])] = (float(r["open"]), float(r["high"]), float(r["low"]), float(r["close"]))
    ts = sorted(cb); exp = (ts[-1] - ts[0]) // 60 + 1
    print(f"coinbase 1m rows {len(ts)}  {iso(ts[0])} .. {iso(ts[-1])} UTC  missing minutes {exp-len(ts)}")
    R = list(csv.DictReader(open(os.path.join(D, f"rounds_{coin}.csv"))))
    print(f"rounds listed {len(R)}  {iso(R[0]['start'])} .. {iso(R[-1]['start'])} UTC")
    res = [r for r in R if r["outcome"]]
    up = sum(r["outcome"] == "Up" for r in res)
    print(f"resolved {len(res)}  Up {up} ({100*up/len(res):.2f}%)  unresolved/odd {len(R)-len(res)}")
    starts = sorted(int(r["start"]) for r in R); gaps = sum(1 for a, b in zip(starts, starts[1:]) if b - a != 300)
    print(f"gaps in the 5-min sequence: {gaps}; slots missing: {(starts[-1]-starts[0])//300+1-len(starts)}")
    # regimes
    reg = collections.OrderedDict()
    for r in R:
        k = (r["resolution_source"], r["fee_rate"], r["twap_lookback_s"])
        a = reg.setdefault(k, [r["start"], r["start"], 0]); a[1] = r["start"]; a[2] += 1
    for k, a in reg.items(): print(f"  regime source={k[0]} fee_rate={k[1] or '-'} twap={k[2] or '-'}: {a[2]} rounds {iso(a[0])} .. {iso(a[1])}")
    meta = [r for r in res if r["price_to_beat"] and r["final_price"]]
    ok = sum((float(r["final_price"]) >= float(r["price_to_beat"])) == (r["outcome"] == "Up") for r in meta)
    print(f"rounds with priceToBeat+finalPrice {len(meta)}; outcome == (final >= beat) in {ok} ({100*ok/max(1,len(meta)):.3f}%)")
    chain = sum(1 for a, b in zip(meta, meta[1:]) if int(b["start"]) - int(a["start"]) == 300 and a["final_price"] == b["price_to_beat"])
    adj = sum(1 for a, b in zip(meta, meta[1:]) if int(b["start"]) - int(a["start"]) == 300)
    print(f"final_price of round N == price_to_beat of round N+1: {chain}/{adj}")
    # Chainlink vs Coinbase, per regime (twap vs spot)
    for name, sel in (("TWAP-60s regime", lambda r: "twap" in r["resolution_source"]), ("spot-stream regime", lambda r: "twap" not in r["resolution_source"])):
        d_open, d_twap, agree_spot, agree_twap, n = [], [], 0, 0, 0
        for r in meta:
            if not sel(r): continue
            s = int(r["start"])
            if not all(t in cb for t in (s - 60, s, s + 240)): continue
            beat, fin = float(r["price_to_beat"]), float(r["final_price"])
            o = cb[s][0]                                  # Coinbase first trade of the minute starting at round start
            prev = sum(cb[s - 60]) / 4                    # OHLC mean of the minute before start = rough 60 s TWAP proxy
            lastm = sum(cb[s + 240]) / 4                  # OHLC mean of the round's last minute
            d_open.append((o - beat) / beat * 1e4); d_twap.append((prev - beat) / beat * 1e4)
            n += 1
            agree_spot += ((cb[s + 240][3] >= o) == (r["outcome"] == "Up"))
            agree_twap += ((lastm >= prev) == (r["outcome"] == "Up"))
        if not n: continue
        a1 = [abs(x) for x in d_open]; a2 = [abs(x) for x in d_twap]
        print(f"  [{name}] n={n}")
        print(f"    Coinbase open@start minus priceToBeat, bps: mean {st.mean(d_open):+.2f} median {st.median(d_open):+.2f} |abs| median {st.median(a1):.2f} p90 {q(a1,.9):.2f} p99 {q(a1,.99):.2f}")
        print(f"    Coinbase prev-minute OHLC mean minus priceToBeat, bps: mean {st.mean(d_twap):+.2f} median {st.median(d_twap):+.2f} |abs| median {st.median(a2):.2f} p90 {q(a2,.9):.2f} p99 {q(a2,.99):.2f}")
        print(f"    official outcome matched by Coinbase close(last min) >= open(start): {100*agree_spot/n:.2f}%")
        print(f"    official outcome matched by Coinbase last-minute OHLC mean >= prev-minute OHLC mean: {100*agree_twap/n:.2f}%")
        mv = [abs(float(r["final_price"]) / float(r["price_to_beat"]) - 1) * 1e4 for r in meta if sel(r)]
        print(f"    official |final/beat - 1| bps: median {st.median(mv):.2f} p25 {q(mv,.25):.2f} p75 {q(mv,.75):.2f}")
    for fn, label in ((f"poly_prices_{coin}.csv", "prices-history (1/min)"), (f"poly_trades5s_{coin}.csv", "trades 5s buckets")):
        p = os.path.join(D, fn)
        if not os.path.exists(p): continue
        cnt = collections.Counter(); empty = 0; rows = 0
        with open(p) as f:
            for r in csv.reader(f):
                if r[0] == "start": continue
                rows += 1
                if r[1] == "": empty += 1
                else: cnt[int(r[0])] += 1
        v = list(cnt.values())
        print(f"{label}: file rows {rows}, rounds with data {len(cnt)}, rounds empty {empty}, {iso(min(cnt))} .. {iso(max(cnt))} UTC, rows/round median {st.median(v)} min {min(v)} max {max(v)}")

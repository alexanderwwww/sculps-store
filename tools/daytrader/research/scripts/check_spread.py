"""Summarises data/spread_samples.csv (live order-book polls)."""
import csv, os, statistics as st, collections
D = os.path.join(os.path.dirname(__file__), "..", "data")
R = [r for r in csv.DictReader(open(os.path.join(D, "spread_samples.csv"))) if r["best_bid"] and r["best_ask"]]
f = lambda x: float(x) if x not in ("", None) else None
q = lambda v, p: sorted(v)[min(len(v) - 1, int(p * len(v)))]
polls = sorted(set(r["poll_ts"] for r in R)); rounds = sorted(set(r["round_start"] for r in R))
print(f"rows {len(R)}  polls {len(polls)}  rounds {len(rounds)} ({rounds[0]}..{rounds[-1]})  span {float(polls[-1])-float(polls[0]):.0f}s")
def line(tag, rows):
    if not rows: return
    sp = [f(r["best_ask"]) - f(r["best_bid"]) for r in rows]
    c = collections.Counter(round(x, 3) for x in sp)
    s10 = [f(r["avg_ask_fill_10usd"]) - f(r["best_ask"]) for r in rows if r["avg_ask_fill_10usd"]]
    s100 = [f(r["avg_ask_fill_100usd"]) - f(r["best_ask"]) for r in rows if r["avg_ask_fill_100usd"]]
    asz = [f(r["ask_size"]) * f(r["best_ask"]) for r in rows]
    print(f"{tag:34s} n={len(rows):5d} spread median {st.median(sp):.3f} mean {st.mean(sp):.4f} p90 {q(sp,.9):.3f} max {max(sp):.3f} | share<=1c {100*sum(x<=0.0101 for x in sp)/len(sp):.0f}% "
          f"| $ at best ask median {st.median(asz):.0f} | extra over best ask: $10 mean {st.mean(s10):.4f}, $100 mean {st.mean(s100):.4f} p90 {q(s100,.9):.3f}")
line("ALL", R)
for coin in ("btc", "eth", "sol"):
    C = [r for r in R if r["coin"] == coin]; line(coin.upper(), C)
    mid = [r for r in C if 0.2 <= (f(r["best_ask"]) + f(r["best_bid"])) / 2 <= 0.8]; line(f"  {coin} mid price 0.20-0.80", mid)
    line(f"  {coin} mid price outside", [r for r in C if r not in mid])
    for a, b in ((0, 60), (60, 180), (180, 270), (270, 300)):
        line(f"  {coin} sec {a}-{b}", [r for r in C if a <= f(r["sec_into_round"]) < b])
# cost of buying both sides at the same poll (ask_up + ask_down - 1) = full round-trip spread seen by a taker
by = collections.defaultdict(dict)
for r in R: by[(r["poll_ts"], r["coin"])][r["side"]] = r
for coin in ("btc", "eth", "sol"):
    ov = [f(v["up"]["best_ask"]) + f(v["down"]["best_ask"]) - 1 for (p, c), v in by.items() if c == coin and len(v) == 2]
    bb = [1 - f(v["up"]["best_bid"]) - f(v["down"]["best_bid"]) for (p, c), v in by.items() if c == coin and len(v) == 2]
    print(f"{coin} ask_up+ask_down-1: median {st.median(ov):.3f} mean {st.mean(ov):.4f} p10 {q(ov,.1):.3f} p90 {q(ov,.9):.3f} | 1-bid_up-bid_down: median {st.median(bb):.3f} mean {st.mean(bb):.4f}  (the two books are read ~0.1-0.4 s apart)")
print("tick sizes seen:", collections.Counter(r["tick_size"] for r in R))

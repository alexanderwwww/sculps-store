"""Lists every closed 5-minute Up/Down round for BTC/ETH/SOL from gamma-api (events?series_id=..&end_date_min/max)
and writes data/rounds_<coin>.csv. Fields come straight from the event/market JSON; nothing is derived except
`outcome` (from outcomePrices ["1","0"] = Up, ["0","1"] = Down). Usage: fetch_rounds.py [first_day YYYY-MM-DD]"""
import sys, os, csv, json, time, datetime as dt
from concurrent.futures import ThreadPoolExecutor
from lib import get_json, GAMMA, SERIES
D = os.path.join(os.path.dirname(__file__), "..", "data")
first = dt.datetime.fromisoformat(sys.argv[1] if len(sys.argv) > 1 else "2025-12-17").replace(tzinfo=dt.timezone.utc)
now = dt.datetime.now(dt.timezone.utc)
iso = lambda d: d.strftime("%Y-%m-%dT%H:%M:%SZ")
def page(args):
    sid, a = args
    b = a + dt.timedelta(hours=8)
    ev = get_json(f"{GAMMA}/events?series_id={sid}&closed=true&limit=100&order=endDate&ascending=true&end_date_min={iso(a)}&end_date_max={iso(b)}")
    if len(ev) >= 100: print("WARN full page", sid, iso(a), flush=True)
    return ev
COLS = ["start","end","slug","outcome","price_to_beat","final_price","volume","up_token","down_token","condition_id","resolution_source","fee_rate","fees_enabled","twap_lookback_s","closed_time"]
for coin, sid in SERIES.items():
    wins = []; a = first
    while a < now: wins.append((sid, a)); a += dt.timedelta(hours=8)
    rows = {}
    with ThreadPoolExecutor(6) as ex:
        for ev in ex.map(page, wins):
            for e in ev:
                if not e.get("slug", "").startswith(f"{coin}-updown-5m-") or not e.get("markets"): continue
                m = e["markets"][0]; start = int(e["slug"].rsplit("-", 1)[1])
                try: op = json.loads(m.get("outcomePrices") or "[]"); tok = json.loads(m.get("clobTokenIds") or "[]"); oc = json.loads(m.get("outcomes") or "[]")
                except Exception: op, tok, oc = [], [], []
                outcome = ""
                if oc == ["Up", "Down"] and len(op) == 2:
                    outcome = "Up" if op == ["1", "0"] else "Down" if op == ["0", "1"] else ""
                md = e.get("eventMetadata") or {}; fs = m.get("feeSchedule") or {}; cfg = m.get("cryptoMarketConfig") or {}
                rows[start] = [start, start + 300, e["slug"], outcome, md.get("priceToBeat", ""), md.get("finalPrice", ""), m.get("volume", ""),
                               tok[0] if len(tok) == 2 else "", tok[1] if len(tok) == 2 else "", m.get("conditionId", ""), m.get("resolutionSource", ""),
                               fs.get("rate", ""), m.get("feesEnabled", ""), cfg.get("twapLookbackSeconds", "") if cfg.get("twapEnabled") else "", m.get("closedTime", "")]
    with open(os.path.join(D, f"rounds_{coin}.csv"), "w", newline="") as f:
        w = csv.writer(f); w.writerow(COLS)
        for s in sorted(rows): w.writerow(rows[s])
    print(coin, "rounds", len(rows), "first", min(rows), "last", max(rows), flush=True)

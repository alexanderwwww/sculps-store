# Pull OKX candles (1H x ~180d, 5m x ~21d) for liquid tokens. Read-only public API.
import json,time,urllib.request,sys
COINS=["SOL","JUP","BONK","WIF","JTO","PYTH","RAY","ORCA","ETH","BTC","DOGE","PEPE","POPCAT","RENDER","W","TNSR","WLD","SUI","AVAX","LINK"]
def get(u):
    for i in range(4):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(u,headers={"User-Agent":"x"}),timeout=20))
        except Exception as e: time.sleep(1.5)
    return None
def pull(inst,bar,n):
    out=[];after=""
    while len(out)<n:
        d=get(f"https://www.okx.com/api/v5/market/history-candles?instId={inst}&bar={bar}&limit=100"+(f"&after={after}" if after else ""))
        if not d or d.get("code")!="0" or not d["data"]: break
        out+=d["data"]; after=d["data"][-1][0]; time.sleep(0.12)
    return [[int(r[0]),float(r[1]),float(r[2]),float(r[3]),float(r[4]),float(r[5])] for r in reversed(out)]
res={}
for bar,n in (("1H",4300),("5m",6000)):
    for c in COINS:
        r=pull(f"{c}-USDT",bar,n); res[f"{c}_{bar}"]=r; print(c,bar,len(r),flush=True)
    json.dump(res,open("data/majors.json","w"))

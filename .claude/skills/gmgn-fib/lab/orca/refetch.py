import json,time
from common import get
sel=json.load(open('pools30d.json'))
for c in sel:
    for t in range(6):
        if c['ohlcv']: break
        time.sleep(8)
        d=get(f"https://api.geckoterminal.com/api/v2/networks/solana/pools/{c['addr']}/ohlcv/hour?aggregate=1&limit=720&currency=usd")
        if d and 'data' in d: c['ohlcv']=d['data']['attributes']['ohlcv_list']
    print(c['name'],c['dex'],len(c['ohlcv'] or []),flush=True)
json.dump(sel,open('pools30d.json','w'))

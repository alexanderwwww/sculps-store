import json,time
from common import get
sel=json.load(open('pools30d.json'))
for c in sel:
    for t in range(8):
        if c.get('ohlcv_q'): break
        d=get(f"https://api.geckoterminal.com/api/v2/networks/solana/pools/{c['addr']}/ohlcv/hour?aggregate=1&limit=720&currency=token")
        if d and 'data' in d: c['ohlcv_q']=d['data']['attributes']['ohlcv_list']
        else: time.sleep(8)
    time.sleep(2.3)
    print(c['name'],c['dex'],len(c.get('ohlcv_q') or []),flush=True)
json.dump(sel,open('pools30d.json','w'))

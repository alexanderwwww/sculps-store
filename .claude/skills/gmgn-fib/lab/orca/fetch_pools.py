import json,time
from common import get
cands=[]
for dex in ['orca','raydium-clmm','meteora']:
    for pg in (1,2):
        d=get(f'https://api.geckoterminal.com/api/v2/networks/solana/dexes/{dex}/pools?sort=h24_volume_usd_desc&page={pg}')
        time.sleep(2.2)
        if not d: continue
        for p in d['data']:
            a=p['attributes']
            cands.append(dict(addr=a['address'],name=a['name'],dex=dex,tvl=float(a['reserve_in_usd'] or 0),vol24=float(a['volume_usd']['h24'] or 0),created=a['pool_created_at']))
# top 25 by 24h volume with TVL>=300k (so a $10k position is not the pool)
cands=[c for c in cands if c['tvl']>=300000]
cands.sort(key=lambda c:-c['vol24'])
sel=cands[:25]
# fee rates
for c in sel:
    if c['dex']=='orca':
        d=get(f"https://api.orca.so/v2/solana/pools/{c['addr']}")
        d=d.get('data',d) if d else None
        if d: c['fee']=int(d['feeRate'])/1e6; c['protocol']=int(d['protocolFeeRate'])/1e4; c['orca']=d
    elif c['dex']=='meteora':
        d=get(f"https://dlmm.datapi.meteora.ag/pools/{c['addr']}")
        if d: c['fee']=(d.get('pool_config') or {}).get('base_fee_pct',None); 
        if d: c['meteora_keys']=list(d.keys())[:30]; c['mraw']={k:d[k] for k in d if k in('fee_tvl_ratio','pool_config','tvl','apr','farm_apr','dynamic_fee_pct','current_price')}
    else:
        d=get(f"https://api-v3.raydium.io/pools/info/ids?ids={c['addr']}")
        if d and d.get('data'): 
            x=d['data'][0]; c['fee']=x.get('config',{}).get('tradeFeeRate',0)/1e6; c['rraw']={k:x.get(k) for k in('feeRate','tvl','mintAmountA','mintAmountB')}
    time.sleep(0.3)
for c in sel:
    # hourly ohlcv, 720 = 30 days
    d=get(f"https://api.geckoterminal.com/api/v2/networks/solana/pools/{c['addr']}/ohlcv/hour?aggregate=1&limit=720&currency=usd")
    time.sleep(2.3)
    c['ohlcv']=d['data']['attributes']['ohlcv_list'] if d and 'data' in d else None
    print(c['name'],c['dex'],round(c['tvl']),round(c['vol24']),c.get('fee'),len(c['ohlcv'] or []),flush=True)
json.dump(sel,open('pools30d.json','w'))

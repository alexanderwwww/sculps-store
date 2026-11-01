import json,time,statistics as st
from common import get
HL='https://api.hyperliquid.xyz/info'
now=int(time.time()*1000); DAY=86400000
def hist(coin,days):
    out=[];t=now-days*DAY
    while t<now:
        d=get(HL,post={"type":"fundingHistory","coin":coin,"startTime":t})
        if not d: break
        out+=d; 
        if len(d)<500: break
        t=d[-1]['time']+1
        time.sleep(0.2)
    return out
def candles(coin,days):
    out=[];t=now-days*DAY
    while t<now:
        d=get(HL,post={"type":"candleSnapshot","req":{"coin":coin,"interval":"1h","startTime":t,"endTime":now}})
        if not d: break
        out+=d
        if len(d)<500: break
        t=d[-1]['t']+1
        time.sleep(0.2)
    return out
res={}
meta=get(HL,post={"type":"metaAndAssetCtxs"})
names=[u['name'] for u in meta[0]['universe']]
ctx=meta[1]
vol={n:float(c['dayNtlVlm']) for n,c in zip(names,ctx)}
oi={n:float(c['openInterest'])*float(c['markPx']) for n,c in zip(names,ctx)}
top=sorted(names,key=lambda n:-vol[n])[:30]
print('top30 by 24h vol:',[(n,round(vol[n]/1e6)) for n in top[:12]])
for coin in list(dict.fromkeys(['SOL','BTC','ETH','HYPE']+top)):
    h=hist(coin,365)
    if not h: continue
    r=[float(x['fundingRate']) for x in h]
    res[coin]=dict(n=len(r),days=len(r)/24,apr_all=sum(r)/ (len(r)/24) *365, last30=sum(r[-720:])/ (min(len(r),720)/24)*365, last90=sum(r[-2160:])/(min(len(r),2160)/24)*365,
                   neg_hours=sum(x<0 for x in r)/len(r), vol24=vol[coin], oi=oi[coin])
    res[coin]['hist']=[(x['time'],float(x['fundingRate'])) for x in h]
    print(coin,{k:(round(v,3) if isinstance(v,float) else v) for k,v in res[coin].items() if k!='hist'},flush=True)
json.dump(res,open('funding_hl.json','w'))
for coin in ('SOL','BTC','ETH'):
    c=candles(coin,365)
    json.dump(c,open(f'candles_{coin}.json','w')); print(coin,'candles',len(c))

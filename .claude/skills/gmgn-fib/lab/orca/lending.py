import json,statistics as st,time
from common import get
d=get('https://yields.llama.fi/pools')['data']
sol=[p for p in d if p['chain']=='Solana']
projs={}
for p in sol: projs[p['project']]=projs.get(p['project'],0)+p['tvlUsd']
print('Solana projects by tvl:',[(k,round(v/1e6)) for k,v in sorted(projs.items(),key=lambda x:-x[1])[:25]])
lend=[p for p in sol if any(k in p['project'] for k in ('kamino-lend','marginfi','jupiter-lend','save','drift','loopscale','project-0'))]
print('lending projects:',sorted({p['project'] for p in lend}))
stab=[p for p in lend if p.get('stablecoin') and p['tvlUsd']>5e6]
stab.sort(key=lambda p:-(p['apy'] or 0))
json.dump(stab[:40],open('lend_stable_now.json','w'))
print('--- stable lending TVL>5M by apy')
for p in stab[:15]:
    print(p['project'],p['symbol'],round(p['tvlUsd']/1e6,1),'apy',round(p['apy'] or 0,2),'base',round(p['apyBase'] or 0,2),'reward',round(p['apyReward'] or 0,2),'30dMean',p.get('apyMean30d'),p['pool'])
sols=[p for p in lend if p['symbol'] in('SOL','JITOSOL','JUPSOL','MSOL','BSOL','JUPITER-SOL') and p['tvlUsd']>5e6]
sols.sort(key=lambda p:-(p['apy'] or 0))
print('--- SOL/LST lending')
for p in sols[:8]: print(p['project'],p['symbol'],round(p['tvlUsd']/1e6,1),'apy',round(p['apy'] or 0,2),'base',round(p['apyBase'] or 0,2),'reward',round(p['apyReward'] or 0,2))
# history of top 6 stable + stable base-only
res=[]
seen=set()
for p in stab[:12]:
    if (p['project'],p['symbol']) in seen: continue
    seen.add((p['project'],p['symbol']))
    h=get(f"https://yields.llama.fi/chart/{p['pool']}"); time.sleep(0.5)
    if not h: continue
    rows=h['data'][-90:]
    ap=[r['apy'] for r in rows if r.get('apy') is not None]
    base=[r['apyBase'] for r in rows if r.get('apyBase') is not None]
    tv=[r['tvlUsd'] for r in rows]
    res.append(dict(project=p['project'],sym=p['symbol'],now=p['apy'],mean90=st.mean(ap),min90=min(ap),p10=sorted(ap)[len(ap)//10],med90=st.median(ap),max90=max(ap),base_mean=st.mean(base) if base else None,tvl_now=tv[-1],tvl_min=min(tv),n=len(ap)))
for r in res: print({k:(round(v,2) if isinstance(v,float) else v) for k,v in r.items()})
json.dump(res,open('lend_hist.json','w'))

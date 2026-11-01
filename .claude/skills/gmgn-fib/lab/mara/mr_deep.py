# Deep-check of the one majors candidate: buy after a >=3% one-hour drop, hold 12/24h. Quarters, day-clustering, per coin, cost stress, and a placebo (random entries).
import json,statistics as S,random,sys
d=json.load(open("data/majors.json"));COINS=[k[:-3] for k in d if k.endswith("_1H") and len(d[k])>2000];H={c:d[c+"_1H"] for c in COINS}
def tr(c,x,hold,cost):
    out=[];i=60
    while i<len(c)-hold-1:
        if c[i][4]/c[i-1][4]-1<=-x: out.append((c[i][0],c[i+hold][4]/c[i][4]-1-cost)); i+=hold
        else: i+=1
    return out
def placebo(c,hold,cost,n,rng):
    ix=rng.sample(range(60,len(c)-hold-1),n); return [c[i+hold][4]/c[i][4]-1-cost for i in ix]
for cost in (0.003,0.006,0.01):
  for hold in (12,24):
    allt=[];per={}
    for c in COINS:
        t=tr(H[c],0.03,hold,cost); per[c]=t; allt+= [(c,)+x for x in t]
    r=[x[2] for x in allt];m=S.mean(r)
    byday={}
    for c,ts,x in allt: byday.setdefault(ts//86400000,[]).append(x)
    dm=[S.mean(v) for v in byday.values()]
    # quarters by time
    t0=min(x[1] for x in allt);t1=max(x[1] for x in allt);q=[[] for _ in range(4)]
    for c,ts,x in allt: q[min(3,int(4*(ts-t0)/(t1-t0+1)))].append(x)
    rng=random.Random(1);pl=[S.mean(placebo(H[c],hold,cost,len(per[c]),rng)) for c in COINS if len(per[c])>3]
    print(f"cost {cost*100:.1f}% hold {hold}h: n={len(r)} mean={m*100:.2f}% | distinct days={len(dm)} day-clustered mean={S.mean(dm)*100:.2f}% se={S.pstdev(dm)/len(dm)**.5*100:.2f}% | win={sum(x>0 for x in r)/len(r)*100:.0f}% | quarters:",[f"{S.mean(v)*100:.2f}%(n{len(v)})" for v in q],f"| placebo random-entry mean per coin {S.mean(pl)*100:.2f}%")
    if cost==0.003: print("   per coin:",{c:(len(v),round(S.mean([x[1] for x in v])*100,2)) for c,v in per.items() if len(v)>=5})

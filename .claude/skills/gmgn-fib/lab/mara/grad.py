# Pump.fun graduation / pool-birth: buy at close of minute d after pool creation, sell h minutes later, 4% round trip. Pool-wise split.
import json,statistics as S
D="/home/user/sculps-store/tools/autotrader/data/"
pools=json.load(open(D+"pools.json"))+json.load(open(D+"pools-nov.json"))
born=[p for p in pools if p['dex']=='pumpswap' and p['cs'][0]['t']-p['created']<=5*60000 and len(p['cs'])>=200]
print("pumpswap pools with candles from birth:",len(born),"of",len(pools))
COST=0.04
def run(ps,d,h):
    r=[]
    for p in ps:
        c=p['cs']
        if len(c)<=d+h or c[d]['c']<=0: continue
        r.append(c[d+h]['c']/c[d]['c']-1-COST)
    return r
def st(r):
    n=len(r); m=sum(r)/n if n else 0; sd=S.pstdev(r) if n>1 else 0
    med=S.median(r) if n else 0
    return n,m,sd/(n**.5) if n else 0,med,sum(x>0 for x in r)/n if n else 0
tr=born[::2];te=born[1::2]
print("d(min) h(min) | train n mean(se) med win | test n mean(se) med win")
rows=[]
for d in (1,2,3,5,10,20):
    for h in (5,15,30,60,120):
        a=st(run(tr,d,h));b=st(run(te,d,h)); rows.append((d,h,a,b))
        print(f"{d:3d} {h:4d} | {a[0]:3d} {a[1]*100:6.1f}({a[2]*100:4.1f}) {a[3]*100:6.1f} {a[4]*100:3.0f}% | {b[0]:3d} {b[1]*100:6.1f}({b[2]*100:4.1f}) {b[3]*100:6.1f} {b[4]*100:3.0f}%")
print("positive on BOTH halves:",[(d,h) for d,h,a,b in rows if a[1]>0 and b[1]>0])
# buy-the-dip after graduation: enter first time price is x% below max close so far (min 3 min old), exit after h
print("dip entry (x below running max), exit h=30/60, train/test")
for x in (0.2,0.35,0.5):
    for h in (30,60):
        def go(ps):
            r=[]
            for p in ps:
                c=p['cs'];mx=0
                for i in range(1,len(c)-h):
                    mx=max(mx,c[i]['h'])
                    if i>=3 and c[i]['c']<=mx*(1-x):
                        r.append(c[i+h]['c']/c[i]['c']-1-COST);break
            return r
        a=st(go(tr));b=st(go(te)); print(f" dip{x} h{h}: train n={a[0]} {a[1]*100:.1f}%({a[2]*100:.1f}) | test n={b[0]} {b[1]*100:.1f}%({b[2]*100:.1f})")
# what share of pools are above their minute-1 price later (survivorship check: how many ended near zero)
import collections
fin=[p['cs'][-1]['c']/p['cs'][1]['c'] for p in born]
print("final/min1 price quantiles:",[round(sorted(fin)[int(len(fin)*q)],3) for q in (.1,.25,.5,.75,.9)])

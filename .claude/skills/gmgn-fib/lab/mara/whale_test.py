# Whale persistence / copy test on pumpswap pools from Oct 31-Nov 1 (public RPC, full tx history of 12 pools). Chronological split by pool.
import json,glob,statistics as S,random,sys
meta=json.load(open("data/whale/meta.json"));pools=[]
for k,m in meta.items():
    try: sw=json.load(open(f"data/whale/{k}.swaps.json"))
    except: continue
    if len(sw)<60: continue
    sw.sort(key=lambda x:(x['slot'],x['ix']));pools.append((m['created'],m['name'],sw))
pools.sort(key=lambda x:x[0]);print("pools with swaps:",[(n,len(s)) for _,n,s in pools])
COST=0.04
def pxraw(x): return abs(x['sol'])/abs(x['tok'])
def mkprice(sw):
    # robust price at each swap: median of raw prices of swaps within +-3 positions whose size >= 0.01 SOL (rent/tips distort small ones)
    big=[pxraw(x) if abs(x['sol'])>=1e7 else None for x in sw];out=[]
    for i in range(len(sw)):
        w=[b for b in big[max(0,i-3):i+4] if b];out.append(S.median(w) if w else None)
    return out
def wallets(sw):
    w={}
    for x in sw:
        a=w.setdefault(x['w'],{'n':0,'bS':0,'bT':0,'sS':0,'sT':0});a['n']+=1
        if x['tok']>0: a['bS']+=-x['sol'];a['bT']+=x['tok']
        else: a['sS']+=x['sol'];a['sT']+=-x['tok']
    return w
def smart(sw,minSold,minGain=0.2,maxN=40):
    out={}
    for a,v in wallets(sw).items():
        if v['n']>maxN or not v['bT'] or not v['sT'] or v['sS']<minSold*1e9: continue
        g=(v['sS']/v['sT'])/(v['bS']/v['bT'])-1
        if g>=minGain: out[a]=g
    return out
def follow(sw,smartset,lag,mode="their_sell"):
    P=mkprice(sw)
    # first buy of each smart wallet; we enter `lag` swaps later; exit `lag` swaps after their first sell (or last swap)
    r=[];seen=set()
    for i,x in enumerate(sw):
        if x['w'] in smartset and x['tok']>0 and x['w'] not in seen:
            seen.add(x['w']);
            j=next((j for j in range(i+1,len(sw)) if sw[j]['w']==x['w'] and sw[j]['tok']<0),None)
            
            pe=P[min(i+lag,len(sw)-1)];jj=(min(j+lag,len(sw)-1) if j is not None else len(sw)-1);px_=P[jj]
            if pe and px_: r.append(px_/pe-1-COST)
    return r
def st(r):
    n=len(r);return (n,S.mean(r) if n else 0,(S.pstdev(r)/n**.5) if n>1 else 0,sum(x>0 for x in r)/n if n else 0)
f=lambda t:f"n={t[0]:3d} mean={t[1]*100:6.1f}% se={t[2]*100:4.1f} win={t[3]*100:3.0f}%"
half=len(pools)//2;disc=pools[:half];test=pools[half:]
for minSold in (0.3,1.0):
    sm={}
    for _,_,sw in disc: sm.update(smart(sw,minSold))
    print(f"\nminSold {minSold} SOL: smart wallets found in discovery pools: {len(sm)}")
    allw=set().union(*[set(wallets(sw)) for _,_,sw in test])
    print("  of those, present in test pools:",len(set(sm)&allw),"of",len(allw),"test-pool wallets")
    for lag in (0,3,10,25):
        rs=[];ctl=[]
        for _,n,sw in test:
            rs+=follow(sw,set(sm),lag)
            others={a for a in wallets(sw) if a not in sm};rng=random.Random(5)
            smp=set(rng.sample(sorted(others),min(len(others),200)))
            ctl+=follow(sw,smp,lag)
        print(f"  lag {lag:2d} swaps: FOLLOW smart  {f(st(rs))} | control random wallets {f(st(ctl))}")
# in-sample reality check: do smart wallets (picked in the same pools) look great? (it should: that's selection)
sm={};[sm.update(smart(sw,0.3)) for _,_,sw in pools]
print("\nIN-SAMPLE (same pools used to pick) lag3:",f(st(sum([follow(sw,set(sm),3) for _,_,sw in pools],[]))))
# leave-one-pool-out
rs=[];ctl=[]
for i,(_,n,sw) in enumerate(pools):
    sm={};[sm.update(smart(s2,0.3)) for j,(_,_,s2) in enumerate(pools) if j!=i]
    rs+=follow(sw,set(sm),3)
print("LEAVE-ONE-POOL-OUT lag3 follow:",f(st(rs)))

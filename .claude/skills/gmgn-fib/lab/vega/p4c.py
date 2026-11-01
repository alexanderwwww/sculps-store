from engine import *
import statistics as S
tr,te1,te2=split_pools(); allp=tr+te1+te2
# ---- A4 survival: hazard of "death" (close < 50% of entry close at some point in next 60m) by age bucket and drawdown-from-peak bucket
ab=[(0,5),(5,15),(15,30),(30,60),(60,120),(120,240),(240,10**6)]
def bucket(x,bs):
    for i,(a,b) in enumerate(bs):
        if a<=x<b: return i
rows={}
for p in allp:
    c=p['c'];l=p['l'];n=p['n'];pk=0
    for t in range(n):
        pk=max(pk,p['h'][t])
        if t>=n-61 or p['v'][t]<=0: continue
        dd=1-c[t]/pk
        death=min(l[t+1:t+61])<0.5*c[t]
        up2=max(p['h'][t+1:t+61])>=2*c[t]
        f=c[t+60]/c[t]-1
        k=(bucket(t,ab),0 if dd<.1 else 1 if dd<.4 else 2)
        d=rows.setdefault(k,[0,0,0,[]]);d[0]+=1;d[1]+=death;d[2]+=up2;d[3].append(f)
print('age bucket(min) x drawdown-from-peak (0:<10%,1:10-40%,2:>40%): n, P(-50% in 60m), P(2x in 60m), gross mean60, median60')
names=['0-5','5-15','15-30','30-60','60-120','120-240','240+']
for k in sorted(rows):
    n,de,u,f=rows[k]
    if n<200: continue
    print(f"age {names[k[0]]:8s} dd{k[1]}  n{n:6d}  death {de/n:.3f}  2x {u/n:.3f}  mean {S.mean(f)*100:6.2f}%  med {S.median(f)*100:6.2f}%")
# ---- control: momentum>0 (5m) any minute + trail, dedupe 10 vs breakout vs near-high filter ----
EXT=dict(trail=.25,sl=.3,hold=120)
def sig_mom(p,mw=5,agemax=10**6,agemin=0,ddmax=1.0):
    c=p['c'];out=[];pk=0
    for t in range(max(mw+1,agemin),min(p['n']-2,agemax)):
        pk=max(pk,p['h'][t])
        if p['v'][t]<=0: continue
        if c[t]/c[t-mw]-1>0 and 1-c[t]/pk<=ddmax: out.append(t)
    return out
def pr(name,sf,gap=10):
    f=lambda s:f"n{s['n']:4d} {s['mean']*100:6.2f}%±{s['se']*100:4.1f}"
    o=[summ(run(ps,sf,EXT,'slip',gap)) for ps in (tr,te1,te2)]
    rs=sorted(x for ps in (tr,te1,te2) for _,_,x in run(ps,sf,EXT,'slip',gap))
    trim=sum(rs[:-3])/(len(rs)-3)
    print(f"{name:34s} TR {f(o[0])} | TeOct {f(o[1])} | TeNov {f(o[2])} | all-trim3 {trim*100:.2f}%")
print('\nSURVIVAL-guided entry (young + near high) vs controls, trail .25 exit')
pr('mom5>0 any age',lambda p:sig_mom(p))
pr('mom5>0 age<=90',lambda p:sig_mom(p,agemax=90))
pr('mom5>0 age<=30',lambda p:sig_mom(p,agemax=30))
pr('mom5>0 age 90+',lambda p:sig_mom(p,agemin=90))
pr('mom5>0 age<=90 within 10% of peak',lambda p:sig_mom(p,agemax=90,ddmax=.1))
pr('mom5>0 age 5-60 within 5% of peak',lambda p:sig_mom(p,agemax=60,agemin=5,ddmax=.05))
pr('breakout (brief rule)',sig_breakout)

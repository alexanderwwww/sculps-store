from engine import *
import statistics as S, itertools, random
tr,te1,te2=split_pools()
EX={'trail':dict(trail=.25,sl=.3,hold=120),'scalp':dict(tp=.2,sl=.1,hold=15),'short':dict(tp=.1,sl=.07,hold=8)}
def feats(p):
    c=p['c'];n=p['n'];r=[0]+[c[t]/c[t-1]-1 for t in range(1,n)]
    p['r']=r
    return r
for P in (tr,te1,te2):
    for p in P: feats(p)
def sd(x): 
    m=sum(x)/len(x); return (sum((a-m)**2 for a in x)/len(x))**.5
def rep(name,sf,gap=10,exits=('trail','scalp','short')):
    out=[]
    for e in exits:
        a=summ(run(tr,sf,EX[e],'slip',gap));b=summ(run(te1,sf,EX[e],'slip',gap));c=summ(run(te2,sf,EX[e],'slip',gap))
        f=lambda s:f"n{s['n']:5d} {s.get('mean',0)*100:6.2f}%±{s.get('se',0)*100:4.1f} w{s.get('win',0):.2f}"
        print(f"{name:42s}{e:6s} TR {f(a)} | TeOct {f(b)} | TeNov {f(c)}")
    return
print('=== BASELINE random entry (every 4th minute, v>0) ===')
rep('random',lambda p:sig_random(p,step=4),gap=0)
# ---------- A1 volatility regime ----------
def sig_vol(p,mode,lo,hi,L=30,S_=5):
    r=p['r'];out=[]
    for t in range(max(L,6),p['n']-2):
        if p['v'][t]<=0: continue
        rv=sd(r[t-L+1:t+1]); rs=sd(r[t-S_+1:t+1])
        if mode=='level' and not(lo<=rv<hi): continue
        if mode=='ratio':
            if rv<=0 or not(lo<=rs/rv<hi): continue
        out.append(t)
    return out
allr=[]
for p in tr:
    r=p['r']
    for t in range(30,p['n'],7):
        if p['v'][t]>0: allr.append(sd(r[t-29:t+1]))
allr.sort(); q=lambda f:allr[int(f*len(allr))]
print('\n=== A1 volatility regime: 30-min realized vol terciles from TRAIN: ',round(q(1/3),4),round(q(2/3),4),' ===')
for lo,hi,nm in [(0,q(1/3),'low-vol'),(q(1/3),q(2/3),'mid-vol'),(q(2/3),9,'high-vol')]:
    rep('A1 level '+nm,lambda p,lo=lo,hi=hi:sig_vol(p,'level',lo,hi),gap=6)
for lo,hi,nm in [(0,.6,'compressed 5/30<0.6'),(1.6,9,'expanding 5/30>1.6')]:
    rep('A1 ratio '+nm,lambda p,lo=lo,hi=hi:sig_vol(p,'ratio',lo,hi),gap=6)
# compression -> breakout combo
def sig_squeeze(p,L=30,thr=.6,brk=1.5):
    r=p['r'];c=p['c'];out=[]
    for t in range(L+6,p['n']-2):
        rv=sd(r[t-L-5:t-5]) ; rs=sd(r[t-10:t-1])
        if rv<=0 or rs/rv>thr: continue
        if r[t]>brk*rv*2 and p['v'][t]>0 and c[t]>max(p['h'][t-10:t]): out.append(t)
    return out
rep('A1 squeeze then upside break',sig_squeeze,gap=10)
# ---------- A2 capitulation wick reversion ----------
def sig_cap(p,wick=.15,rec=.5,vm=2.0):
    o,h,l,c,v=p['o'],p['h'],p['l'],p['c'],p['v'];out=[]
    for t in range(12,p['n']-2):
        ref=max(o[t],c[t-1]); dn=1-l[t]/ref
        if dn<wick: continue
        if (c[t]-l[t])/(ref-l[t]+1e-18)<rec: continue
        av=sum(v[t-10:t])/10
        if av<=0 or v[t]<vm*av: continue
        out.append(t)
    return out
print('\n=== A2 capitulation wick: low >=W below ref, close recovers >=half of wick, volume>=2x ===')
for w in (.10,.15,.25):
    rep(f'A2 cap wick>={w}',lambda p,w=w:sig_cap(p,w),gap=5,exits=('scalp','short','trail'))
# ---------- A3 cross-sectional volume acceleration ranking ----------
def xs(ps,K,H,trigger,amin=5,amax=240):
    # absolute-time align; every K minutes pick top pool by score, hold exit via sim
    T0=min(p['t0'] for p in ps);T1=max(p['t0']+p['n']*60000 for p in ps)
    res=[];rnd=random.Random(5)
    idx=lambda p,ts:(ts-p['t0'])//60000
    for ts in range(T0,T1,K*60000):
        cand=[]
        for i,p in enumerate(ps):
            t=idx(p,ts)
            if t<max(amin,18) or t>=p['n']-2 or t>amax: continue
            if p['v'][t]<=0: continue
            acc=(sum(p['v'][t-2:t+1])/3+1)/(sum(p['v'][t-17:t-2])/15+1)
            mom=p['c'][t]/p['c'][t-5]-1
            cand.append((acc,mom,i,t))
        if len(cand)<4: continue
        if trigger=='acc': pick=max(cand)
        elif trigger=='acc_up': 
            c2=[x for x in cand if x[1]>0]; 
            if not c2: continue
            pick=max(c2)
        elif trigger=='random': pick=rnd.choice(cand)
        elif trigger=='lowacc': pick=min(cand)
        _,_,i,t=pick; r=sim(ps[i],t,H,'slip')
        if r is not None: res.append((i,t,(1+r)*(1-COST)-1))
    return res
print('\n=== A3 cross-sectional rank by volume acceleration (3m vol / prior 15m vol), pick 1 pool every 10 min among active pools (age 5-240) ===')
for trig in ('acc','acc_up','lowacc','random'):
    for e in ('trail','scalp'):
        f=lambda s:f"n{s['n']:4d} {s['mean']*100:6.2f}%±{s['se']*100:4.1f}"
        a=summ(xs(tr,10,EX[e],trig));b=summ(xs(te1,10,EX[e],trig));c=summ(xs(te2,10,EX[e],trig))
        print(f"A3 {trig:8s} {e:6s} TR {f(a)} | TeOct {f(b)} | TeNov {f(c)}")

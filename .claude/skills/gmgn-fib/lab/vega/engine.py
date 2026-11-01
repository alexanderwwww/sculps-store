from lib import *
import random
def split_pools():
    a,b=pools()
    tr=[p for i,p in enumerate(a) if i%2==0]; te1=[p for i,p in enumerate(a) if i%2==1]; te2=b
    for p in tr: p['grp']='train'
    for p in te1: p['grp']='testOct'
    for p in te2: p['grp']='testNov'
    return tr,te1,te2
# ---- entry rules: return list of signal bar indices t (enter at o[t+1]) ----
def sig_random(p,step=4,seed=1):
    r=random.Random(seed+p['n']); return [t for t in range(5,p['n']-2,step) if p['v'][t]>0 and r.random()<.9]
def sig_breakout(p,L=10,vm=1.5,gf=.34,amin=4,amax=90,chase=3.0):
    c,h,v,o=p['c'],p['h'],p['v'],p['o'];out=[]
    for t in range(max(L,amin),min(p['n']-2,amax)):
        if c[t]<=max(h[t-L:t]): continue
        av=sum(v[t-L:t])/L
        if av<=0 or v[t]<vm*av: continue
        g=sum(1 for k in range(t-L+1,t+1) if c[k]>o[k])/L
        if g<gf: continue
        if c[t]/c[t-1]-1>chase: continue
        out.append(t)
    return out
def sig_3green(p):
    c,o,v=p['c'],p['o'],p['v'];out=[]
    for t in range(5,p['n']-2):
        if all(c[k]>o[k] for k in (t-2,t-1,t)) and v[t]>0: out.append(t)
    return out
def dedupe(sig,gap):
    out=[];last=-10**9
    for t in sig:
        if t-last>=gap: out.append(t);last=t
    return out
# ---- exit simulator ----
def sim(p,t,cfg,mode='wick'):
    """cfg: tp, sl, trail, hold, part=(level,frac), be (move stop to entry after part), returns gross simple return"""
    o,h,l,c,n=p['o'],p['h'],p['l'],p['c'],p['n']
    e=t+1
    if e>=n: return None
    pe=o[e]; tp=cfg.get('tp'); sl=cfg.get('sl',.25); tr=cfg.get('trail'); hold=cfg.get('hold',60)
    part=cfg.get('part'); rat=cfg.get('ratchet')  # ratchet=(g,keep): once peak>=g, stop >= pe*(1+keep)
    realized=0.0; frac=1.0; peak=pe; partdone=False
    end=min(n-1,e+hold)
    for k in range(e,end+1):
        stop=pe*(1-sl)
        if tr: stop=max(stop,peak*(1-tr))
        if rat and peak>=pe*(1+rat[0]): stop=max(stop,pe*(1+rat[1]))
        if part and partdone and cfg.get('be'): stop=max(stop,pe)
        if mode in('wick','slip'):
            ss=0.03 if mode=='slip' else 0.0
            lo,hi,op=l[k],h[k],o[k]
            if op<=stop: return realized+frac*(op*(1-ss)/pe-1)
            if lo<=stop: return realized+frac*(max(stop*(1-ss),lo)/pe-1)
            if part and not partdone and hi>=pe*(1+part[0]):
                lvl=max(op,pe*(1+part[0])); realized+=part[1]*(lvl/pe-1)-0.005; frac-=part[1]; partdone=True
            if tp and hi>=pe*(1+tp):
                lvl=max(op,pe*(1+tp)); return realized+frac*(lvl/pe-1)
            peak=max(peak,hi)
        else:
            cc=c[k]
            if cc<=stop: return realized+frac*(cc/pe-1)
            if part and not partdone and cc>=pe*(1+part[0]):
                realized+=part[1]*(cc/pe-1)-0.005; frac-=part[1]; partdone=True
            if tp and cc>=pe*(1+tp): return realized+frac*(cc/pe-1)
            peak=max(peak,cc)
    return realized+frac*(c[end]/pe-1)
def run(ps,sigfn,cfg,mode='wick',gap=0):
    res=[]
    for i,p in enumerate(ps):
        s=sigfn(p)
        if gap: s=dedupe(s,gap)
        for t in s:
            r=sim(p,t,cfg,mode)
            if r is not None: res.append((i,t,(1+r)*(1-COST)-1))
    return res
def summ(res,npools=None):
    if not res: return dict(n=0,mean=float('nan'),se=float('nan'),win=0,pools=0)
    by={}
    for i,t,r in res: by.setdefault(i,[]).append(r)
    n=len(res);m=sum(r for _,_,r in res)/n
    # cluster-robust SE: sum of pool residual sums
    num=sum((sum(x-m for x in v))**2 for v in by.values())
    se=(num**.5)/n
    return dict(n=n,mean=m,se=se,win=sum(1 for _,_,r in res if r>0)/n,pools=len(by),
                med=sorted(r for _,_,r in res)[n//2])
def sig_mom(p,mw=5,agemax=10**6,agemin=0,ddmax=1.0):
    c=p['c'];out=[];pk=0
    for t in range(max(mw+1,agemin),min(p['n']-2,agemax)):
        pk=max(pk,p['h'][t])
        if p['v'][t]<=0: continue
        if c[t]/c[t-mw]-1>0 and 1-c[t]/pk<=ddmax: out.append(t)
    return out

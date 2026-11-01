import json, math, random
D='/home/user/sculps-store/tools/autotrader/data/'
COST=0.04
def load(f):
    out=[]
    for p in json.load(open(D+f)):
        cs=p['cs']; t0=cs[0]['t']; t1=cs[-1]['t']
        n=(t1-t0)//60000+1
        o=[None]*n;h=[None]*n;l=[None]*n;c=[None]*n;v=[0.0]*n
        for k in cs:
            i=(k['t']-t0)//60000
            o[i],h[i],l[i],c[i],v[i]=k['o'],k['h'],k['l'],k['c'],k['v']
        last=cs[0]['o']
        for i in range(n):
            if c[i] is None: o[i]=h[i]=l[i]=c[i]=last
            else: last=c[i]
        out.append(dict(name=p['name'],created=p['created'],liq=p['liqUsd'],t0=t0,o=o,h=h,l=l,c=c,v=v,n=n,
                        age0=(t0-p['created'])/60000))
    return out
def clean(p, jump=10.0, wick=2.5):
    # truncate at first single-minute close jump >jump x (data glitch / illiquid print); cap wicks at wick x body
    n=p['n']; cut=n
    for t in range(1,n):
        if p['c'][t]/p['c'][t-1]>jump: cut=t;break
    for k in 'ohlcv': p[k]=p[k][:cut]
    p['n']=cut
    for t in range(cut):
        hi=max(p['o'][t],p['c'][t]); lo=min(p['o'][t],p['c'][t])
        p['h'][t]=min(p['h'][t],hi*wick); p['l'][t]=max(p['l'][t],lo/wick)
    p['cut']=cut<n
    return p
def pools():
    a=load('pools-oct28.json'); b=load('pools-nov.json')
    for i,p in enumerate(a): p['src']='oct'
    for p in b: p['src']='nov'
    a=[clean(p) for p in a]; b=[clean(p) for p in b]
    a=[p for p in a if p['n']>70]; b=[p for p in b if p['n']>70]
    return a,b
def net(r): return (1+r)*(1-COST)-1
def stats(x):
    n=len(x)
    if n<2: return dict(n=n)
    m=sum(x)/n; s=sorted(x)
    var=sum((a-m)**2 for a in x)/(n-1); sd=var**.5
    sk=sum((a-m)**3 for a in x)/n/(sd**3+1e-12); ku=sum((a-m)**4 for a in x)/n/(sd**4+1e-12)-3
    q=lambda f:s[min(n-1,int(f*n))]
    return dict(n=n,mean=m,med=q(.5),sd=sd,se=sd/n**.5,skew=sk,xkurt=ku,p5=q(.05),p25=q(.25),p75=q(.75),p95=q(.95),p99=q(.99),pos=sum(1 for a in x if a>0)/n)

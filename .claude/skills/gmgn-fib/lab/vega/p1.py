from lib import *
import statistics as S
a,b=pools(); allp=a+b
print('pools',len(a),len(b),'age0 min median',S.median(p['age0'] for p in allp))
Hs=[1,2,5,15,30,60,120]
def fwd(ps,H,minstart=5):
    out=[];per=[]
    for p in ps:
        c=p['c'];x=[]
        for t in range(minstart,p['n']-H):
            x.append(c[t+H]/c[t]-1)
        out+=x
        if x: per.append(sum(x)/len(x))
    return out,per
print('H | n | gross mean | median | p5 | p95 | p99 | skew | xkurt | %net>0 | net mean | net median | pool-eq-weight gross mean')
for H in Hs:
    x,per=fwd(allp,H)
    s=stats(x); nx=[net(r) for r in x]; ns=stats(nx)
    print(H,s['n'],f"{s['mean']*100:.2f} {s['med']*100:.2f} {s['p5']*100:.1f} {s['p95']*100:.1f} {s['p99']*100:.1f} sk{s['skew']:.1f} k{s['xkurt']:.0f} pos={ns['pos']*100:.1f}% netmean={ns['mean']*100:.2f} netmed={ns['med']*100:.2f} poolEq={sum(per)/len(per)*100:.2f}")
# winsorized/ log mean (geometric) — what a repeated bettor gets
print('log growth per trade (net), H:')
for H in Hs:
    x,_=fwd(allp,H); g=sum(math.log(max(1e-6,1+net(r))) for r in x)/len(x)
    print(H,f"{g*100:.2f}% per trade -> expgrowth {math.exp(g)-1:.2%}")
# hit rates +x before -y within 120 min, from random entry, using high/low of minutes, intrabar ambiguity: stop first
print('hit-rate +x before -y (stop-first on ambiguous bars), horizon 60m, gross thresholds; EV net')
def hit(ps,tp,sl,H,minstart=5):
    res=[]
    for p in ps:
        c,h,l=p['c'],p['h'],p['l']
        for t in range(minstart,p['n']-1):
            e=c[t];r=None
            for k in range(t+1,min(p['n'],t+1+H)):
                if l[k]<=e*(1-sl): r=-sl;break
                if h[k]>=e*(1+tp): r=tp;break
            if r is None: r=c[min(p['n']-1,t+H)]/e-1
            res.append(r)
    return res
for tp,sl in [(.05,.05),(.10,.05),(.10,.10),(.2,.1),(.3,.1),(.5,.2),(1.0,.25),(.9,.25)]:
    r=hit(allp,tp,sl,60); n=len(r)
    wins=sum(1 for x in r if x==tp)/n; loss=sum(1 for x in r if x==-sl)/n
    print(f"tp{tp:.2f} sl{sl:.2f} n={n} P(tp)={wins:.3f} P(sl)={loss:.3f} breakeven-need P(tp)>={(sl+COST+.0)/(tp+sl):.3f} netEV={sum(net(x) for x in r)/n*100:.2f}%")

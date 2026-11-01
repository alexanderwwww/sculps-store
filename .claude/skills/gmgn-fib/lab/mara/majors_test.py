# Majors on 1H candles (OKX, ~180d): mean reversion, trend, hour-of-day, weekday. Split BOTH by coin (pool-wise) and by time (first 60% / last 40%).
import json,statistics as S,itertools,sys
d=json.load(open("data/majors.json"))
COINS=[k[:-3] for k in d if k.endswith("_1H") and len(d[k])>2000]
H={c:d[c+"_1H"] for c in COINS}   # [ts_ms,o,h,l,c,vol]
print("coins:",COINS,"candles each",{c:len(H[c]) for c in COINS})
COST=float(sys.argv[1]) if len(sys.argv)>1 else 0.003
def sig_mr(c,i,x,w): return c[i][4]/c[i-w][4]-1<=-x
def sig_tr(c,i,x,w): return c[i][4]/c[i-w][4]-1>=x
def sma(c,i,n): return sum(r[4] for r in c[i-n+1:i+1])/n
def trades(c,sig,hold,lo,hi):
    r=[];i=max(lo,60)
    while i<min(hi,len(c)-hold-1):
        if sig(c,i):
            r.append(c[i+hold][4]/c[i][4]-1-COST); i+=hold
        else: i+=1
    return r
def st(r):
    n=len(r);m=sum(r)/n if n else 0;sd=S.pstdev(r) if n>1 else 0
    return n,m,(sd/n**.5 if n else 0)
cfgs=[]
for x,w in itertools.product((0.03,0.05,0.08),(1,4)):
    for h in (1,4,12,24): cfgs.append(("MR",x,w,h,lambda c,i,x=x,w=w:sig_mr(c,i,x,w)))
for x,w in itertools.product((0.05,0.10),(24,)):
    for h in (4,12,24): cfgs.append(("TREND",x,w,h,lambda c,i,x=x,w=w:sig_tr(c,i,x,w)))
for a,b in ((12,48),(24,96)):
    for h in (12,24): cfgs.append(("SMAx",a,b,h,lambda c,i,a=a,b=b:i>=b and sma(c,i,a)>sma(c,i,b) and sma(c,i-1,a)<=sma(c,i-1,b)))
tc=COINS[::2];ec=COINS[1::2]
print(f"cost {COST*100:.2f}% round trip; {len(cfgs)} configs. Train coins {tc} test coins {ec}")
print("cfg | A: train coins first60%time | B: test coins last40%time | C: all coins last40% | (n, mean%, se%)")
good=[]
for name,x,w,h,s in cfgs:
    def agg(cs,lo_f,hi_f):
        r=[]
        for c in cs:
            n=len(H[c]); r+=trades(H[c],s,h,int(n*lo_f),int(n*hi_f))
        return st(r)
    A=agg(tc,0,.6);B=agg(ec,.6,1);Cc=agg(COINS,.6,1);F=agg(COINS,0,.6)
    f=lambda t:f"{t[0]:4d} {t[1]*100:6.2f}({t[2]*100:4.2f})"
    flag="  <== + both" if A[1]>0 and B[1]>0 else ""
    if A[1]>0 and B[1]>0: good.append((name,x,w,h,A,B))
    print(f"{name:5s} x{x} w{w} h{h:2d} | {f(A)} | {f(B)} | {f(Cc)}{flag}")
print("configs positive on both A and B:",len(good),"of",len(cfgs))
# buy and hold per coin over the window
print("buy&hold last 180d:",{c:round(H[c][-1][4]/H[c][0][4]-1,2) for c in COINS})
# hour-of-day: mean log return per UTC hour, first half vs second half
import math,datetime
def prof(cs,lo,hi,key):
    b={}
    for c in cs:
        n=len(H[c])
        for i in range(max(1,int(n*lo)),int(n*hi)):
            t=datetime.datetime.utcfromtimestamp(H[c][i][0]/1000)
            k=key(t); b.setdefault(k,[]).append(math.log(H[c][i][4]/H[c][i-1][4]))
    return b
for nm,key,K in (("UTC hour",lambda t:t.hour,24),("weekday(0=Mon)",lambda t:t.weekday(),7)):
    p1=prof(COINS,0,.5,key);p2=prof(COINS,.5,1,key)
    m1=[S.mean(p1[k])*1e4 for k in range(K)];m2=[S.mean(p2[k])*1e4 for k in range(K)]
    mean1=S.mean(m1);mean2=S.mean(m2)
    cor=sum((a-mean1)*(b-mean2) for a,b in zip(m1,m2))/math.sqrt(sum((a-mean1)**2 for a in m1)*sum((b-mean2)**2 for b in m2))
    # abs-return (volatility) profile
    v1=[S.mean([abs(x) for x in p1[k]])*1e4 for k in range(K)];v2=[S.mean([abs(x) for x in p2[k]])*1e4 for k in range(K)]
    a1,a2=S.mean(v1),S.mean(v2); cv=sum((a-a1)*(b-a2) for a,b in zip(v1,v2))/math.sqrt(sum((a-a1)**2 for a in v1)*sum((b-a2)**2 for b in v2))
    print(f"{nm}: corr of MEAN-return profile first vs second half = {cor:.2f}; corr of VOLATILITY (|ret|) profile = {cv:.2f}")
    print("   mean bp/hr H1:",[round(x,1) for x in m1]); print("   mean bp/hr H2:",[round(x,1) for x in m2])
    print("   |ret| bp H1:",[round(x) for x in v1]); 

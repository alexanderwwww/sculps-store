# Relative value vs SOL: buy X (paid in SOL) when log(X/SOL) z-score over 72h <= -z, sell after h hours. Return measured in SOL. cost 0.4% (two swaps via SOL).
import json,math,statistics as S
d=json.load(open("data/majors.json"));COINS=[k[:-3] for k in d if k.endswith("_1H") and len(d[k])>2000 and k[:-3]!="SOL"]
sol={r[0]:r[4] for r in d["SOL_1H"]}
COST=0.004
def series(c):
    t=[];v=[]
    for r in d[c+"_1H"]:
        if r[0] in sol: t.append(r[0]);v.append(math.log(r[4]/sol[r[0]]))
    return t,v
def run(c,z,h,lo,hi,W=72):
    t,v=series(c);n=len(v);r=[];i=max(W,int(n*lo))
    while i<min(int(n*hi),n-h-1):
        w=v[i-W:i];m=S.mean(w);sd=S.pstdev(w)
        if sd>0 and (v[i]-m)/sd<=-z: r.append(math.exp(v[i+h]-v[i])-1-COST);i+=h
        else: i+=1
    return r
def st(r):
    n=len(r);return n,(S.mean(r) if n else 0),(S.pstdev(r)/n**.5 if n>1 else 0)
tc=COINS[::2];ec=COINS[1::2]
print("z h | A train coins first60% | B test coins last40% | C all coins last40%")
for z in (1.5,2,2.5,3):
    for h in (6,24,72):
        A=[x for c in tc for x in run(c,z,h,0,.6)];B=[x for c in ec for x in run(c,z,h,.6,1)];C=[x for c in COINS for x in run(c,z,h,.6,1)]
        f=lambda t:f"n={t[0]:4d} {t[1]*100:6.2f}%({t[2]*100:4.2f})"
        print(f"{z} {h:3d} | {f(st(A))} | {f(st(B))} | {f(st(C))}")

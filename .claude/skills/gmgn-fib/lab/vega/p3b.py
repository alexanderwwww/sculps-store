from engine import *
import random,math
tr,te1,te2=split_pools(); allp=tr+te1+te2
cfg=dict(trail=.25,sl=.3,hold=120)
r=[x for _,_,x in run(allp,sig_breakout,cfg,'slip',10)]; rs=sorted(r)
RENT,MIN=.002,.003
def path(rets,f,k,W0,T,rnd):
    W=W0
    for t in range(T):
        free=W-RENT*k
        kk=k
        while kk>1 and free/kk<MIN: kk-=1; free=W-RENT*kk
        if free<MIN: return W,False
        stake=max(MIN,min(free/kk, f*free/kk))   # f applies to free capital per slot, floored at MIN
        W+=sum(stake*rnd.choice(rets) for _ in range(kk))
    return W,True
def mc(rets,f,k,W0,T=100,N=2000):
    rnd=random.Random(7);o=[path(rets,f,k,W0,T,rnd) for _ in range(N)]
    ws=sorted(w for w,_ in o);a=sum(1 for _,s in o if s)/N
    return dict(alive=a,med=ws[N//2]/W0,p25=ws[N//4]/W0,p75=ws[3*N//4]/W0,p2=sum(1 for w in ws if w>=2*W0)/N,p5=sum(1 for w in ws if w>=5*W0)/N)
print('effective min fraction of wallet at W=0.0097, 1 slot:',MIN/(0.0097-RENT))
for name,rets in [('measured (mean +5.7%)',r),('drop top-3 winners (mean +0.3%)',rs[:-3]),('thin-scalp proxy: random entry, tp.1 sl.05',None)]:
    if rets is None:
        rets=[x for _,_,x in run(allp,lambda p:sig_random(p,step=8),dict(tp=.1,sl=.05,hold=15),'slip')]
    print('--',name,'mean %.2f%% n=%d'%(sum(rets)/len(rets)*100,len(rets)))
    for f in (.15,.3,.5,1.0):
        m=mc(rets,f,1,.0097); print(f"   k=1 f={f}: stake floor binds={f*(0.0097-RENT)<MIN}  alive@100 {m['alive']:.2f}  median {m['med']:.2f}x  p25 {m['p25']:.2f}x p75 {m['p75']:.2f}x  P(>=2x) {m['p2']:.2f} P(>=5x) {m['p5']:.2f}")
print('\n1 vs 3 slots, measured, f=0.3, 100 rounds')
for W in (.0097,.015,.02,.03,.05):
    for k in (1,2,3):
        if k*(MIN+RENT)>W: print(f'  W={W} k={k}: infeasible (needs {k*(MIN+RENT):.3f})');continue
        m=mc(r,.3,k,W,N=1200); print(f"  W={W} k={k}: alive {m['alive']:.2f} median {m['med']:.2f}x p25 {m['p25']:.2f}x P(>=2x) {m['p2']:.2f}")

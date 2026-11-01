from engine import *
import random, math
tr,te1,te2=split_pools(); allp=tr+te1+te2
cfg=dict(trail=.25,sl=.3,hold=120)
res=run(allp,sig_breakout,cfg,'slip',10)
r=[x for _,_,x in res]; n=len(r)
print('breakout trail.25 slip n',n,'mean %.2f%% med %.2f%% win %.2f'%(sum(r)/n*100,sorted(r)[n//2]*100,sum(1 for x in r if x>0)/n))
def kelly(r,fmax=1.0):
    best=(0,-9)
    for i in range(0,201):
        f=i/200*fmax
        g=sum(math.log(max(1e-9,1+f*x)) for x in r)/len(r)
        if g>best[1]: best=(f,g)
    return best
def show(name,rr):
    f,g=kelly(rr); print(f"{name}: mean {sum(rr)/len(rr)*100:.2f}% -> Kelly f*={f:.3f}, growth/trade at f*={g*100:.3f}%")
    return f
fk=show('empirical measured',r)
# haircuts: shrink the tail: drop top-k winners
rs=sorted(r)
for k in (1,3,5):
    show(f'drop top {k} trades',rs[:-k])
# shift by -x so the mean falls
for sh in (.02,.04,.06):
    show(f'measured minus {sh*100:.0f}pts',[x-sh for x in r])
# train-only / test-only kelly
tr_r=[x for i,t,x in run(tr,sig_breakout,cfg,'slip',10)]; te_r=[x for pl in (te1,te2) for i,t,x in run(pl,sig_breakout,cfg,'slip',10)]
show('train-only',tr_r); show('test-only',te_r)
# Bootstrap distribution of f* (resample by pool)
random.seed(3)
byp={}
for i,t,x in res: byp.setdefault(i,[]).append(x)
keys=list(byp); fs=[]
for _ in range(300):
    rr=[]
    for k in random.choices(keys,k=len(keys)): rr+=byp[k]
    fs.append(kelly(rr)[0])
fs.sort(); print('bootstrap f* quantiles 5/25/50/75/95:',[fs[int(q*len(fs))] for q in (.05,.25,.5,.75,.95)],' P(f*=0)=',sum(1 for f in fs if f==0)/len(fs))
# wallet simulation
RENT=.002; MIN=.003; W0=.0097
def simulate(rets,f,k_pos,W0=W0,T=200,rent=RENT,seed=0):
    rnd=random.Random(seed);W=W0
    for t in range(T):
        # k_pos concurrent positions, each trade independent, resolved in same round
        avail=W-rent*k_pos
        stake=min(avail*f/k_pos*k_pos, avail)/k_pos   # f of free capital split in k positions
        if stake<MIN:
            k=int((W)/(MIN+rent))
            if k<1: return W,'dead'
            k_use=k; stake=min(MIN, (W-rent*k_use)/k_use) ; 
            if stake<MIN: return W,'dead'
            k_eff=k_use
        else: k_eff=k_pos
        d=0
        for _ in range(k_eff): d+=stake*rnd.choice(rets)
        W+=d
        if W<MIN+RENT: return W,'dead'
    return W,'alive'
def mc(rets,f,k,W0=W0,N=1500,T=200):
    out=[simulate(rets,f,k,W0,T,seed=s) for s in range(N)]
    ws=sorted(w for w,_ in out); dead=sum(1 for _,s in out if s=='dead')/N
    mean=sum(ws)/N
    return dict(med=ws[N//2],mean=mean,p10=ws[N//10],p90=ws[9*N//10],dead=dead,x2=sum(1 for w in ws if w>=2*W0)/N,x10=sum(1 for w in ws if w>=10*W0)/N)
print('\nWALLET SIM  start %.4f SOL, 200 trades, per-trade bootstrap of edge distribution'%W0)
scen={'measured':r,'minus top-3 trades':rs[:-3],'edge shaved to ~0 (mean-5pts)':[x-.05 for x in r]}
for sn,rets in scen.items():
    print(' --',sn,'mean %.2f%%'%(sum(rets)/len(rets)*100))
    for f in (0.25,0.5,0.8,1.0):
        m=mc(rets,f,1); print(f"   1 position f={f}: med W {m['med']:.4f} mean {m['mean']:.4f} p10 {m['p10']:.4f} p90 {m['p90']:.4f} dead {m['dead']:.2f} P(2x) {m['x2']:.2f} P(10x) {m['x10']:.3f}")
# is 2 or 3 positions feasible at 0.0097?
for k in (1,2,3): print('k',k,'needs',k*(MIN+RENT),'SOL min vs wallet',W0,'feasible' if k*(MIN+RENT)<=W0 else 'IMPOSSIBLE')
# crossover wallet: compare 1 big vs 3 small at larger wallets using measured edge, f scaled by Kelly
print('\nWALLET-SIZE CROSSOVER, measured edge, f=0.5 of free capital, 200 trades')
for W in (.0097,.0155,.025,.05,.1):
    for k in (1,2,3):
        if k*(MIN+RENT)>W: print(f"  W={W} k={k}: infeasible");continue
        m=mc(r,0.5,k,W0=W,N=600); print(f"  W={W} k={k}: med {m['med']/W:.2f}x mean {m['mean']/W:.2f}x p10 {m['p10']/W:.2f}x dead {m['dead']:.2f}")

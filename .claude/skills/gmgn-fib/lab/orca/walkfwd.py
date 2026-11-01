exec(open('sim_lp.py').read())
import statistics as st
MAJ=['SOL / USDC','WETH / SOL','WBTC / SOL','cbBTC / USDC','cbBTC / SOL','JitoSOL / SOL','HYPE / SOL','ZEC / USDC','ZEC / SOL','PUMP / SOL']
def net(res): return [r['fees']+r['il']-r['cost'] for r in res]
def wkloss(n): 
    w=[sum(n[i:i+7]) for i in range(0,len(n)-6)]; return (sum(x<0 for x in w)/len(w) if w else None, min(w) if w else None)
rows=[]
for C in (100,1000,10000):
    cand=[]
    for c in sel:
        for w in WID[c['stable']]:
            tr=run(c,w,C,0,14); te=run(c,w,C,14,None)
            if len(tr)<10 or len(te)<8: continue
            cand.append((st.mean(net(tr)),st.mean(net(te)),c['name'],c['dex'],w,te))
    cand.sort(key=lambda x:-x[0])
    print(f"=== C={C}: pick best pool+width on days 1-14, score on days 15-28 (n candidates {len(cand)})")
    for top in (1,3,5):
        sel_=cand[:top]; m=st.mean(x[1] for x in sel_)
        print(f"  top{top}: train {100*st.mean(x[0] for x in sel_):.3f} -> test {100*m:.3f} %/day  picks: {[ (x[2],x[3],x[4]) for x in sel_]}")
    # all-candidate average on test (no selection) and fraction positive
    print(f"  no-selection mean test {100*st.mean(x[1] for x in cand):.3f} %/day; share >0: {100*sum(x[1]>0 for x in cand)/len(cand):.0f}%")
    # majors basket, fixed width 3% (1%?), whole 28 days
    for w in (0.01,0.03):
        tot=None;cnt=0
        for c in sel:
            if c['name'] in MAJ and c['stable']=='V' and not (c['name'] in('ZEC / USDC','ZEC / SOL','PUMP / SOL','HYPE / SOL')):
                r=run(c,w,C); n=net(r); cnt+=1
                tot=n if tot is None else [a+b for a,b in zip(tot,n)]
        avg=[x/cnt for x in tot]; lw,ww=wkloss(avg)
        print(f"  MAJORS basket (SOL/USDC x3 venues, WETH/SOL, WBTC/SOL, cbBTC/USDC, cbBTC/SOL; n={cnt}) w=+-{w*100:.0f}%: NET {100*st.mean(avg):.3f} %/day, worst day {100*min(avg):.2f}%, loss-weeks {100*lw:.0f}%, worst week {100*ww:.2f}%")

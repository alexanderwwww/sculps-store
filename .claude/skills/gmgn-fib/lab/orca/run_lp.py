exec(open('sim_lp.py').read())
import statistics as st
def stats(res):
    net=[r['fees']+r['il']-r['cost'] for r in res]
    raw=[r['fees']+r['raw']-r['cost'] for r in res]
    wk=[sum(net[i:i+7]) for i in range(0,len(net)-6)]
    wkr=[sum(raw[i:i+7]) for i in range(0,len(raw)-6)]
    return dict(fees=st.mean(r['fees'] for r in res),il=st.mean(r['il'] for r in res),cost=st.mean(r['cost'] for r in res),
      net=st.mean(net),raw=st.mean(raw),worst_day=min(net),worst_week=min(wk) if wk else None,
      loss_weeks=sum(1 for x in wk if x<0)/max(1,len(wk)),loss_weeks_raw=sum(1 for x in wkr if x<0)/max(1,len(wkr)),worst_week_raw=min(wkr) if wkr else None,
      p10=sorted(net)[int(len(net)*0.1)],p90=sorted(net)[int(len(net)*0.9)])
out=[]
for c in sel:
    for w in WID[c['stable']]:
        for C in (100,1000,10000):
            res=run(c,w,C)
            if len(res)<20: continue
            s=stats(res); s.update(pool=c['name'],dex=c['dex'],w=w,C=C,cls=c['stable'],tvl=c['tvl']); out.append(s)
json.dump(out,open('lp_results.json','w'))
print(len(out),'rows; classes:',{k:sum(1 for c in sel if c['stable']==k) for k in 'SPV'})
for cls in 'SPV':
  for C in (100,1000,10000):
    print('--- class',cls,'capital',C)
    for w in WID[cls]:
        rows=[r for r in out if r['C']==C and r['w']==w and r['cls']==cls]
        if not rows: continue
        m=lambda k:100*st.mean(r[k] for r in rows)
        print(f"  w=+-{w*100:.2f}% n={len(rows):2d} MEAN fees {m('fees'):6.3f} il {m('il'):7.3f} cost {m('cost'):6.3f} NET {m('net'):7.3f} %/day | incl.directional {m('raw'):7.3f} | share of pool-widths with NET>0: {100*sum(r['net']>0 for r in rows)/len(rows):.0f}% | loss-weeks(avg) {100*st.mean(r['loss_weeks'] for r in rows):.0f}% worstwk(avg) {m('worst_week'):.2f}%")
print()
print('PER POOL, C=1000, ranked by NET (all widths):')
rows=sorted([r for r in out if r['C']==1000],key=lambda r:-r['net'])
for r in rows[:14]+rows[-6:]:
    print(f"  {r['pool']:20s} {r['dex']:12s} {r['cls']} w={r['w']*100:5.2f}% fees {100*r['fees']:.3f} il {100*r['il']:.3f} cost {100*r['cost']:.3f} NET {100*r['net']:.3f} %/day lossWk {100*r['loss_weeks']:.0f}% worstWk {100*r['worst_week']:.2f}% tvl {r['tvl']/1e6:.1f}M")

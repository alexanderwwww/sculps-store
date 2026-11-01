from engine import *
tr,te1,te2=split_pools(); allp=tr+te1+te2
alive=[p for p in allp if p['liq']>=100 and p['name'].split('/')[-1].strip()!='USDC']
dead=[p for p in allp if p['liq']<100]
FAM={'time h5':dict(sl=.5,hold=5),'time h30':dict(sl=.5,hold=30),'time h120':dict(sl=.5,hold=120),
 'fix tp.1 sl.07 h8':dict(tp=.1,sl=.07,hold=8),'fix tp.3 sl.1 h60':dict(tp=.3,sl=.1,hold=60),'fix tp.9 sl.25 h120':dict(tp=.9,sl=.25,hold=120),
 'trail.1 h120':dict(trail=.1,sl=.3,hold=120),'trail.25 h120':dict(trail=.25,sl=.3,hold=120),'trail.4 h120':dict(trail=.4,sl=.4,hold=120),
 'part50@.5+trail.25':dict(part=(.5,.5),be=True,trail=.25,sl=.3,hold=120),'ratchet 1.0->.5':dict(ratchet=(1.0,.5),sl=.25,hold=120)}
ENT={'random(alive)':(lambda p:sig_random(p,step=4),0),'mom5>0 age<=90(alive)':(lambda p:sig_mom(p,agemax=90),10),'mom5>0 age<=30(alive)':(lambda p:sig_mom(p,agemax=30),10),'breakout(alive)':(sig_breakout,10)}
print('NET mean % ±se (pool-cluster)  [gross = (1+net)/0.96-1 ~ net+4]; alive-now pools only, all',len(alive))
print('%-22s'%'exit',*['%-24s'%k for k in ENT])
for fn,cf in FAM.items():
    cells=[]
    for en,(sf,gap) in ENT.items():
        s=summ(run(alive,sf,cf,'slip',gap)); cells.append('%6.2f ±%4.1f (n%d)'%(s['mean']*100,s['se']*100,s['n']))
    print('%-22s'%fn,*['%-24s'%c for c in cells])
# Optional stopping check: random entries, gross mean per exit (should be ~0 if martingale)
print('\nGROSS mean of random entries, close-fill (no stop slip) per exit, all pools — optional stopping check')
for fn,cf in list(FAM.items())[:9]:
    res=run(allp,lambda p:sig_random(p,step=6),cf,'wick',0); g=[(1+x)/(1-COST)-1 for _,_,x in res]
    s=summ([(i,t,x) for (i,t,_),x in zip(res,g)])
    print('%-22s gross %6.2f%% ±%4.1f'%(fn,s['mean']*100,s['se']*100))

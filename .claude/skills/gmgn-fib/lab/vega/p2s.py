from engine import *
import itertools,sys,json
tr,te1,te2=split_pools()
print('pools train/testOct/testNov',len(tr),len(te1),len(te2))
sigs={'random':lambda p:sig_random(p),'breakout':sig_breakout,'3green':sig_3green}
gaps={'random':0,'breakout':10,'3green':10}
cfgs={}
for tp,sl,h in itertools.product([.1,.3,.9],[.1,.25],[15,60,120]): cfgs[f'fix tp{tp} sl{sl} h{h}']=dict(tp=tp,sl=sl,hold=h)
for tr_,h in itertools.product([.1,.2,.35,.5],[60,120]): cfgs[f'trail{tr_} sl.35 h{h}']=dict(trail=tr_,sl=.35,hold=h)
for h in [2,5,15,30,60,120]: cfgs[f'time h{h} sl.5']=dict(sl=.5,hold=h)
for a,tr_ in itertools.product([.5,1.0],[.25,.4]): cfgs[f'part50@{a} trail{tr_} be']=dict(part=(a,.5),be=True,trail=tr_,sl=.3,hold=120)
for g,k in [(.3,.1),(.6,.3),(1.0,.5)]: cfgs[f'ratchet g{g}->{k} sl.25 h120']=dict(ratchet=(g,k),sl=.25,hold=120)
print(len(cfgs),'exit configs')
out={}
for mode in ['slip']:
  for sn,sf in sigs.items():
    rows=[]
    for cn,cf in cfgs.items():
        a=summ(run(tr,sf,cf,mode,gaps[sn])); b=summ(run(te1,sf,cf,mode,gaps[sn])); c=summ(run(te2,sf,cf,mode,gaps[sn]))
        rows.append((cn,a,b,c))
    out[(mode,sn)]=rows
    rows.sort(key=lambda r:-r[1]['mean'] if r[1]['n']>=15 else 1e9*0+9)
    print(f'\n=== entry {sn} / fill {mode} : top 6 by TRAIN mean (n>=15) -> test ===')
    k=0
    for cn,a,b,c in rows:
        if a['n']<15: continue
        f=lambda s:f"n{s['n']:4d} {s['mean']*100:6.2f}%±{s['se']*100:4.1f}"
        print(f"{cn:34s} TR {f(a)} | TeOct {f(b)} | TeNov {f(c)}")
        k+=1
        if k>=6: break
    allm=[r[1]['mean'] for r in rows if r[1]['n']>=15]
    print('  n configs',len(allm),'; #train>0:',sum(1 for x in allm if x>0))
    # exit family averages on TEST (all configs)
    fam={}
    for cn,a,b,c in rows:
        f_=cn.split()[0].split('@')[0].rstrip('0123456789.')
        n=b['n']+c['n']
        if n==0: continue
        m=(b['mean']*b['n']+c['mean']*c['n'])/n if b['n'] and c['n'] else (b['mean'] if b['n'] else c['mean'])
        fam.setdefault(f_,[]).append(m)
    print('  family mean net on test (avg over configs):',{k:round(sum(v)/len(v)*100,2) for k,v in fam.items()})

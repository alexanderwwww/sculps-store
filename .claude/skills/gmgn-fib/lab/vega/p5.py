from engine import *
tr,te1,te2=split_pools(); allp=tr+te1+te2
EXT=dict(trail=.25,sl=.3,hold=120)
dead=[p for p in allp if p['liq']<100]; alive=[p for p in allp if p['liq']>=100]
print('pools dead-now(liq<$100)',len(dead),'alive',len(alive))
f=lambda s:f"n{s['n']:4d} {s['mean']*100:6.2f}%±{s['se']*100:4.1f} win{s['win']:.2f}"
for nm,ps in (('dead-now',dead),('alive-now',alive)):
    for lab,sf in (('mom5>0 age<=90',lambda p:sig_mom(p,agemax=90)),('mom5>0 age<=30',lambda p:sig_mom(p,agemax=30)),('mom5>0 age>90',lambda p:sig_mom(p,agemin=90)),('breakout',sig_breakout)):
        print(nm,lab,f(summ(run(ps,sf,EXT,'slip',10))))
# placebo: shuffle -- entries on time-reversed price path? time-reversal keeps vol structure, kills trend persistence
import copy
rev=[]
for p in allp:
    q=copy.deepcopy(p)
    for k in 'ohlc': q[k]=q[k][::-1]
    q['v']=q['v'][::-1]; q['o'],q['c']=q['c'],q['o']
    rev.append(q)
print('PLACEBO time-reversed paths, mom5>0 age<=90:',f(summ(run(rev,lambda p:sig_mom(p,agemax=90),EXT,'slip',10))))

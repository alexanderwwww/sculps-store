from engine import *
import itertools
tr,te1,te2=split_pools(); allp=tr+te1+te2
rows=[]
for tr_,sl,h in itertools.product([.15,.25,.4,.6],[.25,.4],[60,120,240]):
    cfg=dict(trail=tr_,sl=sl,hold=h)
    for mode in ['slip','close']:
        res=run(allp,sig_breakout,cfg,mode,10)
        s=summ(res); r=sorted(x for _,_,x in res)
        trim=sum(r[:-3])/(len(r)-3)
        rows.append((mode,tr_,sl,h,s['n'],s['mean'],s['se'],s['win'],s['med'],trim,r[-1],r[0]))
for x in rows: print("%5s trail%.2f sl%.2f h%3d n%d mean %.2f%% se %.1f win %.2f med %.2f%% trim-top3 %.2f%% best %.0f%% worst %.0f%%"%(x[0],x[1],x[2],x[3],x[4],x[5]*100,x[6]*100,x[7],x[8]*100,x[9]*100,x[10]*100,x[11]*100))

from common import *
src=open('p3.py').read().split("# baselines")[0]
exec(src)
ev=[]
for (p,C,H,L,V,a0) in DATA:
    i=6;n=len(C)
    while i<n-125:
        if C[i]/C[i-5]-1>=0.20 and V[i]>0 and a0+i>=3:
            ev.append((p,C,H,L,V,a0,i));i+=30
        i+=1
def outs(entries,h,tp,sl):
    d={'train':[],'test':[]}
    for (p,C,H,L,V,a0,i) in entries:
        r=trade(C,H,L,i,h,tp,sl)
        if r is not None:d[p['split']].append(r)
    return d
dcb=[];sec=[];dump=0
for (p,C,H,L,V,a0,i) in ev:
    pk=C[i];j=None
    for q in range(i+1,min(len(C)-62,i+60)):
        pk=max(pk,C[q])
        if j is None and C[q]<=0.6*pk:j=q   # causal dump flag
        if j is not None and q>j:
            if C[q]/C[q-1]-1>=0.05 and C[q]<0.75*pk and V[q]>0 and not any(x[0] is p and x[6]==i for x in dcb):
                dcb.append((p,C,H,L,V,a0,i,)[:6]+(q,));break
            if C[q]>=0.8*pk and not any(x[0] is p and x[6]==i for x in sec):
                sec.append((p,C,H,L,V,a0,q));break
    if j is not None:dump+=1
print('events',len(ev),'dumped>=40%',dump,'dcb',len(dcb),'second',len(sec))
first=[e for e in ev]
for h,tp,sl in((30,.15,.10),(60,.5,.25),(60,9,.25)):
    for nm,E in(('first pump',first),('dead-cat bounce',dcb),('second leg (reclaim 80% of peak)',sec)):
        show('%-34s h%d tp%.0f sl%.0f'%(nm,h,tp*100,sl*100),outs(E,h,tp,sl))
print('--- age>=180 at event')
for nm,E in(('first pump',first),('dead-cat bounce',dcb),('second leg',sec)):
    show(nm+' age>=180 h60 tp50 sl25',outs([e for e in E if e[5]+e[6]>=180],60,.5,.25))
print('--- age<60 at event')
for nm,E in(('first pump',first),('dead-cat bounce',dcb),('second leg',sec)):
    show(nm+' age<60 h60 tp50 sl25',outs([e for e in E if e[5]+e[6]<60],60,.5,.25))

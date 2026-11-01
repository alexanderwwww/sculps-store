from common import *
import random
random.seed(1)
P=load()
def mk(p):
    cs=p['cs'];t0=cs[0]['t']//60000;n=cs[-1]['t']//60000-t0+1
    px=[None]*n
    for k in cs:px[k['t']//60000-t0]=k
    last=None;C=[];H=[];L=[];V=[]
    for k in px:
        if k: last=k['c'];C.append(k['c']);H.append(k['h']);L.append(k['l']);V.append(k['v'])
        else: C.append(last);H.append(last);L.append(last);V.append(0)
    return C,H,L,V,(t0*60000-p['created'])/60000
def f(C,i,h): return C[i+h]/C[i]-1 if i+h<len(C) else None
ev=[]
for p in P:
    C,H,L,V,a0=mk(p)
    i=6;last=-99
    while i<len(C)-65:
        if a0+i>=3 and C[i]/C[i-5]-1>=0.20 and i-last>=30 and V[i]>0:
            ev.append((p,C,H,L,V,a0,i));last=i;i+=30
        i+=1
print('events +20%/5min',len(ev),'pools',len({e[0]['mint'] for e in ev}))
def rep(name,sel):
    print('\n--',name,len(sel))
    for h in(10,30,60):
        x=[f(e[1],e[6],h) for e in sel]
        x=[v for v in x if v is not None]
        print(' +%dm: above entry %.0f%%  below -20%% %.0f%%  med %+.1f%%  net-of-cost mean(clip) %+.1f%% med %+.1f%%'%(h,100*sum(v>0 for v in x)/len(x),100*sum(v<-.2 for v in x)/len(x),100*st.median(x),100*st.mean(min(max(v-COST,-.95),1) for v in x),100*st.median(x)-4))
rep('ALL',ev)
rep('train',[e for e in ev if e[0]['split']=='train']);rep('test',[e for e in ev if e[0]['split']=='test'])
rep('young<60min',[e for e in ev if e[5]+e[6]<60]);rep('old>=60',[e for e in ev if e[5]+e[6]>=60])
# baseline: random time same pool
base=[]
for e in ev:
    C=e[1];j=random.randrange(6,len(C)-65);base.append((e[0],C,0,0,0,0,j))
rep('baseline random minute same pools',base)
# after the pump: peak within 15m after event, then drawdown
print('\n== DEAD-CAT / SECOND LEG')
res={'dcb':[], 'sl':[], 'first':[]}
def trade(C,H,L,i,h,tp,sl):
    e=C[i]
    for k in range(1,h+1):
        if i+k>=len(C):return None
        if L[i+k]/e-1<=-sl:return -sl-COST
        if H[i+k]/e-1>=tp:return tp-COST
    return C[i+h]/e-1-COST
def run(name,entries,h=30,tp=.15,sl=.10):
    out={}
    for sp in('train','test'):
        r=[trade(C,H,L,i,h,tp,sl) for (p,C,H,L,V,a0,i0,i) in entries if p['split']==sp]
        r=[x for x in r if x is not None]
        out[sp]='n=%d mean %+.1f%% win %.0f%%'%(len(r),100*st.mean(r) if r else 0,100*sum(x>0 for x in r)/max(1,len(r)))
    print(name,'| tp%.0f sl%.0f h%d'%(tp*100,sl*100,h),'| train',out['train'],'| test',out['test'])
firsts=[];dcb=[];sec=[]
for (p,C,H,L,V,a0,i) in ev:
    firsts.append((p,C,H,L,V,a0,i,i))
    # find peak in next 20 min
    end=min(len(C)-62,i+20);pk=max(range(i,end+1),key=lambda j:C[j])
    # dump: first j>pk with C[j]<=0.6*C[pk] within 40m
    j=next((j for j in range(pk+1,min(len(C)-62,pk+40)) if C[j]<=0.6*C[pk]),None)
    if j is None:continue
    # low after dump within 20 min
    lo=min(range(j,min(len(C)-62,j+20)),key=lambda q:C[q])
    # dead-cat: first green candle closing >=5% above its open after the low (bounce confirmation)
    b=next((q for q in range(lo+1,min(len(C)-62,lo+15)) if C[q]/C[q-1]-1>=0.05),None)
    if b is not None:dcb.append((p,C,H,L,V,a0,i,b))
    # second leg: after dump, price reclaims >=75% of the peak?? use reclaim above prior-peak*0.8 after low
    s=next((q for q in range(lo+1,min(len(C)-62,lo+40)) if C[q]>=0.8*C[pk]),None)
    if s is not None:sec.append((p,C,H,L,V,a0,i,s))
print('first-pump entries',len(firsts),'dumped 40%',len([1 for _ in dcb]) ,'dcb entries',len(dcb),'second-leg entries',len(sec))
for tp,sl,h in[(.15,.10,30),(.30,.15,30),(.5,.25,60),(9,.25,60)]:
    run('FIRST PUMP (buy the +20%)',firsts,h,tp,sl);run('DEAD-CAT bounce',dcb,h,tp,sl);run('SECOND LEG reclaim 80%',sec,h,tp,sl)
# also all-matching random baseline
rb=[(p,C,H,L,V,a0,j,j) for (p,C,H,L,V,a0,j,_) in [(b[0],b[1],b[2],b[3],b[4],b[5],b[6],0) for b in base]]
# baseline needs H,L

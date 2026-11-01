from engine import *
import itertools, random, statistics as S
tr,te1,te2=split_pools()
EXT=dict(trail=.25,sl=.3,hold=120)
def xs(ps,K,topn,aw,bw,mw,upmin,cfg=EXT,rank='acc',amin=5,amax=240):
    T0=min(p['t0'] for p in ps);T1=max(p['t0']+p['n']*60000 for p in ps);res=[];rnd=random.Random(5)
    for ts in range(T0,T1,K*60000):
        cand=[]
        for i,p in enumerate(ps):
            t=(ts-p['t0'])//60000
            if t<max(amin,aw+bw+1,mw+1) or t>=p['n']-2 or t>amax or p['v'][t]<=0: continue
            acc=(sum(p['v'][t-aw+1:t+1])/aw+1)/(sum(p['v'][t-aw-bw+1:t-aw+1])/bw+1)
            mom=p['c'][t]/p['c'][t-mw]-1
            if mom<=upmin: continue
            cand.append((acc if rank=='acc' else rnd.random(),i,t))
        cand.sort(reverse=True)
        for _,i,t in cand[:topn]:
            r=sim(ps[i],t,cfg,'slip')
            if r is not None: res.append((i,t,(1+r)*(1-COST)-1))
    return res
rows=[]
for K,topn,aw,bw,mw in itertools.product([5,10,20],[1,3],[2,3,5],[15,30],[3,10]):
    out=[]
    for ps in (tr,te1,te2): out.append(summ(xs(ps,K,topn,aw,bw,mw,0.0)))
    rows.append(((K,topn,aw,bw,mw),out))
tm=[]
print('config(K,topN,accWin,baseWin,momWin) | TR | TeOct | TeNov')
ok=0
for cfg,o in rows:
    n_te=o[1]['n']+o[2]['n']
    mte=(o[1]['mean']*o[1]['n']+o[2]['mean']*o[2]['n'])/max(1,n_te)
    tm.append((o[0]['mean'],mte,n_te)); ok+= (mte>0)
print('configs',len(rows),'test(Oct+Nov pooled) mean >0 in',ok,'; train>0 in',sum(1 for a,b,c in tm if a>0))
tm.sort(reverse=True)
import math
corr=(lambda x,y:(sum((a-sum(x)/len(x))*(b-sum(y)/len(y)) for a,b in zip(x,y)))/math.sqrt(sum((a-sum(x)/len(x))**2 for a in x)*sum((b-sum(y)/len(y))**2 for b in y)))
print('rank corr train vs test mean:',round(corr([a for a,_,_ in tm],[b for _,b,_ in tm]),2))
for cfg,o in sorted(rows,key=lambda r:-r[1][0]['mean'])[:8]:
    f=lambda s:f"n{s['n']:4d} {s['mean']*100:6.2f}%±{s['se']*100:4.1f}"
    print(cfg,f(o[0]),'|',f(o[1]),'|',f(o[2]))
print('avg test mean over all configs: %.2f%%'%(sum(b for _,b,_ in tm)/len(tm)*100))
# random-rank control with same filters (momentum>0 only)
rc=[]
for K,topn in itertools.product([5,10,20],[1,3]):
    o=[summ(xs(ps,K,topn,3,15,5,0.0,rank='rand')) for ps in (tr,te1,te2)]
    n=o[1]['n']+o[2]['n'];rc.append((o[0]['mean'],(o[1]['mean']*o[1]['n']+o[2]['mean']*o[2]['n'])/n))
print('CONTROL (momentum>0 only, random rank among them): train avg %.2f%% test avg %.2f%%'%(sum(a for a,_ in rc)/len(rc)*100,sum(b for _,b in rc)/len(rc)*100))

from common import *
import pickle,collections
P=load()
def rob(xs,cap=1.0):
    return st.mean(min(max(x,-0.95),cap) for x in xs)
rows=[]
for p in P:
    cs=p['cs'];cr=p['created']
    born=(cs[0]['t']-cr)/60000<5
    for i in range(3,len(cs)-60):
        f=feats(cs,i);f['tage']=(cs[i]['t']-cr)/60000;f['born']=born
        f['p']=p['mint'];f['split']=p['split'];f['set']=p['set']
        for h in (5,10,30,60):f['f%d'%h]=fwd(cs,i,h)
        rows.append(f)
pickle.dump(rows,open('rows2.pkl','wb'))
print('rows',len(rows),'born pools',len({r['p'] for r in rows if r['born']}),'of',len(P))
def bucket(name,fn,hs=(10,30,60),sel0=lambda r:True):
    print('\n==',name)
    for k in sorted({fn(r) for r in rows if sel0(r)}):
        line=[]
        for sp in('train','test'):
            sel=[r for r in rows if sel0(r) and fn(r)==k and r['split']==sp]
            if len(sel)<60: line.append('%s n<60'%sp);continue
            o=[]
            for h in hs:
                x=[r['f%d'%h]-COST for r in sel if r['f%d'%h] is not None]
                o.append('f%d med%+.1f clipmean%+.1f'%(h,100*st.median(x),100*rob(x)))
            line.append('%s n=%d '%(sp,len(sel))+' | '.join(o))
        print(k,'  ##  '.join(line))
a=lambda r:r['tage']
bucket('true age (min since creation)',lambda r:'age%04d'%(0 if a(r)<5 else 5 if a(r)<15 else 15 if a(r)<30 else 30 if a(r)<60 else 60 if a(r)<180 else 180 if a(r)<600 else 600))
bucket('drawdown from running peak',lambda r:'dd%+03d'%(round(max(-90,r['dd']*100)/20)*20))
bucket('time since peak (min)',lambda r:'tsp%03d'%(0 if r['tsp']==0 else 1 if r['tsp']<=2 else 3 if r['tsp']<=5 else 6 if r['tsp']<=15 else 16 if r['tsp']<=40 else 41))
bucket('volume now vs peak volume',lambda r:'vrel%.1f'%(min(r['vrel'],0.99)//0.2*0.2))
bucket('upper wick share',lambda r:'uw%.1f'%(min(r['uw'],0.99)//0.25*0.25))

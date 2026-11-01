from common import *
P=load();print(len(P),'pools',sum(p['split']=='train' for p in P),'train')
rows=[]
for p in P:
    cs=p['cs']
    for i in range(3,len(cs)-60):
        f=feats(cs,i);f['p']=p['mint'];f['split']=p['split'];f['set']=p['set']
        for h in (5,10,30,60):f['f%d'%h]=fwd(cs,i,h)
        rows.append(f)
print(len(rows))
import pickle;pickle.dump(rows,open('rows.pkl','wb'))
def bucket(name,fn,hs=(10,30,60)):
    print('\n==',name)
    keys=sorted({fn(r) for r in rows})
    for k in keys:
        for sp in('train','test'):
            sel=[r for r in rows if fn(r)==k and r['split']==sp]
            if len(sel)<30:continue
            out=[]
            for h in hs:
                x=[r['f%d'%h]-COST for r in sel if r['f%d'%h] is not None];out.append('f%d %+.1f%%'%(h,100*st.mean(x)))
            print(k,sp,len(sel),' '.join(out))
bucket('age',lambda r:'a%02d'%(min(r['age'],120)//10*10))
bucket('dd',lambda r:'dd%03d'%(max(-90,round(r['dd']*100/15)*15)))
bucket('tsp',lambda r:'t%02d'%min(r['tsp'],60)//1 if r['tsp']<5 else 't%02d'%(min(r['tsp'],60)//10*10+10))
bucket('vrel',lambda r:'v%.1f'%(min(r['vrel'],1)//0.2*0.2))

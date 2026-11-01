from common import *
import pickle
rows=pickle.load(open('rows2.pkl','rb'))
def rob(xs):return st.mean(min(max(x,-.95),1.0) for x in xs)
def t(name,sel):
    o=[]
    for sp in('train','test'):
        r=[x for x in rows if x['split']==sp and sel(x)]
        if len(r)<80:o.append(sp+' n<80');continue
        s=[]
        for h in(10,30,60):
            v=[x['f%d'%h]-COST for x in r if x['f%d'%h] is not None]
            s.append('f%d med%+.1f cm%+.1f'%(h,100*st.median(v),100*rob(v)))
        o.append('%s n=%d pools=%d '%(sp,len(r),len({x['p'] for x in r}))+' '.join(s))
    print('%-46s %s'%(name,' || '.join(o)))
for lo in(60,180):
    print('--- age>=',lo)
    t('all',lambda x:x['tage']>=lo)
    t('vrel>=0.6 (volume still near its peak)',lambda x:x['tage']>=lo and x['vrel']>=.6)
    t('vrel<0.05 (volume dead)',lambda x:x['tage']>=lo and x['vrel']<.05)
    t('at peak tsp<=1 & vrel>=.3',lambda x:x['tage']>=lo and x['tsp']<=1 and x['vrel']>=.3)
    t('euphoria r5>=20%',lambda x:x['tage']>=lo and x['r5']>=.2)
    t('distribution: dd -20..-50, tsp 3-15',lambda x:x['tage']>=lo and -.5<=x['dd']<=-.2 and 3<=x['tsp']<=15)
    t('death: dd<-80 & vrel<.1',lambda x:x['tage']>=lo and x['dd']<-.8 and x['vrel']<.1)
    t('capitulation: dd<-50 & r1>=+5%',lambda x:x['tage']>=lo and x['dd']<-.5 and x['r1']>=.05)
print('--- young (born, age<30)')
t('age<30 all',lambda x:x['tage']<30)
t('age<30, dd<-30%',lambda x:x['tage']<30 and x['dd']<-.3)
t('age<30, dd>-10%',lambda x:x['tage']<30 and x['dd']>-.1)

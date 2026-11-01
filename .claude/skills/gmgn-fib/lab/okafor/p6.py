from common import *
import itertools,random,json
src=open('p3.py').read().split("# baselines")[0];exec(src)
# --- live cost of constant trading (from log + ledger)
L=json.load(open('log.json'))['lines']
sells=[l for l in L if l['type']=='sell' and 'pnl' in l and l.get('est') is not None]
allS=[l for l in L if l['type']=='sell' and 'pnl' in l]
print('log sells with pnl',len(allS),'sum pnl SOL %.5f'%sum(l['pnl'] for l in allS),'mean ret %.2f%%'%(100*st.mean(l['ret'] for l in allS)))
new=[l for l in allS if l.get('stake')==0.003]
print('stake 0.003 trades',len(new),'sum pnl %.5f'%sum(l['pnl'] for l in new),'mean %.2f%%'%(100*st.mean(l['ret'] for l in new)),'median %.2f%%'%(100*st.median(l['ret'] for l in new)))
print('est.low vs ret: exits where fill worse than decision quote by >5pts:',sum(1 for l in new if l['est'] and l['ret']-l['est']['ret']<-0.05),'of',len(new))
gap=[l['ret']-l['est']['ret'] for l in new if l['est']]
print('fill-vs-quote gap at exit: mean %.1f pts median %.1f pts worst %.1f'%(100*st.mean(gap),100*st.median(gap),100*min(gap)))
import csv
led=list(csv.DictReader(open(D+'ledger.csv')))
pct=[float(r['pct']) for r in led];hold=[float(r['hold_s']) for r in led]
print('ledger',len(pct),'mean %.2f median %.2f'%(st.mean(pct),st.median(pct)),'win %.0f%%'%(100*sum(x>0 for x in pct)/len(pct)))
for lo,hi in((0,15),(15,45),(45,120),(120,1e9)):
    x=[p for p,h in zip(pct,hold) if lo<=h<hi];print('  hold %d-%ds n=%d mean %.1f%%'%(lo,hi,len(x),st.mean(x) if x else 0))
# --- shadow trading: 48 strategies, promote on train, check test, + permutation null
def rules():
    R={}
    for m in(.02,.04,.08):R['mom%d'%(m*100)]=(lambda m:lambda C,H,L,V,i:C[i]/C[i-1]-1>=m and V[i]>0)(m)
    for b in(.1,.2):R['dip%d'%(b*100)]=(lambda b:lambda C,H,L,V,i:C[i]/max(C[i-10:i+1])-1<=-b and C[i]>C[i-1])(b)
    R['vol3x']=lambda C,H,L,V,i:V[i]>3*(sum(V[i-10:i])/10+1e-9) and C[i]>C[i-1]
    R['brk10']=lambda C,H,L,V,i:C[i]>=max(H[i-10:i]) and V[i]>1.5*(sum(V[i-10:i])/10+1e-9)
    return R
EX=[(30,.15,.10),(60,.5,.25),(60,.9,.25),(10,.05,.05)]
R=rules();res={}
for rn,rf in R.items():
    for (h,tp,sl) in EX:
        res[(rn,h,tp,sl)]=scan(rf,h,tp,sl)
print('\nstrategies shadowed',len(res))
rk=sorted(res,key=lambda k:-st.mean(res[k]['train']) if len(res[k]['train'])>=30 else 9)
for k in rk[:6]:
    print(k,'train',s(res[k]['train']),'| test',s(res[k]['test']))
pos=[k for k in res if len(res[k]['train'])>=30 and st.mean(res[k]['train'])>0]
print('positive on train',len(pos),'of which positive on test',sum(1 for k in pos if st.mean(res[k]['test'])>0))
print('mean test of train-top-5: %.2f%%'%(100*st.mean(st.mean(res[k]['test']) for k in rk[:5])))
# null: how big does the best-of-48 look by chance? bootstrap random-entry means at same n
rand=scan(lambda C,H,L,V,i:True,30,.15,.10,cool=3)['train']
sd=st.pstdev(rand)
print('single-trade sd %.1f%%; for t=3.5 at edge +2.5%% need n=%d trades'%(100*sd,(3.5*sd/.025)**2))
print('best-of-48 by pure luck expected ~ +%.1f sigma'%2.3)

from common import *
import itertools
P=load()
exec(open('p2.py').read().split("def f(C,i,h)")[0].split("P=load()")[1])  # reuse mk
SLIP=0.05  # extra gap on stops (live stops filled -13% when set at -2%)
def trade(C,H,L,i,h,tp,sl,slip=SLIP):
    e=C[i]
    for k in range(1,h+1):
        if i+k>=len(C):return None
        if L[i+k]/e-1<=-sl:return -sl-slip-COST
        if H[i+k]/e-1>=tp:return tp-COST
    return C[i+h]/e-1-COST
DATA=[(p,)+mk(p) for p in P]
def scan(rule,h,tp,sl,minage=0,cool=15):
    res={'train':[],'test':[]}
    for (p,C,H,L,V,a0) in DATA:
        last=-99
        for i in range(31,len(C)-h-1):
            if a0+i<minage or i-last<cool:continue
            if rule(C,H,L,V,i):
                r=trade(C,H,L,i,h,tp,sl)
                if r is not None:res[p['split']].append(r);last=i
    return res
def s(x):return 'n=%4d mean %+5.1f%% win %2.0f%%'%(len(x),100*st.mean(x) if x else 0,100*sum(v>0 for v in x)/max(1,len(x)))
def show(name,res,extra=''):print('%-44s train %s | test %s %s'%(name,s(res['train']),s(res['test']),extra))
# baselines
show('RANDOM minute (tp15 sl10 h30)',scan(lambda C,H,L,V,i:i%7==0,30,.15,.10))
show('ULTRA-LIKE: candle +3% (tp.6 sl2 h2)',scan(lambda C,H,L,V,i:C[i]/C[i-1]>=1.03 and V[i]>0,2,.006,.02,cool=1))
show('ULTRA-LIKE: candle +3% (tp15 sl10 h30)',scan(lambda C,H,L,V,i:C[i]/C[i-1]>=1.03 and V[i]>0,30,.15,.10,cool=1))
# contrarian: fear then exhaustion, causal
def mkrule(dd,bounce,exh):
    def rule(C,H,L,V,i):
        pk=max(H[i-30:i+1])
        if C[i]/pk-1>-dd:return False
        lo=min(L[i-5:i+1])
        if C[i]/C[i-1]-1<bounce:return False         # first green bounce candle
        if min(C[i-3:i])<=0 or C[i-1]/C[i-2]-1>0.02 and False:return False
        if exh:
            v3=sum(V[i-3:i])/3;vpk=max(V[i-30:i+1])
            if not(vpk>0 and v3<0.35*vpk):return False   # selling volume has dried up
        return V[i]>0
    return rule
print()
for dd,b,ex in itertools.product((.3,.5),(.03,.06),(False,True)):
    for (h,tp,sl) in((30,.15,.10),(60,.5,.25)):
        show('CONTRARIAN dd>=%d%% bounce>=%d%% exh=%s h%d tp%.0f sl%.0f'%(dd*100,b*100,ex,h,tp*100,sl*100),scan(mkrule(dd,b,ex),h,tp,sl))
print('\n-- same, only pools >=3h old at entry (less launch-survivor bias)')
for dd,b,ex in itertools.product((.3,.5),(.06,),(False,True)):
    show('CONTRARIAN dd>=%d%% bounce>=%d%% exh=%s h60 tp50 sl25 age>=180'%(dd*100,b*100,ex),scan(mkrule(dd,b,ex),60,.5,.25,minage=180))
show('RANDOM age>=180 (tp50 sl25 h60)',scan(lambda C,H,L,V,i:i%7==0,60,.5,.25,minage=180))

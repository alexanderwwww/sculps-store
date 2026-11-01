import json,math,statistics as st
D='/home/user/sculps-store/tools/autotrader/data/'
def load():
    a=json.load(open(D+'pools-oct28.json'));b=json.load(open(D+'pools-nov.json'))
    for p in a:p['set']='oct'
    for p in b:p['set']='nov'
    P=[p for p in a+b if len(p['cs'])>=40]
    # pool-wise split: deterministic hash of mint -> train/test
    for p in P:p['split']='train' if (sum(map(ord,p['mint']))%2==0) else 'test'
    return P
COST=0.04
def feats(cs,i):
    c=[x['c'] for x in cs[:i+1]];v=[x['v'] for x in cs[:i+1]]
    pk=max(range(i+1),key=lambda j:cs[j]['h']);peak=cs[pk]['h']
    f={}
    f['age']=i
    f['dd']=cs[i]['c']/peak-1
    f['tsp']=i-pk
    f['pumpx']=peak/cs[0]['o'] if cs[0]['o']>0 else 0
    pv=max(v);f['vrel']=(sum(v[-3:])/3)/pv if pv>0 else 0
    f['r5']=c[-1]/c[-6]-1 if i>=5 else 0
    f['r1']=c[-1]/c[-2]-1 if i>=1 else 0
    x=cs[i];rng=x['h']-x['l']
    f['uw']=(x['h']-max(x['o'],x['c']))/rng if rng>0 else 0
    f['lw']=(min(x['o'],x['c'])-x['l'])/rng if rng>0 else 0
    return f
def fwd(cs,i,h):
    if i+h>=len(cs):return None
    return cs[i+h]['c']/cs[i]['c']-1
def summ(xs):
    if not xs:return 'n=0'
    m=st.mean(xs);sd=st.pstdev(xs) or 1e-9
    return 'n=%d mean=%+.2f%% med=%+.2f%% win=%.0f%% t=%.1f'%(len(xs),100*m,100*st.median(xs),100*sum(x>0 for x in xs)/len(xs),m/(sd/math.sqrt(len(xs))))

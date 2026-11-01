import json,glob,os,sys,math,statistics as st,itertools
bar=sys.argv[1]; agg=int(sys.argv[2]) if len(sys.argv)>2 else 1   # agg: combine k bars (5m->15m)
files=sorted(glob.glob(f'data/okx_*_{bar}.json'))
def load(f):
    r=json.load(open(f))
    if agg>1:
        r=[[r[i][0],r[i][1],max(x[2] for x in r[i:i+agg]),min(x[3] for x in r[i:i+agg]),r[i+agg-1][4],0] for i in range(0,len(r)-agg+1,agg)]
    return r
data={os.path.basename(f).split('_')[1].split('-')[0]:load(f) for f in files}
print({k:len(v) for k,v in data.items()})
perday={'1m':1440,'5m':288}[bar]//agg
def trades(r,L,K,H,mode,lo,hi):
    c=[x[4] for x in r]; n=len(c)
    ret=[0]+[c[i]/c[i-1]-1 for i in range(1,n)]
    W=perday  # 1 day sigma window
    out=[];i=max(W,L)+1; s2=sum(x*x for x in ret[i-W:i]); 
    i=max(W,L)+1
    end=int(n*hi); start=int(n*lo)
    # rolling sigma via cumulative sums
    cs=[0]
    for x in ret: cs.append(cs[-1]+x*x)
    last=-1
    while i<min(end,n-H-1):
        if i>=start and i>last:
            sig=math.sqrt((cs[i+1]-cs[i+1-W])/W)
            m=c[i]/c[i-L]-1
            if sig>0 and abs(m)>K*sig*math.sqrt(L):
                d=(-1 if m>0 else 1) if mode=='rev' else (1 if m>0 else -1)
                # enter at next bar open ~ close of bar i (assume enter at c[i], realistic: next open)
                e=r[i+1][1]; x=c[i+H]
                out.append((r[i][0],d*(x/e-1))); last=i+H
        i+=1
    return out
cfgs=list(itertools.product((3,6,12),(1.5,2.5,3.5),(3,6,12),('rev','mom')))
res={}
for cfg in cfgs:
    for nm,(lo,hi) in (('tr',(0,.6)),('te',(.6,1.0))):
        t=[]
        for s,r in data.items(): t+=trades(r,*cfg,lo,hi)
        res[(cfg,nm)]=t
def stat(t,cost,days):
    if not t: return None
    v=[x[1]-cost for x in t]; cum=0;pk=0;dd=0
    for x in v:
        cum+=x;pk=max(pk,cum);dd=max(dd,pk-cum)
    return len(v),st.mean(v)*100,len(v)/days,dd*100
ndays=len(next(iter(data.values())))/perday
print('configs tested:',len(cfgs),'(x2 cost levels)  days of data',round(ndays))
for cost,name in ((0.0010,'taker 0.10% rt'),(0.0004,'maker 0.04% rt (optimistic: assumes fills, no adverse selection)')):
    print('==',name,'; top5 by TRAIN net, then their TEST')
    rk=[]
    for cfg in cfgs:
        a=stat(res[(cfg,'tr')],cost,ndays*.6); 
        if a and a[0]>=100: rk.append((a[1],cfg))
    rk.sort(reverse=True)
    for _,cfg in rk[:5]:
        a=stat(res[(cfg,'tr')],cost,ndays*.6); b=stat(res[(cfg,'te')],cost,ndays*.4)
        print(cfg,'TRAIN n=%d net=%+.3f%% /day=%.1f dd=%.0f%%'%a,'| TEST', 'n=%d net=%+.3f%% /day=%.1f dd=%.0f%%'%b if b else None)
    pos=sum(1 for cfg in cfgs if (stat(res[(cfg,'te')],cost,1) or (0,-1))[1]>0 and (stat(res[(cfg,'tr')],cost,1) or (0,-1))[1]>0)
    print('configs positive in BOTH train and test:',pos,'of',len(cfgs))
# gross edge (cost 0) best test for reference
g=sorted(((stat(res[(c,'te')],0,1) or (0,-9))[1],c) for c in cfgs)[-3:]
print('best gross TEST edges (no cost):',g)

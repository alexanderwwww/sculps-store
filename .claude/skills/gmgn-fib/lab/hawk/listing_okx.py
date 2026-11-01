import json,statistics as st
D=json.load(open('data/okx_listings.json'))
rows=[]
for k,v in D.items():
    r=v['rows']
    if len(r)<200: continue
    # ensure first bar within 2h of listing
    if r[0][0]-v['list']>7200000: continue
    rows.append((v['list'],k,r))
rows.sort()
print('OKX USDT perps with >=200 hourly bars from listing:',len(rows),'of',len(D))
def run(E,H,side,cost,rs):
    out=[]
    for lt,k,r in rs:
        if len(r)<E+H+1: continue
        e=r[E][4]; x=r[E+H][4]
        out.append(side*(x/e-1)-cost)
    return out
print('entry = close of hour E after listing, hold H hours, cost = 0.10% taker rt + 0.2% slippage assumed; split by listing date')
h=len(rows)//2
best=[]
for E in (0,1,3,6,12,24):
  for H in (3,6,12,24,48,96):
    for side in (-1,1):
        a=run(E,H,side,0.003,rows[:h]); b=run(E,H,side,0.003,rows[h:])
        best.append((st.mean(a),st.mean(b),E,H,side,len(a),len(b)))
pos=[x for x in best if x[0]>0 and x[1]>0]
print('configs tested',len(best),'positive in both halves',len(pos))
for x in sorted(best,key=lambda x:-x[0])[:6]: print('TOP-by-first-half: E=%d H=%d %s first=%+.2f%% second=%+.2f%%  n=%d/%d'%(x[2],x[3],'LONG' if x[4]>0 else 'SHORT',x[0]*100,x[1]*100,x[5],x[6]))
# gross drift stats
for E,H in ((0,24),(0,96),(1,24)):
    g=run(E,H,1,0,rows); print('gross LONG E=%d H=%d mean %+.2f%% median %+.2f%% n=%d'%(E,H,st.mean(g)*100,st.median(g)*100,len(g)))

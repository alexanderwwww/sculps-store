import json,statistics as st,random
D=json.load(open('data/okx_listings.json'))
rows=sorted((v['list'],k,v['rows']) for k,v in D.items() if len(v['rows'])>=200)
random.seed(3)
for E,H in ((24,48),(24,96),(24,120)):
  for stop in (None,0.3):
    out=[]
    for lt,k,r in rows:
        if len(r)<E+H+1: continue
        e=r[E][4]; ret=None
        for j in range(E+1,E+H+1):
            if stop and r[j][2]/e-1>=stop: ret=-stop-0.003-0.001; break   # stop hit on hourly high (optimistic: fills at stop)
        if ret is None: ret=-(r[E+H][4]/e-1)-0.004
        out.append((lt,ret))
    for nm,seg in (('first half',out[:len(out)//2]),('second half',out[len(out)//2:]),('all',out)):
        v=[x[1] for x in seg]
        bs=sorted(st.mean(random.choices(v,k=len(v))) for _ in range(2000))
        cum=0;pk=0;dd=0
        for x in v: cum+=x;pk=max(pk,cum);dd=max(dd,pk-cum)
        print(f'SHORT E={E} H={H} stop={stop} {nm}: n={len(v)} mean={st.mean(v)*100:+.2f}% med={st.median(v)*100:+.2f}% win={sum(x>0 for x in v)/len(v)*100:.0f}% worst={min(v)*100:.0f}% boot95=[{bs[50]*100:+.2f},{bs[1950]*100:+.2f}] maxDD(sum)={dd*100:.0f}%')
span=(rows[-1][0]-rows[0][0])/86400000
print('listings',len(rows),'over',round(span),'days =',round(len(rows)/span,2),'/day')

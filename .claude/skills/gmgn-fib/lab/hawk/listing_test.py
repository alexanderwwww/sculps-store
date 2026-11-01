import json,glob,os,statistics as st,time
now=time.time()*1000
rows=[]
for f in glob.glob('data/hl_1h_*.json'):
    c=json.load(open(f)); n=os.path.basename(f)[8:-5]
    if len(c)<80: continue
    if c[0]['t']<now-206*86400000: continue   # existed before window -> not a listing in window
    o=[float(x['o']) for x in c]; cl=[float(x['c']) for x in c]; v=[float(x['v'])*cl[i] for i,x in enumerate(c)]
    rows.append((n,c[0]['t'],o,cl,v))
rows.sort(key=lambda r:r[1])
print('new listings within window:',len(rows))
cost=0.0009+0.0  # taker rt
print('entry at close of hour E (after seeing it), hold H hours, SHORT (fade) and LONG; net of 0.09% rt + slippage s; split by listing date (first half / second half)')
for E in (0,1,3,6,24):
  for H in (6,24,72,168):
    for side in (-1,1):
        res=[]
        for n,t0,o,cl,v in rows:
            if len(cl)<E+H+1 or v[E]<20000: continue   # need some liquidity in entry hour
            res.append((t0,side*(cl[E+H]/cl[E]-1)-cost-0.003))   # 0.30% slippage assumption small caps
        if len(res)<10: continue
        h=len(res)//2; a=[x[1] for x in res[:h]]; b=[x[1] for x in res[h:]]
        print(f'E={E} H={H} {"SHORT" if side<0 else "LONG "} n={len(res)} first-half {st.mean(a)*100:+.1f}% second-half {st.mean(b)*100:+.1f}% all {st.mean(x[1] for x in res)*100:+.1f}% win={sum(x[1]>0 for x in res)/len(res)*100:.0f}%')

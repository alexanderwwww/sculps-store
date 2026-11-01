import json,glob,os,statistics as st
# HL hourly funding + hourly candles. Strategy: when trailing-24h mean funding (per hour) is extreme, take the side that RECEIVES funding, hold H hours.
# cost: taker 0.045%*2 (HL base tier) or maker 0.015%*2 (rebate-free base maker 0.015%)
def load(n):
    f=json.load(open(f'data/hl_fund_{n}.json')); c=json.load(open(f'data/hl_1h_{n}.json'))
    fm={int(x['time']//3600000):float(x['fundingRate']) for x in f}
    cm={int(x['t']//3600000):(float(x['o']),float(x['c'])) for x in c}
    return fm,cm
coins=[os.path.basename(p)[8:-5] for p in glob.glob('data/hl_fund_*.json')]
coins=[c for c in coins if os.path.exists(f'data/hl_1h_{c}.json')]
def run(thr,H,cost,lo,hi):
    tr=[]
    for n in coins:
        fm,cm=load(n)
        hs=sorted(set(fm)&set(cm)); 
        if len(hs)<500: continue
        N=len(hs); t0=hs[0]; span=hs[-1]-hs[0]
        last=-10**9
        for h in hs:
            frac=(h-t0)/span
            if not(lo<=frac<hi): continue
            w=[fm.get(h-k) for k in range(1,25)]
            if None in w: continue
            m=sum(w)/24   # per hour
            if abs(m)<thr or h-last<H: continue
            if (h+H) not in cm or h not in cm: continue
            side=-1 if m>0 else 1   # short if longs pay
            px=cm[h][0]; pe=cm[h+H][1]
            ret=side*(pe/px-1)
            fund=sum(fm.get(h+k,0) for k in range(0,H))*(-side)  # receives when side=-1 & funding>0
            tr.append(ret+fund-cost); last=h
    return tr
print('funding hour-mean threshold (%/h) | H | cost | split | n | net%/trade | win% | worst trade')
for thr in (0.0005,0.001,0.002):   # 0.0005=0.05%/h?? (fractions)
  for H in (8,24,72):
    for cost in (0.0009,0.0003*2):
      for nm,(lo,hi) in (('train',(0,.6)),('test',(.6,1.01))):
        t=run(thr/10,H,cost,lo,hi)   # thr/10: 0.00005,0.0001,0.0002 per hour
        if t: print(f'{thr/10*100:.4f}%/h H={H} cost={cost*100:.2f}% {nm} n={len(t)} net={st.mean(t)*100:+.2f}% win={sum(x>0 for x in t)/len(t)*100:.0f}% worst={min(t)*100:.1f}%')

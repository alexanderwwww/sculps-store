import json,statistics as st,bisect
D=json.load(open('data/pm_resolved.json'))
print('markets',len(D))
def px_at(h,t):
    ts=[x[0] for x in h]; i=bisect.bisect_right(ts,t)-1
    return h[i][1] if i>=0 else None
rows=[]
for m in D:
    h=m['h']
    if len(h)<6: continue
    te=h[-1][0]
    for d in (1,3,7,14,30):
        p=px_at(h,te-d*86400)
        if p is None or te-d*86400<h[0][0]: continue
        rows.append((d,p,1 if m['yes_won'] else 0,m['q'],m['vol']))
print('rows',len(rows))
# EV of buying the NO side when YES price in bucket (long-shot), YES side when high (favourite), per $1 stake; fee model f applies to payout profit
def ev(d,lo,hi,side,fee):
    xs=[r for r in rows if r[0]==d and lo<=r[1]<hi]
    out=[]
    for _,p,w,q,v in xs:
        if side=='NO':
            c=1-p; pay=1 if not w else 0
        else:
            c=p; pay=1 if w else 0
        out.append((pay-c)/c - (fee if pay>c else 0)*0 - fee)   # fee as % of stake round trip
    return out
print('days-before | YES price bucket | side | n | avg price | win rate | EV/stake net 1% fee')
for d in (1,3,7,14,30):
    for lo,hi,side in ((0.01,0.05,'NO'),(0.05,0.10,'NO'),(0.10,0.20,'NO'),(0.80,0.90,'YES'),(0.90,0.97,'YES'),(0.97,0.995,'YES')):
        o=ev(d,lo,hi,side,0.01)
        if len(o)>=10:
            xs=[r for r in rows if r[0]==d and lo<=r[1]<hi]
            wr=sum((1-r[2]) if side=='NO' else r[2] for r in xs)/len(xs)
            print(f'{d}d {lo}-{hi} {side} n={len(o)} px={st.mean(r[1] for r in xs):.3f} win={wr:.3f} EV={st.mean(o)*100:+.1f}%/stake  se={st.pstdev(o)/len(o)**.5*100:.1f}')

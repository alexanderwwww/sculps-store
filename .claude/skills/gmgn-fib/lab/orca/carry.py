import json,statistics as st
F=json.load(open('funding_hl.json'))
COST=0.0015+0.00045*2   # spot round trip ~0.15% (Jupiter/CEX), perp taker 0.045% x2 on HL = 0.24% one-time
def metrics(coin,L=3,hold_days=None):
    h=[r for t,r in F[coin]['hist']]
    if hold_days: h=h[-hold_days*24:]
    days=len(h)/24
    gross=sum(h); apr=gross/days*365
    net_apr=(gross-COST)/days*365      # one entry/exit over the window
    cum=0;peak=0;mdd=0
    for r in h:
        cum+=r;peak=max(peak,cum);mdd=min(mdd,cum-peak)
    d7=[sum(h[i:i+168]) for i in range(0,len(h)-168,24)]
    d30=[sum(h[i:i+720]) for i in range(0,len(h)-720,24)]
    return dict(coin=coin,days=round(days),gross_apr=100*apr,net_apr=100*net_apr,net_apr_on_capital=100*net_apr/(1+1/L),funding_drawdown_pct=100*mdd,worst7d=100*min(d7) if d7 else None,worst30d=100*min(d30) if d30 else None,
      pct_neg_30d_windows=100*sum(x<0 for x in d30)/len(d30) if d30 else None)
for coin in ('SOL','BTC','ETH','HYPE','XMR','NEAR','UNI','ZRO'):
    for hd in (365,180,90,30):
        m=metrics(coin,3,hd)
        print({k:(round(v,2) if isinstance(v,float) else v) for k,v in m.items()}, f'hold={hd}d')
# walk-forward: choose best coin by funding in days [-365,-90), score on last 90d
cands=[c for c in F if F[c]['days']>=300 and F[c]['vol24']>3e6]
sc=[]
for c in cands:
    h=[r for t,r in F[c]['hist']]; tr=h[:-2160][-6570:]; te=h[-2160:]
    sc.append((sum(tr)/(len(tr)/24)*365, sum(te)/(len(te)/24)*365, c))
sc.sort(reverse=True)
print('walk-forward top5 by prior-9mo funding APR -> next 90d APR (gross, before 0.24% costs):')
for a,b,c in sc[:5]: print(f'  {c}: train {100*a:.1f}% -> test {100*b:.1f}%')
print('  mean test of top5: %.1f%%; of all %d coins: %.1f%%'%(100*st.mean(x[1] for x in sc[:5]),len(sc),100*st.mean(x[1] for x in sc)))
# MAE: adverse price move on short-perp leg (hourly candles ~208d)
for coin in ('SOL','BTC','ETH'):
    c=json.load(open(f'candles_{coin}.json')); hi=[float(x['h']) for x in c]; cl=[float(x['c']) for x in c]; lo=[float(x['l']) for x in c]
    up24=max(max(hi[i:i+24])/cl[i]-1 for i in range(0,len(c)-24))
    up7=max(max(hi[i:i+168])/cl[i]-1 for i in range(0,len(c)-168))
    dn7=min(min(lo[i:i+168])/cl[i]-1 for i in range(0,len(c)-168))
    print(coin,f'{len(c)/24:.0f}d hourly candles: worst 24h pump on short leg {100*up24:.1f}%, worst 7d pump {100*up7:.1f}%, worst 7d drop (spot leg) {100*dn7:.1f}%')

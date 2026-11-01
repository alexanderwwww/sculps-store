import json, math, statistics as st
sel=json.load(open('pools30d.json'))
PROT={'orca':0.87,'raydium-clmm':0.84,'meteora':0.95}
def feeof(c):
    f=c.get('fee')
    if f is None: return None
    return f/100 if c['dex']=='meteora' else f
def candles(c):
    usd={r[0]:r[5] for r in c['ohlcv']}
    out=[]
    for ts,o,h,l,cl,v in sorted(c['ohlcv_q'],key=lambda r:r[0]):
        if min(o,h,l,cl)<=0: continue
        out.append((ts,o,h,l,cl,usd.get(ts,0.0)))
    return out
# --- Orca active-liquidity ratio: value needed to replicate pool's in-range liquidity over +-w, as fraction of TVL
def orca_ratio(c,w):
    d=c['orca']; L=float(d['liquidity']); decA=d['tokenA']['decimals']; decB=d['tokenB']['decimals']
    p=float(d['price']); sp=math.sqrt(p)
    Lh=L/10**((decA+decB)/2)
    Pl=p/(1+w); Pu=p*(1+w)
    valB=Lh*(2*sp-math.sqrt(Pl)-p/math.sqrt(Pu))
    balA=float(d['tokenBalanceA'])/10**decA; balB=float(d['tokenBalanceB'])/10**decB
    tvlB=balB+balA*p
    return valB/tvlB   # fraction of (token-reserve) TVL
def isstable(cd):
    cl=[r[4] for r in cd]; rng=max(cl)/min(cl)-1
    return 'S' if rng<0.01 else ('P' if rng<0.06 else 'V')
WID={'S':[0.0005,0.001,0.003],'P':[0.001,0.003,0.01],'V':[0.01,0.03,0.08]}
rat={}  # class,w -> list
for c in sel:
    cd=candles(c); c['cd']=cd; c['stable']=isstable(cd); c['fee_']=feeof(c)
    if c['dex']=='orca':
        for w in WID[c['stable']]:
            c.setdefault('ratio',{})[w]=orca_ratio(c,w)
            rat.setdefault((c['stable'],w),[]).append(c['ratio'][w])
medrat={k:st.median(v) for k,v in rat.items()}
print('Orca active-liquidity / TVL ratios (median):',{f"{'S' if k[0] else 'V'}{k[1]}":round(v,3) for k,v in medrat.items()})
def pos_val(L,sp,spl,spu):
    P=sp*sp
    if sp>=spu: return L*(spu-spl)
    if sp<=spl: return L*(1/spl-1/spu)*P
    return L*(sp-spl)+L*(1/sp-1/spu)*P
def run(c,w,C,lo=0,hi=None,txcost=0.05):
    """C = capital in USD. IL/raw math in normalised units (capital=1 in quote-token value)."""
    cd=c['cd']; lpfee=c['fee_']*PROT[c['dex']]; gross=c['fee_']
    days={}
    for r in cd: days.setdefault(r[0]//86400,[]).append(r)
    keys=sorted(days)[1:-1][lo:hi]
    ratio=c['ratio'][w] if c['dex']=='orca' else medrat.get((c['stable'],w), medrat.get(('V' if w>=0.01 else 'S',w)))
    share=C/(C+ratio*c['tvl'])
    res=[]
    for k in keys:
        rs=days[k]; P0=rs[0][1]; Pl=P0/(1+w); Pu=P0*(1+w)
        spl,spu,sp0=math.sqrt(Pl),math.sqrt(Pu),math.sqrt(P0)
        L=1.0/(2*sp0-spl-P0/spu)
        feeusd=0.0
        for ts,o,h,l,cl,v in rs:
            a=max(math.log(l),math.log(Pl)); b=min(math.log(h),math.log(Pu))
            if h==l: f=1.0 if Pl<=h<=Pu else 0.0
            else: f=max(0.0,b-a)/(math.log(h)-math.log(l))
            feeusd+=v*lpfee*f*share
        P1=rs[-1][4]; sp1=math.sqrt(P1); V1=pos_val(L,sp1,spl,spu)
        xval=0.0 if sp1>=spu else L*(1/max(sp1,spl)-1/spu)*P1
        swap=abs(xval-V1/2)
        cost=swap*(gross+0.0001)+txcost/C
        hold=0.5*(P1/P0-1)
        res.append(dict(fees=feeusd/C,il=(V1-1)-hold,raw=V1-1,cost=cost,hold=hold,day=k))
    return res

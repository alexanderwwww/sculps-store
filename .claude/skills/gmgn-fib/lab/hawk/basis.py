import json,time,urllib.request
def get(u):
    try: return json.load(urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'x'}),timeout=8))
    except Exception as e: return None
USDC='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
T={'SOL':('So11111111111111111111111111111111111111112',9),'JUP':('JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',6),'WIF':('EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',6),'BONK':('DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',5)}
okx={'SOL':'SOL-USDT-SWAP','JUP':'JUP-USDT-SWAP','WIF':'WIF-USDT-SWAP','BONK':'BONK-USDT-SWAP'}
out=[];end=time.time()+float(__import__('sys').argv[1])
while time.time()<end:
    for k,(m,dec) in T.items():
        b=get(f'https://www.okx.com/api/v5/market/ticker?instId={okx[k]}')
        if not b or not b.get('data'): continue
        ba=float(b['data'][0]['askPx']);bb=float(b['data'][0]['bidPx']);mid=(ba+bb)/2
        usd=2000
        qa=get(f'https://lite-api.jup.ag/swap/v1/quote?inputMint={USDC}&outputMint={m}&amount={usd*10**6}&slippageBps=50')   # buy token with $2000 USDC
        if not qa: continue
        tok=int(qa['outAmount'])/10**dec
        qb=get(f'https://lite-api.jup.ag/swap/v1/quote?inputMint={m}&outputMint={USDC}&amount={int(tok*10**dec)}&slippageBps=50')  # sell same tokens back
        if not qb: continue
        usdback=int(qb['outAmount'])/10**6
        jbuy=usd/tok; jsell=usdback/tok
        out.append(dict(t=time.time(),k=k,okx_bid=bb,okx_ask=ba,jup_buy=jbuy,jup_sell=jsell,impact_buy=float(qa.get('priceImpactPct',0)),impact_sell=float(qb.get('priceImpactPct',0))))
        time.sleep(0.6)
    json.dump(out,open('data/basis.json','w'))
print(len(out))

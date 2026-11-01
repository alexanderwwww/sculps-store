import json,sys,time,urllib.request,os
def get(u):
    for i in range(6):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'x'}),timeout=20))
        except Exception as e: time.sleep(1.5)
    return None
def candles(inst,bar,days):
    fn=f'data/okx_{inst}_{bar}.json'
    if os.path.exists(fn): return
    end=int(time.time()*1000); stop=end-days*86400000; rows=[]; after=end
    while after>stop:
        d=get(f'https://www.okx.com/api/v5/market/history-candles?instId={inst}&bar={bar}&limit=100&after={after}')
        if not d or not d['data']: break
        rows+=d['data']; after=int(d['data'][-1][0]); time.sleep(0.11)
    rows=sorted({int(r[0]):[int(r[0])]+[float(x) for x in r[1:6]] for r in rows if r[8]=='1'}.values())
    json.dump(rows,open(fn,'w')); print(inst,bar,len(rows),flush=True)
syms=['BTC','ETH','SOL','DOGE','XRP','LINK','AVAX','SUI']
if sys.argv[1]=='5m':
    for s in syms: candles(f'{s}-USDT-SWAP','5m',180)
else:
    for s in ['BTC','ETH','SOL']: candles(f'{s}-USDT-SWAP','1m',20)

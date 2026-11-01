import json,time,urllib.request
def post(b):
    for i in range(5):
        try:
            r=urllib.request.Request('https://api.hyperliquid.xyz/info',json.dumps(b).encode(),{'content-type':'application/json'})
            return json.load(urllib.request.urlopen(r,timeout=30))
        except Exception as e: time.sleep(2)
meta=post({"type":"meta"})['universe']
json.dump(meta,open('data/hl_meta.json','w'))
names=[m['name'] for m in meta if not m.get('isDelisted')]
print(len(names),'live perps')
now=int(time.time()*1000)
# funding history ~ 200 days for top coins
for n in ['BTC','ETH','SOL','DOGE','XRP','LINK','AVAX','SUI','HYPE','WIF','BONK','kBONK','JUP','PEPE','kPEPE','ARB','OP','APT','NEAR','TIA']:
    if n not in names: continue
    rows=[];t=now-200*86400000
    while t<now:
        d=post({"type":"fundingHistory","coin":n,"startTime":t})
        if not d: break
        rows+=d; t=d[-1]['time']+1
        if len(d)<500: break
        time.sleep(0.2)
    json.dump(rows,open(f'data/hl_fund_{n}.json','w')); print(n,len(rows),flush=True)
# 1h candles for all perps, up to 5000 bars from earliest
for n in names:
    d=post({"type":"candleSnapshot","req":{"coin":n,"interval":"1h","startTime":now-208*86400000,"endTime":now}})
    json.dump(d,open(f'data/hl_1h_{n}.json','w')); time.sleep(0.15)
print('done')

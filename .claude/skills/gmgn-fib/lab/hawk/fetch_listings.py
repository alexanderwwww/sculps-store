import json,time,urllib.request
def get(u):
    for i in range(5):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'x'}),timeout=20))
        except: time.sleep(1.5)
ins=get('https://www.okx.com/api/v5/public/instruments?instType=SWAP')['data']
now=time.time()*1000
new=[i for i in ins if i['instId'].endswith('-USDT-SWAP') and now-400*86400000<int(i['listTime'])<now-12*86400000]
print(len(ins),'swaps;',len(new),'USDT swaps listed 12-400d ago',flush=True)
out={}
for i in new:
    lt=int(i['listTime']); rows=[]; after=lt+10*86400000
    for k in range(3):
        d=get(f"https://www.okx.com/api/v5/market/history-candles?instId={i['instId']}&bar=1H&limit=100&after={after}")
        if not d or not d['data']: break
        rows+=d['data']; after=int(d['data'][-1][0]); time.sleep(0.12)
    rows=sorted({int(r[0]):[int(r[0])]+[float(x) for x in r[1:8]] for r in rows if r[8]=='1' and int(r[0])>=lt-3600000}.values())
    out[i['instId']]={'list':lt,'rows':rows}
json.dump(out,open('data/okx_listings.json','w')); print('done',len(out))

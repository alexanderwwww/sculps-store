import json,time,urllib.request,random
def get(u):
    for i in range(4):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0'}),timeout=25))
        except Exception as e: time.sleep(1.5)
mk=[]
for off in range(0,3000,100):
    d=get(f'https://gamma-api.polymarket.com/markets?closed=true&limit=100&offset={off}&order=volumeNum&ascending=false&volume_num_min=30000')
    if not d: break
    mk+=d
    if len(d)<100: break
print(len(mk))
out=[]
random.seed(1); random.shuffle(mk)
for m in mk[:1100]:
    try:
        toks=json.loads(m['clobTokenIds']); pr=[float(x) for x in json.loads(m['outcomePrices'])]
    except: continue
    if len(toks)!=2 or max(pr)<0.99: continue
    h=get(f'https://clob.polymarket.com/prices-history?market={toks[0]}&interval=max&fidelity=720')
    if not h or not h.get('history'): continue
    out.append({'q':m['question'],'end':m.get('endDate'),'vol':m.get('volumeNum'),'yes_won':pr[0]>0.5,'h':[(x['t'],x['p']) for x in h['history']],'fee':m.get('feesEnabled')})
    time.sleep(0.12)
json.dump(out,open('data/pm_resolved.json','w')); print(len(out))

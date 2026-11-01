import json,time,urllib.request
def get(u):
    for i in range(4):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0'}),timeout=25))
        except: time.sleep(1.5)
res=json.load(open('data/pm_negrisk_scan.json'))
cand=[r for r in res if r[3]>1.0 and r[1]<=40]
evs={}
for off in range(0,1500,100):
    d=get(f'https://gamma-api.polymarket.com/events?active=true&closed=false&limit=100&offset={off}&order=volume24hr&ascending=false')
    for e in d or []: evs[e['title'][:50]]=e
def sellable(book,usd):
    # walk bids best-first, return (shares, avg price) for selling shares worth usd notional at top price
    bids=sorted([(float(b['price']),float(b['size'])) for b in book.get('bids',[])],reverse=True)
    return bids
for c in cand:
    e=evs[c[0]]
    print('\n',c[0],'n',c[1],'gamma sumbids',c[3])
    for S in (20,100,500):   # shares per leg (each share pays $1 if sold-all hedge)
        tot=0;ok=True;lg=[]
        for m in e['markets']:
            if not(m.get('active') and not m.get('closed')): continue
            tok=json.loads(m['clobTokenIds'])[0]
            bk=get(f'https://clob.polymarket.com/book?token_id={tok}'); time.sleep(0.08)
            bids=sellable(bk or {},S); need=S;rev=0
            for p,sz in bids:
                t=min(need,sz);rev+=t*p;need-=t
                if need<=0:break
            if need>0: ok=False
            tot+=rev/S
        print(f'  S={S} shares/leg: executable sum of bids={tot:.4f} (full fill on all legs: {ok})  profit/set before fees={(tot-1)*100:+.2f}%')

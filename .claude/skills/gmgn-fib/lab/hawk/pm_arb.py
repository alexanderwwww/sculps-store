import json,time,urllib.request
def get(u):
    for i in range(4):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0'}),timeout=25))
        except: time.sleep(1.5)
ev=[]
for off in range(0,1500,100):
    d=get(f'https://gamma-api.polymarket.com/events?active=true&closed=false&limit=100&offset={off}&order=volume24hr&ascending=false')
    if not d: break
    ev+=d
    if len(d)<100: break
print('PM active events',len(ev))
res=[]
for e in ev:
    ms=[m for m in e.get('markets',[]) if m.get('active') and not m.get('closed') and m.get('bestAsk') is not None and m.get('bestBid') is not None]
    if len(ms)<3 or not e.get('negRisk'): continue
    sa=sum(float(m['bestAsk']) for m in ms); sb=sum(float(m['bestBid']) for m in ms)
    res.append((e['title'][:50],len(ms),round(sa,3),round(sb,3),round(float(e.get('volume24hr') or 0)),e.get('negRiskAugmented')))
print('negRisk multi-outcome events',len(res))
buy=[r for r in res if r[2]<1.0]; sell=[r for r in res if r[3]>1.0]
print('sum(YES asks)<1 (buy-all-YES arb):',len(buy)); [print(' ',r) for r in sorted(buy,key=lambda r:r[2])[:8]]
print('sum(YES bids)>1 (sell-all-YES arb):',len(sell)); [print(' ',r) for r in sorted(sell,key=lambda r:-r[3])[:8]]
import statistics as st
print('median sum asks',st.median(r[2] for r in res),'median sum bids',st.median(r[3] for r in res))
json.dump(res,open('data/pm_negrisk_scan.json','w'))
# Kalshi
mk=[];cur=None
for _ in range(15):
    u='https://api.elections.kalshi.com/trade-api/v2/events?status=open&with_nested_markets=true&limit=200'+(f'&cursor={cur}' if cur else '')
    d=get(u)
    if not d: break
    mk+=d['events']; cur=d.get('cursor')
    if not cur: break
print('Kalshi open events',len(mk))
kb=[];ks=[]
for e in mk:
    if not e.get('mutually_exclusive'): continue
    ms=[m for m in e.get('markets',[]) if m.get('status') in('active','open')]
    if len(ms)<3: continue
    try:
        a=sum(float(m['yes_ask_dollars']) for m in ms if m.get('yes_ask_dollars') is not None); b=sum(float(m['yes_bid_dollars']) for m in ms if m.get('yes_bid_dollars') is not None)
        if any(m.get('yes_ask_dollars') in(None,'0.0000','1.0000') for m in ms): continue
    except Exception as ex: continue
    kb.append((e['title'][:50],len(ms),round(a,3),round(b,3)))
print('Kalshi mutually exclusive events (all legs quoted):',len(kb))
print(' buy-all arbs (sum asks<1):',[r for r in kb if r[2]<1][:10])
print(' sell-all (sum bids>1):',[r for r in kb if r[3]>1][:10])
print(' median sum asks',st.median(r[2] for r in kb) if kb else None)
json.dump(kb,open('data/kalshi_me_scan.json','w'))

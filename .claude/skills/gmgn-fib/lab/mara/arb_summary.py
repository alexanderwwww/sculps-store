import json,statistics as S,collections
rows=[json.loads(l) for l in open("data/jup_arb.jsonl")];ok=[r for r in rows if r.get("rt")]
by=collections.defaultdict(list);cr=[]
for r in ok:
    by[r['tok']].append(r['rt'])
    for k,v in r.get('cross',{}).items(): cr.append((v,r['tok'],k))
print("records",len(rows),"round trips",len(ok),"429/err",len(rows)-len(ok))
for k,v in by.items(): print(f"{k:7s} n={len(v):2d} mean cost {(1-S.mean(v))*100:6.3f}%  best single {(max(v)-1)*100:+.3f}%")
allrt=[x for v in by.values() for x in v];print("round trips >1.0:",sum(x>1 for x in allrt),"of",len(allrt),"; best",(max(allrt)-1)*100,"%")
print("cross-dex cells:",len(cr),">1.0:",sum(v>1 for v,_,_ in cr),"best",sorted(cr,reverse=True)[:3])
print("fixed fee floor: 2 swaps x 5000 lamports = 0.00001 SOL = ",0.00001/0.0097*100,"% of a 0.0097 SOL stake; at maxFeeLamports 50000 each: ",0.0001/0.0097*100,"%")

import json,time,urllib.request,sys
R="https://solana-rpc.publicnode.com"
def rpc(m,p):
    for i in range(6):
        try:
            r=urllib.request.Request(R,json.dumps({"jsonrpc":"2.0","id":1,"method":m,"params":p}).encode(),{"content-type":"application/json","User-Agent":"x"})
            d=json.load(urllib.request.urlopen(r,timeout=40))
            if "result" in d: return d["result"]
        except Exception as e: pass
        time.sleep(1.5*(i+1))
    return None
D="/home/user/sculps-store/tools/autotrader/data/"
pools=[p for f in ("pools.json","pools-nov.json") for p in json.load(open(D+f))]
seen=set();cand=[]
for p in pools:
    if p['dex']=='pumpswap' and p['pool'] not in seen: seen.add(p['pool']);cand.append(p)
print("pumpswap pools",len(cand),flush=True)
meta={}
for p in cand:
    sigs=[];before=None
    while True:
        r=rpc("getSignaturesForAddress",[p['pool'],{"limit":1000,**({"before":before} if before else {})}])
        if not r: break
        sigs+=r;before=r[-1]['signature']
        if len(r)<1000 or len(sigs)>6000: break
    sigs=[s for s in sigs if not s['err']]
    meta[p['pool']]={"name":p['name'],"mint":p['mint'],"created":p['created'],"n":len(sigs),"capped":len(sigs)>6000}
    json.dump(sigs,open(f"data/whale/{p['pool']}.sigs.json","w"))
    print(p['name'],len(sigs),flush=True)
json.dump(meta,open("data/whale/meta.json","w"))

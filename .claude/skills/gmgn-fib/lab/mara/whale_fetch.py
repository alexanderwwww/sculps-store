import json,time,urllib.request,sys,os
from concurrent.futures import ThreadPoolExecutor
R="https://solana-rpc.publicnode.com";WSOL="So11111111111111111111111111111111111111112"
meta=json.load(open("data/whale/meta.json"))
c=sorted([(m['n'],k) for k,m in meta.items() if 400<=m['n']<=6000 and not m['capped'] and m['name'].endswith("/ SOL")])
def tx(s):
    for i in range(6):
        try:
            r=urllib.request.Request(R,json.dumps({"jsonrpc":"2.0","id":1,"method":"getTransaction","params":[s['signature'],{"encoding":"json","maxSupportedTransactionVersion":0}]}).encode(),{"content-type":"application/json","User-Agent":"x"})
            d=json.load(urllib.request.urlopen(r,timeout=25))
            return d.get("result")
        except Exception as e: time.sleep(0.7*(i+1))
def parse(s,t,mint):
    if not t or not t.get("meta") or t["meta"].get("err"): return None
    m=t["meta"];keys=t["transaction"]["message"]["accountKeys"];own=keys[0]
    tok=0;wsol=0
    for b in m.get("preTokenBalances",[]):
        if b.get("owner")==own:
            a=int(b["uiTokenAmount"]["amount"])
            if b["mint"]==mint: tok-=a
            elif b["mint"]==WSOL: wsol-=a
    for b in m.get("postTokenBalances",[]):
        if b.get("owner")==own:
            a=int(b["uiTokenAmount"]["amount"])
            if b["mint"]==mint: tok+=a
            elif b["mint"]==WSOL: wsol+=a
    lam=m["postBalances"][0]-m["preBalances"][0]+m["fee"]
    sol=lam+wsol
    if tok==0 or sol==0 or (tok>0)==(sol>0): return None   # not a plain swap of this token vs SOL
    return {"w":own,"slot":s["slot"],"ix":s.get("transactionIndex",0),"bt":s["blockTime"],"tok":tok,"sol":sol}
for n,k in c:
    out=f"data/whale/{k}.swaps.json"
    if os.path.exists(out): continue
    sigs=json.load(open(f"data/whale/{k}.sigs.json"));mint=meta[k]['mint'];t0=time.time()
    with ThreadPoolExecutor(8) as ex: txs=list(ex.map(tx,sigs))
    sw=[x for x in (parse(s,t,mint) for s,t in zip(sigs,txs)) if x]
    json.dump(sw,open(out,"w")); print(meta[k]['name'],n,"txs ->",sum(t is not None for t in txs),"fetched,",len(sw),"swaps",round(time.time()-t0),"s",flush=True)

import json,sys,time,urllib.request,collections
RPCS=["https://api.mainnet-beta.solana.com","https://solana-rpc.publicnode.com"]
def rpc(m,p):
    for k in range(6):
        try:
            r=urllib.request.Request(RPCS[k%2],json.dumps({"jsonrpc":"2.0","id":1,"method":m,"params":p}).encode(),{"content-type":"application/json"})
            d=json.load(urllib.request.urlopen(r,timeout=60))
            if "result" in d: return d["result"]
        except Exception: pass
        time.sleep(1.5)
KL="KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD";MF="MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA"
n,step=int(sys.argv[1]),int(sys.argv[2]); tip=rpc("getSlot",[{"commitment":"finalized"}])-300
stat=collections.Counter(); liqs=[]; blocks=0
for i in range(n):
    b=rpc("getBlock",[tip-i*step,{"encoding":"json","maxSupportedTransactionVersion":1,"transactionDetails":"full","rewards":False}])
    if not b: continue
    blocks+=1
    for t in b["transactions"]:
        m=t["meta"]; keys=t["transaction"]["message"]["accountKeys"]+((m.get("loadedAddresses") or {}).get("writable",[])+(m.get("loadedAddresses") or {}).get("readonly",[]))
        if KL in keys: stat["klend_tx"]+=1
        if MF in keys: stat["mfi_tx"]+=1
        logs=" ".join(m.get("logMessages") or [])
        if "Liquidate" in logs and (KL in keys or MF in keys):
            ok=m["err"] is None
            stat["liq_ok" if ok else "liq_fail"]+=1
            liqs.append({"sig":t["transaction"]["signatures"][0],"ok":ok,"proto":"klend" if KL in keys else "mfi","signer":keys[0],"fee":m["fee"],"dlam":m["postBalances"][0]-m["preBalances"][0],"ptb":m.get("preTokenBalances"),"qtb":m.get("postTokenBalances"),"slot":b["slot"]})
    time.sleep(0.3)
print(blocks,dict(stat))
json.dump({"blocks":blocks,"stat":stat,"liqs":liqs},open("liq.json","w"))

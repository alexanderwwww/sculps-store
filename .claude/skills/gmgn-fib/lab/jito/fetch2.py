import json,sys,time,urllib.request
RPCS=["https://api.mainnet-beta.solana.com","https://solana-rpc.publicnode.com"]
def rpc(m,p):
    for k in range(6):
        try:
            r=urllib.request.Request(RPCS[k%2],json.dumps({"jsonrpc":"2.0","id":1,"method":m,"params":p}).encode(),{"content-type":"application/json"})
            d=json.load(urllib.request.urlopen(r,timeout=60))
            if "result" in d: return d["result"]
        except Exception: pass
        time.sleep(1.5)
def slim(t):
    m=t["meta"]; msg=t["transaction"]["message"]
    keys=list(msg["accountKeys"])
    if m.get("loadedAddresses"): keys+=m["loadedAddresses"]["writable"]+m["loadedAddresses"]["readonly"]
    ins=msg["instructions"]
    prog=[keys[i["programIdIndex"]] for i in ins]
    inner=[keys[i["programIdIndex"]] for g in (m.get("innerInstructions") or []) for i in g["instructions"]]
    return {"sig":t["transaction"]["signatures"][0],"fee":m["fee"],"err":m["err"],"cu":m.get("computeUnitsConsumed"),
      "signer":keys[0],"keys":keys[:60],"pre":m["preBalances"][:60],"post":m["postBalances"][:60],
      "ptb":m.get("preTokenBalances"),"qtb":m.get("postTokenBalances"),"prog":prog,"inner":inner,"nsig":len(msg["header"] and [1])}
n,step,start=int(sys.argv[1]),int(sys.argv[2]),int(sys.argv[3])  # start = offset behind tip
tip=rpc("getSlot",[{"commitment":"finalized"}])-start
out=[]
for i in range(n):
    s=tip-i*step
    b=rpc("getBlock",[s,{"encoding":"json","maxSupportedTransactionVersion":1,"transactionDetails":"full","rewards":False}])
    if b:
        out.append({"slot":s,"bt":b["blockTime"],"txs":[slim(t) for t in b["transactions"]]}); print(s,len(b["transactions"]),flush=True)
    else: print(s,"skip",flush=True)
    time.sleep(0.4)
    if i%25==24 or i==n-1: json.dump(out,open("blocks2.json","w"))

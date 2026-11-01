import json,sys,time,urllib.request
RPCS=["https://solana-rpc.publicnode.com","https://api.mainnet-beta.solana.com"]
def rpc(m,p,i=0):
    for k in range(6):
        u=RPCS[(i+k)%2]
        try:
            r=urllib.request.Request(u,json.dumps({"jsonrpc":"2.0","id":1,"method":m,"params":p}).encode(),{"content-type":"application/json"})
            d=json.load(urllib.request.urlopen(r,timeout=40))
            if "result" in d: return d["result"]
        except Exception as e: pass
        time.sleep(1.5)
    return None
if __name__=="__main__":
    slot=rpc("getSlot",[{"commitment":"finalized"}])-200
    n=int(sys.argv[1]); out=[]
    for s in range(slot,slot-n*40,-40):   # spread over ~ n blocks
        b=rpc("getBlock",[s,{"encoding":"json","maxSupportedTransactionVersion":0,"transactionDetails":"full","rewards":False}])
        if b: out.append({"slot":s,"bt":b["blockTime"],"txs":b["transactions"]}); print(s,len(b["transactions"]),flush=True)
        time.sleep(0.3)
    json.dump(out,open("blocks.json","w"))

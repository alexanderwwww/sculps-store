import json,collections,statistics as st
B=json.load(open("blocks.json"))
TIPS={"96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5","HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe","Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY","ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49","DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh","ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt","DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL","3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT"}
SKIP={"11111111111111111111111111111111","ComputeBudget111111111111111111111111111111","TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA","TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb","ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL","MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr","Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo"}
SOLM="So11111111111111111111111111111111111111112"
LAM=1e9
blocks=len(B); secs=(B[0]["bt"]-B[-1]["bt"])  # span of sampled times
tot=0;ok=0;arbs=[];failed_tip=[];fail_all=0;tipped=[]
for b in B:
    for t in b["txs"]:
        tot+=1
        if t["err"] is None: ok+=1
        keys=t["keys"]
        tip=0
        for i,k in enumerate(keys):
            if k in TIPS and i<len(t["pre"]): tip+=t["post"][i]-t["pre"][i]
        dex=[p for p in t["inner"] if p not in SKIP]
        nprog=len(set(dex))
        if tip>0: tipped.append((t,tip,b))
        if t["err"] is not None:
            # failed attempt that looks like arb: has tip or many CPI programs
            if tip>0 or len(dex)>=4: failed_tip.append((t,tip,b))
            continue
        # signer-owned token deltas
        d=collections.defaultdict(float)
        for x in t["ptb"] or []:
            if x["owner"]==t["signer"]: d[x["mint"]]-=float(x["uiTokenAmount"]["uiAmount"] or 0)
        for x in t["qtb"] or []:
            if x["owner"]==t["signer"]: d[x["mint"]]+=float(x["uiTokenAmount"]["uiAmount"] or 0)
        sol=(t["post"][0]-t["pre"][0]+t["fee"])/LAM   # signer lamport delta before fee (includes tip out)
        wsol=d.pop(SOLM,0)
        gain=sol+wsol
        others=[v for v in d.values() if abs(v)>1e-9]
        if len(dex)>=2 and nprog>=2 and not others and gain>0 and (t["fee"]/LAM)<0.01 :
            arbs.append({"sig":t["sig"],"signer":t["signer"],"gain_sol":gain,"net_sol":gain-t["fee"]/LAM,"tip":tip/LAM,"fee":t["fee"]/LAM,"progs":sorted(set(dex))[:6],"slot":b["slot"]})
print("blocks",blocks,"span s",secs,"txs",tot,"ok",ok,"tx/s approx",tot/max(1,blocks*0.4))
print("tipped txs",len(tipped),"tips total SOL",sum(x[1] for x in tipped)/LAM)
print("arb-like succeeded",len(arbs),"failed tip/CPI-heavy",len(failed_tip))
json.dump(arbs,open("arbs.json","w"));
fl=[]
for t,tip,b in failed_tip: fl.append({"signer":t["signer"],"fee":t["fee"]/LAM,"tip":tip/LAM,"err":str(t["err"])[:60],"cu":t["cu"]})
json.dump(fl,open("failed.json","w"))

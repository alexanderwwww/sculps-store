import json,collections,statistics as st
B=json.load(open("blocks.json"))+json.load(open("blocks2.json"))
SOLPX=95.0
exec(open("analyze.py").read().split("blocks=len")[0].split("B=json.load")[1].split("\n",1)[1])
STABLE={"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v","Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"}
nblk=len(B); alltx=0; ok=0
arbs=[]; fails=collections.defaultdict(list); sigs_by=collections.defaultdict(lambda:[0,0.0,0.0,0.0]) # n,gain,fee,tip
dexfail=0; dexall=0; dexfail_fee=0; feeall=0
for b in B:
  for t in b["txs"]:
    alltx+=1
    dex=[p for p in t["inner"] if p not in SKIP]
    tip=sum(t["post"][i]-t["pre"][i] for i,k in enumerate(t["keys"]) if k in TIPS and i<len(t["pre"]))/1e9
    fee=t["fee"]/1e9
    isdex=len(dex)>=2
    if isdex:
        dexall+=1
        if t["err"] is not None: dexfail+=1; dexfail_fee+=fee
    if t["err"] is not None:
        if isdex: fails[t["signer"]].append(fee)
        continue
    ok+=1
    d=collections.defaultdict(float)
    for x in t["ptb"] or []:
        if x["owner"]==t["signer"]: d[x["mint"]]-=float(x["uiTokenAmount"]["uiAmount"] or 0)
    for x in t["qtb"] or []:
        if x["owner"]==t["signer"]: d[x["mint"]]+=float(x["uiTokenAmount"]["uiAmount"] or 0)
    sol=(t["post"][0]-t["pre"][0])/1e9+fee      # lamport delta excl base fee (tip is already out of it)
    gain=sol+d.pop(SOLM,0)
    stab=sum(d.pop(m,0) for m in list(d) if m in STABLE)
    others=[v for v in d.values() if abs(v)>1e-9]
    gain_total=gain+stab/SOLPX
    if isdex and len(set(dex))>=1 and not others and gain_total>0 and len(t["inner"])>=4 and len(dex)>=3 :
        arbs.append({"sig":t["sig"],"signer":t["signer"],"net_sol":gain_total-fee,"tip":tip,"fee":fee,"progs":sorted(set(dex)),"ndex":len(dex),"slot":b["slot"]})
span=len(B)*0.4
print("blocks",nblk,"chain seconds sampled",span,"tx",alltx,"ok",ok,"fail%",1-ok/alltx)
print("dex-ish txs (>=2 non-token CPIs)",dexall,"failed",dexfail,"fail rate",dexfail/max(1,dexall),"fee burnt on failed SOL",dexfail_fee)
print("arb-like",len(arbs))
if arbs:
    n=[a["net_sol"] for a in arbs]
    print("net SOL/tx median %.5f mean %.5f p90 %.5f max %.4f, share >0.001: %.2f"%(st.median(n),st.mean(n),sorted(n)[int(.9*len(n))],max(n),sum(x>0.001 for x in n)/len(n)))
    print("tip median",st.median(a["tip"] for a in arbs),"tipped share",sum(a["tip"]>0 for a in arbs)/len(arbs))
    per_min=len(arbs)/span*60
    tot=sum(n); print("arb tx per minute chain-wide %.1f  total net SOL/min %.4f  ($%.1f/min, $%.0f/day)"%(per_min,tot/span*60,tot/span*60*SOLPX,tot/span*86400*SOLPX))
    c=collections.defaultdict(lambda:[0,0.0])
    for a in arbs: c[a["signer"]][0]+=1; c[a["signer"]][1]+=a["net_sol"]
    r=sorted(c.items(),key=lambda x:-x[1][1]); T=sum(v[1] for _,v in r)
    print("distinct signers",len(r),"top5 share of net profit %.2f top1 %.2f top10 %.2f"%(sum(v[1] for _,v in r[:5])/T,r[0][1][1]/T,sum(v[1] for _,v in r[:10])/T))
    for k,v in r[:8]: print(k,v[0],"tx net SOL %.4f"%v[1], "failed dex tx same signer",len(fails.get(k,[])))
    cp=collections.Counter(p for a in arbs for p in a["progs"]); print(cp.most_common(10))
    # per-signer burn vs profit
    bw=[(k,len(fails[k]),sum(fails[k]),c[k][1]) for k in c if k in fails]
    print("signers with arbs AND failed dex txs:",len(bw),"fails",sum(x[1] for x in bw),"fail fee SOL %.5f vs their arb net %.5f"%(sum(x[2] for x in bw),sum(x[3] for x in bw)))
    # win-size buckets
    for lo,hi in ((0,0.0001),(0.0001,0.001),(0.001,0.01),(0.01,1e9)):
        print("bucket",lo,hi,sum(lo<=x<hi for x in n))
json.dump(arbs,open("arbs.json","w"))

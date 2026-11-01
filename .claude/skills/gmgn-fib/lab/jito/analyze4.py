import json,collections,statistics as st
B=json.load(open("blocks3.json"))
TIPS=set(open("analyze.py").read().split("TIPS={")[1].split("}")[0].replace('"','').split(","))
SKIP={"11111111111111111111111111111111","ComputeBudget111111111111111111111111111111","TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA","TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb","ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"}
SOLM="So11111111111111111111111111111111111111112";SOLPX=95.0
STABLE={"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v","Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"}
span=len(B)*0.4; ntx=0;ok=0
arbs=[];sw_all=0;sw_fail=0;sw_fail_fee=0;sw_ok_fee=0;fails=collections.defaultdict(list)
liq=[];flash=0;KL="KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD";MF="MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA"
for b in B:
  for t in b["txs"]:
    ntx+=1; fee=t["fee"]/1e9
    if t["err"] is None: ok+=1
    if t["liq"]: liq.append(t)
    if t["flash"]: flash+=1
    if t["nswap"]>=2:
        sw_all+=1
        if t["err"] is not None: sw_fail+=1; sw_fail_fee+=fee; fails[t["signer"]].append(fee)
    if t["err"] is not None or t["nswap"]<2: continue
    d=collections.defaultdict(float)
    for x in t["ptb"] or []:
        if x["owner"]==t["signer"]: d[x["mint"]]-=float(x["uiTokenAmount"]["uiAmount"] or 0)
    for x in t["qtb"] or []:
        if x["owner"]==t["signer"]: d[x["mint"]]+=float(x["uiTokenAmount"]["uiAmount"] or 0)
    pre={y["accountIndex"] for y in (t["ptb"] or []) if y["owner"]==t["signer"]}; post={y["accountIndex"] for y in (t["qtb"] or []) if y["owner"]==t["signer"]}
    gain=(t["post"][0]-t["pre"][0])/1e9+fee+d.pop(SOLM,0)+sum(d.pop(m,0) for m in list(d) if m in STABLE)/SOLPX
    if any(abs(v)>1e-9 for v in d.values()) or (pre-post) or gain<=0: continue
    tip=sum(t["post"][i]-t["pre"][i] for i,k in enumerate(t["keys"]) if k in TIPS and i<len(t["pre"]))/1e9
    arbs.append({"sig":t["sig"],"signer":t["signer"],"net":gain-fee,"tip":tip,"fee":fee,"nswap":t["nswap"],"flash":t["flash"],"progs":sorted(set(p for p in t["inner"] if p not in SKIP))[:5]})
print("blocks",len(B),"chain s",span,"tx",ntx,"fail%%  %.3f"%(1-ok/ntx),"swap-txs",sw_all,"failed %.3f"%(sw_fail/max(1,sw_all)),"fee burnt SOL %.4f"%sw_fail_fee)
print("flash-loan txs",flash,"liq txs",len(liq))
print("cyclic arb-like (>=2 swaps, only SOL/stable gain, nothing else changes):",len(arbs))
n=[a["net"] for a in arbs]
if n:
  print("net SOL/tx median %.6f mean %.5f p90 %.5f max %.4f; >0.001: %.3f; >$1 (0.0105 SOL): %d"%(st.median(n),st.mean(n),sorted(n)[int(.9*len(n))],max(n),sum(x>0.001 for x in n)/len(n),sum(x>0.0105 for x in n)))
  print("tipped share %.2f median tip %.6f tip/net on tipped %.2f"%(sum(a["tip"]>0 for a in arbs)/len(arbs),st.median([a["tip"] for a in arbs if a["tip"]>0] or [0]),sum(a["tip"] for a in arbs)/sum(n)))
  tot=sum(n); print("chain-wide: %.1f arb/min, %.3f SOL/min = $%.1f/min = $%.0f/day (upper bound, includes false pos)"%(len(arbs)/span*60,tot/span*60,tot/span*60*SOLPX,tot/span*86400*SOLPX))
  c=collections.defaultdict(lambda:[0,0.0])
  for a in arbs: c[a["signer"]][0]+=1;c[a["signer"]][1]+=a["net"]
  r=sorted(c.items(),key=lambda x:-x[1][1]);T=sum(v[1] for _,v in r)
  print("signers",len(r),"top1 %.2f top5 %.2f top10 %.2f top20 %.2f"%(r[0][1][1]/T,sum(v[1] for _,v in r[:5])/T,sum(v[1] for _,v in r[:10])/T,sum(v[1] for _,v in r[:20])/T))
  for k,v in r[:6]: print(k,v[0],"%.4f SOL"%v[1],"fails",len(fails.get(k,[])))
  rep=[k for k,v in c.items() if v[0]>=3]; print("repeat bots (>=3 arbs in sample):",len(rep),"their net share %.2f"%(sum(c[k][1] for k in rep)/T))
  bw=[k for k in c if k in fails]; print("arb signers w/ failed swap txs:",len(bw),"fails",sum(len(fails[k]) for k in bw),"fee %.5f vs net %.5f"%(sum(sum(fails[k]) for k in bw),sum(c[k][1] for k in bw)))
  for lo,hi in ((0,1e-4),(1e-4,1e-3),(1e-3,1e-2),(1e-2,1e9)): print("bucket",lo,hi,sum(lo<=x<hi for x in n))
  print(collections.Counter(p for a in arbs for p in a["progs"]).most_common(8))
print("LIQ:")
for t in liq[:30]: print(t["sig"][:10],t["err"] is None,t["liq"][0][-50:],"signer dSOL %.4f"%((t["post"][0]-t["pre"][0])/1e9))
json.dump(arbs,open("arbs.json","w"))

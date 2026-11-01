import json,collections
B=json.load(open("blocks3.json"))
KL="KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD";MF="MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA"
c=collections.Counter();names=collections.Counter();rows=[]
for b in B:
  for t in b["txs"]:
    if KL in t["keys"]: c["klend_tx"]+=1
    if MF in t["keys"]: c["mfi_tx"]+=1
    if t["liq"] and (KL in t["keys"] or MF in t["keys"] or KL in t["prog"] or MF in t["prog"]):
        c["lend_liq_"+("ok" if t["err"] is None else "fail")]+=1; rows.append(t)
    elif t["liq"]: names[t["liq"][0][-40:]]+=1
print(c,"blocks",len(B),"=",len(B)*0.4,"s"); print(names.most_common(6))
for t in rows: print(t["sig"][:10],t["liq"],t["signer"][:6],t["err"])
print("flash txs by program-ish:",sum(1 for b in B for t in b["txs"] if t["flash"]))
fl=collections.Counter()
for b in B:
  for t in b["txs"]:
    if t["flash"]:
      fl["klend" if KL in t["keys"] else "mfi" if MF in t["keys"] else "other"]+=1
print(fl)

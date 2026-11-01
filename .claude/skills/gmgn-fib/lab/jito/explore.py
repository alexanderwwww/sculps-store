import json,collections
src=open("analyze.py").read().split("tot=0")[0]
exec(src)
c=collections.Counter();cs=collections.Counter();sg=collections.Counter()
ex=[]
for b in B:
  for t in b["txs"]:
    tip=sum(t["post"][i]-t["pre"][i] for i,k in enumerate(t["keys"]) if k in TIPS and i<len(t["pre"]))
    if tip>0:
        c[t["err"] is None]+=1; sg[t["signer"]]+=1
        for p in set(t["inner"])-SKIP: cs[p]+=1
        if t["err"] is None and len(ex)<5: ex.append((t["sig"],tip,t["fee"],len(t["inner"]),t["signer"]))
print(c,len(sg),sg.most_common(8))
print(cs.most_common(15)); print(ex)

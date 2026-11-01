import json,urllib.request
d=json.load(urllib.request.urlopen(urllib.request.Request("https://yields.llama.fi/pools",headers={"User-Agent":"x"}),timeout=60))["data"]
sol=[p for p in d if p["chain"]=="Solana" and p["tvlUsd"]>5e6]
sol.sort(key=lambda p:-(p["apy"] or 0))
json.dump(sol,open("data/yields_solana.json","w"))
print("Solana pools tvl>5M:",len(sol))
for tag,f in (("SOL-denominated / LST / lending (no stable)",lambda p:any(k in p["symbol"].upper() for k in("SOL","JITO","MSOL","BSOL","JUPSOL","INF")) and p.get("stablecoin") is False and p.get("ilRisk")=="no"),
              ("stablecoin single-sided",lambda p:p.get("stablecoin") and p.get("ilRisk")=="no")):
    print("==",tag)
    for p in [x for x in sol if f(x)][:10]:
        print(f"  {p['project']:22s} {p['symbol']:22s} tvl ${p['tvlUsd']/1e6:7.1f}M apy {p['apy']:6.2f}% base {p.get('apyBase')} reward {p.get('apyReward')} 30d-mean {p.get('apyMean30d')}")
# income on 0.01 SOL (~$0.95 at SOL $95)
for apy in (6,8,10):
    print(f"APY {apy}% on 0.0097 SOL = {0.0097*apy/100:.6f} SOL/yr = {0.0097*apy/100/365*1e6:.1f} microSOL/day")

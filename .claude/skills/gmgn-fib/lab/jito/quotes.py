# Round-trip A->B->A on Jupiter quotes, 20 liquid tokens, stakes 1k..100k USD. Read-only.
import json,time,urllib.request,sys
U="https://lite-api.jup.ag/swap/v1/quote?inputMint=%s&outputMint=%s&amount=%d&slippageBps=50"
USDC="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
T={"SOL":("So11111111111111111111111111111111111111112",9),"JUP":("JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",6),"BONK":("DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",5),"WIF":("EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",6),"JTO":("jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL",9),"PYTH":("HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3",6),"RAY":("4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",6),"ORCA":("orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE",6),"RENDER":("rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof",8),"WEN":("WENWENvqqNya429ubCdR81ZmD69brwQaaBYY6p3LCpk",5),"POPCAT":("7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr",9),"MSOL":("mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",9),"JITOSOL":("J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",9),"JLP":("27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4",6),"PENGU":("2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv",6),"TRUMP":("6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN",6),"FARTCOIN":("9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump",6),"W":("85VBFQZC9TZkfaptBWjvUw7YbZjy52A6mjtPGjstQbbQ",6),"KMNO":("KMNo3nJsBXfcpJTVhZcXLW7RmTwTt4GVFE7suUBo9sS",6),"USDT":("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",6)}
px={}
def q(a,b,amt):
    for k in range(4):
        try: return json.load(urllib.request.urlopen(U%(a,b,amt),timeout=20))
        except Exception as e: time.sleep(2)
def usd_per(m,d): # tokens per 1 USDC -> price
    r=q(USDC,m,10**6*100); return int(r["outAmount"])/10**d/100 if r else None
rows=[]
for name,(m,d) in T.items():
    p=usd_per(m,d)  # tokens per $
    if not p: print(name,"noprice");continue
    for stake in (1000,10000,100000):
        a=q(USDC,m,stake*10**6)
        if not a: continue
        tok=int(a["outAmount"]); b=q(m,USDC,tok)
        if not b: continue
        back=int(b["outAmount"])/10**6
        route=[s["swapInfo"]["label"] for s in a["routePlan"]]+["|"]+[s["swapInfo"]["label"] for s in b["routePlan"]]
        rows.append({"t":time.time(),"tok":name,"stake":stake,"ret":back/stake-1,"imp_in":float(a["priceImpactPct"]),"route":route})
        print(name,stake,"roundtrip %.3f%%"%((back/stake-1)*100),route[:4],flush=True)
        time.sleep(0.4)
json.dump(rows,open("quotes_%d.json"%int(time.time()),"w"))

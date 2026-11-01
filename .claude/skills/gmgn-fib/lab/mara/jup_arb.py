# Persistent-spread test: SOL->T->SOL via Jupiter lite quote API (read-only). Round trip best-route and cross-dex (buy on X only, sell on Y only).
import json,time,urllib.request,urllib.parse,sys
SOL="So11111111111111111111111111111111111111112"
TOK={"JUP":"JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN","BONK":"DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263","WIF":"EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
"JTO":"jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL","PYTH":"HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3","USDC":"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
"RAY":"4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R","POPCAT":"7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr"}
SIZES=[10_000_000]  # 0.01 SOL
def q(i,o,a,dex=None):
    p={"inputMint":i,"outputMint":o,"amount":a,"slippageBps":50}
    if dex: p["dexes"]=dex
    try:
        d=json.load(urllib.request.urlopen("https://lite-api.jup.ag/swap/v1/quote?"+urllib.parse.urlencode(p),timeout=15))
        return int(d["outAmount"]),[x["swapInfo"]["label"] for x in d["routePlan"]]
    except Exception as e: return None,str(e)[:60]
out=open("data/jup_arb.jsonl","a"); t_end=time.time()+float(sys.argv[1])*60; n=0
while time.time()<t_end:
    for name,mint in TOK.items():
        for sz in SIZES:
            rec={"t":int(time.time()),"tok":name,"sz":sz}
            b,rb=q(SOL,mint,sz); time.sleep(1.3)
            if not b: rec["err"]=rb; out.write(json.dumps(rec)+"\n"); out.flush(); continue
            s,rs=q(mint,SOL,b); time.sleep(1.3)
            rec.update(buy=b,rb=rb,rs=rs,sell=s,rt=(s/sz if s else None))
            dx=sorted(set(rb+(rs if isinstance(rs,list) else [])))[:3]
            cross={}
            for X in dx:
                bx,_=q(SOL,mint,sz,X); time.sleep(1.3)
                if not bx: continue
                for Y in dx:
                    sy,_=q(mint,SOL,bx,Y); time.sleep(1.3)
                    if sy: cross[f"{X}>{Y}"]=sy/sz
            rec["cross"]=cross; out.write(json.dumps(rec)+"\n"); out.flush(); n+=1

import json,urllib.request,sys,time
W="8Gyirjrgyz2bMPVEYMEsxcaMGWiKB5svUH7zpcxgrrvX"
def rpc(m,p):
    for i in range(4):
        try:
            r=urllib.request.Request("https://api.mainnet-beta.solana.com",json.dumps({"jsonrpc":"2.0","id":1,"method":m,"params":p}).encode(),{"content-type":"application/json"})
            j=json.load(urllib.request.urlopen(r,timeout=30))
            if 'error' in j: time.sleep(2);continue
            return j['result']
        except Exception as e: time.sleep(2)
sigs=rpc("getSignaturesForAddress",[W,{"limit":int(sys.argv[1]) if len(sys.argv)>1 else 60}])
out=[]
for s in sigs:
    t=rpc("getTransaction",[s['signature'],{"encoding":"jsonParsed","maxSupportedTransactionVersion":0}])
    if not t: continue
    m=t['meta'];keys=[k['pubkey'] if isinstance(k,dict) else k for k in t['transaction']['message']['accountKeys']]
    i=keys.index(W)
    pre=[b for b in m['preTokenBalances']];post=m['postTokenBalances']
    tok=[(b['mint'],b['owner'],b['uiTokenAmount']['amount']) for b in post if b['owner']==W]
    prt=[(b['mint'],b['owner'],b['uiTokenAmount']['amount']) for b in pre if b['owner']==W]
    out.append(dict(sig=s['signature'],bt=t['blockTime'],err=m['err'],fee=m['fee'],net=m['postBalances'][i]-m['preBalances'][i],pre=prt,post=tok,ninstr=len(t['transaction']['message']['instructions'])))
    time.sleep(0.15)
json.dump(out,open('chain.json','w'))
print(len(out))

import sys,statistics as st
sys.argv=['x','5m','3']
exec(open('bars_test.py').read().split("cfgs=list")[0])
for cfg in ((6,3.5,12,'rev'),(12,2.5,12,'rev')):
    print(cfg)
    for s,r in data.items():
        for nm,(lo,hi) in (('tr',(0,.6)),('te',(.6,1))):
            t=trades(r,*cfg,lo,hi)
            if t: print('  ',s,nm,'n=%d net(taker)=%+.2f%%'%(len(t),(st.mean(x[1] for x in t)-0.001)*100))
    allt=sorted(trades(r,*cfg,.6,1.0)+[] for r in [])  # placeholder

import json,statistics as st
L=json.load(open('live-log-2026-11-01.json'))['lines']
buys=[x for x in L if x['type']=='buy'];rows=[]
for s in L:
    if s['type']!='sell' or s.get('partial') or not s.get('est'):continue
    b=[x for x in buys if x['name']==s['name'] and x['at']<s['at']]
    if not b:continue
    b=b[-1];hold=(s['at']-b['at'])/1000;e=s['est']
    rows.append(dict(name=s['name'][:12],stake=s['stake'],hold=hold,ret=s['ret'],q=e['ret'],low=e['low'],peak=e['peak'],kind=e['kind'],trig=e['trig']))
print(len(rows))
# decomposition: ret = q (quote at decision, vs stake: entry cost+spread+drift)  +  (ret-q) (exit fill vs quote incl sell fee, landing drift)
n=len(rows);m=lambda k:st.mean(k(r) for r in rows)*100
print('mean realised ret %.2f  mean quote-at-decision %.2f  mean exit gap (ret-q) %.2f  median gap %.2f'%(m(lambda r:r['ret']),m(lambda r:r['q']),m(lambda r:r['ret']-r['q']),st.median(r['ret']-r['q'] for r in rows)*100))
# entry cost proxy: for trades that never went up (peak<=0.005) the decision quote is the first-ish quote minus drift
flat=[r for r in rows if r['peak']<=0.005]
print('never-up trades',len(flat),'mean q %.2f mean ret %.2f gap %.2f'%(st.mean(r['q'] for r in flat)*100,st.mean(r['ret'] for r in flat)*100,st.mean(r['ret']-r['q'] for r in flat)*100))
for k in('take','stop','time','lock'):
    s=[r for r in rows if r['kind']==k]
    if s:print(k,len(s),'ret %.2f q %.2f gap %.2f hold %.0f'%(st.mean(r['ret'] for r in s)*100,st.mean(r['q'] for r in s)*100,st.mean(r['ret']-r['q'] for r in s)*100,st.mean(r['hold'] for r in s)))
# stake effect
for lo,hi in((0,0.0035),(0.0035,0.0095),(0.0095,1)):
    s=[r for r in rows if lo<=r['stake']<hi]
    if s:print('stake',lo,hi,len(s),'ret %.2f q %.2f gap %.2f'%(st.mean(r['ret'] for r in s)*100,st.mean(r['q'] for r in s)*100,st.mean(r['ret']-r['q'] for r in s)*100))
# stops: loss mostly present at first quote? low==q for stop & hold short
stops=[r for r in rows if r['kind']=='stop'];print('stops hold median',st.median(r['hold'] for r in stops),'q-trig',st.mean(r['q']-r['trig'] for r in stops)*100)
# build-80 filter replay: a pre-trade sell-quote round trip < 5%. proxy: skip when 'never-up' first quote<-5% i.e. low<=-0.05 and peak<=0.005
pred=[r for r in rows if r['low']<=-0.05];print('trades with low<=-5%%: %d, their mean ret %.2f; others %d mean ret %.2f'%(len(pred),st.mean(r['ret'] for r in pred)*100,n-len(pred),st.mean(r['ret'] for r in rows if r['low']>-0.05)*100))
big=[r for r in rows if r['ret']<=-0.05];print('trades ret<=-5%%: %d  of which stake-stop-or-first-quote caught: %d'%(len(big),sum(1 for r in big if r['q']<=-0.05)))
print('sum pnl of ret<=-5% trades (pct pts):',sum(r['ret'] for r in big)*100,'sum all',sum(r['ret'] for r in rows)*100)
print('mean ret excl those:',st.mean(r['ret'] for r in rows if r['ret']>-0.05)*100)
# mismatch table
print('\nname hold ret q gap kind')
for r in sorted(rows,key=lambda r:r['ret']-r['q'])[:6]+sorted(rows,key=lambda r:r['ret']-r['q'])[-6:]:
    print(r['name'],round(r['hold']),round(r['ret']*100,1),round(r['q']*100,1),round((r['ret']-r['q'])*100,1),r['kind'])
json.dump(rows,open('logsplit.json','w'))

import json,statistics as st,collections
R=json.load(open('rt-results.json'))
S=['0.003','0.01','0.03','0.1']
B=[('<5k',0,5e3),('5-20k',5e3,2e4),('20-100k',2e4,1e5),('100-500k',1e5,5e5),('0.5-2M',5e5,2e6),('>2M',2e6,1e13)]
def cell(rows,s):
    v=[r['t'][s]['rt'] for r in rows if 'rt' in r['t'][s]]
    n=len(rows);ok=len(v)
    if not v:return '  -  (0/%d)'%n
    return '%5.1f%% med %5.1f%% <2%%:%d/%d'%(st.mean(v)*100,st.median(v)*100,sum(1 for x in v if x<0.02),ok)
print('bucket n | mean RT / median RT / count RT<2% ; per stake SOL')
for nm,a,b in B:
    rows=[r for r in R if a<=r['liq']<b]
    print('%-9s n=%2d'%(nm,len(rows)),' | '.join('%s: %s'%(s,cell(rows,s)) for s in S))
print('\nroutability (round trip priced) by stake:',{s:sum(1 for r in R if 'rt' in r['t'][s]) for s in S},'of',len(R))
# dex
print('\nby dex (stake 0.003/0.03):')
for d in sorted({r['dex'] for r in R}):
    rows=[r for r in R if r['dex']==d]
    print(d,len(rows),cell(rows,'0.003'),'||',cell(rows,'0.03'))
# age
print('\nby age (min) stake 0.003:')
for nm,a,b in(('<30m',0,30),('30m-3h',30,180),('3h-24h',180,1440),('>1d',1440,1e9)):
    rows=[r for r in R if a<=r['ageMin']<b];print(nm,len(rows),cell(rows,'0.003'))
# impact vs rt
print('\nliquidity threshold: share RT<2% / <3% / <5% at stake 0.003 by liq cut')
for cut in(5e3,1e4,2e4,5e4,1e5,2e5,5e5,1e6):
    rows=[r for r in R if r['liq']>=cut and 'rt' in r['t']['0.003']]
    if rows:print('liq>=%8d n=%2d  RT<2%%:%2d  <3%%:%2d  <5%%:%2d  median %.1f%%'%(cut,len(rows),sum(r['t']['0.003']['rt']<.02 for r in rows),sum(r['t']['0.003']['rt']<.03 for r in rows),sum(r['t']['0.003']['rt']<.05 for r in rows),st.median(r['t']['0.003']['rt'] for r in rows)*100))
# stake-effect: min rt per coin
print('\nRT<2% coins at 0.003 :')
for r in sorted(R,key=lambda r:r['t']['0.003'].get('rt',9)):
    t=r['t']['0.003']
    if t.get('rt',9)<0.02:print(' %-18s liq $%8.0f vol24 $%9.0f age %6.0fm %s  rt003 %.2f%% rt01 %s rt03 %s'%(r['name'][:18],r['liq'],r['vol24'],r['ageMin'],r['dex'],t['rt']*100,*[('%.2f%%'%(r['t'][s]['rt']*100) if 'rt' in r['t'][s] else '-') for s in('0.01','0.03')]))

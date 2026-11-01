from common import *
src=open('p3.py').read().split("# baselines")[0];exec(src)
def cond(name,fn):
    o=[]
    for sp in('train','test'):
        r={1:[],3:[],5:[],15:[]}
        for (p,C,H,L,V,a0) in DATA:
            if p['split']!=sp:continue
            for i in range(11,len(C)-16):
                if V[i]>0 and fn(C,V,i):
                    for h in r:r[h].append(C[i+h]/C[i]-1)
        o.append(sp+' n=%d '%len(r[1])+' '.join('+%dm gross med%+.1f mean(clip)%+.1f'%(h,100*st.median(v),100*st.mean(min(max(x,-.9),1) for x in v)) for h,v in r.items()))
    print('%-28s %s'%(name,' || '.join(o)))
cond('r1>=+3%',lambda C,V,i:C[i]/C[i-1]-1>=.03)
cond('r1>=+8%',lambda C,V,i:C[i]/C[i-1]-1>=.08)
cond('r1>=+8% & 3 prior flat',lambda C,V,i:C[i]/C[i-1]-1>=.08 and abs(C[i-1]/C[i-4]-1)<.03)
cond('r1<=-5%',lambda C,V,i:C[i]/C[i-1]-1<=-.05)
cond('r1<=-10%',lambda C,V,i:C[i]/C[i-1]-1<=-.10)
cond('3 green in row each>=2%',lambda C,V,i:all(C[i-k]/C[i-k-1]-1>=.02 for k in range(3)))
cond('any minute (baseline)',lambda C,V,i:True)

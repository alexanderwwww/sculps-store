import * as O from "/home/user/sculps-store/tools/autotrader/src/lib/organism.mjs";
let fired=0,tot=0,ex=null;
for(let seed=1;seed<=300;seed++){
  let rnd=seed*7919;const R=()=>(rnd=(rnd*16807)%2147483647)/2147483647;
  const org=O.newOrg();const cfg={sl:-0.02,partAt:0.9,tp:0.006,partFrac:0.5};tot++;
  for(let i=0;i<80;i++){
    const peak=R()<0.3?0.05+R()*0.15:R()*0.01, low=-R()*0.08, stopped=low<-0.02&&R()<0.7;
    const ret=stopped?-0.04:(peak>0.006?0.006:-0.01);
    const r=O.step(org,{sig:{path:"mom",rise:0.02},ret,holdS:15,stake:0.003,feeLamports:8000,exitKind:stopped?"stop":"take",slAt:-0.02,peak,low,tPeak:5,tLow:stopped?3:8,restRet:ret,gap:-0.01},cfg);
    if(r.exits){fired++;ex=r.exits;break}
  }
}
console.log("seeds where refit fired",fired,"/",tot,JSON.stringify(ex));

import { fiveTick, freshFive } from "../src/five.mjs";
const end = Math.floor(Date.now()/60000)*60; let c=[];
for (let t=end; t>end-5*86400; t-=300*60){ const r=await fetch(`https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=60&start=${new Date((t-300*60)*1000).toISOString()}&end=${new Date(t*1000).toISOString()}`,{headers:{"user-agent":"bt"}}); c.push(...await r.json()); }
c=[...new Map(c.map(x=>[x[0],x])).values()].sort((a,b)=>a[0]-b[0]).map(([t,l,h,o,cl])=>({t,o,c:cl}));
const s=freshFive();
for (let i=70;i<c.length;i++){ const now=c[i].t+60+5; fiveTick(s, c.slice(i-69,i+1), now); }
const w=s.bets.filter(b=>b.won).length;
console.log("bets",s.bets.length,"win",(100*w/s.bets.length).toFixed(1)+"%","balance",s.balance,"from",s.start,"avg price",(s.bets.reduce((a,b)=>a+b.price,0)/s.bets.length).toFixed(2));
console.log(s.log.slice(0,4).map(l=>l.m).join("\n"));

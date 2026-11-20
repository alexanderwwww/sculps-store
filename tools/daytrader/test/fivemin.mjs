// Backtest 5-minute BTC up/down rounds on real Coinbase 1-minute candles (last ~5 days).
const end = Math.floor(Date.now()/60000)*60; let c = [];
for (let t = end; t > end - 5*86400; t -= 300*60) {
  const r = await fetch(`https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=60&start=${new Date((t-300*60)*1000).toISOString()}&end=${new Date(t*1000).toISOString()}`, {headers:{"user-agent":"bt"}});
  c.push(...await r.json());
}
c = [...new Map(c.map(x=>[x[0],x])).values()].sort((a,b)=>a[0]-b[0]).map(([t,l,h,o,cl,v])=>({t,o,c:cl}));
const rounds = []; // each 5-min round: open at t (multiple of 300), close at t+300
const byT = new Map(c.map(x=>[x.t,x]));
for (const x of c) if (x.t % 300 === 0 && byT.has(x.t+240)) rounds.push({t:x.t, open:x.o, close:byT.get(x.t+240).c});
const strats = {
  momentum: (i) => rounds[i-1].close >= rounds[i-1].open ? "up" : "down",
  reversal: (i) => rounds[i-1].close >= rounds[i-1].open ? "down" : "up",
  trend3:   (i) => { const u=[1,2,3].filter(k=>rounds[i-k].close>=rounds[i-k].open).length; return u>=2?"up":"down"; },
  alwaysUp: () => "up",
};
const FEE = 0.02, PRICE = 0.5;
for (const [n,f] of Object.entries(strats)) {
  let w=0,N=0; for (let i=3;i<rounds.length;i++){ const pick=f(i); const up=rounds[i].close>=rounds[i].open; if((pick==="up")===up)w++; N++; }
  const pnl = w*(1-PRICE) - (N-w)*PRICE - N*FEE; // $1-payout contracts bought at 0.50
  console.log(n.padEnd(9), "rounds", N, "win", (100*w/N).toFixed(1)+"%", "P&L per $0.50 bet: $"+pnl.toFixed(2));
}

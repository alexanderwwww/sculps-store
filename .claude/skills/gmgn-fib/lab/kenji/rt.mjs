// real round trip from Jupiter quotes: buy S SOL -> sell the tokens returned. read-only.
import fs from "fs";
const SOL="So11111111111111111111111111111111111111112", B="https://lite-api.jup.ag/swap/v1";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function q(i,o,a,extra=""){for(let k=0;k<5;k++){const r=await fetch(`${B}/quote?inputMint=${i}&outputMint=${o}&amount=${a}&slippageBps=${o===SOL?3500:400}${extra}`);
  if(r.status===429){await sleep(1500*(k+1));continue}const j=await r.json().catch(()=>null);return j&&!j.error&&j.outAmount?j:null}return null}
export async function trip(mint,S,extra=""){const L=Math.round(S*1e9);const b=await q(SOL,mint,L,extra);if(!b)return{err:"nobuy"};
  const s=await q(mint,SOL,b.outAmount,extra);if(!s)return{err:"nosell",imp:+b.priceImpactPct};
  return{rt:1-Number(s.outAmount)/L,imp:+b.priceImpactPct,impS:+s.priceImpactPct,routes:b.routePlan.map(x=>x.swapInfo.label).join("+"),sroutes:s.routePlan.map(x=>x.swapInfo.label).join("+")}}
if(process.argv[1].endsWith("rt.mjs")){
  const pools=JSON.parse(fs.readFileSync("pools-now.json"));const stakes=[0.003,0.01,0.03,0.1];const res=[];
  for(const p of pools){const row={...p,t:{}};for(const S of stakes){row.t[S]=await trip(p.mint,S);await sleep(250)}res.push(row);process.stderr.write(".")}
  fs.writeFileSync("rt-results.json",JSON.stringify(res,null,1));
}

// collect ~100 SOL-quoted pools of varied liquidity (GeckoTerminal, read-only)
import fs from "fs";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const urls=[];
for(const p of [1,2,3]) urls.push(`https://api.geckoterminal.com/api/v2/networks/solana/trending_pools?page=${p}&include=base_token`);
for(const p of [1,2,3]) urls.push(`https://api.geckoterminal.com/api/v2/networks/solana/new_pools?page=${p}&include=base_token`);
for(const p of [1,2,3,4,5]) urls.push(`https://api.geckoterminal.com/api/v2/networks/solana/pools?page=${p}&sort=h24_volume_usd_desc&include=base_token`);
const out=new Map();
for(const u of urls){
  try{const r=await fetch(u,{headers:{accept:"application/json"}});if(!r.ok){console.error(u,r.status);await sleep(3000);continue}
  const j=await r.json();
  for(const d of j.data){const a=d.attributes;const mint=d.relationships.base_token.data.id.replace("solana_","");
   const q=d.relationships.quote_token.data.id.replace("solana_","");
   if(q!=="So11111111111111111111111111111111111111112")continue;
   const dex=d.relationships.dex.data.id;
   const ageMin=(Date.now()-new Date(a.pool_created_at))/60000;
   if(!out.has(mint))out.set(mint,{mint,name:a.name,liq:+a.reserve_in_usd,vol24:+a.volume_usd.h24,dex,ageMin,chg1h:+a.price_change_percentage.h1,tx1h:(a.transactions.h1.buys+a.transactions.h1.sells),src:u.split("/").pop().split("?")[0]})}
  }catch(e){console.error(e.message)}
  await sleep(2200);
}
fs.writeFileSync("pools-now.json",JSON.stringify([...out.values()],null,1));
console.log(out.size);

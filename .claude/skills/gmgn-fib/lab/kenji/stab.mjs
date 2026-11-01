import fs from "fs";import {trip} from "./rt.mjs";
const R=JSON.parse(fs.readFileSync("rt-results.json"));const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pick=R.filter(r=>r.t["0.003"].rt!=null&&r.t["0.003"].rt<0.05&&r.liq>5000&&r.liq<2e6).sort((a,b)=>a.liq-b.liq);
const sel=pick.filter((_,i)=>i%Math.ceil(pick.length/12)===0).slice(0,12);const out=[];
for(const p of sel){const rep=[];for(let k=0;k<4;k++){const t=await trip(p.mint,0.003);rep.push(t.rt);await sleep(1500)}
 const d=await trip(p.mint,0.003,"&onlyDirectRoutes=true");
 const o={name:p.name,liq:p.liq,dex:p.dex,rep,direct:d.rt,droutes:d.routes,base:p.t["0.003"].routes};out.push(o);console.log(JSON.stringify(o));}
fs.writeFileSync("stab-results.json",JSON.stringify(out,null,1));

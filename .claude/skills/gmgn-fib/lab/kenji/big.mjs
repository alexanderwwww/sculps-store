import fs from "fs";import {trip} from "./rt.mjs";
const R=JSON.parse(fs.readFileSync("rt-results.json"));
const cheap=R.filter(r=>r.liq>=1e5&&r.t["0.003"].rt!=null&&r.t["0.003"].rt<=0.02);
const mid=R.filter(r=>r.liq>=2e4&&r.liq<1e5&&r.t["0.003"].rt!=null&&r.t["0.003"].rt<0.05).slice(0,24);
const sel=[...cheap,...mid];const out=[];
for(const p of sel){const row={name:p.name,mint:p.mint,liq:p.liq,dex:p.dex,ageMin:p.ageMin,small:p.t["0.003"].rt,t:{}};
 for(const S of[0.105,0.21,0.42])row.t[S]=await trip(p.mint,S);
 out.push(row);console.log(out.length+"/"+sel.length,p.name);fs.writeFileSync("rt-big.json",JSON.stringify(out,null,1));}

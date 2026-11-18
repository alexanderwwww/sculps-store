import WebSocket from 'ws'; import hpa from 'https-proxy-agent'; const H=hpa.HttpsProxyAgent||hpa;
const ws=new WebSocket('wss://pumpportal.fun/api/data',{agent:new H(process.env.HTTPS_PROXY)});
let c={create:0,buy:0,sell:0,other:0},samples=[],keys=new Set(),t0=Date.now();
ws.on('open',()=>{ws.send(JSON.stringify({method:'subscribeNewToken'}));ws.send(JSON.stringify({method:'subscribeMigration'}));});
ws.on('message',m=>{let j;try{j=JSON.parse(m)}catch{console.log('RAW',String(m).slice(0,300));return}
 if(j.message||j.errors){console.log('MSG',JSON.stringify(j).slice(0,400));return}
 if(j.txType==='create'){c.create++;keys.add(j.mint);ws.send(JSON.stringify({method:'subscribeTokenTrade',keys:[j.mint]}));}
 else if(j.txType==='buy'||j.txType==='sell'){c[j.txType]++; if(samples.length<2)samples.push(j);}
 else {c.other++; if(c.other<3)console.log('OTHER',JSON.stringify(j).slice(0,400));}});
ws.on('close',(a,b)=>console.log('CLOSE',a,String(b)));ws.on('error',e=>console.log('ERR',e.message));
setTimeout(()=>{console.log(JSON.stringify(c),'secs',(Date.now()-t0)/1e3);samples.forEach(s=>console.log(JSON.stringify(s)));process.exit(0)},180000);

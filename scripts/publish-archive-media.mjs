import fs from 'node:fs';import crypto from 'node:crypto';import sharp from 'sharp';
const file='catalogue/mysterious-archive/products.json',ps=JSON.parse(fs.readFileSync(file));const manifest={};
for(const p of ps)for(const im of p.images){if(!im.url.startsWith('/archive-media/'))continue;const local='public'+im.url;const bytes=await sharp(local).resize({width:1400,height:1400,fit:'inside',withoutEnlargement:true}).webp({quality:90}).toBuffer();const hash=crypto.createHash('sha256').update(bytes).digest('hex').slice(0,16);const key='ma26-'+hash+'.webp';manifest[im.url]={key,bytes};}
let count=0;const pending=Object.entries(manifest);async function worker(){while(pending.length){const [url,{key,bytes}]=pending.shift();const res=await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/r2/buckets/gardenbuddy-media/objects/${key}`,{method:'PUT',headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,'Content-Type':'image/webp'},body:bytes});if(!res.ok)throw Error('Media upload '+res.status+' '+key);count++;}}
await Promise.all(Array.from({length:4},worker));
for(const p of ps)for(const im of p.images)if(manifest[im.url])im.url='/media/'+manifest[im.url].key;
fs.writeFileSync(file,JSON.stringify(ps,null,2));console.log('Uploaded '+count+' own-store photos to R2; original source files preserved.');

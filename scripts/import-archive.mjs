import {neon} from '@neondatabase/serverless';import fs from 'node:fs';
const sql=neon(process.env.DATABASE_URL);const catalogue=JSON.parse(fs.readFileSync('catalogue/mysterious-archive/products.json'));
const [store]=await sql`select id from stores where slug='mysterious-archive'`;if(!store)throw Error('Existing archive store required');
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
for(const p of catalogue){
 const images=JSON.stringify(p.images),description='<p>'+esc(p.copy)+'</p><p>Condition: '+esc(p.condition)+'</p>';
 let [product]=await sql`select id from products where store_id=${store.id} and handle=${p.id}`;
 if(!product)[product]=await sql`insert into products(store_id,handle,title,description,status,images) values(${store.id},${p.id},${p.title},${description},'draft',${images}::jsonb) returning id`;
 else await sql`update products set title=${p.title},description=${description},images=${images}::jsonb where id=${product.id} and store_id=${store.id}`;
 const [variant]=await sql`select id from variants where product_id=${product.id} order by position limit 1`;
 if(variant) await sql`update variants set label=${p.condition},price_cents=${Math.round(p.price*100)},is_default=true where id=${variant.id}`;
 else await sql`insert into variants(product_id,label,price_cents,is_default,available,sku) values(${product.id},${p.condition},${Math.round(p.price*100)},true,${p.id==='oval-star-belt-34'?0:1},${'MA-'+p.id})`;
}
console.log('Prepared '+catalogue.length+' draft products in existing Mysterious Archive store; existing products, orders and variants preserved.');

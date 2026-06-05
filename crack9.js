/**
 * Non-HMAC, hash-chain, and SHA256-composition approaches.
 * Also: verify if our 13/15 might be 15/15 with different position data.
 */
const crypto = require("crypto");

const SERVER = "8bdde84089ca17399dab7e0891ec9a9dc92b4bfbb7b54a4689cb24ed969e8c2f";
const CLIENT = "tarKkvBXpuWbhw14";
const NONCE  = 37;
const MINES  = 15;
const ACTUAL = new Set([3,5,7,8,11,13,14,16,17,19,20,21,22,23,24]);

function score(arr, s=ACTUAL) { let n=0; for(const m of arr) if(s.has(m)) n++; return n; }

const u32be = (b,i) => (((b[i]<<24)|(b[i+1]<<16)|(b[i+2]<<8)|b[i+3])>>>0)/0x100000000;
const u8    = (b,i) => b[i]/256;

function fyDesc(floatArr) {
  const p = Array.from({length:25},(_,i)=>i);
  let fi=0;
  for(let i=24;i>0;i--) {
    const f = typeof floatArr==="function" ? floatArr() : floatArr[fi++];
    const j = Math.floor(f*(i+1));
    [p[i],p[j]]=[p[j],p[i]];
  }
  return p;
}

let best=0, bestLabel="", winners=[];
function test(label, mines) {
  const sc=score(mines);
  if(sc>best){best=sc;bestLabel=label;}
  if(sc===15) winners.push({label,mines:[...mines].sort((a,b)=>a-b)});
  if(sc>=13) console.log(`  ${sc}/15  ${label}  → [${[...mines].sort((a,b)=>a-b).join(",")}]`);
}

// ── 1. Pure SHA256 (no HMAC) ───────────────────────────────────────────────
console.log("=== Pure SHA256 (no HMAC) ===");
const pureFormats = [
  ["s:c:n:cursor", (c) => `${SERVER}:${CLIENT}:${NONCE}:${c}`],
  ["c:n:s:cursor", (c) => `${CLIENT}:${NONCE}:${SERVER}:${c}`],
  ["c:n:cursor",   (c) => `${CLIENT}:${NONCE}:${c}`],
  ["n:c:cursor",   (c) => `${NONCE}:${CLIENT}:${c}`],
  ["s+c+n",        (c) => `${SERVER}${CLIENT}${NONCE}`],
];
for(const [name, fmt] of pureFormats) {
  let c=0, buf=null, pos=0;
  const p = fyDesc(function() {
    while(true){
      if(buf&&pos+4<=buf.length){const v=u32be(buf,pos);pos+=4;return v;}
      buf=crypto.createHash("sha256").update(fmt(c),"utf8").digest();pos=0;c++;
    }
  });
  test(`sha256_plain|${name}|desc|first`, p.slice(0,MINES));
  test(`sha256_plain|${name}|desc|last`, p.slice(25-MINES));
}

// ── 2. Hash chain: each hash uses previous as key ──────────────────────────
console.log("\n=== Hash chain ===");
for(const algo of ["sha256","sha512"]) {
  // Chain where next key = previous hash
  let chainKey = SERVER;
  const bufs = [];
  for(let i=0;i<4;i++) {
    const h = crypto.createHmac(algo, chainKey).update(`${CLIENT}:${NONCE}`).digest();
    bufs.push(h);
    chainKey = h.toString("hex");
  }
  const allBytes = Buffer.concat(bufs);
  // Use as float stream
  const floats = [];
  for(let i=0;i+3<allBytes.length&&floats.length<24;i+=4)
    floats.push(u32be(allBytes,i));
  const p = fyDesc(floats);
  test(`${algo}|chain|first`, p.slice(0,MINES));
  test(`${algo}|chain|last`, p.slice(25-MINES));
}

// ── 3. SHA256 of HMAC then use bytes ──────────────────────────────────────
console.log("\n=== SHA256(HMAC) chain ===");
for(const algo of ["sha256","sha512"]) {
  const hmac = crypto.createHmac(algo, SERVER).update(`${CLIENT}:${NONCE}:0`).digest("hex");
  let hashStr = hmac;
  const bufs = [];
  for(let i=0;i<4;i++) {
    const h = Buffer.from(hashStr,"hex");
    bufs.push(h);
    hashStr = crypto.createHash("sha256").update(hashStr,"utf8").digest("hex");
  }
  const allBytes = Buffer.concat(bufs);
  const floats = [];
  for(let i=0;i+3<allBytes.length&&floats.length<24;i+=4)
    floats.push(u32be(allBytes,i));
  const p = fyDesc(floats);
  test(`${algo}|hmac-then-chain|first`, p.slice(0,MINES));
}

// ── 4. Message = hash-bytes (not hex string) as update ────────────────────
console.log("\n=== Message as binary hash bytes ===");
for(const algo of ["sha256","sha512"]) {
  const hmacBuf = crypto.createHmac(algo, SERVER).update(`${CLIENT}:${NONCE}:0`).digest();
  // Re-HMAC using hash bytes as key
  const hmac2 = crypto.createHmac("sha256", hmacBuf).update(`${CLIENT}:${NONCE}:0`).digest();
  const floats = [];
  for(let i=0;i+3<hmac2.length&&floats.length<24;i+=4)
    floats.push(u32be(hmac2,i));
  while(floats.length<24){
    const next = crypto.createHmac("sha256",hmacBuf).update(`${CLIENT}:${NONCE}:${floats.length>>3}`).digest();
    for(let i=0;i+3<next.length&&floats.length<24;i+=4) floats.push(u32be(next,i));
  }
  const p=fyDesc(floats);
  test(`${algo}+hmacBufKey|first`, p.slice(0,MINES));
}

// ── 5. Inspect our 13/15 result exactly ───────────────────────────────────
console.log("\n=== Our 13/15 SHA512+u8+n:cs exact result ===");
const h512 = crypto.createHmac("sha512", SERVER).update(`${NONCE}:${CLIENT}`).digest();
const p512 = fyDesc(function(){ const buf=h512; let i=0; return ()=>{ const f=buf[i]/256; i++; return f; }; }());
console.log("Predicted mines:", p512.slice(0,15).sort((a,b)=>a-b).join(","));
console.log("Predicted safe:", p512.slice(15).sort((a,b)=>a-b).join(","));
console.log("Actual mines:  ", [...ACTUAL].sort((a,b)=>a-b).join(","));
console.log("Actual safe:   ", Array.from({length:25},(_,i)=>i).filter(i=>!ACTUAL.has(i)).join(","));
console.log("\nWrong (predicted as mine but safe):", p512.slice(0,15).filter(x=>!ACTUAL.has(x)).join(","));
console.log("Missed (mine but not predicted):", [...ACTUAL].filter(x=>!p512.slice(0,15).includes(x)).sort((a,b)=>a-b).join(","));

// ── 6. Try our algo with DIFFERENT actual data (swap 4↔20 and 6↔21) ──────
console.log("\n=== Hypothesis: positions 4,6 ARE mines (20,21 safe) ===");
const ACTUAL_ALT = new Set([3,4,5,6,7,8,11,13,14,16,17,19,22,23,24]); // our 13/15 prediction
console.log("If actual mines are:", [...ACTUAL_ALT].sort((a,b)=>a-b).join(","));
console.log("Then our SHA512+u8+n:cs gives:", score(p512.slice(0,15), ACTUAL_ALT), "/15 (15=perfect match)");

console.log("\n══════════════════════════════════");
console.log(`Overall best vs original data: ${best}/15 — ${bestLabel}`);
if(winners.length) { console.log("\n🎯 PERFECT MATCHES:"); winners.forEach(w=>console.log("  ",w.label,"→",w.mines.join(","))); }

/**
 * Test 7-byte/52-bit float extraction (Thrill/Softswiss instant games method)
 * and cursor-per-step variants.
 */
const crypto = require("crypto");

const SERVER = "8bdde84089ca17399dab7e0891ec9a9dc92b4bfbb7b54a4689cb24ed969e8c2f";
const CLIENT = "tarKkvBXpuWbhw14";
const NONCE  = 37;
const MINES  = 15;
const ACTUAL = new Set([3,5,7,8,11,13,14,16,17,19,20,21,22,23,24]);
function score(arr) { let n=0; for(const m of arr) if(ACTUAL.has(m)) n++; return n; }

// ── 7-byte float: 7 bytes → mask top nibble → 52-bit → /2^52 ──────────────
function float52(b, off) {
  const v = (b[off] & 0x0F) * 281474976710656   // 2^48
          + b[off+1] * 1099511627776             // 2^40
          + b[off+2] * 4294967296               // 2^32
          + b[off+3] * 16777216                 // 2^24
          + b[off+4] * 65536                    // 2^16
          + b[off+5] * 256
          + b[off+6];
  return v / 4503599627370496;  // 2^52
}

function makeStream7byte(algo, key, msgFn) {
  let cursor=0, buf=null, pos=0;
  return function() {
    while(true) {
      if(buf && pos+7 <= buf.length) {
        const v = float52(buf, pos); pos+=7; return v;
      }
      buf = crypto.createHmac(algo, key).update(msgFn(cursor)).digest();
      pos=0; cursor++;
    }
  };
}

// ── Other extractors ──────────────────────────────────────────────────────
const u32be = (b,i) => (((b[i]<<24)|(b[i+1]<<16)|(b[i+2]<<8)|b[i+3])>>>0)/0x100000000;
const u8    = (b,i) => b[i]/256;

let best=0, bestLabel="", winners=[];

function fy_desc(sf) {
  const p = Array.from({length:25},(_,i)=>i);
  for(let i=24;i>0;i--){ const j=Math.floor(sf()*(i+1)); [p[i],p[j]]=[p[j],p[i]]; }
  return p;
}

// ── Test 1: 7-byte float with SHA512 ─────────────────────────────────────
console.log("=== 7-byte float (SHA512) ===");
const msgs = {
  "cs:n:c": c=>`${CLIENT}:${NONCE}:${c}`,
  "n:cs:c": c=>`${NONCE}:${CLIENT}:${c}`,
  "cs:n"  : c=>`${CLIENT}:${NONCE}`,
  "n:cs"  : c=>`${NONCE}:${CLIENT}`,
};
for(const [mname, msgFn] of Object.entries(msgs)) {
  const sf = makeStream7byte("sha512", SERVER, msgFn);
  const p = fy_desc(sf);
  for(const last of [false,true]) {
    const mines = last ? p.slice(25-MINES) : p.slice(0,MINES);
    const sc = score(mines);
    const label = `sha512|7byte|${mname}|${last?"last":"first"}`;
    if(sc>best){best=sc;bestLabel=label;}
    if(sc===15) winners.push({label,mines:[...mines].sort((a,b)=>a-b)});
    if(sc>=13) console.log(`  ${sc}/15  ${label}  → [${[...mines].sort((a,b)=>a-b).join(",")}]`);
  }
}

// Also with SHA256
console.log("\n=== 7-byte float (SHA256) ===");
for(const [mname, msgFn] of Object.entries(msgs)) {
  const sf = makeStream7byte("sha256", SERVER, msgFn);
  const p = fy_desc(sf);
  for(const last of [false,true]) {
    const mines = last ? p.slice(25-MINES) : p.slice(0,MINES);
    const sc = score(mines);
    const label = `sha256|7byte|${mname}|${last?"last":"first"}`;
    if(sc>best){best=sc;bestLabel=label;}
    if(sc===15) winners.push({label,mines:[...mines].sort((a,b)=>a-b)});
    if(sc>=13) console.log(`  ${sc}/15  ${label}  → [${[...mines].sort((a,b)=>a-b).join(",")}]`);
  }
}

// ── Test 2: cursor-per-step (new hash for EACH shuffle step) ──────────────
console.log("\n=== Cursor per shuffle step ===");
for(const algo of ["sha256","sha512"]) {
  for(const [mname, _] of Object.entries(msgs)) {
    for(const extName of ["u32be","u8"]) {
      const extFn = extName==="u32be" ? u32be : u8;
      const stepSize = extName==="u32be" ? 4 : 1;
      // cursor = current shuffle step index (0-indexed from i=24 down to i=1)
      const p = Array.from({length:25},(_,i)=>i);
      for(let i=24;i>0;i--) {
        const step = 24-i;  // step 0 for i=24, step 23 for i=1
        let msgFn;
        if(mname==="cs:n:c") msgFn = `${CLIENT}:${NONCE}:${step}`;
        else if(mname==="n:cs:c") msgFn = `${NONCE}:${CLIENT}:${step}`;
        else if(mname==="cs:n") msgFn = `${CLIENT}:${NONCE}`;
        else msgFn = `${NONCE}:${CLIENT}`;
        const buf = crypto.createHmac(algo, SERVER).update(msgFn).digest();
        const f = extFn(buf, 0);
        const j = Math.floor(f*(i+1));
        [p[i],p[j]]=[p[j],p[i]];
      }
      for(const last of [false,true]) {
        const mines = last ? p.slice(25-MINES) : p.slice(0,MINES);
        const sc = score(mines);
        const label = `${algo}|perStep|${mname}|${extName}|${last?"last":"first"}`;
        if(sc>best){best=sc;bestLabel=label;}
        if(sc===15) winners.push({label,mines:[...mines].sort((a,b)=>a-b)});
        if(sc>=13) console.log(`  ${sc}/15  ${label}  → [${[...mines].sort((a,b)=>a-b).join(",")}]`);
      }
    }
  }
}

// ── Test 3: hashed serverSeed as key ──────────────────────────────────────
console.log("\n=== SHA256-hashed serverSeed as HMAC key ===");
const hashedKey = crypto.createHash("sha256").update(SERVER).digest("hex");
for(const algo of ["sha256","sha512"]) {
  for(const [mname, msgFn] of Object.entries(msgs)) {
    let cursor=0, buf=null, pos=0;
    const p = Array.from({length:25},(_,i)=>i);
    function nf2() {
      while(true){
        if(buf&&pos+4<=buf.length){const v=u32be(buf,pos);pos+=4;return v;}
        buf=crypto.createHmac(algo,hashedKey).update(msgFn(cursor)).digest();pos=0;cursor++;
      }
    }
    for(let i=24;i>0;i--){const j=Math.floor(nf2()*(i+1));[p[i],p[j]]=[p[j],p[i]];}
    const mines=p.slice(0,MINES);
    const sc=score(mines);
    const label=`${algo}|SHA256Key|${mname}`;
    if(sc>best){best=sc;bestLabel=label;}
    if(sc===15) winners.push({label,mines:[...mines].sort((a,b)=>a-b)});
    if(sc>=13) console.log(`  ${sc}/15  ${label}  → [${[...mines].sort((a,b)=>a-b).join(",")}]`);
  }
}

// ── Test 4: Double-hash approach (SHA256 of HMAC output as float source) ──
console.log("\n=== Double-hash: SHA256(HMAC) as float source ===");
for(const [mname, msgFn] of Object.entries(msgs)) {
  const hmac0 = crypto.createHmac("sha256", SERVER).update(msgFn(0)).digest("hex");
  let hashChain = hmac0;
  let pos=0, chainBuf = Buffer.from(hashChain, "hex");
  const p = Array.from({length:25},(_,i)=>i);
  for(let i=24;i>0;i--) {
    if(pos+4 > chainBuf.length) {
      // re-hash the chain
      hashChain = crypto.createHash("sha256").update(hashChain).digest("hex");
      chainBuf = Buffer.from(hashChain, "hex");
      pos=0;
    }
    const f = u32be(chainBuf, pos); pos+=4;
    const j = Math.floor(f*(i+1));
    [p[i],p[j]]=[p[j],p[i]];
  }
  const mines=p.slice(0,MINES);
  const sc=score(mines);
  const label=`double-sha256|${mname}`;
  if(sc>best){best=sc;bestLabel=label;}
  if(sc===15) winners.push({label,mines:[...mines].sort((a,b)=>a-b)});
  if(sc>=13) console.log(`  ${sc}/15  ${label}  → [${[...mines].sort((a,b)=>a-b).join(",")}]`);
}

// ── Test 5: Try rejection sampling to avoid bias ──────────────────────────
console.log("\n=== Rejection sampling (unbiased) ===");
function makeStream256(msgFn) {
  let cursor=0, buf=null, pos=0;
  return function() {
    while(true){
      if(buf&&pos+4<=buf.length){const v=u32be(buf,pos);pos+=4;return v;}
      buf=crypto.createHmac("sha256",SERVER).update(msgFn(cursor)).digest();pos=0;cursor++;
    }
  };
}
for(const [mname, msgFn] of Object.entries(msgs)) {
  const sf = makeStream256(msgFn);
  const p = Array.from({length:25},(_,i)=>i);
  for(let i=24;i>0;i--) {
    // rejection sample to avoid modulo bias: reject if f * (i+1) would be biased
    let j;
    do {
      const raw = sf();
      j = Math.floor(raw * (i+1));
    } while(false); // no rejection in this simple version - just making the structure
    [p[i],p[j]]=[p[j],p[i]];
  }
  const mines=p.slice(0,MINES);
  const sc=score(mines);
  // Already tested standard, just verify
}

console.log("\n══════════════════════════════════");
console.log(`Best: ${best}/15 — ${bestLabel}`);
if(winners.length){
  console.log("\n🎯 PERFECT MATCHES:");
  winners.forEach(w=>console.log("  ",w.label,"→ mines:",w.mines.join(",")));
}

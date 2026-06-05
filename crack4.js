/**
 * Try alternative mine-placement strategies:
 * 1. Rank-based: generate 25 values, rank them, top-N = mines
 * 2. Rejection sampling: pick positions until N unique mines found
 * 3. Modulo bias variants
 * 4. Multiple hash outputs concatenated then ranked
 * Also inspects exact float stream from best variant.
 */
const crypto = require("crypto");

const SERVER = "8bdde84089ca17399dab7e0891ec9a9dc92b4bfbb7b54a4689cb24ed969e8c2f";
const CLIENT = "tarKkvBXpuWbhw14";
const NONCE  = 37;
const MINES  = 15;
const ACTUAL = new Set([3,5,7,8,11,13,14,16,17,19,20,21,22,23,24]);

function score(arr) { let n=0; for (const m of arr) if (ACTUAL.has(m)) n++; return n; }
function hmac(algo, key, msg) { return crypto.createHmac(algo, key).update(msg).digest(); }

// ─── Show exact float stream from best variant ─────────────────────────────
console.log("=== Best variant: sha512 | u8 | n:cs | desc | nonce=37 ===");
const buf512 = hmac("sha512", SERVER, `${NONCE}:${CLIENT}`);
console.log("SHA512 bytes (hex):", buf512.toString("hex").match(/.{2}/g).join(" "));
console.log("As floats (b[i]/256):");
for (let i=0; i<25; i++) process.stdout.write(`  [${i}]=${(buf512[i]/256).toFixed(6)}`);
console.log();

// Fisher-Yates desc with these floats:
const p0 = Array.from({length:25},(_,i)=>i);
for (let i=24; i>0; i--) {
  const f = buf512[24-i] / 256; // try different byte ordering
  const j = Math.floor(f*(i+1));
  [p0[i],p0[j]]=[p0[j],p0[i]];
}
console.log("FY desc (reversed byte order):", p0.slice(0,MINES).sort((a,b)=>a-b).join(","), "→", score(p0.slice(0,MINES)));

// ─── Rank-based: sort 25 values, highest N = mines ─────────────────────────
console.log("\n=== Rank-based selection ===");
for (const algo of ["sha256","sha512"]) {
  for (const msg of [`${CLIENT}:${NONCE}`, `${NONCE}:${CLIENT}`, `${CLIENT}:${NONCE}:0`, `${NONCE}:${CLIENT}:0`]) {
    const h = hmac(algo, SERVER, msg);
    // need at least 25 values; SHA256=32bytes, SHA512=64bytes
    // extend if needed
    let vals = [];
    let c = 0;
    while (vals.length < 25) {
      const hh = hmac(algo, SERVER, `${msg.split(':').slice(0,-1).join(':')}:${c}`);
      for (const b of hh) vals.push(b);
      c++;
      if (c > 5) break;
    }
    const sorted = Array.from({length:25},(_,i)=>({i,v:vals[i]})).sort((a,b)=>b.v-a.v);
    const minesHigh = sorted.slice(0,MINES).map(x=>x.i).sort((a,b)=>a-b);
    const minesLow  = sorted.slice(25-MINES).map(x=>x.i).sort((a,b)=>a-b);
    // also try u32 values for ranking
    const buf2 = hmac(algo, SERVER, msg);
    const u32s = [];
    for (let i=0; i+3<buf2.length && u32s.length<25; i+=4)
      u32s.push({i: u32s.length, v: ((buf2[i]<<24)|(buf2[i+1]<<16)|(buf2[i+2]<<8)|buf2[i+3])>>>0});
    const s2high = u32s.sort((a,b)=>b.v-a.v).slice(0,Math.min(MINES,u32s.length)).map(x=>x.i);
    if (minesHigh.length===MINES) {
      const sc = score(minesHigh);
      if(sc>=12) console.log(`  rank-high u8 ${algo} "${msg}": ${sc}/15 → [${minesHigh.join(",")}]`);
    }
    if (minesLow.length===MINES) {
      const sc = score(minesLow);
      if(sc>=12) console.log(`  rank-low  u8 ${algo} "${msg}": ${sc}/15 → [${minesLow.join(",")}]`);
    }
  }
}

// ─── Rejection sampling ────────────────────────────────────────────────────
console.log("\n=== Rejection sampling ===");
function rejectionSample(algo, msgFn, extractFn, stepSize) {
  let cursor=0, buf=null, pos=0;
  function nextVal() {
    while(true) {
      if(buf && pos+stepSize <= buf.length) { const v=extractFn(buf,pos); pos+=stepSize; return v; }
      buf = hmac(algo, SERVER, msgFn(cursor)); pos=0; cursor++;
    }
  }
  const mines = new Set();
  while (mines.size < MINES) {
    const v = nextVal();
    const pos_ = Math.floor(v * 25);
    if (pos_ < 25 && !mines.has(pos_)) mines.add(pos_);
  }
  return [...mines];
}

for (const algo of ["sha256","sha512"]) {
  for (const [mname, msgFn] of [
    ["cs:n:c", c=>`${CLIENT}:${NONCE}:${c}`],
    ["n:cs:c", c=>`${NONCE}:${CLIENT}:${c}`],
    ["cs:n",   c=>`${CLIENT}:${NONCE}`],
    ["n:cs",   c=>`${NONCE}:${CLIENT}`],
  ]) {
    for (const [ename, [sz, extFn]] of [
      ["u32be", [4, (b,i)=>(((b[i]<<24)|(b[i+1]<<16)|(b[i+2]<<8)|b[i+3])>>>0)/0x100000000]],
      ["u8",    [1, (b,i)=>b[i]/256]],
    ]) {
      const mines = rejectionSample(algo, msgFn, extFn, sz);
      const sc = score(mines);
      if(sc>=12) console.log(`  reject ${algo}|${ename}|${mname}: ${sc}/15 → [${mines.sort((a,b)=>a-b).join(",")}]`);
    }
  }
}

// ─── XOR-folded approach: XOR first/second 32 bytes of sha512 output ──────
console.log("\n=== XOR-folded sha512 ===");
for (const msg of [`${CLIENT}:${NONCE}:0`, `${NONCE}:${CLIENT}:0`, `${CLIENT}:${NONCE}`, `${NONCE}:${CLIENT}`]) {
  const h = hmac("sha512", SERVER, msg);
  const folded = Buffer.alloc(32);
  for (let i=0; i<32; i++) folded[i] = h[i] ^ h[i+32];
  // Use as 8×4-byte floats
  for (const asc of [false,true]) {
    let pos=0;
    const p = Array.from({length:25},(_,i)=>i);
    function nf() {
      if (pos+4 > folded.length) pos=0;
      const v = (((folded[pos]<<24)|(folded[pos+1]<<16)|(folded[pos+2]<<8)|folded[pos+3])>>>0)/0x100000000;
      pos+=4; return v;
    }
    if(asc) { for(let i=0;i<24;i++){const j=i+Math.floor(nf()*(25-i));[p[i],p[j]]=[p[j],p[i]];} }
    else     { for(let i=24;i>0;i--){const j=Math.floor(nf()*(i+1));[p[i],p[j]]=[p[j],p[i]];} }
    for (const last of [false,true]) {
      const mines = last ? p.slice(25-MINES) : p.slice(0,MINES);
      const sc = score(mines);
      if(sc>=12) console.log(`  XOR-fold "${msg}" ${asc?"asc":"desc"} ${last?"last":"first"}: ${sc}/15 → [${mines.sort((a,b)=>a-b).join(",")}]`);
    }
  }
}

// ─── Try Rainbet-specific: maybe nonce is 0-indexed internally ─────────────
console.log("\n=== Nonce offsets + variations ===");
for (const noff of [-5,-4,-3,-2,-1,0,1,2,3,4,5]) {
  const n = NONCE + noff;
  for (const msg of [
    `${CLIENT}:${n}:0`, `${n}:${CLIENT}:0`,
    `${CLIENT}:${n}`, `${n}:${CLIENT}`,
    `${CLIENT}-${n}-0`, `${CLIENT}-${n}`,
  ]) {
    for (const algo of ["sha256","sha512"]) {
      let cursor=0, buf=null, pos=0;
      const p = Array.from({length:25},(_,i)=>i);
      function nf2() {
        while(true){
          if(buf && pos+4<=buf.length){const v=(((buf[pos]<<24)|(buf[pos+1]<<16)|(buf[pos+2]<<8)|buf[pos+3])>>>0)/0x100000000;pos+=4;return v;}
          buf = hmac(algo, SERVER, msg.includes(':0') || msg.includes('-0') ? msg.replace(/[:\-]\d+$/, `${msg.includes(':')? ':' : '-'}${cursor}`) : msg); pos=0; cursor++;
        }
      }
      for(let i=24;i>0;i--){const j=Math.floor(nf2()*(i+1));[p[i],p[j]]=[p[j],p[i]];}
      for(const last of [false,true]){
        const mines = last?p.slice(25-MINES):p.slice(0,MINES);
        const sc=score(mines);
        if(sc>=14) console.log(`  n+${noff} ${algo} "${msg}" ${last?"last":"first"}: ${sc}/15 → [${mines.sort((a,b)=>a-b).join(",")}]`);
      }
    }
  }
}

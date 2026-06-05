/**
 * Deep dive around the 13/15 variants — try more extraction methods
 * and alternative tile-selection strategies.
 */
const crypto = require("crypto");

const SERVER = "8bdde84089ca17399dab7e0891ec9a9dc92b4bfbb7b54a4689cb24ed969e8c2f";
const CLIENT = "tarKkvBXpuWbhw14";
const NONCE  = 37;
const MINES  = 15;
const ACTUAL = new Set([3,5,7,8,11,13,14,16,17,19,20,21,22,23,24]);

function score(arr) { let n=0; for (const m of arr) if (ACTUAL.has(m)) n++; return n; }
function hmac(algo, key, msg) { return crypto.createHmac(algo, key).update(msg).digest(); }

// ─── All byte-to-float variants ────────────────────────────────────────────
const extMethods = {
  "u32be/2^32" : (b,i) => (((b[i]<<24)|(b[i+1]<<16)|(b[i+2]<<8)|b[i+3])>>>0)/4294967296,
  "u32le/2^32" : (b,i) => (((b[i+3]<<24)|(b[i+2]<<16)|(b[i+1]<<8)|b[i])>>>0)/4294967296,
  "u16be/2^16" : (b,i) => ((b[i]<<8)|b[i+1])/65536,
  "u16le/2^16" : (b,i) => ((b[i+1]<<8)|b[i])/65536,
  "u8/256"     : (b,i) => b[i]/256,
  // mod-based (no divide)
  "u32be%25"   : (b,i) => (((b[i]<<24)|(b[i+1]<<16)|(b[i+2]<<8)|b[i+3])>>>0) % 25,
  // shifted right by 1
  "u32be>>1"   : (b,i) => (((b[i]<<24)|(b[i+1]<<16)|(b[i+2]<<8)|b[i+3])>>>0) / 2147483648,
};

function* stream512(msgFn) {
  let cursor=0;
  while (true) {
    const buf = hmac("sha512", SERVER, msgFn(cursor));
    for (let i=0; i<buf.length-3; i+=4) yield buf.slice(i, i+4);
    cursor++;
  }
}
function* stream512_2(msgFn) { // 2-byte chunks
  let cursor=0;
  while (true) {
    const buf = hmac("sha512", SERVER, msgFn(cursor));
    for (let i=0; i<buf.length-1; i+=2) yield buf.slice(i, i+2);
    cursor++;
  }
}
function* stream512_1(msgFn) { // 1-byte chunks
  let cursor=0;
  while (true) {
    const buf = hmac("sha512", SERVER, msgFn(cursor));
    for (let i=0; i<buf.length; i++) yield [buf[i]];
    cursor++;
  }
}

// ─── Different selection strategies ────────────────────────────────────────

// Fisher-Yates descending, take first N
function selectFYD_firstN(floatFn, stepBytes) {
  const p = Array.from({length:25},(_,i)=>i);
  for (let i=24; i>0; i--) {
    const f = stepBytes===1 ? floatFn()[0]/256 : (stepBytes===2 ? ((floatFn()[0]<<8)|floatFn()[0])/65536 : (((floatFn()[0]<<24)|(floatFn()[1]<<16)|(floatFn()[2]<<8)|floatFn()[3])>>>0)/4294967296);
    const j = Math.floor(f * (i+1));
    [p[i],p[j]]=[p[j],p[i]];
  }
  return p.slice(0,MINES);
}

// Generic shuffle + selection
function doTest(hashAlgo, msgFn, chunkSize, extractFn, shuffleAsc, selectLast) {
  let cursor=0, buf=null, pos=0;
  function nextChunk() {
    while(true){
      if(buf && pos+chunkSize <= buf.length){ const c=buf.slice(pos,pos+chunkSize); pos+=chunkSize; return c; }
      buf = hmac(hashAlgo, SERVER, msgFn(cursor)); pos=0; cursor++;
    }
  }
  const p = Array.from({length:25},(_,i)=>i);
  if (shuffleAsc) {
    for (let i=0; i<24; i++) {
      const f = extractFn(nextChunk(), 0);
      const j = i + Math.floor(f * (25-i));
      [p[i],p[j]]=[p[j],p[i]];
    }
  } else {
    for (let i=24; i>0; i--) {
      const f = extractFn(nextChunk(), 0);
      const j = Math.floor(f * (i+1));
      [p[i],p[j]]=[p[j],p[i]];
    }
  }
  return selectLast ? p.slice(25-MINES) : p.slice(0,MINES);
}

const msgVariants = {
  "n:cs"      : c => `${NONCE}:${CLIENT}`,
  "n:cs:c"    : c => `${NONCE}:${CLIENT}:${c}`,
  "cs:n:c"    : c => `${CLIENT}:${NONCE}:${c}`,
  "c:cs:n"    : c => `${c}:${CLIENT}:${NONCE}`,
  "cs:c:n"    : c => `${CLIENT}:${c}:${NONCE}`,
  "cs-n"      : c => `${CLIENT}-${NONCE}`,
  "cs-n-c"    : c => `${CLIENT}-${NONCE}-${c}`,
};

const chunkExtract = {
  "4B-BE": [4, (b,i) => (((b[0]<<24)|(b[1]<<16)|(b[2]<<8)|b[3])>>>0)/4294967296],
  "4B-LE": [4, (b,i) => (((b[3]<<24)|(b[2]<<16)|(b[1]<<8)|b[0])>>>0)/4294967296],
  "2B-BE": [2, (b,i) => ((b[0]<<8)|b[1])/65536],
  "2B-LE": [2, (b,i) => ((b[1]<<8)|b[0])/65536],
  "1B"   : [1, (b,i) => b[0]/256],
};

let best=0, bestLabel="";
const winners=[];

console.log("Testing sha256 and sha512 with extended formats...\n");

for (const [algo] of [["sha256"],["sha512"]]) {
  for (const [mname, msgFn] of Object.entries(msgVariants)) {
    for (const [cname, [cs, extFn]] of Object.entries(chunkExtract)) {
      for (const sasc of [false, true]) {
        for (const slast of [false, true]) {
          const mines = doTest(algo, msgFn, cs, extFn, sasc, slast);
          const sc = score(mines);
          const label = `${algo}|${cname}|${mname}|${sasc?"asc":"desc"}|${slast?"last":"first"}`;
          if (sc > best) { best=sc; bestLabel=label; }
          if (sc===15) winners.push({label, mines});
          if (sc>=13) console.log(`  ${sc}/15  ${label}  → [${mines.sort((a,b)=>a-b).join(",")}]`);
        }
      }
    }
  }
}

// ─── Also try: rank-based selection (generate 25 floats, pick N lowest = mines) ──
console.log("\n--- Rank-based selection ---");
for (const algo of ["sha256","sha512"]) {
  for (const [mname, msgFn] of Object.entries(msgVariants)) {
    for (const [cname, [cs, extFn]] of Object.entries(chunkExtract)) {
      let cursor=0, buf=null, pos=0;
      function nextF() {
        while(true){
          if(buf && pos+cs <= buf.length){ const c=buf.slice(pos,pos+cs); pos+=cs; return extFn(c,0); }
          buf = hmac(algo, SERVER, msgFn(cursor)); pos=0; cursor++;
        }
      }
      // generate 25 floats, rank them
      const pairs = Array.from({length:25},(_,i)=>({i, f: nextF()}));
      pairs.sort((a,b)=>a.f-b.f);
      const minesLow  = pairs.slice(0,MINES).map(x=>x.i).sort((a,b)=>a-b);
      const minesHigh = pairs.slice(25-MINES).map(x=>x.i).sort((a,b)=>a-b);
      const scL = score(minesLow), scH = score(minesHigh);
      if (scL>=13) { console.log(`  ${scL}/15  RANK-LOW  ${algo}|${cname}|${mname}  → [${minesLow.join(",")}]`); if(scL>best){best=scL;bestLabel=`RANK-LOW ${algo}|${cname}|${mname}`;} if(scL===15) winners.push({label:`RANK-LOW ${algo}|${cname}|${mname}`,mines:minesLow}); }
      if (scH>=13) { console.log(`  ${scH}/15  RANK-HIGH ${algo}|${cname}|${mname}  → [${minesHigh.join(",")}]`); if(scH>best){best=scH;bestLabel=`RANK-HIGH ${algo}|${cname}|${mname}`;} if(scH===15) winners.push({label:`RANK-HIGH ${algo}|${cname}|${mname}`,mines:minesHigh}); }
    }
  }
}

console.log("\n══════════════════════════════════");
console.log(`Best: ${best}/15 — ${bestLabel}`);
if (winners.length) {
  console.log("\n🎯 PERFECT MATCHES:");
  winners.forEach(w => console.log(" ", w.label, "→ mines:", w.mines.join(",")));
}

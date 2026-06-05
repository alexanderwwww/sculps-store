/**
 * Key insight to test: serverSeed used as hex-decoded bytes vs plain string.
 * Also tries nonce as buffer, clientSeed hex-decoded, and other encoding combos.
 */
const crypto = require("crypto");

const SERVER     = "8bdde84089ca17399dab7e0891ec9a9dc92b4bfbb7b54a4689cb24ed969e8c2f";
const SERVER_BUF = Buffer.from(SERVER, "hex");  // 32 raw bytes
const CLIENT     = "tarKkvBXpuWbhw14";
const NONCE      = 37;
const MINES      = 15;
const ACTUAL     = new Set([3,5,7,8,11,13,14,16,17,19,20,21,22,23,24]);

function score(arr) { let n=0; for (const m of arr) if (ACTUAL.has(m)) n++; return n; }

function doShuffle(algo, keyBuf, msgFn, chunkSize, extractFn, asc) {
  let cursor=0, buf=null, pos=0;
  function nextFloat() {
    while(true) {
      if(buf && pos+chunkSize <= buf.length) {
        const f = extractFn(buf, pos); pos+=chunkSize; return f;
      }
      buf = crypto.createHmac(algo, keyBuf).update(msgFn(cursor)).digest();
      pos=0; cursor++;
    }
  }
  const p = Array.from({length:25},(_,i)=>i);
  if (asc) {
    for (let i=0; i<24; i++) {
      const j = i + Math.floor(nextFloat()*(25-i));
      [p[i],p[j]]=[p[j],p[i]];
    }
  } else {
    for (let i=24; i>0; i--) {
      const j = Math.floor(nextFloat()*(i+1));
      [p[i],p[j]]=[p[j],p[i]];
    }
  }
  return p;
}

const exts = {
  "u32be": [4, (b,i) => (((b[i]<<24)|(b[i+1]<<16)|(b[i+2]<<8)|b[i+3])>>>0)/0x100000000],
  "u32le": [4, (b,i) => (((b[i+3]<<24)|(b[i+2]<<16)|(b[i+1]<<8)|b[i])>>>0)/0x100000000],
  "u16be": [2, (b,i) => ((b[i]<<8)|b[i+1])/0x10000],
  "u8"   : [1, (b,i) => b[i]/256],
};

const keys = {
  "key=str" : SERVER,
  "key=hex" : SERVER_BUF,
};

const msgs = {
  "cs:n:c"  : c => `${CLIENT}:${NONCE}:${c}`,
  "n:cs:c"  : c => `${NONCE}:${CLIENT}:${c}`,
  "cs:n"    : c => `${CLIENT}:${NONCE}`,
  "n:cs"    : c => `${NONCE}:${CLIENT}`,
  "cs-n-c"  : c => `${CLIENT}-${NONCE}-${c}`,
  "cs-n"    : c => `${CLIENT}-${NONCE}`,
};

let best=0, bestLabel="", winners=[];

for (const [kname, key] of Object.entries(keys)) {
  for (const algo of ["sha256","sha512"]) {
    for (const [mname, msgFn] of Object.entries(msgs)) {
      for (const [ename, [cs, extFn]] of Object.entries(exts)) {
        for (const asc of [false, true]) {
          for (const last of [false, true]) {
            const shuffled = doShuffle(algo, key, msgFn, cs, extFn, asc);
            const mines = last ? shuffled.slice(25-MINES) : shuffled.slice(0,MINES);
            const sc = score(mines);
            const label = `${kname}|${algo}|${ename}|${mname}|${asc?"asc":"desc"}|${last?"last":"first"}`;
            if(sc>best){best=sc;bestLabel=label;}
            if(sc===15) winners.push({label,mines:[...mines].sort((a,b)=>a-b)});
            if(sc>=13) console.log(`  ${sc}/15  ${label}  → [${[...mines].sort((a,b)=>a-b).join(",")}]`);
          }
        }
      }
    }
  }
}

// ─── Extra: try message as Buffer (not string) ─────────────────────────────
console.log("\n--- Message as raw bytes ---");
for (const [kname, key] of Object.entries(keys)) {
  for (const algo of ["sha256","sha512"]) {
    for (const [ename, [cs, extFn]] of Object.entries(exts)) {
      for (const asc of [false, true]) {
        for (const last of [false, true]) {
          // message as utf8 bytes: `clientSeed:nonce:cursor`
          let cursor=0, buf=null, pos=0;
          const p = Array.from({length:25},(_,i)=>i);
          function nextFloat() {
            while(true) {
              if(buf && pos+cs <= buf.length) { const f=extFn(buf,pos); pos+=cs; return f; }
              // Try: nonce as 4-byte big-endian integer in the message
              const nc = Buffer.alloc(4); nc.writeUInt32BE(NONCE, 0);
              const cc = Buffer.alloc(4); cc.writeUInt32BE(cursor, 0);
              const msgBuf = Buffer.concat([Buffer.from(CLIENT), nc, cc]);
              buf = crypto.createHmac(algo, key).update(msgBuf).digest();
              pos=0; cursor++;
            }
          }
          if (asc) {
            for (let i=0; i<24; i++) { const j=i+Math.floor(nextFloat()*(25-i)); [p[i],p[j]]=[p[j],p[i]]; }
          } else {
            for (let i=24; i>0; i--) { const j=Math.floor(nextFloat()*(i+1)); [p[i],p[j]]=[p[j],p[i]]; }
          }
          const mines = last ? p.slice(25-MINES) : p.slice(0,MINES);
          const sc = score(mines);
          if(sc>best){best=sc;bestLabel=`rawmsg:${kname}|${algo}|${ename}|${asc?"asc":"desc"}|${last?"last":"first"}`;}
          if(sc===15) winners.push({label:`rawmsg:${kname}|${algo}|${ename}|${asc?"asc":"desc"}|${last?"last":"first"}`,mines:[...mines].sort((a,b)=>a-b)});
          if(sc>=13) console.log(`  ${sc}/15  rawmsg:${kname}|${algo}|${ename}|${asc?"asc":"desc"}|${last?"last":"first"}  → [${[...mines].sort((a,b)=>a-b).join(",")}]`);
        }
      }
    }
  }
}

console.log("\n══════════════════════════════════");
console.log(`Best: ${best}/15 — ${bestLabel}`);
if (winners.length) {
  console.log("\n🎯 PERFECT MATCHES:");
  winners.forEach(w => console.log("  ", w.label, "→ mines:", w.mines.join(",")));
}

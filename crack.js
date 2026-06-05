/**
 * Systematic search for Rainbet's exact provably fair algorithm.
 * Real verified data:
 *   serverSeed : 8bdde84089ca17399dab7e0891ec9a9dc92b4bfbb7b54a4689cb24ed969e8c2f
 *   clientSeed : tarKkvBXpuWbhw14
 *   nonce      : 37
 *   mineCount  : 15
 *   ACTUAL mines: [3,5,7,8,11,13,14,16,17,19,20,21,22,23,24]
 */
const crypto = require("crypto");

const SERVER = "8bdde84089ca17399dab7e0891ec9a9dc92b4bfbb7b54a4689cb24ed969e8c2f";
const CLIENT = "tarKkvBXpuWbhw14";
const NONCE  = 37;
const MINES  = 15;
const ACTUAL = new Set([3,5,7,8,11,13,14,16,17,19,20,21,22,23,24]);

function overlap(predicted) {
  let n = 0;
  for (const m of predicted) if (ACTUAL.has(m)) n++;
  return n;
}

// ─── Float extraction variants ─────────────────────────────────────────────
function bytesToFloatBE(b, i)  { return (((b[i]<<24)|(b[i+1]<<16)|(b[i+2]<<8)|b[i+3])>>>0)/0x100000000; }
function bytesToFloatLE(b, i)  { return (((b[i+3]<<24)|(b[i+2]<<16)|(b[i+1]<<8)|b[i])>>>0)/0x100000000; }
function bytesToFloat3BE(b, i) { return (((b[i]<<16)|(b[i+1]<<8)|b[i+2])>>>0)/0x1000000; }
function bytesToFloat1(b, i)   { return b[i]/256; }

// ─── HMAC helpers ──────────────────────────────────────────────────────────
function hmac256(key, msg) { return crypto.createHmac("sha256",key).update(msg).digest(); }
function hmac512(key, msg) { return crypto.createHmac("sha512",key).update(msg).digest(); }

// ─── Fisher-Yates variants ─────────────────────────────────────────────────
// Standard: descend i from 24→1, swap positions[i] with positions[j≤i]
function shuffleDesc(floatFn) {
  const p = Array.from({length:25},(_,i)=>i);
  for (let i=24; i>0; i--) {
    const j = Math.floor(floatFn() * (i+1));
    [p[i],p[j]]=[p[j],p[i]];
  }
  return p;
}
// Ascending: i from 0→23
function shuffleAsc(floatFn) {
  const p = Array.from({length:25},(_,i)=>i);
  for (let i=0; i<24; i++) {
    const j = i + Math.floor(floatFn() * (25-i));
    [p[i],p[j]]=[p[j],p[i]];
  }
  return p;
}

// ─── Stream generators for different message formats ───────────────────────
function makeStream(hashFn, msgFn, bytesToFloat, stepSize) {
  let cursor = 0, buf = null, pos = 0;
  return function nextFloat() {
    while (true) {
      if (buf && pos + stepSize <= buf.length) {
        const f = bytesToFloat(buf, pos);
        pos += stepSize;
        return f;
      }
      buf = hashFn(SERVER, msgFn(CLIENT, NONCE, cursor));
      pos = 0;
      cursor++;
    }
  };
}

// ─── Message format variants ───────────────────────────────────────────────
const msgFormats = {
  "cs:n:c"  : (cs,n,c) => `${cs}:${n}:${c}`,
  "n:cs:c"  : (cs,n,c) => `${n}:${cs}:${c}`,
  "cs:c:n"  : (cs,n,c) => `${cs}:${c}:${n}`,
  "c:cs:n"  : (cs,n,c) => `${c}:${cs}:${n}`,
  "cs-n-c"  : (cs,n,c) => `${cs}-${n}-${c}`,
  "cs:n"    : (cs,n,c) => `${cs}:${n}`,        // no cursor
  "n:cs"    : (cs,n,c) => `${n}:${cs}`,
  "cs-n"    : (cs,n,c) => `${cs}-${n}`,
};

const hashFns   = { sha256: hmac256, sha512: hmac512 };
const floatExts = {
  "BE4": [bytesToFloatBE, 4],
  "LE4": [bytesToFloatLE, 4],
  "BE3": [bytesToFloat3BE, 3],
  "B1" : [bytesToFloat1, 1],
};
const shuffles  = { desc: shuffleDesc, asc: shuffleAsc };
const mineSelections = {
  "first": p => p.slice(0, MINES),
  "last" : p => p.slice(25 - MINES),
};

let best = 0;
let bestVariant = "";
const winners = [];

for (const [hname, hashFn] of Object.entries(hashFns)) {
  for (const [fname, [floatFn, step]] of Object.entries(floatExts)) {
    for (const [mfname, msgFn] of Object.entries(msgFormats)) {
      for (const [sname, shuffleFn] of Object.entries(shuffles)) {
        for (const [msname, mineSel] of Object.entries(mineSelections)) {
          // try nonces ±3 around 37 as well
          for (const nonce of [35,36,37,38,39]) {
            // rebuild stream with this nonce
            let cursor2 = 0, buf2 = null, pos2 = 0;
            const stream = function() {
              while (true) {
                if (buf2 && pos2 + step <= buf2.length) {
                  const f = floatFn(buf2, pos2); pos2 += step; return f;
                }
                buf2 = hashFn(SERVER, msgFn(CLIENT, nonce, cursor2));
                pos2 = 0; cursor2++;
              }
            };
            const shuffled = shuffleFn(stream);
            const mines = mineSel(shuffled);
            const score = overlap(mines);
            const label = `${hname}|${fname}|${mfname}|${sname}|${msname}|n=${nonce}`;
            if (score > best) { best = score; bestVariant = label; }
            if (score === 15) winners.push({ label, mines });
            if (score >= 12) console.log(`  ✓ ${score}/15  ${label}  → [${mines.sort((a,b)=>a-b).join(",")}]`);
          }
        }
      }
    }
  }
}

console.log("\n══════════════════════════════════");
console.log(`Best: ${best}/15 — ${bestVariant}`);
if (winners.length) {
  console.log("\n🎯 PERFECT MATCHES:");
  winners.forEach(w => console.log("  ", w.label, "\n   mines:", w.mines.sort((a,b)=>a-b).join(",")));
} else {
  console.log("\nNo perfect match yet. Best:", best);
}

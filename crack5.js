/**
 * Focused tests around best 13/15 variant:
 * sha512 | u8 | msg="nonce:clientSeed" | FY-desc | first-N
 *
 * Try:
 * 1. Byte offset shifts (start at byte 1, 2, etc.)
 * 2. j = floor(f*i) instead of floor(f*(i+1))
 * 3. FY starting at i=25 or i=23
 * 4. mineCount in message
 * 5. serverSeed hex bytes as key
 * 6. Alternate byte stride (every 2nd byte)
 * 7. Float clamping: f * (i+1) → min(floor, i)
 */
const crypto = require("crypto");

const SERVER   = "8bdde84089ca17399dab7e0891ec9a9dc92b4bfbb7b54a4689cb24ed969e8c2f";
const SBUF     = Buffer.from(SERVER, "hex");
const CLIENT   = "tarKkvBXpuWbhw14";
const NONCE    = 37;
const MINES    = 15;
const ACTUAL   = new Set([3,5,7,8,11,13,14,16,17,19,20,21,22,23,24]);

function score(arr) { let n=0; for (const m of arr) if (ACTUAL.has(m)) n++; return n; }

function getHash512(key, msg) {
  return crypto.createHmac("sha512", key).update(msg).digest();
}

// Base hash for all tests
const BASE_MSG  = `${NONCE}:${CLIENT}`;
const BASE_H256 = crypto.createHmac("sha256", SERVER).update(BASE_MSG).digest();
const BASE_H512 = getHash512(SERVER, BASE_MSG);
const BASE_H512_HEX = getHash512(SERVER, SBUF.toString("binary")).update; // unused

let best=0, bestLabel="", winners=[];

function test(label, p) {
  const mines = p.slice(0,MINES);
  const sc = score(mines);
  if(sc>best){best=sc;bestLabel=label;}
  if(sc===15) winners.push({label,mines:[...mines].sort((a,b)=>a-b)});
  if(sc>=13) console.log(`  ${sc}/15  ${label}  → [${[...mines].sort((a,b)=>a-b).join(",")}]`);
  const minesLast = p.slice(25-MINES);
  const sc2 = score(minesLast);
  if(sc2>best){best=sc2;bestLabel=label+"|last";}
  if(sc2===15) winners.push({label:label+"|last",mines:[...minesLast].sort((a,b)=>a-b)});
  if(sc2>=13) console.log(`  ${sc2}/15  ${label}|last  → [${[...minesLast].sort((a,b)=>a-b).join(",")}]`);
}

function shuffle(buf, byteOffset, byteStride, startI, endI, jFormula) {
  const p = Array.from({length:25},(_,i)=>i);
  let byteIdx = byteOffset;
  function nextByte() {
    const b = buf[byteIdx % buf.length];
    byteIdx += byteStride;
    return b;
  }
  for (let i=startI; i>=endI; i--) {
    const f = nextByte() / 256;
    const j = jFormula(f, i);
    if(j >= 0 && j < 25) [p[i],p[j]]=[p[j],p[i]];
  }
  return p;
}

// ─── 1. Byte offset variants ────────────────────────────────────────────────
console.log("=== Byte offset variants (SHA512, n:cs, desc) ===");
for (let off=0; off<10; off++) {
  for (const [jname, jfn] of [
    ["j=f*(i+1)", (f,i)=>Math.floor(f*(i+1))],
    ["j=f*i",     (f,i)=>Math.floor(f*i)],
    ["j=f*25",    (f,i)=>Math.floor(f*25)],
  ]) {
    // i from 24 downto 1
    const p = shuffle(BASE_H512, off, 1, 24, 1, jfn);
    test(`off=${off}|${jname}`, p);
  }
}

// ─── 2. Start-i variants ────────────────────────────────────────────────────
console.log("\n=== Start-i variants (SHA512, n:cs) ===");
for (const startI of [24,25,23]) {
  for (const endI of [0,1]) {
    for (const [jname, jfn] of [
      ["j=f*(i+1)", (f,i)=>Math.floor(f*(i+1))],
      ["j=f*(n-i)", (f,i)=>Math.floor(f*(25-i))],
    ]) {
      const p = shuffle(BASE_H512, 0, 1, startI, endI, jfn);
      test(`start=${startI},end=${endI}|${jname}`, p);
    }
  }
}

// ─── 3. mineCount in message ─────────────────────────────────────────────────
console.log("\n=== mineCount variants ===");
const msgs_with_mines = [
  `${NONCE}:${CLIENT}:${MINES}`,
  `${CLIENT}:${NONCE}:${MINES}`,
  `${CLIENT}:${MINES}:${NONCE}`,
  `${MINES}:${CLIENT}:${NONCE}`,
  `${NONCE}:${MINES}:${CLIENT}`,
  `${CLIENT}:${NONCE}:${MINES}:0`,
  `${NONCE}:${CLIENT}:${MINES}:0`,
];
for (const msg of msgs_with_mines) {
  for (const algo of ["sha256","sha512"]) {
    const buf = crypto.createHmac(algo, SERVER).update(msg).digest();
    const p = shuffle(buf, 0, 1, 24, 1, (f,i)=>Math.floor(f*(i+1)));
    test(`${algo}|"${msg}"`, p);
  }
}

// ─── 4. SHA512 key as hex bytes ──────────────────────────────────────────────
console.log("\n=== Key as raw bytes ===");
for (const msg of [BASE_MSG, `${CLIENT}:${NONCE}:0`, `${CLIENT}:${NONCE}`, `${NONCE}:${CLIENT}:0`]) {
  for (const algo of ["sha256","sha512"]) {
    const buf = crypto.createHmac(algo, SBUF).update(msg).digest();
    const p = shuffle(buf, 0, 1, 24, 1, (f,i)=>Math.floor(f*(i+1)));
    test(`hexkey|${algo}|"${msg}"`, p);
  }
}

// ─── 5. Alternate stride (every 2nd or 4th byte) ───────────────────────────
console.log("\n=== Byte stride variants ===");
for (const stride of [1,2,4]) {
  for (const off of [0,1,2,3]) {
    const p = shuffle(BASE_H512, off, stride, 24, 1, (f,i)=>Math.floor(f*(i+1)));
    test(`stride=${stride},off=${off}`, p);
  }
}

// ─── 6. Try byte XOR with index ─────────────────────────────────────────────
console.log("\n=== Byte XOR index ===");
{
  const buf = Buffer.from(BASE_H512);
  // XOR each byte with its position
  for (let i=0; i<buf.length; i++) buf[i] ^= i;
  const p = shuffle(buf, 0, 1, 24, 1, (f,i)=>Math.floor(f*(i+1)));
  test("xor_pos|sha512|n:cs", p);
}

// ─── 7. Use cursor=0 explicitly in standard format but with SHA512 ──────────
console.log("\n=== SHA512 with explicit cursor=0 ===");
for (const [jname, jfn] of [
  ["j=f*(i+1)", (f,i)=>Math.floor(f*(i+1))],
  ["j=f*i",     (f,i)=>Math.floor(f*i)],
]) {
  for (const msg of [`${CLIENT}:${NONCE}:0`, `${NONCE}:${CLIENT}:0`]) {
    const buf = crypto.createHmac("sha512", SERVER).update(msg).digest();
    const p = shuffle(buf, 0, 1, 24, 1, jfn);
    test(`sha512|c0|"${msg}"|${jname}`, p);
  }
}

// ─── 8. SHA256 with nonce variations (what if displayed nonce is 0-indexed?) ─
console.log("\n=== Nonce encoding variants ===");
for (const n of [36,37,38]) {
  for (const algo of ["sha256","sha512"]) {
    for (const [mname, msg] of [
      ["cs:n:c", `${CLIENT}:${n}:0`],
      ["n:cs:c", `${n}:${CLIENT}:0`],
      ["cs:n",   `${CLIENT}:${n}`],
      ["n:cs",   `${n}:${CLIENT}`],
    ]) {
      const buf = crypto.createHmac(algo, SERVER).update(msg).digest();
      // u32be extraction
      let pos=0, cur=0, bufext=buf;
      function nextF32() {
        while(pos+4>bufext.length){cur++;bufext=crypto.createHmac(algo,SERVER).update(`${CLIENT}:${n}:${cur}`).digest();pos=0;}
        const v=(((bufext[pos]<<24)|(bufext[pos+1]<<16)|(bufext[pos+2]<<8)|bufext[pos+3])>>>0)/0x100000000;pos+=4;return v;
      }
      const p2 = Array.from({length:25},(_,i)=>i);
      for(let i=24;i>0;i--){const j=Math.floor(nextF32()*(i+1));[p2[i],p2[j]]=[p2[j],p2[i]];}
      test(`n=${n}|${algo}|${mname}|u32be`, p2);
      // u8 extraction from same buf
      const p3 = shuffle(buf, 0, 1, 24, 1, (f,i)=>Math.floor(f*(i+1)));
      test(`n=${n}|${algo}|${mname}|u8`, p3);
    }
  }
}

console.log("\n══════════════════════════════════");
console.log(`Best: ${best}/15 — ${bestLabel}`);
if(winners.length) { console.log("\n🎯 PERFECT MATCHES:"); winners.forEach(w=>console.log(" ",w.label,"→ mines:",w.mines.join(","))); }

/**
 * BC.Game exact algorithm from their public verifier:
 * 1. hmac = HMAC-SHA256(key=serverSeed, msg="${clientSeed}:${nonce}") → hex string
 * 2. createNums twice with SHA256 re-hash between passes
 * createNums: h=SHA256(input_hex_string); for each of 25 nums assign h, rotate left 1 char; sort lexicographically
 *
 * Also test variants: Stake.com, and "Rainbet-specific" variants.
 */
const crypto = require("crypto");

const SERVER = "8bdde84089ca17399dab7e0891ec9a9dc92b4bfbb7b54a4689cb24ed969e8c2f";
const CLIENT = "tarKkvBXpuWbhw14";
const NONCE  = 37;
const MINES  = 15;
// User-reported mine positions (0-indexed): [3,5,7,8,11,13,14,16,17,19,20,21,22,23,24]
const ACTUAL_0 = new Set([3,5,7,8,11,13,14,16,17,19,20,21,22,23,24]);
// Possibly 1-indexed reported (subtract 1):
const ACTUAL_1 = new Set([2,4,6,7,10,12,13,15,16,18,19,20,21,22,23]);

function scoreSet(arr, actualSet) { let n=0; for(const m of arr) if(actualSet.has(m)) n++; return n; }

function sha256hex(hexStr) {
  return crypto.createHash("sha256").update(hexStr, "utf8").digest("hex");
}
function hmacSha256hex(key, msg) {
  return crypto.createHmac("sha256", key).update(msg).digest("hex");
}

// BC.game createNums: takes array of {num} objects OR raw numbers, and hash hex string
function createNums(allNums, hashHex) {
  let h = sha256hex(hashHex);  // SHA256 of the hex string (as UTF8)
  const nums = allNums.map(c => {
    const entry = { num: c, hash: h };
    h = h.substring(1) + h.charAt(0);  // rotate left by 1
    return entry;
  });
  nums.sort((a, b) => a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0);
  return nums;
}

// BC.game getResult
function bcgameResult(serverSeed, clientSeed, nonce) {
  const hmacHex = hmacSha256hex(serverSeed, `${clientSeed}:${nonce}`);
  // Initial permutation (from BC.game source)
  const allNums = [7,2,19,25,1,13,5,24,14,6,15,9,22,16,3,17,18,20,8,21,4,12,10,23,11];
  let seed = hmacHex;
  let finalNums = createNums(allNums, seed);
  seed = sha256hex(seed);
  finalNums = createNums(finalNums, seed);
  return finalNums.map(m => m.num.num);
}

// Test BC.game algorithm
const bcResult = bcgameResult(SERVER, CLIENT, NONCE);
console.log("=== BC.Game Algorithm ===");
console.log("Full sequence:", bcResult.join(","));
const bcMines0 = bcResult.slice(0, MINES).map(x => x-1).sort((a,b)=>a-b);
const bcMines1 = bcResult.slice(0, MINES).sort((a,b)=>a-b);
console.log("First", MINES, "positions (1-indexed):", bcMines1.join(","));
console.log("First", MINES, "positions (0-indexed, -1):", bcMines0.join(","));
console.log("Score vs ACTUAL_0 (1-indexed):", scoreSet(bcMines1, ACTUAL_0));
console.log("Score vs ACTUAL_0 (0-indexed):", scoreSet(bcMines0, ACTUAL_0));
console.log("Score vs ACTUAL_1 (1-indexed):", scoreSet(bcMines1, ACTUAL_1));
console.log("Score vs ACTUAL_1 (0-indexed):", scoreSet(bcMines0, ACTUAL_1));

// Also try last N as mines
const bcMinesLast0 = bcResult.slice(25-MINES).map(x=>x-1).sort((a,b)=>a-b);
console.log("Last", MINES, "(0-indexed, -1):", bcMinesLast0.join(","), "→ score:", scoreSet(bcMinesLast0, ACTUAL_0));

// Try with different initial permutations (identity = [1..25] or [0..24])
function bcgameVariant(serverSeed, clientSeed, nonce, allNums) {
  const hmacHex = hmacSha256hex(serverSeed, `${clientSeed}:${nonce}`);
  let seed = hmacHex;
  let finalNums = createNums(allNums, seed);
  seed = sha256hex(seed);
  finalNums = createNums(finalNums, seed);
  return finalNums.map(m => m.num.num);
}

console.log("\n=== BC.Game variants with different initial arrays ===");
// Sequential [1..25]
const seq125 = bcgameVariant(SERVER, CLIENT, NONCE, Array.from({length:25},(_,i)=>i+1));
const sc125_0 = scoreSet(seq125.slice(0,MINES).map(x=>x-1), ACTUAL_0);
const sc125_1 = scoreSet(seq125.slice(0,MINES), ACTUAL_0);
console.log("[1..25] first 15 (0-indexed):", seq125.slice(0,MINES).map(x=>x-1).sort((a,b)=>a-b).join(","), "→", sc125_0);
console.log("[1..25] first 15 (1-indexed):", seq125.slice(0,MINES).sort((a,b)=>a-b).join(","), "→", sc125_1);

// Sequential [0..24]
const seq024 = bcgameVariant(SERVER, CLIENT, NONCE, Array.from({length:25},(_,i)=>i));
const sc024_0 = scoreSet(seq024.slice(0,MINES), ACTUAL_0);
console.log("[0..24] first 15:", seq024.slice(0,MINES).sort((a,b)=>a-b).join(","), "→", sc024_0);

// Just one pass createNums (not two)
function bcgameSinglePass(serverSeed, clientSeed, nonce, allNums) {
  const hmacHex = hmacSha256hex(serverSeed, `${clientSeed}:${nonce}`);
  const finalNums = createNums(allNums, hmacHex);
  return finalNums.map(m => m.num.num);
}
const single_bc = bcgameSinglePass(SERVER, CLIENT, NONCE, [7,2,19,25,1,13,5,24,14,6,15,9,22,16,3,17,18,20,8,21,4,12,10,23,11]);
const sc_single = scoreSet(single_bc.slice(0,MINES).map(x=>x-1), ACTUAL_0);
console.log("Single pass, BC init, 0-indexed:", single_bc.slice(0,MINES).map(x=>x-1).sort((a,b)=>a-b).join(","), "→", sc_single);

const single_seq = bcgameSinglePass(SERVER, CLIENT, NONCE, Array.from({length:25},(_,i)=>i));
const sc_single2 = scoreSet(single_seq.slice(0,MINES), ACTUAL_0);
console.log("Single pass, [0..24]:", single_seq.slice(0,MINES).sort((a,b)=>a-b).join(","), "→", sc_single2);

// Try nonce-variations
console.log("\n=== BC.Game nonce offsets ===");
for(const noff of [-2,-1,0,1,2]) {
  const r = bcgameResult(SERVER, CLIENT, NONCE+noff);
  const sc0 = scoreSet(r.slice(0,MINES).map(x=>x-1), ACTUAL_0);
  const sc1 = scoreSet(r.slice(0,MINES), ACTUAL_0);
  if(sc0>=12||sc1>=12) console.log(`n=${NONCE+noff}: 0-idx=${sc0}/15 [${r.slice(0,MINES).map(x=>x-1).sort((a,b)=>a-b).join(",")}] | 1-idx=${sc1}/15 [${r.slice(0,MINES).sort((a,b)=>a-b).join(",")}]`);
}

// Also try Stake.com algorithm (standard HMAC-SHA256 Fisher-Yates but with their exact message)
console.log("\n=== Stake.com style (from lucasholder/fair) ===");
// Stake uses: hmac = HMAC-SHA256(serverSeed, "clientSeed:nonce"), then float stream from this
function stakeStream(serverSeed, clientSeed, nonce) {
  let cursor=0, buf=null, pos=0;
  return function() {
    while(true) {
      if(buf && pos+4 <= buf.length) {
        const v = (((buf[pos]<<24)|(buf[pos+1]<<16)|(buf[pos+2]<<8)|buf[pos+3])>>>0)/0x100000000;
        pos+=4; return v;
      }
      buf = crypto.createHmac("sha256", serverSeed).update(`${clientSeed}:${nonce}:${cursor}`).digest();
      pos=0; cursor++;
    }
  };
}

for(const noff of [-1,0,1]) {
  const sf = stakeStream(SERVER, CLIENT, NONCE+noff);
  const p = Array.from({length:25},(_,i)=>i);
  for(let i=24;i>0;i--) { const j=Math.floor(sf()*(i+1)); [p[i],p[j]]=[p[j],p[i]]; }
  const mines=p.slice(0,MINES);
  const sc=scoreSet(mines, ACTUAL_0);
  if(sc>=10) console.log(`Stake n=${NONCE+noff}: ${sc}/15 → [${mines.sort((a,b)=>a-b).join(",")}]`);
}

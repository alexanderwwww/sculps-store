/**
 * Test partial Fisher-Yates (pick-and-remove, only N=mineCount steps).
 * Search result described: "Each float × remaining tiles → floor → remove from pool"
 * This is DIFFERENT from full FY + first N.
 *
 * Also test all format variants against this approach.
 */
const crypto = require("crypto");

const SERVER = "8bdde84089ca17399dab7e0891ec9a9dc92b4bfbb7b54a4689cb24ed969e8c2f";
const CLIENT = "tarKkvBXpuWbhw14";
const NONCE  = 37;
const MINES  = 15;
const ACTUAL = new Set([3,5,7,8,11,13,14,16,17,19,20,21,22,23,24]);

function score(arr) { let n=0; for (const m of arr) if (ACTUAL.has(m)) n++; return n; }

// Partial FY: select N positions from pool by pick-and-remove
function partialFY(floatFn, n) {
  const pool = Array.from({length:25}, (_, i) => i);
  const mines = [];
  for (let k = 0; k < n; k++) {
    const remaining = 25 - k;
    const j = Math.floor(floatFn() * remaining);
    mines.push(pool[j]);
    // remove pool[j] by replacing with last active element
    pool[j] = pool[remaining - 1];
  }
  return mines;
}

// Full FY (our existing baseline) descending
function fullFY_desc(floatFn) {
  const p = Array.from({length:25}, (_, i) => i);
  for (let i = 24; i > 0; i--) {
    const j = Math.floor(floatFn() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  return p.slice(0, MINES);
}

// ── Float stream generators ────────────────────────────────────────────────
function makeStream(algo, key, msgFn, chunkSize, extractFn) {
  let cursor = 0, buf = null, pos = 0;
  return function() {
    while (true) {
      if (buf && pos + chunkSize <= buf.length) {
        const v = extractFn(buf, pos);
        pos += chunkSize;
        return v;
      }
      buf = crypto.createHmac(algo, key).update(msgFn(cursor)).digest();
      pos = 0;
      cursor++;
    }
  };
}

const u32be = (b, i) => (((b[i]<<24)|(b[i+1]<<16)|(b[i+2]<<8)|b[i+3])>>>0) / 0x100000000;
const u32le = (b, i) => (((b[i+3]<<24)|(b[i+2]<<16)|(b[i+1]<<8)|b[i])>>>0) / 0x100000000;
const u8    = (b, i) => b[i] / 256;

const msgs = {
  "cs:n:c" : c => `${CLIENT}:${NONCE}:${c}`,
  "n:cs:c" : c => `${NONCE}:${CLIENT}:${c}`,
  "cs:n"   : c => `${CLIENT}:${NONCE}`,
  "n:cs"   : c => `${NONCE}:${CLIENT}`,
  "cs-n-c" : c => `${CLIENT}-${NONCE}-${c}`,
};

let best = 0, bestLabel = "", winners = [];

console.log("=== Partial FY (pick-and-remove, N=15 steps) ===\n");

for (const algo of ["sha256", "sha512"]) {
  for (const [mname, msgFn] of Object.entries(msgs)) {
    for (const [ename, [cs, extFn]] of [
      ["u32be", [4, u32be]],
      ["u32le", [4, u32le]],
      ["u8",    [1, u8]],
    ]) {
      // Also try nonces ±2
      for (const nonce_off of [-1, 0, 1]) {
        const mfn = c => msgFn(c).replace(`:${NONCE}:`, `:${NONCE+nonce_off}:`).replace(`-${NONCE}-`, `-${NONCE+nonce_off}-`).replace(`:${NONCE}`, `:${NONCE+nonce_off}`).replace(
          new RegExp(`^${NONCE}:`), `${NONCE+nonce_off}:`
        );
        const stream = makeStream(algo, SERVER, c => msgs[mname](c).replace(NONCE.toString(), (NONCE+nonce_off).toString()), cs, extFn);
        const mines_partial = partialFY(stream, MINES);
        const sc_partial = score(mines_partial);

        const label = `${algo}|${ename}|${mname}|partialFY|n=${NONCE+nonce_off}`;
        if (sc_partial > best) { best = sc_partial; bestLabel = label; }
        if (sc_partial === 15) winners.push({ label, mines: [...mines_partial].sort((a,b)=>a-b) });
        if (sc_partial >= 13) {
          console.log(`  ${sc_partial}/15  ${label}  → [${[...mines_partial].sort((a,b)=>a-b).join(",")}]`);
        }

        // Also test full FY desc (to compare with same stream)
        const stream2 = makeStream(algo, SERVER, c => msgs[mname](c).replace(NONCE.toString(), (NONCE+nonce_off).toString()), cs, extFn);
        const mines_full = fullFY_desc(stream2);
        const sc_full = score(mines_full);
        const label2 = `${algo}|${ename}|${mname}|fullFY-desc|n=${NONCE+nonce_off}`;
        if (sc_full > best) { best = sc_full; bestLabel = label2; }
        if (sc_full === 15) winners.push({ label: label2, mines: [...mines_full].sort((a,b)=>a-b) });
        if (sc_full >= 13) {
          console.log(`  ${sc_full}/15  ${label2}  → [${[...mines_full].sort((a,b)=>a-b).join(",")}]`);
        }
      }
    }
  }
}

// Also try: partial FY but reading pool from the END (mines = pool[25-N..24])
console.log("\n=== Partial FY (pick-and-remove from END, N=15 steps) ===\n");
function partialFY_end(floatFn, n) {
  const pool = Array.from({length:25}, (_, i) => i);
  const mines = [];
  for (let k = 0; k < n; k++) {
    const remaining = 25 - k;
    // Pick from END of pool
    const j = remaining - 1 - Math.floor(floatFn() * remaining);
    mines.push(pool[j]);
    pool[j] = pool[remaining - 1];
  }
  return mines;
}

for (const algo of ["sha256", "sha512"]) {
  for (const [mname, msgFn] of Object.entries(msgs)) {
    for (const [ename, [cs, extFn]] of [
      ["u32be", [4, u32be]], ["u8", [1, u8]],
    ]) {
      const stream = makeStream(algo, SERVER, msgFn, cs, extFn);
      const mines = partialFY_end(stream, MINES);
      const sc = score(mines);
      const label = `${algo}|${ename}|${mname}|partialFY-end`;
      if (sc > best) { best = sc; bestLabel = label; }
      if (sc === 15) winners.push({ label, mines: [...mines].sort((a,b)=>a-b) });
      if (sc >= 13) console.log(`  ${sc}/15  ${label}  → [${[...mines].sort((a,b)=>a-b).join(",")}]`);
    }
  }
}

console.log("\n══════════════════════════════════");
console.log(`Best: ${best}/15 — ${bestLabel}`);
if (winners.length) {
  console.log("\n🎯 PERFECT MATCHES:");
  winners.forEach(w => console.log("  ", w.label, "→ mines:", w.mines.join(",")));
}

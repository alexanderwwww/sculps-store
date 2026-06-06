/**
 * GAME F — Search
 * Client:    CDgikyKw9wnEIhzQ
 * Committed: 5ab1c4d4b02ea1ff45ff0588d5e4eeb27d1e08c5fa379ca0c67c1f3fb43fc5a3
 * Nonce:     244 or 243
 *
 * SEED TEMPLATE (position-locked):
 *   712ab1325??????27752c822????????????????????????????????????0749
 *   pos 1-9         pos 16-24                                   pos 61-64
 *
 * CRITERIA:
 *   digitSum = 216 (known positions sum to 76, gaps must sum to 140)
 *   contains: 7154, 844, 2392
 */
const crypto = require("crypto");

const TARGET = "5ab1c4d4b02ea1ff45ff0588d5e4eeb27d1e08c5fa379ca0c67c1f3fb43fc5a3";
const MAX    = parseInt(process.env.MAX || "10000000");

const HEX = "0123456789abcdef";
const randHex = n => Array.from(crypto.randomBytes(n)).map(b => HEX[b&15]).join("");

// Build candidate using locked template + random gaps
function makeCandidateTemplate() {
  const seg_start = "712ab1325";   // pos 0-8
  const gap1      = randHex(6);    // pos 9-14
  const seg_mid   = "27752c822";   // pos 15-23
  const gap2      = randHex(36);   // pos 24-59
  const seg_end   = "0749";        // pos 60-63
  return seg_start + gap1 + seg_mid + gap2 + seg_end;
}

// Score a candidate
function score(cand) {
  const ds   = cand.split("").filter(c=>c>="0"&&c<="9").join("");
  const dsum = ds.split("").reduce((a,b)=>a+parseInt(b),0);
  const hits = [];

  if (dsum === 216)            hits.push("dsum=216");
  if (ds.includes("7154"))     hits.push("7154");
  if (ds.includes("844"))      hits.push("844");
  if (ds.includes("2392"))     hits.push("2392");
  // bonus cross-game
  if (ds.includes("917"))      hits.push("917");
  if (ds.includes("325"))      hits.push("325");
  if (ds.includes("852"))      hits.push("852");

  const proof = crypto.createHash("sha256").update(cand).digest("hex") === TARGET;
  return { hits, score: hits.length + (proof ? 10000 : 0), proof, dsum };
}

console.log("═══ GAME F SEARCH — template-constrained ═══");
console.log("Template: 712ab1325??????27752c822????????????????????????????????????0749");
console.log("Target:  ", TARGET);
console.log("Max tries:", MAX.toLocaleString(), "\n");

const top = [];
let shaHit = false;
const t0 = Date.now();

for (let i = 0; i < MAX; i++) {
  const cand = makeCandidateTemplate();
  const r    = score(cand);

  if (r.proof) {
    shaHit = true;
    console.log(`\n🏆 SHA256 MATCH at try ${i+1}!`);
    console.log("Seed:", cand);
    break;
  }

  if (r.score >= 3 || top.length < 10) {
    top.push({ cand, ...r });
    top.sort((a,b) => b.score - a.score);
    if (top.length > 10) top.pop();
  }

  if ((i+1) % 1_000_000 === 0) {
    const s = ((Date.now()-t0)/1000).toFixed(1);
    process.stdout.write(`  ${((i+1)/1e6).toFixed(0)}M tried... (${s}s)\r`);
  }
}

const elapsed = ((Date.now()-t0)/1000).toFixed(1);
console.log(`\nDone. Tried: ${MAX.toLocaleString()} | SHA: ${shaHit?"YES 🏆":"NO"} | Time: ${elapsed}s\n`);

console.log("═══ TOP CANDIDATES ═══\n");
top.slice(0,10).forEach((t,i)=>{
  console.log(`#${i+1} score ${t.score} | dsum=${t.dsum} | hits: ${t.hits.join(" ")}`);
  console.log(`     ${t.cand}`);
  console.log("");
});

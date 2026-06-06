/**
 * GAME E — Combined criteria search
 * Target hash:  e4715366cce151e0164ea4e365e075c4b6f149caff11206ce44b7a5bdacf5d33
 * Real seed:    c25daa9a5f86180210df4f7b72ba027811d0e74672ec2d8d96bc4cc56a09c821
 *
 * Criteria sourced from Game E real seed + cross-game patterns:
 *   HARD   : SHA256(candidate) === target hash  (proof — shown if hit)
 *   TIER1  : digitSum = 172
 *   TIER2  : digitCount ∈ [38..42]  |  letterCount ∈ [22..26]
 *   TIER3  : sequences in digit-string: 22, 77, 56, 22+77, 22+56, 77+56, 844
 *            sequences cross-game: 917, 325, 852, 216, 2162, 2595, 4672, 6459
 *            substrings in full seed: b52, 271e, 5277c, 2708, c25d
 */
const crypto = require("crypto");

const TARGET_HASH = "e4715366cce151e0164ea4e365e075c4b6f149caff11206ce44b7a5bdacf5d33";
const REAL_SEED   = "c25daa9a5f86180210df4f7b72ba027811d0e74672ec2d8d96bc4cc56a09c821";
const MAX         = parseInt(process.env.MAX || "10000000");

// Verify real seed
const realHash = crypto.createHash("sha256").update(REAL_SEED).digest("hex");
console.log("Real seed SHA256 matches target:", realHash === TARGET_HASH ? "✅" : "❌");

// Formula Seven — Game E real seed breakdown
const rDigits = REAL_SEED.split("").filter(c => c >= "0" && c <= "9");
const rDigitSeq = rDigits.join("");
const rDC = rDigits.length;
const rLC = 64 - rDC;
const rDS = rDigits.reduce((a, b) => a + parseInt(b), 0);
console.log("\n═══ GAME E — Formula Seven ═══");
console.log("Real seed:     ", REAL_SEED);
console.log("Digit seq:     ", rDigitSeq);
console.log("digitCount:    ", rDC);
console.log("letterCount:   ", rLC);
console.log("digitSum:      ", rDS);
console.log("Contains 22:   ", rDigitSeq.includes("22") ? "✅" : "❌");
console.log("Contains 77:   ", rDigitSeq.includes("77") ? "✅" : "❌");
console.log("Contains 56:   ", rDigitSeq.includes("56") ? "✅" : "❌");
console.log("Contains 844:  ", rDigitSeq.includes("844") ? "✅" : "❌");
console.log("Contains 917:  ", rDigitSeq.includes("917") ? "✅" : "❌");
console.log("Contains 852:  ", rDigitSeq.includes("852") ? "✅" : "❌");
console.log("Contains 2595: ", rDigitSeq.includes("2595") ? "✅" : "❌");
console.log("Contains 4672: ", rDigitSeq.includes("4672") ? "✅" : "❌");
console.log("Contains 6459: ", rDigitSeq.includes("6459") ? "✅" : "❌");

// ── Score a candidate ────────────────────────────────────────────────
function scoreE(candidate) {
  const ds = candidate.split("").filter(c => c >= "0" && c <= "9").join("");
  const dc = ds.length;
  const lc = 64 - dc;
  const dsum = ds.split("").reduce((a, b) => a + parseInt(b), 0);
  const hits = [];

  // TIER 1 — exact digitSum
  if (dsum === 172)              hits.push("dsum=172");

  // TIER 2 — numeric ranges
  if (dc >= 38 && dc <= 42)     hits.push("dc~40");
  if (lc >= 22 && lc <= 26)     hits.push("lc~24");

  // TIER 3 — digit sequences from Game E
  if (ds.includes("22"))        hits.push("22");
  if (ds.includes("77"))        hits.push("77");
  if (ds.includes("56"))        hits.push("56");
  if (ds.includes("844"))       hits.push("844");
  if (ds.includes("2595"))      hits.push("2595");
  if (ds.includes("4672"))      hits.push("4672");
  if (ds.includes("6459"))      hits.push("6459");

  // TIER 3 — cross-game sequences
  if (ds.includes("917"))       hits.push("917");
  if (ds.includes("325"))       hits.push("325");
  if (ds.includes("852"))       hits.push("852");
  if (ds.includes("216"))       hits.push("216");
  if (ds.includes("2162"))      hits.push("2162");

  // TIER 3 — substring in full seed
  if (candidate.includes("b52"))    hits.push("b52");
  if (candidate.includes("271e"))   hits.push("271e");
  if (candidate.includes("5277c"))  hits.push("5277c");
  if (candidate.includes("2708"))   hits.push("2708");
  if (candidate.includes("c25d"))   hits.push("c25d");

  const proof = crypto.createHash("sha256").update(candidate).digest("hex") === TARGET_HASH;
  return { hits, score: hits.length + (proof ? 10000 : 0), proof, dc, dsum, lc };
}

// ── Generate random 64-char hex seed ─────────────────────────────────
function randHex64() {
  return crypto.randomBytes(32).toString("hex");
}

// ── Main search ──────────────────────────────────────────────────────
console.log(`\n═══ SEARCHING ${MAX.toLocaleString()} random seeds for Game E ═══`);
console.log(`Target: ${TARGET_HASH}\n`);

const top = [];     // keep top 10 by score
let shaHit = false;
let tried = 0;

function insertTop(candidate, result) {
  top.push({ candidate, ...result });
  top.sort((a, b) => b.score - a.score);
  if (top.length > 10) top.pop();
}

const t0 = Date.now();

while (tried < MAX) {
  tried++;
  const cand = randHex64();
  const r = scoreE(cand);

  if (r.proof) {
    shaHit = true;
    console.log(`\n🏆 SHA256 MATCH after ${tried.toLocaleString()} tries!`);
    console.log("Seed:", cand);
    console.log("Hits:", r.hits.join(", "));
    break;
  }

  if (r.score >= 5) insertTop(cand, r);
  else if (top.length < 10) insertTop(cand, r);

  if (tried % 1_000_000 === 0) {
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    process.stdout.write(`  ${(tried / 1_000_000).toFixed(0)}M tried... (${elapsed}s)\r`);
  }
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\nDone. Tried: ${tried.toLocaleString()} | SHA match: ${shaHit ? "YES 🏆" : "NO"} | Time: ${elapsed}s`);

console.log("\n═══ TOP CANDIDATES (gems-criteria + cross-game criteria) ═══\n");
top.slice(0, 10).forEach((t, i) => {
  console.log(`#${i+1} score ${t.score} | dc=${t.dc} ds=${t.dsum} lc=${t.lc}`);
  console.log(`     hits: ${t.hits.join(" ")}`);
  console.log(`     seed: ${t.candidate}`);
  console.log("");
});

if (!shaHit) {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("No SHA match — as expected (2^256 search space).");
  console.log("Top scorers above show how many criteria overlap by chance.");
  console.log("Real Game E seed for reference:");
  console.log(" ", REAL_SEED);
  console.log(`  score on real: ${JSON.stringify(scoreE(REAL_SEED))}`);
}

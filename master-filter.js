/**
 * MASTER FILTER
 * Three criteria only — extracted via Formula Seven from a known game.
 * Criteria change per game. Filter tests any candidate seed.
 *
 * Criteria:
 *   digitSum      — sum of all numeric digits in the seed
 *   digitSequence — digits in order (letters stripped out)
 *   digitCount    — total count of numeric digits
 */
const crypto = require("crypto");

// ── Extract the 3 criteria from any seed string ──────────────────
function extract(seed) {
  const digits = seed.split("").filter(c => c >= "0" && c <= "9");
  return {
    digitSum:      digits.reduce((a, b) => a + parseInt(b), 0),
    digitSequence: digits.join(""),
    digitCount:    digits.length,
  };
}

// ── Test a candidate seed against criteria ────────────────────────
function matchesCriteria(candidate, criteria) {
  const e = extract(candidate);

  if (criteria.digitSum !== undefined && e.digitSum !== criteria.digitSum)
    return false;

  if (criteria.digitCount !== undefined && e.digitCount !== criteria.digitCount)
    return false;

  // Sequence: candidate's digit sequence must CONTAIN the given sequence
  if (criteria.digitSequence !== undefined && !e.digitSequence.includes(criteria.digitSequence))
    return false;

  return true;
}

// ── Brute force search over a seed space ─────────────────────────
function search(criteria, generateNext, maxTries = 10_000_000) {
  console.log("\nMASTER FILTER — Searching...");
  console.log("Criteria:", JSON.stringify(criteria, null, 2));
  console.log("Max tries:", maxTries.toLocaleString());
  console.log("");

  const matches = [];
  let tried = 0;
  let candidate;

  while (tried < maxTries && (candidate = generateNext(tried)) !== null) {
    tried++;
    if (matchesCriteria(candidate, criteria)) {
      matches.push(candidate);
      console.log(`✅ Match #${matches.length} found after ${tried.toLocaleString()} tries:`);
      console.log("   Seed:", candidate);
      const e = extract(candidate);
      console.log("   digitSum:", e.digitSum, "| digitCount:", e.digitCount);
      console.log("   digitSequence:", e.digitSequence);

      // Verify SHA256 if committed hash is provided
      if (criteria.committedHash) {
        const h = crypto.createHash("sha256").update(candidate).digest("hex");
        console.log("   SHA256 match:", h === criteria.committedHash ? "✅ CONFIRMED" : "❌ no");
      }
      console.log("");
    }
    if (tried % 1_000_000 === 0)
      process.stdout.write(`  ${(tried/1_000_000).toFixed(0)}M tried...\r`);
  }

  console.log(`\nDone. Tried: ${tried.toLocaleString()} | Matches: ${matches.length}`);
  return matches;
}

// ── Formula Seven — extract criteria from a real known seed ───────
function formulaSeven(realSeed) {
  const e = extract(realSeed);
  console.log("\n═══════════════════════════════════════");
  console.log("FORMULA SEVEN — Criteria Extraction");
  console.log("═══════════════════════════════════════");
  console.log("Seed:          ", realSeed);
  console.log("digitSum:      ", e.digitSum);
  console.log("digitCount:    ", e.digitCount);
  console.log("digitSequence: ", e.digitSequence);
  console.log("═══════════════════════════════════════");
  return e;
}

// ── Demo: extract criteria from our known games ───────────────────
console.log("Known game seeds — criteria extracted:\n");

const gameA = formulaSeven("8bdde84089ca17399dab7e0891ec9a9dc92b4bfbb7b54a4689cb24ed969e8c2f");
const gameB = formulaSeven("190574716e0c77ef705e879f789737bc00d20716083582cf1bcba9b9bd6e8844");

// ── Self-verification: does each seed pass its own filter? ────────
console.log("\n── Self-verification (seed must pass its own criteria) ──");
console.log("Game A passes own filter:", matchesCriteria(
  "8bdde84089ca17399dab7e0891ec9a9dc92b4bfbb7b54a4689cb24ed969e8c2f", gameA
) ? "✅" : "❌");
console.log("Game B passes own filter:", matchesCriteria(
  "190574716e0c77ef705e879f789737bc00d20716083582cf1bcba9b9bd6e8844", gameB
) ? "✅" : "❌");

// ── Export for use in search scripts ─────────────────────────────
module.exports = { extract, matchesCriteria, search, formulaSeven };

/**
 * FORMULA SEVEN
 * Pattern analysis on real seed + committed hash pairs.
 * Run on every new game to build pattern recognition.
 */
const crypto = require("crypto");

function formulaSeven(label, realSeed, clientSeed, nonce) {
  const hash = crypto.createHash("sha256").update(realSeed).digest("hex");

  function analyze(name, str) {
    const chars   = str.split("");
    const digits  = chars.filter(c => c >= "0" && c <= "9");
    const letters = chars.filter(c => c < "0"  || c > "9");
    const sum     = digits.reduce((a, b) => a + parseInt(b), 0);
    const avg     = (sum / digits.length).toFixed(2);

    // Digit frequency (0-9)
    const freq = {};
    for (let i = 0; i <= 9; i++) freq[i] = 0;
    digits.forEach(d => freq[parseInt(d)]++);

    // Letter frequency (a-f)
    const lfreq = {};
    ["a","b","c","d","e","f"].forEach(l => lfreq[l] = 0);
    letters.forEach(l => lfreq[l]++);

    // Position of first digit, last digit
    const firstDigitPos = chars.findIndex(c => c >= "0" && c <= "9");
    const lastDigitPos  = chars.length - 1 - [...chars].reverse().findIndex(c => c >= "0" && c <= "9");

    // Consecutive digit runs
    let maxRun = 0, curRun = 0;
    chars.forEach(c => {
      if (c >= "0" && c <= "9") { curRun++; maxRun = Math.max(maxRun, curRun); }
      else curRun = 0;
    });

    return {
      name, str,
      length: str.length,
      digitCount: digits.length,
      letterCount: letters.length,
      digitRatio: (digits.length / str.length * 100).toFixed(1) + "%",
      sum, avg,
      min: Math.min(...digits.map(Number)),
      max: Math.max(...digits.map(Number)),
      digitFreq: freq,
      letterFreq: lfreq,
      firstDigitPos,
      lastDigitPos,
      maxConsecutiveDigits: maxRun,
      digits: digits.join(""),
      letters: letters.join(""),
    };
  }

  const S = analyze("REAL SEED   ", realSeed);
  const H = analyze("HASH (promise)", hash);

  function print(r) {
    console.log(`\n  ── ${r.name} ──`);
    console.log(`  Value:       ${r.str}`);
    console.log(`  Length:      ${r.length} chars`);
    console.log(`  Digits:      ${r.digitCount} (${r.digitRatio}) → "${r.digits}"`);
    console.log(`  Letters:     ${r.letterCount}            → "${r.letters}"`);
    console.log(`  Digit sum:   ${r.sum}  |  avg: ${r.avg}  |  min: ${r.min}  max: ${r.max}`);
    console.log(`  Max consec:  ${r.maxConsecutiveDigits} consecutive digits`);
    console.log(`  Digit freq:  ${Object.entries(r.digitFreq).map(([k,v])=>`${k}×${v}`).join("  ")}`);
    console.log(`  Letter freq: ${Object.entries(r.letterFreq).map(([k,v])=>`${k}×${v}`).join("  ")}`);
  }

  console.log("\n" + "═".repeat(65));
  console.log(`  FORMULA SEVEN — ${label}`);
  console.log(`  clientSeed: ${clientSeed}  |  nonce: ${nonce}`);
  console.log("═".repeat(65));
  print(S);
  print(H);

  // Comparison
  console.log(`\n  ── COMPARISON ──`);
  console.log(`  Digit count diff:  ${H.digitCount - S.digitCount > 0 ? "+" : ""}${H.digitCount - S.digitCount} (hash has ${H.digitCount > S.digitCount ? "more" : "fewer"} digits)`);
  console.log(`  Letter count diff: ${H.letterCount - S.letterCount > 0 ? "+" : ""}${H.letterCount - S.letterCount}`);
  console.log(`  Sum diff:          ${H.sum - S.sum > 0 ? "+" : ""}${H.sum - S.sum}`);
  console.log(`  Combined digits:   seed="${S.digits}" hash="${H.digits}"`);
  console.log(`  Combined letters:  seed="${S.letters}" hash="${H.letters}"`);

  // Unique chars in seed not in hash and vice versa
  const seedSet = new Set(realSeed.split(""));
  const hashSet = new Set(hash.split(""));
  const onlyInSeed = [...seedSet].filter(c => !hashSet.has(c)).sort().join("");
  const onlyInHash = [...hashSet].filter(c => !seedSet.has(c)).sort().join("");
  console.log(`  Chars only in seed: "${onlyInSeed}"`);
  console.log(`  Chars only in hash: "${onlyInHash}"`);
  console.log("═".repeat(65));

  return { seed: S, hash: H };
}

// ── Run on all known game data ─────────────────────────────────────
const games = [
  {
    label: "Game A — nonce=37, 15 mines",
    realSeed: "8bdde84089ca17399dab7e0891ec9a9dc92b4bfbb7b54a4689cb24ed969e8c2f",
    clientSeed: "tarKkvBXpuWbhw14",
    nonce: 37,
  },
  {
    label: "Game B — nonce=1, 5 mines",
    realSeed: "190574716e0c77ef705e879f789737bc00d20716083582cf1bcba9b9bd6e8844",
    clientSeed: "a1wejAPUvPX9xp4V",
    nonce: 1,
  },
];

const results = [];
for (const g of games) {
  const r = formulaSeven(g.label, g.realSeed, g.clientSeed, g.nonce);
  results.push({ label: g.label, ...r });
}

// ── Cross-game pattern summary ─────────────────────────────────────
console.log("\n" + "═".repeat(65));
console.log("  CROSS-GAME PATTERN SUMMARY");
console.log("═".repeat(65));
for (const r of results) {
  console.log(`\n  ${r.label}`);
  console.log(`  Seed  — digits: ${r.seed.digitCount}/64  sum: ${r.seed.sum}  letters: ${r.seed.letterCount}/64`);
  console.log(`  Hash  — digits: ${r.hash.digitCount}/64  sum: ${r.hash.sum}  letters: ${r.hash.letterCount}/64`);
}
console.log("\n  Add more games to spot patterns in seed generation.");
console.log("═".repeat(65));

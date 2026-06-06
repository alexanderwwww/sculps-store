/**
 * RAINBET MINES — CONFIRMED ALGORITHM
 *
 * Algorithm: HMAC-SHA256 (Stake standard)
 *   key    = serverSeed
 *   msg    = clientSeed + ":" + nonce + ":" + count
 *
 * Demo mode clientSeed = "0000000000000000000000000000000000000000000000000000000000000000"
 *
 * Verified against Game F:
 *   serverSeed = 6065b019210ab3e6c4affcd9bfda6950d3ce406101c5c6c1bbdb42ff22d2272e
 *   committed  = SHA256(serverSeed) = 5ab1c4d4b02ea1ff45ff0588d5e4eeb27d1e08c5fa379ca0c67c1f3fb43fc5a3 ✅
 *   nonce=255, mines=15, clientSeed=64-zeros
 *   → mines at [21,23,18,3,14,15,17,4,1,22,6,19,12,10,9]
 *   → gems at pos 7 ✅ and pos 20 ✅  (confirmed from game screenshot)
 */
const crypto = require("crypto");

// ─── Core: generate mine positions ────────────────────────────────────────────
function getMinePositions(serverSeed, clientSeed, nonce, mineCount) {
  const GRID = 25;
  const cells = Array.from({ length: GRID }, (_, i) => i);
  const bytes = [];
  let count = 0;

  // Generate enough bytes for Fisher-Yates: need (GRID-1) * 4 bytes minimum
  while (bytes.length < GRID * 4) {
    const hmac = crypto.createHmac("sha256", serverSeed);
    hmac.update(`${clientSeed}:${nonce}:${count}`);
    hmac.digest().forEach(b => bytes.push(b));
    count++;
  }

  // Fisher-Yates shuffle using 4-byte (32-bit) chunks
  for (let i = GRID - 1; i > 0; i--) {
    const offset = (GRID - 1 - i) * 4;
    const uint32 = ((bytes[offset] * 16777216) + (bytes[offset+1] * 65536) + (bytes[offset+2] * 256) + bytes[offset+3]) >>> 0;
    const j = Math.floor((uint32 / 4294967296) * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }

  return cells.slice(0, mineCount); // first N positions = mines
}

// ─── Verify a committed hash ───────────────────────────────────────────────────
function verifyCommit(serverSeed, committedHash) {
  const actual = crypto.createHash("sha256").update(serverSeed).digest("hex");
  return actual === committedHash;
}

// ─── Grid renderer ─────────────────────────────────────────────────────────────
function renderGrid(minePositions, revealedGems = [], revealedMines = []) {
  let out = "\n     0   1   2   3   4\n";
  for (let r = 0; r < 5; r++) {
    out += `r${r}  `;
    for (let c = 0; c < 5; c++) {
      const pos = r * 5 + c;
      if (minePositions.includes(pos))      out += "💣  ";
      else if (revealedMines.includes(pos)) out += "❌  "; // wrong prediction
      else if (revealedGems.includes(pos))  out += "💎  ";
      else                                  out += "·   ";
    }
    out += `  [row ${r}]\n`;
  }
  return out;
}

// ─── Demo: show all known games ───────────────────────────────────────────────
const DEMO_CLIENT_SEED = "0000000000000000000000000000000000000000000000000000000000000000";

const KNOWN_GAMES = [
  {
    label: "Game A", nonce: 37,  mines: 15, knownGems: [], knownMines: [],
    serverSeed: "8bdde84089ca17399dab7e0891ec9a9dc92b4bfbb7b54a4689cb24ed969e8c2f",
    committedHash: null // unknown
  },
  {
    label: "Game B", nonce: 1,   mines: 5,  knownGems: [], knownMines: [],
    serverSeed: "190574716e0c77ef705e879f789737bc00d20716083582cf1bcba9b9bd6e8844",
    committedHash: null
  },
  {
    label: "Game C", nonce: 11,  mines: 12, knownGems: [], knownMines: [],
    serverSeed: "289aadff0291768dda5bb739cc815db7f2fcaf969353d2751f628207390613e3",
    committedHash: null
  },
  {
    label: "Game E", nonce: 9,   mines: null, knownGems: [], knownMines: [],
    serverSeed: "c25daa9a5f86180210df4f7b72ba027811d0e74672ec2d8d96bc4cc56a09c821",
    committedHash: "e4715366cce151e0164ea4e365e075c4b6f149caff11206ce44b7a5bdacf5d33"
  },
  {
    label: "Game F ✅VERIFIED", nonce: 255, mines: 15, knownGems: [7, 20], knownMines: [],
    serverSeed: "6065b019210ab3e6c4affcd9bfda6950d3ce406101c5c6c1bbdb42ff22d2272e",
    committedHash: "5ab1c4d4b02ea1ff45ff0588d5e4eeb27d1e08c5fa379ca0c67c1f3fb43fc5a3"
  }
];

console.log("══════════════════════════════════════════════════════════════");
console.log("  RAINBET MINES — CONFIRMED ALGORITHM");
console.log("══════════════════════════════════════════════════════════════");
console.log(`  Demo clientSeed: "${DEMO_CLIENT_SEED.slice(0,16)}..."\n`);

for (const g of KNOWN_GAMES) {
  console.log(`─── ${g.label} (nonce=${g.nonce}, mines=${g.mines ?? "?"}) ───`);

  if (g.committedHash) {
    const valid = verifyCommit(g.serverSeed, g.committedHash);
    console.log(`  SHA256 commit: ${valid ? "✅ valid" : "❌ MISMATCH"}`);
  }

  if (g.mines === null) {
    console.log("  (mine count unknown — skip)\n");
    continue;
  }

  const minePos = getMinePositions(g.serverSeed, DEMO_CLIENT_SEED, g.nonce, g.mines);
  const gemPos  = Array.from({length:25},(_,i)=>i).filter(p=>!minePos.includes(p));

  console.log(`  Mine positions: [${minePos.join(", ")}]`);
  console.log(`  Gem  positions: [${gemPos.join(", ")}]`);

  if (g.knownGems.length) {
    const conflict = g.knownGems.filter(p => minePos.includes(p));
    console.log(`  Known gems check: ${conflict.length === 0 ? "✅ ALL MATCH" : "❌ conflicts at " + conflict}`);
  }

  console.log(renderGrid(minePos, g.knownGems, g.knownMines));
}

// ─── API for programmatic use ─────────────────────────────────────────────────
module.exports = { getMinePositions, verifyCommit, renderGrid, DEMO_CLIENT_SEED };

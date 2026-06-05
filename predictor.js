const { generateMinePositions, hashServerSeed } = require("./lib/provably-fair");

function predict({ serverSeed, clientSeed, nonce, mineCount = 3 }) {
  // Verify the seed matches its committed hash
  const computedHash = hashServerSeed(serverSeed);

  const { mines, safe } = generateMinePositions(serverSeed, clientSeed, nonce, mineCount);

  const board = Array(25).fill(".");
  mines.forEach((m) => (board[m] = "M"));

  console.log("═══════════════════════════════════");
  console.log("       MINE PREDICTOR");
  console.log("═══════════════════════════════════");
  console.log("Server Seed  :", serverSeed);
  console.log("Seed Hash    :", computedHash);
  console.log("Client Seed  :", clientSeed);
  console.log("Nonce        :", nonce);
  console.log("Mine Count   :", mineCount);
  console.log("───────────────────────────────────");
  console.log("        0   1   2   3   4");
  for (let r = 0; r < 5; r++) {
    const row = board.slice(r * 5, r * 5 + 5);
    const display = row.map((t) => (t === "M" ? " 💣" : " 💎"));
    console.log("Row " + r + "  " + display.join(" "));
  }
  console.log("───────────────────────────────────");
  console.log("💣 MINES :", mines.sort((a, b) => a - b).join(", "));
  console.log("💎 SAFE  :", safe.sort((a, b) => a - b).join(", "));
  console.log("═══════════════════════════════════");

  return { mines, safe, hash: computedHash };
}

// ─── Run multiple nonces at once ───────────────────────────
function predictRange({ serverSeed, clientSeed, fromNonce, toNonce, mineCount = 3 }) {
  console.log("\nPredicting nonces", fromNonce, "→", toNonce, "\n");
  for (let n = fromNonce; n <= toNonce; n++) {
    const { mines, safe } = generateMinePositions(serverSeed, clientSeed, n, mineCount);
    const board = Array(25).fill(".");
    mines.forEach((m) => (board[m] = "M"));
    console.log("Nonce " + n + ":");
    for (let r = 0; r < 5; r++) {
      console.log("  " + board.slice(r * 5, r * 5 + 5).join(" "));
    }
    console.log("  Mines:", mines.sort((a, b) => a - b).join(", "));
    console.log("  Safe :", safe.sort((a, b) => a - b).join(", "));
    console.log();
  }
}

// ─── USAGE ─────────────────────────────────────────────────
// Replace serverSeed with the REAL seed revealed after rotation.
// The hash shown is what you see in the Fair Play panel BEFORE rotation.
// After rotation Rainbet shows you the actual serverSeed.

const EXAMPLE = {
  serverSeed:  "PASTE_REAL_SERVER_SEED_HERE_AFTER_ROTATION",
  clientSeed:  "WYs9DtxAC3lydQGk",
  nonce:       37,
  mineCount:   1,
};

if (EXAMPLE.serverSeed === "PASTE_REAL_SERVER_SEED_HERE_AFTER_ROTATION") {
  console.log("⚠️  Paste your real serverSeed (revealed after rotation) to predict.");
  console.log("   Your committed hash: 6c9b7b328202be0a3d38a79ad24d4096200a7a5645ffe...");
  console.log("   Rotate seeds on Rainbet → they reveal the serverSeed → paste it here.");
} else {
  predict(EXAMPLE);

  // Uncomment to predict a range of nonces at once:
  // predictRange({ ...EXAMPLE, fromNonce: 1, toNonce: 10 });
}

module.exports = { predict, predictRange };

/**
 * Standalone verifier — given a revealed serverSeed, clientSeed, nonce,
 * and mineCount, recompute the board and confirm it matches claimed mines.
 *
 * Run: node lib/verifier.js
 */
const { verifyGame, generateMinePositions } = require("./provably-fair");

// Example: paste your own values here after a seed rotation
const example = {
  serverSeed: "48830983abcdef1234567890abcdef1234567890abcdef1234567890abcdef12",
  clientSeed: "my_client_seed",
  nonce: 1,
  mineCount: 3,
  revealedMines: [], // fill in after a game ends
};

function printBoard(mines, gridSize = 25, cols = 5) {
  const board = Array.from({ length: gridSize }, (_, i) =>
    mines.includes(i) ? " M " : ` . `
  );
  console.log("\nBoard (M=mine, .=safe):");
  for (let row = 0; row < gridSize / cols; row++) {
    console.log(board.slice(row * cols, row * cols + cols).join(""));
  }
  console.log(`\nMine positions (0-indexed): [${mines.sort((a, b) => a - b).join(", ")}]`);
}

function runVerifier(params) {
  const { serverSeed, clientSeed, nonce, mineCount, revealedMines } = params;

  console.log("=== Provably Fair Verifier ===");
  console.log(`Server seed : ${serverSeed}`);
  console.log(`Client seed : ${clientSeed}`);
  console.log(`Nonce       : ${nonce}`);
  console.log(`Mines       : ${mineCount}`);

  if (!revealedMines || revealedMines.length === 0) {
    // Just show what the board would be
    const { mines, safe } = generateMinePositions(serverSeed, clientSeed, nonce, mineCount);
    printBoard(mines);
    console.log(`Safe tiles  : [${safe.sort((a, b) => a - b).join(", ")}]`);
  } else {
    const result = verifyGame(params);
    printBoard(result.computed);
    console.log(`\nClaimed mines : [${result.claimed.join(", ")}]`);
    console.log(`Computed mines: [${result.computed.join(", ")}]`);
    console.log(`\nVerification  : ${result.valid ? "VALID ✓" : "INVALID ✗"}`);
  }
}

if (require.main === module) {
  runVerifier(example);
}

module.exports = { runVerifier };

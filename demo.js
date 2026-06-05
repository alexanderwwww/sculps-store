/**
 * Demo mode — you own both seeds so you can reveal the board up front.
 * Run: node demo.js
 */
const { generateMinePositions, hashServerSeed, generateServerSeed } = require("./lib/provably-fair");

const serverSeed = generateServerSeed();
const clientSeed = "demo-player";
const nonce = 1;
const mineCount = 5;

const { mines, safe } = generateMinePositions(serverSeed, clientSeed, nonce, mineCount);
const hash = hashServerSeed(serverSeed);

console.log("=== DEMO MODE (you own both seeds) ===\n");
console.log("Server seed hash shown to player:", hash);
console.log("Server seed (hidden until rotation):", serverSeed);
console.log("Client seed:", clientSeed, "  Nonce:", nonce, "  Mines:", mineCount);

const board = Array(25).fill(".");
mines.forEach((m) => (board[m] = "M"));

console.log("\nFull board (demo reveals it):");
for (let r = 0; r < 5; r++) {
  const row = board.slice(r * 5, r * 5 + 5);
  const nums = Array.from({ length: 5 }, (_, c) => String(r * 5 + c).padStart(2));
  console.log("  " + row.join("  ") + "   tiles: " + nums.join(", "));
}
console.log("\nMines:", mines.sort((a, b) => a - b));
console.log("Safe: ", safe.sort((a, b) => a - b));

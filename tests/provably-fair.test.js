const assert = require("assert");
const { generateMinePositions, verifyGame, hashServerSeed } = require("../lib/provably-fair");
const { MinesGame } = require("../lib/mines-game");

// --- Core algorithm tests ---

function test_same_seeds_same_board() {
  const a = generateMinePositions("seed123", "client456", 1, 5);
  const b = generateMinePositions("seed123", "client456", 1, 5);
  assert.deepStrictEqual(a.mines.sort(), b.mines.sort(), "Same seeds must produce same board");
  console.log("PASS: Determinism");
}

function test_different_nonce_different_board() {
  const a = generateMinePositions("seed123", "client456", 1, 5);
  const b = generateMinePositions("seed123", "client456", 2, 5);
  assert.notDeepStrictEqual(a.mines.sort(), b.mines.sort(), "Different nonce should differ");
  console.log("PASS: Nonce changes board");
}

function test_mine_count_correct() {
  for (const n of [1, 3, 5, 10, 20]) {
    const { mines, safe } = generateMinePositions("s", "c", 1, n);
    assert.strictEqual(mines.length, n, `Expected ${n} mines`);
    assert.strictEqual(safe.length, 25 - n, `Expected ${25 - n} safe`);
    assert.strictEqual(mines.length + safe.length, 25, "mines + safe must = 25");
  }
  console.log("PASS: Mine counts correct for all counts");
}

function test_no_duplicate_positions() {
  const { mines, safe } = generateMinePositions("seed", "client", 7, 10);
  const all = [...mines, ...safe];
  const unique = new Set(all);
  assert.strictEqual(unique.size, 25, "All 25 tiles must appear exactly once");
  assert.ok(all.every((t) => t >= 0 && t <= 24), "All tiles in range 0–24");
  console.log("PASS: No duplicate or out-of-range positions");
}

function test_verify_game_valid() {
  const serverSeed = "test-server-seed-abc";
  const clientSeed = "player1";
  const nonce = 42;
  const mineCount = 5;
  const { mines } = generateMinePositions(serverSeed, clientSeed, nonce, mineCount);
  const result = verifyGame({ serverSeed, clientSeed, nonce, mineCount, revealedMines: mines });
  assert.strictEqual(result.valid, true, "Verification should pass");
  console.log("PASS: Verification valid case");
}

function test_verify_game_invalid() {
  const serverSeed = "test-server-seed-abc";
  const { mines } = generateMinePositions(serverSeed, "player1", 42, 5);
  // tamper with one mine position
  const tampered = [...mines];
  tampered[0] = (tampered[0] + 1) % 25;
  const result = verifyGame({
    serverSeed,
    clientSeed: "player1",
    nonce: 42,
    mineCount: 5,
    revealedMines: tampered,
  });
  assert.strictEqual(result.valid, false, "Tampered mines should fail verification");
  console.log("PASS: Verification catches tampering");
}

function test_hash_commitment() {
  const seed = "my-secret-server-seed";
  const hash = hashServerSeed(seed);
  assert.strictEqual(hash.length, 64, "SHA256 hex should be 64 chars");
  assert.strictEqual(hashServerSeed(seed), hash, "Hash is deterministic");
  console.log("PASS: Server seed hash commitment");
}

// --- Game session tests ---

function test_game_session_lost() {
  const game = new MinesGame("player");
  game.startGame(3);
  // find a mine and hit it
  const mine = [...game.activeGame.mines][0];
  const result = game.revealTile(mine);
  assert.strictEqual(result.status, "lost", "Should lose when hitting mine");
  assert.strictEqual(result.mines.length, 3, "All mines revealed on loss");
  assert.strictEqual(game.activeGame, null, "No active game after loss");
  assert.strictEqual(game.nonce, 2, "Nonce incremented");
  console.log("PASS: Game session — loss on mine");
}

function test_game_session_cashout() {
  const game = new MinesGame("player");
  game.startGame(3);
  // find a safe tile
  const mines = new Set(game.activeGame.mines);
  const safe = [...Array(25).keys()].find((t) => !mines.has(t));
  game.revealTile(safe);
  const result = game.cashOut();
  assert.strictEqual(result.status, "cashed_out");
  assert.strictEqual(game.activeGame, null);
  console.log("PASS: Game session — cash out");
}

function test_seed_rotation() {
  const game = new MinesGame("player");
  const hashBefore = game.serverSeedHash;
  const rotation = game.rotateSeed("new-client-seed");
  assert.strictEqual(rotation.previous.serverSeedHash, hashBefore);
  assert.notStrictEqual(game.serverSeedHash, hashBefore, "New seed hash should differ");
  assert.strictEqual(game.nonce, 1, "Nonce resets on rotation");
  console.log("PASS: Seed rotation");
}

function test_full_win() {
  const game = new MinesGame("player");
  game.startGame(24); // 24 mines, 1 safe tile
  const mines = new Set(game.activeGame.mines);
  const safeTile = [...Array(25).keys()].find((t) => !mines.has(t));
  const result = game.revealTile(safeTile);
  assert.strictEqual(result.status, "won");
  console.log("PASS: Full win (all safe tiles revealed)");
}

// Run all tests
const tests = [
  test_same_seeds_same_board,
  test_different_nonce_different_board,
  test_mine_count_correct,
  test_no_duplicate_positions,
  test_verify_game_valid,
  test_verify_game_invalid,
  test_hash_commitment,
  test_game_session_lost,
  test_game_session_cashout,
  test_seed_rotation,
  test_full_win,
];

let passed = 0;
let failed = 0;
for (const t of tests) {
  try {
    t();
    passed++;
  } catch (e) {
    console.error(`FAIL: ${t.name} — ${e.message}`);
    failed++;
  }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);

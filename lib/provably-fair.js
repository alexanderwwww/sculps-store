/**
 * Provably Fair Algorithm — standard crypto-casino implementation
 *
 * Flow:
 *   1. Server generates serverSeed (random), stores SHA256(serverSeed) publicly
 *   2. Player sets clientSeed (visible, changeable)
 *   3. Each game increments nonce
 *   4. HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}:${cursor}`) → bytes → floats
 *   5. Fisher-Yates shuffle of [0..24] using those floats → first N = mines
 *   6. On rotation: serverSeed is revealed, player can verify all past games
 */

const crypto = require("crypto");

/**
 * Generate a float in [0, 1) from 4 bytes of an HMAC result.
 * Uses the standard uint32 / 2^32 method.
 */
function bytesToFloat(bytes, offset) {
  const uint32 =
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0;
  return uint32 / 0x100000000;
}

/**
 * Generate an ordered sequence of floats from seeds.
 * cursor increments whenever we exhaust the 32 bytes of a single HMAC.
 */
function* floatStream(serverSeed, clientSeed, nonce) {
  let cursor = 0;
  while (true) {
    const hmac = crypto
      .createHmac("sha256", serverSeed)
      .update(`${clientSeed}:${nonce}:${cursor}`)
      .digest();

    for (let offset = 0; offset + 3 < hmac.length; offset += 4) {
      yield bytesToFloat(hmac, offset);
    }
    cursor++;
  }
}

/**
 * Fisher-Yates shuffle driven by the float stream.
 * Returns the shuffled array.
 */
function shuffleWithStream(array, stream) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const f = stream.next().value;
    const j = Math.floor(f * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Generate mine positions for a game.
 *
 * @param {string} serverSeed   - The actual server seed (revealed after rotation)
 * @param {string} clientSeed   - Player's client seed
 * @param {number} nonce        - Game number
 * @param {number} mineCount    - How many mines (1–24)
 * @param {number} gridSize     - Total tiles (default 25 for 5×5)
 * @returns {{ mines: number[], safe: number[] }}
 */
function generateMinePositions(serverSeed, clientSeed, nonce, mineCount, gridSize = 25) {
  const tiles = Array.from({ length: gridSize }, (_, i) => i);
  const stream = floatStream(serverSeed, clientSeed, nonce);
  const shuffled = shuffleWithStream(tiles, stream);
  const mines = new Set(shuffled.slice(0, mineCount));
  const safe = shuffled.slice(mineCount);
  return { mines: [...mines], safe };
}

/**
 * Verify a completed game — reproduce the board from revealed seeds and
 * check it matches what was played.
 *
 * @param {object} params
 * @param {string} params.serverSeed
 * @param {string} params.clientSeed
 * @param {number} params.nonce
 * @param {number} params.mineCount
 * @param {number[]} params.revealedMines - Mine positions the house claims
 * @returns {{ valid: boolean, computed: number[], claimed: number[] }}
 */
function verifyGame({ serverSeed, clientSeed, nonce, mineCount, revealedMines }) {
  const { mines } = generateMinePositions(serverSeed, clientSeed, nonce, mineCount);
  const computed = [...mines].sort((a, b) => a - b);
  const claimed = [...revealedMines].sort((a, b) => a - b);
  const valid = JSON.stringify(computed) === JSON.stringify(claimed);
  return { valid, computed, claimed };
}

/**
 * Hash a server seed for public commitment (SHA256).
 * Players see this hash before the game; the seed is revealed after rotation.
 */
function hashServerSeed(serverSeed) {
  return crypto.createHash("sha256").update(serverSeed).digest("hex");
}

/**
 * Generate a cryptographically random server seed.
 */
function generateServerSeed() {
  return crypto.randomBytes(32).toString("hex");
}

module.exports = {
  generateMinePositions,
  verifyGame,
  hashServerSeed,
  generateServerSeed,
  floatStream,
  shuffleWithStream,
};

const crypto = require("crypto");
const {
  generateMinePositions,
  hashServerSeed,
  generateServerSeed,
} = require("./provably-fair");

/**
 * Server-side game session.
 * In a real app: persist this to a database; never expose serverSeed until rotation.
 */
class MinesGame {
  constructor(clientSeed = "player") {
    this.serverSeed = generateServerSeed();
    this.serverSeedHash = hashServerSeed(this.serverSeed);
    this.clientSeed = clientSeed;
    this.nonce = 1;
    this.activeGame = null;
    this.history = [];
  }

  /**
   * Start a new game. Returns only the hash of the server seed (not the seed itself).
   */
  startGame(mineCount = 3) {
    if (mineCount < 1 || mineCount > 24) throw new Error("mineCount must be 1–24");
    if (this.activeGame) throw new Error("A game is already in progress");

    const { mines } = generateMinePositions(
      this.serverSeed,
      this.clientSeed,
      this.nonce,
      mineCount
    );

    this.activeGame = {
      nonce: this.nonce,
      mineCount,
      mines: new Set(mines),
      revealed: new Set(),
      status: "active",
    };

    return {
      serverSeedHash: this.serverSeedHash,
      clientSeed: this.clientSeed,
      nonce: this.nonce,
      mineCount,
      gridSize: 25,
      // NOTE: mines are NOT returned here — the server keeps them secret
    };
  }

  /**
   * Reveal a tile. Returns whether it was safe or a mine.
   * On mine: game ends and the full board is exposed for verification.
   */
  revealTile(tileIndex) {
    if (!this.activeGame || this.activeGame.status !== "active") {
      throw new Error("No active game");
    }
    if (tileIndex < 0 || tileIndex > 24) throw new Error("Tile index 0–24");
    if (this.activeGame.revealed.has(tileIndex)) throw new Error("Already revealed");

    const isMine = this.activeGame.mines.has(tileIndex);
    this.activeGame.revealed.add(tileIndex);

    if (isMine) {
      this.activeGame.status = "lost";
      return this._endGame("lost", tileIndex);
    }

    const safeCount = 25 - this.activeGame.mineCount;
    if (this.activeGame.revealed.size >= safeCount) {
      this.activeGame.status = "won";
      return this._endGame("won", null);
    }

    return { status: "safe", tile: tileIndex, revealed: [...this.activeGame.revealed] };
  }

  /**
   * Cash out — end the game as a win without hitting all safe tiles.
   */
  cashOut() {
    if (!this.activeGame || this.activeGame.status !== "active") {
      throw new Error("No active game");
    }
    if (this.activeGame.revealed.size === 0) throw new Error("Must reveal at least 1 tile");
    this.activeGame.status = "cashed_out";
    return this._endGame("cashed_out", null);
  }

  _endGame(outcome, hitTile) {
    const game = this.activeGame;
    const record = {
      nonce: game.nonce,
      clientSeed: this.clientSeed,
      serverSeed: this.serverSeed,   // revealed now
      serverSeedHash: this.serverSeedHash,
      mineCount: game.mineCount,
      mines: [...game.mines],
      revealed: [...game.revealed],
      outcome,
      hitTile,
    };

    this.history.push(record);
    this.activeGame = null;
    this.nonce++;

    return {
      status: outcome,
      hitTile,
      mines: record.mines,          // full board revealed for verification
      serverSeed: this.serverSeed,  // seed revealed for verification
      clientSeed: this.clientSeed,
      nonce: record.nonce,
    };
  }

  /**
   * Rotate seeds. Reveals the current server seed, generates a fresh one.
   */
  rotateSeed(newClientSeed) {
    if (this.activeGame) throw new Error("Cannot rotate during an active game");

    const old = {
      serverSeed: this.serverSeed,
      serverSeedHash: this.serverSeedHash,
      clientSeed: this.clientSeed,
    };

    this.serverSeed = generateServerSeed();
    this.serverSeedHash = hashServerSeed(this.serverSeed);
    this.clientSeed = newClientSeed || crypto.randomBytes(8).toString("hex");
    this.nonce = 1;

    return {
      previous: old,
      newServerSeedHash: this.serverSeedHash,
      newClientSeed: this.clientSeed,
    };
  }

  getStatus() {
    return {
      serverSeedHash: this.serverSeedHash,
      clientSeed: this.clientSeed,
      nonce: this.nonce,
      activeGame: this.activeGame
        ? { mineCount: this.activeGame.mineCount, revealed: [...this.activeGame.revealed] }
        : null,
    };
  }
}

module.exports = { MinesGame };

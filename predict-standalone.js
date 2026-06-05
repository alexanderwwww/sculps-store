const crypto = require("crypto");

function predict(serverSeed, clientSeed, nonce, mineCount) {
  function* floatStream() {
    let cursor = 0;
    while (true) {
      const h = crypto.createHmac("sha256", serverSeed)
        .update(`${clientSeed}:${nonce}:${cursor}`).digest();
      for (let i = 0; i + 3 < h.length; i += 4) {
        const u = ((h[i] << 24) | (h[i+1] << 16) | (h[i+2] << 8) | h[i+3]) >>> 0;
        yield u / 0x100000000;
      }
      cursor++;
    }
  }

  const positions = Array.from({ length: 25 }, (_, i) => i);
  const stream = floatStream();
  for (let i = 24; i > 0; i--) {
    const j = Math.floor(stream.next().value * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }

  const mines = positions.slice(0, mineCount).sort((a, b) => a - b);
  const safe  = positions.slice(mineCount).sort((a, b) => a - b);
  const board = Array(25).fill("💎");
  mines.forEach(m => board[m] = "💣");

  console.log("\n=== PREDICTION ===");
  console.log("Nonce:", nonce, " | Mines:", mineCount);
  for (let r = 0; r < 5; r++)
    console.log("  " + board.slice(r*5, r*5+5).join(" "));
  console.log("\n💣 Mines:", mines.join(", "));
  console.log("💎 Safe :", safe.join(", "));
}

// ── PASTE YOUR REAL SERVER SEED BELOW (revealed after rotation) ──
predict(
  "PASTE_SERVER_SEED_HERE",   // ← real serverSeed after rotation
  "WYs9DtxAC3lydQGk",         // clientSeed
  37,                          // nonce
  1                            // mine count
);

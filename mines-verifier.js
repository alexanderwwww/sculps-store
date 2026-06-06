/**
 * MINES ALGORITHM VERIFIER
 * Tests multiple HMAC-based provably fair algorithm variants
 * against known Rainbet game data.
 *
 * Known data:
 *   Game A: serverSeed=8bdde840...  nonce=37  mines=15
 *   Game B: serverSeed=190574716... nonce=1   mines=5
 *   Game C: serverSeed=289aadff0... nonce=11  mines=12
 *   Game E: serverSeed=c25daa9a5... nonce=9   mines=?
 *   Game F: serverSeed=6065b019... nonce=255  mines=15  gems=[7,20]
 *
 * HOW TO USE:
 *   1. Open Rainbet → click your avatar → Provably Fair
 *   2. Copy your clientSeed (visible in the dialog)
 *   3. Run: node mines-verifier.js <clientSeed>
 *   4. Compare mine positions output to what you saw on screen
 */
const crypto = require("crypto");

const CLIENT_SEED = process.argv[2] || "0000000000000000000000000000000000000000000000000000000000000000";

const GAMES = [
  {
    label: "Game A",
    serverSeed: "8bdde84089ca17399dab7e0891ec9a9dc92b4bfbb7b54a4689cb24ed969e8c2f",
    nonce: 37,
    mines: 15,
    knownGems: [],
    knownMines: []
  },
  {
    label: "Game B",
    serverSeed: "190574716e0c77ef705e879f789737bc00d20716083582cf1bcba9b9bd6e8844",
    nonce: 1,
    mines: 5,
    knownGems: [],
    knownMines: []
  },
  {
    label: "Game C",
    serverSeed: "289aadff0291768dda5bb739cc815db7f2fcaf969353d2751f628207390613e3",
    nonce: 11,
    mines: 12,
    knownGems: [],
    knownMines: []
  },
  {
    label: "Game E",
    serverSeed: "c25daa9a5f86180210df4f7b72ba027811d0e74672ec2d8d96bc4cc56a09c821",
    nonce: 9,
    mines: null,
    knownGems: [],
    knownMines: []
  },
  {
    label: "Game F",
    serverSeed: "6065b019210ab3e6c4affcd9bfda6950d3ce406101c5c6c1bbdb42ff22d2272e",
    nonce: 255,
    mines: 15,
    knownGems: [7, 20],   // positions confirmed as gems from screenshot
    knownMines: []
  }
];

// ─────────────────────────────────────────────────────────────────────────────
// ALGORITHM VARIANTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * VARIANT 1: Stake/BC.Game standard
 * HMAC-SHA256(key=serverSeed, msg=clientSeed:nonce:count)
 * Generates 4 bytes per 32-byte block → values 0..UINT32_MAX
 * Modulo to get position index
 */
function variant1_stakeStandard(serverSeed, clientSeed, nonce, mines) {
  const cells = Array.from({ length: 25 }, (_, i) => i);
  const bytes = [];
  let count = 0;

  while (bytes.length < 25 * 4) {
    const hmac = crypto.createHmac("sha256", serverSeed);
    hmac.update(`${clientSeed}:${nonce}:${count}`);
    const chunk = hmac.digest();
    for (const b of chunk) bytes.push(b);
    count++;
  }

  // Fisher-Yates shuffle using 4-byte slices
  for (let i = cells.length - 1; i > 0; i--) {
    const offset = (cells.length - 1 - i) * 4;
    const r = (bytes[offset] * 16777216 + bytes[offset + 1] * 65536 + bytes[offset + 2] * 256 + bytes[offset + 3]) / 4294967296;
    const j = Math.floor(r * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }

  return cells.slice(0, mines);
}

/**
 * VARIANT 2: Rainbet-style — HMAC-SHA512 (key=serverSeed, msg=clientSeed:nonce)
 * Takes first 25 * 8 bytes, uses 8-byte chunks for Fisher-Yates
 */
function variant2_hmacSha512(serverSeed, clientSeed, nonce, mines) {
  const cells = Array.from({ length: 25 }, (_, i) => i);
  const bytes = [];
  let count = 0;

  while (bytes.length < 25 * 8) {
    const hmac = crypto.createHmac("sha512", serverSeed);
    hmac.update(`${clientSeed}:${nonce}:${count}`);
    const chunk = hmac.digest();
    for (const b of chunk) bytes.push(b);
    count++;
  }

  for (let i = cells.length - 1; i > 0; i--) {
    const offset = (cells.length - 1 - i) * 8;
    // Use 4 bytes (ignore upper 4 for precision)
    const r = ((bytes[offset] * 16777216 + bytes[offset + 1] * 65536 + bytes[offset + 2] * 256 + bytes[offset + 3]) >>> 0) / 4294967296;
    const j = Math.floor(r * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }

  return cells.slice(0, mines);
}

/**
 * VARIANT 3: nonce as hex, HMAC-SHA512
 */
function variant3_nonceHex(serverSeed, clientSeed, nonce, mines) {
  const cells = Array.from({ length: 25 }, (_, i) => i);
  const bytes = [];
  let count = 0;

  while (bytes.length < 25 * 8) {
    const hmac = crypto.createHmac("sha512", serverSeed);
    const nonceHex = nonce.toString(16).padStart(8, "0");
    hmac.update(`${clientSeed}:${nonceHex}:${count}`);
    const chunk = hmac.digest();
    for (const b of chunk) bytes.push(b);
    count++;
  }

  for (let i = cells.length - 1; i > 0; i--) {
    const offset = (cells.length - 1 - i) * 8;
    const r = ((bytes[offset] * 16777216 + bytes[offset + 1] * 65536 + bytes[offset + 2] * 256 + bytes[offset + 3]) >>> 0) / 4294967296;
    const j = Math.floor(r * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }

  return cells.slice(0, mines);
}

/**
 * VARIANT 4: msg = nonce:clientSeed (reversed order)
 */
function variant4_nonceFirst(serverSeed, clientSeed, nonce, mines) {
  const cells = Array.from({ length: 25 }, (_, i) => i);
  const bytes = [];
  let count = 0;

  while (bytes.length < 25 * 4) {
    const hmac = crypto.createHmac("sha256", serverSeed);
    hmac.update(`${nonce}:${clientSeed}:${count}`);
    const chunk = hmac.digest();
    for (const b of chunk) bytes.push(b);
    count++;
  }

  for (let i = cells.length - 1; i > 0; i--) {
    const offset = (cells.length - 1 - i) * 4;
    const r = ((bytes[offset] * 16777216 + bytes[offset + 1] * 65536 + bytes[offset + 2] * 256 + bytes[offset + 3]) >>> 0) / 4294967296;
    const j = Math.floor(r * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }

  return cells.slice(0, mines);
}

/**
 * VARIANT 5: Shuffle all 25 positions then take last `mines` as mine positions
 * (some implementations reverse: first = gems, last = mines)
 */
function variant5_reverseSlice(serverSeed, clientSeed, nonce, mines) {
  const result = variant1_stakeStandard(serverSeed, clientSeed, nonce, 25);
  return result.slice(25 - mines);
}

/**
 * VARIANT 6: HMAC-SHA256 with BigInt for float generation (Stake v2 method)
 * Uses first 4 bytes of each 32-byte output for index derivation
 */
function variant6_bigint(serverSeed, clientSeed, nonce, mines) {
  const cells = Array.from({ length: 25 }, (_, i) => i);
  const outputs = [];
  let count = 0;

  while (outputs.length < 25) {
    const hmac = crypto.createHmac("sha256", serverSeed);
    hmac.update(`${clientSeed}:${nonce}:${count}`);
    const buf = hmac.digest();
    for (let i = 0; i + 3 < buf.length && outputs.length < 25; i += 4) {
      const val = buf.readUInt32BE(i);
      outputs.push(val / 4294967296);
    }
    count++;
  }

  // Knuth/Fisher-Yates
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(outputs[cells.length - 1 - i] * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }

  return cells.slice(0, mines);
}

/**
 * VARIANT 7: Simple concat without separator
 * HMAC-SHA256(serverSeed, clientSeed + nonce)
 */
function variant7_noSep(serverSeed, clientSeed, nonce, mines) {
  const cells = Array.from({ length: 25 }, (_, i) => i);
  const bytes = [];
  let count = 0;

  while (bytes.length < 25 * 4) {
    const hmac = crypto.createHmac("sha256", serverSeed);
    hmac.update(`${clientSeed}${nonce}${count}`);
    const chunk = hmac.digest();
    for (const b of chunk) bytes.push(b);
    count++;
  }

  for (let i = cells.length - 1; i > 0; i--) {
    const offset = (cells.length - 1 - i) * 4;
    const r = ((bytes[offset] * 16777216 + bytes[offset + 1] * 65536 + bytes[offset + 2] * 256 + bytes[offset + 3]) >>> 0) / 4294967296;
    const j = Math.floor(r * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }

  return cells.slice(0, mines);
}

/**
 * VARIANT 8: key=clientSeed (HMAC key is clientSeed, not serverSeed)
 */
function variant8_clientKey(serverSeed, clientSeed, nonce, mines) {
  const cells = Array.from({ length: 25 }, (_, i) => i);
  const bytes = [];
  let count = 0;

  while (bytes.length < 25 * 4) {
    const hmac = crypto.createHmac("sha256", clientSeed);
    hmac.update(`${serverSeed}:${nonce}:${count}`);
    const chunk = hmac.digest();
    for (const b of chunk) bytes.push(b);
    count++;
  }

  for (let i = cells.length - 1; i > 0; i--) {
    const offset = (cells.length - 1 - i) * 4;
    const r = ((bytes[offset] * 16777216 + bytes[offset + 1] * 65536 + bytes[offset + 2] * 256 + bytes[offset + 3]) >>> 0) / 4294967296;
    const j = Math.floor(r * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }

  return cells.slice(0, mines);
}

const VARIANTS = [
  { name: "v1: HMAC-SHA256(serverSeed, clientSeed:nonce:count) + FY [0..mines]", fn: variant1_stakeStandard },
  { name: "v2: HMAC-SHA512(serverSeed, clientSeed:nonce:count) + FY 8-byte [0..mines]", fn: variant2_hmacSha512 },
  { name: "v3: HMAC-SHA512 nonce-as-hex", fn: variant3_nonceHex },
  { name: "v4: HMAC-SHA256 nonce:clientSeed:count reversed order", fn: variant4_nonceFirst },
  { name: "v5: SHA256 FY last-mines (reverse slice)", fn: variant5_reverseSlice },
  { name: "v6: SHA256 BigInt float method", fn: variant6_bigint },
  { name: "v7: SHA256 no separator", fn: variant7_noSep },
  { name: "v8: HMAC-SHA256(clientSeed, serverSeed:nonce:count)", fn: variant8_clientKey },
];

// ─────────────────────────────────────────────────────────────────────────────
// GRID DISPLAY
// ─────────────────────────────────────────────────────────────────────────────
function renderGrid(minePositions, knownGems, knownMines) {
  let out = "";
  for (let r = 0; r < 5; r++) {
    let row = "  ";
    for (let c = 0; c < 5; c++) {
      const pos = r * 5 + c;
      if (minePositions.includes(pos)) {
        row += " 💣";
      } else if (knownGems.includes(pos)) {
        row += " 💎";
      } else {
        row += " · ";
      }
    }
    out += row + `  [${r * 5}..${r * 5 + 4}]\n`;
  }
  return out;
}

function checkKnownPositions(minePositions, knownGems, knownMines) {
  const gemConflicts = knownGems.filter(p => minePositions.includes(p));
  const mineConflicts = knownMines.filter(p => !minePositions.includes(p));
  return { ok: gemConflicts.length === 0 && mineConflicts.length === 0, gemConflicts, mineConflicts };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
console.log("══════════════════════════════════════════════════════════");
console.log(" RAINBET MINES ALGORITHM VERIFIER");
console.log("══════════════════════════════════════════════════════════");
console.log(`clientSeed: "${CLIENT_SEED}"\n`);
console.log("Usage: node mines-verifier.js <your-client-seed>\n");

// Focus on Game F since we have known gem positions
const gameF = GAMES[4];
console.log("══ GAME F — 15 mines, nonce 255, gems at pos [7, 20] ══\n");

let anyMatch = false;
for (const v of VARIANTS) {
  if (gameF.mines === null) continue;
  try {
    const positions = v.fn(gameF.serverSeed, CLIENT_SEED, gameF.nonce, gameF.mines);
    const { ok, gemConflicts } = checkKnownPositions(positions, gameF.knownGems, gameF.knownMines);
    const status = ok ? "✅ MATCHES known gems" : `❌ gem conflicts: pos ${gemConflicts.join(",")}`;
    console.log(`${v.name}`);
    console.log(`  Mines: [${positions.join(",")}]`);
    console.log(`  Status: ${status}`);
    if (ok) {
      anyMatch = true;
      console.log(renderGrid(positions, gameF.knownGems, gameF.knownMines));
    }
    console.log("");
  } catch (e) {
    console.log(`${v.name}: ERROR ${e.message}\n`);
  }
}

if (!anyMatch) {
  console.log("⚠️  No variant matched Game F known positions.");
  console.log("This means:");
  console.log("  1. clientSeed is different (most likely — provide your real clientSeed)");
  console.log("  2. nonce is wrong (try nonce=254 too, see below)");
  console.log("  3. Algorithm variant not covered\n");

  // Also try nonce 254
  console.log("══ TRYING nonce=254 for Game F ══\n");
  for (const v of VARIANTS) {
    if (gameF.mines === null) continue;
    try {
      const positions = v.fn(gameF.serverSeed, CLIENT_SEED, 254, gameF.mines);
      const { ok } = checkKnownPositions(positions, gameF.knownGems, gameF.knownMines);
      if (ok) {
        console.log(`✅ MATCH with nonce=254 using ${v.name}`);
        console.log(`  Mines: [${positions.join(",")}]`);
        console.log(renderGrid(positions, gameF.knownGems, gameF.knownMines));
      }
    } catch (e) { /* skip */ }
  }
}

// Show all games with default clientSeed for reference
console.log("\n══════════════════════════════════════════════════════════");
console.log(" ALL GAMES — variant 1 (Stake standard) for reference");
console.log("══════════════════════════════════════════════════════════\n");

for (const g of GAMES) {
  if (g.mines === null) { console.log(`${g.label}: mines count unknown, skipping\n`); continue; }
  const positions = variant1_stakeStandard(g.serverSeed, CLIENT_SEED, g.nonce, g.mines);
  console.log(`${g.label} (nonce=${g.nonce}, mines=${g.mines})`);
  console.log(`  Mine positions: [${positions.join(", ")}]`);
  console.log(renderGrid(positions, g.knownGems, g.knownMines));
}

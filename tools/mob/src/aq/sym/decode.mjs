// SYMBIOTE decoder: pump.fun events and accounts, read from pump.fun's own Anchor IDL
// (github.com/pump-fun/pump-public-docs idl/pump.json, program 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P, fetched 2026-11-18).
// Field lists below are copied from that IDL in order. Events are emitted as "Program data: <base64>" log lines (8-byte discriminator + borsh).
// Pure functions only: no network, no database, no wallet.
export const PUMP_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
export const WSOL = "So11111111111111111111111111111111111111112";
export const SYSTEM = "11111111111111111111111111111111";

const DISC = {
  TradeEvent: [189, 219, 127, 211, 78, 230, 97, 238],
  CreateEvent: [27, 114, 169, 77, 222, 235, 99, 118],
  CompleteEvent: [95, 114, 97, 156, 212, 46, 152, 8],
  BondingCurve: [23, 183, 248, 55, 96, 216, 172, 96],
};
const SHAREHOLDER = { struct: [["address", "pubkey"], ["share_bps", "u16"]] };
const FIELDS = {
  TradeEvent: [["mint", "pubkey"], ["sol_amount", "u64"], ["token_amount", "u64"], ["is_buy", "bool"], ["user", "pubkey"], ["timestamp", "i64"],
    ["virtual_sol_reserves", "u64"], ["virtual_token_reserves", "u64"], ["real_sol_reserves", "u64"], ["real_token_reserves", "u64"], ["fee_recipient", "pubkey"],
    ["fee_basis_points", "u64"], ["fee", "u64"], ["creator", "pubkey"], ["creator_fee_basis_points", "u64"], ["creator_fee", "u64"], ["track_volume", "bool"],
    ["total_unclaimed_tokens", "u64"], ["total_claimed_tokens", "u64"], ["current_sol_volume", "u64"], ["last_update_timestamp", "i64"], ["ix_name", "string"],
    ["mayhem_mode", "bool"], ["cashback_fee_basis_points", "u64"], ["cashback", "u64"], ["buyback_fee_basis_points", "u64"], ["buyback_fee", "u64"],
    ["shareholders", { vec: SHAREHOLDER }], ["quote_mint", "pubkey"], ["quote_amount", "u64"], ["virtual_quote_reserves", "u64"], ["real_quote_reserves", "u64"],
    ["holder_rewards_bps", "u64"], ["holder_rewards", "u64"], ["creator_fee_unclaimed", "u64"]],
  CreateEvent: [["name", "string"], ["symbol", "string"], ["uri", "string"], ["mint", "pubkey"], ["bonding_curve", "pubkey"], ["user", "pubkey"], ["creator", "pubkey"],
    ["timestamp", "i64"], ["virtual_token_reserves", "u64"], ["virtual_sol_reserves", "u64"], ["real_token_reserves", "u64"], ["token_total_supply", "u64"],
    ["token_program", "pubkey"], ["is_mayhem_mode", "bool"], ["is_cashback_enabled", "bool"], ["quote_mint", "pubkey"], ["virtual_quote_reserves", "u64"],
    ["creator_fee_bps", "u64"], ["is_holder_reward", "bool"], ["depth", "u8"]],
  CompleteEvent: [["user", "pubkey"], ["mint", "pubkey"], ["bonding_curve", "pubkey"], ["timestamp", "i64"], ["quote_mint", "pubkey"]],
  BondingCurve: [["virtual_token_reserves", "u64"], ["virtual_quote_reserves", "u64"], ["real_token_reserves", "u64"], ["real_quote_reserves", "u64"],
    ["token_total_supply", "u64"], ["complete", "bool"], ["creator", "pubkey"]],
};
// The fields every consumer needs; an event shorter than this (an older program version) is refused, longer tails are optional.
const REQUIRED = { TradeEvent: "virtual_token_reserves", CreateEvent: "timestamp", CompleteEvent: "timestamp", BondingCurve: "complete" };

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function b58(bytes) {
  let zeros = 0; while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const digits = [];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) { carry += digits[j] << 8; digits[j] = carry % 58; carry = (carry / 58) | 0; }
    while (carry) { digits.push(carry % 58); carry = (carry / 58) | 0; }
  }
  return "1".repeat(zeros) + digits.reverse().map((d) => B58[d]).join("");
}
export function fromB64(s) {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(s, "base64"));
  const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u;
}

function reader(u, o = 0) {
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  const need = (n) => { if (o + n > u.length) throw new RangeError("short"); };
  const r = {
    pubkey() { need(32); const v = b58(u.subarray(o, o + 32)); o += 32; return v; },
    u64() { need(8); const v = dv.getBigUint64(o, true); o += 8; return v; },
    i64() { need(8); const v = dv.getBigInt64(o, true); o += 8; return v; },
    u16() { need(2); const v = dv.getUint16(o, true); o += 2; return v; },
    u8() { need(1); return u[o++]; },
    bool() { need(1); return u[o++] !== 0; },
    string() { need(4); const n = dv.getUint32(o, true); o += 4; need(n); const v = new TextDecoder().decode(u.subarray(o, o + n)); o += n; return v; },
    any(t) {
      if (typeof t === "string") return r[t]();
      if (t.vec) { need(4); const n = dv.getUint32(o, true); o += 4; if (n > 64) throw new RangeError("vec too long"); return Array.from({ length: n }, () => r.any(t.vec)); }
      if (t.struct) return Object.fromEntries(t.struct.map(([k, tt]) => [k, r.any(tt)]));
      throw new Error("type");
    },
  };
  return r;
}
const sameDisc = (u, d) => u.length >= 8 && d.every((b, i) => u[i] === b);
const num = (v) => (typeof v === "bigint" ? Number(v) : v);

export function decodeStruct(name, bytes) {
  if (!sameDisc(bytes, DISC[name])) return null;
  const r = reader(bytes, 8), out = {};
  for (const [k, t] of FIELDS[name]) {
    try { out[k] = num(r.any(t)); } catch { if (!(REQUIRED[name] in out)) return null; break; }
  }
  return out;
}

// One log line -> {kind, ...} or null. Price: lamports per raw token unit (6 decimals) from the virtual reserves after the trade.
export function decodeLogLine(line) {
  if (typeof line !== "string" || !line.startsWith("Program data: ")) return null;
  let u; try { u = fromB64(line.slice(14).trim()); } catch { return null; }
  for (const kind of ["TradeEvent", "CreateEvent", "CompleteEvent"]) {
    const ev = decodeStruct(kind, u);
    if (ev) return { kind, ...ev };
  }
  return null;
}

// SOL coins only (quote mint absent, the system id, or wrapped SOL). Price in SOL per whole token (6 decimals).
export const isSolQuote = (q) => !q || q === SYSTEM || q === WSOL;
export const priceSol = (vsol, vtok) => (vtok > 0 ? (vsol / 1e9) / (vtok / 1e6) : 0);

// A whole logsNotification (Solana's {value:{signature, err, logs}}) -> normalised events for symbiote.
export function eventsFromLogs(value) {
  const out = { sig: value?.signature || null, failed: !!value?.err, trades: [], creates: [], completes: [] };
  if (out.failed || !Array.isArray(value?.logs)) return out;
  for (const l of value.logs) {
    const ev = decodeLogLine(l);
    if (!ev) continue;
    if (ev.kind === "TradeEvent") {
      if (!isSolQuote(ev.quote_mint)) continue;
      out.trades.push({ mint: ev.mint, buy: ev.is_buy, sol: ev.sol_amount / 1e9, tokens: ev.token_amount, user: ev.user, ts: ev.timestamp,
        vsol: ev.virtual_sol_reserves, vtok: ev.virtual_token_reserves, realSol: ev.real_sol_reserves / 1e9, feeBps: ev.fee_basis_points ?? null,
        creatorFeeBps: ev.creator_fee_basis_points ?? null, creator: ev.creator ?? null, ix: ev.ix_name ?? null, sig: out.sig, px: priceSol(ev.virtual_sol_reserves, ev.virtual_token_reserves) });
    } else if (ev.kind === "CreateEvent") {
      out.creates.push({ mint: ev.mint, name: ev.name, symbol: ev.symbol, uri: ev.uri, curve: ev.bonding_curve, creator: ev.creator || ev.user, ts: ev.timestamp,
        vsol: ev.virtual_sol_reserves, vtok: ev.virtual_token_reserves, supply: ev.token_total_supply, sol: isSolQuote(ev.quote_mint) });
    } else out.completes.push({ mint: ev.mint, ts: ev.timestamp });
  }
  return out;
}

// Bonding-curve account (programSubscribe / accountSubscribe, base64) -> reserves.
export function decodeCurve(b64) {
  try { return decodeStruct("BondingCurve", fromB64(b64)); } catch { return null; }
}

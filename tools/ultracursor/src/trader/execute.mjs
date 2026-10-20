/*
 * The one door to a real order (build 41). Nothing in ultracursor holds a key or signs: an
 * order is a click on GMGN's own trade panel in Alex's Chrome (exec/gmgn-panel.mjs), and every
 * such click goes through a door made here, inside the real trader (real/real.mjs) only.
 *
 *   createDoor({panel, now, ctx}) -> {mint(intentId), execute(kind, subject, token, how)}
 *
 * execute() refuses (throws) unless ALL of these hold:
 *   - the mode is LIVE. A sell is also allowed in PROBE while a position is selling and its
 *     controls were verified when it was bought: turning live off never strands a position.
 *   - the intent (buy) is APPROVED / the position (sell) is SELLING
 *   - a buy carries Alex's one-shot token for this intent: minted only when he presses Buy on
 *     the card (desk.decide calls mint), 20 s, in memory only, spent on first use
 *   - the stake is within the caps (MAX_STAKE_USD, steps.mjs; never from R2)
 *   - verify(selectors) passed in the last 5 s
 *
 * The old one-argument execute(order) (sniper.mjs, book.mjs) still refuses: no wallet there.
 */
import crypto from "node:crypto";
import { MAX_STAKE_USD } from "./real/steps.mjs";

export const LIVE_CONNECTED = false;   // the training engines' answer; the real trader has its own door
export const TOKEN_MS = 20_000, VERIFY_MS = 5_000;

export async function execute(order) {
  void order;
  throw new Error("live wallet not connected");
}

export function createDoor({ panel, now = Date.now, ctx }) {
  const tokens = new Map();              // token -> {intentId, exp}; never written anywhere
  const refuse = (why) => { throw new Error(`execute refused: ${why}`); };

  function mint(intentId) {
    const t = crypto.randomBytes(16).toString("hex");
    tokens.set(t, { intentId, exp: now() + TOKEN_MS });
    return t;
  }

  async function run(kind, subject, token, how = {}) {
    const c = ctx();
    const fresh = c.verify && c.verify.ok && now() - c.verify.at <= VERIFY_MS;
    if (kind === "buy") {
      if (c.mode !== "live") refuse("not LIVE");
      if (!subject || subject.state !== "APPROVED") refuse(`intent is ${subject ? subject.state : "missing"}, not APPROVED`);
      const t = token && tokens.get(token);
      if (!t) refuse("no approval token");
      tokens.delete(token);                                    // one shot, even when refused below
      if (t.intentId !== subject.id) refuse("the token is for another intent");
      if (now() > t.exp) refuse("the approval token expired");
      if (!(subject.stakeUsd > 0) || subject.stakeUsd > MAX_STAKE_USD + 1e-9) refuse(`stake $${subject.stakeUsd} is over the $${MAX_STAKE_USD} cap`);
      if (!(subject.stakeSol > 0) || !(subject.solUsd > 0) || subject.stakeSol * subject.solUsd > MAX_STAKE_USD * 1.01) refuse("stake in SOL is over the cap");
      if (!fresh) refuse("selectors not verified in the last 5 s");
      return panel.buy(subject, how);
    }
    if (kind === "sell") {
      if (!subject || subject.state !== "SELLING") refuse(`position is ${subject ? subject.state : "missing"}, not SELLING`);
      if (c.mode !== "live" && !subject.sellVerified) refuse("not LIVE and the sell controls were not verified at buy time");
      if (!fresh) refuse("selectors not verified in the last 5 s");
      return panel.sell(subject, how);
    }
    return refuse(`unknown kind ${kind}`);
  }

  return { mint, execute: run };
}

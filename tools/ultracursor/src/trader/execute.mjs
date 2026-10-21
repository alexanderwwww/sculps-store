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
 *   - verify(selectors) passed in the last 5 s (build 45: or the Instant-trade verify, exec 'instant')
 *
 * The old one-argument execute(order) (sniper.mjs, book.mjs) still refuses: no wallet there.
 */
import crypto from "node:crypto";
import { MAX_STAKE_USD } from "./real/steps.mjs";

export const LIVE_CONNECTED = false;   // the training engines' answer; the real trader has its own door
export const TOKEN_MS = 20_000, VERIFY_MS = 5_000;
/**
 * build 48, auto-buy caps. Hard-coded: R2 real.json can only lower them (autoMaxDay), never raise.
 *   AUTO_MAX_SOL  the one stake an auto-buy may spend: the instant buyPreset, never more
 *   AUTO_MAX_DAY  auto-buys per UTC day
 *   AUTO_DD       no auto-buy once the SOL balance is this far under the day's starting SOL
 *   KEEP_MINTS    coins Alex holds himself: never bought or sold by the trader (R2 keepMints adds more)
 */
export const AUTO_MAX_SOL = 0.01618, AUTO_MAX_DAY = 1000, AUTO_DD = 0.30;   // build 51: up to 1000 a day (real.json autoMaxDay, default 300)
export const KEEP_MINTS = Object.freeze(["CSocnzcRpgSCr1naKcNTieWZUxb6rABe45j844m7pump"]);   // Kimchi

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

  const kept = (c, mint) => KEEP_MINTS.includes(mint) || !!(c.keep && c.keep.has && c.keep.has(mint));

  /** Why an auto-buy may not go ahead, or null. Read at the mint and again at the click. */
  function autoBlock(c, subject) {
    const a = c.auto;
    if (c.mode !== "live") return "not LIVE";
    if (!a || a.on !== true) return "autoBuy is off";
    if (!subject || subject.auto !== true || !subject.runner) return "not a runner auto intent";
    if (subject.exec !== "instant" || typeof subject.preset !== "string") return "auto-buy needs exec instant";
    if (!(Number(subject.preset) === subject.stakeSol) || !(subject.stakeSol > 0) || subject.stakeSol > AUTO_MAX_SOL + 1e-12) return `stake ${subject.stakeSol} SOL is not the ${AUTO_MAX_SOL} preset`;
    if (!(a.used >= 1) || a.used > Math.min(AUTO_MAX_DAY, a.max ?? AUTO_MAX_DAY)) return `auto-buy ${a.used} of ${Math.min(AUTO_MAX_DAY, a.max ?? AUTO_MAX_DAY)} today`;
    if (a.ddOk !== true) return "the day's SOL is 30% down";
    if (kept(c, subject.mint)) return "a coin Alex keeps";
    return null;
  }

  /**
   * build 48: the ONE internal path that mints a token without Alex's press. Only for an auto
   * runner intent, only while real.json autoBuy is true and every cap passes (autoBlock).
   */
  function mintAuto(subject) {
    const c = ctx();
    if (!subject || subject.state !== "APPROVED") refuse(`intent is ${subject ? subject.state : "missing"}, not APPROVED`);
    const why = autoBlock(c, subject);
    if (why) refuse(`auto-buy: ${why}`);
    const t = crypto.randomBytes(16).toString("hex");
    tokens.set(t, { intentId: subject.id, exp: now() + TOKEN_MS, auto: true });
    return t;
  }

  async function run(kind, subject, token, how = {}) {
    const c = ctx();
    const fresh = c.verify && c.verify.ok && now() - c.verify.at <= VERIFY_MS;
    if (subject && kept(c, subject.mint)) refuse("a coin Alex keeps: never bought or sold by the trader");
    if (kind === "buy") {
      if (c.mode !== "live") refuse("not LIVE");
      if (!subject || subject.state !== "APPROVED") refuse(`intent is ${subject ? subject.state : "missing"}, not APPROVED`);
      const t = token && tokens.get(token);
      if (!t) refuse("no approval token");
      tokens.delete(token);                                    // one shot, even when refused below
      if (t.intentId !== subject.id) refuse("the token is for another intent");
      if (now() > t.exp) refuse("the approval token expired");
      if (subject.auto && !t.auto) refuse("an auto intent with a card token");
      if (t.auto) { const why = autoBlock(c, subject); if (why) refuse(`auto-buy: ${why}`); if (!how || how.exec !== "instant") refuse("auto-buy needs exec instant"); }
      if (!(subject.stakeUsd > 0) || subject.stakeUsd > MAX_STAKE_USD + 1e-9) refuse(`stake $${subject.stakeUsd} is over the $${MAX_STAKE_USD} cap`);
      if (!(subject.stakeSol > 0) || !(subject.solUsd > 0) || subject.stakeSol * subject.solUsd > MAX_STAKE_USD * 1.01) refuse("stake in SOL is over the cap");
      if (!fresh) refuse("selectors not verified in the last 5 s");
      return how && how.exec === "instant" ? panel.instantBuy(subject, how) : panel.buy(subject, how);
    }
    if (kind === "sell") {
      if (!subject || subject.state !== "SELLING") refuse(`position is ${subject ? subject.state : "missing"}, not SELLING`);
      if (c.mode !== "live" && !subject.sellVerified) refuse("not LIVE and the sell controls were not verified at buy time");
      if (!fresh) refuse("selectors not verified in the last 5 s");
      return how && how.exec === "instant" ? panel.instantSell(subject, how) : panel.sell(subject, how);
    }
    return refuse(`unknown kind ${kind}`);
  }

  return { mint, mintAuto, execute: run };
}

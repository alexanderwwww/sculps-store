// The GMGN-wallet executor against a headless Chrome and a fake GMGN page that has the Instant-trade window the real one has.
// Not a test of GMGN itself (its real page is Cloudflare-blocked from here): a test that OUR clicks are the right ones, trusted,
// once, never on decoys, and that nothing counts as bought until the tokens are in the wallet.
import { GmgnPanel } from "../src/lib/web/gmgn-panel.mjs";
import { webExec, WEB_CAPS } from "../src/lib/exec-browser.mjs";
import { KIMCHI } from "../src/lib/exec-gmgn.mjs";
import { DEFAULTS } from "../src/lib/strategy.mjs";
import { startFakeGmgn, routeGmgn, launchChrome, mintOf, FakeChain, WALLET } from "./fixtures/fake-gmgn.mjs";
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.log("FAIL  " + n, d === undefined ? "" : typeof d === "string" ? d : JSON.stringify(d).slice(0, 500)); } };
const KILL = setTimeout(() => { console.log("FAIL  web test timed out"); process.exit(1); }, 200_000); KILL.unref();

const chrome = await launchChrome();
const chain = new FakeChain({ sol: 0.1 });
const srv = await startFakeGmgn({ chain, variant: "instant", pxOf: () => 4.8e-5 });
await routeGmgn(chrome.ctx, srv);
const rpc = { solBalance: async () => chain.solBalance(), tokenAccounts: async (_o, mint) => { const t = await chain.tokenBalance(mint); return t.raw === "0" ? [] : [{ raw: BigInt(t.raw), pubkey: "x", program: "y", decimals: 6 }]; } };
const mk = (over = {}, caps = {}) => {
  const panel = new GmgnPanel({ browser: chrome.browser, build: "t", waitMs: 6000, ...over });
  return { panel, ex: webExec({ panel, rpc, wallet: WALLET, cfg: DEFAULTS, caps: { ...WEB_CAPS, pollMs: 30, settleMs: 1500, recheckGiveUpMs: 400, ...caps }, wait: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 40))) }) };
};
const MINT = mintOf("pepe");
const trusted = (re) => srv.clicks((e) => e.trusted && re.test(e.id || ""));

let { ex, panel } = mk();
let r = await ex.buy({ mint: MINT });
ok("buy: one trusted click on the 0.01618 preset inside the Instant window, tokens arrive, order ok", r.ok && r.sol === 0.01618 && BigInt(r.outAmount) > 0n && trusted(/^ip\d$/).length === 1 && trusted(/^ip0$/).length === 1, { r, clicks: srv.events.filter((e) => e.type === "click").map((e) => e.id) });
ok("buy: the decoys (quick-buy strip, DryFlip panel) were never touched", srv.events.filter((e) => /^(decoy|dp\d)$/.test(e.id || "")).length === 0);
ok("buy: the amount charged is the preset, 0.01618 SOL", Math.abs(1e9 * 0.1 - 1e9 * (await chain.solBalance()) - 0.01618e9) < 1e6, await chain.solBalance());
r = await ex.sell({ mint: MINT });
ok("sell: one trusted click on Sell 100%, wallet emptied, proceeds read from the chain", r.ok && trusted(/^isp3$/).length === 1 && (await chain.tokenBalance(MINT)).raw === "0" && Number(r.outAmount) > 0, r);
r = await ex.sell({ mint: MINT });
ok("sell with nothing held says so and clicks nothing more", !r.ok && r.noBalance && trusted(/^isp\d$/).length === 1, r);
await panel.close();

// the window GMGN closes after every load: the toggle is pressed first
srv.variant = "instantClosed"; ({ ex, panel } = mk());
const before = srv.events.length;
r = await ex.buy({ mint: mintOf("closed") });
ok("a closed Instant window is opened with the toggle, then the preset is clicked", r.ok && srv.events.slice(before).filter((e) => e.type === "click" && e.trusted).map((e) => e.id).join() === "itoggle,ip0", srv.events.slice(before).filter((e) => e.type === "click").map((e) => e.id));
await panel.close(); srv.variant = "instant";

// guards, before any page is touched
({ ex, panel } = mk()); const n0 = srv.events.length;
r = await ex.buy({ mint: KIMCHI });
ok("Kimchi: refused with nothing clicked", !r.ok && /Kimchi/.test(r.why) && srv.events.length === n0, r);
const poor = new FakeChain({ sol: 0.01 }); const exPoor = webExec({ panel, rpc: { solBalance: async () => poor.solBalance(), tokenAccounts: async () => [] }, wallet: WALLET, cfg: DEFAULTS, caps: WEB_CAPS });
r = await exPoor.buy({ mint: MINT });
ok("a wallet too small for the preset plus fees is refused with the numbers", !r.ok && /needs 0\.0202/.test(r.why) && srv.events.length === n0, r);
let bal = 0.1; const dd = webExec({ panel, rpc: { solBalance: async () => bal, tokenAccounts: async () => [] }, wallet: WALLET, cfg: DEFAULTS, caps: WEB_CAPS });
await dd.sizeSol(); bal = 0.06; r = await dd.buy({ mint: MINT });
ok("30% down halts, and says so", !r.ok && /halted/.test(r.why), r);
const hr = mk({}, { perHour: 1 }).ex; await hr.buy({ mint: mintOf("h1") }); r = await hr.buy({ mint: mintOf("h2") });
ok("the hourly cap stops the next buy before a click", !r.ok && /last hour/.test(r.why), r);

// the click that does not land
const orig = chain.buy.bind(chain); chain.buy = (m, s, p) => orig(m, s, p, { mode: "never" });
({ ex } = mk({}, { settleMs: 300, recheckGiveUpMs: 1500 })); const m2 = mintOf("never"); r = await ex.buy({ mint: m2 });
ok("a click whose tokens never arrive is UNKNOWN (kept and rechecked), never 'bought'", !r.ok && r.unknown === true && r.sent === true && r.orderId, r);
let rc = await ex.recheck(r.orderId);
ok("recheck says pending while it might still arrive", rc.status === "pending", rc);
await new Promise((x) => setTimeout(x, 1600)); rc = await ex.recheck(r.orderId);
ok("and failed once the give-up time has passed", rc.status === "failed", rc);
chain.buy = orig;
const late = mintOf("late"); chain.buy = (m, s, p) => orig(m, s, p, { mode: "late", lagMs: 400 }); ({ ex } = mk({}, { settleMs: 150 })); r = await ex.buy({ mint: late });
await new Promise((x) => setTimeout(x, 500)); rc = await ex.recheck(r.orderId);
ok("a buy that lands late is picked up by the recheck with the real token amount", !r.ok && rc.status === "confirmed" && BigInt(rc.outAmount) > 0n, { r, rc });
chain.buy = orig;

await panel.close(); await chrome.close(); await srv.close();
console.log(`\nweb tests: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

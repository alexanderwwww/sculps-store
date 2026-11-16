// Realistic dev fixture shaped exactly like CONTRACT.md state (plus the later additions). Dev only.
const DEPTS = {
  scouts_sol: ["Scouts · Solana", "hecate", ["new pairs", "trending list", "boosted-token flag", "volume spikes", "liquidity adds", "holder growth", "smart-wallet buys", "launchpad graduations", "dev-wallet watch", "copycat-name detector", "narrative clustering", "top-gainer sanity check"]],
  scouts_stocks: ["Scouts · Stocks and majors", null, ["pre-market gappers", "20-day breakouts", "bull flags", "opening-range breakouts", "oversold bounces", "unusual volume", "BTC/ETH/SOL regime", "funding rates", "open interest", "perp basis", "earnings calendar", "halt list"]],
  whales: ["Whales", null, ["Hyperliquid leaderboard poller", "steady-winner finder", "90-day persistence tester", "GMGN smart-money feed", "KOL wallets", "funder clustering", "wash-trade detector", "market-maker classifier", "wallet PnL recompute", "copy-latency tester", "new-whale discovery", "whale-sell alarm"]],
  news: ["News and mood", "dionysus", ["headline RSS", "SEC 8-K feed", "Google Trends", "live X search", "StockTwits mood", "Reddit mood", "Fear and Greed", "token announcements", "exchange listings", "regulatory news", "exploit alerts", "event calendar"]],
  setups: ["Setups", "athena", ["swing finder", "Fibonacci levels", "entry ladder", "stop calculator", "target calculator", "time stop", "liquidity-aware sizing", "stressed-stop sizing", "reward:risk after costs", "multi-timeframe confluence", "regime tagger", "setup library keeper"]],
  costs: ["Costs", null, ["Jupiter round-trip quotes", "pool fee reader", "token-tax detector", "slippage estimator", "priority-fee tuner", "route comparer", "rent reclaim", "cost-per-venue ledger", "break-even calculator", "6x-cost gate", "fee-drift alarm", "venue health"]],
  council: ["Council of Olympus", null, ["backtest runner", "out-of-sample splitter", "bootstrap p-value", "95% interval", "survivorship checker", "rug and safety scorer", "honeypot checker", "overfitting detector", "sample-size gate", "Time Machine replay", "adversarial reviewer", "veto recorder"]],
  risk: ["Risk", "zeus", ["per-trade risk", "daily stop", "open-risk cap", "correlation clusters", "kill switch", "position limits", "drawdown monitor", "exposure vs wallet", "stale-data guard", "API-health guard", "loss-streak throttle", "limits-file enforcer"]],
  execution: ["Execution", "hermes", ["paper executor", "live executor (locked)", "order builder", "stop-loss placer", "fill reconciler", "on-chain verifier", "sell-everything fallback", "retry and backoff", "wallet balance watch", "failed-tx analyzer", "cap enforcer", "approval-ticket keeper"]],
  review: ["Review and journal", null, ["trade journal", "process-vs-outcome grader", "slippage audit", "win/loss stats", "expectancy calculator", "giveback analyzer", "missed-signal counter", "lesson extractor", "daily report", "weekly report", "brain-row writer", "mistake-pattern finder"]],
  learning: ["Learning", "apollo", ["link watcher", "repo reader", "idea paper-trader", "hypothesis registry", "tournament scoreboard", "parameter refitter", "KB curator", "contradiction finder", "idea killer", "skill writer", "experiment scheduler", "memory compactor"]],
  ops: ["Ops and city", null, ["data-source health", "scheduler", "secrets guard", "LLM budget monitor", "uptime watcher", "backup to R2", "deploy guard", "city feed", "big-screen aggregator", "notifications", "Grok/ChatGPT bridge", "login guard"]],
};
const NAMES = ["Nikos", "Eleni", "Kostas", "Maria", "Yannis", "Sofia", "Dimitris", "Ioanna", "Petros", "Katerina", "Giorgos", "Anna", "Stavros", "Daphne", "Leon", "Irene"];
let t0 = Date.now(), tick = 0, flowId = 1000;
const ago = (s) => new Date(Date.now() - s * 1000).toISOString();
export function fixture() {
  tick++;
  const departments = Object.entries(DEPTS).map(([id, [name, god, jobs]], di) => ({
    id, name, god, live: di !== 1, lastRunAt: di === 1 ? null : ago(20 + di * 7), skills: ["read the recipe", jobs[0], jobs[3]],
    workers: jobs.map((job, i) => {
      const k = (di * 7 + i * 3 + tick) % 11;
      const status = k < 5 ? "busy" : k < 10 ? "idle" : "blocked";
      return { id: `${id}-${i + 1}`, name: NAMES[(di * 3 + i) % NAMES.length] + " " + (i + 1), job, status,
        note: status === "busy" ? `running ${job}` : status === "blocked" ? (i % 2 ? "source timed out (TLS)" : "waiting on Council") : null,
        skills: [job, i % 2 ? "fibonacci" : "missing data = NO"], power: i === 3 && id === "news" ? "grok" : i === 10 ? "claude" : "code", rules: i % 3 ? null : "Never acts on missing data." };
    }),
  }));
  departments[4].workers.push({ id: "setups-ceo-1", name: "Golden Hawk", job: "phi pullback finder (CEO-made)", status: "busy", note: "paper, budget 0.05 SOL", skills: ["fibonacci", "golden ratio"], power: "claude", rules: "Only 61.8% retracements" });
  const flows = []; const kinds = ["buy", "fee", "sell", "win", "loss", "fee"];
  for (let i = 0; i < 18; i++) { const k = kinds[(i + tick) % kinds.length]; flows.push({ id: flowId + tick * 2 - i, kind: k, sol: k === "fee" ? 0.0021 : k === "win" ? 0.0134 : k === "loss" ? -0.0087 : 0.05, dept: k === "fee" ? "costs" : k === "win" || k === "loss" ? "review" : "execution", label: k === "fee" ? "Jupiter round trip" : `${["BONK", "WIF", "POPCAT", "MEW"][i % 4]} ${k}`, at: ago(i * 41 + 3) }); }
  return {
    build: "fixture-1", survival: { health: Number(process.env.HEALTH || 82), stage: process.env.STAGE || "thriving" }, mode: "PAPER", killSwitch: false, updatedAt: ago(2),
    equitySol: 1.0 + 0.0123 + Math.sin(tick / 3) * 0.002, startSol: 1.0, pnlTodaySol: 0.0081, pnlTotalSol: 0.0123,
    trades: { n: 23, wins: 13, winRate: 0.565, expectancyPct: 0.8, ci95: [-2.1, 3.4], evidence: "NO EVIDENCE yet" },
    positions: [
      { id: 1, symbol: "BONK", mint: "DezX…B263", entryPrice: 0.0000231, price: 0.0000244, stopPct: -6.18, targetPct: 16.18, sizeSol: 0.05, openedAt: ago(1800), pnlPct: 5.6, strategy: "R2" },
      { id: 2, symbol: "WIF", mint: "EKpQ…zcjm", entryPrice: 1.92, price: 1.87, stopPct: -6.18, targetPct: 16.18, sizeSol: 0.05, openedAt: ago(5200), pnlPct: -2.6, strategy: "R1" },
      { id: 3, symbol: "POPCAT", mint: "7GCi…W2hr", entryPrice: 0.412, price: null, stopPct: -6.18, targetPct: 16.18, sizeSol: 0.03, openedAt: ago(300), pnlPct: null, strategy: "R4" },
    ],
    recent: [
      { id: 51, symbol: "MEW", side: "sell", sizeSol: 0.05, pnlSol: 0.0134, reason: "target 16.18% hit", at: ago(900) },
      { id: 50, symbol: "GIGA", side: "sell", sizeSol: 0.05, pnlSol: -0.0087, reason: "stop -6.18%", at: ago(4000) },
      { id: 49, symbol: "MEW", side: "buy", sizeSol: 0.05, pnlSol: null, reason: "61.8% pullback + volume", at: ago(7200) },
    ],
    flows,
    council: { last: { verdict: "BLOCK", symbol: "PNUT2", reason: "copycat name, liquidity 4x below gate", number: "p=0.31", at: ago(120) },
      vetoes: [{ verdict: "BLOCK", symbol: "PNUT2", reason: "copycat name, liquidity 4x below gate", number: "p=0.31", at: ago(120) }, { verdict: "PASS", symbol: "BONK", reason: "costs 1.2% < 6x gate, OOS ok", number: "R:R 2.6", at: ago(1900) }, { verdict: "BLOCK", symbol: "HONEY", reason: "honeypot: sell simulation failed", number: "tax 99%", at: ago(5000) }] },
    departments,
    market: { sol: { price: 187.42, ch24: 3.1 }, btc: null, fearGreed: { value: 64, label: "Greed" }, trending: [{ symbol: "BONK", ch1h: 4.2, liqUsd: 2_400_000, boosted: false }, { symbol: "PNUT2", ch1h: 41.0, liqUsd: 18_000, boosted: true }, { symbol: "WIF", ch1h: -1.3, liqUsd: 5_100_000, boosted: false }] },
    brain: [{ at: ago(600), dept: "review", text: "Losses cluster in the first 10 minutes after a boosted listing." }, { at: ago(3600), dept: "learning", text: "R3 killed: 0 of 40 OOS trades beat costs." }, { at: ago(7200), dept: "costs", text: "Jupiter round trip on sub-$50k pools averages 4.8%." }],
    strategies: [{ id: "R1", name: "Fib pullback", trades: 9, pnlSol: 0.0061, alive: true, status: "paper" }, { id: "R2", name: "Smart-wallet follow", trades: 7, pnlSol: 0.0094, alive: true, status: "paper" }, { id: "R3", name: "Breakout chase", trades: 40, pnlSol: -0.0112, alive: false, status: "killed" }, { id: "R4", name: "News momentum", trades: 4, pnlSol: null, alive: true, status: "testing" }, { id: "R5", name: "Time Machine replay", trades: 0, pnlSol: null, alive: true, status: "planned" }],
    tools: [{ name: "Freqtrade", licence: "GPL-3.0", verdict: "use for backtests", status: "planned", usedBy: "council" }, { name: "skfolio", licence: "BSD-3", verdict: "portfolio sizing", status: "planned", usedBy: "risk" }, { name: "NautilusTrader", licence: "LGPL-3.0", verdict: "later", status: "planned", usedBy: "execution" }, { name: "Hummingbot", licence: "Apache-2.0", verdict: "reference only", status: "planned", usedBy: "execution" }, { name: "Kronos", licence: "MIT", verdict: "forecast experiments", status: "planned", usedBy: "learning" }],
    helpers: { grok: { status: "connected", lastAt: ago(240), lastText: "X chatter on $BONK up 3x in the last hour, mostly 2 large accounts.", label: "REPORTED" }, chatgpt: "not connected" },
    xfeed: [{ at: ago(240), dept: "news", text: "X chatter on $BONK up 3x in the last hour, mostly 2 large accounts.", label: "REPORTED" }, { at: ago(900), dept: "scouts_sol", text: "PNUT2 promoted by 14 new accounts created this week.", label: "INFERRED" }, { at: ago(1500), dept: "whales", text: "Leaderboard wallet #7 posted a SOL long screenshot.", label: "CLAIMED" }],
  };
}

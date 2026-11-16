// Aquarius seed data: 12 departments x 12 workers (from .claude/skills/aquarius-plan), the five tools
// (trading-lab section 6), the recipes R1-R5 (recipe skill). Data only; the tick reads rows at run time.
// Skill names below are real repo skills in .claude/skills/.

// id, name, god (CONTRACT "FIXED" line), dept-level skills
export const DEPTS = [
  ["scouts_sol", "Scouts · Solana", "hecate", ["gmgn-fib", "trader-scanner", "recipe", "trading-kb"]],
  ["scouts_stocks", "Scouts · Stocks & Majors", null, ["trader-scanner", "trader-master", "trader-alerts", "recipe"]],
  ["whales", "Whales", null, ["gmgn-fib", "trader-pelosi", "trading-lab", "trading-kb"]],
  ["news", "News & Sentiment", "dionysus", ["trader-news", "trader-analyst", "learn-links", "watch"]],
  ["setups", "Setups", "athena", ["gmgn-fib", "trader-entry", "trader-exit", "recipe"]],
  ["costs", "Costs", null, ["trading-lab", "recipe", "trader-budget", "gmgn-fib"]],
  ["council", "Council of Olympus", null, ["trader-timemachine", "trading-lab", "recipe", "trader-risk"]],
  ["risk", "Risk", "zeus", ["trader-risk", "trader-budget", "recipe", "gmgn-fib"]],
  ["execution", "Execution", "hermes", ["trader-broker", "trader-exit", "trader-alerts", "gmgn-fib"]],
  ["review", "Review & Journal", null, ["trader-master", "trading-kb", "trading-lab", "recipe"]],
  ["learning", "Learning", "apollo", ["learn-links", "watch", "trading-lab", "trader-timemachine"]],
  ["ops", "Ops & City", null, ["trading-kb", "trader-alerts", "trader-master", "recipe"]],
];
export const DEPT_IDS = DEPTS.map((d) => d[0]);
export const CEO = { name: "Alex", role: "CEO", skills: ["trader-master", "recipe", "trading-kb", "gmgn-fib", "trading-lab", "learn-links"] };

// [key, job, one-line rule, skills]. Keys wired in the tick are listed in engine.mjs; the rest stay idle "not wired yet".
const W = {
  scouts_sol: [
    ["sol.new_pairs", "New pairs", "List new Solana pools from GeckoTerminal; SOL-quoted only.", ["trader-scanner", "gmgn-fib"]],
    ["sol.trending", "Trending list", "Read GeckoTerminal trending pools every tick; never rank by hype alone.", ["trader-scanner", "trading-kb"]],
    ["sol.boosted", "Boosted-token flag", "A DexScreener boost is paid: flag it as a warning, never a reason.", ["trading-lab", "trading-kb"]],
    ["sol.volume", "Volume spikes", "Flag 5-minute volume above 2x the hourly pace.", ["trader-scanner"]],
    ["sol.liquidity", "Liquidity adds", "Report pool liquidity in USD; under the minimum is a NO.", ["gmgn-fib", "recipe"]],
    ["sol.holders", "Holder growth", "Not wired: needs a holder history feed.", ["gmgn-fib"]],
    ["sol.smart", "Smart-wallet buys", "Not wired: needs a free smart-money feed; never trust one wallet.", ["gmgn-fib", "trader-pelosi"]],
    ["sol.grads", "Launchpad graduations", "Not wired: pump.fun graduation feed.", ["gmgn-fib"]],
    ["sol.dev", "Dev-wallet watch", "Exclude creators and RugCheck insiders from smart money.", ["gmgn-fib", "trading-kb"]],
    ["sol.copycat", "Copycat-name detector", "Same symbol on two mints: every copy but the deepest pool is a copycat.", ["gmgn-fib", "trading-lab"]],
    ["sol.narrative", "Narrative clustering", "Tag GTA 6 tokens (release 2026-11-19); a tag is context, not a signal.", ["recipe", "trader-news"]],
    ["sol.gainers", "Top-gainer sanity check", "A +100% hour is a warning: late entries pay the top.", ["trader-scanner", "gmgn-fib"]],
  ],
  scouts_stocks: [
    ["stk.gappers", "Pre-market gappers", "Not wired: R1 stocks are not tested.", ["trader-scanner"]],
    ["stk.breakouts", "20-day breakouts", "Not wired: R1.", ["trader-scanner", "trader-entry"]],
    ["stk.flags", "Bull flags", "Not wired: R1.", ["trader-entry"]],
    ["stk.orb", "Opening-range breakouts", "Not wired: R1 rules exist in recipe, no cost model yet.", ["trader-entry", "trader-timemachine"]],
    ["stk.bounce", "Oversold bounces", "Not wired.", ["trader-scanner"]],
    ["stk.volume", "Unusual volume", "Not wired.", ["trader-scanner"]],
    ["stk.regime", "BTC/ETH/SOL regime", "Read SOL and BTC price and 24h change from CoinGecko each tick.", ["trader-master", "trading-kb"]],
    ["stk.funding", "Funding rates", "Not wired: R2 via Freqtrade later.", ["trading-lab"]],
    ["stk.oi", "Open interest", "Not wired.", ["trading-lab"]],
    ["stk.basis", "Perp basis", "Not wired.", ["trading-lab"]],
    ["stk.earnings", "Earnings calendar", "Not wired: trader-analyst reads EDGAR on demand.", ["trader-analyst"]],
    ["stk.halts", "Halt list", "Not wired.", ["trader-alerts"]],
  ],
  whales: [
    ["wh.hl_board", "Hyperliquid leaderboard poller", "Not wired: study 90 days before copying anyone.", ["trading-lab"]],
    ["wh.steady", "Steady-winner finder", "Not wired: the 144 mid-size winners.", ["trading-lab", "trading-kb"]],
    ["wh.persist", "90-day persistence tester", "Not wired.", ["trader-timemachine"]],
    ["wh.gmgn", "GMGN smart-money feed", "Not wired: no free key; never a trade trigger alone.", ["gmgn-fib"]],
    ["wh.kol", "KOL wallets", "Not wired: KOLs sell into their own followers.", ["gmgn-fib", "trader-pelosi"]],
    ["wh.funders", "Funder clustering", "Not wired.", ["gmgn-fib"]],
    ["wh.wash", "Wash-trade detector", "Not wired.", ["trading-lab"]],
    ["wh.mm", "Market-maker classifier", "Not wired.", ["trading-lab"]],
    ["wh.pnl", "Wallet PnL from raw fills", "Not wired: recompute, never trust a dashboard.", ["trading-kb"]],
    ["wh.latency", "Copy-latency tester", "Not wired.", ["recipe"]],
    ["wh.discover", "New-whale discovery", "Not wired.", ["trader-pelosi"]],
    ["wh.sell_alarm", "Whale-sell alarm", "Not wired.", ["trader-alerts"]],
  ],
  news: [
    ["nw.rss", "Headline RSS", "Not wired in the engine; mob /api/news holds pushed headlines.", ["trader-news"]],
    ["nw.sec", "SEC 8-K feed", "Not wired.", ["trader-analyst"]],
    ["nw.trends", "Google Trends", "Not wired.", ["trader-news"]],
    ["nw.x", "Live X search (Grok)", "Grok's posts are CLAIMED evidence, never a trigger; no free X API.", ["trader-news", "learn-links", "watch"]],
    ["nw.stocktwits", "StockTwits mood", "Not wired.", ["trader-news"]],
    ["nw.fng", "Fear and Greed", "Read alternative.me once an hour; mood may warn, never trigger.", ["trader-news", "trading-lab"]],
    ["nw.tokens", "Token announcements", "Read DexScreener profiles for GTA 6 words.", ["trader-news", "gmgn-fib"]],
    ["nw.listings", "Exchange listings", "Not wired.", ["trader-news"]],
    ["nw.regulatory", "Regulatory news", "Not wired.", ["trader-news"]],
    ["nw.exploits", "Exploit/hack alerts", "Not wired.", ["trader-alerts"]],
    ["nw.calendar", "Event calendar (GTA 6)", "Count down to GTA 6 on 2026-11-19.", ["trader-news", "recipe"]],
    ["nw.grader", "Source-quality grader", "Label every helper message VERIFIED/REPORTED/CLAIMED/INFERRED.", ["trading-lab", "learn-links"]],
  ],
  setups: [
    ["st.swing", "Swing finder", "Impulse = lowest low before the highest high of the last hour of 1m candles.", ["gmgn-fib", "trader-entry"]],
    ["st.fib", "Fibonacci levels", "Golden-ratio levels 0.382 / 0.5 / 0.618 of the impulse.", ["gmgn-fib"]],
    ["st.ladder", "Entry ladder", "Enter only inside 0.382-0.618 with a green bounce candle.", ["gmgn-fib", "trader-entry"]],
    ["st.stop", "Stop calculator", "Stop just below the 0.786 level.", ["gmgn-fib", "trader-exit"]],
    ["st.target", "Target calculator", "Target = the prior swing high; 1.272 extension recorded.", ["gmgn-fib", "trader-exit"]],
    ["st.time", "Time stop", "Flat after the strategy's time stop, win or lose.", ["trader-exit", "recipe"]],
    ["st.liq_size", "Liquidity-aware sizing", "Never more than the per-click cap.", ["trader-budget"]],
    ["st.stress", "Stressed-stop sizing", "Stressed loss = 1.5x stop + round trip; size so it is <= 2% of equity.", ["trader-risk", "recipe"]],
    ["st.rr", "Reward:risk after costs", "Report target, stop and round trip together.", ["recipe", "trading-lab"]],
    ["st.mtf", "Multi-timeframe confluence", "Not wired: 5m confirmation later.", ["gmgn-fib"]],
    ["st.regime", "Regime tagger", "Not wired.", ["trader-master"]],
    ["st.library", "Setup library keeper", "Strategies are rows; params change only through the tournament.", ["recipe", "trading-kb"]],
  ],
  costs: [
    ["co.jup", "Jupiter round-trip quotes", "Quote buy then sell for the paper size; 1.1 s between calls.", ["gmgn-fib", "trading-lab"]],
    ["co.pool_fee", "Pool fee reader", "Not wired: the quote already includes pool fees.", ["trading-lab"]],
    ["co.tax", "Token-tax detector", "Not wired: RugCheck transfer fee later.", ["gmgn-fib"]],
    ["co.slip", "Slippage estimator by size", "Slippage = fill vs pool mid price, measured per fill.", ["trading-lab"]],
    ["co.prio", "Priority-fee tuner", "Not wired: paper only.", ["trading-kb"]],
    ["co.route", "Route comparer", "Not wired.", ["trading-lab"]],
    ["co.rent", "Rent reclaim", "Not wired: paper only.", ["trading-kb"]],
    ["co.ledger", "Cost-per-venue ledger", "Not wired.", ["trading-kb"]],
    ["co.breakeven", "Break-even calculator", "Break-even win rate = (loss + cost) / (win + loss).", ["recipe"]],
    ["co.gate", "The 6x-cost gate", "Target must be >= 6x the measured round trip, or NO.", ["recipe", "trading-lab"]],
    ["co.drift", "Fee-drift alarm", "Not wired.", ["trader-alerts"]],
    ["co.venue", "Venue health (RPC/TLS)", "Jupiter quote answered or not.", ["trading-kb"]],
  ],
  council: [
    ["cn.backtest", "Backtest runner (Freqtrade)", "Not wired: Freqtrade is Python, planned for R2.", ["trading-lab", "trader-timemachine"]],
    ["cn.oos", "Out-of-sample splitter", "Not wired.", ["trader-timemachine"]],
    ["cn.pvalue", "Bootstrap/permutation p-value", "Not wired.", ["trading-lab"]],
    ["cn.ci", "95% interval calculator", "t interval on net trade returns; no verdict under 100 trades.", ["trading-lab", "recipe"]],
    ["cn.survivor", "Survivorship checker", "Not wired.", ["trading-lab"]],
    ["cn.safety", "Rug and safety scorer", "RugCheck: mint/freeze authority, danger risks, top holders, LP locked. Any fail = BLOCK.", ["gmgn-fib", "trading-kb"]],
    ["cn.honeypot", "Honeypot checker", "A sell quote must exist before any buy.", ["gmgn-fib"]],
    ["cn.overfit", "Overfitting detector", "Not wired.", ["trading-lab"]],
    ["cn.sample", "Sample-size gate", "Under 100 trades the evidence is NO EVIDENCE yet.", ["recipe", "trading-lab"]],
    ["cn.timemachine", "Time Machine replay", "Replay R3 on stored candles with costs before it may trade.", ["trader-timemachine", "recipe"]],
    ["cn.adversary", "Adversarial reviewer", "Tries to kill every idea; the first failing rule decides.", ["trading-lab", "trader-risk"]],
    ["cn.veto", "Veto recorder", "Every verdict is a row with the deciding number; a BLOCK is final.", ["trading-kb"]],
  ],
  risk: [
    ["rk.per_trade", "Per-trade risk", "Stressed stop loses <= 2% of paper equity.", ["trader-risk", "recipe"]],
    ["rk.day", "Daily stop", "Realized day loss <= -10% of start equity stops new entries.", ["trader-risk"]],
    ["rk.open", "Open-risk cap", "Not wired separately: max positions covers it for now.", ["trader-risk"]],
    ["rk.corr", "Correlation clusters", "Not wired.", ["trader-risk"]],
    ["rk.kill", "Kill switch", "Kill on = no new entries; open stops keep working.", ["trader-risk", "trader-broker"]],
    ["rk.limits", "Position limits", "Max 3 open positions.", ["trader-risk", "trader-budget"]],
    ["rk.dd", "Drawdown monitor", "Report equity vs start.", ["trader-budget"]],
    ["rk.exposure", "Exposure vs wallet", "Size never above paper cash.", ["trader-budget"]],
    ["rk.stale", "Stale-data guard", "Candles older than 2 minutes = NO.", ["trader-risk"]],
    ["rk.api", "API-health guard", "A failed feed = NO for anything that needs it.", ["trader-risk", "trading-kb"]],
    ["rk.streak", "Loss-streak throttle", "3 losses in a row pause entries for the cooldown.", ["trader-risk", "gmgn-fib"]],
    ["rk.file", "Limits-file enforcer", "Limits are strategy params read every tick.", ["recipe"]],
  ],
  execution: [
    ["ex.paper", "Paper executor", "Fill at the Jupiter quote incl. impact, pool fee and network fee.", ["trader-broker", "gmgn-fib"]],
    ["ex.live", "Live executor (locked)", "Locked: PAPER only. No wallet, no keys.", ["trader-broker"]],
    ["ex.builder", "Order builder", "Builds the paper ticket from the Council PASS.", ["trader-broker"]],
    ["ex.stops", "Stop-loss placer", "Checks stop, target and time stop on every tick with real prices.", ["trader-exit", "trader-alerts"]],
    ["ex.reconcile", "Fill reconciler", "Exit fill = Jupiter sell quote; no quote = hold and retry.", ["trader-broker"]],
    ["ex.onchain", "On-chain verifier", "Not wired: paper only.", ["trading-kb"]],
    ["ex.sellall", "Sell-everything fallback", "Not wired: paper only.", ["gmgn-fib"]],
    ["ex.retry", "Retry and backoff", "A failed quote is retried next tick, never in a loop.", ["trading-kb"]],
    ["ex.balance", "Wallet balance watch", "Paper cash and equity each tick.", ["trader-budget"]],
    ["ex.failed", "Failed-transaction analyzer", "Not wired: paper only.", ["trading-kb"]],
    ["ex.caps", "Cap enforcer", "0.05 SOL per click, one entry per tick.", ["gmgn-fib", "trader-budget"]],
    ["ex.tickets", "Approval-ticket keeper", "Not wired: live is locked.", ["trader-broker"]],
  ],
  review: [
    ["rv.journal", "Trade journal", "Every closed trade is a row with fees, slippage and reason.", ["trader-master", "trading-kb"]],
    ["rv.grade", "Process-vs-outcome grader", "Grade the process and the outcome separately; a loss is never a win.", ["trading-lab"]],
    ["rv.slip", "Fill-vs-signal slippage audit", "Record entry and exit slippage vs mid.", ["trading-lab"]],
    ["rv.stats", "Win/loss stats", "Win rate over net returns after costs.", ["trading-kb"]],
    ["rv.expectancy", "Expectancy calculator", "Mean net % per trade with its 95% interval.", ["recipe", "trading-lab"]],
    ["rv.giveback", "Giveback analyzer", "Not wired.", ["trader-exit"]],
    ["rv.missed", "Missed-signal counter", "Counts Council blocks by reason.", ["trading-lab"]],
    ["rv.lesson", "Lesson extractor", "One repeatable lesson per closed trade, with numbers.", ["trading-lab", "learn-links"]],
    ["rv.daily", "Daily report", "The briefing for the Grok desk.", ["trader-master"]],
    ["rv.weekly", "Weekly report", "Not wired.", ["trader-master"]],
    ["rv.brain", "Brain-row writer", "Lessons go to the brain and are never deleted.", ["trading-kb"]],
    ["rv.mistakes", "Mistake-pattern finder", "Not wired.", ["trading-lab"]],
  ],
  learning: [
    ["ln.links", "Link watcher (reels)", "Reels are watched by Claude sessions (learn-links), not this tick.", ["learn-links", "watch"]],
    ["ln.repos", "Repo reader", "Not wired: Claude sessions read repos.", ["trading-lab"]],
    ["ln.paper", "Paper-trader for new ideas", "New ideas trade on paper only, as their own strategy row.", ["recipe", "gmgn-fib"]],
    ["ln.hypo", "Hypothesis registry", "Rules and the abandon line are written before testing.", ["recipe", "trading-kb"]],
    ["ln.tournament", "Recipe tournament scoreboard", "R1-R5 scored on net returns; kill only by a recorded rule.", ["recipe", "trader-timemachine"]],
    ["ln.refit", "Guarded parameter refitter", "Params never change silently; a change is a new strategy row.", ["recipe", "trading-lab"]],
    ["ln.kb", "Knowledge-base curator", "Not wired: trading-kb is curated by Claude sessions.", ["trading-kb"]],
    ["ln.contra", "Contradiction finder", "Not wired.", ["trading-lab"]],
    ["ln.killer", "Idea killer", "100+ trades with the 95% interval below zero = killed.", ["recipe", "trading-lab"]],
    ["ln.skills", "Skill writer", "Not wired: skills are written by Claude sessions.", ["learn-links"]],
    ["ln.experiments", "Experiment scheduler", "Bot proposals wait for the Council.", ["recipe"]],
    ["ln.compact", "Memory compactor", "Not wired: the brain is never deleted.", ["trading-kb"]],
  ],
  ops: [
    ["op.health", "Data-source health", "Every feed's last result is shown; a dark building = a failed feed.", ["trading-kb"]],
    ["op.scheduler", "Scheduler", "One tick a minute; a lock stops overlaps.", ["trader-master"]],
    ["op.secrets", "Secrets guard", "The state JSON carries no key, token or URL with a password.", ["trading-kb"]],
    ["op.budget", "Credit/LLM budget monitor", "Code workers cost nothing; no paid API is called.", ["trading-kb"]],
    ["op.uptime", "Uptime watcher", "Records the tick time.", ["trader-alerts"]],
    ["op.backup", "Backup to R2", "Not wired.", ["trading-kb"]],
    ["op.deploy", "Deploy guard", "Not wired.", ["trading-kb"]],
    ["op.cityfeed", "City feed", "Builds /api/aq/state for the island.", ["trader-master"]],
    ["op.screen", "Big-screen aggregator", "Market square: SOL, BTC, Fear and Greed, trending.", ["trader-master", "trader-alerts"]],
    ["op.notify", "Notifications to Alex", "Not wired.", ["trader-alerts"]],
    ["op.bridge", "Grok/ChatGPT bridge", "Helper messages are evidence, never triggers.", ["learn-links", "trading-lab"]],
    ["op.access", "Access and login guard", "Admin session or bearer on every route.", ["trading-kb"]],
  ],
};

const NAMES = `Nikos Eleni Dimitra Kostas Yannis Sofia Maria Giorgos Petros Ioanna Katerina Andreas Christos Vasilis Despina Stella
Thanos Manos Lefteris Marina Vicky Zoe Iris Leo Theo Myrto Danae Fani Lena Rena Aris Stavros Panos Spyros Takis Mimis Lakis Babis
Sakis Fotis Kiki Toula Nana Roula Elpida Chloe Daphne Phoebe Thalia Kleio Ariadne Penny Electra Nefeli Melina Dora Effie Popi Voula
Anna Lia Mina Tina Xenia Ira Rania Korina Ilias Michalis Tasos Angelos Antonis Pavlos Minas Marios Haris Stelios Orestis Jason Achilles
Odysseas Telis Rafail Simos Lambros Makis Fanis Akis Nektarios Sotiris Zisis Alkis Platon Kimon Miltos Loukas Markos Filippos Alexis
Nefi Eva Mara Kalli Sia Dina Ely Tonia Rea Niki Kate Mary Gogo Lola Mirto Aliki Evi Natalia Athina Afroditi Artemis Persa Selini
Hera Ianthe Kora Leda Maia Nora Olga Pia Rita Sissy Tanya Vera Yota Zina Agis Bill Dinos Evan Fivos Gus Kris Linos Nondas Rigas
Stamatis Timos Vagelis Xenos Yorgos Zacharias`.split(/\s+/);

export function seedWorkers() {
  const out = [];
  let i = 0;
  for (const [dept] of DEPTS) for (const [key, job, rules, skills] of W[dept]) out.push({ key, dept, name: NAMES[i++], job, rules, skills, power: "code" });
  // A few workers read or judge, so Claude powers them (on Claude's own hourly usage, never a paid API from the Worker).
  for (const o of out) if (["nw.grader", "rv.lesson", "cn.adversary", "ln.hypo", "ln.links", "rv.daily"].includes(o.key)) o.power = "claude";
  for (const o of out) if (o.key === "nw.x") o.power = "grok";
  return out;
}

// trading-lab section 6 verdicts. Python tools: registered, never installed in the Worker.
export const TOOLS = [
  ["Freqtrade", "GPL-3.0", "USE (R2 first)", "council", "Backtest + dry-run R2 crypto majors with the 6x cost gate"],
  ["skfolio", "BSD-3", "USE (small, on demand)", "risk", "Allocate risk across recipes that survive testing"],
  ["NautilusTrader", "LGPL-3.0", "MAYBE LATER (R1)", "scouts_stocks", "R1 stocks on IBKR once R2 proves a process"],
  ["Hummingbot", "Apache-2.0", "MAYBE LATER (R3 execution only)", "execution", "Jupiter execution via Gateway, only after a memecoin edge is proven"],
  ["Kronos", "MIT", "SKIP for money (research only)", "learning", "None now: no cost-adjusted evidence"],
];

// Recipes R1-R5. Only R3 and R4 run (paper). Params are read by the tick every minute.
export const R3_PARAMS = {
  candles: "1m", minImpulsePct: 8, zoneLo: 0.382, zoneHi: 0.618, stopLevel: 0.786, stopBufferPct: 0.5, ext: 1.272,
  timeStopMin: 21, minLiqUsd: 30000, costMultiple: 6, riskPct: 2, stressMult: 1.5, maxSizeSol: 0.05, minSizeSol: 0.005,
  maxOpen: 3, dayStopPct: 10, lossStreak: 3, cooldownMin: 30, staleSec: 120, topHolderMax: 20, top10Max: 25, lpLockedMin: 50,
};
export const STRATEGIES = [
  ["R1", "R1 US stocks ORB + Time Machine", "stocks", "not tested", {}],
  ["R2", "R2 crypto majors (Freqtrade)", "majors", "not tested", {}],
  ["R3", "R3 memecoin fib (1m golden ratio)", "solana", "paper", R3_PARAMS],
  ["R4", "R4 launch watcher (GTA 6)", "solana", "paper", { ...R3_PARAMS, narrative: "GTA6" }],
  ["R5", "R5 copy wallets", "solana", "not tested", {}],
];

export const GTA6_DATE = "2026-11-19";
export const GTA_RE = /\b(gta|gta ?6|gtavi|leonida|vice ?city|jason duval|lucia|rockstar)\b/i;

#!/usr/bin/env python3
"""Sigma (Ultra lab round 2): capital path to $1/min. Run: /usr/bin/python3 sim.py > results.txt
USD, SOL=$95. Seeded. Edge uncertainty is sampled PER PATH (a path lives in one 'world').
Kill switch: a strategy stops trading permanently when equity is 40% under its peak (money then idles in staking).
"""
import numpy as np, json, sys
rng = np.random.default_rng(7)
SOL = 95.0
P = 2000
TARGETS = {'$1/min': 1440.0, '$1/2min': 720.0, '$1/5min': 288.0}
STARTS = [1, 30, 300, 3000]
DEPS = [0, 25, 100]
STAKE_DAY = 0.053 / 365
KILL = 0.40

def tnorm(df, size):
    x = rng.standard_t(df, size)
    return x / np.sqrt(df / (df - 2))

def world_A(n):
    pos = rng.random(n) < 0.65
    return np.where(pos, rng.normal(0.0045, 0.0025, n), rng.normal(-0.003, 0.002, n))
def world_C(n):
    dead = rng.random(n) < 0.30
    d = rng.uniform(0.5, 1.0, n)
    return np.where(dead, rng.normal(-0.043, 0.005, n), 0.025 * (1 - d))
def world_D(n):
    real = rng.random(n) < 0.08
    return np.where(real, 0.003 * rng.uniform(0.3, 1.0, n), rng.normal(-0.004, 0.002, n))

# lam = trades per day; steps = sim steps per day; conc = positions open at once per (trade/day) (A) or fixed (D)
CFG = {
 'A MeanRev':  dict(world=world_A, sig=0.06,  df=4, lam=1.5,    steps=1,  cap=20000, central=0.0045),
 'C Breakout': dict(world=world_C, sig=0.20,  df=3, lam=3.0,    steps=1,  cap=500,   central=0.0125),
 'D Scalp':    dict(world=world_D, sig=0.012, df=5, lam=4320.0, steps=24, cap=1000,  central=0.0015),
}
for c in CFG.values():
    c['f'] = min(1.0, 0.5 * c['central'] / c['sig'] ** 2)
# concurrent positions the wallet is split across: A ~1.1 (18h holds), C 1 (1h holds, sequential), D 1.5 (30s holds, 3/min)
CONC = {'A MeanRev': 1.1, 'C Breakout': 1.0, 'D Scalp': 1.5}
def daily_central(name):
    c = CFG[name]; return c['lam'] * c['central'] * c['f'] / CONC[name]

def run(name, start, dep, days, K):
    c = CFG[name]; mu = c['world'](P); conc = CONC[name]
    W = np.full(P, float(start)); peak = W.copy(); paid = W.copy()
    killed = np.zeros(P, bool); ruin = np.zeros(P, bool); maxdd = np.zeros(P)
    reach = np.full(P, np.inf); steps = c['steps']; dt = 1.0 / steps
    for d in range(days):
        if dep and d % 7 == 0 and d > 0:
            W += dep; paid += dep; peak = np.maximum(peak, W)
        for s in range(steps):
            n = rng.poisson(c['lam'] * dt, P)
            stake = np.minimum(c['f'] * W / conc, c['cap'])
            if steps == 1:
                kmax = 8; z = tnorm(c['df'], (P, kmax))
                mask = np.arange(kmax)[None, :] < np.minimum(n, kmax)[:, None]
                rr = np.clip(mu[:, None] + c['sig'] * z, -0.6, 1.5)
                pnl = stake * (rr * mask).sum(1)
            else:
                pnl = stake * (n * mu + np.sqrt(n) * c['sig'] * rng.standard_normal(P))
            pnl = np.where(killed, 0.0, pnl)
            idle = np.maximum(W - np.where(killed, 0, stake * conc), 0)
            W = np.maximum(W + pnl + idle * STAKE_DAY * dt, 0.0)
            peak = np.maximum(peak, W)
            dd = 1 - W / np.maximum(peak, 1e-9); maxdd = np.maximum(maxdd, dd)
            killed |= dd > KILL
        ruin |= W < np.maximum(0.5, 0.2 * paid)
        hit = ((W - (paid - start)) >= K) & np.isinf(reach); reach[hit] = d + 1
    return mu, W, reach, killed, ruin, maxdd

def staking(start, dep, years, K):
    W = float(start); apy = max(0.02, rng.normal(0.053, 0.012)); r = apy / 365
    for d in range(365 * years):
        if dep and d % 7 == 0 and d > 0: W += dep
        W *= 1 + r
        if W >= K: return d + 1
    return np.inf

def q(a, p):
    a = np.sort(a); return a[int(p * (len(a) - 1))]
def fd(x): return 'never' if not np.isfinite(x) else f'{x:.0f}d'
def pr(*a): print(' '.join(str(x) for x in a)); sys.stdout.flush()

pr('=== 0. STREAM SUMMARY (edge worlds sampled; net of costs) ===')
KS = {}
for name, c in CFG.items():
    mu = c['world'](200000); dc = daily_central(name); maxinc = c['lam'] * c['cap'] * c['central']
    pr(f"{name}: {c['lam']:.0f} trades/day, sd/trade {c['sig']*100:.1f}%, f=half-Kelly(central) {c['f']:.2f}, capacity ${c['cap']}/trade")
    pr(f"   edge %/trade: posterior mean {mu.mean()*100:+.3f}, median {np.median(mu)*100:+.3f}, P(edge<=0) {np.mean(mu<=0):.0%}, central (half measured) {c['central']*100:.2f}")
    pr(f"   net %/day on wallet: central-edge {dc*100:+.2f}% | posterior-mean {dc*mu.mean()/c['central']*100:+.2f}% | max income at capacity ${maxinc:,.0f}/day")
    KS[name] = (dc, maxinc)
    for t, v in TARGETS.items():
        pr(f"   {t}: K at central edge = " + (f"IMPOSSIBLE, capacity ceiling ${maxinc:,.0f}/day" if v > maxinc else f"${v/dc:,.0f}"))
apyd = 0.053 / 365
pr(f"B Staking 5.3% APY = {apyd*100:.4f}%/day; K: $1/min ${1440/apyd:,.0f}  $1/2min ${720/apyd:,.0f}  $1/5min ${288/apyd:,.0f}")

pr('\n=== 1. TIME TO REACH K (central-edge K). horizon 5y (D 1y); reach counts TRADING profit only (deposits excluded). P(reach), median over ALL paths, fast-10% = day by which fastest 10% arrived ===')
for name in CFG:
    days = 365 if name.startswith('D') else 1825
    for tn, tv in TARGETS.items():
        dc, maxinc = KS[name]
        K = tv / dc; capnote = '' if tv <= maxinc else f'  (CAPACITY IGNORED here: ceiling is ${maxinc:,.0f}/day, so in reality impossible)'
        CFG[name]['cap'] = 1e12
        pr(f"[{name}] {tn}: K=${K:,.0f}{capnote}")
        for s0 in STARTS:
            for dep in DEPS:
                if name.startswith('D') and dep == 25: continue
                mu, W, reach, killed, ruin, mdd = run(name, s0, dep, days, K)
                pr(f"   ${s0:<5} +${dep:<3}/wk | P(reach) {np.mean(np.isfinite(reach)):5.1%} median {fd(q(reach,.5)):>6} fast10% {fd(q(reach,.1)):>6} | ruin {ruin.mean():5.1%} killed {killed.mean():5.1%} medMaxDD {np.median(mdd):4.0%} median final ${np.median(W):,.0f}")
for tn, tv in TARGETS.items():
    K = tv / apyd; pr(f"[B Staking] {tn}: K=${K:,.0f}")
    for s0 in STARTS:
        for dep in DEPS:
            r = staking(s0, dep, 60, K)
            pr(f"   ${s0:<5} +${dep:<3}/wk | " + ('not within 60 years' if not np.isfinite(r) else f'{r/365:.1f} years'))

pr('\n=== 2. GROWTH-OPTIMAL STAKE incl. rent 0.002 SOL (locked), min stake 0.003 SOL, tx fee 0.00003 SOL ===')
RENT, MINS, TXF = 0.002 * SOL, 0.003 * SOL, 0.00003 * SOL
def kelly_scan(sampler, C, n=60000):
    r = sampler(n); best = (0.0, 0.0)
    for s in np.linspace(MINS, max(MINS, C - RENT), 80):
        if s + RENT > C: continue
        g = np.mean(np.log(np.maximum(1e-9, 1 + (s * r - TXF) / C)))
        if g > best[1]: best = (s, g)
    return best
SAMPL = {
  'A MeanRev, posterior-predictive': lambda n: np.clip(world_A(n) + 0.06 * tnorm(4, n), -0.6, 1.5),
  'A MeanRev, central edge treated as certain': lambda n: np.clip(0.0045 + 0.06 * tnorm(4, n), -0.6, 1.5),
  'C Breakout, posterior-predictive': lambda n: np.clip(world_C(n) + 0.20 * tnorm(3, n), -0.6, 1.5),
  'D Scalp, posterior-predictive': lambda n: world_D(n) + 0.012 * tnorm(5, n),
  'D Scalp, +0.15% central treated as certain': lambda n: 0.0015 + 0.012 * tnorm(5, n),
}
for nm, f in SAMPL.items():
    pr(nm)
    for C in [0.7, 5, 30, 300, 3000]:
        s, g = kelly_scan(f, C)
        pr(f"   wallet ${C} ({C/SOL:.4f} SOL): " + (f"stake ${s:,.2f} = {100*s/C:.0f}% of wallet, growth {g*100:+.4f}%/trade" if s > 0 else f"NO BET (growth<=0; min stake+rent = ${MINS+RENT:.2f} = {100*(MINS+RENT)/C:.0f}% of wallet)"))
pr('rent effect at the real wallet: 0.0074 SOL -> one 0.003 stake + 0.002 rent = 68% of the wallet is one position; fee 0.00003 SOL on 0.003 = 1.0% extra cost per round trip.')
pr('\n--- cost sweep at wallet $300: central GROSS edge, round-trip cost 0.5/1/4% ---')
GROSS = {'A MeanRev (gross .75%/trade, 1.5/day, sd 6%)': (0.0075, 0.06, 4, 1.5),
         'C Breakout (gross 5.25%/trade, 3/day, sd 20%)': (0.0525, 0.20, 3, 3.0),
         'D Scalp (gross .65%/trade, 2880 positions/day, sd 1.2%)': (0.0065, 0.012, 5, 2880)}
for nm, (g0, sg, df, nday) in GROSS.items():
    pr(nm)
    for cost in [0.005, 0.01, 0.04]:
        mu = g0 - cost; r = mu + sg * tnorm(df, 200000)
        fs = np.linspace(0, 1, 101); gg = np.array([np.mean(np.log(np.maximum(1e-9, 1 + f * r))) for f in fs])
        i = int(np.argmax(gg)); g = gg[i]
        pr(f"   cost {cost*100:.1f}%: net {mu*100:+.2f}%/trade, Kelly f {fs[i]:.2f}, " + (f"growth {np.expm1(g*nday)*100:,.1f}%/day, doubling {np.log(2)/(g*nday):.1f} days" if g > 0 else 'NO BET (negative)'))

pr('\n=== 3. CHANCE / LOTTERY (pump.fun tiny pools) ===')
d = json.load(open('/home/user/sculps-store/.claude/skills/gmgn-fib/lab/mara/data/fwd_interim.json'))
R = []
for p in d:
    cs = [x for x in p['cs'] if x['v'] > 0]
    if len(cs) >= 4: R.append(cs[-1]['c'] / cs[3]['c'] - 1)
R = np.array(R); nh = R[R < 5]
pr(f"Mara unbiased snapshot: 180 new pools, {len(R)} traded >=4 min; buy 4th traded minute close, mark last print (upper bound)")
pr(f"   <=-90%: {np.mean(R<=-0.9):.0%}; within +-5%: {np.mean(abs(R)<=0.05):.0%}; >=+100%: {np.sum(R>=1)}/{len(R)}; one print of +805x (suspect), 7x, 2.8x; >=10x at WICK 8/68 (cannot be captured)")
pr(f"   non-jackpot (<5x) mean {nh.mean()*100:+.1f}%, n={len(nh)}")
ci = np.quantile(rng.beta(2, 68, 100000), [.025, .975]) * 100
pr(f"   capturable jackpot rate ~ 1/68 = 1.5% (Beta(2,68) mean 2.9%, 95% CI {ci[0]:.1f}%..{ci[1]:.1f}%)")
SC_P = np.array([0.0, 0.007, 0.015, 0.03]); SC_CAP = np.array([0.5, 0.25, 0.5, 0.5]); SC_W = np.array([0.25, 0.30, 0.30, 0.15])
SC_NAME = ['S0 jackpots are glitches/unsellable (p=0)', 'S1 p=0.7%, capture 25% of peak', 'S2 p=1.5% (=1/68), capture 50%', 'S3 p=3%, capture 50%']
def lworld(n):
    sc = rng.choice(4, n, p=SC_W); return SC_P[sc], SC_CAP[sc], sc
def mean_mult(cap): return 90 / np.log(10) * cap   # E of logU(10,100)*cap
def ev_s(i, cost):
    lm = (1 + nh).mean() * (1 - cost) - 1
    return SC_P[i] * (mean_mult(SC_CAP[i]) * (1 - cost) - 1) + (1 - SC_P[i]) * lm
pr('EV per ticket by scenario (jackpot = 10-100x log-uniform x capture; non-jackpot tickets from the 66 real outcomes):')
for cost in [0.03, 0.06]:
    pr(f"  round-trip cost {cost*100:.0f}%:  " + ' | '.join(f"{SC_NAME[i][:2]} {ev_s(i,cost)*100:+.1f}%" for i in range(4)) + f" | weighted(25/30/30/15) {sum(SC_W[i]*ev_s(i,cost) for i in range(4))*100:+.1f}%")
lm3 = (1 + nh).mean() * 0.97 - 1; lm6 = (1 + nh).mean() * 0.94 - 1
for cap in [0.25, 0.5]:
    for cost, lm in [(0.03, lm3), (0.06, lm6)]:
        pr(f"  break-even jackpot rate p*: capture {cap:.0%}, cost {cost*100:.0f}%: {(-lm)/(mean_mult(cap)*(1-cost)-1-lm)*100:.2f}%")
pr(f"  measured: 1 of 68 closes >=10x ({100/68:.1f}%); that one is +805x (likely a price glitch). se of p at n=68 is {np.sqrt(.015*.985/68)*100:.1f} pts, at n=2000 {np.sqrt(.015*.985/2000)*100:.2f}, n=5000 {np.sqrt(.015*.985/5000)*100:.2f}. Unbiased logger needs ~2000+ tradable pools (~5 days of births) to put p within +-0.5 pt.")
pr('--- stake per ticket: EV% is independent of stake except fixed fee 0.00003 SOL=$0.003: at $0.29 stake that is +1.0% cost, at $1 0.3%, at $5 0.06%. Fixed fee makes tickets below ~0.01 SOL ($1) worse. ---')

def lsim(start, N, phi, target, days=365, cost=0.06):
    p, capi, sc = lworld(P)
    W = np.full(P, float(start)); ruin = np.zeros(P, bool); first = np.full(P, np.inf); prof = np.zeros((P, 7)); peak = W.copy(); mdd = np.zeros(P)
    lmean = (1 + nh).mean() * (1 - cost) - 1; lsd = ((1 + nh) * (1 - cost)).std()
    for dd in range(days):
        s = np.clip(phi * W, MINS, 5.0)
        Nn = np.where(W < MINS + RENT + 0.05, 0, np.minimum(N, 0.9 * W / (s + RENT) * (1440 / 45))).astype(int)
        k = rng.binomial(Nn, p); tot = int(k.sum())
        hs = np.zeros(P)
        if tot:
            idx = np.repeat(np.arange(P), k); draws = np.exp(rng.uniform(np.log(10), np.log(100), tot)) * capi[idx]
            hs = np.bincount(idx, weights=draws * (1 - cost) - 1, minlength=P)
        nl = Nn - k
        ls = nl * lmean + np.sqrt(nl) * lsd * rng.standard_normal(P)
        pnl = s * (hs + ls) - Nn * TXF
        W = np.maximum(W + pnl, 0); prof = np.roll(prof, 1, 1); prof[:, 0] = pnl
        got = (prof.mean(1) >= target) & np.isinf(first) & (dd >= 7); first[got] = dd + 1
        peak = np.maximum(peak, W); mdd = np.maximum(mdd, 1 - W / peak); ruin |= W < 0.5
    return W, first, ruin, mdd, sc
pr('--- 3b. wallet simulation: scenario mix 25/30/30/15, round trip 6% (3% pump.fun + 3% landing/slippage on tiny curves), hold 45 min, rent locked, fee $0.003/ticket, $5/ticket cap, 365 d, no kill switch ---')
for s0 in [30, 300]:
    for N, phi in [(100, 0.01), (500, 0.01)]:
        for tn, tv in [('$1/5min', 288.0), ('$1/min', 1440.0)]:
            W, first, ruin, mdd, sc = lsim(s0, N, phi, tv)
            ok = np.isfinite(first)
            pr(f"   start ${s0} N/day {N}: {tn}: P(reach) {ok.mean():5.1%} median-of-reachers {fd(np.median(first[ok])) if ok.any() else 'n/a':>6} | P(ruin<$0.5) {ruin.mean():5.1%} | P(final>start) {np.mean(W>s0):.0%} | by scenario P(reach): " + ' '.join(f"{SC_NAME[i][:2]}={np.mean(ok[sc==i]):.0%}" for i in range(4)))
pr('ticket flow: ~29 births/min = 41,760/day x 38% tradable = ~15,900 candidate tickets/day. $5/ticket cap.')
for tn, tv in [('$1/5min', 288), ('$1/min', 1440)]:
    pr(f"   {tn}: needs EV/ticket = " + ', '.join(f"N={N}: {tv/(N*5)*100:.1f}%" for N in [1000, 3000, 15000]))

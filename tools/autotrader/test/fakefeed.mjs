// A deterministic market for tests and screenshots: one coin that breaks out, then runs.
const T0 = 1_800_000_000_000, M = 60000;
const c = (i, o, cl, h = Math.max(o, cl), l = Math.min(o, cl), v = 10) => ({ t: T0 + i * M, o, h, l, c: cl, v });
export const base = Array.from({ length: 30 }, (_, i) => c(i, 1, 1 + (i % 2 ? 0.001 : -0.001)));
export const up = [...base, c(30, 1, 1.05, 1.06, 1, 40), c(31, 1.05, 1.12, 1.13, 1.05, 60), c(32, 1.12, 1.2, 1.21, 1.12, 90)];
export const moon = [...up, c(33, 1.2, 1.5, 1.8, 1.2, 80)];
export function fakeFeed() {
  const state = { series: up, now: T0 + 33 * M };
  const pools = [
    { pool: "P1", name: "ALPHA", mint: "A".repeat(40) + "pump", created: T0, liqUsd: 9000, vol5: 100 },
    { pool: "P2", name: "BETA", mint: "B".repeat(40) + "pump", created: T0 + 5 * M, liqUsd: 800, vol5: 50 },
  ];
  state.pools = pools; state.byPool = {};
  return { state, feed: { newPools: async () => state.pools, trendingPools: async () => [], candles: async (p) => state.byPool[p] || (p === "P2" ? base : state.series) } };
}

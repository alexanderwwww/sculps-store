// Fake 1-minute charts for chartRead: a base drifting into a swing low (0.995), a clean run to 1.1005, a red pullback into the
// deep zone, a hammer at 1.030 (r 0.67), a higher low at 1.0325 on dry volume, and the live minute at P.
export const M = 60000;
export const T0 = 1_800_000_000_000 - (1_800_000_000_000 % (15 * M));
export const NOW = T0 + 240 * M + 45000;
const bar = (i, o, h, l, c, v) => ({ t: T0 + i * M, o, h, l, c, v });
export function setup(mod = {}) {
  const cs = []; let prev = 1.03;
  for (let i = 0; i < 199; i++) { const c = 1.03 - 0.028 * i / 199 + 0.002 * Math.sin(i * 1.3); cs.push(bar(i, prev, Math.max(prev, c) + 0.001, Math.min(prev, c) - 0.001, c, 50)); prev = c; }
  cs.push(bar(199, prev, Math.max(prev, 1.0) + 0.001, 0.995, 1.0, 60)); prev = 1.0;
  for (let k = 0; k < 20; k++) { const c = 1.0 + (k + 1) * 0.005; cs.push(bar(200 + k, prev, c + 0.0005, prev - 0.0005, c, 80)); prev = c; }
  for (let k = 0; k < 11; k++) { const c = 1.094 - k * 0.0055; cs.push(bar(220 + k, prev, prev, c - 0.001, c, 100)); prev = c; }
  const tail = [
    [1.0385, 1.0393, 1.030, 1.0390, 60],    // 231 hammer at the low
    [1.039, 1.0395, 1.0345, 1.035, 40],
    [1.035, 1.0395, 1.0345, 1.039, 40],
    [1.039, 1.0395, 1.0325, 1.033, 40],     // 234 the higher low
    [1.033, 1.0365, 1.0328, 1.036, 40],
    [1.036, 1.0375, 1.0355, 1.037, 40],
    [1.037, 1.0375, 1.036, 1.0365, 40],
    [1.0365, 1.0375, 1.036, 1.037, 40],
    [1.037, 1.0378, 1.0366, 1.0372, 40],    // 239
  ];
  tail.forEach(([o, h, l, c, v], k) => cs.push(bar(231 + k, o, h, l, c, v)));
  for (const [i, patch] of Object.entries(mod)) cs[i] = { ...cs[i], ...patch };
  return cs;
}
export const ticksUp = (P = 1.038, now = NOW) => [[now - 40000, 1.036], [now - 30000, 1.0365], [now - 20000, 1.037], [now - 10000, 1.0375], [now, P]];
export const ringExhausted = (now = NOW) => [170, 150, 130, 110, 90, 50, 40, 30, 20, 10].map((ago, k) => ({ t: now - ago * 1000, b: 130, s: k < 5 ? 100 : 60, p: 1.037 }));

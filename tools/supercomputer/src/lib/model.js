// Inference with the shipped coefficients (model.json). Pure functions, no browser APIs.

export const sigmoid = (z) => 1 / (1 + Math.exp(-z));

export function rawProb(hm, x) {
  let z = hm.b;
  for (let j = 0; j < x.length; j++) z += hm.w[j] * ((x[j] - hm.mu[j]) / hm.sd[j]);
  return sigmoid(z);
}

export function bandOf(hm, conf) {
  for (const b of hm.bands) if (conf >= b.lo && conf < b.hi) return b;
  return hm.bands[hm.bands.length - 1];
}

// One horizon's read. f = features() output, h = "5" | "15"
export function read(model, f, h) {
  const hm = model.horizons[h];
  const p = rawProb(hm, f.x);
  const side = p >= 0.5 ? "up" : "down";
  const conf = Math.max(p, 1 - p);
  const band = bandOf(hm, conf);
  const sd = f.s * Math.sqrt(Number(h));
  const drift = hm.drift * (p - 0.5) * sd;               // expected log move over the horizon
  const hi = f.price * Math.exp(hm.range.hi * sd), lo = f.price * Math.exp(-hm.range.lo * sd);
  return { h: Number(h), p, side, conf, band, edge: !!band.edge, drift, sd, mid: f.price * Math.exp(drift), hi, lo, price: f.price };
}

// "Stand aside" unless the band this read falls in passed out-of-sample, on two separate samples.
export function verdict(r) {
  if (!r) return { stand: true, why: "no data" };
  if (!r.edge) return { stand: true, why: `no edge at ${Math.round(r.conf * 100)}% (tested ${pct(r.band.test.hit)} on ${r.band.test.n.toLocaleString("en-US")} calls)` };
  return { stand: false, why: `edge: this band hit ${pct(r.band.test.hit)} on ${r.band.test.n.toLocaleString("en-US")} unseen calls` };
}
const pct = (x) => `${(x * 100).toFixed(1)}%`;

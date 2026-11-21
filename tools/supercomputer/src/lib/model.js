// Inference with the shipped coefficients (model.json). Pure functions, no browser APIs.
import { PATTERNS } from "./patterns.js";

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
  const pats = hm.patterns || [], x = pats.length ? f.x.concat(pats.map((nm) => (f.px ? f.px[PATTERNS.indexOf(nm)] : 0))) : f.x;
  const p = rawProb(hm, x);
  const side = p >= 0.5 ? "up" : "down";
  const conf = Math.max(p, 1 - p);
  const band = bandOf(hm, conf);
  const sd = f.s * Math.sqrt(Number(h));
  const drift = hm.drift * (p - 0.5) * sd;               // expected log move over the horizon
  const hi = f.price * Math.exp(hm.range.hi * sd), lo = f.price * Math.exp(-hm.range.lo * sd);
  // what is shown: the hit rate this band really had on the VALID period (calibrated), never the raw model number
  const shown = Math.max(0.5, band.valid ? band.valid.hit : conf);
  return { h: Number(h), p, side, conf, shown, band, edge: !!band.edge, drift, sd, mid: f.price * Math.exp(drift), hi, lo, price: f.price };
}

// "Stand aside" unless the band this read falls in passed out-of-sample, on two separate samples.
export function verdict(r) {
  if (!r) return { stand: true, why: "no data" };
  const t = r.band.test, tested = `${pct(t.hit)} right on ${t.n.toLocaleString("en-US")} unseen calls`;
  if (!r.edge && r.band.dirEdge) return { stand: true, why: `direction ${tested}, but after fees the trade lost: stand aside` };
  if (!r.edge) return { stand: true, why: `no edge, stand aside (${tested})` };
  return { stand: false, why: `edge: this band hit ${pct(r.band.test.hit)} on ${r.band.test.n.toLocaleString("en-US")} unseen calls` };
}
const pct = (x) => `${(x * 100).toFixed(1)}%`;

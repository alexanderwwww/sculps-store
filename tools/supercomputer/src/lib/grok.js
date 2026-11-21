// Grok seat: a prompt Alex copies into Grok, and a parser for the "GROK {...}" line Grok sends back.
const fmt = (x) => (x == null ? "?" : Number(x).toPrecision(6).replace(/\.?0+$/, ""));

export function prompt({ coin, price, atAthens, r5, r15, f }) {
  const side = (r) => (r ? `${r.side.toUpperCase()} ${Math.round((r.shown || r.conf) * 100)}% (range ${fmt(r.lo)} to ${fmt(r.hi)}${r.edge ? "" : ", our model has no tested edge here"})` : "n/a");
  return [
    `You are my second opinion on a short-term crypto trade on Kraken. Do not be polite, be right.`,
    `Coin: ${coin}. Price now: ${fmt(price)} USD. Time: ${atAthens} Athens.`,
    `Our model's read: next 5 min ${side(r5)}; next 15 min ${side(r15)}.`,
    f ? `Context: last 60 min high ${fmt(f.hi60)} low ${fmt(f.lo60)}; last 4 h high ${fmt(f.hi240)} low ${fmt(f.lo240)}.` : "",
    `Question: will ${coin} be higher or lower in 5 minutes and in 15 minutes? If there is a trade, where is the entry, stop-loss and take-profit? Use live data and news if you can.`,
    `Answer in plain words, then end with ONE line exactly like this (numbers, no units):`,
    `GROK {"coin":"${coin}","h5":"up|down|flat","p5":0.55,"h15":"up|down|flat","p15":0.55,"entry":0,"stop":0,"tp":0,"note":"one short reason"}`,
  ].filter(Boolean).join("\n");
}

const side = (s) => { const v = String(s || "").toLowerCase(); return v.startsWith("u") || v === "long" || v === "buy" ? "up" : v.startsWith("d") || v === "short" || v === "sell" ? "down" : v ? "flat" : null; };
const num = (x) => { if (x == null || x === "") return null; const n = Number(String(x).replace(/[$,%\s]/g, "")); return Number.isFinite(n) && n !== 0 ? n : null; };
const prob = (x) => { const n = num(x); if (n == null) return null; const p = n > 1 ? n / 100 : n; return p >= 0 && p <= 1 ? p : null; };

// Finds the last "GROK {...}" in pasted text (Grok often wraps it in ``` or bold). Returns null if none parse.
export function parse(text) {
  const t = String(text || "").replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  const starts = [...t.matchAll(/GROK\W{0,6}\{/gi)].map((m) => m.index + m[0].length - 1);
  for (const s of starts.reverse()) {
    let depth = 0, end = -1;
    for (let i = s; i < t.length; i++) { if (t[i] === "{") depth++; else if (t[i] === "}") { depth--; if (!depth) { end = i; break; } } }
    if (end < 0) continue;
    let raw = t.slice(s, end + 1).replace(/\*\*/g, "").replace(/,\s*}/g, "}");
    let j; try { j = JSON.parse(raw); } catch { try { j = JSON.parse(raw.replace(/'/g, '"')); } catch { continue; } }
    const out = { coin: j.coin ? String(j.coin) : null, h5: side(j.h5), p5: prob(j.p5), h15: side(j.h15), p15: prob(j.p15),
      entry: num(j.entry), stop: num(j.stop), tp: num(j.tp), note: j.note ? String(j.note).slice(0, 160) : "" };
    if (!out.h5 && !out.h15) continue;
    return out;
  }
  return null;
}

// Live wall screens: canvas textures redrawn from state. Every number comes from state; missing = "—".
import * as THREE from "three";

export class Screen {
  constructor(w, h, px = 1024, frame = true, glow = 1) {
    this.c = document.createElement("canvas"); this.c.width = px; this.c.height = Math.round((px * h) / w); this.g = this.c.getContext("2d");
    this.tex = new THREE.CanvasTexture(this.c); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 8;
    const mat = new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false, color: new THREE.Color(glow, glow, glow) });
    this.mesh = new THREE.Group();
    const front = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); front.position.z = 0.06; this.mesh.add(front);
    if (frame) { const f = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, h + 0.5, 0.1), new THREE.MeshStandardMaterial({ color: 0xc9962a, metalness: 0.7, roughness: 0.35 })); f.castShadow = true; this.mesh.add(f); }
    this.front = front; this.W = this.c.width; this.H = this.c.height;
  }
  back() { const b = new THREE.Mesh(this.front.geometry, this.front.material); b.rotation.y = Math.PI; b.position.z = -0.06; this.mesh.add(b); return this; }
  draw(fn) { const g = this.g; g.save(); fn(g, this.W, this.H); g.restore(); this.tex.needsUpdate = true; }
  dispose() { this.tex.dispose(); this.front.material.dispose(); }
}

const F = (px, w = 600) => `${w} ${px}px -apple-system, "Segoe UI", Inter, Roboto, sans-serif`;
const SER = (px) => `700 ${px}px Cinzel, Georgia, serif`;
export function bg(g, W, H, title, sub) {
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, "#0d1b33"); gr.addColorStop(1, "#08101f"); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.strokeStyle = "rgba(94,240,255,.08)"; g.lineWidth = 1; for (let x = 0; x < W; x += W / 24) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); } for (let y = 0; y < H; y += W / 24) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  const u = W / 100;
  g.fillStyle = "#f3d27a"; g.font = SER(u * 3.6); g.textBaseline = "top"; g.fillText(title, u * 3, u * 2.4);
  if (sub) { g.fillStyle = "#8fe9ff"; g.font = F(u * 2); g.textAlign = "right"; g.fillText(sub, W - u * 3, u * 3.4); g.textAlign = "left"; }
  g.fillStyle = "rgba(243,210,122,.5)"; g.fillRect(u * 3, u * 7.6, W - u * 6, 2);
  return u;
}
export const col = (v) => (typeof v === "number" ? (v > 0 ? "#4ade80" : v < 0 ? "#f87171" : "#e5e7eb") : "#9ca3af");
export function txt(g, s, x, y, px, color = "#e8eef6", w = 600, maxW) { g.fillStyle = color; g.font = F(px, w); g.textBaseline = "top"; if (maxW) { let t = String(s); while (g.measureText(t).width > maxW && t.length > 2) t = t.slice(0, -2); if (t !== String(s)) t += "…"; g.fillText(t, x, y); } else g.fillText(String(s), x, y); }
export function wrap(g, s, x, y, px, maxW, lines = 3, color = "#e8eef6") {
  g.font = F(px, 500); g.fillStyle = color; const words = String(s).split(/\s+/); let line = "", n = 0;
  for (const w of words) { const t = line ? line + " " + w : w; if (g.measureText(t).width > maxW && line) { g.fillText(line, x, y + n * px * 1.25); line = w; if (++n >= lines) return n; } else line = t; }
  if (line) g.fillText(line, x, y + n++ * px * 1.25); return n;
}
const LC = { VERIFIED: "#22c55e", REPORTED: "#38bdf8", CLAIMED: "#f59e0b", INFERRED: "#a78bfa" };

// ---- the giant WALLET screen ----
export function drawWallet(scr, s, A, hist) {
  const { fSol, fPct, ago } = A.fmt;
  scr.draw((g, W, H) => {
    const u = bg(g, W, H, "WALLET", s ? `${s.mode || "—"} · ${s.killSwitch ? "KILL SWITCH ON" : "trading allowed"}` : "no data");
    if (!s) { txt(g, "Waiting for the engine…", u * 3, u * 12, u * 4); return; }
    txt(g, "EQUITY", u * 3, u * 10, u * 2, "#9fb3c8"); txt(g, fSol(s.equitySol), u * 3, u * 12.5, u * 8, "#ffffff", 700);
    const k = [["TODAY", fSol(s.pnlTodaySol, true), s.pnlTodaySol], ["TOTAL", fSol(s.pnlTotalSol, true), s.pnlTotalSol], ["OPEN", Array.isArray(s.positions) ? s.positions.length : "—", null], ["EVIDENCE", (s.trades && s.trades.evidence) || "—", null]];
    k.forEach(([l, v, c], i) => { const x = u * 3 + i * u * 24; txt(g, l, x, u * 23, u * 1.8, "#9fb3c8"); txt(g, v, x, u * 25.3, u * 3.3, c == null ? "#f3d27a" : col(c), 700, u * 23); });
    // equity line
    const x0 = u * 52, y0 = u * 10, w = W - x0 - u * 3, h = u * 11;
    g.strokeStyle = "rgba(255,255,255,.1)"; g.strokeRect(x0, y0, w, h);
    if (hist.length > 1) { const mn = Math.min(...hist), mx = Math.max(...hist), r = mx - mn || 1; g.beginPath(); hist.forEach((v, i) => { const X = x0 + (i / (hist.length - 1)) * w, Y = y0 + h - ((v - mn) / r) * h; i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.strokeStyle = "#5ef0ff"; g.lineWidth = u * 0.4; g.stroke(); }
    else txt(g, "equity line builds while you watch", x0 + u, y0 + h / 2 - u, u * 1.7, "#6b7c90");
    // positions
    txt(g, "OPEN POSITIONS", u * 3, u * 31, u * 1.9, "#f3d27a");
    const P = (s.positions || []).slice(0, 4);
    if (!P.length) txt(g, "none", u * 3, u * 34, u * 2.2, "#9ca3af");
    P.forEach((p, i) => { const y = u * 34 + i * u * 3.6; txt(g, p.symbol || "—", u * 3, y, u * 2.5, "#fff", 700); txt(g, fSol(p.sizeSol), u * 18, y, u * 2.2, "#cbd5e1"); txt(g, fPct(p.pnlPct), u * 32, y, u * 2.5, col(p.pnlPct), 700); txt(g, p.strategy || "—", u * 42, y, u * 2, "#9fb3c8"); });
    // flows
    txt(g, "MONEY MOVING", u * 52, u * 31, u * 1.9, "#f3d27a");
    const ic = { win: ["▲", "#22c55e"], loss: ["▼", "#ef4444"], fee: ["◎", "#eab308"], buy: ["↗", "#22d3ee"], sell: ["↘", "#22d3ee"] };
    (s.flows || []).slice(0, 5).forEach((f, i) => { const y = u * 34 + i * u * 3.2; const [ch, c] = ic[f.kind] || ["•", "#fff"]; txt(g, ch, u * 52, y, u * 2.4, c, 700); txt(g, (typeof f.sol === "number" ? Math.abs(f.sol).toFixed(4) : "—") + " SOL", u * 55, y, u * 2.3, c, 700); txt(g, f.label || f.kind, u * 70, y, u * 2, "#cbd5e1", 500, u * 20); txt(g, ago(f.at), W - u * 7, y, u * 1.8, "#6b7c90"); });
    // council
    const L = s.council && s.council.last;
    g.fillStyle = L ? (L.verdict === "PASS" ? "rgba(34,197,94,.18)" : "rgba(239,68,68,.2)") : "rgba(255,255,255,.05)"; g.fillRect(u * 3, H - u * 9, W - u * 6, u * 6.5);
    txt(g, "COUNCIL", u * 4.5, H - u * 7.8, u * 1.7, "#9fb3c8");
    txt(g, L ? `${L.verdict}  ${L.symbol || ""}  ·  ${L.reason || ""}${L.number != null ? "  ·  " + L.number : ""}` : "no verdict yet", u * 15, H - u * 8, u * 2.6, L ? (L.verdict === "PASS" ? "#4ade80" : "#f87171") : "#9ca3af", 700, W - u * 20);
  });
}
// ---- the giant X screen ----
export function drawX(scr, s, A) {
  const { ago } = A.fmt;
  scr.draw((g, W, H) => {
    const xf = A.xFeed(s); const gk = s && s.helpers && s.helpers.grok;
    const on = gk && (gk === "connected" || gk.status === "connected" || gk.lastAt);
    const u = bg(g, W, H, "X · THE MARKET IS SAYING", on ? "Grok · live X search" : "Grok not connected");
    if (!xf.length) { txt(g, on ? "Grok is connected. No messages yet." : "Grok not connected", u * 3, u * 14, u * 4.2, "#9ca3af", 600); txt(g, "Messages appear here with their label: VERIFIED · REPORTED · CLAIMED · INFERRED", u * 3, u * 21, u * 2, "#6b7c90", 500); return; }
    let y = u * 10.5;
    for (const m of xf.slice(0, 6)) {
      if (y > H - u * 7) break;
      const lab = m.label ? String(m.label).toUpperCase() : null;
      if (lab) { g.fillStyle = LC[lab] || "#64748b"; g.font = F(u * 1.7, 800); const tw = g.measureText(lab).width; g.fillRect(u * 3, y, tw + u * 1.6, u * 2.6); txt(g, lab, u * 3.8, y + u * 0.4, u * 1.7, "#0b1022", 800); }
      txt(g, `${m.dept ? (A.DEPTS.find((d) => d[0] === m.dept) || [0, m.dept])[1] + " · " : ""}${ago(m.at)}`, u * 20, y + u * 0.3, u * 1.8, "#8fe9ff", 500);
      const n = wrap(g, m.text, u * 3, y + u * 3.4, u * 2.7, W - u * 6, 2, "#f1f5f9");
      y += u * 3.4 + n * u * 3.4 + u * 2;
    }
  });
}
// ---- the big HQ wall: portfolio + neurons ----
export function drawNeurons(scr, s, A) {
  const { fSol, ago } = A.fmt;
  scr.draw((g, W, H) => {
    const u = bg(g, W, H, "PORTFOLIO · NEURONS", s ? `updated ${ago(s.updatedAt)} ago` : "");
    if (!s) return;
    const T = s.trades || {};
    [["EQUITY", fSol(s.equitySol)], ["TOTAL", fSol(s.pnlTotalSol, true)], ["TRADES", T.n ?? "—"], ["WIN RATE", typeof T.winRate === "number" ? (T.winRate * (T.winRate <= 1 ? 100 : 1)).toFixed(0) + "%" : "—"], ["95% CI", Array.isArray(T.ci95) ? T.ci95.map((v) => (typeof v === "number" ? v.toFixed(1) + "%" : "—")).join(" … ") : "—"], ["EVIDENCE", T.evidence || "—"]]
      .forEach(([l, v], i) => { const x = u * 3 + (i % 3) * u * 31, y = u * 10 + Math.floor(i / 3) * u * 7; txt(g, l, x, y, u * 1.7, "#9fb3c8"); txt(g, v, x, y + u * 2.2, u * 3, "#fff", 700, u * 29); });
    txt(g, "RECIPE SCOREBOARD", u * 3, u * 25, u * 1.9, "#f3d27a");
    (s.strategies || []).slice(0, 5).forEach((r, i) => { const y = u * 28 + i * u * 3.3; txt(g, r.id, u * 3, y, u * 2.3, r.alive === false ? "#6b7280" : "#fff", 700); txt(g, r.name || "—", u * 9, y, u * 2.1, "#cbd5e1", 500, u * 24); txt(g, r.status || (r.alive === false ? "killed" : "alive"), u * 34, y, u * 1.9, r.alive === false ? "#f87171" : "#4ade80"); txt(g, fSol(r.pnlSol, true), u * 46, y, u * 2.1, col(r.pnlSol), 700); });
    txt(g, "WHAT THE BRAIN LEARNED", u * 62, u * 25, u * 1.9, "#f3d27a");
    let y = u * 28; for (const b of (s.brain || []).slice(0, 4)) { const n = wrap(g, b.text, u * 62, y, u * 1.9, W - u * 65, 2, "#e2e8f0"); y += n * u * 2.4 + u * 1.2; }
    // neuron graph
    const cx = W * 0.5, cy = H - u * 9, deps = s.departments || [];
    deps.forEach((d, i) => { const x = u * 6 + (i / Math.max(1, deps.length - 1)) * (W - u * 12); const busy = (d.workers || []).filter((w) => w.status === "busy").length;
      g.strokeStyle = `rgba(94,240,255,${0.15 + busy / 24})`; g.lineWidth = 2; g.beginPath(); g.moveTo(x, cy); g.lineTo(cx, cy - u * 5); g.stroke();
      g.fillStyle = d.live ? "#5ef0ff" : "#475569"; g.beginPath(); g.arc(x, cy, u * (0.8 + busy / 10), 0, 7); g.fill(); txt(g, (d.name || d.id).slice(0, 10), x - u * 3, cy + u * 1.6, u * 1.3, "#94a3b8", 500); });
    g.fillStyle = "#f3d27a"; g.beginPath(); g.arc(cx, cy - u * 5, u * 1.3, 0, 7); g.fill();
  });
}
// ---- one department's wall screen ----
export function drawDept(scr, s, A, id, page = 0) {
  const { ago } = A.fmt;
  const nm = (A.DEPTS.find((d) => d[0] === id) || [0, id])[1];
  scr.draw((g, W, H) => {
    const d = s && (s.departments || []).find((x) => x.id === id);
    const u = bg(g, W, H, nm.toUpperCase(), d ? `${d.live ? "LIVE" : "idle"} · last run ${ago(d.lastRunAt)} ago` : "no data");
    if (!d) { txt(g, "—", u * 3, u * 12, u * 4); return; }
    const ws = d.workers || []; const half = Math.ceil(ws.length / 2);
    ws.forEach((w, i) => { const c = i < half ? 0 : 1, r = i < half ? i : i - half; const x = u * 3 + c * u * 48, y = u * 10 + r * u * 4.6;
      g.fillStyle = w.status === "busy" ? "#22c55e" : w.status === "blocked" ? "#ef4444" : "#64748b"; g.beginPath(); g.arc(x + u, y + u * 1.3, u * 0.8, 0, 7); g.fill();
      txt(g, w.name, x + u * 3, y, u * 2, "#fff", 700, u * 16); txt(g, w.job, x + u * 19, y + u * 0.2, u * 1.6, "#9fb3c8", 500, u * 26); txt(g, w.note || w.status, x + u * 3, y + u * 2.4, u * 1.5, w.status === "blocked" ? "#fca5a5" : "#8fe9ff", 500, u * 42); });
    const sk = d.skills || []; txt(g, "SKILLS  " + (sk.length ? sk.join(" · ") : "—"), u * 3, H - u * 4.5, u * 1.7, "#f3d27a", 600, W - u * 6);
  });
}
// ---- dept-specific data screen (positions/flows/council/market/brain/helpers) ----
export function drawData(scr, s, A, kind) {
  const { fSol, fPct, fUsd, ago } = A.fmt;
  const titles = { council: "VETOES · LAST 10", execution: "POSITIONS · FILLS", costs: "FEES PAID", review: "JOURNAL", learning: "BRAIN · LESSONS", news: "MARKET SQUARE", scouts_sol: "TRENDING · SOLANA", scouts_stocks: "MAJORS", whales: "X · WHALE TALK", setups: "STRATEGIES", risk: "RISK · LIMITS", ops: "HELPERS · HEALTH", embassy: "GROK · CHATGPT" };
  scr.draw((g, W, H) => {
    const u = bg(g, W, H, titles[kind] || kind.toUpperCase(), "");
    if (!s) return;
    let y = u * 10.5; const line = (cells) => { cells.forEach(([t, x, c, w, mw]) => txt(g, t, u * x, y, u * 2.1, c || "#e2e8f0", w || 600, mw ? u * mw : undefined)); y += u * 3.3; };
    if (kind === "council") { const v = (s.council && s.council.vetoes) || []; if (!v.length) line([["no verdicts yet", 3, "#9ca3af"]]); v.slice(0, 10).forEach((x) => line([[x.verdict, 3, x.verdict === "PASS" ? "#4ade80" : "#f87171", 800], [x.symbol || "—", 14, "#fff", 700], [x.reason || "—", 27, "#cbd5e1", 500, 55], [x.number ?? "—", 84, "#f3d27a"]])); }
    else if (kind === "execution" || kind === "risk") { const P = s.positions || []; if (!P.length) line([["no open positions", 3, "#9ca3af"]]); P.slice(0, 6).forEach((p) => line([[p.symbol || "—", 3, "#fff", 700], [fSol(p.sizeSol), 20], [fPct(p.pnlPct), 40, col(p.pnlPct), 700], [`stop ${fPct(p.stopPct, false)}`, 55, "#fca5a5"], [`target ${fPct(p.targetPct, false)}`, 75, "#86efac"]]));
      y += u; (s.recent || []).slice(0, 4).forEach((r) => line([[r.side || "—", 3, "#8fe9ff"], [r.symbol || "—", 14, "#fff", 700], [fSol(r.pnlSol, true), 30, col(r.pnlSol), 700], [r.reason || "—", 52, "#cbd5e1", 500, 40]]));
      if (kind === "risk") line([[s.killSwitch ? "KILL SWITCH ON" : "kill switch off", 3, s.killSwitch ? "#f87171" : "#4ade80", 800]]); }
    else if (kind === "costs") { const f = (s.flows || []).filter((x) => x.kind === "fee"); if (!f.length) line([["no fees yet", 3, "#9ca3af"]]); f.slice(0, 9).forEach((x) => line([[(typeof x.sol === "number" ? Math.abs(x.sol).toFixed(4) : "—") + " SOL", 3, "#facc15", 700], [x.label || "fee", 26, "#e2e8f0", 500, 50], [ago(x.at), 85, "#6b7c90"]])); }
    else if (kind === "review" || kind === "learning") { const b = (s.brain || []).filter((x) => kind === "learning" || x.dept === "review" || true); if (!b.length) line([["nothing learned yet", 3, "#9ca3af"]]); for (const x of b.slice(0, 6)) { const n = wrap(g, x.text, u * 3, y, u * 2.2, W - u * 6, 2); txt(g, `${x.dept || ""} · ${ago(x.at)}`, u * 3, y + n * u * 2.7, u * 1.6, "#8fe9ff", 500); y += n * u * 2.7 + u * 3; } }
    else if (kind === "news" || kind === "scouts_sol" || kind === "scouts_stocks") { const m = s.market || {};
      line([["SOL", 3, "#9fb3c8"], [m.sol ? fUsd(m.sol.price) : "—", 12, "#fff", 700], [m.sol ? fPct(m.sol.ch24) : "—", 30, col(m.sol && m.sol.ch24), 700], ["BTC", 50, "#9fb3c8"], [m.btc ? fUsd(m.btc.price) : "—", 58, "#fff", 700], [m.btc ? fPct(m.btc.ch24) : "—", 80, col(m.btc && m.btc.ch24), 700]]);
      line([["FEAR & GREED", 3, "#9fb3c8"], [m.fearGreed ? `${m.fearGreed.value} · ${m.fearGreed.label}` : "—", 26, "#f3d27a", 700]]); y += u;
      const tr = m.trending || []; if (!tr.length) line([["no trending list", 3, "#9ca3af"]]); tr.slice(0, 6).forEach((t) => line([[t.symbol, 3, "#fff", 700], [fPct(t.ch1h), 24, col(t.ch1h), 700], [fUsd(t.liqUsd), 44, "#cbd5e1"], [t.boosted ? "BOOSTED (paid)" : "", 66, "#f59e0b", 700]])); }
    else if (kind === "whales") { drawX({ draw: (fn) => fn(g, W, H) }, s, A); }
    else if (kind === "setups") { (s.strategies || []).slice(0, 6).forEach((r) => line([[r.id, 3, "#fff", 800], [r.name || "—", 11, "#e2e8f0", 500, 34], [r.status || "—", 48, r.alive === false ? "#f87171" : "#4ade80"], [`${r.trades ?? "—"} trades`, 64, "#9fb3c8"], [fSol(r.pnlSol, true), 80, col(r.pnlSol), 700]])); if (!(s.strategies || []).length) line([["no strategies reported", 3, "#9ca3af"]]); }
    else if (kind === "ops" || kind === "embassy") { const hp = s.helpers || {}; for (const k of ["grok", "chatgpt"]) { const o = hp[k] == null ? null : typeof hp[k] === "string" ? { status: hp[k] } : hp[k]; const on = o && (o.status === "connected" || o.lastAt);
        line([[k === "grok" ? "GROK" : "CHATGPT", 3, "#f3d27a", 800], [on ? "connected" : o ? o.status || "not connected" : "—", 22, on ? "#4ade80" : "#9ca3af", 700], [o && o.lastAt ? ago(o.lastAt) + " ago" : "", 50, "#6b7c90"]]);
        if (o && o.lastText) { const n = wrap(g, (o.label ? "[" + o.label + "] " : "") + o.lastText, u * 3, y, u * 2.1, W - u * 6, 3); y += n * u * 2.7 + u; } y += u; }
      if (kind === "ops") (s.tools || []).slice(0, 5).forEach((t) => line([[t.name, 3, "#fff", 700], [t.status, 30, t.status === "connected" ? "#4ade80" : "#9ca3af"], [t.licence || "—", 50, "#9fb3c8"]])); }
  });
}
export function drawTicker(scr, s, A, off) { // the stoa's scrolling band
  scr.draw((g, W, H) => { g.fillStyle = "#081226"; g.fillRect(0, 0, W, H); const m = (s && s.market) || {};
    const items = [["SOL", m.sol], ["BTC", m.btc], ...(m.trending || []).map((t) => [t.symbol, { price: t.liqUsd, ch24: t.ch1h, liq: true }])];
    let x = -off % W; g.font = `700 ${H * 0.55}px -apple-system,Segoe UI,sans-serif`; g.textBaseline = "middle";
    const str = items.map(([n, o]) => `${n} ${o ? (o.liq ? "liq " : "") + A.fmt.fUsd(o.price) + " " + A.fmt.fPct(o.ch24) : "—"}`).join("   ◆   ") || "no market data";
    const w = g.measureText(str + "   ◆   ").width || W;
    for (let k = 0; k < 3; k++) { g.fillStyle = "#f3d27a"; g.fillText(str + "   ◆   ", x + k * w, H / 2); }
  });
}

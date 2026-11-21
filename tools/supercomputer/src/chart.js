// The live chart: price as a smooth blue line, the 5- and 15-minute reads drawn ahead of "now",
// the plan's entry / stop / target, and Grok's call. Canvas, 60 fps, eased so nothing jumps.
const C = { blue: "#0A84FF", green: "#30D158", red: "#FF453A", c5: "#64D2FF", c15: "#BF5AF2", grok: "#FF9F0A", text: "rgba(235,235,245,0.55)", grid: "rgba(255,255,255,0.06)" };
const PAST = 40 * 60, AHEAD = 17 * 60;

export class Chart {
  constructor(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext("2d"); this.d = null; this.view = null; this.shown = null; this.t0 = performance.now();
    this.fmt = (x) => x.toFixed(2);
    const loop = () => { try { this.draw(); } catch (e) { /* keep animating */ } this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }
  set(d) { this.d = d; if (d.fmt) this.fmt = d.fmt; }
  size() {
    const r = this.cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    const w = Math.max(10, Math.round(r.width * dpr)), h = Math.max(10, Math.round(r.height * dpr));
    if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; }
    return { W: r.width, H: r.height, dpr };
  }
  draw() {
    const { W, H, dpr } = this.size(), g = this.ctx, d = this.d;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    if (!d || !d.hist || d.hist.length < 2 || !d.price) { this.empty(g, W, H); return; }
    const now = d.now, padR = 6, padB = 16, padT = 8, plotH = H - padB - padT;
    // eased live price: the line glides to each new tick
    this.shown = this.shown == null ? d.price : this.shown + (d.price - this.shown) * 0.12;
    const price = this.shown;
    const t1 = now - PAST, t2 = now + AHEAD, X = (t) => ((t - t1) / (t2 - t1)) * (W - padR);
    const pts = d.hist.filter((p) => p.t >= t1 && p.t < now).map((p) => [p.t, p.c]); pts.push([now, price]);
    let lo = Infinity, hi = -Infinity; const take = (v) => { if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } };
    pts.forEach((p) => take(p[1]));
    for (const r of [d.r5, d.r15]) if (r) { take(r.hi); take(r.lo); }
    if (d.plan && d.plan.ok) { take(d.plan.stop); take(d.plan.tp); }
    const pad = (hi - lo) * 0.1 || price * 0.001; lo -= pad; hi += pad;
    if (!this.view) this.view = { lo, hi };
    this.view.lo += (lo - this.view.lo) * 0.08; this.view.hi += (hi - this.view.hi) * 0.08;
    const Y = (v) => padT + (1 - (v - this.view.lo) / (this.view.hi - this.view.lo)) * plotH;
    const xn = X(now);

    // grid + time labels (Athens)
    g.strokeStyle = C.grid; g.lineWidth = 1; g.font = "500 9px -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif"; g.fillStyle = C.text; g.textAlign = "center";
    for (const k of [-30, -15, 0, 15]) {
      const t = Math.floor(now / 900) * 900 + k * 60, x = X(t); if (x < 14 || x > W - 14) continue;
      g.beginPath(); g.moveTo(x + 0.5, padT); g.lineTo(x + 0.5, H - padB); g.stroke();
      g.fillText(d.clock(t), x, H - 4);
    }
    // future zone tint
    const fz = g.createLinearGradient(xn, 0, W, 0); fz.addColorStop(0, "rgba(255,255,255,0.035)"); fz.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = fz; g.fillRect(xn, padT, W - xn, plotH);

    // reads ahead: 15 first so 5 sits on top
    for (const [r, col] of [[d.r15, C.c15], [d.r5, C.c5]]) {
      if (!r) continue;
      const te = now + r.h * 60, steps = 24, up = [], dn = [];
      for (let i = 0; i <= steps; i++) {
        const f = i / steps, t = now + f * r.h * 60, s = Math.sqrt(f);
        up.push([X(t), Y(price + (r.hi - r.price) * s)]); dn.push([X(t), Y(price + (r.lo - r.price) * s)]);
      }
      g.beginPath(); up.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); dn.reverse().forEach(([x, y]) => g.lineTo(x, y)); g.closePath();
      const gr = g.createLinearGradient(xn, 0, X(te), 0); gr.addColorStop(0, hex(col, 0.05)); gr.addColorStop(1, hex(col, r.edge ? 0.26 : 0.16));
      g.fillStyle = gr; g.fill();
      g.strokeStyle = hex(col, 0.45); g.lineWidth = 1; g.setLineDash([]); g.stroke();
      // projected path
      g.beginPath(); g.moveTo(xn, Y(price)); g.lineTo(X(te), Y(price + (r.mid - r.price)));
      g.strokeStyle = col; g.lineWidth = 1.6; g.setLineDash([3, 3]); g.stroke(); g.setLineDash([]);
      g.beginPath(); g.arc(X(te), Y(price + (r.mid - r.price)), 2.6, 0, 7); g.fillStyle = col; g.fill();
    }

    // plan levels
    if (d.plan && d.plan.ok) {
      const lv = [["TP", d.plan.tp, C.green], ["SL", d.plan.stop, C.red], ["IN", d.plan.entry, "rgba(255,255,255,0.75)"]];
      for (const [name, v, col] of lv) {
        const y = Math.round(Y(v)) + 0.5;
        g.beginPath(); g.moveTo(0, y); g.lineTo(W - padR, y); g.strokeStyle = hex(col, 0.6); g.lineWidth = 1; g.setLineDash(name === "IN" ? [2, 3] : [5, 3]); g.stroke(); g.setLineDash([]);
        label(g, 4, y, `${name} ${this.fmt(v)}`, col, "left");
      }
    }

    // detected pattern: thin lines across the past, named once
    if (d.pattern) {
      d.pattern.lines.forEach((ln, i) => {
        if (!(ln.price > this.view.lo && ln.price < this.view.hi)) return;
        const y = Math.round(Y(ln.price)) + 0.5, col = d.pattern.dir > 0 ? "rgba(48,209,88,0.5)" : "rgba(255,69,58,0.5)";
        g.beginPath(); g.moveTo(X(now - 30 * 60), y); g.lineTo(xn, y); g.strokeStyle = col; g.lineWidth = 1; g.setLineDash([1, 2]); g.stroke(); g.setLineDash([]);
        g.font = "500 9px -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif"; g.fillStyle = "rgba(235,235,245,0.6)"; g.textAlign = "left";
        g.fillText(i === 0 ? d.pattern.label : ln.label, X(now - 30 * 60) + 2, y - 3);
      });
    }
    // price line: smooth curve + soft fill
    const P = pts.map(([t, v]) => [X(t), Y(v)]);
    const path = () => { g.moveTo(P[0][0], P[0][1]); for (let i = 0; i < P.length - 1; i++) { const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2;
      g.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]); } };
    g.beginPath(); path(); g.lineTo(xn, H - padB); g.lineTo(P[0][0], H - padB); g.closePath();
    const fill = g.createLinearGradient(0, padT, 0, H - padB); fill.addColorStop(0, "rgba(10,132,255,0.28)"); fill.addColorStop(1, "rgba(10,132,255,0)");
    g.fillStyle = fill; g.fill();
    g.beginPath(); path(); g.strokeStyle = C.blue; g.lineWidth = 2; g.lineJoin = "round"; g.lineCap = "round"; g.stroke();

    // now: hairline + breathing dot
    g.beginPath(); g.moveTo(xn + 0.5, padT); g.lineTo(xn + 0.5, H - padB); g.strokeStyle = "rgba(255,255,255,0.16)"; g.setLineDash([2, 3]); g.stroke(); g.setLineDash([]);
    const ph = ((performance.now() - this.t0) % 2000) / 2000;
    g.beginPath(); g.arc(xn, Y(price), 3 + ph * 7, 0, 7); g.fillStyle = `rgba(10,132,255,${0.35 * (1 - ph)})`; g.fill();
    g.beginPath(); g.arc(xn, Y(price), 3.4, 0, 7); g.fillStyle = C.blue; g.fill(); g.lineWidth = 1.5; g.strokeStyle = "rgba(255,255,255,0.9)"; g.stroke();

    // Grok's call
    if (d.grok) {
      for (const [h, side] of [[5, d.grok.h5], [15, d.grok.h15]]) {
        const r = h === 5 ? d.r5 : d.r15; if (!r || !side || side === "flat") continue;
        const x = X(now + h * 60), y = Y(price + ((side === "up" ? r.hi : r.lo) - r.price) * 0.9);
        g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.fillStyle = C.grok; g.fillRect(-3.2, -3.2, 6.4, 6.4); g.restore();
      }
      for (const v of [d.grok.tp, d.grok.stop]) if (v && v > this.view.lo && v < this.view.hi) {
        const y = Math.round(Y(v)) + 0.5; g.beginPath(); g.moveTo(xn, y); g.lineTo(W - padR, y); g.strokeStyle = hex(C.grok, 0.7); g.setLineDash([1, 3]); g.stroke(); g.setLineDash([]);
      }
    }
    // price tag at the right edge
    label(g, W - padR - 2, Y(price), this.fmt(price), C.blue, "right", true);
  }
  empty(g, W, H) {
    g.fillStyle = C.text; g.font = "500 11px -apple-system, system-ui, sans-serif"; g.textAlign = "center";
    const dots = ".".repeat(1 + (Math.floor(performance.now() / 400) % 3));
    g.fillText("reading Kraken" + dots, W / 2, H / 2);
  }
}
function hex(c, a) {
  if (c.startsWith("rgba")) return c.replace(/[\d.]+\)$/, `${a})`);
  const n = parseInt(c.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}
function label(g, x, y, text, col, align, solid) {
  g.font = "600 9px -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif";
  const w = g.measureText(text).width + 10, h = 14, x0 = align === "right" ? x - w : x, y0 = Math.round(y - h / 2);
  g.beginPath(); g.roundRect(x0, y0, w, h, 7); g.fillStyle = solid ? col : "rgba(28,28,30,0.85)"; g.fill();
  if (!solid) { g.strokeStyle = hex(col, 0.55); g.lineWidth = 1; g.stroke(); }
  g.fillStyle = solid ? "#fff" : col; g.textAlign = "left"; g.textBaseline = "middle"; g.fillText(text, x0 + 5, y0 + h / 2 + 0.5); g.textBaseline = "alphabetic";
}

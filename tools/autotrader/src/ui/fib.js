// The Fibonacci widget (Alex 2026-10-30: "the app must show what's in the chart, not just numbers, because that's how you apply Fibonacci").
// Plain canvas, no libraries. Data comes from engine.status().charts: the same 30-minute swing the fib gate reads.
(() => {
  let big = null;   // the coin that is enlarged survives the re-render every 1.5 s
  const LV = { 0: "#9aa4b5", 0.236: "#7ee7ff", 0.382: "#4ade80", 0.5: "#ffc857", 0.618: "#ffc857", 0.786: "#ff9f5a", 0.886: "#ff6b7a", 1: "#9aa4b5" };
  const fp = (v) => { if (v == null) return "–"; const a = Math.abs(v); return a >= 1 ? v.toFixed(4) : a >= 0.001 ? v.toPrecision(4) : v.toExponential(3); };
  function draw(cv, c) {
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 300, H = cv.clientHeight || 190;
    cv.width = W * dpr; cv.height = H * dpr; const g = cv.getContext("2d"); g.scale(dpr, dpr); g.clearRect(0, 0, W, H);
    const cs = c.cs || [], ticks = (c.ticks || []).filter((x) => x[1] != null);
    const vals = [...cs.flatMap((k) => [k.h, k.l]), ...ticks.map((x) => x[1]), c.lo, c.hi, c.entry, c.stop, ...(c.takes || []), c.price].filter((v) => v != null && isFinite(v));
    if (!vals.length) return;
    let mn = Math.min(...vals), mx = Math.max(...vals); const pad = (mx - mn || mx * 0.01 || 1) * 0.06; mn -= pad; mx += pad;
    const small = W < 420, FS = small ? 9 : 10; g.font = `${FS}px ui-monospace, Menlo, monospace`;
    const R = 16 + Math.max(60, ...[...(c.levels || []).map((lv) => `${lv.r} ${fp(lv.p)}`), `now ${fp(c.price)}`].map((t) => g.measureText(t).width)), L = 4, T = 6, B = 6, pw = W - L - R, phh = H - T - B;
    const y = (v) => T + (1 - (v - mn) / (mx - mn)) * phh;
    const t0 = cs.length ? cs[0].t : ticks.length ? ticks[0][0] : 0, t1 = Math.max(cs.length ? cs[cs.length - 1].t + 60000 : 0, ticks.length ? ticks[ticks.length - 1][0] : 0, t0 + 60000);
    const x = (t) => L + ((t - t0) / (t1 - t0)) * pw;
    g.font = `${FS}px ui-monospace, Menlo, monospace`; g.textBaseline = "middle";
    // the buy zone, shaded
    if (c.zone && c.zone.top != null) { const a = y(c.zone.top), b = y(c.zone.bottom); g.fillStyle = "rgba(255,200,87,.12)"; g.fillRect(L, Math.min(a, b), pw, Math.abs(b - a)); }
    // fib levels with ratio and price (labels are laid out last, so none hides another)
    const right = [], left = [];
    for (const lv of c.levels || []) {
      if (lv.p == null) continue; const yy = Math.round(y(lv.p)) + 0.5, col = LV[lv.r] || "#9aa4b5";
      g.strokeStyle = col; g.globalAlpha = 0.55; g.setLineDash(lv.r === 0 || lv.r === 1 ? [] : [3, 3]); g.beginPath(); g.moveTo(L, yy); g.lineTo(L + pw, yy); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
      right.push({ y: yy, text: `${lv.r} ${fp(lv.p)}`, col, box: false });
    }
    // candles
    const cw = Math.max(1.5, (pw / Math.max(1, (t1 - t0) / 60000)) * 0.62);
    for (const k of cs) {
      const cx = x(k.t + 30000), up = k.c >= k.o; g.strokeStyle = g.fillStyle = up ? "#4ade80" : "#ff6b7a";
      g.beginPath(); g.moveTo(cx, y(k.h)); g.lineTo(cx, y(k.l)); g.stroke();
      const top = y(Math.max(k.o, k.c)), h = Math.max(1, Math.abs(y(k.o) - y(k.c))); g.fillRect(cx - cw / 2, top, cw, h);
    }
    // live ticks
    if (ticks.length > 1) { g.strokeStyle = "rgba(126,231,255,.9)"; g.lineWidth = 1.2; g.beginPath(); ticks.forEach(([t, v], i) => (i ? g.lineTo(x(t), y(v)) : g.moveTo(x(t), y(v)))); g.stroke(); g.lineWidth = 1; }
    // the swing anchors: low -> high, the line a trader drags the tool along
    if (c.loT != null && c.hiT != null) {
      const ax = x(c.loT + 30000), ay = y(c.lo), bx = x(c.hiT + 30000), by = y(c.hi);
      g.strokeStyle = "rgba(255,255,255,.7)"; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke(); g.setLineDash([]);
      for (const [px, py] of [[ax, ay], [bx, by]]) { g.fillStyle = "#fff"; g.beginPath(); g.arc(px, py, 3, 0, 7); g.fill(); }
    }
    // the trade: entry, stop, take, and the price now
    const hl = (v, col, label, dash) => { if (v == null) return; const yy = Math.round(y(v)) + 0.5; g.strokeStyle = col; g.setLineDash(dash || []); g.lineWidth = 1.4; g.beginPath(); g.moveTo(L, yy); g.lineTo(L + pw, yy); g.stroke(); g.setLineDash([]); g.lineWidth = 1;
      left.push({ y: yy, text: label, col, box: true }); };
    hl(c.entry, "#a78bfa", `entry ${fp(c.entry)}`);
    hl(c.stop, "#ff6b7a", `stop ${fp(c.stop)}`, [6, 3]);
    (c.takes || []).forEach((v) => hl(v, "#4ade80", `take +5% ${fp(v)}`, [6, 3]));
    if (c.price != null) { const yy = Math.round(y(c.price)) + 0.5; g.strokeStyle = "#eef2f7"; g.setLineDash([1, 2]); g.beginPath(); g.moveTo(L, yy); g.lineTo(L + pw, yy); g.stroke(); g.setLineDash([]);
      right.push({ y: yy, text: `now ${fp(c.price)}`, col: "#eef2f7", box: true }); }
    // labels: sorted by price line, pushed apart so every one is readable, with a tick back to its line when moved
    const lay = (arr, side) => {
      const h = FS + 4; arr.sort((a, b) => a.y - b.y); arr.forEach((a, i) => { a.ly = Math.max(a.y, i ? arr[i - 1].ly + h : T + h / 2); });
      for (let i = arr.length - 1; i >= 0; i--) a_fix(arr, i, h);
      for (const a of arr) {
        const tw = g.measureText(a.text).width + 8, x0 = side === "r" ? L + pw + 8 : L + 10;
        if (Math.abs(a.ly - a.y) > 1) { g.strokeStyle = a.col; g.globalAlpha = 0.8; g.beginPath(); g.moveTo(side === "r" ? L + pw : L, a.y); g.lineTo(side === "r" ? x0 - 1 : x0, a.ly); g.stroke(); g.globalAlpha = 1; }
        if (a.box) { g.fillStyle = a.col; g.fillRect(x0 - 2, a.ly - h / 2 + 1, tw - 2, h - 2); g.fillStyle = "#06070a"; } else { g.fillStyle = "rgba(6,7,10,.75)"; g.fillRect(x0 - 2, a.ly - h / 2 + 1, tw - 2, h - 2); g.fillStyle = a.col; }
        g.fillText(a.text, x0 + 2, a.ly);
      }
    };
    const a_fix = (arr, i, h) => { const max = i === arr.length - 1 ? H - B - h / 2 : arr[i + 1].ly - h; if (arr[i].ly > max) arr[i].ly = max; };
    lay(right, "r"); lay(left, "l");
  }
  function panel(charts) {
    const sec = document.createElement("div"); sec.className = "glass panel fib";
    sec.innerHTML = `<h2>Fibonacci <small>1-min candles · swing low → high · buy zone shaded</small></h2>`;
    const grid = document.createElement("div"); grid.className = "fib__grid"; sec.append(grid);
    if (!charts.length) { const p = document.createElement("div"); p.className = "empty"; p.textContent = "No chart yet: waiting for a coin to watch."; grid.append(p); return sec; }
    const drawAll = [];
    for (const c of charts) {
      const card = document.createElement("div"); card.className = "fib__card" + (big === c.name ? " big" : ""); card.dataset.coin = c.name;
      const b = document.createElement("b"); b.textContent = c.name; const tag = document.createElement("span"); tag.className = "tag" + (c.open ? " open" : ""); tag.textContent = c.open ? "open" : "watching";
      const cv = document.createElement("canvas"); card.append(tag, b, cv);
      card.addEventListener("click", () => { big = big === c.name ? null : c.name; const was = card.classList.contains("big"); grid.querySelectorAll(".fib__card.big").forEach((n) => n.classList.remove("big")); if (!was) card.classList.add("big"); drawAll.forEach((f) => f()); });
      if (big === c.name) grid.prepend(card); else grid.append(card);
      drawAll.push(() => draw(cv, c));
    }
    requestAnimationFrame(() => drawAll.forEach((f) => f()));
    return sec;
  }
  window.UltraFib = { panel, draw };
})();

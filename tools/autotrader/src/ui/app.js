(() => {
  const TOKEN = document.body.dataset.token, BUILD = document.body.dataset.build;
  const app = document.getElementById("app");
  let S = null, busy = false, msg = null;

  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "class") n.className = v; else if (k === "text") n.textContent = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v); else if (v === true) n.setAttribute(k, ""); else if (v !== false && v != null) n.setAttribute(k, v);
    }
    for (const c of kids.flat()) if (c != null) n.append(c.nodeType ? c : document.createTextNode(String(c)));
    return n;
  };
  const api = async (path, body) => {
    const r = await fetch(path, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json", "x-ultra-token": TOKEN }, body: JSON.stringify(body) });
    return r.json();
  };
  const fmt = (n, d = 4) => (n == null ? "–" : Number(n).toFixed(d));
  const pct = (x) => (x == null ? "–" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`);
  const ago = (t) => { const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 90 ? `${s}s` : s < 5400 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`; };

  async function refresh() { try { S = await api("/api/state"); } catch { S = null; } if (S && S.build && String(S.build) !== String(BUILD)) { location.reload(); return; } render(); }   // a live update landed: show it
  const act = async (path, body = {}) => { busy = true; msg = null; render(); try { const r = await api(path, body); if (!r.ok) msg = r.error; return r; } finally { busy = false; await refresh(); } };

  /* ------------------------------------------------------------ dashboard */
  function curveSvg(points) {
    const W = 600, H = 120;
    if (!points || points.length < 2) return el("div", { class: "empty", text: "The curve draws itself as trades close." });
    const lo = Math.min(...points), hi = Math.max(...points), r = hi - lo || 1;
    const d = points.map((p, i) => `${(i / (points.length - 1)) * W},${H - 8 - ((p - lo) / r) * (H - 16)}`).join(" ");
    const up = points[points.length - 1] >= points[0];
    const ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg"); svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("class", "curve"); svg.setAttribute("preserveAspectRatio", "none");
    const g = document.createElementNS(ns, "linearGradient"); g.setAttribute("id", "cg"); g.setAttribute("x1", "0"); g.setAttribute("y1", "0"); g.setAttribute("x2", "0"); g.setAttribute("y2", "1");
    const col = up ? "#4ade80" : "#ff6b7a";
    g.innerHTML = `<stop offset="0" stop-color="${col}" stop-opacity=".35"/><stop offset="1" stop-color="${col}" stop-opacity="0"/>`;
    const defs = document.createElementNS(ns, "defs"); defs.append(g);
    const area = document.createElementNS(ns, "polygon"); area.setAttribute("points", `0,${H} ${d} ${W},${H}`); area.setAttribute("fill", "url(#cg)");
    const line = document.createElementNS(ns, "polyline"); line.setAttribute("points", d); line.setAttribute("fill", "none"); line.setAttribute("stroke", col); line.setAttribute("stroke-width", "2.5"); line.setAttribute("stroke-linejoin", "round"); line.setAttribute("vector-effect", "non-scaling-stroke");
    svg.append(defs, area, line); return svg;
  }
  function dashView() {
    const e = S.engine, live = S.mode === "live", unit = live ? "SOL" : "$";
    const skipsTotal = Object.values(e.whyNot || {}).reduce((a, b) => a + b, 0) || 1;
    const pnl = e.equity - e.startEq;
    const reasons = Object.entries(e.whyNot || {});
    return {
      cols: el("div", { class: "cols" },
        el("div", {},
          el("div", { class: "glass panel" }, el("h2", {}, "Equity", el("span", { class: pnl >= 0 ? "up" : "down", text: `${pnl >= 0 ? "+" : ""}${fmt(pnl, live ? 4 : 2)} ${unit}` })), curveSvg(e.curve)),
        ),
        el("div", {},
          el("div", { class: "glass panel" }, el("h2", {}, "Controls"),
            el("div", { class: "actions" },
              el("button", { text: e.paused ? "Resume buying" : "Pause buying", class: e.paused ? "go" : "", onclick: () => act("/api/pause", { paused: !e.paused }) }),
              el("button", { class: "danger", text: "Sell everything", disabled: !e.open.length, onclick: () => { if (confirm("Sell every open position now?")) act("/api/flatten"); } }),
              el("button", { text: "Stop", onclick: () => { if (confirm("Stop Ultra? Open positions stay in your Phantom wallet; press Sell everything first to sell them.")) act("/api/stop"); } })),
            e.halted ? el("p", { class: "err", text: e.halted }) : null, S.lastError ? el("p", { class: "err", text: S.lastError }) : null, msg ? el("p", { class: "err", text: msg }) : null),
          el("div", { class: "glass panel" }, el("h2", {}, "Limits"),
            ...[["Per trade", `${S.caps.fixedSol} SOL every buy`], ["Buys", `${S.caps.perHour} an hour, ${S.caps.perDay} a day`], ["Halt", `when the wallet is ${Math.round((1 - S.caps.floorFrac) * 100)}% gone`], ["Wallet", "your Phantom, swaps through Jupiter"], ["Stop / target", `${S.cfg.sl * 100}% / +${S.cfg.tp * 100}%, trailing`], ["Open at once", String(S.cfg.maxOpen)], ["Never", "Kimchi"]].map(([a, b]) => el("div", { class: "row" }, el("span", { class: "why", text: a }), el("span", { class: "v", text: b })))),
          el("div", { class: "glass panel" }, el("h2", {}, "Why it did not trade"),
            reasons.length ? reasons.map(([k, v]) => el("div", { class: "why-row" }, el("div", {}, el("span", { text: k }), el("b", { text: v })), el("div", { class: "bar" }, el("i", { style: `width:${Math.round((v / skipsTotal) * 100)}%` })))) : el("div", { class: "empty", text: "Nothing skipped yet." }),
            (e.errors || []).length ? el("p", { class: "note", text: `Feed hiccups: ${e.errors[e.errors.length - 1].w}: ${e.errors[e.errors.length - 1].msg}` }) : null))) };
  }

  /* ------------------------------------------------------------ numbers that roll, pop-ups for every fill, a burst on every win */
  function tween(node, from, to, f, ms = 650) {
    if (from === to || !isFinite(from)) { node.textContent = f(to); return; }
    const t0 = performance.now();
    const step = (t) => { const k = Math.min(1, (t - t0) / ms), e2 = 1 - Math.pow(1 - k, 3); node.textContent = f(from + (to - from) * e2); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  const fx = (() => {
    const cv = document.getElementById("fx"), ctx = cv.getContext("2d"); let parts = [], running = false;
    const size = () => { cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio; }; size(); addEventListener("resize", size);
    const loop = () => {
      ctx.clearRect(0, 0, cv.width, cv.height);
      parts = parts.filter((q) => (q.life -= 1) > 0);
      for (const q of parts) { q.vy += 0.12; q.x += q.vx; q.y += q.vy; ctx.globalAlpha = Math.min(1, q.life / 40); ctx.fillStyle = q.c; ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, 7); ctx.fill(); }
      if (parts.length) requestAnimationFrame(loop); else running = false;
    };
    return {
      burst(x, y, good) {
        const d = devicePixelRatio, cols = good ? ["#4ade80", "#a7f3d0", "#7ee7ff", "#fff"] : ["#ff6b7a", "#ffb3bb"];
        for (let i = 0; i < (good ? 90 : 30); i++) { const a = Math.random() * Math.PI * 2, s = (good ? 3 + Math.random() * 7 : 1 + Math.random() * 3) * d; parts.push({ x: x * d, y: y * d, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (good ? 4 * d : 0), r: (1.5 + Math.random() * 2.5) * d, c: cols[i % cols.length], life: 60 + Math.random() * 40 }); }
        if (!running) { running = true; requestAnimationFrame(loop); }
      },
    };
  })();
  const toasts = (() => {
    const host = document.getElementById("toasts"); let lastSeq = null;
    // the sound of money: a coin chime on every win, a soft tick on a buy (Web Audio, no files)
    let ac = null;
    const chime = (win) => { try { ac ||= new (window.AudioContext || window.webkitAudioContext)(); const t = ac.currentTime;
      const notes = win ? [1318.5, 1975.5, 2637] : [880];
      notes.forEach((f, i) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = "triangle"; o.frequency.value = f; g.gain.setValueAtTime(0, t + i * 0.09); g.gain.linearRampToValueAtTime(win ? 0.22 : 0.08, t + i * 0.09 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + (win ? 0.9 : 0.25)); o.connect(g).connect(ac.destination); o.start(t + i * 0.09); o.stop(t + i * 0.09 + 1); });
    } catch { /* no sound is never an error */ } };
    addEventListener("pointerdown", () => { try { ac ||= new (window.AudioContext || window.webkitAudioContext)(); ac.resume(); } catch {} }, { once: true });
    const pop = (ev) => {
      if (ev.type === "sell" && ev.ret >= 0) chime(true); else if (ev.type === "buy") chime(false);
      const sell = ev.type === "sell", good = sell ? ev.ret >= 0 : true;
      const t = el("div", { class: `toast ${sell ? (good ? "win" : "loss") : "buy"}` },
        el("span", { class: "toast__k", text: sell ? (good ? "WIN" : "CUT") : "BOUGHT" }),
        el("strong", { text: ev.name }),
        el("b", { text: sell ? `${ev.ret >= 0 ? "+" : ""}${(ev.ret * 100).toFixed(1)}%` : `${ev.stake != null ? Number(ev.stake).toFixed(4) : ""} SOL` }),
        el("small", { text: ev.why || "" }));
      host.prepend(t);
      const r = t.getBoundingClientRect();
      if (sell && good) fx.burst(r.left + r.width / 2, r.top + r.height / 2, true);
      if (!sell) fx.burst(r.left + 30, r.top + r.height / 2, true);
      setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 600); }, sell ? 6500 : 4500);
      while (host.children.length > 5) host.lastChild.remove();
    };
    return {
      feed(events) {
        if (!events) return;
        if (lastSeq === null) { lastSeq = events.length ? events[events.length - 1].seq : 0; return; }
        const fresh = events.filter((e) => e.seq > lastSeq && (e.type === "buy" || e.type === "sell"));
        if (events.length) lastSeq = events[events.length - 1].seq;
        fresh.slice(-4).forEach((e, i) => setTimeout(() => pop(e), 1600 + i * 500));
      },
    };
  })();
  let shownPnl = null, shownSol = null;
  /* ------------------------------------------------------------ the terminal: seven agents, one live flow, every trade with a reason (the Oct 28 video, on real data) */
  const SVGNS = "http://www.w3.org/2000/svg";
  const sv = (tag, attrs = {}) => { const n = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
  const hhmm = (t) => new Date(t).toTimeString().slice(0, 5);
  const clock = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return [s / 3600, (s % 3600) / 60, s % 60].map((x) => String(Math.floor(x)).padStart(2, "0")).join(":"); };
  const tkn = (n) => `$${String(n || "?").replace(/^\$/, "").toUpperCase().slice(0, 10)}`;
  const AG = [
    ["scan", "Scanner", "new pairs + volume spikes", "flags only, never trades", "scan"],
    ["rug", "Rug check", "filters suspicious tokens", "nothing executes before a pass", "pass"],
    ["size", "Sizer", "sizes every buy", "0.01618 SOL, every time", "idle"],
    ["exec", "Executor", "opens + closes through Jupiter", "signs with your Phantom key, checks the chain", "live"],
    ["log", "Logger", "writes every decision", "no trade without a reason", "write"],
    ["eq", "Equity", "wallet + curve", "updates on every close", "update"],
    ["you", "You", "reads the log in the morning", "stopped asking, started reading", "reading"],
  ];
  const term = (() => {
    const host = document.getElementById("termhost");
    const q = (sel) => host.querySelector(sel);
    host.innerHTML = `
      <div class="tm__bar"><i></i><i></i><i></i><span>Ultra — overnight · seven agents · log first</span><em>paper off · live</em></div>
      <div class="tm__hero">
        <div class="tm__orb"><b></b><b></b></div>
        <div class="tm__id">
          <h1>Ultra <span class="tm__ver"></span></h1>
          <div class="tm__run"><i></i><span class="tm__state">running</span> · <span class="tm__clock">00:00:00</span></div>
          <div class="tm__tape"><span></span></div>
          <small>every trade gets a reason</small>
          <div class="tm__go"></div>
        </div>
        <div class="tm__nums">
          <div><b class="tm__bal">–</b><span>balance SOL</span></div><div><b class="tm__trades">0</b><span>trades</span></div>
          <div><b class="tm__wins up">0</b><span>wins</span></div><div><b class="tm__losses down">0</b><span>losses</span></div>
        </div>
      </div>
      <div class="tm__body">
        <aside class="tm__agents"><h4>Agents <span>7 online</span></h4>${AG.map(([k, n, sub, rule, tag]) => `
          <div class="agent ag--${k}" data-k="${k}"><div class="ag__ic"><b></b><b></b></div>
            <div class="ag__tx"><strong>${n}</strong><small>${sub}</small></div><em class="ag__tag">${tag}</em>
            <p class="ag__rule">${rule}</p><p class="ag__stat">–</p></div>`).join("")}</aside>
        <section class="tm__main">
          <h4>Live flow · scan → check → size → exec → log <span class="tm__checked">checked 0</span></h4>
          <div class="tm__chips"></div>
          <div class="tm__stage">
            <svg class="tm__wires" viewBox="0 0 1000 260" preserveAspectRatio="none">
              <path class="w w1" d="M120,0 C140,60 170,90 190,120"/><path class="w w2" d="M260,130 C420,130 600,130 790,130"/><path class="w w3" d="M860,165 C880,210 900,235 920,260"/>
            </svg>
            <div class="tm__node nd--rug"><i></i><span>Rug check</span><small class="nd__sub">waiting</small></div>
            <div class="tm__chart"><div class="ch__head"><span class="ch__name">equity</span><b class="ch__ret"></b></div><svg viewBox="0 0 300 90" preserveAspectRatio="none"><path class="ch__area"/><path class="ch__line"/><circle class="ch__dot" r="3"/></svg><small>pass + size + enter</small></div>
            <div class="tm__node nd--exec"><i><b></b><b></b></i><span>Executor</span><small class="nd__sub">live</small></div>
            <div class="tm__stamp">FILTERED</div>
          </div>
          <div class="tm__tiles">
            <div class="tile t--rug"><span>Filtered</span><b class="t1">0</b><small class="t1s">0 skipped</small></div>
            <div class="tile t--size"><span>Sizer</span><b class="t2">–</b><small>SOL a trade</small></div>
            <div class="tile t--log"><span>Logger</span><b class="t3">line #0</b><small>each with a reason</small></div>
            <div class="tile t--eq"><span>Equity</span><b class="t4">–</b><small>last close</small></div>
          </div>
          <div class="tm__pair">
            <div class="tm__trade"><h4>Trade · entry vs exit <em class="tr__st">waiting</em></h4>
              <div class="tr__name"><strong>–</strong><em>long</em><b class="tr__live"></b></div>
              <dl><dt>entry</dt><dd class="tr__entry">–</dd><dt>exit</dt><dd class="tr__exit">–</dd><dt>stop / target</dt><dd class="tr__band">–</dd><dt>size</dt><dd class="tr__size">–</dd></dl>
              <p class="tr__why"><span>reason:</span> <i>–</i></p><div class="tr__sell"></div></div>
            <div class="tm__tail"><h4>$ tail -f night.log <span class="tl__n">0 lines</span></h4><div class="tl__body"></div><i class="tl__cur"></i></div>
          </div>
          <div class="tm__result"><h4>Result · start vs now <span class="rs__since"></span></h4>
            <div class="rs__row"><span>start</span><div class="rs__bar"><i class="rs__s"></i></div><b class="rs__sv">–</b></div>
            <div class="rs__row"><span>now</span><div class="rs__bar"><i class="rs__n"></i></div><b class="rs__nv">–</b></div>
            <small class="rs__wl"></small>
            <div class="rs__goal"><span>goal</span><div class="rs__bar"><i class="rs__g"></i></div><b class="rs__gv">10 SOL</b></div></div>
          <div class="tm__log"><h4>Log <span>reading the log</span></h4><div class="lg__rows"></div></div>
        </section>
      </div>`;
    const agents = Object.fromEntries([...host.querySelectorAll(".agent")].map((n) => [n.dataset.k, n]));
    const stat = (k, t) => { agents[k].querySelector(".ag__stat").textContent = t; };
    const light = (k, ms = 1400) => { const a = agents[k]; a.classList.remove("on"); void a.offsetWidth; a.classList.add("on"); clearTimeout(a._t); a._t = setTimeout(() => a.classList.remove("on"), ms); };
    const tag = (k, t) => { agents[k].querySelector(".ag__tag").textContent = t; };
    const node = (cls, kind) => { const n = q(cls); n.classList.remove("hit", "ok", "bad"); void n.offsetWidth; n.classList.add("hit", kind); };
    const stage = q(".tm__stage");
    // a glowing particle that runs along one of the wires
    const run = (sel, color, ms = 900) => new Promise((done) => {
      const path = q(sel), L = path.getTotalLength(), dot = el("i", { class: "pt", style: `--c:${color}` }); stage.append(dot);
      const box = stage.getBoundingClientRect(), t0 = performance.now();
      const step = (t) => {
        const k = Math.min(1, (t - t0) / ms), e2 = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2, p = path.getPointAtLength(L * e2);
        dot.style.left = `${(p.x / 1000) * box.width}px`; dot.style.top = `${(p.y / 260) * box.height}px`;
        if (k < 1) requestAnimationFrame(step); else { dot.remove(); done(); }
      };
      requestAnimationFrame(step);
    });
    const chip = (ev) => {
      const box = q(".tm__chips");
      const c = el("div", { class: `chip2 c--${ev.type}` }, el("strong", { text: tkn(ev.name) }), el("i"), el("small", { text: (ev.why || "").slice(0, 26) }));
      box.prepend(c); while (box.children.length > 4) box.lastChild.remove();
      return c;
    };
    const tail = (ev) => {
      const body = q(".tl__body");
      const word = { buy: "ENTER", sell: "EXIT ", block: "FILTERED", drop: "PASS ", fail: "MISS " }[ev.type] || ev.type;
      const val = ev.type === "buy" ? `size ${Number(ev.stake || 0).toFixed(4)}` : ev.type === "sell" ? `${ev.ret >= 0 ? "+" : ""}${(ev.ret * 100).toFixed(1)}%` : "not traded";
      const line = el("div", { class: `tl t--${ev.type}` }, el("b"), el("small"));
      body.append(line); while (body.children.length > 7) body.firstChild.remove();
      const full = `${hhmm(ev.at)} ${word}  ${tkn(ev.name)}  ${val}`, sub = `   ${(ev.why || "").slice(0, 60)}`;
      let i = 0; const b = line.querySelector("b"), sm = line.querySelector("small");
      const type = () => { i += 2; b.textContent = full.slice(0, i); if (i < full.length) setTimeout(type, 16); else sm.textContent = sub; };
      type();
    };
    const logRow = (ev) => {
      const rows = q(".lg__rows");
      const kind = ev.type === "buy" ? "enter" : ev.type === "sell" ? "exit" : "filtered";
      const val = ev.type === "buy" ? `${Number(ev.stake || 0).toFixed(4)} SOL` : ev.type === "sell" ? `${ev.ret >= 0 ? "+" : ""}${(ev.ret * 100).toFixed(1)}%` : "not traded";
      const r = el("div", { class: `logrow k--${kind} ${ev.type === "sell" ? (ev.ret >= 0 ? "win" : "loss") : ""}` },
        el("time", { text: hhmm(ev.at) }), el("em", { text: kind }), el("div", {}, el("strong", { text: tkn(ev.name) }), el("small", {}, el("span", { text: "reason: " }), ev.why || "–")), el("b", { text: val }));
      rows.prepend(r); while (rows.children.length > 9) rows.lastChild.remove();
    };
    const stamp = () => { const s = q(".tm__stamp"); s.classList.remove("show"); void s.offsetWidth; s.classList.add("show"); };
    // play one decision through the whole pipeline
    const play = async (ev) => {
      const c = chip(ev); light("scan", 1200);
      await run(".w1", "#f5d90a", ev.type === "drop" ? 380 : 650);
      light("rug", 1300); q(".nd--rug .nd__sub").textContent = `${ev.type === "block" || ev.type === "drop" ? "filtered" : "passed"} ${tkn(ev.name)}`;
      if (ev.type === "block") { node(".nd--rug", "bad"); stamp(); c.classList.add("dead"); stat("rug", `filtered ${tkn(ev.name)} · ${(ev.why || "").slice(0, 22)}`); tail(ev); logRow(ev); light("log"); return; }
      if (ev.type === "drop") { node(".nd--rug", "bad"); c.classList.add("dead"); q(".nd--rug .nd__sub").textContent = `filtered ${tkn(ev.name)}`; stat("scan", `filtered ${tkn(ev.name)} · ${(ev.why || "").slice(0, 24)}`); return; }   // red filter on every coin it passes on
      node(".nd--rug", "ok"); stat("rug", `passed ${tkn(ev.name)}`);
      light("size", 1100);
      await run(".w2", ev.type === "fail" ? "#ff4d6d" : "#a78bfa", 900);
      light("exec", 1600); node(".nd--exec", ev.type === "fail" ? "bad" : "ok");
      q(".nd--exec .nd__sub").textContent = ev.type === "sell" ? `closed ${tkn(ev.name)}` : ev.type === "buy" ? `long ${tkn(ev.name)}` : "missed";
      if (ev.type === "buy") stat("exec", `LONG ${tkn(ev.name)} · ${Number(ev.stake || 0).toFixed(4)} SOL`);
      if (ev.type === "sell") stat("exec", `EXIT ${tkn(ev.name)} · ${ev.why}`);
      await run(".w3", ev.type === "sell" ? (ev.ret >= 0 ? "#4ade80" : "#ff4d6d") : "#ff9f43", 600);
      light("log", 1200); tail(ev); logRow(ev);
      if (ev.type === "sell" || ev.type === "buy") { const o = q(".tm__orb"), k = /ULTRA INSTINCT/.test(ev.why || "") ? "instinct" : ev.type === "buy" ? "hunt" : ev.ret >= 0 ? "power" : "hurt"; o.classList.remove("power", "hurt", "hunt", "instinct"); void o.offsetWidth; o.classList.add(k); clearTimeout(o._t); o._t = setTimeout(() => o.classList.remove(k), k === "power" || k === "instinct" ? 4000 : 1600); }   // the face feels it
      if (ev.type === "sell") { light("eq", 1500); const r = stage.getBoundingClientRect(); fx.burst(r.right - 90, r.top + r.height / 2, ev.ret >= 0); }
      if (ev.type === "buy") { const r = stage.getBoundingClientRect(); fx.burst(r.right - 90, r.top + r.height / 2, true); }
    };
    let lastSeq = null, queue = [], playing = false, shownBal = null, shownEq = null;
    const pump = async () => { if (playing) return; playing = true; while (queue.length) { const ev = queue.shift(); try { await play(ev); } catch { /* the screen never stops the bot */ } await new Promise((r) => setTimeout(r, ev.type === "drop" ? 60 : 250)); } playing = false; };
    // idle: the scanner keeps sweeping so a quiet minute still looks alive
    setInterval(() => { if (!playing && !host.hidden) light("scan", 900); }, 2600);
    let t0 = null; setInterval(() => { if (t0) q(".tm__clock").textContent = clock(Date.now() - t0); }, 1000);
    function chart(e) {
      const o = e.open[0], pts = o && o.path && o.path.length > 1 ? o.path : (e.curve || []).map((v) => v / (e.curve[0] || 1) - 1);
      const name = o ? `${tkn(o.name)} live` : "equity", r = o ? o.ret : pts.length ? pts[pts.length - 1] : null;
      q(".ch__name").textContent = name; const rb = q(".ch__ret"); rb.textContent = r == null ? "" : `${r >= 0 ? "+" : ""}${(r * 100).toFixed(1)}%`; rb.className = `ch__ret ${r >= 0 ? "up" : "down"}`;
      const P = pts.length > 1 ? pts : [0, 0], lo = Math.min(...P), hi = Math.max(...P), W = 300, H = 90;
      const y = (v) => H - 8 - ((v - lo) / (hi - lo || 1)) * (H - 16), x = (i) => (i / (P.length - 1)) * W;
      const d = P.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
      q(".ch__line").setAttribute("d", d); q(".ch__area").setAttribute("d", `${d}L${W},${H}L0,${H}Z`);
      const dot = q(".ch__dot"); dot.setAttribute("cx", x(P.length - 1)); dot.setAttribute("cy", y(P[P.length - 1]));
      q(".tm__chart").classList.toggle("down", r != null && r < 0);
    }
    function trade(e) {
      const o = e.open[0], c = (e.recentClosed || [])[e.recentClosed.length - 1], ex = e.exits || {};
      const st = q(".tr__st");
      if (o) {
        st.textContent = "open"; st.className = "tr__st open";
        q(".tr__name strong").textContent = tkn(o.name);
        const lv = q(".tr__live"); lv.textContent = o.ret == null ? "waiting for price" : `${o.ret >= 0 ? "+" : ""}${(o.ret * 100).toFixed(1)}% live`; lv.className = `tr__live ${o.ret >= 0 ? "up" : "down"}`;
        q(".tr__entry").textContent = o.entryPx ? Number(o.entryPx).toPrecision(5) : "–"; q(".tr__exit").textContent = "open"; q(".tr__exit").className = "tr__exit up";
        q(".tr__band").textContent = `${Math.round(ex.sl * 100)}% / +${Math.round(ex.tp * 100)}%, trailing`; q(".tr__size").textContent = `${o.stake} SOL`;
        q(".tr__why i").textContent = o.enter || "–";
        // one Sell button per open position (Alex): money back out now
        const box = q(".tr__sell"); box.replaceChildren(...e.open.map((x) => el("button", { class: "danger", text: `Sell ${tkn(x.name)} ${x.ret == null ? "" : (x.ret >= 0 ? "+" : "") + (x.ret * 100).toFixed(1) + "%"}`, onclick: () => act("/api/sell", { id: x.id }) })));
      } else if (c) {
        q(".tr__sell").replaceChildren();
        st.textContent = "closed"; st.className = "tr__st";
        q(".tr__name strong").textContent = tkn(c.name);
        const lv = q(".tr__live"); lv.textContent = `${c.ret >= 0 ? "+" : ""}${c.ret.toFixed(1)}%`; lv.className = `tr__live ${c.ret >= 0 ? "up" : "down"}`;
        q(".tr__entry").textContent = "filled"; q(".tr__exit").textContent = c.why; q(".tr__exit").className = `tr__exit ${c.ret >= 0 ? "up" : "down"}`;
        q(".tr__band").textContent = `${Math.round(ex.sl * 100)}% / +${Math.round(ex.tp * 100)}%`; q(".tr__size").textContent = `${c.pnl >= 0 ? "+" : ""}${c.pnl} SOL`;
        q(".tr__why i").textContent = c.enter || "–";
      }
    }
    return {
      show(v) { host.hidden = !v; },
      update(S, e, override = null) {
        if (!t0 && e.startedAt) t0 = e.startedAt;
        q(".tm__ver").textContent = `v${BUILD}-live`;
        const chip0 = override || (e.halted ? "halted" : e.paused ? "buying paused" : "running");
        q(".tm__state").textContent = chip0; host.classList.toggle("paused", chip0 !== "running");
        const w = S.own?.address || "";
        q(".tm__tape span").textContent = `${w ? "Phantom " + w.slice(0, 4) + "…" + w.slice(-4) : "Phantom"} · signed on this Mac · Jupiter swaps · ${S.caps?.preset || "–"} SOL a buy · ${e.open.length}/${S.cfg.maxOpen} open · `.repeat(3);
        const bal = S.own?.sol ?? null;
        if (bal != null) { tween(q(".tm__bal"), shownBal ?? bal, bal, (v) => v.toFixed(4)); shownBal = bal; }
        tween(q(".tm__trades"), Number(q(".tm__trades").textContent) || 0, e.trades, (v) => String(Math.round(v)));
        tween(q(".tm__wins"), Number(q(".tm__wins").textContent) || 0, e.wins, (v) => String(Math.round(v)));
        tween(q(".tm__losses"), Number(q(".tm__losses").textContent) || 0, e.trades - e.wins, (v) => String(Math.round(v)));
        const cn = e.counts || {};
        q(".tm__checked").textContent = `checked ${(cn.drop || 0) + (cn.block || 0) + (cn.buy || 0)}`;
        stat("scan", e.next && e.next.length ? `next ${e.next.slice(0, 2).map(tkn).join(" · ")} · ${e.watching?.total || 0} pools` : `${e.watching?.total || 0} pools watched`);
        stat("size", `${S.caps?.preset || "–"} SOL a buy · ${e.open.length}/${S.cfg.maxOpen} open`);
        stat("log", `line #${e.lines || 0} · ${e.trades} closes`);
        stat("eq", `${bal != null ? bal.toFixed(4) : "–"} SOL · ${e.trades} closes`);
        stat("you", `${e.lines || 0} lines to read`);
        tag("exec", e.open.length ? "live" : "ready"); tag("size", e.open.length ? "sized" : "idle");
        q(".t1").textContent = String(cn.block || 0); q(".t1s").textContent = `${cn.drop || 0} skipped`;
        q(".t2").textContent = `${S.caps?.preset || "–"}`; q(".t3").textContent = `line #${e.lines || 0}`;
        const lc = (e.recentClosed || [])[e.recentClosed.length - 1], t4 = q(".t4");
        t4.textContent = lc ? `${lc.pnl >= 0 ? "+" : ""}${lc.pnl.toFixed(4)}` : "–"; t4.className = `t4 ${lc ? (lc.pnl >= 0 ? "up" : "down") : ""}`;
        q(".tl__n").textContent = `${e.lines || 0} lines`;
        // result: start vs now
        const s0 = e.startEq || 0, n0 = e.equity || 0, mx = Math.max(s0, n0) || 1;
        q(".rs__s").style.width = `${(s0 / mx) * 100}%`; q(".rs__n").style.width = `${(n0 / mx) * 100}%`; q(".rs__n").classList.toggle("down", n0 < s0);
        q(".rs__sv").textContent = s0.toFixed(4); tween(q(".rs__nv"), shownEq ?? n0, n0, (v) => v.toFixed(4)); shownEq = n0;
        q(".rs__wl").innerHTML = `<b class="up">${e.wins} W</b> / <b class="down">${e.trades - e.wins} L</b>`;
        q(".rs__since").textContent = t0 ? `since ${hhmm(t0)}` : "";
        // his purpose: the first goal is 10 SOL (Alex)
        // golden-spiral goals (Alex): each micro goal is the last one x 1.618, from 0.1 SOL up past 10 SOL
        { const have = (S.source === "own" ? S.own?.sol : S.sol) ?? 0, ladder = []; for (let v = 0.1; v < 13; v *= 1.618) ladder.push(+v.toFixed(4));
          const next = ladder.find((v) => v > have) ?? 10, prev = [...ladder].reverse().find((v) => v <= have) ?? 0, g = q(".rs__g");
          g.style.width = `${Math.min(100, Math.max(0, ((have - prev) / (next - prev)) * 100)).toFixed(2)}%`;
          q(".rs__gv").textContent = `${have.toFixed(4)} → ${next.toFixed(4)} SOL · step ${ladder.indexOf(next) + 1}/${ladder.length} to 10`; }
        chart(e); trade(e);
        // the decisions since the last look go through the pipeline, newest last
        const evs = e.events || [];
        if (lastSeq === null) { evs.filter((x) => x.type !== "drop").slice(-6).forEach((x) => { tail(x); logRow(x); }); lastSeq = evs.length ? evs[evs.length - 1].seq : 0; return; }
        const fresh = evs.filter((x) => x.seq > lastSeq); if (evs.length) lastSeq = evs[evs.length - 1].seq;
        const important = fresh.filter((x) => x.type !== "drop"), quiet = fresh.filter((x) => x.type === "drop").slice(-8);
        queue.push(...[...quiet, ...important].sort((a, b) => a.seq - b.seq)); if (queue.length > 14) queue = [...queue.filter((x) => x.type !== "drop"), ...queue.filter((x) => x.type === "drop").slice(-6)].sort((a, b) => a.seq - b.seq).slice(-14);
        pump();
      },
    };
  })();

  function render() {
    const keep = window.scrollY;
    const top = document.getElementById("top");
    top.replaceChildren(); app.replaceChildren();
    if (!S) { term.show(false); top.append(el("div", { class: "boot", text: "ultra is not answering" })); return; }
    const e = S.engine, live = S.mode === "live";
    const chip = !S.running ? ["off", "stopped"] : e?.halted ? ["halt", "halted"] : e?.paused ? ["paused", "buying paused"] : ["live", "live"];
    const pnl = e ? e.equity - e.startEq : 0;
    // One screen only: the terminal. No setup menu (Alex, 2026-10-29). Ultra starts itself; Start is only there after a Stop.
    top.append(el("header", { class: "glass top slim" }, el("span", { class: `chip ${chip[0]}`, text: chip[1] })));
    const idle = { open: [], trades: 0, wins: 0, events: [], counts: {}, curve: [], startEq: 0, equity: 0, recentClosed: [], lines: 0, watching: { total: 0 }, next: [] };
    const E = S.running && e ? e : idle;
    term.show(true);
    term.update(S, E, S.running && e ? null : !S.setup?.imported ? "plug in your wallet" : S.saved?.userStopped ? "stopped" : S.lastError ? `connecting… · ${S.lastError}` : "connecting…");
    const go = document.querySelector(".tm__go"); go.replaceChildren();
    if (S.running && e) { toasts.feed(e.events); app.append(dashView().cols); }
    else if (!S.setup?.imported) {
      // plug the wallet in once: the private key goes into this Mac's own secrets file and nowhere else
      const k = el("input", { type: "password", placeholder: "Paste your Phantom private key (Phantom: Settings → Manage accounts → your wallet → Show private key)", autocomplete: "off", spellcheck: "false" });
      go.append(el("div", { class: "plug" }, k, el("button", { class: "go", text: "Plug in my wallet and trade", disabled: busy, onclick: async () => { const r = await act("/api/wallet", { secret: k.value }); k.value = ""; if (r?.ok) msg = null; } })),
        el("p", { class: "note", text: "Once. The key stays on this Mac, in Ultra's own file, and is never sent anywhere. Then Ultra trades your Phantom wallet by itself through Jupiter, 0.01618 SOL every buy." }), msg ? el("p", { class: "err", text: msg }) : null);
    } else go.append(el("button", { class: "go", text: "Start real trading", disabled: busy, onclick: () => act("/api/go", { mode: "live" }) }), msg ? el("p", { class: "err", text: msg }) : null);
    window.scrollTo(0, keep);
  }
  const loop = () => { setTimeout(async () => { if (!busy && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") await refresh(); loop(); }, S && S.running ? 1500 : 3000); };
  refresh().then(loop);
})();

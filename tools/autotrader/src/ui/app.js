(() => {
  const TOKEN = document.body.dataset.token, BUILD = document.body.dataset.build;
  const app = document.getElementById("app");
  let S = null, showGmgn = false, ip = null, view = "auto", testSteps = null, busy = false, msg = null;

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
  const copy = async (text, btn) => { try { await navigator.clipboard.writeText(text); } catch { const t = el("textarea"); t.value = text; document.body.append(t); t.select(); document.execCommand("copy"); t.remove(); } const o = btn.textContent; btn.textContent = "Copied"; setTimeout(() => (btn.textContent = o), 1200); };

  async function refresh() { try { S = await api("/api/state"); } catch { S = null; } render(); }
  const act = async (path, body = {}) => { busy = true; msg = null; render(); try { const r = await api(path, body); if (!r.ok) msg = r.error; return r; } finally { busy = false; await refresh(); } };

  /* ------------------------------------------------------------ setup */
  function gmgnSteps() {
    const st = S.setup, hasKey = st.hasKeypair, hasApi = !!st.apiKey, hasW = !!st.wallet;
    const pub = el("textarea", { readonly: true, onclick: (e) => e.target.select() }); pub.value = S.setup.publicKey || "";
    const api_ = el("input", { placeholder: st.apiKey ? `API key saved (${st.apiKey}) – paste a new one to replace` : "Paste your GMGN API key", autocomplete: "off", spellcheck: "false" });
    const wal = el("input", { placeholder: "Your GMGN wallet address (Solana)", value: st.wallet || "", autocomplete: "off", spellcheck: "false" });
    if (view === "auto" && !ip) api("/api/ip").then((r) => { ip = r.ip || "unknown"; render(); });
    const btn = el("button", { class: "cy", text: hasKey ? "Show my public key again" : "Make my signing key", onclick: async () => { const r = await act("/api/keypair"); if (r.ok) { S.setup.publicKey = r.publicKey; } } });
    return el("div", { class: "steps" },
      el("div", { class: `glass step ${hasKey ? "done" : ""}` }, el("h3", { text: "Make your signing key" }), el("p", { text: "Ultra makes a key on this Mac. Only the public half is shown. The private half never leaves this computer." }), btn, hasKey ? [pub, el("button", { text: "Copy public key", onclick: (e) => copy(S.setup.publicKey, e.target) })] : null),
      el("div", { class: "glass step" }, el("h3", { text: "Create the API key on GMGN" }), el("p", { text: "Open gmgn.ai/ai, start a new API key, paste the public key from step 1, switch trading on and add this computer's address to the whitelist:" }),
        el("div", { class: "actions" }, el("button", { class: "cy", text: ip ? `Copy my IP  ${ip}` : "Finding my IP…", onclick: (e) => ip && ip !== "unknown" && copy(ip, e.target) }), el("button", { text: "Open gmgn.ai/ai", onclick: () => window.open("https://gmgn.ai/ai", "_blank") })),
        el("p", { class: "note", text: "GMGN shows the API key once you submit. Copy it." })),
      el("div", { class: `glass step ${hasApi && hasW ? "done" : ""}` }, el("h3", { text: "Paste the API key and your wallet" }), api_, wal,
        el("button", { class: "go", text: "Save", onclick: async () => { const r = await act("/api/setup", { apiKey: api_.value, wallet: wal.value }); if (r.ok) { api_.value = ""; } } }), msg ? el("p", { class: "err", text: msg }) : null),
      el("div", { class: "glass step" }, el("h3", { text: "Test everything" }), el("p", { text: "Checks the chain, GMGN and the signature. No money moves." }),
        el("button", { class: "cy", text: "Run the test", onclick: async () => { testSteps = "running"; render(); const r = await api("/api/test", {}); testSteps = r.steps; render(); } }),
        testSteps === "running" ? el("p", { class: "note", text: "Testing…" }) : (testSteps || []).map((t) => el("div", { class: "check" }, el("b", { class: t.ok ? "ok" : "no", text: t.ok ? "✓" : "✗" }), el("div", {}, t.name, el("small", { text: t.why }))))),
      el("div", { class: "glass step" }, el("h3", { text: "Start" }), el("p", { text: "Paper runs the same engine with pretend money so you can watch it work. Real trades with your GMGN wallet inside the limits on the right of the dashboard." }),
        el("div", { class: "actions" }, el("button", { class: "cy", text: "Watch it (paper)", onclick: () => act("/api/go", { mode: "paper" }) }), el("button", { class: "go", text: "Start real trading", disabled: !S.setup.ready, onclick: async () => { await act("/api/source", { source: "gmgn" }); await act("/api/go", { mode: "live" }); } }))));
  }

  function setupView() {
    const own = S.own || {}, bal = own.sol, funded = bal != null && bal >= 0.03;
    const addr = own.address || "…";
    const wd = el("input", { placeholder: "Send everything back to this address (your GMGN wallet)", autocomplete: "off", spellcheck: "false" });
    const key = el("div");
    const advanced = el("details", { class: "glass step adv", open: showGmgn || S.source === "gmgn" || undefined }, el("summary", { text: "Advanced: trade from my GMGN wallet instead (API keys)", onclick: () => { showGmgn = true; } }), showGmgn || S.source === "gmgn" ? gmgnSteps() : null);
    return el("div", { class: "steps" },
      el("div", { class: `glass step ${funded ? "done" : ""}` }, el("h3", { text: "Send SOL to Ultra" }),
        el("p", { text: "Ultra made its own wallet on this Mac. Open your GMGN wallet, press Send, paste this address and send the SOL you want Ultra to trade, plus a little extra for fees. It arrives in about a minute." }),
        el("div", { class: "addr", text: addr }),
        el("div", { class: "actions" }, el("button", { class: "cy", text: "Copy address", onclick: (e) => copy(addr, e.target) }), el("span", { class: `bal ${funded ? "up" : ""}`, text: bal == null ? "checking balance…" : `${fmt(bal, 4)} SOL in Ultra's wallet${funded ? "  ✓" : bal > 0 ? "  (needs at least 0.03)" : ""}` })),
        el("p", { class: "note", text: "Ultra trades 12% of the balance per trade, never more than 0.05 SOL. The key stays on this Mac." })),
      el("div", { class: "glass step" }, el("h3", { text: "Press start" }),
        el("p", { text: "That's all. It scans, checks every coin for rugs, buys, sells and logs the reason, with no approvals. You can watch it with pretend money first." }),
        el("div", { class: "actions" }, el("button", { class: "go", text: "Start real trading", disabled: !funded || busy, onclick: async () => { await act("/api/source", { source: "own" }); await act("/api/go", { mode: "live" }); } }), el("button", { class: "cy", text: "Watch it first (paper)", onclick: () => act("/api/go", { mode: "paper" }) })),
        msg ? el("p", { class: "err", text: msg }) : null),
      el("div", { class: "glass step" }, el("h3", { text: "Your money" }),
        el("p", { text: "It is always yours. Send it all back, or back up the wallet so you can open it in Phantom." }),
        wd, el("div", { class: "actions" },
          el("button", { text: "Send everything back", onclick: async () => { if (!wd.value.trim()) { msg = "Paste the address to send it to."; render(); return; } if (!confirm(`Send all of Ultra's SOL to ${wd.value.trim()}?`)) return; const r = await act("/api/withdraw", { to: wd.value, all: true }); if (r.ok) alert(`Sent ${r.sol} SOL.`); } }),
          el("button", { text: "Back up this wallet", onclick: async () => { if (!confirm("This shows the secret key. Anyone who has it can take the money. Only copy it somewhere private.")) return; const r = await api("/api/backup", { confirm: true }); if (r.ok) { key.replaceChildren(el("p", { class: "note", text: "Secret key (import this into Phantom or Solflare):" }), el("textarea", { readonly: true, onclick: (e) => e.target.select() }, r.secretKey)); key.firstChild.nextSibling.value = r.secretKey; } } })),
        key),
      advanced);
  }

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
    const rugN = Object.entries(e.whyNot || {}).filter(([k]) => /rug|gmgn/.test(k)).reduce((a, [, v]) => a + v, 0);
    const hot = e.lastTickAt && Date.now() - e.lastTickAt < 25000;
    const pnl = e.equity - e.startEq;
    const ag = (name, tag, n, p, h) => el("div", { class: `glass agent ${h ? "hot" : ""}` }, el("h3", {}, name, el("em", { text: tag })), el("div", { class: "n", text: n }), el("p", { text: p }));
    const feed = [
      ...(e.recentClosed || []).slice().reverse().map((c) => ({ k: "out", nm: c.name, why: `${c.why}${c.note ? " · " + c.note : ""}`, v: pct(c.ret / 100), up: c.ret >= 0 })),
      ...(e.open || []).map((o) => ({ k: "in", nm: o.name, why: o.enter, v: `${fmt(o.stake, live ? 4 : 2)} ${unit}`, t: o.since })),
      ...(e.recentSkips || []).slice().reverse().filter((x) => x.name !== "-").map((s) => ({ k: "skip", nm: s.name, why: s.why, t: s.at })),
    ].slice(0, 26);
    const reasons = Object.entries(e.whyNot || {});
    return el("div", {},
      el("div", { class: "pipe" },
        ag("Scanner", "scan", e.watching ? e.watching.total : 0, e.watching ? `pools watched · ${e.watching.ready} worth a look, ${e.watching.young} too young, ${e.watching.thin} too thin` : "starting", hot),
        ag("Rug check", e.ticks ? "pass" : "–", rugN, "coins blocked before any order", false),
        ag("Sizer", "size", `${Math.round(S.cfg.stakeFrac * 100)}%`, `of the wallet, max ${S.caps.maxSolPerTrade} SOL a trade`, false),
        ag("Executor", live ? "live" : "paper", e.open.length, live ? "GMGN signed orders, anti-MEV" : "pretend fills, real route check", e.open.length > 0),
        ag("Logger", "write", e.trades + skipsTotal, "every decision has a reason", false),
        ag("Shadow", "paper", e.edge.n ? pct(e.edge.avg) : "…", e.edge.n ? `edge over last ${e.edge.n} paper signals${e.edge.avg < -0.02 && live ? " – buys waiting" : ""}` : "learning from every signal", false),
        ag("You", "asleep", "zzz", "reads the log in the morning", false)),
      el("div", { class: "cols" },
        el("div", {},
          el("div", { class: "glass panel" }, el("h2", {}, "Equity", el("span", { class: pnl >= 0 ? "up" : "down", text: `${pnl >= 0 ? "+" : ""}${fmt(pnl, live ? 4 : 2)} ${unit}` })), curveSvg(e.curve)),
          el("div", { class: "glass panel" }, el("h2", {}, "Night log", el("span", { text: `${e.trades} closed · ${e.winRate == null ? "–" : Math.round(e.winRate * 100) + "% wins"}` })),
            feed.length ? feed.map((f) => el("div", { class: "row" }, el("span", { class: `tag ${f.k}`, text: f.k === "in" ? "open" : f.k === "out" ? "exit" : "skip" }), el("span", { class: "nm", text: f.nm }), el("span", { class: "why", text: f.why }), f.v ? el("span", { class: `v ${f.up === true ? "up" : f.up === false ? "down" : ""}`, text: f.v }) : null)) : el("div", { class: "empty", text: "Waiting for the first signal." }))),
        el("div", {},
          el("div", { class: "glass panel" }, el("h2", {}, "Controls"),
            el("div", { class: "actions" },
              el("button", { text: e.paused ? "Resume buying" : "Pause buying", class: e.paused ? "go" : "", onclick: () => act("/api/pause", { paused: !e.paused }) }),
              el("button", { class: "danger", text: "Sell everything", disabled: !e.open.length, onclick: () => { if (confirm("Sell every open position now?")) act("/api/flatten"); } }),
              el("button", { text: "Stop", onclick: () => { if (confirm("Stop Ultra? Open positions stay protected by GMGN's own stop and target orders.")) act("/api/stop"); } })),
            S.mode === "paper" ? el("div", { class: "actions", style: "margin-top:10px" }, el("button", { class: "go", text: "Switch to real trading", disabled: !S.setup.ready, onclick: () => { if (confirm(`Trade for real with your GMGN wallet? Max ${S.caps.maxSolPerTrade} SOL per trade.`)) act("/api/go", { mode: "live" }); } })) : null,
            e.halted ? el("p", { class: "err", text: e.halted }) : null, msg ? el("p", { class: "err", text: msg }) : null),
          el("div", { class: "glass panel" }, el("h2", {}, "Limits"),
            ...[["Per trade", `${S.caps.maxSolPerTrade} SOL max, 12% of wallet`], ["Buys", `${S.caps.perHour} an hour, ${S.caps.perDay} a day`], ["Halt", `${Math.round((1 - S.caps.floorFrac) * 100)}% below the starting balance`], ["Stop / target", `${S.cfg.sl * 100}% / +${S.cfg.tp * 100}%, trailing`], ["Open at once", String(S.cfg.maxOpen)], ["Never", "Kimchi"]].map(([a, b]) => el("div", { class: "row" }, el("span", { class: "why", text: a }), el("span", { class: "v", text: b })))),
          el("div", { class: "glass panel" }, el("h2", {}, "Why it did not trade"),
            reasons.length ? reasons.map(([k, v]) => el("div", { class: "why-row" }, el("div", {}, el("span", { text: k }), el("b", { text: v })), el("div", { class: "bar" }, el("i", { style: `width:${Math.round((v / skipsTotal) * 100)}%` })))) : el("div", { class: "empty", text: "Nothing skipped yet." }),
            (e.errors || []).length ? el("p", { class: "note", text: `Feed hiccups: ${e.errors[e.errors.length - 1].w}: ${e.errors[e.errors.length - 1].msg}` }) : null))));
  }

  function render() {
    const keep = window.scrollY;
    app.replaceChildren();
    if (!S) { app.append(el("div", { class: "boot", text: "ultra is not answering" })); return; }
    const e = S.engine, live = S.mode === "live";
    const chip = !S.running ? ["off", "stopped"] : e?.halted ? ["halt", "halted"] : e?.paused ? ["paused", "buying paused"] : live ? ["live", "live"] : ["paper", "paper"];
    const pnl = e ? e.equity - e.startEq : 0;
    app.append(el("header", { class: "glass top" },
      el("div", { class: "orb" }, el("b")), el("div", { class: "brand" }, el("h1", { text: "Ultra" }), el("small", { text: `build ${BUILD}` })),
      el("span", { class: `chip ${chip[0]}`, text: chip[1] }), el("div", { class: "grow" }),
      (S.source === "own" ? S.own?.sol : S.sol) != null ? el("div", { class: "stat" }, el("b", { text: fmt(S.source === "own" ? S.own.sol : S.sol, 4) }), el("span", { text: "wallet SOL" })) : null,
      e ? el("div", { class: "stat" }, el("b", { class: pnl >= 0 ? "up" : "down", text: `${pnl >= 0 ? "+" : ""}${fmt(pnl, live ? 4 : 2)}` }), el("span", { text: `P&L ${live ? "SOL" : "$ paper"}` })) : null,
      e ? el("div", { class: "stat" }, el("b", { text: `${e.open.length}/${S.cfg.maxOpen}` }), el("span", { text: "open" })) : null,
      !S.running || view === "setup" ? null : el("button", { text: "Setup", onclick: () => { view = "setup"; render(); } })));
    if (S.running && e && view !== "setup") app.append(dashView());
    else { if (view === "setup" && S.running) app.append(el("button", { text: "← Back to the dashboard", onclick: () => { view = "auto"; render(); } })); app.append(setupView()); }
    window.scrollTo(0, keep);
  }
  refresh(); setInterval(() => { if (!busy && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") refresh(); }, 3000);
})();

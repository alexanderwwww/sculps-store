// The mob admin app, run in the browser. Served as `(${app.toString()})()` from /static/app.js, so this function
// must not reference anything outside itself. History routing, /ui/data/* JSON, Shop Admin components.
export function app() {
  const root = document.getElementById("root");
  const BUILD = root.dataset.build, LOGO = root.dataset.logo;
  const PN = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok" };
  const PLATS = ["youtube", "instagram", "tiktok"];
  const TZ = "Europe/Athens";
  const S = { boot: null, range: "30d", plat: "all", sel: new Set(), timers: [], cache: {}, hoverVid: null };

  /* ---------- helpers ---------- */
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const fmtK = (n) => { n = Number(n || 0); const a = Math.abs(n); if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M"; if (a >= 1e3) return (n / 1e3).toFixed(a >= 1e4 ? 1 : 1).replace(/\.0$/, "") + "K"; return String(Math.round(n)); };
  const fmtUsd = (n) => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtUsd0 = (n) => { n = Number(n || 0); return n >= 1000 ? "$" + fmtK(n) : "$" + n.toLocaleString("en-US", { maximumFractionDigits: n >= 10 ? 0 : 2 }); };
  const fmt = (n, f) => (n == null ? "—" : f === "usd" ? fmtUsd(n) : f === "int" ? Number(n).toLocaleString("en-US") : fmtK(n));
  const athParts = (d) => Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(d)).map((p) => [p.type, p.value]));
  const athLocal = (d) => { const p = athParts(d); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`; };
  const whenTxt = (d) => {
    if (!d) return "";
    const ms = new Date(d) - Date.now(), a = Math.abs(ms), p = athParts(d);
    if (a < 60000) return "now";
    if (a < 3600000) return ms > 0 ? `in ${Math.round(a / 60000)}m` : `${Math.round(a / 60000)}m ago`;
    if (a < 6 * 3600000) return ms > 0 ? `in ${Math.round(a / 3600000)}h` : `${Math.round(a / 3600000)}h ago`;
    return `${p.weekday} ${p.hour}:${p.minute}`;
  };
  const dayLbl = (iso) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const ico = (d, s = 20) => `<svg width="${s}" height="${s}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"><path d="${d}"/></svg>`;
  const I = {
    home: "M3 9.5 10 3l7 6.5V17H12v-4.5H8V17H3z", clips: "M4 3h12v14H4zM4 7h12M4 13h12M8 3v4M12 3v4M8 13v4M12 13v4",
    posts: "M4 3h12v14l-2-1.5L12 17l-2-1.5L8 17l-2-1.5L4 17zM7 7h6M7 10h6", cal: "M3 5h14v12H3zM3 9h14M7 3v4M13 3v4",
    chart: "M4 16V9M10 16V4M16 16v-5", camp: "M3 8l1.5-4h11L17 8M3 8v9h14V8M8 17v-5h4v5", money: "M10 3v14M14 6.5C14 5 12.5 4 10 4S6 5 6 6.8C6 10.5 14 9 14 13c0 1.8-1.7 3-4 3s-4-1-4-2.6",
    gear: "M10 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4",
    plus: "M10 4v12M4 10h12", more: "M4 10h.01M10 10h.01M16 10h.01", search: "M9 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM17 17l-3.5-3.5", x: "M5 5l10 10M15 5 5 15",
    chev: "m6 8 4 4 4-4", left: "m12 5-5 5 5 5", right: "m8 5 5 5-5 5", check: "M4.5 10.5 8 14l7.5-8", up: "M10 15V5M5.5 9.5 10 5l4.5 4.5", link: "M8 12l4-4M7 9l-2 2a2.8 2.8 0 0 0 4 4l2-2M13 11l2-2a2.8 2.8 0 0 0-4-4L9 7",
    eye: "M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10zM10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z", copy: "M7 7h9v10H7zM4 13V3h9",
  };
  const LOGOS = {
    youtube: `<svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M7.5 6v8l7-4z"/></svg>`,
    instagram: `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="3.5" width="13" height="13" rx="4"/><circle cx="10" cy="10" r="3"/><circle cx="14" cy="6" r=".6" fill="currentColor"/></svg>`,
    tiktok: `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M11 3v9.5a2.8 2.8 0 1 1-2.8-2.8M11 3c.4 2.2 1.9 3.6 4 3.8"/></svg>`,
  };
  const tile = (p, l) => `<span class="tile ${l ? "l" : ""} t-${p}">${LOGOS[p]}</span>`;
  const pdot = (p) => `<span class="pdot p-${p}" title="${PN[p] || ""}"></span>`;
  // Only http(s) links are ever rendered as href: campaign/stats URLs come from untrusted pages and platform APIs.
  const safeHref = (u) => { try { const x = new URL(String(u || ""), location.href); return x.protocol === "https:" || x.protocol === "http:" ? x.href : "#"; } catch { return "#"; } };
  // Est. $ for one clip; a clip held below the campaign minimum is never a bare $0.
  const heldMin = (views, c) => { const v = Number(views), cpm = Number(c?.cpm_usd), min = c?.min_payout_usd; return v > 0 && cpm > 0 && min != null && min !== "" && (v * cpm) / 1000 < Number(min) ? Number(min) : null; };
  const estCell = (est, views, c) => { const m = heldMin(views, c); return m != null ? `<span class="held" title="Content Rewards pays from $${m} per clip">below $${m} min</span>` : fmtUsd(est); };
  const badge = (text, kind = "neutral", extra = "") => `<span class="badge b-${kind} ${extra}">${extra.includes("withspin") ? `<span class="spin"></span>` : ""}${esc(text)}</span>`;
  const STATUS = { posted: ["Live", "success"], scheduled: ["Queued", "neutral"], publishing: ["Posting", "info", "b-anim"], processing: ["Processing", "info"], failed: ["Failed", "critical"], skipped: ["Skipped", "neutral"], canceled: ["Cancelled", "neutral"] };
  const statusBadge = (p) => p.may_be_live ? badge("May be live", "warning") : badge(...(STATUS[p.status] || [p.status, "neutral"]));
  const avatar = (a) => `<span class="av">${a.avatar ? `<img src="${esc(a.avatar)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="ini">${esc((a.handle || "?")[0].toUpperCase())}</span>`}<span class="pb p-${a.platform}"></span></span>`;
  const sk = (cls = "t", w = 60) => `<span class="sk ${cls}" style="width:${w}%"></span>`;
  const count = (v, f = "k") => `<span data-count="${Number(v || 0)}" data-fmt="${f}" class="num">${fmt(0, f === "usd" ? "usd" : f)}</span>`;

  async function api(path, body) {
    const r = await fetch(path, body === undefined ? { headers: { accept: "application/json" } } : { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body) });
    if (r.status === 302 || r.redirected && r.url.includes("/login")) { location.href = "/login"; throw new Error("signed out"); }
    let j = null; try { j = await r.json(); } catch { }
    if (!r.ok && !(r.status === 409 && j && j.needs_confirm)) { const e = new Error(j?.error?.message || `Something went wrong (${r.status}).`); e.status = r.status; throw e; }
    return j;
  }

  /* ---------- motion ---------- */
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  function countUp(el) {
    const to = Number(el.dataset.count), from = Number(el.dataset.from || 0), f = el.dataset.fmt;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { el.textContent = fmt(to, f); return; }
    const t0 = performance.now();
    const step = (t) => { const k = Math.min(1, (t - t0) / 600); el.textContent = fmt(from + (to - from) * ease(k), f); if (k < 1) requestAnimationFrame(step); else el.textContent = fmt(to, f); };
    requestAnimationFrame(step);
  }
  function animate(root0) {
    $$("[data-count]", root0).forEach(countUp);
    $$("path.draw", root0).forEach((p) => { try { p.style.setProperty("--len", Math.ceil(p.getTotalLength())); } catch { } });
  }
  // Update a counter in place (live values roll and tint once).
  function liveSet(el, v) {
    if (!el) return;
    const prev = Number(el.dataset.count || 0);
    if (prev === v) return;
    el.dataset.from = prev; el.dataset.count = v; countUp(el);
    const cell = el.closest(".cell,.chan,.row"); if (cell) { cell.classList.remove("tint"); void cell.offsetWidth; cell.classList.add("tint"); }
  }

  /* ---------- toasts / modals / drawer ---------- */
  function toast(msg, { error, action, onAction } = {}) {
    let box = $(".toasts"); if (!box) { box = document.createElement("div"); box.className = "toasts"; document.body.appendChild(box); }
    const t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status");
    t.innerHTML = `${error ? `<span class="dot"></span>` : ""}<span>${esc(msg)}</span>${action ? `<button class="act">${esc(action)}</button>` : ""}<button class="x" aria-label="Close">${ico(I.x, 16)}</button>`;
    box.appendChild(t);
    const kill = () => t.remove();
    $(".x", t).onclick = kill; if (action) $(".act", t).onclick = () => { kill(); onAction && onAction(); };
    setTimeout(kill, 4000);
  }
  function modal(html, { wide, onMount } = {}) {
    closeModal();
    const s = document.createElement("div"); s.className = "scrim"; s.id = "modal";
    s.innerHTML = `<div class="modal ${wide ? "w" : ""}" role="dialog" aria-modal="true">${html}</div>`;
    s.addEventListener("mousedown", (e) => { if (e.target === s) closeModal(); });
    document.body.appendChild(s);
    $$("[data-close]", s).forEach((b) => (b.onclick = closeModal));
    onMount && onMount(s);
    const f = $("input,select,textarea,button.pri", s); f && f.focus();
    return s;
  }
  function closeModal() { $("#modal")?.remove(); $("#drawer")?.remove(); $("#shade2")?.remove(); }
  function drawer(html, onMount) {
    closeModal();
    const sh = document.createElement("div"); sh.className = "shade"; sh.id = "shade2"; sh.style.background = "rgba(0,0,0,.2)"; sh.style.zIndex = 100; sh.style.display = "block"; sh.onclick = closeModal;
    const d = document.createElement("div"); d.className = "drawer"; d.id = "drawer"; d.innerHTML = html;
    document.body.append(sh, d); $$("[data-close]", d).forEach((b) => (b.onclick = closeModal)); onMount && onMount(d);
  }
  addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); $("#q")?.focus(); }
  });

  /* ---------- charts (Shop Admin line chart: 44px axis, 180px plot, tooltip pill, crosshair) ---------- */
  const CH = {};
  function lineChart(id, days, series, { fmtV = fmtK, tipFn, height = 180, bars = false } = {}) {
    const W = 800, H = height, max = Math.max(1, ...series.flatMap((s) => s.data)) * 1.1, n = days.length;
    const x = (i) => (n <= 1 ? W / 2 : (i / (n - 1)) * W), y = (v) => H - (v / max) * (H - 4) - 1;
    const path = (d) => d.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join("");
    let svg = `<svg class="plot" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">`;
    for (const g of [0, H / 3, (2 * H) / 3, H - 1]) svg += `<line x1="0" x2="${W}" y1="${g}" y2="${g}" stroke="var(--border)" vector-effect="non-scaling-stroke"/>`;
    if (bars) {
      const bw = Math.max(2, (W / n) * 0.6);
      series[0].data.forEach((v, i) => { svg += `<rect class="grow" x="${(i + 0.5) * (W / n) - bw / 2}" y="${y(v)}" width="${bw}" height="${H - y(v)}" rx="2" fill="var(--chart)" style="transform-origin:bottom;transform-box:fill-box;animation:kFade .4s ease-out both ${i * 8}ms"/>`; });
    } else {
      series.forEach((s, k) => {
        if (k === 0 && s.area !== false) svg += `<path class="area" d="${path(s.data)}L${W} ${H}L0 ${H}Z" fill="var(--chart-fill)"/>`;
        svg += `<path class="${s.dash ? "" : "draw"}" d="${path(s.data)}" fill="none" stroke="${s.color || "var(--chart)"}" stroke-width="${s.w || 2}" ${s.dash ? `stroke-dasharray="${s.dash}"` : ""} vector-effect="non-scaling-stroke" stroke-linejoin="round"/>`;
      });
    }
    svg += `<line class="xh" x1="0" x2="0" y1="0" y2="${H}" stroke="var(--ink-2)" stroke-dasharray="2 3" vector-effect="non-scaling-stroke" style="opacity:0"/></svg>`;
    const ticks = [max / 1.1, (max / 1.1) * 2 / 3, (max / 1.1) / 3, 0].map((v) => `<span>${fmtV(v)}</span>`).join("");
    const xl = n ? [0, Math.floor(n / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i).map((i) => `<span>${dayLbl(days[i])}</span>`).join("") : "";
    CH[id] = { days, series, tipFn, n, W };
    return `<div class="chart" data-chart="${id}"><div class="ax" style="height:${H}px">${ticks}</div><div style="position:relative">${svg}<div class="tip"></div></div><div class="xl">${xl}</div></div>`;
  }
  document.addEventListener("mousemove", (e) => {
    const plot = e.target.closest?.(".chart svg.plot");
    $$(".chart .tip").forEach((t) => { if (!plot || t.parentElement !== plot.parentElement) t.style.opacity = 0; });
    $$(".chart .xh").forEach((l) => { if (!plot || l.ownerSVGElement !== plot) l.style.opacity = 0; });
    if (!plot) return;
    const c = CH[plot.closest(".chart").dataset.chart]; if (!c || !c.n) return;
    const r = plot.getBoundingClientRect(), fx = (e.clientX - r.left) / r.width, i = Math.max(0, Math.min(c.n - 1, Math.round(fx * (c.n - 1))));
    const xh = $(".xh", plot), px = c.n <= 1 ? c.W / 2 : (i / (c.n - 1)) * c.W; xh.setAttribute("x1", px); xh.setAttribute("x2", px); xh.style.opacity = 1;
    const tip = $(".tip", plot.parentElement); tip.innerHTML = c.tipFn ? c.tipFn(i) : `${dayLbl(c.days[i])} · ${fmtK(c.series[0].data[i])}`;
    tip.style.opacity = 1; const tx = (i / Math.max(1, c.n - 1)) * r.width; tip.style.left = Math.min(r.width - tip.offsetWidth, Math.max(0, tx - tip.offsetWidth / 2)) + "px"; tip.style.top = "-6px";
  });
  const spark = (data) => {
    const max = Math.max(1, ...data), n = data.length;
    const d = data.map((v, i) => `${i ? "L" : "M"}${n <= 1 ? 60 : ((i / (n - 1)) * 120).toFixed(1)} ${(29 - (v / max) * 27).toFixed(1)}`).join("");
    return `<svg class="spark" viewBox="0 0 120 30" preserveAspectRatio="none"><path class="draw" d="${d || "M0 29L120 29"}" fill="none" stroke="var(--chart)" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>`;
  };

  /* ---------- shell ---------- */
  const NAV = [["/", "Home", I.home], ["/clips", "Clips", I.clips], ["/posts", "Posts", I.posts], ["/calendar", "Calendar", I.cal], ["/analytics", "Analytics", I.chart], ["/campaigns", "Campaigns", I.camp], ["/earnings", "Earnings", I.money]];
  function drawShell() {
    root.innerHTML = `<div class="app"><header class="top">
<button class="ham" id="ham" aria-label="Menu">${ico("M3 5h14M3 10h14M3 15h14")}</button>
<a class="brand" href="/" data-nav><img src="${LOGO}" alt="mob"><b>mob</b></a>
<div class="search"><label>${ico(I.search, 16)}<input id="q" placeholder="Search clips, posts, campaigns" autocomplete="off"><span class="kbd">⌘K</span></label></div>
<div class="switch"><button id="sw" aria-haspopup="true"><span class="dots" id="swdots"></span><span class="nm">All channels</span>${ico(I.chev, 14)}</button></div></header>
<div class="body"><aside class="side" id="side"><nav id="nav"></nav><div class="foot"><a class="nav" href="/settings" data-nav data-path="/settings">${ico(I.gear)}<span class="grow">Settings</span></a><div class="build">${esc(BUILD)}</div></div></aside>
<main id="main"></main></div>
<nav class="tabbar" id="tabbar">${[["/", "Home", I.home], ["/clips", "Clips", I.clips], ["/calendar", "Calendar", I.cal], ["/earnings", "Earnings", I.money], ["more", "More", I.more]].map(([h, t, i]) => `<button data-tab="${h}">${ico(i)}<span>${t}</span></button>`).join("")}</nav></div>
<div class="dropov" id="dropov">Drop to upload</div>`;
    $("#ham").onclick = openDrawer; $$("#tabbar button").forEach((b) => (b.onclick = () => (b.dataset.tab === "more" ? openDrawer() : go(b.dataset.tab))));
    $("#sw").onclick = (e) => { e.stopPropagation(); switcher(); };
    $("#q").addEventListener("keydown", (e) => { if (e.key === "Enter") { const v = e.target.value.trim(); go(`/clips?q=${encodeURIComponent(v)}`); } });
    drawNav();
  }
  function openDrawer() {
    const s = $("#side"); s.classList.add("open");
    const sh = document.createElement("div"); sh.className = "shade"; sh.id = "shade"; sh.onclick = closeDrawer; document.body.appendChild(sh);
  }
  function closeDrawer() { $("#side")?.classList.remove("open"); $("#shade")?.remove(); }
  function drawNav() {
    const b = S.boot || { accounts: [], counts: {} };
    const cur = location.pathname;
    const on = (h) => (h === "/" ? cur === "/" : cur === h || cur.startsWith(h + "/")) && !(h === "/analytics" && cur === "/analytics/live");
    const pc = (b.counts?.failed || 0) + (b.counts?.queued || 0);
    let h = NAV.map(([href, t, i]) => `<a class="nav ${on(href) ? "on" : ""}" href="${href}" data-nav>${ico(i)}<span class="grow">${t}</span>${href === "/posts" && pc ? `<span class="pill">${pc}</span>` : ""}</a>${href === "/analytics" ? `<a class="nav sub ${cur === "/analytics/live" ? "on" : ""}" href="/analytics/live" data-nav><span class="grow">Live</span>${S.boot?.accounts?.length ? `<span class="livedot"></span>` : ""}</a>` : ""}`).join("");
    h += `<div class="slabel">Channels</div>` + b.accounts.map((a) => `<a class="nav ${cur === "/channels/" + a.id ? "on" : ""}" href="/channels/${a.id}" data-nav>${pdot(a.platform)}<span class="grow">@${esc(a.handle)}</span><span class="num" style="color:var(--ink-2);font-size:12px">${fmtK(a.views)}</span></a>`).join("")
      + `<a class="nav ${cur === "/channels" ? "on" : ""}" href="/channels" data-nav>${ico(I.plus, 18)}<span class="grow" style="color:var(--ink-2)">Connect a channel</span></a>`;
    $("#nav").innerHTML = h;
    $$("[data-path]").forEach((a) => a.classList.toggle("on", cur.startsWith(a.dataset.path)));
    $("#swdots").innerHTML = b.accounts.length ? b.accounts.slice(0, 5).map((a) => pdot(a.platform)).join("") : `<span class="pdot" style="background:#616161"></span>`;
    $$("#tabbar button").forEach((x) => x.classList.toggle("on", x.dataset.tab === cur));
  }
  function switcher() {
    const w = $(".switch"); const ex = $(".pop", w); if (ex) return ex.remove();
    const b = S.boot;
    const p = document.createElement("div"); p.className = "pop";
    p.innerHTML = `<button data-go="/">${ico(I.home, 16)} All channels</button>` + b.accounts.map((a) => `<button data-go="/channels/${a.id}">${pdot(a.platform)} @${esc(a.handle)} <span style="margin-left:auto;color:var(--ink-2)" class="num">${fmtK(a.views)}</span></button>`).join("") + `<button data-go="/channels">${ico(I.plus, 16)} Connect a channel</button>`;
    w.appendChild(p);
    $$("button", p).forEach((x) => (x.onclick = () => { p.remove(); go(x.dataset.go); }));
    setTimeout(() => document.addEventListener("click", () => p.remove(), { once: true }));
  }
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-nav],a[href^='/']:not([target]):not([data-full])");
    if (!a || e.metaKey || e.ctrlKey || a.getAttribute("href").startsWith("/connect/") || a.getAttribute("href").startsWith("/logout")) return;
    e.preventDefault(); go(a.getAttribute("href"));
  });
  addEventListener("popstate", () => render());
  function go(href) { closeDrawer(); closeModal(); if (href !== location.pathname + location.search) history.pushState(null, "", href); render(); }

  async function loadBoot() { S.boot = await api("/ui/data/boot"); drawNav(); return S.boot; }
  function clearTimers() { S.timers.forEach(clearInterval); S.timers = []; }
  function every(ms, fn) { S.timers.push(setInterval(fn, ms)); }
  const ph = (title, right = "", sub = "") => `<div class="ph"><h1>${title}${sub ? ` <span class="sub">${sub}</span>` : ""}</h1>${right}</div>`;
  const segm = (name, opts, cur) => `<div class="seg" data-seg="${name}">${opts.map(([v, t]) => `<button data-v="${v}" class="${v === cur ? "on" : ""}">${t}</button>`).join("")}</div>`;
  const liveTag = (at) => `<span class="lbl" style="display:inline-flex;align-items:center;gap:6px"><span class="livedot"></span>Live · <span id="upd" data-at="${esc(at || "")}">${at ? "updated " + whenTxt(at) : "waiting for first numbers"}</span></span>`;
  function setPage(html) {
    const m = $("#main");
    m.innerHTML = `<div class="page">${html}</div>`; m.scrollTop = 0; animate(m);
  }
  function fill(sel, html) { const el = $(sel); if (!el) return; el.innerHTML = html; el.classList.remove("fadein"); void el.offsetWidth; el.classList.add("fadein"); animate(el); }

  /* ---------- router ---------- */
  async function render() {
    clearTimers();
    const path = location.pathname.replace(/\/+$/, "") || "/";
    const qs = new URLSearchParams(location.search);
    if (path === "/welcome") return welcome(qs);
    if (!$("#main")) drawShell();
    loadBoot().catch(() => { });
    drawNav();
    const msg = qs.get("msg");
    if (msg) { toast(qs.get("connected") ? `${PN[qs.get("connected")]} connected` : msg); qs.delete("msg"); history.replaceState(null, "", path + (qs.toString() ? "?" + qs : "")); }
    let m;
    try {
      if (path === "/") return await home();
      if (path === "/channels" || path === "/accounts") return await channels(qs);
      if ((m = path.match(/^\/channels\/(\d+)$/))) return await channel(m[1]);
      if (path === "/clips" || path === "/schedule") return await clips(qs);
      if (path === "/posts") return await posts(qs);
      if (path === "/calendar") return await calendar(qs);
      if (path === "/analytics") return await analytics();
      if (path === "/analytics/live") return await live();
      if (path === "/campaigns") return await campaigns();
      if ((m = path.match(/^\/campaigns\/(\d+)$/))) return await campaign(m[1]);
      if (path === "/earnings") return await earningsPage();
      if (path === "/settings") return await settings();
      setPage(ph("Not found") + `<div class="card">${empty("No page here", "Go back to Home.", `<a class="btn pri" href="/">Home</a>`)}</div>`);
    } catch (e) {
      if (e.message !== "signed out") toast(e.message, { error: true, action: "Retry", onAction: render });
    }
  }
  const empty = (title, hint, btn = "", icon = I.chart) => `<div class="empty"><span class="ic">${ico(icon)}</span><b>${esc(title)}</b>${hint ? `<span>${esc(hint)}</span>` : ""}${btn}</div>`;
  function bindSeg(name, fn) { $$(`[data-seg="${name}"] button`).forEach((b) => (b.onclick = () => { $$(`[data-seg="${name}"] button`).forEach((x) => x.classList.toggle("on", x === b)); fn(b.dataset.v); })); }

  /* ---------- Home ---------- */
  const RANGE = [["today", "Today"], ["7d", "7 days"], ["30d", "30 days"], ["all", "All"]];
  const kpiSkel = (n = 4) => `<div class="card strip">${Array.from({ length: n }, () => `<div class="cell">${sk("t", 40)}${sk("v", 50)}<span class="sk" style="height:30px;margin-top:6px"></span></div>`).join("")}</div>`;
  const chartSkel = (t = "Views") => `<div class="card"><div class="ch">${t}</div><div class="cb"><span class="sk" style="height:180px"></span></div></div>`;
  const listSkel = (t, n = 4) => `<div class="card"><div class="ch">${t}</div>${Array.from({ length: n }, () => `<div class="row"><span class="sk" style="width:32px;height:56px"></span><span class="t">${sk("t", 70)}${sk("t", 40)}</span></div>`).join("")}</div>`;
  async function home() {
    setPage(ph("Home", `<span id="livetag"></span>${segm("range", RANGE, S.range)}<a class="btn" href="/clips">Post a clip</a>`)
      + `<div id="unlock"></div><div class="grid2"><div class="col"><div id="kpis">${kpiSkel()}</div><div id="vchart">${chartSkel()}</div><div id="chans"><div class="cgrid">${[1, 2, 3].map(() => `<div class="chan">${sk("t", 60)}${sk("v", 50)}${sk("t", 90)}</div>`).join("")}</div></div></div>
<div class="col" id="right">${listSkel("Up next")}${listSkel("Top clips this week")}${listSkel("Campaigns", 2)}</div></div>`);
    bindSeg("range", (v) => { S.range = v; loadHome(); });
    const b = await loadBoot();
    // First run: nothing set up, nothing connected, never welcomed -> the onboarding.
    if (!b.accounts.length && !b.welcomed) return go("/welcome");
    await loadHome();
    every(30000, () => loadHome(true));
  }
  async function loadHome(liveOnly) {
    const [o, cal] = await Promise.all([api(`/ui/data/overview?range=${S.range}`), liveOnly ? null : api(`/ui/data/calendar?from=${new Date().toISOString()}&to=${new Date(Date.now() + 30 * 864e5).toISOString()}`)]);
    S.ov = o;
    $("#livetag") && ($("#livetag").innerHTML = S.boot.accounts.length ? liveTag(o.updated_at) : "");
    if (!S.boot.accounts.length) {
      fill("#kpis", kpis(o, true)); fill("#vchart", `<div class="card">${empty("Connect a channel to see your views", "Views, followers and earnings show up here.", `<a class="btn pri" href="/channels">Connect</a>`)}</div>`);
      fill("#chans", ""); if (cal) fill("#right", rightCol(o, cal)); return;
    }
    if (liveOnly && $("#kpis [data-k=views_total]")) {
      liveSet($("#kpis [data-k=views_total]"), o.kpis.views_total); liveSet($("#kpis [data-k=views_today]"), o.kpis.views_today); liveSet($("#kpis [data-k=est]"), o.kpis.est_usd);
      return;
    }
    fill("#kpis", kpis(o)); fill("#vchart", viewsCard(o)); fill("#unlock", unlockBanner(o));
    rebindPlat();
    fill("#chans", `<div class="cgrid">${o.accounts.map(chanCard).join("")}</div>`);
    if (cal) fill("#right", rightCol(o, cal));
  }
  function rebindPlat() { bindSeg("plat", (v) => { S.plat = v; fill("#vchart", viewsCard(S.ov)); rebindPlat(); }); }
  // One banner instead of a warning on every account: stats are new, each account needs one sign-in to turn them on.
  function unlockBanner(o) {
    const todo = o.accounts.filter((a) => a.stats_status === "reconnect" && a.status !== "needs_reconnect");
    if (!todo.length) return "";
    const first = todo[0];
    return `<div class="card banner"><span class="bico">${ico(I.chart, 18)}</span><span class="t"><b>New: views and earnings.</b><span>Sign in once per account to turn them on. ${todo.length} to go: ${todo.map((a) => "@" + esc(a.handle)).join(", ")}.</span></span>
<a class="btn pri" href="/connect/${first.platform}?from=unlock" data-full>Turn on${todo.length > 1 ? ` (1 of ${todo.length})` : ""}</a></div>`;
  }
  const mutedSpark = () => `<svg class="spark ghost" viewBox="0 0 120 30" preserveAspectRatio="none"><path d="M0 22 C20 18 30 24 50 16 S80 10 120 6" fill="none" stroke="var(--border-strong)" stroke-width="1.5" stroke-dasharray="3 4" vector-effect="non-scaling-stroke"/></svg>`;
  function kpis(o, empty0 = false) {
    const k = o.kpis, d = k.views_prev ? ((k.views_range - k.views_prev) / k.views_prev) * 100 : null;
    const pc = k.posts, sp = (data) => (empty0 ? mutedSpark() : spark(data));
    return `<div class="card strip ${empty0 ? "is-empty" : ""}">
<div class="cell"><div class="lbl">Total views</div><div class="v"><span data-k="views_total" data-count="${k.views_total}" data-fmt="k">0</span>${d != null && !empty0 ? `<span class="delta ${d >= 0 ? "up" : "down"}">${d >= 0 ? "↑" : "↓"} ${Math.abs(d).toFixed(0)}%</span>` : ""}</div>${sp(o.series.all)}</div>
<div class="cell"><div class="lbl" style="display:flex;align-items:center;gap:6px">Views today ${empty0 ? "" : `<span class="livedot"></span>`}</div><div class="v"><span data-k="views_today" data-count="${k.views_today}" data-fmt="k">0</span></div>${sp(o.series.all.slice(-7))}</div>
<div class="cell"><div class="lbl">Est. earnings</div><div class="v money"><span data-k="est" data-count="${k.est_usd}" data-fmt="usd">$0.00</span></div>${sp(o.earnings.daily.map((x) => x.est))}<div class="note">views × campaign $/1K</div></div>
<div class="cell"><div class="lbl">Posts</div><div class="v"><span data-count="${pc.live}" data-fmt="int">0</span></div>${empty0 ? `<div class="note" style="margin-top:8px">Your first post shows here.</div>` : `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
<a href="/posts?status=live" class="badge b-success">${pc.live} live</a><a href="/posts?status=queued" class="badge">${pc.queued} queued</a>${pc.failed ? `<a href="/posts?status=failed" class="badge b-critical">${pc.failed} failed</a>` : ""}</div>`}</div></div>`;
  }
  function viewsCard(o) {
    const key = S.plat, data = o.series[key] || o.series.all;
    const est = o.earnings.daily;
    const series = key === "all" && S.boot.accounts.length > 1
      ? [{ data: o.series.youtube, color: "var(--chart)" }, { data: o.series.instagram, color: "#8A8A8A", area: false, w: 1.8 }, { data: o.series.tiktok, color: "#B5B5B5", dash: "4 4", w: 1.8 }, { data: o.series.prev, color: "var(--chart-2)", dash: "4 4", w: 1.5 }]
      : [{ data }, { data: key === "all" ? o.series.prev : [], color: "var(--chart-2)", dash: "4 4", w: 1.5 }];
    const tip = (i) => `${dayLbl(o.days[i])} · ${fmtK(data[i])} views · ${fmtUsd((est.find((x) => x.day === o.days[i]) || {}).est || 0)}`;
    const legend = key === "all" && S.boot.accounts.length > 1
      ? `<div class="legend"><span><i></i>YouTube</span><span><i style="background:#8A8A8A"></i>Instagram</span><span><i style="background:repeating-linear-gradient(90deg,#B5B5B5 0 4px,transparent 4px 8px)"></i>TikTok</span><span><i style="background:repeating-linear-gradient(90deg,var(--chart-2) 0 4px,transparent 4px 8px)"></i>Previous period</span></div>`
      : `<div class="legend"><span><i></i>${key === "all" ? "Views" : PN[key]}</span>${key === "all" ? `<span><i style="background:repeating-linear-gradient(90deg,var(--chart-2) 0 4px,transparent 4px 8px)"></i>Previous period</span>` : ""}</div>`;
    return `<div class="card"><div class="ch"><span class="grow">Views <span class="num muted" style="font-weight:450;margin-left:6px">${fmtK(data.reduce((a, b) => a + b, 0))}</span></span>${segm("plat", [["all", "All"], ["youtube", "YouTube"], ["instagram", "Instagram"], ["tiktok", "TikTok"]], key)}</div>
${lineChart("views", o.days, series.filter((s) => s.data.length), { tipFn: tip })}${legend}</div>`;
  }
  function chanCard(a) {
    const [tone, label] = a.status === "needs_reconnect" ? ["warn", "Sign in again"] : a.stats_status === "reconnect" ? ["off", "Stats off"] : a.status === "disabled" ? ["off", "Paused"] : ["ok", "Connected"];
    return `<a class="chan" href="/channels/${a.id}" style="color:inherit;text-decoration:none">
<div style="display:flex;gap:10px;align-items:center">${avatar(a)}<div style="min-width:0;flex:1"><div class="ell" style="font-weight:650" title="@${esc(a.handle)}">@${esc(a.handle)}</div><div class="chsub"><span class="sdot ${tone}" title="${label}"></span>${PN[a.platform]} · ${label}</div></div></div>
<div class="mini"><div><span class="lbl">Followers</span><b>${count(a.followers)}</b></div><div><span class="lbl">Views</span><b>${count(a.views)}</b></div><div><span class="lbl">Est. $</span><b class="money">${count(a.est_usd, "usd")}</b></div></div>${spark(a.spark)}</a>`;
  }
  function rightCol(o, cal) {
    const next = cal.posts.filter((p) => p.status === "scheduled").slice(0, 5);
    const camps = [...o.earnings.campaigns].sort((a, b) => b.est_usd - a.est_usd).slice(0, 2);
    return `<div class="card"><div class="ch"><span class="grow">Up next</span><a class="link" href="/calendar">Calendar</a></div>${next.length ? next.map((p) => `<button class="row" data-post="${p.id}"><video class="thumb" src="${esc(p.clip_url)}#t=0.5" preload="metadata" muted></video><span class="t"><b class="ell">${esc(p.title || p.caption || "Clip")}</b><span>${pdot(p.platform)} @${esc(p.handle)}</span></span><span class="lbl">${whenTxt(p.scheduled_at)}</span></button>`).join("") : empty("Nothing queued", "", `<a class="btn" href="/clips">Post a clip</a>`, I.cal)}</div>
<div class="card"><div class="ch">Top clips this week</div>${o.top.length ? o.top.map((t, i) => `<a class="row" href="${esc(safeHref(t.url))}" target="_blank" rel="noopener" style="color:inherit"><span class="num muted" style="width:14px">${i + 1}</span><span class="t"><b class="ell">${esc(t.title || "Untitled")}</b><span>${pdot(t.platform)} ${PN[t.platform] || ""}${t.note ? ` · <span class="held">${esc(t.note)}</span>` : ""}</span></span><span class="num" style="font-weight:600">${fmtK(t.views)}</span></a>`).join("") : empty("No views yet", "They show up within the hour.", "", I.chart)}</div>
<div class="card"><div class="ch"><span class="grow">Campaigns</span><a class="link" href="/campaigns">View all</a></div>${camps.length ? camps.map((c) => `<a class="row" href="/campaigns/${c.id}" style="color:inherit;flex-direction:column;align-items:stretch;gap:6px"><span style="display:flex;justify-content:space-between"><b style="font-weight:550">${esc(c.name)}</b><span class="money num" style="font-weight:600">${fmtUsd(c.est_usd)}</span></span>${budgetBar(c)}</a>`).join("") : empty("No campaigns", "", `<a class="btn" href="/campaigns">Add campaign</a>`, I.camp)}</div>`;
  }
  const budgetBar = (c) => c.budget_usd ? `<div class="bar"><i style="width:${Math.min(100, ((c.paid_out_usd || 0) / c.budget_usd) * 100)}%"></i></div><span class="note">${fmtUsd0(c.paid_out_usd || 0)} of ${fmtUsd0(c.budget_usd)} paid out</span>` : "";
  document.addEventListener("click", (e) => { const b = e.target.closest("[data-post]"); if (b) postDrawer(b.dataset.post); });

  /* ---------- Channels ---------- */
  const STATE_ROW = {
    not_set_up: (p) => [badge("Not set up"), "Claude will prepare this for you.", `<button class="btn" data-ask="${p}">Ask Claude</button>`],
    setting_up: (p, s) => [badge("Setting up", "info", "withspin"), s.note || `Claude is preparing ${PN[p]}. About 5 minutes.`, ""],
    activating: (p) => [badge("Setting up", "info", "withspin"), "Activating, about a minute.", ""],
    needs_alex: (p, s) => [badge("One step for you", "warning"), s.note || `Claude needs you for one step.`, ""],
    ready: (p) => [badge("Ready", "success"), "One click to connect any channel.", `<a class="btn pri" href="/connect/${p}">Connect ${PN[p]}</a>`],
    connected: (p, s) => s.needs_reconnect ? [badge("Reconnect", "warning"), "Sign in again to keep posting.", `<a class="btn pri" href="/connect/${p}">Reconnect</a>`]
      : [badge(`Connected · ${s.accounts}`, "success"), "Connect another channel.", `<a class="btn" href="/connect/${p}">Connect another</a>`],
  };
  const stateRow = (p, s) => STATE_ROW[s.state](p, s);
  async function channels(qs) {
    setPage(ph("Channels", `<button class="btn pri" id="conn">Connect a channel</button>`) + `<div id="plats" class="cgrid" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr))">${PLATS.map(() => `<div class="card cb">${sk("t", 50)}${sk("t", 80)}</div>`).join("")}</div><div id="accts"></div>`);
    const draw = async (flash) => {
      const [b, o] = await Promise.all([loadBoot(), api("/ui/data/overview?range=30d")]);
      fill("#plats", PLATS.map((p) => { const s = b.setup[p], [bd, help, act] = stateRow(p, s); return `<div class="card cb ${flash?.includes(p) ? "tint" : ""}" data-plat="${p}" style="display:flex;flex-direction:column;gap:12px"><div style="display:flex;align-items:center;gap:12px">${tile(p, 1)}<b style="flex:1;font-weight:650">${PN[p]}</b>${bd}</div><div class="muted">${esc(help)}</div>${act ? `<div>${act}</div>` : ""}</div>`; }).join(""));
      fill("#accts", o.accounts.length ? `<div class="cgrid" style="grid-template-columns:repeat(auto-fill,minmax(min(100%,400px),1fr))">${o.accounts.map((a) => bigChan(a, o)).join("")}</div>` : `<div class="card">${empty("No channels yet", "Connect one to start posting.", "", I.link)}</div>`);
      bindChannels();
      if (qs.get("account")) { const el = $(`[data-acc="${qs.get("account")}"]`); el && el.classList.add("feed"); }
      return b;
    };
    let prev = await draw();
    $("#conn").onclick = () => connectModal();
    every(5000, async () => { const b = await api("/ui/data/setup"); const ch = PLATS.filter((p) => b[p].state !== prev.setup[p].state); if (ch.length) prev = await draw(ch); });
  }
  function bigChan(a, o) {
    const st = a.status === "needs_reconnect" ? badge("Sign in again", "warning") : a.stats_status === "reconnect" ? badge("Stats off") : a.status === "disabled" ? badge("Paused") : badge("Connected", "success");
    return `<div class="card" data-acc="${a.id}"><div class="cb" style="display:flex;flex-direction:column;gap:12px">
<div style="display:flex;gap:10px;align-items:center">${avatar(a)}<a href="/channels/${a.id}" style="min-width:0;flex:1;color:inherit"><div class="ell" style="font-weight:650">@${esc(a.handle)}</div><div style="font-size:12px;color:var(--ink-2)">${PN[a.platform]}</div></a>${st}
<button class="tog ${a.status === "disabled" ? "" : "on"}" data-toggle="${a.id}" aria-label="Posting" title="Posting"></button>
<span style="position:relative"><button class="x" data-menu="${a.id}" aria-label="More">${ico(I.more)}</button></span></div>
${a.stats_status === "reconnect" ? `<div class="lbl">Views and earnings turn on after one sign-in. <a class="link" href="/connect/${a.platform}?from=unlock" data-full>Turn on</a></div>` : ""}
<div class="mini" style="grid-template-columns:repeat(5,minmax(0,1fr))"><div><span class="lbl">Followers</span><b>${count(a.followers)}</b></div><div><span class="lbl">Total views</span><b>${count(a.views)}</b></div><div><span class="lbl">Views 28d</span><b>${count(a.views28d)}</b></div><div><span class="lbl">Posts</span><b>${count(a.posts, "int")}</b></div><div><span class="lbl">Est. $</span><b class="money">${count(a.est_usd, "usd")}</b></div></div>
<svg class="spark" style="height:60px" viewBox="0 0 120 30" preserveAspectRatio="none">${(() => { const d = a.spark, max = Math.max(1, ...d), n = d.length; const p = d.map((v, i) => `${i ? "L" : "M"}${((i / Math.max(1, n - 1)) * 120).toFixed(1)} ${(29 - (v / max) * 27).toFixed(1)}`).join(""); return `<path class="area" d="${p}L120 30L0 30Z" fill="var(--chart-fill)"/><path class="draw" d="${p}" fill="none" stroke="var(--chart)" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`; })()}</svg></div></div>`;
  }
  function bindChannels() {
    $$("[data-ask]").forEach((b) => (b.onclick = async () => { await api("/ui/act/ask", { platform: b.dataset.ask }); toast(`Claude will set up ${PN[b.dataset.ask]}`); b.outerHTML = badge("Asked Claude", "info"); }));
    $$("[data-toggle]").forEach((b) => (b.onclick = async () => { const on = b.classList.toggle("on"); await api(`/ui/act/accounts/${b.dataset.toggle}/${on ? "enable" : "disable"}`, {}); toast(on ? "Posting on" : "Posting paused"); }));
    $$("[data-menu]").forEach((b) => (b.onclick = (e) => {
      e.stopPropagation(); const w = b.parentElement; if ($(".pop", w)) return $(".pop", w).remove();
      const a = S.boot.accounts.find((x) => String(x.id) === b.dataset.menu);
      const p = document.createElement("div"); p.className = "pop"; p.style.minWidth = "180px";
      p.innerHTML = `<a href="/connect/${a.platform}" data-full>Reconnect</a><button style="color:var(--critical)" data-rm>Remove</button>`;
      w.appendChild(p); setTimeout(() => document.addEventListener("click", () => p.remove(), { once: true }));
      $("[data-rm]", p).onclick = () => modal(`<div class="mh"><b>Remove @${esc(a.handle)}?</b><button class="x" data-close>${ico(I.x, 16)}</button></div><div class="mb"><p style="margin:0">mob stops posting to @${esc(a.handle)}. Queued posts for it are skipped. You can connect it again any time.</p></div><div class="mf"><button class="btn" data-close>Cancel</button><button class="btn pri" style="background:var(--critical)" id="rmok">Remove</button></div>`,
        { onMount: (s) => ($("#rmok", s).onclick = async () => { await api(`/ui/act/accounts/${a.id}/delete`, {}); closeModal(); toast(`Removed @${a.handle}`); render(); }) });
    }));
  }
  function connectModal() {
    const st = S.boot.setup;
    modal(`<div class="mh"><b>Connect a channel</b><button class="x" data-close>${ico(I.x, 16)}</button></div><div class="mb">${PLATS.map((p) => {
      const s = st[p], ok = s.state === "ready" || s.state === "connected";
      return ok ? `<a class="btn big" href="/connect/${p}" data-full>${tile(p)}Continue with ${PN[p]}</a>` : `<div class="row" style="border:1px solid var(--border);border-radius:10px">${tile(p)}<span class="t"><b>${PN[p]}</b><span>${esc(stateRow(p, s)[1])}</span></span>${stateRow(p, s)[0]}</div>`;
    }).join("")}</div>`);
  }
  async function channel(id) {
    setPage(ph(`<span class="sk t" style="width:160px;height:16px"></span>`) + kpiSkel(5) + chartSkel() + listSkel("Posts"));
    const d = await api(`/ui/data/channels/${id}`), a = d.account;
    const data = a.spark;
    setPage(ph(`${avatar(a)} @${esc(a.handle)}`, `${liveTag(a.updated_at)}<a class="btn" href="/connect/${a.platform}" data-full>Reconnect</a>`, PN[a.platform])
      + `<div class="card strip">${[["Followers", a.followers], ["Total views", a.views], ["Views 28d", a.views28d], ["Posts", a.posts, "int"], ["Est. earnings", a.est_usd, "usd"]].map(([l, v, f]) => `<div class="cell"><div class="lbl">${l}</div><div class="v ${f === "usd" ? "money" : ""}">${count(v, f || "k")}</div></div>`).join("")}</div>
<div class="card"><div class="ch">Views, last 28 days</div>${lineChart("chan", d.days.slice(-28), [{ data }])}</div>
<div class="card"><div class="ch">Videos</div>${d.videos.length ? `<div class="tbl"><div class="tr th" style="grid-template-columns:1fr 90px 80px 80px 80px"><span>Video</span><span class="r">Views</span><span class="r">Likes</span><span class="r">Comments</span><span class="r">Shares</span></div>${d.videos.map((v) => `<a class="tr" href="${esc(safeHref(v.url))}" target="_blank" rel="noopener" style="grid-template-columns:1fr 90px 80px 80px 80px;color:inherit"><span class="ell">${esc(v.title || v.remote_id)}</span><span class="r">${fmt(v.views, "int")}</span><span class="r">${fmt(v.likes, "int")}</span><span class="r">${fmt(v.comments, "int")}</span><span class="r">${fmt(v.shares, "int")}</span></a>`).join("")}</div>` : empty("No video numbers yet", "They show up within the hour.")}</div>
<div class="card"><div class="ch">Posts from mob</div>${postTable(d.posts)}</div>`);
  }

  /* ---------- Clips ---------- */
  async function clips(qs) {
    const q = (qs.get("q") || "").toLowerCase(), f = qs.get("f") || "all";
    setPage(ph(`Clips`, `<input class="in" id="cq" placeholder="Search" value="${esc(q)}" style="height:28px;font-size:12px;width:180px">${segm("cf", [["all", "All"], ["unposted", "Unposted"], ["posted", "Posted"]], f)}<button class="btn pri" id="up">${ico(I.up, 16)} Upload</button><input type="file" id="file" accept="video/mp4" multiple hidden>`, `<span id="ccount"></span>`)
      + `<div id="uploads"></div><div class="clips" id="grid">${Array.from({ length: 12 }, () => `<div class="clip"><span class="sk skel"></span></div>`).join("")}</div>`);
    const d = await api("/ui/data/clips"); S.clips = d.clips;
    await loadBoot();
    const draw = () => {
      const qq = ($("#cq")?.value || "").toLowerCase(), ff = $(`[data-seg="cf"] .on`)?.dataset.v || "all";
      const list = S.clips.filter((c) => (!qq || (c.title + c.key).toLowerCase().includes(qq)) && (ff === "all" || (ff === "posted" ? c.platforms.length : !c.platforms.length)));
      $("#ccount").textContent = list.length;
      fill("#grid", list.length ? list.map(clipTile).join("") : `<div class="card" style="grid-column:1/-1">${empty("No clips here", "New clips land here on their own.", `<button class="btn" onclick="document.getElementById('file').click()">Upload</button>`, I.clips)}</div>`);
      bindClips();
    };
    draw();
    $("#cq").oninput = draw; bindSeg("cf", draw);
    $("#up").onclick = () => $("#file").click(); $("#file").onchange = (e) => uploadFiles([...e.target.files]);
    if (location.pathname === "/schedule") { const k = qs.get("clip"); scheduleModal(k ? [k] : []); }
  }
  const clipTile = (c) => `<button class="clip ${S.sel.has(c.key) ? "sel" : ""}" data-clip="${esc(c.key)}" draggable="true" aria-label="${esc(c.title)}">
<video data-src="${esc(c.url)}#t=0.5" preload="none" muted loop playsinline></video><span class="ck" data-check>${ico(I.check, 14)}</span>
<span class="pd">${c.platforms.map(pdot).join("")}</span><span class="ov"><b>${esc(c.title)}</b><span class="num">${(c.size / 1048576).toFixed(1)} MB</span></span></button>`;
  let io = null;
  function bindClips() {
    io?.disconnect();
    io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { const v = $("video", e.target); if (v && !v.src) { v.preload = "metadata"; v.src = v.dataset.src; } io.unobserve(e.target); } }), { rootMargin: "200px" });
    $$(".clip[data-clip]").forEach((t) => {
      io.observe(t);
      let hov;
      t.onmouseenter = () => { hov = setTimeout(() => { const v = $("video", t); if (S.hoverVid && S.hoverVid !== v) S.hoverVid.pause(); S.hoverVid = v; v.play().catch(() => { }); }, 150); };
      t.onmouseleave = () => { clearTimeout(hov); const v = $("video", t); v.pause(); };
      let lp; t.ontouchstart = () => { lp = setTimeout(() => previewSheet(t.dataset.clip), 500); }; t.ontouchend = () => clearTimeout(lp);
      t.onclick = (e) => { if (e.target.closest("[data-check]") || S.sel.size) toggleSel(t); else scheduleModal([t.dataset.clip]); };
      t.ondragstart = (e) => { e.dataTransfer.setData("text/clip", t.dataset.clip); e.dataTransfer.effectAllowed = "copy"; showRail(); };
      t.ondragend = () => setTimeout(hideRail, 50);
    });
  }
  function toggleSel(t) { const k = t.dataset.clip; S.sel.has(k) ? S.sel.delete(k) : S.sel.add(k); t.classList.toggle("sel", S.sel.has(k)); bulkBar(); }
  function bulkBar() {
    $("#bulk")?.remove(); if (!S.sel.size) return;
    const b = document.createElement("div"); b.className = "savebar"; b.id = "bulk";
    b.innerHTML = `<span class="grow">${S.sel.size} selected</span><button class="o" id="bx">Clear</button><button class="o" id="bd">Delete</button><button class="o" id="bn">Post now</button><button class="w" id="bs">Schedule</button>`;
    document.body.appendChild(b);
    $("#bx").onclick = () => { S.sel.clear(); $$(".clip.sel").forEach((x) => x.classList.remove("sel")); bulkBar(); };
    $("#bs").onclick = () => scheduleModal([...S.sel]); $("#bn").onclick = () => scheduleModal([...S.sel], { now: true });
    $("#bd").onclick = async () => { const r = await api("/ui/act/clips/delete", { keys: [...S.sel] }); toast(r.kept ? `Deleted ${r.deleted}. Library clips stay.` : `Deleted ${r.deleted}`); S.sel.clear(); bulkBar(); render(); };
  }
  function previewSheet(key) {
    const c = S.clips.find((x) => x.key === key);
    modal(`<div class="mh"><b class="ell">${esc(c.title)}</b><button class="x" data-close>${ico(I.x, 16)}</button></div><div class="mb" style="align-items:center"><video src="${esc(c.url)}" autoplay muted loop playsinline controls style="width:220px;aspect-ratio:9/16;border-radius:12px;background:#000"></video></div><div class="mf"><button class="btn pri" id="pv">Schedule</button></div>`,
      { onMount: (s) => ($("#pv", s).onclick = () => scheduleModal([key])) });
  }
  function showRail() {
    if ($("#rail") || innerWidth < 900) return;
    const r = document.createElement("div"); r.className = "rail"; r.id = "rail";
    const slots = []; for (let i = 0; i < 7; i++) { const d = new Date(Date.now() + i * 864e5), p = athParts(d); for (const h of i === 0 ? [] : ["12:00", "18:30"]) slots.push([`${p.year}-${p.month}-${p.day}T${h}`, `${p.weekday} ${h}`]); if (i === 0) slots.push(["", "Now"]); }
    r.innerHTML = `<div class="ch">Drop on a day</div>` + slots.map(([v, t]) => `<div class="slot" data-at="${v}">${esc(t)}</div>`).join("");
    document.body.appendChild(r);
    $$(".slot", r).forEach((s) => {
      s.ondragover = (e) => { e.preventDefault(); s.classList.add("over"); }; s.ondragleave = () => s.classList.remove("over");
      s.ondrop = (e) => { e.preventDefault(); const k = e.dataTransfer.getData("text/clip"); hideRail(); scheduleModal([k], { at: s.dataset.at }); };
    });
  }
  function hideRail() { $("#rail")?.remove(); }
  // Drop files anywhere on the Clips page.
  let dragDepth = 0;
  addEventListener("dragenter", (e) => { if (location.pathname !== "/clips" || !e.dataTransfer?.types?.includes("Files")) return; dragDepth++; $("#dropov")?.classList.add("on"); });
  addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; $("#dropov")?.classList.remove("on"); } });
  addEventListener("dragover", (e) => { if (e.dataTransfer?.types?.includes("Files")) e.preventDefault(); });
  addEventListener("drop", (e) => { if (!e.dataTransfer?.files?.length) return; e.preventDefault(); dragDepth = 0; $("#dropov")?.classList.remove("on"); if (location.pathname === "/clips") uploadFiles([...e.dataTransfer.files]); });
  function uploadFiles(files) {
    for (const f of files) {
      if (!/\.mp4$/i.test(f.name) && f.type !== "video/mp4") { toast(`${f.name} is not an MP4. Pick an MP4 clip.`, { error: true }); continue; }
      const row = document.createElement("div"); row.className = "card feed"; row.style.marginBottom = "8px";
      row.innerHTML = `<div class="row"><span class="t"><b class="ell">${esc(f.name)}</b><div class="bar" style="margin-top:6px"><i style="width:0%;animation:none;transition:width .2s"></i></div></span><span class="lbl num">0%</span></div>`;
      $("#uploads").appendChild(row);
      const x = new XMLHttpRequest(); x.open("POST", "/clips/upload"); x.setRequestHeader("accept", "application/json");
      x.upload.onprogress = (e) => { const p = Math.round((e.loaded / e.total) * 100); $("i", row).style.width = p + "%"; $(".lbl", row).textContent = p + "%"; };
      x.onload = async () => { row.remove(); if (x.status === 200) { toast(`Uploaded ${f.name}`); const d = await api("/ui/data/clips"); S.clips = d.clips; render(); } else toast(`${f.name} did not upload. Try again.`, { error: true }); };
      x.onerror = () => { row.remove(); toast(`${f.name} did not upload. Try again.`, { error: true }); };
      const fd = new FormData(); fd.append("file", f); x.send(fd);
    }
  }
  async function scheduleModal(keys, { at, now } = {}) {
    if (!keys.length) { toast("Pick a clip first"); return; }
    const [b, camps] = [S.boot || (await loadBoot()), await api("/ui/data/campaigns")];
    const c = (S.clips || []).find((x) => x.key === keys[0]) || { url: "", title: keys[0] };
    const accs = b.accounts.filter((a) => a.status === "connected");
    const lim = { instagram: 2200, tiktok: 2200, youtube: 5000 };
    modal(`<div class="mh"><b>${keys.length > 1 ? `Schedule ${keys.length} clips` : "Schedule"}</b><button class="x" data-close>${ico(I.x, 16)}</button></div>
<div class="mb" style="flex-direction:row;gap:16px;flex-wrap:wrap"><video src="${esc(c.url)}#t=0.5" preload="metadata" muted playsinline style="width:160px;aspect-ratio:9/16;border-radius:12px;background:#1A1A1A;flex:none;object-fit:cover"></video>
<div style="flex:1;min-width:240px;display:flex;flex-direction:column;gap:12px">
<div class="fld"><span>Channels</span><div class="chips">${PLATS.map((p) => { const list = accs.filter((a) => a.platform === p); return list.length ? list.map((a) => `<button class="chipb on" data-acc="${a.id}">${pdot(p)}@${esc(a.handle)}</button>`).join("") : `<button class="chipb" disabled>${pdot(p)}${PN[p]} · Not connected</button>`; }).join("")}</div></div>
<div class="fld"><span>When</span><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${segm("when", [["now", "Now"], ["at", "Pick a time"]], at || !now && at !== undefined && at !== "" ? "at" : "now")}<input type="datetime-local" class="in" id="at" style="width:auto;height:32px;font-size:13px" value="${esc(at || athLocal(Date.now() + 3600000).slice(0, 14) + "00")}"><span class="hint">Athens time</span></div></div>
<div class="fld"><span>Spread over</span>${segm("spread", [["0", "0"], ["15", "15 min"], ["30", "30 min"], ["60", "60 min"]], String(b.spread || 0))}</div>
<label class="fld"><span>Title</span><input class="in" id="ttl" maxlength="100" value="${keys.length === 1 ? esc(c.title) : ""}" placeholder="Shown on YouTube"></label>
<label class="fld"><span>Caption</span><textarea class="in" id="cap" rows="3" placeholder="Caption and hashtags"></textarea><span class="hint num" id="capn">${PLATS.map((p) => `${PN[p]} 0/${lim[p]}`).join(" · ")}</span></label>
<label class="fld"><span>Campaign</span><select class="in" id="camp"><option value="">None</option>${camps.campaigns.filter((x) => x.status === "active").map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join("")}</select></label></div></div>
<div class="mf"><button class="btn" data-close>Cancel</button><button class="btn pri" id="go">${now ? "Post now" : "Schedule"}</button></div>`, {
      wide: true, onMount: (s) => {
        let when = at ? "at" : "now"; $("#at", s).style.display = when === "at" ? "" : "none";
        bindSeg("when", (v) => { when = v; $("#at", s).style.display = v === "at" ? "" : "none"; });
        let spread = b.spread || 0; bindSeg("spread", (v) => (spread = Number(v)));
        $$("[data-acc]", s).forEach((x) => (x.onclick = () => x.classList.toggle("on")));
        $("#cap", s).oninput = (e) => { const n = e.target.value.length; $("#capn", s).innerHTML = PLATS.map((p) => `<span style="color:${n > lim[p] ? "var(--critical)" : "inherit"}">${PN[p]} ${n}/${lim[p]}</span>`).join(" · "); };
        $("#go", s).onclick = async (e) => {
          const ids = $$("[data-acc].on", s).map((x) => x.dataset.acc);
          if (!ids.length) return toast("Pick at least one channel", { error: true });
          e.target.disabled = true;
          try {
            let n = 0, first = null;
            for (const [i, k] of keys.entries()) {
              let t = when === "at" ? $("#at", s).value : null;
              if (i && t) t = athLocal(new Date(new Date(t + ":00Z").getTime() + i * spread * 60000).toISOString().replace("Z", "") + "Z");
              const r = await api("/ui/act/schedule", { clip_key: k, account_ids: ids, at: t, spread_minutes: spread, title: $("#ttl", s).value, caption: $("#cap", s).value, campaign_id: $("#camp", s).value || null });
              n += r.posts.length; first = first || r.posts[0];
            }
            closeModal(); S.sel.clear(); bulkBar();
            const a = accs.find((x) => String(x.id) === ids[0]);
            toast(when === "now" ? (n === 1 ? `Posting to @${a.handle}` : `Posting ${n} posts`) : `Scheduled for ${whenTxt(first.scheduled_at)}`);
            if (location.pathname === "/schedule") go("/posts?status=queued"); else loadBoot();
          } catch (err) { e.target.disabled = false; toast(err.message, { error: true }); }
        };
      },
    });
  }

  /* ---------- Posts ---------- */
  const PCOLS = "56px 1.6fr 1fr 110px 120px 90px 100px";
  function postTable(list) {
    if (!list.length) return empty("No posts here", "", `<a class="btn" href="/clips">Post a clip</a>`, I.posts);
    const mob = innerWidth < 900, cols = mob ? "56px 1fr auto" : PCOLS;
    return `<div class="tbl"><div class="tr th" style="grid-template-columns:${cols}">${mob ? "<span></span><span>Post</span><span>Status</span>" : "<span></span><span>Title</span><span>Channel</span><span>Status</span><span>Time</span><span class='r'>Views</span><span class='r'>Est. $</span>"}</div>
${list.map((p) => `<button class="tr" data-post="${p.id}" style="grid-template-columns:${cols};padding-top:6px;padding-bottom:6px"><video class="thumb" data-lazy="${esc(p.clip_url)}#t=0.5" preload="none" muted style="width:32px;height:56px"></video>
${mob ? `<span style="min-width:0"><b class="ell" style="display:block;font-weight:550">${esc(p.title || p.caption || "Clip")}</b><span class="lbl">${pdot(p.platform)} @${esc(p.handle || "")} · ${whenTxt(p.scheduled_at)}</span></span>${statusBadge(p)}`
        : `<span style="min-width:0"><b class="ell" style="display:block;font-weight:550">${esc(p.title || "Clip")}</b><span class="ell lbl" style="display:block">${esc(p.caption || p.error || "")}</span></span><span class="ell">${pdot(p.platform)} @${esc(p.handle || "")}</span>${statusBadge(p)}<span class="lbl">${whenTxt(p.scheduled_at)}</span><span class="r">${fmt(p.views, "int")}</span><span class="r money">${p.campaign_id ? fmtUsd(p.est_usd) : "—"}</span>`}</button>`).join("")}</div>`;
  }
  function lazyVids(root0 = document) { const o = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.src = e.target.dataset.lazy; e.target.preload = "metadata"; o.unobserve(e.target); } })); $$("video[data-lazy]", root0).forEach((v) => o.observe(v)); }
  async function posts(qs) {
    const st = qs.get("status") || "all";
    setPage(ph("Posts") + `<div class="card"><div class="tabs" id="ptabs"></div><div id="plist">${Array.from({ length: 6 }, () => `<div class="row"><span class="sk" style="width:32px;height:56px"></span><span class="t">${sk("t", 50)}${sk("t", 30)}</span></div>`).join("")}</div></div>`);
    const load = async (s) => {
      const d = await api(`/ui/data/posts${s === "all" ? "" : "?status=" + s}`);
      $("#ptabs").innerHTML = [["all", "All"], ["live", "Live"], ["queued", "Queued"], ["posting", "Posting"], ["failed", "Failed"]].map(([v, t]) => `<button data-st="${v}" class="${v === s ? "on" : ""}">${t}<span class="pill">${d.counts[v]}</span></button>`).join("");
      $$("#ptabs button").forEach((b) => (b.onclick = () => { history.replaceState(null, "", "/posts" + (b.dataset.st === "all" ? "" : "?status=" + b.dataset.st)); load(b.dataset.st); }));
      fill("#plist", postTable(d.posts)); lazyVids($("#plist"));
    };
    await load(st);
    every(30000, () => load(new URLSearchParams(location.search).get("status") || "all"));
  }
  async function postDrawer(id) {
    drawer(`<div class="mh"><b>Post</b><button class="x" data-close>${ico(I.x, 16)}</button></div><div class="mb">${sk("v", 60)}${sk("t", 80)}</div>`);
    const p = await api(`/ui/data/posts/${id}`);
    const canRetry = ["failed", "skipped", "canceled"].includes(p.status), canCancel = ["scheduled", "failed"].includes(p.status);
    drawer(`<div class="mh"><b class="ell">${esc(p.title || "Post")}</b>${statusBadge(p)}<button class="x" data-close>${ico(I.x, 16)}</button></div>
<div class="mb"><video src="${esc(p.clip_url)}#t=0.5" preload="metadata" controls muted playsinline style="width:180px;aspect-ratio:9/16;border-radius:12px;background:#000;align-self:center"></video>
<div class="row" style="padding:0;border:0">${pdot(p.platform)}<span class="t"><b>@${esc(p.handle || "")}</b><span>${PN[p.platform] || ""}${p.campaign_name ? " · " + esc(p.campaign_name) : ""}</span></span>${p.views != null ? `<span class="num" style="font-weight:600">${fmt(p.views, "int")} views</span>` : ""}</div>
${p.caption ? `<div class="muted" style="white-space:pre-wrap">${esc(p.caption)}</div>` : ""}
${p.error ? `<div class="teststrip"><span class="badge b-critical nodot">Note</span><span style="min-width:0;overflow-wrap:anywhere">${esc(p.error)}</span></div>` : ""}
<div class="lbl">Timeline</div><div class="tl">${p.events.map((e) => `<div><b style="font-weight:550">${esc(e.label)}</b> <span class="lbl">${whenTxt(e.at)}</span></div>`).join("")}</div>
${p.remote_url ? `<a class="btn" href="${esc(safeHref(p.remote_url))}" target="_blank" rel="noopener" data-full>${ico(I.link, 16)} Open live post</a>` : ""}</div>
<div class="mf">${canCancel ? `<button class="btn" id="pc">Cancel post</button>` : ""}${canRetry ? `<button class="btn pri" id="pr">Retry</button>` : ""}</div>`, (d) => {
      $("#pc", d) && ($("#pc", d).onclick = async () => { await api(`/ui/act/posts/${id}/cancel`, {}); toast("Cancelled"); closeModal(); render(); });
      $("#pr", d) && ($("#pr", d).onclick = async () => {
        const r = await api(`/ui/act/posts/${id}/retry`, {});
        if (r.needs_confirm) return modal(`<div class="mh"><b>Check before posting again</b><button class="x" data-close>${ico(I.x, 16)}</button></div><div class="mb"><p style="margin:0">This may already be live on @${esc(p.handle)}. Check before posting again.</p></div><div class="mf"><a class="btn" href="${p.platform === "youtube" ? "https://studio.youtube.com" : p.platform === "instagram" ? "https://www.instagram.com/" + esc(p.handle) : "https://www.tiktok.com/@" + esc(p.handle)}" target="_blank" rel="noopener" data-full>Open @${esc(p.handle)}</a><button class="btn pri" id="again">Post again</button></div>`,
          { onMount: (s) => ($("#again", s).onclick = async () => { await api(`/ui/act/posts/${id}/retry`, { confirm: true }); closeModal(); toast("Queued again"); render(); }) });
        toast("Queued again"); closeModal(); render();
      });
    });
  }

  /* ---------- Calendar ---------- */
  async function calendar(qs) {
    const wk = Number(qs.get("w") || 0);
    const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - ((start.getDay() + 6) % 7) + wk * 7);
    const end = new Date(start.getTime() + 7 * 864e5);
    const view = qs.get("v") || (innerWidth < 900 ? "list" : "week");
    const rng = `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date(end - 1).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
    const nav = (w, v = view) => `/calendar?w=${w}&v=${v}`;
    setPage(ph("Calendar", `<a class="btn" href="${nav(0)}">Today</a><a class="btn" href="${nav(wk - 1)}" aria-label="Previous week">${ico(I.left, 16)}</a><a class="btn" href="${nav(wk + 1)}" aria-label="Next week">${ico(I.right, 16)}</a><span class="lbl">${rng}</span>${segm("cv", [["week", "Week"], ["list", "List"]], view)}`)
      + `<div class="card" id="cal" style="max-height:calc(100vh - 160px);overflow:auto"><span class="sk" style="height:400px;margin:16px"></span></div>`);
    bindSeg("cv", (v) => go(nav(wk, v)));
    const d = await api(`/ui/data/calendar?from=${start.toISOString()}&to=${end.toISOString()}`);
    const days = Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * 864e5));
    const athDay = (x) => { const p = athParts(x); return `${p.year}-${p.month}-${p.day}`; };
    if (view === "list") {
      fill("#cal", days.map((x) => { const k = athDay(x), list = d.posts.filter((p) => athDay(p.scheduled_at) === k); return `<div class="ch" style="position:sticky;top:0;background:var(--surface);z-index:2">${x.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</div>${list.length ? list.map((p) => `<button class="row" data-post="${p.id}"><span class="lbl num" style="width:44px">${athParts(p.scheduled_at).hour}:${athParts(p.scheduled_at).minute}</span><span class="t"><b class="ell">${esc(p.title || p.caption || "Clip")}</b><span>${pdot(p.platform)} @${esc(p.handle)}</span></span>${statusBadge(p)}</button>`).join("") : `<div class="row note">Nothing planned</div>`}`; }).join(""));
      return;
    }
    const H0 = 6, PX = 48, today = athDay(new Date());
    let h = `<div class="cal"><div class="hd" style="font-size:11px;color:var(--ink-2);font-weight:550">Athens time</div>${days.map((x) => `<div class="hd ${athDay(x) === today ? "today" : ""}">${x.toLocaleDateString("en-US", { weekday: "short", day: "numeric" })}</div>`).join("")}`;
    h += `<div>${Array.from({ length: 18 }, (_, i) => `<div class="tm">${String(H0 + i).padStart(2, "0")}:00</div>`).join("")}</div>`;
    for (const x of days) {
      const k = athDay(x);
      h += `<div class="day" data-day="${k}" style="height:${18 * PX}px">${d.posts.filter((p) => athDay(p.scheduled_at) === k).map((p) => { const a = athParts(p.scheduled_at), top = Math.max(0, (Number(a.hour) - H0 + Number(a.minute) / 60) * PX); return `<div class="ev ${p.status === "posted" ? "live" : p.status === "failed" ? "failed" : ""}" style="top:${top}px" data-ev="${p.id}" data-st="${p.status}" title="${esc(p.title || "")}"><video data-lazy="${esc(p.clip_url)}#t=0.5" preload="none" muted></video>${pdot(p.platform)}<span class="ell">@${esc(p.handle)}</span></div>`; }).join("")}${k === today ? `<div class="nowline" id="now"></div>` : ""}</div>`;
    }
    fill("#cal", h + `</div>`); lazyVids($("#cal"));
    const placeNow = () => { const n = $("#now"); if (!n) return; const a = athParts(new Date()); n.style.top = (Number(a.hour) - H0 + Number(a.minute) / 60) * PX + "px"; };
    placeNow(); every(60000, placeNow);
    const nowTop = $("#now"); if (nowTop) $("#cal").scrollTop = Math.max(0, nowTop.offsetTop - 120);
    // Drag a queued chip to a new time: snaps to 15 minutes.
    $$(".ev").forEach((ev) => ev.addEventListener("pointerdown", (e) => {
      if (ev.dataset.st !== "scheduled") return postDrawer(ev.dataset.ev);
      e.preventDefault(); const sy = e.clientY, top0 = ev.offsetTop; let moved = false, col = ev.parentElement;
      ev.classList.add("ghost"); ev.setPointerCapture(e.pointerId);
      const lbl = document.createElement("span"); lbl.className = "num"; lbl.style.marginLeft = "auto"; ev.appendChild(lbl);
      const snap = (y) => Math.max(0, Math.round(y / (PX / 4)) * (PX / 4));
      ev.onpointermove = (m) => {
        moved = moved || Math.abs(m.clientY - sy) > 3;
        const c = document.elementsFromPoint(m.clientX, m.clientY).find((x) => x.classList?.contains("day")); if (c && c !== col) { c.appendChild(ev); col = c; }
        const t = snap(top0 + m.clientY - sy); ev.style.top = t + "px"; const mins = H0 * 60 + (t / PX) * 60; lbl.textContent = `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
      };
      ev.onpointerup = async () => {
        ev.onpointermove = ev.onpointerup = null; ev.classList.remove("ghost"); lbl.remove();
        if (!moved) return postDrawer(ev.dataset.ev);
        const mins = H0 * 60 + (snap(ev.offsetTop) / PX) * 60, hhmm = `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
        try { const r = await api(`/ui/act/posts/${ev.dataset.ev}/move`, { at: `${col.dataset.day}T${hhmm}` }); toast(`Moved to ${athParts(r.scheduled_at).weekday} ${hhmm}`); } catch (err) { toast(err.message, { error: true }); render(); }
      };
    }));
  }

  /* ---------- Analytics ---------- */
  async function analytics() {
    setPage(ph("Analytics", `<span id="livetag"></span>${segm("range", RANGE, S.range)}`) + `<div id="akpi">${kpiSkel()}</div><div id="achart">${chartSkel()}</div><div id="atable">${listSkel("Channels", 3)}</div>`);
    const load = async () => {
      const o = await api(`/ui/data/overview?range=${S.range}`); S.ov = o; await loadBoot();
      $("#livetag").innerHTML = liveTag(o.updated_at);
      fill("#akpi", kpis(o)); fill("#achart", viewsCard(o)); rebindPlat();
      const cols = "1.4fr 1fr 1fr 1fr 1fr 1fr";
      fill("#atable", `<div class="card"><div class="ch">Channels</div>${o.accounts.length ? `<div class="tbl"><div class="tr th" style="grid-template-columns:${cols}"><span>Channel</span><span class="r">Followers</span><span class="r">Total views</span><span class="r">Views 28d</span><span class="r">Today</span><span class="r">Est. $</span></div>${o.accounts.map((a) => `<a class="tr" href="/channels/${a.id}" style="grid-template-columns:${cols};color:inherit"><span class="ell">${pdot(a.platform)} @${esc(a.handle)}</span><span class="r">${fmt(a.followers, "int")}</span><span class="r">${fmt(a.views, "int")}</span><span class="r">${fmt(a.views28d, "int")}</span><span class="r">${fmt(a.views_today, "int")}</span><span class="r money">${fmtUsd(a.est_usd)}</span></a>`).join("")}</div>` : empty("Connect a channel to see your views", "", `<a class="btn pri" href="/channels">Connect</a>`)}</div>`);
    };
    bindSeg("range", (v) => { S.range = v; load(); });
    await load(); every(30000, load);
  }
  async function live() {
    setPage(ph(`Live <span class="livedot"></span>`, `<span id="livetag"></span>`) + `<div id="lk">${kpiSkel(3)}</div><div id="lc"></div>`);
    let first = true;
    const load = async () => {
      const o = await api("/ui/data/overview?range=today");
      $("#livetag").innerHTML = liveTag(o.updated_at);
      if (first) {
        fill("#lk", `<div class="card strip"><div class="cell"><div class="lbl">Views today</div><div class="v"><span id="lv" data-count="${o.kpis.views_today}" data-fmt="int">0</span></div></div><div class="cell"><div class="lbl">Total views</div><div class="v"><span id="lt" data-count="${o.kpis.views_total}" data-fmt="int">0</span></div></div><div class="cell"><div class="lbl">Est. earnings</div><div class="v money"><span id="le" data-count="${o.kpis.est_usd}" data-fmt="usd">$0.00</span></div></div></div>`);
        fill("#lc", `<div class="card"><div class="ch">Channels today</div>${o.accounts.length ? o.accounts.map((a) => `<div class="row" data-live="${a.id}">${avatar(a)}<span class="t"><b>@${esc(a.handle)}</b><span>${PN[a.platform]}</span></span><span class="num" style="font-weight:650;font-size:15px"><span data-count="${a.views_today}" data-fmt="int">0</span></span></div>`).join("") : empty("Connect a channel to see live views", "", `<a class="btn pri" href="/channels">Connect</a>`)}</div>`);
        first = false;
      } else {
        liveSet($("#lv"), o.kpis.views_today); liveSet($("#lt"), o.kpis.views_total); liveSet($("#le"), o.kpis.est_usd);
        o.accounts.forEach((a) => liveSet($(`[data-live="${a.id}"] [data-count]`), a.views_today));
      }
    };
    await load(); every(30000, load);
  }
  setInterval(() => { const u = $("#upd"); if (u && u.dataset.at) u.textContent = "updated " + whenTxt(u.dataset.at); }, 5000);

  /* ---------- Campaigns ---------- */
  async function campaigns() {
    setPage(ph("Campaigns", `<button class="btn pri" id="addc">Add campaign</button>`) + `<div class="cgrid" id="cg" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">${[1, 2].map(() => `<div class="card cb">${sk("t", 50)}${sk("v", 40)}${sk("t", 90)}${sk("t", 70)}</div>`).join("")}</div>`);
    $("#addc").onclick = () => campaignModal();
    const d = await api("/ui/data/campaigns");
    fill("#cg", d.campaigns.length ? d.campaigns.map(campCard).join("") : `<div class="card" style="grid-column:1/-1">${empty("No campaigns yet", "Paste a Content Rewards link to add one.", `<button class="btn pri" onclick="document.getElementById('addc').click()">Add campaign</button>`, I.camp)}</div>`);
  }
  const rate = (c) => `${c.cpm_usd != null ? `$${c.cpm_usd} / 1K views` : "No rate yet"}${c.min_payout_usd != null || c.max_payout_usd != null ? ` · ${c.min_payout_usd != null ? `Min $${c.min_payout_usd}` : ""}${c.min_payout_usd != null && c.max_payout_usd != null ? " · " : ""}${c.max_payout_usd != null ? `Max $${c.max_payout_usd}` : ""} per clip` : ""}`;
  const campCard = (c) => `<a class="chan" href="/campaigns/${c.id}" style="color:inherit;text-decoration:none">
<div style="display:flex;align-items:center;gap:8px"><b style="font-weight:650;flex:1" class="ell">${esc(c.name)}</b>${c.status === "active" ? badge("Active", "success") : badge("Ended")}</div>
<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><span class="dots">${(c.platforms || []).map(pdot).join("")}</span><span class="lbl">${esc(rate(c))}</span></div>${budgetBar(c)}
<div class="mini" style="grid-template-columns:1fr 1fr"><div><span class="lbl">My views</span><b>${count(c.views)}</b></div><div><span class="lbl">My earnings</span><b class="money">${count(c.est_usd, "usd")}</b></div><div><span class="lbl">Clips submitted</span><b>${count(c.submitted, "int")}</b></div><div><span class="lbl">Waiting to submit</span><b>${c.waiting ? badge(String(c.waiting), "warning") : count(0, "int")}</b></div></div></a>`;
  function campaignModal(c = null) {
    const v = (k) => (c && c[k] != null ? esc(c[k]) : "");
    modal(`<div class="mh"><b>${c ? "Edit campaign" : "Add campaign"}</b><button class="x" data-close>${ico(I.x, 16)}</button></div><div class="mb">
<label class="fld"><span>Content Rewards link</span><input class="in" id="cu" type="url" placeholder="https://contentrewards.com/…" value="${v("url")}"><span class="hint">Claude reads the page and fills the rest. Every field stays editable.</span></label>
<label class="fld"><span>Name</span><input class="in" id="cn" value="${v("name")}"></label>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px"><label class="fld"><span>$ per 1K views</span><input class="in num" id="cr" inputmode="decimal" value="${v("cpm_usd")}"></label><label class="fld"><span>Min per clip</span><input class="in num" id="cmin" inputmode="decimal" value="${v("min_payout_usd")}"></label><label class="fld"><span>Max per clip</span><input class="in num" id="cmax" inputmode="decimal" value="${v("max_payout_usd")}"></label></div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><label class="fld"><span>Budget</span><input class="in num" id="cb" inputmode="decimal" value="${v("budget_usd")}"></label><label class="fld"><span>Paid out so far</span><input class="in num" id="cpo" inputmode="decimal" value="${v("paid_out_usd")}"></label></div>
<div class="fld"><span>Platforms</span><div class="chips">${PLATS.map((p) => `<button class="chipb ${!c || (c.platforms || []).includes(p) ? "on" : ""}" data-pl="${p}">${pdot(p)}${PN[p]}</button>`).join("")}</div></div>
<label class="fld"><span>Rules</span><textarea class="in" id="cru" rows="2" placeholder="Tags, length, follower minimum">${v("rules")}</textarea></label></div>
<div class="mf">${c ? `<button class="btn" id="cend" style="margin-right:auto">${c.status === "active" ? "End campaign" : "Reopen"}</button>` : ""}<button class="btn" data-close>Cancel</button><button class="btn pri" id="csave">${c ? "Save" : "Add"}</button></div>`, {
      onMount: (s) => {
        $$("[data-pl]", s).forEach((b) => (b.onclick = () => b.classList.toggle("on")));
        const body = () => ({ url: $("#cu", s).value.trim(), name: $("#cn", s).value.trim() || $("#cu", s).value.trim().replace(/^https?:\/\/(www\.)?/, "").split(/[/?#]/).slice(-1)[0] || "", cpm_usd: $("#cr", s).value, min_payout_usd: $("#cmin", s).value, max_payout_usd: $("#cmax", s).value, budget_usd: $("#cb", s).value, paid_out_usd: $("#cpo", s).value, rules: $("#cru", s).value, platforms: $$("[data-pl].on", s).map((b) => b.dataset.pl) });
        $("#csave", s).onclick = async () => { try { const r = await api(c ? `/ui/act/campaigns/${c.id}` : "/ui/act/campaigns", body()); closeModal(); toast(c ? "Saved" : "Campaign added"); go(`/campaigns/${r.id}`); } catch (e) { toast(e.message, { error: true }); } };
        $("#cend", s) && ($("#cend", s).onclick = async () => { await api(`/ui/act/campaigns/${c.id}`, { status: c.status === "active" ? "ended" : "active" }); closeModal(); render(); });
      },
    });
  }
  async function campaign(id) {
    setPage(ph(`<span class="sk t" style="width:200px;height:16px"></span>`) + kpiSkel() + chartSkel("Earnings") + listSkel("Clips"));
    const d = await api(`/ui/data/campaigns/${id}`), c = d.campaign;
    const cols = "56px 1.4fr 1fr 90px 90px 110px 90px";
    setPage(ph(esc(c.name), `${c.url && safeHref(c.url) !== "#" ? `<a class="btn" href="${esc(safeHref(c.url))}" target="_blank" rel="noopener" data-full>${ico(I.link, 16)} Open</a>` : ""}<button class="btn" id="edc">Edit</button>`, esc(rate(c)))
      + `<div class="card strip">${[["My views", c.views], ["My earnings", c.est_usd, "usd"], ["Paid", c.paid_usd, "usd"], ["Clips submitted", c.submitted, "int"]].map(([l, v, f]) => `<div class="cell"><div class="lbl">${l}</div><div class="v ${f === "usd" ? "money" : ""}">${count(v, f || "k")}</div></div>`).join("")}</div>
<div class="card"><div class="ch">Estimated earnings</div>${lineChart("camp", d.days, [{ data: d.daily.map((x) => x.est) }], { fmtV: fmtUsd0, tipFn: (i) => `${dayLbl(d.days[i])} · ${fmtUsd(d.daily[i].est)} · ${fmtK(d.daily[i].views)} views` })}</div>
<div class="card"><div class="ch">Clips</div>${d.clips.length ? `<div class="tbl"><div class="tr th" style="grid-template-columns:${cols}"><span></span><span>Clip</span><span>Channel</span><span class="r">Views</span><span class="r">Est.</span><span>Submitted</span><span class="r">Paid</span></div>${d.clips.map((p) => `<button class="tr" data-post="${p.id}" style="grid-template-columns:${cols};padding-top:6px;padding-bottom:6px"><video class="thumb" data-lazy="${esc(p.clip_url)}#t=0.5" preload="none" muted></video><span class="ell">${esc(p.title || p.caption || "Clip")}</span><span class="ell">${pdot(p.platform)} @${esc(p.handle)}</span><span class="r">${fmt(p.views, "int")}</span><span class="r money">${estCell(p.est_usd, p.views, c)}</span><span>${p.submitted ? badge(p.submitted === "submitted" ? "Pending" : p.submitted[0].toUpperCase() + p.submitted.slice(1), p.submitted === "rejected" ? "critical" : p.submitted === "submitted" ? "warning" : "success") : badge("Not yet", "warning")}</span><span class="r">${p.paid_usd != null ? fmtUsd(p.paid_usd) : "—"}</span></button>`).join("")}</div>` : empty("No clips in this campaign yet", "Pick this campaign when you schedule a clip.", `<a class="btn" href="/clips">Post a clip</a>`, I.clips)}</div>
${c.rules ? `<div class="card"><div class="ch">Rules</div><div class="cb" style="white-space:pre-wrap">${esc(c.rules)}</div></div>` : ""}`);
    lazyVids(); $("#edc").onclick = () => campaignModal(c);
  }

  /* ---------- Earnings ---------- */
  async function earningsPage() {
    setPage(ph("Earnings") + kpiSkel() + chartSkel("Daily estimated earnings") + listSkel("By campaign", 3));
    const d = await api("/ui/data/earnings"), t = d.totals;
    let mode = "bar";
    const chart = () => lineChart("earn", d.days, [{ data: d.daily.map((x) => x.est) }], { bars: mode === "bar", fmtV: fmtUsd0, tipFn: (i) => `${dayLbl(d.days[i])} · ${fmtUsd(d.daily[i].est)} · ${fmtK(d.daily[i].views)} views` });
    const cols = "1.6fr 1.2fr 70px 100px 100px 100px 100px";
    const sum = (k) => d.campaigns.reduce((a, c) => a + (c[k] || 0), 0);
    setPage(ph("Earnings") + `<div class="card strip">${[["Est. this month", t.est_month], ["Est. all time", t.est_all], ["Paid out", t.paid], ["Pending", t.pending]].map(([l, v]) => `<div class="cell"><div class="lbl">${l}</div><div class="v money">${count(v, "usd")}</div></div>`).join("")}</div>
<div class="card"><div class="ch"><span class="grow">Daily estimated earnings</span>${segm("em", [["bar", "Bars"], ["area", "Area"]], mode)}</div><div id="ec">${chart()}</div></div>
<div class="card"><div class="ch">By campaign</div>${d.campaigns.length ? `<div class="tbl" style="overflow-x:auto"><div style="min-width:720px"><div class="tr th" style="grid-template-columns:${cols}"><span>Campaign</span><span>Rate</span><span class="r">Clips</span><span class="r">Views</span><span class="r">Est.</span><span class="r">Paid</span><span class="r">Pending</span></div>
${d.campaigns.map((c) => `<a class="tr" href="/campaigns/${c.id}" style="grid-template-columns:${cols};color:inherit"><span class="ell">${esc(c.name)}</span><span class="ell lbl">${esc(rate(c))}</span><span class="r">${c.clips}</span><span class="r">${fmt(c.views, "int")}</span><span class="r money">${fmtUsd(c.est_usd)}${c.held_note ? `<span class="held" style="display:block">${esc(c.held_note)}</span>` : ""}</span><span class="r">${fmtUsd(c.paid_usd)}</span><span class="r">${fmtUsd(c.pending_usd)}</span></a>`).join("")}
<div class="tr tot" style="grid-template-columns:${cols}"><span>Total</span><span></span><span class="r">${sum("clips")}</span><span class="r">${fmt(sum("views"), "int")}</span><span class="r money">${fmtUsd(sum("est_usd"))}</span><span class="r">${fmtUsd(sum("paid_usd"))}</span><span class="r">${fmtUsd(sum("pending_usd"))}</span></div></div></div>` : empty("No campaigns yet", "", `<a class="btn" href="/campaigns">Add campaign</a>`, I.camp)}
<div class="note" style="padding:10px 16px;border-top:1px solid var(--border)">Estimate per clip = views ÷ 1,000 × rate, kept between the campaign's min and max. Clips under the minimum show $0.</div></div>`);
    bindSeg("em", (v) => { mode = v; fill("#ec", chart()); });
  }

  /* ---------- Settings ---------- */
  async function settings() {
    setPage(ph("Settings") + listSkel("Channels setup", 3));
    const b = await loadBoot();
    setPage(ph("Settings") + `<div class="card"><div class="ch"><span class="grow">Channels setup</span></div>${PLATS.map((p) => { const [bd, help] = stateRow(p, b.setup[p]); return `<div class="row">${tile(p)}<span class="t"><b>${PN[p]}</b><span>${esc(help)}</span></span>${bd}<button class="link" data-adv="${p}" ${b.setup[p].state === "needs_alex" ? "" : "hidden"}>Keys</button></div>`; }).join("")}<div class="row" style="justify-content:flex-end"><button class="link muted" id="showadv" style="font-size:12px">Advanced (only if Claude asks)</button></div></div>
<div class="card"><div class="ch">Posting</div>
<div class="row"><span class="t"><b>Default spread</b><span>Time between posts when you pick several channels.</span></span>${segm("sp", [["0", "0"], ["15", "15 min"], ["30", "30 min"], ["60", "60 min"]], String(b.spread))}</div>
<div class="row"><span class="t"><b>Pause all posting</b><span>Queued posts wait until you turn this off.</span></span><button class="tog ${b.paused ? "on" : ""}" id="pause" aria-label="Pause all posting"></button></div>
<div class="row"><span class="t"><b>Time zone</b><span>All times in mob.</span></span><span class="muted">Athens</span></div></div>
<div class="card"><div class="ch">Access</div>
<div class="row"><span class="t"><b>Password</b><span>Claude changes it for you on request.</span></span><a class="btn" href="/logout" data-full>Sign out</a></div>
<div class="row"><span class="t"><b>Claude</b><span>${b.claude_seen ? `Claude connected · last seen ${whenTxt(b.claude_seen)}` : "Claude has not checked in yet."}</span></span>${b.claude_seen ? badge("Connected", "success") : badge("Waiting")}</div></div>`);
    bindSeg("sp", async (v) => { await api("/ui/act/settings", { spread: Number(v) }); S.boot.spread = Number(v); toast("Saved"); });
    // Safety control: saved the moment it flips (no save bar). On failure it flips back and says so.
    $("#pause").onclick = async (e) => {
      const t = e.currentTarget, want = !t.classList.contains("on"); t.classList.toggle("on", want); t.disabled = true;
      try { await api("/ui/act/settings", { paused: want }); toast(want ? "Posting paused" : "Posting on"); }
      catch (err) { t.classList.toggle("on", !want); toast(err.message || "Not saved", { error: true }); }
      finally { t.disabled = false; }
    };
    $("#showadv") && ($("#showadv").onclick = () => { $$("[data-adv]").forEach((x) => (x.hidden = false)); $("#showadv").remove(); });
    $$("[data-adv]").forEach((x) => (x.onclick = () => keysModal(x.dataset.adv, b.setup[x.dataset.adv])));
  }
  function keysModal(p, s) {
    const fld = (id, label) => `<label class="fld"><span>${label}</span><span style="display:flex;gap:6px"><input class="in mono" id="${id}" type="password" autocomplete="off" spellcheck="false" placeholder="${s.client_id_hint && id === "kid" ? "…" + esc(s.client_id_hint) : ""}"><button class="btn" type="button" data-eye="${id}" aria-label="Show">${ico(I.eye, 16)}</button><button class="btn" type="button" data-cp="${id}" aria-label="Copy">${ico(I.copy, 16)}</button></span></label>`;
    modal(`<div class="mh"><b>${PN[p]} keys</b><button class="x" data-close>${ico(I.x, 16)}</button></div><div class="mb">
<p class="hint" style="margin:0">Claude fills this in for you. Only change it if Claude asks.</p>${fld("kid", "App ID")}${fld("ksec", "App key")}
<div class="teststrip"><span style="flex:1">Test</span>${stateRow(p, s)[0]}</div></div>
<div class="mf"><button class="btn" data-close>Cancel</button><button class="btn pri" id="ksave">Save</button></div>`, {
      onMount: (m) => {
        $$("[data-eye]", m).forEach((b) => (b.onclick = () => { const i = $("#" + b.dataset.eye, m); i.type = i.type === "password" ? "text" : "password"; }));
        $$("[data-cp]", m).forEach((b) => (b.onclick = () => { navigator.clipboard?.writeText($("#" + b.dataset.cp, m).value); toast("Copied"); }));
        $$("[data-cpv]", m).forEach((b) => (b.onclick = () => { navigator.clipboard?.writeText(b.dataset.cpv); toast("Copied"); }));
        $("#ksave", m).onclick = async () => { try { await api("/ui/act/keys", { platform: p, id: $("#kid", m).value.trim(), secret: $("#ksec", m).value.trim() }); closeModal(); toast(`${PN[p]} saved`); render(); } catch (e) { toast(e.message, { error: true }); } };
      },
    });
  }

  /* ---------- Welcome (first run) ---------- */
  async function welcome(qs) {
    clearTimers();
    let step = Number(qs.get("step") || (qs.get("connected") ? 3 : 1));
    const conn = qs.get("connected");
    root.innerHTML = `<div class="welcome"><div class="wglow" aria-hidden="true"></div><div class="wcard"><div class="steps" id="wsteps"></div><div class="wbody" id="wb"></div></div></div>`;
    let b = await loadBootQuiet();
    let prev = null;
    const dots = () => ($("#wsteps").innerHTML = [1, 2, 3, 4, 5].map((i) => `<i class="${i === step ? "on" : ""}"></i>`).join(""));
    const rows = (flash = []) => PLATS.map((p) => {
      const s = b.setup[p];
      const map = { setting_up: [badge("Claude is setting this up", "info", "withspin"), s.note || `Preparing ${PN[p]} for you. Nothing to do.`], activating: [badge("Claude is setting this up", "info", "withspin"), "Activating, about a minute."],
        needs_alex: [badge("One step for you", "warning"), s.note || "Claude needs you for one step."], ready: [badge("Ready", "success"), "One click to connect any channel."],
        connected: [badge("Connected", "success"), b.accounts.filter((a) => a.platform === p).map((a) => "@" + a.handle).join(", ")], not_set_up: [badge("Not set up"), "Claude will prepare this for you."] };
      const [bd, help] = map[s.state];
      const act = s.state === "ready" ? `<a class="btn pri" href="/connect/${p}?from=welcome" data-full>Connect</a>` : s.state === "not_set_up" ? `<button class="btn" data-ask="${p}">Ask Claude</button>` : "";
      return `<div class="row ${flash.includes(p) ? "tint" : ""}" data-wp="${p}" style="padding:10px 0">${tile(p)}<span class="t"><b>${PN[p]}</b><span>${esc(help)}</span></span>${bd}${act}</div>`;
    }).join("");
    let lastStep = step;
    const draw = async () => {
      dots();
      const wb = $("#wb");
      if (lastStep !== step) { wb.classList.remove("wstep-in"); void wb.offsetWidth; wb.classList.add("wstep-in"); lastStep = step; }
      if (step === 1) wb.innerHTML = `<span class="tile l wlogo" style="background:var(--topbar)"><img src="${LOGO}" width="24" height="24" alt=""></span><h2>Welcome to mob.</h2><p>Post your clips everywhere. Track every view. See what you earn.</p><button class="btn pri" style="height:40px" id="nx">Start</button>`;
      if (step === 2) wb.innerHTML = `<h2>Your channels.</h2><p>Claude prepares each platform. You only press Connect.</p><div id="wrows">${rows()}</div><button class="btn pri" style="height:40px" id="nx">Continue</button>`;
      if (step === 3) {
        const ready = PLATS.filter((p) => ["ready", "connected"].includes(b.setup[p].state));
        const acc = conn ? b.accounts.filter((a) => a.platform === conn).slice(-1)[0] : null;
        let ov = null; if (acc) { try { ov = (await api("/ui/data/overview?range=30d")).accounts.find((a) => a.id === acc.id); } catch { } }
        wb.innerHTML = `<h2>Connect your first channel.</h2>${acc ? `<div style="display:flex;align-items:center;gap:12px"><svg class="check" viewBox="0 0 44 44"><circle cx="22" cy="22" r="21" fill="var(--b-success-bg)"/><path d="M13 22.5 19.5 29 31 16" fill="none" stroke="var(--success)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>${avatar(ov || acc)}<div><b>@${esc(acc.handle)}</b><div class="lbl">${ov ? `<span data-count="${ov.followers || 0}" data-fmt="k">0</span> followers · <span data-count="${ov.views || 0}" data-fmt="k">0</span> views` : PN[acc.platform]}</div></div></div>` : ""}
${ready.length ? ready.map((p) => `<a class="btn big" href="/connect/${p}?from=welcome" data-full>${tile(p)}Continue with ${PN[p]}</a>`).join("") : `<p>Claude is still preparing your platforms. This page updates on its own.</p><div id="wrows">${rows()}</div>`}
<button class="btn" style="height:36px" id="nx">${b.accounts.length ? "Continue" : "Skip for now"}</button>`;
        animate(wb);
        if (conn && acc) toast(`${PN[conn]} connected`);
      }
      if (step === 4) wb.innerHTML = `<h2>Add a campaign</h2><p>Paste a Content Rewards link. mob fills in the rate and the payouts.</p><label class="fld"><span>Content Rewards link</span><input class="in" id="wcu" type="url" placeholder="https://contentrewards.com/…"></label><div style="display:flex;gap:8px"><button class="btn" style="height:36px" id="nx">Skip</button><button class="btn pri" style="height:36px;flex:1" id="wadd">Add</button></div>`;
      if (step === 5) {
        wb.innerHTML = `<h2>You're live.</h2><p>Here is where your numbers land.</p><div id="wk">${kpiSkel()}</div><button class="btn pri" style="height:40px" id="nx">Go to Home</button>`;
        api("/ui/data/overview?range=30d").then((o) => { setTimeout(() => fill("#wk", kpis(o)), 600); });
      }
      animate(wb);
      $$("[data-ask]", wb).forEach((x) => (x.onclick = async () => { await api("/ui/act/ask", { platform: x.dataset.ask }); toast(`Claude will set up ${PN[x.dataset.ask]}`); x.outerHTML = badge("Asked Claude", "info"); }));
      const nx = $("#nx", wb); if (nx) nx.onclick = async () => { if (step === 5) { await api("/ui/act/settings", { welcomed: true }); S.boot = null; history.pushState(null, "", "/"); root.innerHTML = ""; return render(); } step++; history.replaceState(null, "", `/welcome?step=${step}`); draw(); };
      const wa = $("#wadd", wb); if (wa) wa.onclick = async () => { const u = $("#wcu", wb).value.trim(); if (!u) return toast("Paste the campaign link", { error: true }); try { await api("/ui/act/campaigns", { url: u, name: u.replace(/^https?:\/\/(www\.)?/, "").split(/[/?#]/).filter(Boolean).slice(-1)[0] || "Campaign" }); toast("Campaign added"); step++; draw(); } catch (e) { toast(e.message, { error: true }); } };
    };
    await draw();
    // Live setup states: every 5 s; a row that changes flashes.
    S.timers.push(setInterval(async () => {
      if (!$("#wrows")) return;
      const st = await api("/ui/data/setup"); prev = b.setup; b.setup = st;
      const ch = PLATS.filter((p) => st[p].state !== prev[p].state);
      if (ch.length) { if (step === 3) draw(); else fill("#wrows", rows(ch)); }
    }, 5000));
  }
  async function loadBootQuiet() { S.boot = await api("/ui/data/boot"); return S.boot; }

  /* ---------- start ---------- */
  (async () => {
    // The server can answer one address with another page (e.g. /connect/youtube before the platform is ready).
    if (root.dataset.route === "/welcome" && location.pathname !== "/welcome") history.replaceState(null, "", "/welcome?step=2");
    render();
  })();
}

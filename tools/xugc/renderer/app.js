/* XUGC screens. Everything it knows comes from the main process; nothing here talks to the network. */
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
let S = null, META = null;
const ui = { refs: null, view: "create", look: "Demo", secs: 15, qual: "hd", avmode: "broad", avatar: "maya", current: null, busy: false, t0: 0, timer: null, est: null, edit: null };

const src = (p) => (!p ? "" : "file://" + encodeURI(p));
const money = (n) => "$" + Number(n).toFixed(2);
const clock = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const esc = (t) => String(t == null ? "" : t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const ago = (t) => { if (!t) return "never"; const s = Math.round((Date.now() - t) / 1000); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`; };
const showErr = (el, msg) => { el.textContent = msg || ""; el.classList.toggle("on", !!msg); };

async function refresh(r) { const v = r || (await window.xugc.get()); S = v.state; META = v; ui.est = await window.xugc.estimate(ui.secs, ui.qual); renderAll(); }

function seg(el, items, cur, on) {
  el.innerHTML = "";
  for (const [k, label] of items) { const b = document.createElement("button"); b.className = k === cur ? "on" : ""; b.textContent = label; b.onclick = () => on(k); el.appendChild(b); }
}

function renderChips() {
  const c = $("#modechip");
  if (!META.keySet) { c.className = "chip warnchip"; c.textContent = "NO RUNPOD KEY · add it in Settings"; c.onclick = () => setView("settings"); }
  else { c.className = "chip hot"; c.onclick = null; c.innerHTML = `RUNPOD · <b>${money(META.usedToday)}</b> of ${money(S.settings.capDay)} today`; }
  $("#buildchip").textContent = "Build " + META.build; $("#s-build").textContent = META.build;
}

function renderCreate() {
  const missing = !META.keySet ? ["a RunPod key", "settings"] : !META.hfSet ? ["a Hugging Face token", "settings"] : null;
  const w = $("#nokey"); w.style.display = missing ? "block" : "none";
  if (missing) { w.innerHTML = `Before the first video: add ${missing[0]} in <button id="gokey">Settings</button>.`; $("#gokey").onclick = () => setView("settings"); }
  const p = S.product;
  $("#purl").placeholder = "https://yourstore.com/products/…";
  if (p && (!ui.refs || ui.refsFor !== p.url)) { ui.refs = p.images.slice(0, 1); ui.refsFor = p.url; }
  if (!p) ui.refs = null;
  const ph = $("#pphotos"); ph.innerHTML = "";
  if (p) p.images.slice(0, 24).forEach((u) => { const im = document.createElement("img"); im.src = u; im.className = ui.refs.includes(u) ? "sel" : ""; im.title = "Tap to lock the video to this photo (up to 3)"; im.onclick = () => { ui.refs = ui.refs.includes(u) ? ui.refs.filter((x) => x !== u) : [...ui.refs, u].slice(-3); renderCreate(); }; ph.appendChild(im); });
  $("#pfound").innerHTML = p ? `<b>${esc(p.title)}</b>${p.price ? " · " + esc(p.currency) + " " + esc(p.price) : ""}${p.images.length ? " · " + p.images.length + " photos, " + (ui.refs || []).length + " locked" : ""} <button class="btn" id="pclear" style="padding:2px 9px;margin-left:6px">Remove</button>` : "No product yet. The scene alone will do, but a product makes it specific.";
  if (p) $("#pclear").onclick = () => window.xugc.clearProduct().then(refresh);
  $$("#avmode button").forEach((b) => { b.classList.toggle("on", b.dataset.m === ui.avmode); b.onclick = () => { ui.avmode = b.dataset.m; renderCreate(); }; });
  $("#avpick").style.display = ui.avmode === "pick" ? "flex" : "none"; $("#avown").style.display = ui.avmode === "own" ? "block" : "none";
  seg($("#avpick"), META.avatars.filter((a) => a !== "broad").map((a) => [a, a[0].toUpperCase() + a.slice(1)]), ui.avatar, (k) => { ui.avatar = k; renderCreate(); });
  $("#avnote").textContent = ui.avmode === "broad" ? "Broad = the scene picks an ordinary, real-looking person." : ui.avmode === "pick" ? "A ready-made description of that person goes into the prompt." : "Describe the person in your own words.";
  seg($("#looks"), META.looks.map((l) => [l, l]), ui.look, (k) => { ui.look = k; renderCreate(); });
  seg($("#secs"), META.seconds.map((s) => [s, s + "s"]), ui.secs, (k) => { ui.secs = Number(k); refresh(); });
  seg($("#quals"), Object.entries(META.qualities), ui.qual, (k) => { ui.qual = k; refresh(); });
  const on = META.style.filter((f) => f.on);
  $("#stylon").textContent = on.length ? `Style Bible: ${on.length} on` : "Style Bible off";
  $("#stylchips").innerHTML = META.style.map((f) => `<span class="${f.on ? "" : "off"}">${esc(f.name)}</span>`).join("");
  $("#goest").textContent = ui.est ? `up to ${money(ui.est.usd)} · about ${ui.est.minutes} min` : "";
  $("#go").disabled = ui.busy || !!META.busy;
  const tk = $("#takes"); tk.innerHTML = "";
  if (!S.takes.length) tk.innerHTML = `<div class="empty">Your videos appear here.</div>`;
  S.takes.forEach((t, i) => { const d = document.createElement("div"); d.className = "take" + (ui.current === t.id ? " on" : ""); d.innerHTML = `<video muted preload="metadata" src="${src(t.video)}#t=0.5"></video><span>TAKE ${S.takes.length - i}</span>`; d.onclick = () => { ui.current = t.id; showTake(t); renderCreate(); }; tk.appendChild(d); });
}

function showTake(t) {
  const v = $("#pv"); $("#idle").style.display = "none"; v.style.display = "block"; v.src = src(t.video); v.muted = true; v.play().catch(() => {});
  $("#ptag").textContent = `TAKE · ${t.seconds}s · ${money(t.cost)}`;
  $("#verd").style.visibility = "visible"; $("#vup").classList.toggle("on", t.verdict === "up"); $("#vdown").classList.toggle("on", t.verdict === "down");
  $("#hint").textContent = `${t.minutes} min on the GPU · ${t.audio ? "with sound (tap the speaker)" : "no sound track found"}`;
}

function renderLibrary() {
  const g = $("#libgrid"); g.innerHTML = "";
  if (!S.takes.length) { g.innerHTML = `<div class="note">Nothing here yet. Make a video in Create.</div>`; return; }
  S.takes.forEach((t) => {
    const d = document.createElement("div"); d.className = "card";
    d.innerHTML = `<video muted loop playsinline preload="metadata" src="${src(t.video)}#t=0.5"></video><span class="v">${t.verdict === "up" ? "👍" : t.verdict === "down" ? "👎" : ""}</span><div class="m"><b>${esc(t.look || "Take")} · ${t.seconds}s</b>${money(t.cost)} · ${new Date(t.at).toLocaleString()}</div>`;
    const v = d.querySelector("video"); d.onmouseenter = () => v.play().catch(() => {}); d.onmouseleave = () => v.pause();
    d.onclick = () => { ui.current = t.id; setView("create"); showTake(t); renderCreate(); };
    g.appendChild(d);
  });
}

function renderTrain() {
  const f = $("#files"); f.innerHTML = "";
  META.style.forEach((x) => {
    const d = document.createElement("div"); d.className = "file" + (ui.edit === x.name ? " sel" : "");
    d.innerHTML = `<div class="ic">.MD</div><div><code>${esc(x.name)}</code><small>${esc(x.note)}</small></div><div class="x">${x.lines} lines</div><div class="tg ${x.on ? "" : "off"}"></div>`;
    d.querySelector(".tg").onclick = (e) => { e.stopPropagation(); window.xugc.styleToggle(x.name, !x.on).then(refresh); };
    d.onclick = async () => { ui.edit = x.name; $("#edwrap").style.display = "block"; $("#edname").textContent = x.name; $("#editor").value = await window.xugc.styleRead(x.name); showErr($("#ederr"), ""); renderTrain(); };
    f.appendChild(d);
  });
  $("#n-clips").textContent = S.dataset.length; $("#n-appr").textContent = S.dataset.filter((c) => c.source === "approved").length;
  const list = $("#cliplist"); list.innerHTML = "";
  S.dataset.forEach((c) => {
    const d = document.createElement("div"); d.className = "clip";
    d.innerHTML = `<video muted loop playsinline preload="metadata" src="${src(c.file)}#t=0.5"></video><div><b>${esc(c.name)}</b><small>${c.source === "approved" ? "from your 👍 takes" : "yours"}</small></div><button class="x" title="Remove">✕</button>`;
    const v = d.querySelector("video"); d.onmouseenter = () => v.play().catch(() => {}); d.onmouseleave = () => v.pause();
    d.querySelector("button").onclick = () => window.xugc.removeClip(c.id).then(refresh);
    list.appendChild(d);
  });
}

function renderMcp() {
  const m = META.mcp;
  $("#mcp-on").classList.toggle("on", m.on); $("#mcp-off").classList.toggle("on", !m.on);
  $("#mcpstate").innerHTML = !m.on ? `<span class="dot"></span>Off. Claude cannot do anything.` : m.connected ? `<span class="dot on"></span>Connected to the XUGC line · Claude last called ${ago(m.claudeSeen)}` : `<span class="dot"></span>Not reachable right now (offline?). It retries by itself.`;
  $("#mcpurl").textContent = m.url;
  $("#mcplog").innerHTML = m.log.length ? m.log.slice().reverse().map((l) => `<div><b>${new Date(l.at).toLocaleTimeString()}</b> ${esc(l.line)}</div>`).join("") : "Nothing yet.";
}

function renderSettings() {
  for (const [id, k] of [["#cap-job", "capJob"], ["#cap-day", "capDay"]]) if ($(id) !== document.activeElement) $(id).value = S.settings[k];
  if ($("#volid") !== document.activeElement) $("#volid").value = S.settings.volumeId || "";
  $("#keystate").textContent = META.keySet ? `Key saved (${META.keyTail}). It stays on this Mac.` : "No key saved.";
  $("#hfstate").textContent = META.hfSet ? `Token saved (${META.hfTail}). It stays on this Mac.` : "No token saved.";
}

function renderAll() { renderChips(); renderCreate(); renderLibrary(); renderTrain(); renderMcp(); renderSettings(); }
function setView(v) { ui.view = v; $$(".view").forEach((x) => x.classList.toggle("on", x.id === "v-" + v)); $$("#nav button").forEach((b) => b.classList.toggle("on", b.dataset.view === v)); if (v === "mcp") refresh(); }

/* ---- the render screen: stars streaming past, code pulsing down ---- */
const cv = $("#cv"), g = cv.getContext("2d"); let stars = [], rain = [], raf = 0, hudLines = [];
function sizeCv() { const r = cv.getBoundingClientRect(); cv.width = Math.max(1, r.width * devicePixelRatio); cv.height = Math.max(1, r.height * devicePixelRatio); }
function initFx() {
  sizeCv(); const W = cv.width, H = cv.height;
  stars = Array.from({ length: 160 }, () => ({ a: Math.random() * 6.283, d: Math.random() * 0.9, s: 0.15 + Math.random() * 0.9 }));
  rain = Array.from({ length: 18 }, () => ({ x: Math.random() * W, y: Math.random() * H, v: (0.8 + Math.random() * 2.2) * devicePixelRatio, t: Array.from({ length: 10 }, () => "01{}<>/=;"[Math.floor(Math.random() * 9)]) }));
}
function fx() {
  const W = cv.width, H = cv.height, cx = W / 2, cy = H * 0.38;
  g.fillStyle = "rgba(4,5,12,.22)"; g.fillRect(0, 0, W, H);
  const pulse = 1 + 0.5 * Math.sin(Date.now() / 420);
  for (const s of stars) {
    s.d += 0.004 * s.s * pulse; if (s.d > 1) { s.d = 0.02; s.a = Math.random() * 6.283; }
    const r = s.d * Math.max(W, H) * 0.75, x = cx + Math.cos(s.a) * r, y = cy + Math.sin(s.a) * r, l = 2 + s.d * 14 * s.s;
    g.strokeStyle = `rgba(${s.s > 0.7 ? "215,255,31" : "200,220,255"},${Math.min(1, s.d * 1.3)})`; g.lineWidth = Math.max(1, s.d * 2.2) * devicePixelRatio;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(s.a) * l * devicePixelRatio, y + Math.sin(s.a) * l * devicePixelRatio); g.stroke();
  }
  g.font = `${11 * devicePixelRatio}px ui-monospace,Menlo,monospace`;
  for (const c of rain) {
    c.y += c.v; if (c.y > H + 140) { c.y = -140; c.x = Math.random() * W; }
    c.t.forEach((ch, i) => { g.fillStyle = `rgba(215,255,31,${0.5 - i * 0.05})`; g.fillText(ch, c.x, c.y - i * 13 * devicePixelRatio); if (Math.random() < 0.02) c.t[i] = "01{}<>/=;"[Math.floor(Math.random() * 9)]; });
  }
  raf = requestAnimationFrame(fx);
}
function startFx() { $("#render").classList.add("on"); $("#idle").style.display = "none"; initFx(); g.clearRect(0, 0, cv.width, cv.height); cancelAnimationFrame(raf); fx(); hudLines = []; $("#hud").innerHTML = ""; }
function stopFx() { cancelAnimationFrame(raf); $("#render").classList.remove("on"); if (!S.takes.length) $("#idle").style.display = "grid"; }
function hud(line) {
  if (!line || hudLines[hudLines.length - 1] === line) return; hudLines.push(line); hudLines = hudLines.slice(-5);
  $("#hud").innerHTML = hudLines.map((l, i) => `<div class="${i < hudLines.length - 2 ? "d" : ""}${i === hudLines.length - 1 ? " cur" : ""}">${esc("> " + l)}</div>`).join("");
}
function progress(p) {
  $("#hp").textContent = Math.round(p.pct) + "%"; $("#hb").style.width = p.pct + "%";
  $("#hc").textContent = money(p.costUsd || 0) + " SO FAR"; $("#hs").textContent = String(p.stage || "").toUpperCase().slice(0, 28);
  hud(p.stage); if (p.log) hud(String(p.log).slice(0, 90));
}
window.xugc.onJob(progress);

/* ---- events ---- */
$$("#nav button").forEach((b) => (b.onclick = () => setView(b.dataset.view)));
$("#pfetch").onclick = async () => {
  showErr($("#perr"), ""); const u = $("#purl").value.trim(); if (!u) return; $("#pfetch").textContent = "…";
  const r = await window.xugc.fetchProduct(u); $("#pfetch").textContent = "Fetch";
  if (r.error) { showErr($("#perr"), r.error); return; } $("#purl").value = ""; await refresh(r);
};
$("#purl").onkeydown = (e) => { if (e.key === "Enter") $("#pfetch").click(); };

$("#go").onclick = async () => {
  if (ui.busy) return; showErr($("#err"), "");
  const scene = $("#script").value.trim();
  if (scene.length < 10) return showErr($("#err"), "Write what happens in the video (a sentence or two).");
  ui.busy = true; ui.t0 = Date.now(); startFx(); $("#hs").textContent = "STARTING"; $("#ht").textContent = "0:00"; $("#hp").textContent = "0%"; $("#hb").style.width = "2%"; $("#hc").textContent = "$0.00 SO FAR"; $("#ptag").style.display = "none";
  clearInterval(ui.timer); ui.timer = setInterval(() => { $("#ht").textContent = clock(Date.now() - ui.t0); }, 500); renderCreate();
  const r = await window.xugc.generate({ scene, look: ui.look, avatar: ui.avmode === "pick" ? ui.avatar : ui.avmode === "broad" ? "broad" : undefined, avatarText: ui.avmode === "own" ? $("#avown").value : undefined, seconds: ui.secs, quality: ui.qual, refs: ui.refs && ui.refs.length ? ui.refs : undefined });
  ui.busy = false; clearInterval(ui.timer); $("#ptag").style.display = "block"; stopFx();
  if (r.error) { await refresh(r); showErr($("#err"), r.error + (r.costUsd ? ` (This attempt cost ${money(r.costUsd)}.)` : "")); return; }
  ui.current = r.take.id; await refresh(r); showTake(r.take);
};
$("#stop").onclick = () => window.xugc.cancel();
$("#vup").onclick = async () => { if (!ui.current) return; await window.xugc.verdict(ui.current, "up").then(refresh); const t = S.takes.find((x) => x.id === ui.current); if (t) showTake(t); };
$("#vdown").onclick = async () => { if (!ui.current) return; await window.xugc.verdict(ui.current, "down").then(refresh); const t = S.takes.find((x) => x.id === ui.current); if (t) showTake(t); };
$("#addclips").onclick = () => window.xugc.addClips().then(refresh);
$("#styleadd").onclick = () => window.xugc.styleAdd().then(refresh);
$("#stylenew").onclick = () => { ui.edit = "new-file.md"; $("#edwrap").style.display = "block"; $("#edname").textContent = "new-file.md (rename it by changing the first line)"; $("#editor").value = "# my-style.md\nWhat this file is for.\n\n## Prompt\n- \n\n## Never\n- \n"; renderTrain(); };
$("#edsave").onclick = async () => {
  const text = $("#editor").value; let name = ui.edit; const h = /^#\s+([a-z0-9][a-z0-9-]*\.md)\s*$/m.exec(text);
  if (name === "new-file.md") name = h ? h[1] : "";
  const r = await window.xugc.styleWrite(name, text);
  if (r.error) return showErr($("#ederr"), r.error);
  ui.edit = name; $("#edname").textContent = name; showErr($("#ederr"), ""); await refresh(r);
};
$("#eddel").onclick = async () => { if (!ui.edit) return; await window.xugc.styleDelete(ui.edit).then(refresh); ui.edit = null; $("#edwrap").style.display = "none"; };

$("#mcp-on").onclick = () => window.xugc.setSettings({ mcpOn: true }).then(refresh);
$("#mcp-off").onclick = () => window.xugc.setSettings({ mcpOn: false }).then(refresh);
$("#mcpcopy").onclick = async () => { await window.xugc.copy(META.mcp.url); $("#mcpcopy").textContent = "Copied"; setTimeout(() => ($("#mcpcopy").textContent = "Copy URL"), 1500); };
setInterval(() => { if (ui.view === "mcp") refresh(); }, 4000);

for (const [id, k] of [["#cap-job", "capJob"], ["#cap-day", "capDay"]]) $(id).onchange = (e) => window.xugc.setSettings({ [k]: e.target.value }).then(refresh);
$("#volid").onchange = (e) => window.xugc.setSettings({ volumeId: e.target.value }).then(refresh);
$("#keysave").onclick = async () => {
  showErr($("#keyerr"), ""); $("#keystate").textContent = "Checking with RunPod…";
  const r = await window.xugc.setKey($("#keyin").value); await refresh(r);
  if (r.error) return showErr($("#keyerr"), r.error);
  $("#keyin").value = ""; $("#keystate").textContent = `Key saved (${META.keyTail}) and it works. ${r.pods} GPU${r.pods === 1 ? "" : "s"} running right now.`;
};
$("#hfsave").onclick = async () => { showErr($("#hferr"), ""); const r = await window.xugc.setHf($("#hfin").value); await refresh(r); if (r.error) return showErr($("#hferr"), r.error); $("#hfin").value = ""; };
$("#sweep").onclick = async () => { const r = await window.xugc.sweep(); await refresh(r); $("#sweepnote").textContent = r.error ? r.error : `Stopped ${r.stopped} GPU${r.stopped === 1 ? "" : "s"}. Nothing of yours is running.`; };

refresh();

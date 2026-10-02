/* XUGC screens. Everything it knows comes from the main process; nothing here talks to the network. */
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
let S = null, META = null;
const ui = { music: "soft", fullEdited: false, rendering: false, refs: null, view: "create", look: "None", secs: 15, qual: "hd", avmode: "broad", avatar: "maya", current: null, busy: false, t0: 0, timer: null, est: null, edit: null };

const src = (p) => (!p ? "" : "file://" + encodeURI(p));
const money = (n) => "$" + Number(n).toFixed(2);
const clock = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const esc = (t) => String(t == null ? "" : t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const ago = (t) => { if (!t) return "never"; const s = Math.round((Date.now() - t) / 1000); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`; };
const showErr = (el, msg) => { el.textContent = msg || ""; el.classList.toggle("on", !!msg); };

// Seedance on fal is the default: it is what Higgsfield's Marketing Studio runs on
const DEF_ENGINE = "seedance";
const AD_ENGINES = ["seedance", "kling", "fal_veo", "fal_wan", "veo"];
// the rented models make an ad from hidden frames + 8 s clips: lengths 8/16/24, presets, no quality setting
const isVeoNow = () => AD_ENGINES.includes(ui.engine || DEF_ENGINE);
// Veo makes 8 s clips, so Real Life lengths are what he is billed for and gets: 8, 16 or 24 s
const secsNow = () => (isVeoNow() ? ui.vsecs || 16 : ui.secs);
async function refresh(r) { if (r) ui.connOpen = null; const v = r || (await window.xugc.get()); S = v.state; META = v; try { ui.est = await window.xugc.estimate(secsNow(), ui.qual, ui.engine || DEF_ENGINE, ui.tier || "lite", ui.res || "720p"); } catch { ui.est = null; } renderAll(); }

function seg(el, items, cur, on) {
  el.innerHTML = "";
  for (const [k, label] of items) { const b = document.createElement("button"); b.className = k === cur ? "on" : ""; b.textContent = label; b.onclick = () => on(k); el.appendChild(b); }
}

function renderChips() {
  const c = $("#modechip");
  if (!META.keySet && !META.googleSet) { c.className = "chip warnchip"; c.textContent = "NO KEY YET · add your Google key in Settings"; c.onclick = () => setView("settings"); }
  else { c.className = "chip hot"; c.onclick = null; c.innerHTML = `SPENT · <b>${money(META.usedToday)}</b> of ${money(S.settings.capDay)} today`; }
  $("#buildchip").textContent = "Build " + META.build; $("#s-build").textContent = META.build;
}

function renderReference() {
  const r = S.reference; $("#refbody").style.display = r ? "flex" : "none"; $("#refdrop").style.display = r ? "none" : ($("#refan").style.display === "flex" ? "none" : "flex");
  if (!r) { if ($("#refan").style.display !== "flex" || $("#refan").classList.contains("done")) $("#refan").style.display = "none"; return; }
  $("#refsheet").src = src(r.sheet) + "?" + r.at;
  $("#refmeta").innerHTML = `<b>${esc(r.name)}</b> · ${r.duration}s · ${r.cuts.length + 1} shots${r.cuts.length ? " (cuts at " + r.cuts.map((c) => c + "s").join(", ") + ")" : ""}`;
  if ($("#refbeats") !== document.activeElement) $("#refbeats").value = r.beats || "";
  $("#refrange").value = r.level; $("#reflvl").textContent = META.levels[r.level];
  $("#refhelp").textContent = ["The reference is ignored.", "Only the mood and energy of the reference go into the prompt.", "The same story beats, in the same order, with different people and our product.", "The same shot order and timing, with different people and our product."][r.level] + (r.beats && r.beats.trim() ? "" : " (Nothing is used until the shots are described above.)");
}
function renderCreate() {
  renderReference();
  const mm = model();
  const missing = mm.need === "fal" ? (!META.falSet ? ["your fal.ai key", "settings"] : null) : mm.need === "google" ? (!META.googleSet ? ["your Google key", "settings"] : null) : !META.keySet ? ["a RunPod key", "settings"] : !META.hfSet ? ["a Hugging Face token", "settings"] : null;
  const w = $("#nokey"); w.style.display = missing ? "block" : "none";
  if (missing) { w.innerHTML = `Before the first video: add ${missing[0]} in <button id="gokey">Settings</button>.`; $("#gokey").onclick = () => setView("settings"); }
  const p = S.product;
  $("#purl").placeholder = "https://yourstore.com/products/…";
  if (p && (!ui.refs || ui.refsFor !== p.url)) { ui.refs = p.images.length ? [p.images[0]] : []; ui.refsFor = p.url; }
  if (!p) ui.refs = null;
  const ph = $("#pphotos"); ph.innerHTML = "";
  if (p) p.images.slice(0, 24).forEach((u) => { const im = document.createElement("img"); im.src = u; im.className = ui.refs.includes(u) ? "sel" : ""; im.title = "Make this the hero photo. Clean photos with no text work best."; im.onclick = () => { ui.refs = [u]; renderCreate(); }; ph.appendChild(im); });
  const tile = $("#ptile"), hero = p && ui.refs && ui.refs[0];
  tile.classList.toggle("empty", !p); $("#phero").style.backgroundImage = hero ? `url("${hero.replace(/"/g, "%22")}")` : "";
  if (!p) ui.sheet = false; tile.classList.toggle("open", !!ui.sheet); $("#psheet").classList.toggle("on", !!ui.sheet);
  tile.onclick = () => { if (p) { ui.sheet = !ui.sheet; renderCreate(); } };
  $("#pfound").innerHTML = p ? `<b>${esc(p.title)}</b>${p.price ? esc(p.currency) + " " + esc(p.price) + " · " : ""}${p.images.length ? p.images.length + " photos, " + (ui.refs || []).length + " locked" : "no photos"} <button class="slink" id="pclear" style="margin-left:6px">Remove</button>` : "No product yet. Paste a link above.";
  if (p) $("#pclear").onclick = (e) => { e.stopPropagation(); window.xugc.clearProduct().then(refresh); };
  renderLocal();
  $$("#avmode button").forEach((b) => { b.classList.toggle("on", b.dataset.m === ui.avmode); b.onclick = () => { ui.avmode = b.dataset.m; renderCreate(); }; });
  $("#avpick").style.display = ui.avmode === "pick" ? "flex" : "none"; $("#avown").style.display = ui.avmode === "own" ? "block" : "none";
  seg($("#avpick"), META.avatars.filter((a) => a !== "broad" && a !== "none").map((a) => [a, a[0].toUpperCase() + a.slice(1)]), ui.avatar, (k) => { ui.avatar = k; renderCreate(); });
  $("#avnote").textContent = ui.avmode === "broad" ? "Broad = the scene picks an ordinary, real-looking person." : ui.avmode === "pick" ? "A ready-made description of that person goes into the prompt." : "Describe the person in your own words.";
  seg($("#looks"), META.looks.map((l) => [l, l]), ui.look, (k) => { ui.look = k; renderCreate(); });
  seg($("#musics"), [["none", "None"], ["soft", "Soft beat"], ["drop", "Beat drop"]], ui.music, (k) => { ui.music = k; renderCreate(); });
  if (isVeoNow()) seg($("#secs"), [8, 16, 24].map((s) => [s, s + "s"]), ui.vsecs || 16, (k) => { ui.vsecs = Number(k); refresh(); });
  else seg($("#secs"), META.seconds.map((s) => [s, s + "s"]), ui.secs, (k) => { ui.secs = Number(k); refresh(); });
  $("#quals").closest(".sec").style.display = model().quality ? "" : "none";
  seg($("#quals"), Object.entries(META.qualities), ui.qual, (k) => { ui.qual = k; refresh(); });
  const on = META.style.filter((f) => f.on);
  $("#stylon").textContent = on.length ? `Style Bible: ${on.length} on` : "Style Bible off";
  $("#styltog").textContent = (ui.stylOpen ? "Hide" : "Show") + " the style files"; $("#stylchips").style.display = ui.stylOpen ? "flex" : "none"; $("#styltog").onclick = () => { ui.stylOpen = !ui.stylOpen; renderCreate(); };
  $("#stylchips").innerHTML = META.style.map((f) => `<span class="${f.on ? "" : "off"}">${esc(f.name)}</span>`).join("");
  $("#goest").textContent = ui.est ? `up to ${money(ui.est.usd)} · about ${ui.est.minutes} min` : "";
  $("#go").disabled = ui.busy || !!META.busy;
  const tk = $("#takes"); tk.innerHTML = "";
  if (!S.takes.length) tk.innerHTML = `<div class="empty">Your videos appear here.</div>`;
  S.takes.forEach((t, i) => { const d = document.createElement("div"); d.className = "take" + (ui.current === t.id ? " on" : ""); d.innerHTML = `<video muted preload="metadata" src="${src(t.video)}#t=0.5"></video><span>TAKE ${S.takes.length - i}</span>`; d.onclick = () => { ui.current = t.id; showTake(t); renderCreate(); }; tk.appendChild(d); });
}

function showTake(t) {
  const v = $("#pv"); $("#idle").style.display = "none"; v.style.display = "block"; v.src = src(t.video); v.muted = false; v.volume = 1; v.play().catch(() => { v.muted = true; v.play().catch(() => {}); syncSound(); }); syncSound();
  $("#ptag").textContent = `TAKE · ${t.seconds}s · ${money(t.cost)}`;
  $("#verd").style.visibility = "visible"; $("#vup").classList.toggle("on", t.verdict === "up"); $("#vdown").classList.toggle("on", t.verdict === "down");
  $("#hint").textContent = `${/Veo/.test(t.model || "") ? "Real Life on Google Veo · 720p" : (t.minutes || 0) + " min on the GPU"} · ${t.audio ? "with sound (tap the speaker)" : "no sound track found"}`;
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
  $("#ap-on").classList.toggle("on", !S.settings.autoApprove); $("#ap-off").classList.toggle("on", !!S.settings.autoApprove);
  $("#mcp-on").classList.toggle("on", m.on); $("#mcp-off").classList.toggle("on", !m.on);
  $("#mcpstate").innerHTML = !m.on ? `<span class="dot"></span>Off. Claude cannot do anything.` : m.connected ? `<span class="dot on"></span>Connected to the XUGC line · Claude last called ${ago(m.claudeSeen)}` : `<span class="dot"></span>Not reachable right now (offline?). It retries by itself.`;
  $("#mcpurl").textContent = m.url;
  $("#mcplog").innerHTML = m.log.length ? m.log.slice().reverse().map((l) => `<div><b>${new Date(l.at).toLocaleTimeString()}</b> ${esc(l.line)}</div>`).join("") : "Nothing yet.";
}

function renderSettings() {
  for (const [id, k] of [["#cap-job", "capJob"], ["#cap-day", "capDay"]]) if ($(id) !== document.activeElement) $(id).value = S.settings[k];
  if ($("#volid") !== document.activeElement) $("#volid").value = S.settings.volumeId || "";
  $("#keystate").textContent = META.keySet ? `Key saved (${META.keyTail}). It stays on this Mac.` : "No key saved.";
  $("#gstate").textContent = META.googleSet ? `Key saved (${META.googleTail}). Tested with Google.` : "No key saved.";
  $("#hfstate").textContent = META.hfSet ? `Token saved (${META.hfTail}). It stays on this Mac.` : "No token saved.";
  if (!ui.falMsg) $("#falstate").textContent = META.falSet ? `Key saved (${META.falTail}).` : "Not connected";
  for (const [k, set] of [["fal", META.falSet], ["rp", META.keySet], ["hf", META.hfSet], ["g", META.googleSet]]) {
    const c = $("#c-" + k); $("#" + k + "dot").classList.toggle("on", !!set); c.querySelector(".ctail").classList.toggle("dim", !set);
    const open = !set || ui.connOpen === k; c.classList.toggle("open", open);
    const b = c.querySelector(".cbtn"); b.textContent = set ? (ui.connOpen === k ? "Cancel" : "Replace") : "Connect"; b.style.visibility = set ? "" : "hidden";
    b.onclick = () => { ui.connOpen = ui.connOpen === k ? null : k; renderSettings(); };
  }
}

// One line per model. group "rented" = someone else's GPU, no training; "ours" = our GPU, trainable.
// need: "fal" marks a model that waits for the fal.ai key. quality: the model has a Draft/HD/Max setting.
const MODELS = [
  { id: "seedance", name: "Seedance 2.5", maker: "ByteDance · fal", group: "rented", glyph: "SD", tags: ["with sound", "720p"], rate: () => (ui.res === "480p" ? 0.2205 : 0.473), need: "fal", note: "The Higgsfield Marketing Studio engine. Best people and motion. Hidden frames at the golden-ratio moments; your photos teach the frames only." },
  { id: "kling", name: "Kling 3.0 Pro", maker: "Kuaishou · fal", group: "rented", glyph: "KL", tags: ["with sound"], rate: () => 0.168, need: "fal", note: "Strong hands-on demos and product handling. Start and end frame." },
  { id: "fal_veo", name: "Veo 3.1", maker: "Google · fal", group: "rented", glyph: "V3", tags: ["with sound", "720p"], rate: () => (ui.tier === "fast" ? 0.15 : 0.05), need: "fal", note: "Cheapest with sound (Lite). Good talking heads. Fast tier for more polish." },
  { id: "fal_wan", name: "Wan 3.0", maker: "Alibaba · fal", group: "rented", glyph: "WN", tags: ["with sound", "720p"], rate: () => (ui.res === "480p" ? 0.05 : 0.1), need: "fal", note: "Cheap and quick. Good for testing a script before a Seedance final." },
  { id: "veo", name: "Veo 3.1 direct", maker: "Google key", group: "rented", glyph: "G", tags: ["with sound", "720p"], rate: () => (ui.tier === "fast" ? 0.1 : 0.05), need: "google", note: "Same Veo, billed by Google instead of fal. Only if you add a Google key." },
  { id: "ltx", name: "XUGC fast", maker: "LTX-2.5 · your GPU", group: "ours", glyph: "XF", tags: ["with sound"], quality: true, note: "LTX-2.5 fast, with sound. Trainable with XUGC Real Life." },
  { id: "ltx_full", name: "LTX full", maker: "LTX-2.5 · your GPU", group: "ours", glyph: "LX", tags: ["with sound", "slower"], quality: true, note: "LTX-2.5 full quality, with sound (slower)." },
  { id: "hunyuan", name: "Hunyuan", maker: "HunyuanVideo 1.5 · your GPU", group: "ours", glyph: "HY", tags: ["silent"], quality: true, note: "HunyuanVideo 1.5, silent video." },
  { id: "wan", name: "Wan 2.2", maker: "Wan 2.2 · your GPU", group: "ours", glyph: "WN", tags: ["silent"], quality: true, note: "Wan 2.2, silent video." },
];
const GROUPS = [["rented", "RENTED · NO TRAINING"], ["ours", "OURS · TRAINED"]];
const model = () => MODELS.find((m) => m.id === (ui.engine || DEF_ENGINE)) || MODELS[0];
const needsFal = (m) => (m.need === "fal" && !(META && META.falSet)) || (m.need === "google" && !(META && META.googleSet));
const tagsHtml = (m) => (needsFal(m) ? `<span class="mtag key">needs ${m.need === "google" ? "Google" : "fal"} key</span>` : "") + m.tags.map((t) => `<span class="mtag">${esc(t)}</span>`).join("") + (m.rate ? `<span class="mtag pr">$${m.rate().toFixed(2)}/s + frames</span>` : "");
// Simple line drawings, one per preset, so the cards read at a glance.
const PGLYPH = {
  review: '<rect x="52" y="6" width="22" height="34" rx="4"/><circle cx="63" cy="18" r="5"/><path d="M55 34c2-6 14-6 16 0"/><path d="M80 14c3 3 3 9 0 12M84 10c5 5 5 15 0 20"/>',
  "product-only": '<rect x="54" y="12" width="18" height="24" rx="3"/><path d="M34 36c4-6 10-8 18-6M92 36c-4-6-10-8-18-6"/><path d="M58 18h10"/>',
  unboxing: '<path d="M44 22l19-8 19 8-19 8z"/><path d="M44 22v14l19 8 19-8V22M63 30v14"/><path d="M63 4v6M56 6l3 5M70 6l-3 5"/>',
  "try-on": '<rect x="70" y="6" width="20" height="34" rx="3"/><circle cx="48" cy="12" r="5"/><path d="M48 17v14M40 24h16M48 31l-5 9M48 31l5 9"/>',
  tutorial: '<circle cx="38" cy="23" r="7"/><circle cx="63" cy="23" r="7"/><circle cx="88" cy="23" r="7"/><path d="M45 23h11M70 23h11"/>',
  "breaking-news-start": '<rect x="30" y="8" width="66" height="30" rx="3"/><path d="M30 32h66"/><circle cx="38" cy="16" r="2.5"/><path d="M45 16h18"/>',
  "demo-in-motion": '<circle cx="63" cy="23" r="9"/><path d="M30 23h16M34 15h10M34 31h10"/><path d="M80 14a14 14 0 0 1 0 18"/>',
  "before-after": '<rect x="30" y="8" width="30" height="30" rx="3"/><rect x="66" y="8" width="30" height="30" rx="3"/><path d="M36 30l6-8 5 5 7-9M74 24l5 5 10-11"/>',
};
function placePop() { const r = $("#mpick").getBoundingClientRect(), p = $("#mpop"); p.style.left = r.left + "px"; p.style.width = Math.max(r.width, 340) + "px"; const below = innerHeight - r.bottom - 12, above = r.top - 64; if (below >= Math.min(460, above)) { p.style.top = r.bottom + 6 + "px"; p.style.bottom = "auto"; p.style.maxHeight = Math.min(below, 520) + "px"; } else { p.style.top = "auto"; p.style.bottom = innerHeight - r.top + 6 + "px"; p.style.maxHeight = Math.min(above, 520) + "px"; } }
function openPop(on) { ui.pop = on; $("#mpop").classList.toggle("on", on); $("#mpick").classList.toggle("open", on); if (on) placePop(); }
function pickModel(id) { openPop(false); ui.engine = id; refresh(); }
function renderEngine() {
  const m = model(), cur = m.id;
  $("#mglyph").textContent = m.glyph; $("#mname").textContent = m.name; $("#mmaker").textContent = m.maker; $("#mtags").innerHTML = tagsHtml({ ...m, tags: m.rate ? [] : m.tags.slice(0, 2) });
  $("#engnote").textContent = m.note;
  const E = $("#engines"); E.innerHTML = "";
  for (const [g, label] of GROUPS) {
    const h = document.createElement("div"); h.className = "mgrp"; h.textContent = label; E.appendChild(h);
    for (const x of MODELS.filter((y) => y.group === g)) {
      // Rows waiting for the fal key are not <button>s, so "#engines button" stays the five working engines.
      const r = document.createElement(x.need ? "div" : "button"); r.className = "mitem" + (x.id === cur ? " on" : "") + (needsFal(x) ? " off" : "");
      if (x.need) { r.setAttribute("role", "button"); r.tabIndex = 0; }
      r.dataset.id = x.id;
      r.innerHTML = `<span class="mg">${esc(x.glyph)}</span><span class="mn"><b>${esc(x.name)}</b><small>${esc(x.maker)}</small></span><span class="mtags">${(x.rate ? [] : x.tags).map((t) => `<span class="mtag">${esc(t)}</span>`).join("")}${x.rate ? `<span class="mtag pr">$${x.rate().toFixed(2)}/s</span>` : ""}</span>${needsFal(x) ? '<a class="addk">add key</a>' : ""}`;
      r.onclick = (ev) => { if (ev.target.classList.contains("addk")) { openPop(false); setView("settings"); ui.connOpen = "fal"; renderSettings(); return; } pickModel(x.id); };
      E.appendChild(r);
    }
  }
  const P = $("#presets"); P.innerHTML = "";
  for (const p of META.presets || []) {
    const b = document.createElement("button"); b.className = "pcard" + (p.id === (ui.preset || "review") ? " on" : ""); b.title = p.blurb;
    b.innerHTML = `<svg viewBox="0 0 126 46">${PGLYPH[p.id] || '<rect x="48" y="8" width="30" height="30" rx="4"/>'}</svg><b>${esc(p.name)}</b><span>${esc(p.blurb)}</span>`;
    b.onclick = () => { ui.preset = p.id; renderEngine(); }; P.appendChild(b);
  }
  $("#presetnote").textContent = "";
  seg($("#tiers"), Object.entries(META.veo || {}).filter(([k]) => k !== "standard"), ui.tier || "lite", (k) => { ui.tier = k; refresh(); });
  const isVeo = AD_ENGINES.includes(cur);
  $("#vrow").style.display = isVeo ? "" : "none";
  $("#tiers").closest(".trow").style.display = cur === "veo" || cur === "fal_veo" ? "" : "none";
  // Seedance and Wan bill by resolution: 480p is about half of 720p
  $("#resrow").style.display = cur === "seedance" || cur === "fal_wan" ? "" : "none";
  seg($("#resp"), [["480p", "480p"], ["720p", "720p"]], ui.res || "720p", (k) => { ui.res = k; refresh(); });
  $("#rlrow").style.display = $("#reallife").style.display = $("#rlnote").style.display = m.group === "ours" ? "" : "none";
  $("#gonote").textContent = isVeo ? "Hidden frames, then 8-second clips joined into one video. Billed per video by " + (cur === "veo" ? "Google" : "fal.ai") + "; the price shown is the most it can cost." : "Each video rents a GPU just for that video and hands it back. The price shown is the most it can cost.";
  if (ui.lastEngine && ui.lastEngine !== ui.engine) showErr($("#err"), "");
  ui.lastEngine = ui.engine;
  const have = (S.loras || []).filter((l) => l.model === "ltx").slice(-1)[0], ltx = /^ltx/.test(cur);
  if (!have || !ltx) ui.reallife = false;
  $("#reallife").querySelectorAll("button").forEach((b) => { b.classList.toggle("on", (b.dataset.v === "1") === !!ui.reallife); b.disabled = !have || !ltx; b.onclick = () => { ui.reallife = b.dataset.v === "1"; renderEngine(); }; });
  $("#rlnote").textContent = !ltx ? "Works with the LTX models for now. Hunyuan and Wan get it once their trained file passes its first test." : have ? "Uses your trained file: " + (have.dry ? "dry run" : "full") + ", " + new Date(have.at).toLocaleDateString() + "." : "No trained file yet. Train it in the Train tab.";
}
$("#mpick").onclick = (e) => { e.stopPropagation(); openPop(!ui.pop); };
document.addEventListener("mousedown", (e) => { if (ui.pop && !e.target.closest("#mpop") && !e.target.closest("#mpick")) openPop(false); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && ui.pop) openPop(false); });
addEventListener("resize", () => ui.pop && placePop());
$(".ctl").addEventListener("scroll", () => ui.pop && placePop());
const TR = { model: "ltx", budget: 5 };
async function trainEstimates() {
  const [d, f] = await Promise.all([window.xugc.trainEstimate(TR.model, true), window.xugc.trainEstimate(TR.model, false, TR.budget)]);
  $("#trdryest").textContent = "up to $" + d.usd.toFixed(2); $("#trfullest").textContent = "up to $" + f.usd.toFixed(2); TR.d = d; TR.f = f;
}
function renderRealLife() {
  seg($("#trmodels"), [["ltx", "LTX-2.5 (with sound)"], ["wan", "Wan 2.2"], ["hunyuan", "Hunyuan 1.5"]], TR.model, (k) => { TR.model = k; renderRealLife(); });
  seg($("#trbudget"), [["3", "$3"], ["5", "$5"], ["8", "$8"]], String(TR.budget), (k) => { TR.budget = Number(k); renderRealLife(); });
  trainEstimates();
  const n = S && META ? META.pile : { videos: 0, pieces: 0 };
  if (!ui.collecting) $("#colstat").textContent = ui.lastCollect ? ui.lastCollect : n.pieces ? `${n.videos} videos collected, ${n.pieces} pieces ready to train on.` : "Nothing collected yet. Collect downloads each video on this Mac, cuts it into 3 to 6 second pieces with real sound, and deletes the original.";
  const lt = META && META.lastTrain, rep = $("#trreport");
  rep.style.display = $("#trcopy").style.display = lt ? "" : "none";
  if (lt) { rep.textContent = `LAST TRAINING · ${lt.model} · ${lt.ok ? "finished" : "STOPPED"} · $${(lt.cost || 0).toFixed(2)} · ${new Date(lt.at).toLocaleString()}\n${lt.error ? lt.error + "\n" : ""}${lt.tail || ""}`; $("#trcopy").onclick = () => window.xugc.copy(rep.textContent); }
  const L = $("#lorals"); L.innerHTML = "";
  for (const l of S.loras || []) { const d = document.createElement("div"); d.className = "found"; d.textContent = `XUGC Real Life · ${l.model} · ${l.dry ? "dry run" : "full"} · ${l.clips} pieces · $${l.cost.toFixed(2)} · ${new Date(l.at).toLocaleDateString()}  `; const b = document.createElement("button"); b.className = "btn"; b.textContent = "Delete"; b.onclick = () => window.xugc.loraDelete(l.id).then(refresh); d.appendChild(b); L.appendChild(d); }
}
function askTrain(title, body) { return new Promise((res) => { $("#trmt").textContent = title; $("#trmb").textContent = body; $("#trmodal").style.display = "flex"; $("#trmyes").onclick = () => { $("#trmodal").style.display = "none"; res(true); }; $("#trmno").onclick = () => { $("#trmodal").style.display = "none"; res(false); }; }); }
async function doTrain(dry) {
  showErr($("#trerr"), ""); const e = dry ? TR.d : TR.f;
  if (!e.pieces || e.pieces < 3) { showErr($("#trerr"), "The training pile is empty. Press Collect first."); return; }
  const name = { wan: "Wan 2.2", hunyuan: "Hunyuan 1.5", ltx: "LTX-2.5" }[TR.model];
  if (!(await askTrain(`${dry ? "Dry run" : "Train"} ${name}?`, `This rents a GPU and uses ${e.pieces} pieces. It costs at most $${e.usd.toFixed(2)} and the GPU is handed back when it ends. ${dry ? "A dry run only proves the training works." : "The GPU has up to " + e.minutes + " minutes; about " + (e.setup || 30) + " go on setting up, the rest on training. It saves as it goes and you can stop and keep what is trained. The result is a XUGC Real Life file for " + name + ", kept forever."}`))) return;
  ui.training = true; $("#trdry").style.display = $("#trfull").style.display = "none"; $("#trstop").style.display = ""; $("#trstat").textContent = "Starting…";
  const r = await window.xugc.trainStart({ model: TR.model, dry, budget: dry ? 0 : TR.budget });
  ui.training = false; $("#trdry").style.display = $("#trfull").style.display = ""; $("#trstop").style.display = "none";
  if (r.error) { showErr($("#trerr"), "Training stopped: " + r.error + (r.costUsd ? ` (This attempt cost $${r.costUsd.toFixed(2)}.)` : "")); $("#trstat").textContent = "The GPU was handed back. The report below says what happened."; await refresh(r); return; }
  $("#trstat").textContent = `Done. XUGC Real Life (${name}) trained on ${r.lora.clips} pieces for $${r.lora.cost.toFixed(2)}.`; await refresh(r);
}
$("#linkstarter").onclick = async () => { $("#linkbox").value = await window.xugc.collectStarter(); };
$("#collectgo").onclick = async () => {
  showErr($("#colerr"), ""); const r = await window.xugc.collectRun($("#linkbox").value);
  if (r.error) { showErr($("#colerr"), r.error); return; }
  ui.collecting = true; ui.lastCollect = ""; $("#collectgo").style.display = "none"; $("#collectstop").style.display = ""; $("#colbarw").style.display = ""; $("#colstat").textContent = `Starting… ${r.total} links`;
};
$("#collectstop").onclick = () => window.xugc.collectStop();
window.xugc.onCollect((p) => {
  if (p.state === "finished" || p.state === "error") {
    ui.collecting = false; $("#collectgo").style.display = ""; $("#collectstop").style.display = "none"; $("#colbarw").style.display = "none";
    ui.lastCollect = p.state === "error" ? "Stopped: " + p.why : `Finished. ${p.done} new videos, ${p.pieces} new pieces. ${p.skipped} already had, ${p.failed.length} would not download. In the pile now: ${p.totals.videos} videos, ${p.totals.pieces} pieces.`;
    $("#colstat").textContent = ui.lastCollect;
    window.xugc.get().then(refresh); return;
  }
  $("#colbar").style.width = Math.round((p.n / p.of) * 100) + "%";
  $("#colstat").textContent = `${p.n} of ${p.of} · ${p.creator || ""} · ${p.state === "failed" ? "skipped (" + p.why + ")" : p.state}` + (p.totals ? ` · pile: ${p.totals.videos} videos, ${p.totals.pieces} pieces` : "");
});
$("#trdry").onclick = () => doTrain(true);
$("#trfull").onclick = () => doTrain(false);
$("#trstop").onclick = () => { $("#trstat").textContent = "Finishing: saving what is trained so far…"; window.xugc.trainFinish(); };
window.xugc.onTrain((p) => { if (ui.training) $("#trstat").textContent = `${p.stage} · ${p.minutes || 0} min · $${(p.costUsd || 0).toFixed(2)} so far` + (p.log ? "\n" + String(p.log).slice(0, 140) : ""); });
function renderAll() { renderEngine(); renderRealLife(); renderChips(); renderCreate(); renderLibrary(); renderTrain(); renderMcp(); renderSettings(); }
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
  if (!ui.rendering) beginRender(); railSet(railFor(p.stage));
  $("#hp").textContent = Math.round(p.pct) + "%"; $("#hb").style.width = p.pct + "%";
  $("#hc").textContent = money(p.costUsd || 0) + " SO FAR"; $("#hs").textContent = String(p.stage || "").toUpperCase().slice(0, 28);
  hud(p.stage); if (p.log) hud(String(p.log).slice(0, 90));
}
window.xugc.onJob(progress);

/* ---- Claude working in the app, live ---- */
function typeInto(el, text, done) { el.value = ""; let i = 0; const t = setInterval(() => { el.value = text.slice(0, ++i); if (i >= text.length) { clearInterval(t); done && done(); } }, 22); }
let cbT = 0;
window.xugc.onClaude((e) => {
  const bar = $("#cbar"); clearTimeout(cbT);
  if (e.kind === "start") { setView("create"); bar.classList.add("on"); $("#cbtext").textContent = "CLAUDE · setting up a video"; }
  if (e.kind === "product") { setView("create"); bar.classList.add("on"); $("#cbtext").textContent = "CLAUDE · reading the product page"; typeInto($("#purl"), e.url); }
  if (e.kind === "refresh") { $("#purl").value = ""; $("#cbtext").textContent = "CLAUDE · product saved with all its photos"; refresh(); }
  if (e.kind === "approve") {
    bar.classList.add("on"); $("#cbtext").textContent = "CLAUDE · waiting for your OK"; $("#ap-title").textContent = (e.who || "Claude") + " wants to make a video";
    $("#ap-meta").innerHTML = `<span>Product <b>${esc(e.product || "none")}</b></span><span>Length <b>${e.seconds}s</b></span><span>Quality <b>${esc(e.quality)}</b></span><span>Reference photos <b>${e.refs}</b></span><span>Prompt <b>${e.chars} chars</b></span>${(e.captions || []).map((c) => `<span>Caption <b>${esc(c)}</b></span>`).join("")}`;
    $("#ap-prompt").value = e.prompt; $("#ap-cost").textContent = `up to ${money(e.usd)} · ~${e.minutes} min`; $("#approve").classList.add("on");
  }
  if (e.kind === "go") { $("#cbtext").textContent = "CLAUDE · rendering"; }
  if (e.kind === "end") { $("#cbtext").textContent = "CLAUDE · " + e.text; cbT = setTimeout(() => bar.classList.remove("on"), 3500); }
});
const decide = (ok) => { const t = $("#ap-prompt").value; $("#approve").classList.remove("on"); window.xugc.decide(ok, ok ? t : null); };
$("#ap-yes").onclick = () => decide(true); $("#ap-no").onclick = () => decide(false);
window.xugc.onDone(async (r) => {
  if (ui.busy) return; // a video he started himself is finished by its own button
  endRender(); await refresh();
  if (r.error) { showErr($("#err"), r.error + (r.costUsd ? ` (This attempt cost ${money(r.costUsd)}.)` : "")); return; }
  ui.current = r.take.id; showTake(r.take);
});

/* ---- the reference ad: frames, cuts, a contact sheet ---- */
const once = (el, ev) => new Promise((res, rej) => { el.addEventListener(ev, res, { once: true }); el.addEventListener("error", () => rej(new Error("The video could not be read.")), { once: true }); });
const seek = (v, t) => new Promise((res) => { const done = () => { v.removeEventListener("seeked", done); res(); }; v.addEventListener("seeked", done); setTimeout(done, 2500); v.currentTime = t; });
async function analyzeVideo(name, bytes, on = () => {}) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "video/mp4" })); const v = document.createElement("video"); v.muted = true; v.preload = "auto"; v.src = url;
  try {
    on({ phase: "read", text: "Opening the video" });
    await Promise.race([once(v, "loadedmetadata"), new Promise((_, rej) => setTimeout(() => rej(new Error("The video could not be read.")), 8000))]); const dur = v.duration; if (!(dur > 0.5)) throw new Error("That video is too short.");
    on({ phase: "read", text: `${dur.toFixed(1)} seconds, ${v.videoWidth}x${v.videoHeight}` });
    const n = Math.min(36, Math.max(8, Math.ceil(dur * 2.5))), tw = 24, th = 42, small = document.createElement("canvas"); small.width = tw; small.height = th; const sg = small.getContext("2d", { willReadFrequently: true });
    const sw = 120, sh = Math.round(120 * (v.videoHeight / v.videoWidth)) || 213, cols = 6, rows = Math.ceil(n / cols), sheet = document.createElement("canvas"); sheet.width = cols * sw; sheet.height = rows * sh; const g2 = sheet.getContext("2d"); g2.fillStyle = "#000"; g2.fillRect(0, 0, sheet.width, sheet.height);
    let prev = null, motion = 0, bright = 0; const cuts = [], diffs = [];
    for (let i = 0; i < n; i++) {
      const t = Math.min(dur - 0.05, (i + 0.5) * (dur / n)); await seek(v, t);
      g2.drawImage(v, (i % cols) * sw, Math.floor(i / cols) * sh, sw, sh); g2.fillStyle = "rgba(0,0,0,.6)"; g2.fillRect((i % cols) * sw, Math.floor(i / cols) * sh, 34, 14); g2.fillStyle = "#D7FF1F"; g2.font = "bold 10px monospace"; g2.fillText(t.toFixed(1) + "s", (i % cols) * sw + 3, Math.floor(i / cols) * sh + 11);
      sg.drawImage(v, 0, 0, tw, th); const d = sg.getImageData(0, 0, tw, th).data; const px = []; let lum = 0;
      for (let k = 0; k < d.length; k += 4) { const y = (d[k] + d[k + 1] + d[k + 2]) / 3; px.push(y); lum += y; }
      bright += lum / px.length; let isCut = false, df = 0;
      if (prev) { let s = 0; for (let k = 0; k < px.length; k++) s += Math.abs(px[k] - prev[k]); df = s / px.length; diffs.push(df); if (df > 38) { cuts.push(Math.round(t * 10) / 10); isCut = true; } else motion += df; }
      prev = px;
      const th2 = document.createElement("canvas"); th2.width = 40; th2.height = 70; th2.getContext("2d").drawImage(v, 0, 0, 40, 70);
      on({ phase: "frame", i: i + 1, n, t, thumb: th2, cut: isCut, text: isCut ? `cut at ${t.toFixed(1)}s` : `frame ${i + 1}/${n} at ${t.toFixed(1)}s` });
    }
    const calm = diffs.filter((d) => d <= 38); const motionAvg = calm.length ? motion / calm.length : 0; const lightAvg = bright / n;
    const bounds = [0, ...cuts, Math.round(dur * 10) / 10], shots = bounds.length - 1;
    const stats = { duration: Math.round(dur * 10) / 10, shots, avgShot: Math.round((dur / shots) * 10) / 10, motion: motionAvg > 9 ? "lots of movement" : motionAvg > 4 ? "moderate movement" : "steady", light: lightAvg < 70 ? "night / dark" : lightAvg < 130 ? "dusk / dim" : "bright" };
    const beats = bounds.slice(0, -1).map((b, k) => `${b}-${bounds[k + 1]}s: (shot ${k + 1}: describe what happens)`).join("\n");
    on({ phase: "done", text: "Building the contact sheet" });
    return { name, duration: dur, cuts, sheet: sheet.toDataURL("image/jpeg", 0.82), beats, stats };
  } finally { URL.revokeObjectURL(url); }
}
let lastStats = null;
function showStats(st) { $("#refan-stats").innerHTML = `<span>Length <b>${st.duration}s</b></span><span>Shots <b>${st.shots}</b></span><span>Average shot <b>${st.avgShot}s</b></span><span>Camera <b>${esc(st.motion)}</b></span><span>Light <b>${esc(st.light)}</b></span>`; }
async function loadReference(f) {
  showErr($("#referr"), ""); if (!f) return; if (f.error) return showErr($("#referr"), f.error);
  const an = $("#refan"), strip = $("#refan-strip"); an.classList.remove("done"); an.style.display = "flex"; $("#refdrop").style.display = "none"; $("#refbody").style.display = "none"; strip.innerHTML = ""; $("#refan-stats").innerHTML = ""; $("#refan-title").textContent = "ANALYZING"; $("#refan-pct").textContent = "0%"; $("#refan-bar").style.width = "0%"; $("#refan-log").innerHTML = "";
  const log = []; const say2 = (t) => { log.push(t); $("#refan-log").innerHTML = log.slice(-2).map((x, k, arr) => (k === arr.length - 1 ? "<b>> " : "> ") + esc(x) + (k === arr.length - 1 ? "</b>" : "")).join("<br>"); };
  try {
    const t0 = Date.now();
    const r = await analyzeVideo(f.name, f.bytes, (p) => {
      if (p.phase === "frame") { p.thumb.className = p.cut ? "cut" : ""; strip.appendChild(p.thumb); strip.scrollLeft = strip.scrollWidth; const pc = Math.round((p.i / p.n) * 92); $("#refan-bar").style.width = pc + "%"; $("#refan-pct").textContent = pc + "%"; }
      say2(p.text);
    });
    const wait = Math.max(0, 2200 - (Date.now() - t0)); if (wait) await new Promise((res) => setTimeout(res, wait)); // a clip that analyses instantly still shows its work
    $("#refan-title").textContent = "READING THE SHOTS"; $("#refan-bar").style.width = "97%"; $("#refan-pct").textContent = "97%";
    const out = await window.xugc.refSave(r); if (out.error) throw new Error(out.error);
    $("#refan-bar").style.width = "100%"; $("#refan-pct").textContent = "100%"; $("#refan-title").textContent = "ANALYSIS COMPLETE"; an.classList.add("done"); showStats(r.stats); lastStats = r.stats; say2(`${r.stats.shots} shot${r.stats.shots === 1 ? "" : "s"} found. Describe them below, or ask Claude to.`);
    await refresh(out);
  } catch (e) { an.style.display = "none"; $("#refdrop").style.display = "flex"; showErr($("#referr"), e.message); }
}
window.__loadReference = loadReference;
$("#refpick").onclick = async () => loadReference(await window.xugc.refPick());
const rd = $("#refdrop");
rd.ondragover = (e) => { e.preventDefault(); rd.classList.add("over"); }; rd.ondragleave = () => rd.classList.remove("over");
rd.ondrop = async (e) => { e.preventDefault(); rd.classList.remove("over"); const f = e.dataTransfer.files[0]; if (f) loadReference(await window.xugc.refFromPath(window.xugc.pathFor(f))); };
$("#refbeats").onchange = (e) => window.xugc.refUpdate({ beats: e.target.value }).then(refresh);
$("#refrange").oninput = (e) => window.xugc.refUpdate({ level: Number(e.target.value) }).then(refresh);
$("#refclear").onclick = () => window.xugc.refClear().then((r) => { $("#refan").style.display = "none"; return refresh(r); });

function syncSound() { const b = $("#sound"); const v = $("#pv"); if (b) b.style.display = v.style.display === "block" && v.muted ? "block" : "none"; }
$("#sound").onclick = () => { const v = $("#pv"); v.muted = false; v.volume = 1; v.play().catch(() => {}); syncSound(); };
$("#pv").onvolumechange = syncSound;

/* ---- events ---- */
$$("#nav button").forEach((b) => (b.onclick = () => setView(b.dataset.view)));
$("#pfetch").onclick = async () => {
  showErr($("#perr"), ""); const u = $("#purl").value.trim(); if (!u) return; $("#pfetch").textContent = "…";
  const r = await window.xugc.fetchProduct(u); $("#pfetch").textContent = "Fetch";
  if (r.error) { showErr($("#perr"), r.error); return; } $("#purl").value = ""; await refresh(r);
};
$("#purl").onkeydown = (e) => { if (e.key === "Enter") $("#pfetch").click(); };

const rails = ["Product", "Prompt", "GPU", "Model", "Render", "Sound", "Done"];
function railSet(i) { $("#rail").innerHTML = rails.map((r, k) => `<div class="${k < i ? "done" : k === i ? "act" : ""}">${r.toUpperCase()}</div>`).join(""); }
function railFor(stage) { const s = String(stage || "").toLowerCase(); return /renting|boot|sending/.test(s) ? 2 : /install|download/.test(s) ? 3 : /making/.test(s) ? 4 : /finish|bringing|handed/.test(s) ? 5 : 2; }
function beginRender(who) {
  if (ui.rendering) return; ui.rendering = true; ui.t0 = Date.now(); startFx(); railSet(2);
  $("#hs").textContent = "STARTING"; $("#ht").textContent = "0:00"; $("#hp").textContent = "0%"; $("#hb").style.width = "2%"; $("#hc").textContent = "$0.00 SO FAR"; $("#ptag").style.display = "none";
  clearInterval(ui.timer); ui.timer = setInterval(() => { $("#ht").textContent = clock(Date.now() - ui.t0); }, 500); renderCreate();
}
function endRender() { ui.rendering = false; clearInterval(ui.timer); $("#ptag").style.display = "block"; stopFx(); }
const specNow = () => ({ refsLocal: ui.refsLocal && ui.refsLocal.length ? ui.refsLocal.map(({ dataUrl, name }) => ({ dataUrl, name })) : undefined, scene: $("#script").value.trim(), look: ui.look, avatar: ui.avmode === "pick" ? ui.avatar : ui.avmode === "broad" ? "broad" : undefined, avatarText: ui.avmode === "own" ? $("#avown").value : undefined, seconds: secsNow(), quality: ui.qual, music: ui.music, engine: ui.engine || DEF_ENGINE, preset: ui.preset || "review", tier: ui.tier || "lite", res: ui.res || "720p", lora: ui.reallife ? ((S.loras || []).filter((l) => l.model === "ltx").slice(-1)[0] || {}).id : undefined, refs: ui.refs && ui.refs.length ? ui.refs : undefined });
$("#showp").onclick = async () => {
  const f = $("#fullp"); if (f.classList.contains("on")) { f.classList.remove("on"); $("#showp").textContent = "Show the full prompt"; return; }
  const r = await window.xugc.preview(specNow()); $("#fulltext").value = r.prompt || r.error || ""; ui.fullEdited = false; f.classList.add("on"); $("#showp").textContent = "Hide the full prompt";
  $("#fullnote").textContent = `${($("#fulltext").value || "").length} characters. Edit it and it is used exactly as written.`;
};
$("#fulltext").oninput = () => { ui.fullEdited = true; };
$("#go").onclick = async () => {
  if (ui.busy) return; showErr($("#err"), "");
  const scene = $("#script").value.trim();
  if (scene.length < 10) return showErr($("#err"), "Write what happens in the video (a sentence or two).");
  ui.busy = true; beginRender();
  const spec = specNow(); if (ui.fullEdited && $("#fullp").classList.contains("on")) spec.prompt = $("#fulltext").value;
  const r = await window.xugc.generate(spec);
  ui.busy = false; endRender();
  if (r.error) { await refresh(r); showErr($("#err"), r.error + (r.costUsd ? ` (This attempt cost ${money(r.costUsd)}.)` : "")); return; }
  ui.current = r.take.id; await refresh(r); showTake(r.take);
};
$("#stop").onclick = () => window.xugc.cancel();
$("#vup").onclick = async () => { if (!ui.current) return; await window.xugc.verdict(ui.current, "up").then(refresh); const t = S.takes.find((x) => x.id === ui.current); if (t) showTake(t); };
$("#vdown").onclick = async () => { if (!ui.current) return; await window.xugc.verdict(ui.current, "down").then(refresh); const t = S.takes.find((x) => x.id === ui.current); if (t) showTake(t); $("#dnote").classList.toggle("on", !!(t && t.verdict === "down")); if (t && t.verdict === "down") $("#dnotein").focus(); };
$("#dnotego").onclick = async () => { const n = $("#dnotein").value.trim(); if (!n || !ui.current) return; await window.xugc.verdict(ui.current, "down", n); await window.xugc.verdict(ui.current, "down"); $("#dnotein").value = ""; $("#dnote").classList.remove("on"); await refresh(); };
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

$("#ap-on").onclick = () => window.xugc.setSettings({ autoApprove: false }).then(refresh);
$("#ap-off").onclick = () => window.xugc.setSettings({ autoApprove: true }).then(refresh);
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
$("#gsave").onclick = async () => { showErr($("#gerr"), ""); const r = await window.xugc.setGoogle($("#gin").value); await refresh(r); if (r.error) return showErr($("#gerr"), r.error); $("#gin").value = ""; };
$("#falsave").onclick = async () => { showErr($("#falerr"), ""); const r = await window.xugc.setFal($("#falin").value); await refresh(r); if (r.error) return showErr($("#falerr"), r.error); $("#falin").value = ""; ui.connOpen = null; renderSettings(); };
$("#hfsave").onclick = async () => { showErr($("#hferr"), ""); const r = await window.xugc.setHf($("#hfin").value); await refresh(r); if (r.error) return showErr($("#hferr"), r.error); $("#hfin").value = ""; };
$("#sweep").onclick = async () => { const r = await window.xugc.sweep(); await refresh(r); $("#sweepnote").textContent = r.error ? r.error : `Stopped ${r.stopped} GPU${r.stopped === 1 ? "" : "s"}. Nothing of yours is running.`; };

refresh();

// Reference images: dropped from Finder, picked, or pasted anywhere on Create. Max 3, downscaled to 1024 px.
ui.refsLocal = [];
function renderLocal() {
  const T = $("#ithumbs"); T.innerHTML = "";
  ui.refsLocal.forEach((r, i) => { const d = document.createElement("div"); d.className = "ith"; d.style.backgroundImage = `url("${r.dataUrl}")`; d.title = r.name; const x = document.createElement("button"); x.type = "button"; x.textContent = "×"; x.onclick = (e) => { e.preventDefault(); e.stopPropagation(); ui.refsLocal.splice(i, 1); renderLocal(); }; d.appendChild(x); T.appendChild(d); });
  $("#iadd").style.display = ui.refsLocal.length >= 3 ? "none" : ""; $("#iadd").lastChild.textContent = ui.refsLocal.length ? "Add" : "Drop or paste images";
  $("#ilcount").textContent = ui.refsLocal.length + " / 3";
}
function shrink(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader(); fr.onerror = () => rej(fr.error);
    fr.onload = () => { const im = new Image(); im.onerror = () => rej(new Error("not an image")); im.onload = () => { const k = Math.min(1, 1024 / Math.max(im.naturalWidth, im.naturalHeight)); const c = document.createElement("canvas"); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k); c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); res({ dataUrl: c.toDataURL("image/jpeg", 0.9), name: file.name || "pasted.jpg" }); }; im.src = fr.result; };
    fr.readAsDataURL(file);
  });
}
async function addLocal(files) {
  for (const f of [...files].filter((f) => /^image\//.test(f.type))) { if (ui.refsLocal.length >= 3) break; try { ui.refsLocal.push(await shrink(f)); } catch {} }
  renderLocal();
}
window.__addLocal = addLocal;
const idr = $("#idrop");
idr.ondragover = (e) => { e.preventDefault(); idr.classList.add("over"); }; idr.ondragleave = () => idr.classList.remove("over");
idr.ondrop = (e) => { e.preventDefault(); idr.classList.remove("over"); addLocal(e.dataTransfer.files); };
$("#ifile").onchange = (e) => { addLocal(e.target.files); e.target.value = ""; };
document.addEventListener("paste", (e) => { if (ui.view !== "create") return; const imgs = [...(e.clipboardData ? e.clipboardData.files : [])].filter((f) => /^image\//.test(f.type)); if (!imgs.length) return; e.preventDefault(); addLocal(imgs); });

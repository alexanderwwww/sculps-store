/* XUGC screens. Everything it knows comes from the main process; nothing here talks to the network. */
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const FACES = [["01", "Maya"], ["05", "Jordan"], ["09", "Ava"], ["12", "Leo"], ["03", "Sofia"], ["07", "Noah"], ["11", "Zoe"], ["02", "Eli"]];
const SCRIPTS = [
  "I put this in my front window last night and my whole street stopped. It plugs in, points at the glass, and there is a ghost in my house. Link in my bio.",
  "Okay I did not expect this to work. Plug it in, point it at the window, and now my neighbours think my house is haunted. Honestly worth it. Link below.",
  "POV: you set up a ghost in your window in two minutes. No screen, no sheet, just plug it in. Everyone on my street keeps slowing down.",
];

let S = null, META = null;
const ui = { view: "create", avatar: 0, look: "Selfie", len: 15, captions: true, modelId: "wan22", script: SCRIPTS[0], scriptI: 0, product: { name: "Haunted Projector", sub: "3 photos · from Black Reaper", img: "../assets/samples/bw-proj1.webp" }, current: null, busy: false, training: false };

const src = (p) => (!p ? "" : p.startsWith("assets/") ? "../" + p : "file://" + encodeURI(p));
const money = (n) => "$" + Number(n).toFixed(2);

async function refresh(r) { const v = r || (await window.xugc.get()); S = v.state; META = v; renderAll(); }

function renderChips() {
  const demo = S.settings.mode === "demo";
  const c = $("#modechip");
  c.className = "chip" + (demo ? " demo" : "");
  c.innerHTML = `${demo ? "DEMO" : "RUNPOD"} · <b>${money(META.usedToday)}</b> of ${money(S.settings.capDay)} today`;
  $("#buildchip").textContent = "Build " + META.build; $("#s-build").textContent = META.build;
}

function renderCreate() {
  $("#prodimg").src = ui.product.img; $("#pprod").src = ui.product.img; $("#prodname").textContent = ui.product.name; $("#prodsub").textContent = ui.product.sub;
  const av = $("#avs"); av.innerHTML = "";
  FACES.forEach(([n, name], i) => { const d = document.createElement("div"); d.className = "av" + (i === ui.avatar ? " on" : ""); d.title = name; d.style.backgroundImage = `url(../assets/faces/face-${n}.webp)`; d.onclick = () => { ui.avatar = i; renderCreate(); }; av.appendChild(d); });
  const plus = document.createElement("div"); plus.className = "av add"; plus.textContent = "+"; plus.title = "Add your own avatar (coming with the real engine)"; av.appendChild(plus);
  if ($("#script") !== document.activeElement) $("#script").value = ui.script;
  $$("#looks .pill").forEach((b) => b.classList.toggle("on", b.dataset.look === ui.look));
  $$("[data-len]").forEach((b) => b.classList.toggle("on", Number(b.dataset.len) === ui.len));
  $("#capt").classList.toggle("on", ui.captions);
  const m = $("#models"); m.innerHTML = "";
  S.models.forEach((x) => { const b = document.createElement("button"); b.className = "model" + (x.id === ui.modelId ? " on" : ""); b.innerHTML = `${x.name}<span>${x.kind === "base" ? "base · rented GPU" : "your trained model" + (x.demo ? " · demo" : "")}</span>`; b.onclick = () => { ui.modelId = x.id; renderCreate(); }; m.appendChild(b); });
  const est = META.estimate; const sec = ui.len; const e2 = Math.round((Math.ceil(sec / 5) * 0.2 * 1.5 + 0.3) * 100) / 100;
  $("#goest").textContent = `about ${money(e2)} · ${Math.round(1.2 + Math.ceil(sec / 5) * 0.4)} min`;
  $("#go").disabled = ui.busy;
  const tk = $("#takes"); tk.innerHTML = "";
  if (!S.takes.length) tk.innerHTML = `<div class="empty">Your videos appear here.</div>`;
  S.takes.forEach((t, i) => { const d = document.createElement("div"); d.className = "take" + (ui.current === t.id ? " on" : ""); d.innerHTML = `<img src="${src(t.poster)}" alt=""><span>TAKE ${S.takes.length - i}</span>`; d.onclick = () => { ui.current = t.id; showTake(t); renderCreate(); }; tk.appendChild(d); });
}

function captionOf(t) { const w = String(t.script || "").replace(/[.,!?]/g, "").split(/\s+/).slice(0, 7).join(" "); return w.toUpperCase(); }
function showTake(t) {
  const v = $("#pv"); v.src = src(t.video); v.poster = src(t.poster); v.style.display = "block"; $("#pbg").style.display = "none"; v.play().catch(() => {});
  $("#ptag").textContent = `TAKE · ${t.seconds}s${t.demo ? " · DEMO" : ""}`;
  $("#pcap").textContent = t.captions ? captionOf(t) : "";
  $("#verd").style.visibility = "visible"; $("#vup").classList.toggle("on", t.verdict === "up"); $("#vdown").classList.toggle("on", t.verdict === "down");
  $("#hint").innerHTML = t.demo ? `<b>Demo clip.</b> The real engine will make this video from your product and avatar. It would have cost about ${money(t.wouldCost)}.` : "";
}
function showEmpty() { $("#pv").style.display = "none"; const b = $("#pbg"); b.style.display = "block"; b.src = "../assets/samples/hp-ip-s02.webp"; }

function renderLibrary() {
  const g = $("#libgrid"); g.innerHTML = "";
  if (!S.takes.length) { g.innerHTML = `<div class="note">Nothing here yet. Make a video in Create.</div>`; return; }
  S.takes.forEach((t) => {
    const d = document.createElement("div"); d.className = "card";
    d.innerHTML = `<video muted loop playsinline poster="${src(t.poster)}" src="${src(t.video)}"></video><span class="v">${t.verdict === "up" ? "👍" : t.verdict === "down" ? "👎" : ""}</span><div class="m"><b>${t.avatar} · ${t.look}</b>${t.seconds}s · ${t.model}${t.demo ? " · demo" : ""}<br>${new Date(t.at).toLocaleString()}</div>`;
    const v = d.querySelector("video"); d.onmouseenter = () => v.play().catch(() => {}); d.onmouseleave = () => v.pause();
    d.onclick = () => { ui.current = t.id; setView("create"); showTake(t); renderCreate(); };
    g.appendChild(d);
  });
}

function renderTrain() {
  $("#n-clips").textContent = S.dataset.length; $("#n-appr").textContent = S.dataset.filter((c) => c.source === "approved").length; $("#n-models").textContent = S.models.length;
  const list = $("#cliplist"); list.innerHTML = "";
  if (!S.dataset.length) list.innerHTML = `<div class="note">No clips yet. Add some videos you own.</div>`;
  S.dataset.forEach((c) => {
    const d = document.createElement("div"); d.className = "clip";
    d.innerHTML = `<video muted loop playsinline src="${src(c.file)}"></video><div><b>${c.name}</b><small>${c.source === "approved" ? "from your 👍 takes" : "yours"}</small><textarea placeholder="Say what happens in this clip, in one or two sentences">${(c.caption || "").replace(/</g, "&lt;")}</textarea></div><div><span class="src">${c.source === "approved" ? "APPROVED" : "YOURS"}</span><br><button class="btn" style="margin-top:8px">Remove</button></div>`;
    const v = d.querySelector("video"); d.onmouseenter = () => v.play().catch(() => {}); d.onmouseleave = () => v.pause();
    d.querySelector("textarea").onchange = (e) => window.xugc.caption(c.id, e.target.value).then(refresh);
    d.querySelector("button").onclick = () => window.xugc.removeClip(c.id).then(refresh);
    list.appendChild(d);
  });
  const t = META.trainEstimate; $("#t-est").textContent = `about ${money(t.usd)} · about ${t.hours} hours`; $("#t-cap").textContent = money(S.settings.capTrain);
  const next = S.models.filter((m) => m.kind === "lora").length + 2; if (!$("#mname").dataset.touched) $("#mname").value = `UGC-0${next}`;
  const tm = $("#tmodels"); tm.innerHTML = ""; S.models.forEach((m) => { const e = document.createElement("div"); e.className = "model"; e.style.cursor = "default"; e.innerHTML = `${m.name}<span>${m.kind === "base" ? "base" : "trained" + (m.demo ? " · demo" : "")}</span>`; tm.appendChild(e); });
  $("#train-go").disabled = ui.training;
}

function renderSettings() {
  for (const [id, k] of [["#cap-job", "capJob"], ["#cap-day", "capDay"], ["#cap-train", "capTrain"]]) if ($(id) !== document.activeElement) $(id).value = S.settings[k];
  $("#m-demo").classList.toggle("on", S.settings.mode === "demo"); $("#m-runpod").classList.toggle("on", S.settings.mode === "runpod");
}

function renderAll() { renderChips(); renderCreate(); renderLibrary(); renderTrain(); renderSettings(); }
function setView(v) { ui.view = v; $$(".view").forEach((x) => x.classList.toggle("on", x.id === "v-" + v)); $$("#nav button").forEach((b) => b.classList.toggle("on", b.dataset.view === v)); }

function showErr(el, msg) { el.textContent = msg || ""; el.classList.toggle("on", !!msg); }

/* ---- events ---- */
$$("#nav button").forEach((b) => (b.onclick = () => setView(b.dataset.view)));
$("#script").oninput = (e) => { ui.script = e.target.value; };
$("#write").onclick = () => { ui.scriptI = (ui.scriptI + 1) % SCRIPTS.length; ui.script = SCRIPTS[ui.scriptI]; $("#script").value = ui.script; };
$$("#looks .pill").forEach((b) => (b.onclick = () => { ui.look = b.dataset.look; renderCreate(); }));
$$("[data-len]").forEach((b) => (b.onclick = () => { ui.len = Number(b.dataset.len); renderCreate(); }));
$("#capt").onclick = () => { ui.captions = !ui.captions; renderCreate(); };
$("#prodchange").onclick = async () => { const f = await window.xugc.pickImages(); if (f.length) { const name = f[0].split("/").pop().replace(/\.[^.]+$/, ""); ui.product = { name, sub: `${f.length} photo${f.length > 1 ? "s" : ""} · from your Mac`, img: "file://" + encodeURI(f[0]) }; renderCreate(); } };

window.xugc.onJob((p) => { $("#pstage").textContent = p.stage; $("#pbar").style.width = p.pct + "%"; });
window.xugc.onTrain((p) => { $("#tstage").textContent = p.stage; $("#tbar").style.width = p.pct + "%"; });

$("#go").onclick = async () => {
  if (ui.busy) return; ui.busy = true; showErr($("#err"), ""); $("#prog").classList.add("on"); $("#pbar").style.width = "0%"; $("#pstage").textContent = "Starting"; renderCreate();
  const model = S.models.find((m) => m.id === ui.modelId) || S.models[0];
  const r = await window.xugc.generate({ product: ui.product.name, avatar: FACES[ui.avatar][1], script: ui.script, look: ui.look, model: model.name, seconds: ui.len, captions: ui.captions, sampleVideo: "assets/samples/ugc-projector.mp4", samplePoster: "assets/samples/hp-ip-s02.webp", demoMs: window.__fastDemo ? 200 : 0 });
  ui.busy = false; $("#prog").classList.remove("on");
  if (r.error) { showErr($("#err"), r.error); renderCreate(); return; }
  ui.current = r.take.id; await refresh(r); showTake(r.take); renderCreate();
};
$("#vup").onclick = async () => { if (!ui.current) return; await window.xugc.verdict(ui.current, "up").then(refresh); const t = S.takes.find((x) => x.id === ui.current); if (t) showTake(t); };
$("#vdown").onclick = async () => { if (!ui.current) return; await window.xugc.verdict(ui.current, "down").then(refresh); const t = S.takes.find((x) => x.id === ui.current); if (t) showTake(t); };
$("#addclips").onclick = () => window.xugc.addClips().then(refresh);
$("#mname").oninput = (e) => { e.target.dataset.touched = "1"; };
$("#train-go").onclick = async () => {
  if (ui.training) return; ui.training = true; showErr($("#terr"), ""); $("#tprog").style.display = "flex"; $("#tbar").style.width = "0%"; renderTrain();
  const r = await window.xugc.train({ name: $("#mname").value.trim() || "UGC", demoMs: window.__fastDemo ? 200 : 0 });
  ui.training = false; $("#tprog").style.display = "none"; $("#mname").dataset.touched = "";
  if (r.error) { showErr($("#terr"), r.error); renderTrain(); return; }
  await refresh(r); ui.modelId = r.model.id; renderAll();
};
for (const [id, k] of [["#cap-job", "capJob"], ["#cap-day", "capDay"], ["#cap-train", "capTrain"]]) $(id).onchange = (e) => window.xugc.setSettings({ [k]: e.target.value }).then(refresh);
$("#m-demo").onclick = () => window.xugc.setSettings({ mode: "demo" }).then(refresh);
$("#m-runpod").onclick = () => window.xugc.setSettings({ mode: "runpod" }).then(refresh);

showEmpty();
refresh();

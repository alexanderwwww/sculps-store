/* XUGC screens. Everything it knows comes from the main process; nothing here talks to the network. */
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

let S = null, META = null;
const ui = { view: "create", look: "Selfie", modelId: "wan22", frame: null, current: null, busy: false, training: false, t0: 0, tt0: 0, timer: null, last: {} };

const src = (p) => (!p ? "" : "file://" + encodeURI(p));
const money = (n) => "$" + Number(n).toFixed(2);
const clock = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const esc = (t) => String(t || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

async function refresh(r) { const v = r || (await window.xugc.get()); S = v.state; META = v; renderAll(); }

function renderChips() {
  const c = $("#modechip");
  if (!META.keySet) { c.className = "chip warnchip"; c.textContent = "NO RUNPOD KEY · add it in Settings"; c.onclick = () => setView("settings"); }
  else { c.className = "chip hot"; c.onclick = null; c.innerHTML = `RUNPOD · <b>${money(META.usedToday)}</b> of ${money(S.settings.capDay)} today`; }
  $("#buildchip").textContent = "Build " + META.build; $("#s-build").textContent = META.build;
}

function renderCreate() {
  $("#nokey").style.display = META.keySet ? "none" : "block";
  const f = ui.frame;
  $("#frame").classList.toggle("has", !!f);
  $("#frameth").style.backgroundImage = f ? `url(${f.preview})` : ""; $("#frameth").textContent = f ? "" : "+";
  $("#framename").textContent = f ? f.name : "No picture yet";
  $("#framesub").textContent = f ? "Cropped to 9:16 for the video." : "A photo of your person holding your product. The video starts from it.";
  const lk = $("#looks"); lk.innerHTML = "";
  for (const l of META.looks) { const b = document.createElement("button"); b.className = "pill" + (l === ui.look ? " on" : ""); b.textContent = l; b.onclick = () => { ui.look = l; renderCreate(); }; lk.appendChild(b); }
  const m = $("#models"); m.innerHTML = "";
  S.models.forEach((x) => { const b = document.createElement("button"); b.className = "model" + (x.id === ui.modelId ? " on" : ""); b.innerHTML = `${esc(x.name)}<span>${x.kind === "base" ? "base model" : x.test ? "test run" : "your trained model"}</span>`; b.onclick = () => { ui.modelId = x.id; renderCreate(); }; m.appendChild(b); });
  const e = META.estimate; $("#goest").textContent = `up to ${money(e.usd)} · about ${e.minutes} min`;
  $("#go").disabled = ui.busy || !!META.busy;
  const tk = $("#takes"); tk.innerHTML = "";
  if (!S.takes.length) tk.innerHTML = `<div class="empty">Your videos appear here.</div>`;
  S.takes.forEach((t, i) => { const d = document.createElement("div"); d.className = "take" + (ui.current === t.id ? " on" : ""); d.innerHTML = `<img src="${src(t.poster)}" alt=""><span>TAKE ${S.takes.length - i}</span>`; d.onclick = () => { ui.current = t.id; showTake(t); renderCreate(); }; tk.appendChild(d); });
}

function showTake(t) {
  const v = $("#pv"); v.src = src(t.video); v.style.display = "block"; $("#mark").style.display = "none"; v.play().catch(() => {});
  $("#ptag").textContent = `TAKE · ${t.seconds}s · ${money(t.cost)}`;
  $("#verd").style.visibility = "visible"; $("#vup").classList.toggle("on", t.verdict === "up"); $("#vdown").classList.toggle("on", t.verdict === "down");
  $("#hint").textContent = `${t.model} · ${t.minutes} min on the GPU · cost ${money(t.cost)}`;
}
function showEmpty() { $("#pv").style.display = "none"; $("#mark").style.display = "grid"; $("#ptag").textContent = "PREVIEW"; }

function renderLibrary() {
  const g = $("#libgrid"); g.innerHTML = "";
  if (!S.takes.length) { g.innerHTML = `<div class="note">Nothing here yet. Make a video in Create.</div>`; return; }
  S.takes.forEach((t) => {
    const d = document.createElement("div"); d.className = "card";
    d.innerHTML = `<video muted loop playsinline poster="${src(t.poster)}" src="${src(t.video)}"></video><span class="v">${t.verdict === "up" ? "👍" : t.verdict === "down" ? "👎" : ""}</span><div class="m"><b>${esc(t.look || "Take")} · ${esc(t.model)}</b>${t.seconds}s · ${money(t.cost)}<br>${new Date(t.at).toLocaleString()}</div>`;
    const v = d.querySelector("video"); d.onmouseenter = () => v.play().catch(() => {}); d.onmouseleave = () => v.pause();
    d.onclick = () => { ui.current = t.id; setView("create"); showTake(t); renderCreate(); };
    g.appendChild(d);
  });
}

function renderTrain() {
  $("#n-clips").textContent = S.dataset.length; $("#n-appr").textContent = S.dataset.filter((c) => c.source === "approved").length; $("#n-models").textContent = S.models.length;
  const list = $("#cliplist"); list.innerHTML = "";
  if (!S.dataset.length) list.innerHTML = `<div class="note">No videos yet. Add some you own. About 100 or more short UGC videos make a good model; a few is enough to test the chain.</div>`;
  S.dataset.forEach((c) => {
    const d = document.createElement("div"); d.className = "clip";
    d.innerHTML = `<video muted loop playsinline src="${src(c.file)}"></video><div><b>${esc(c.name)}</b><small>${c.source === "approved" ? "from your 👍 takes" : "yours"}</small><textarea placeholder="Say what happens in this video (optional: the GPU writes one if empty)">${esc(c.caption)}</textarea></div><div><span class="src">${c.source === "approved" ? "APPROVED" : "YOURS"}</span><br><button class="btn" style="margin-top:8px">Remove</button></div>`;
    const v = d.querySelector("video"); d.onmouseenter = () => v.play().catch(() => {}); d.onmouseleave = () => v.pause();
    d.querySelector("textarea").onchange = (e) => window.xugc.caption(c.id, e.target.value).then(refresh);
    d.querySelector("button").onclick = () => window.xugc.removeClip(c.id).then(refresh);
    list.appendChild(d);
  });
  const t = META.trainEstimate, te = META.testEstimate;
  $("#t-est").textContent = money(t.usd); $("#t-cap").textContent = money(S.settings.capTrain); $("#t-go").textContent = `up to ${money(t.usd)} · ~${t.hours} h`;
  $("#tt-est").textContent = money(te.usd); $("#t-test").textContent = `up to ${money(te.usd)} · ~${te.minutes} min`;
  const next = S.models.filter((m) => m.kind === "lora").length + 2; if (!$("#mname").dataset.touched) $("#mname").value = `UGC-0${next}`;
  const tm = $("#tmodels"); tm.innerHTML = "";
  S.models.forEach((m) => { const e = document.createElement("div"); e.className = "model"; e.style.cursor = "default"; e.innerHTML = `${esc(m.name)}<span>${m.kind === "base" ? "base" : m.test ? "test run" : "trained"}</span>${m.kind === "lora" ? `<button class="x" title="Delete this model from your Mac">✕</button>` : ""}`; const x = e.querySelector(".x"); if (x) x.onclick = () => window.xugc.deleteModel(m.id).then(refresh); tm.appendChild(e); });
  const busy = ui.training || !!META.busy;
  $("#test-go").disabled = busy || !S.dataset.length; $("#train-go").disabled = busy || !S.dataset.length || !S.proof.dryTrain;
  $("#train-go").title = S.proof.dryTrain ? "" : "Do the test run first";
}

function renderSettings() {
  for (const [id, k] of [["#cap-job", "capJob"], ["#cap-day", "capDay"], ["#cap-train", "capTrain"]]) if ($(id) !== document.activeElement) $(id).value = S.settings[k];
  if ($("#volid") !== document.activeElement) $("#volid").value = S.settings.volumeId || "";
  $("#keystate").textContent = META.keySet ? `Key saved (${META.keyTail}). It stays on this Mac.` : "No key saved.";
}

function renderAll() { renderChips(); renderCreate(); renderLibrary(); renderTrain(); renderSettings(); }
function setView(v) { ui.view = v; $$(".view").forEach((x) => x.classList.toggle("on", x.id === "v-" + v)); $$("#nav button").forEach((b) => b.classList.toggle("on", b.dataset.view === v)); }
function showErr(el, msg) { el.textContent = msg || ""; el.classList.toggle("on", !!msg); }

/* The start frame: any picture, cropped to 9:16 at the size the model wants (480x832), as a JPEG. */
function cropFrame(dataUrl) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => {
      const W = 480, H = 832, c = document.createElement("canvas"); c.width = W; c.height = H;
      const k = Math.max(W / im.width, H / im.height), w = im.width * k, h = im.height * k;
      const g = c.getContext("2d"); g.fillStyle = "#000"; g.fillRect(0, 0, W, H); g.drawImage(im, (W - w) / 2, (H - h) / 2, w, h);
      const out = c.toDataURL("image/jpeg", 0.92); res({ preview: out, b64: out.split(",")[1] });
    };
    im.onerror = () => rej(new Error("Could not open that picture."));
    im.src = dataUrl;
  });
}
async function useFrame(img) { if (!img) return; try { const c = await cropFrame(img.dataUrl); ui.frame = { name: img.name, preview: c.preview, b64: c.b64 }; showErr($("#err"), ""); renderCreate(); } catch (e) { showErr($("#err"), e.message); } }
window.__useFrame = useFrame;

function ticking(on, which) {
  clearInterval(ui.timer);
  if (on) ui.timer = setInterval(() => { const g = which === "t"; const t0 = g ? ui.tt0 : ui.t0; $(g ? "#ttime" : "#ptime").textContent = clock(Date.now() - t0); }, 500);
}
function progress(p, which) {
  const g = which === "t";
  $(g ? "#tstage" : "#pstage").textContent = p.stage; $(g ? "#tbar" : "#pbar").style.width = p.pct + "%";
  $(g ? "#tcost" : "#pcost").textContent = money(p.costUsd || 0); $(g ? "#tlog" : "#plog").textContent = p.log || "";
}

/* ---- events ---- */
$$("#nav button").forEach((b) => (b.onclick = () => setView(b.dataset.view)));
$("#gokey").onclick = () => setView("settings");
$("#script").oninput = () => {};
$("#framebtn").onclick = async () => useFrame(await window.xugc.pickFrame());
$("#frame").onclick = (e) => { if (e.target.id !== "framebtn") $("#framebtn").click(); };

window.xugc.onJob((p) => progress(p, "g"));
window.xugc.onTrain((p) => progress(p, "t"));

$("#go").onclick = async () => {
  if (ui.busy) return; showErr($("#err"), "");
  if (!ui.frame) return showErr($("#err"), "Pick a start frame first: a picture of your person holding your product.");
  ui.busy = true; ui.t0 = Date.now(); $("#prog").classList.add("on"); $("#pbar").style.width = "2%"; $("#pstage").textContent = "Starting"; $("#pcost").textContent = "$0.00"; $("#plog").textContent = ""; ticking(true, "g"); renderCreate();
  const r = await window.xugc.generate({ frame: ui.frame.b64, prompt: $("#script").value, look: ui.look, modelId: ui.modelId });
  ui.busy = false; ticking(false); $("#prog").classList.remove("on");
  if (r.error) { await refresh(r); showErr($("#err"), r.error + (r.costUsd ? ` (This attempt cost ${money(r.costUsd)}.)` : "")); return; }
  ui.current = r.take.id; await refresh(r); showTake(r.take);
};
$("#stop").onclick = () => window.xugc.cancel();
$("#tstop").onclick = () => window.xugc.cancel();
$("#vup").onclick = async () => { if (!ui.current) return; await window.xugc.verdict(ui.current, "up").then(refresh); const t = S.takes.find((x) => x.id === ui.current); if (t) showTake(t); };
$("#vdown").onclick = async () => { if (!ui.current) return; await window.xugc.verdict(ui.current, "down").then(refresh); const t = S.takes.find((x) => x.id === ui.current); if (t) showTake(t); };
$("#addclips").onclick = () => window.xugc.addClips().then(refresh);
$("#mname").oninput = (e) => { e.target.dataset.touched = "1"; };

async function runTrain(dry) {
  if (ui.training) return; ui.training = true; ui.tt0 = Date.now(); showErr($("#terr"), ""); $("#tsample").style.display = "none";
  $("#tprog").style.display = "flex"; $("#tbar").style.width = "2%"; $("#tstage").textContent = "Starting"; $("#tcost").textContent = "$0.00"; $("#tlog").textContent = ""; ticking(true, "t"); renderTrain();
  const r = await window.xugc.train({ name: $("#mname").value.trim() || "UGC", dry });
  ui.training = false; ticking(false); $("#tprog").style.display = "none"; $("#mname").dataset.touched = "";
  await refresh(r);
  if (r.error) { showErr($("#terr"), r.error + (r.costUsd ? ` (This attempt cost ${money(r.costUsd)}.)` : "")); return; }
  ui.modelId = r.model.id; renderAll();
  if (r.model.sample) { $("#tsample").style.display = "block"; $("#tsampletext").textContent = r.model.sample; }
}
$("#test-go").onclick = () => runTrain(true);
$("#train-go").onclick = () => runTrain(false);

for (const [id, k] of [["#cap-job", "capJob"], ["#cap-day", "capDay"], ["#cap-train", "capTrain"]]) $(id).onchange = (e) => window.xugc.setSettings({ [k]: e.target.value }).then(refresh);
$("#volid").onchange = (e) => window.xugc.setSettings({ volumeId: e.target.value }).then(refresh);
$("#keysave").onclick = async () => {
  showErr($("#keyerr"), ""); const v = $("#keyin").value; $("#keystate").textContent = "Checking with RunPod…";
  const r = await window.xugc.setKey(v); await refresh(r);
  if (r.error) return showErr($("#keyerr"), r.error);
  $("#keyin").value = ""; $("#keystate").textContent = `Key saved (${META.keyTail}) and it works. ${r.pods} GPU${r.pods === 1 ? "" : "s"} running right now.`;
};
$("#sweep").onclick = async () => { const r = await window.xugc.sweep(); await refresh(r); $("#sweepnote").textContent = r.error ? r.error : `Stopped ${r.stopped} GPU${r.stopped === 1 ? "" : "s"}. Nothing of yours is running.`; };

showEmpty();
refresh();

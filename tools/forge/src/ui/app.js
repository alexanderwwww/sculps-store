"use strict";
(() => {
  const token = document.querySelector('meta[name="forge-token"]').content;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let S = null; // the last state the server sent
  let sel = null; // the calendar day being edited
  let view = "today";
  let formStatus = null; // {kind, text}
  let saving = false;
  const NARROW = 820;
  const isNarrow = () => window.innerWidth < NARROW;

  /* ------------------------------------------------------------ helpers */
  async function api(path, method = "GET", body) {
    const res = await fetch("/api/" + path, {
      method,
      headers: { "X-Forge-Token": token, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch {}
    if (!data) return { ok: false, error: "The app did not answer. Is it still open?" };
    return data;
  }
  const kg = (x) => (x === null || x === undefined ? "–" : Number(x).toFixed(2));
  const sgn = (x, d = 2) => (x === null || x === undefined ? "–" : (x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(x).toFixed(d));
  const int = (x) => (x === null || x === undefined ? "–" : Math.round(x).toLocaleString("en-US"));
  const pct = (x) => (x === null || x === undefined ? "–" : x.toFixed(1) + "%");
  const parse = (d) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd)); };
  const fmt = (d, o) => parse(d).toLocaleDateString("en-GB", { timeZone: "UTC", ...(o || { weekday: "short", day: "numeric", month: "short", year: "numeric" }) });
  const fmtShort = (d) => fmt(d, { day: "numeric", month: "short" });
  const diff = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
  const addDays = (d, n) => new Date(parse(d).getTime() + n * 86400000).toISOString().slice(0, 10);
  const val = (id) => ($(id) ? $(id).value : "");
  const dirClass = (x) => (x > 0 ? "up" : x < 0 ? "down" : "");

  function toast(text, actionLabel, action) {
    const t = $("toast");
    t.innerHTML = `<span>${esc(text)}</span>` + (actionLabel ? `<button id="toast-act">${esc(actionLabel)}</button>` : "");
    t.hidden = false;
    clearTimeout(toast.t);
    if (actionLabel) $("toast-act").onclick = () => { t.hidden = true; action(); };
    toast.t = setTimeout(() => (t.hidden = true), actionLabel ? 14000 : 4200);
  }
  function modal(html, wire) {
    const m = $("modal");
    m.innerHTML = `<div class="card sheet" role="dialog" aria-modal="true">${html}</div>`;
    m.hidden = false;
    m.onclick = (e) => { if (e.target === m) closeModal(); };
    wire && wire(m);
  }
  function closeModal() { $("modal").hidden = true; $("modal").innerHTML = ""; }

  /* ------------------------------------------------------------- load */
  async function load(keepSel) {
    const s = await api("state");
    if (!s.ok) { $("app").innerHTML = `<div class="card"><h2>Cannot open</h2><p>${esc(s.error)}</p></div>`; return; }
    S = s;
    const maxDay = s.settings.mission.endDate < s.today ? s.settings.mission.endDate : s.today;
    if (!keepSel || !sel) {
      sel = s.draft && s.draft.date && s.draft.date <= maxDay && diff(s.draft.date, s.today) <= 3 ? s.draft.date : maxDay;
    }
    render();
  }

  /* ----------------------------------------------------------- render */
  function render() {
    const sm = S.summary;
    const ended = sm.missionEnded;
    $("app").innerHTML = `
      ${goalBar()}
      <div class="top">
        <div class="t"><h1>Spartan Forge: Batman</h1>
          <div class="sub">${sm.started ? `Day ${sm.days.elapsed} of ${sm.days.total} · ${ended ? "mission complete" : `${sm.days.remaining} day${sm.days.remaining === 1 ? "" : "s"} left including today`} · ends ${fmt(sm.endDate)}` : `Mission ends ${fmt(sm.endDate)} · ready for your first weight`}</div></div>
        <span class="pill">${ended ? "<b>Mission complete</b>" : "<b>Active</b>"}</span>
        ${["today", "history", "settings"].map((v) => `<button class="btn-ghost${view === v ? " on" : ""}" data-view="${v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join("")}
      </div>
      ${banners()}
      <div id="view"></div>`;
    document.querySelectorAll("[data-view]").forEach((b) => (b.onclick = () => { view = b.dataset.view; render(); }));
    if (view === "today") renderToday();
    else if (view === "history") renderHistory();
    else renderSettings();
  }

  // The bar that is always on screen: how close the weight is to the goal.
  function goalBar() {
    const sm = S.summary;
    const g = sm.goals.primary;
    if (!sm.started) {
      return `<div class="goalbar"><div class="gb-top"><b>${kg(g.goalKg)} kg goal</b><span>starts with your first weight</span></div><div class="gb-track"><i style="width:0%"></i></div><div class="gb-sub"><span>Log your exact weight when you wake up</span><span>until ${esc(fmt(sm.endDate, { day: "numeric", month: "short", year: "numeric" }))}</span></div></div>`;
    }
    const pctv = g.percent === null ? (g.reached ? 100 : 0) : g.percent;
    return `<div class="goalbar"><div class="gb-top"><b>${kg(sm.latestKg)} kg <span style="font-weight:500">now</span></b><span>${g.reached ? "Goal " + kg(g.goalKg) + " kg reached" : kg(g.remainingKg) + " kg to " + kg(g.goalKg) + " kg"}</span></div>
      <div class="gb-track"><i style="width:${pctv}%"></i></div>
      <div class="gb-sub"><span>${pctv.toFixed(1)}% of the way from ${kg(sm.startKg)} kg</span><span>${sm.missionEnded ? "mission ended" : sm.days.remaining + " day" + (sm.days.remaining === 1 ? "" : "s") + " left"}</span></div></div>`;
  }

  function banners() {
    const sm = S.summary;
    let h = "";
    if (S.notice) h += `<div class="status warn banner"><b>Records restored.</b> ${esc(S.notice)}</div>`;
    if (sm.missionEnded) h += `<div class="status ok banner"><b>The mission ended on ${esc(fmt(sm.endDate))}.</b> Nothing was deleted or extended. Your records stay here for review, correction and export.</div>`;
    const r = S.reminders;
    if (r.enabled && !sm.missionEnded && r.missingToday.length) {
      const now = new Date();
      const hhmm = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
      if (r.times.length && hhmm >= r.times[0]) h += `<div class="status warn banner">Reminder: today's <b>${r.missingToday.join(" and ")}</b> ${r.missingToday.length > 1 ? "are" : "is"} not logged yet.</div>`;
    }
    return h;
  }

  /* ---------------------------------------------------------- today view */
  function renderToday() {
    if (isNarrow()) {
      $("view").innerHTML = `<div class="col"><div id="glance"></div><div class="card hero" id="formCard"></div><div class="col" id="right"></div></div>`;
      renderGlance();
    } else {
      $("view").innerHTML = `<div class="grid"><div class="col"><div class="card hero" id="formCard"></div></div><div class="col" id="right"></div></div>`;
    }
    renderForm();
    renderRight();
  }

  function dayRecords(d) {
    return { w: S.weights[d] || null, i: S.intake[d] || null, a: S.activity[d] || null };
  }

  function renderForm() {
    const sm = S.summary;
    const maxDay = S.settings.mission.endDate < S.today ? S.settings.mission.endDate : S.today;
    const rec = dayRecords(sel);
    const dr = S.draft && S.draft.date === sel ? S.draft : null;
    const first = !sm.started;
    const kgv = dr && dr.kg !== undefined ? dr.kg : rec.w ? String(rec.w.kg) : "";
    const kcalv = dr && dr.kcal !== undefined ? dr.kcal : rec.i ? String(rec.i.kcal) : "";
    const stv = dr && dr.status ? dr.status : rec.i ? rec.i.status : "complete";
    const a = rec.a || {};
    const exMin = dr && dr.exMin !== undefined ? dr.exMin : a.exerciseMin ?? "";
    const exInt = dr && dr.exInt ? dr.exInt : a.intensity || "moderate";
    const sleep = dr && dr.sleep !== undefined ? dr.sleep : a.sleepHours ?? "";
    const stress = dr && dr.stress !== undefined ? dr.stress : a.stress ?? "";
    const note = dr && dr.note !== undefined ? dr.note : a.note ?? "";
    const isToday = sel === S.today;
    const savedBits = [];
    if (rec.w) savedBits.push(`weight saved ${new Date(rec.w.savedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`);
    if (rec.i) savedBits.push(rec.i.zero ? "zero intake recorded" : `calories saved (${rec.i.status === "complete" ? "day total" : "partial"})`);

    let msg = "";
    if (formStatus) msg = `<div class="status ${formStatus.kind}">${esc(formStatus.text)}</div>`;
    else if (dr) msg = `<div class="status warn"><b>Recovered an unsaved entry</b> from ${esc(new Date(dr.savedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }))}. Press Save to keep it.</div>`;
    else if (first) msg = `<div class="status"><b>Welcome.</b> Step on the scale and enter the number below. That first weight is your starting point. Nothing is assumed.</div>`;

    const zeroBadge = rec.i && rec.i.zero ? `<div class="status warn"><b>Zero intake is recorded for this day.</b> Type calories above and save to correct it, or <button class="link" id="zero-remove">remove it</button>.</div>` : "";

    $("formCard").innerHTML = `
      <h2>${isToday ? "Today" : "Editing a past day"}</h2>
      <label class="f"><span>Day</span><input type="date" id="f-date" value="${esc(sel)}" max="${esc(maxDay)}"></label>
      ${savedBits.length ? `<p class="hint" style="margin:-6px 0 14px">${esc(savedBits.join(" · "))}</p>` : ""}
      ${msg}
      <label class="f"><span>Weight, exact scale reading</span><div class="unit"><input class="big" id="f-kg" type="text" inputmode="decimal" autocomplete="off" placeholder="${first ? "Your weight" : "e.g. 106.75"}" value="${esc(kgv)}"><em>kg</em></div></label>
      <label class="f"><span>Calories consumed</span><div class="unit"><input id="f-kcal" type="text" inputmode="numeric" autocomplete="off" placeholder="leave empty if not logged" value="${esc(kcalv)}"><em>kcal</em></div>
        <div class="seg" id="seg">
          <label class="${stv === "complete" ? "on" : ""}"><input type="radio" name="st" value="complete" ${stv === "complete" ? "checked" : ""}>Final total for the day</label>
          <label class="${stv === "partial" ? "on" : ""}"><input type="radio" name="st" value="partial" ${stv === "partial" ? "checked" : ""}>So far (partial)</label>
        </div>
        <p class="hint">Empty means not logged. It is never counted as zero.</p>
      </label>
      ${zeroBadge}
      <details class="more" ${exMin !== "" || sleep !== "" || stress !== "" || note ? "open" : ""}><summary>Activity, sleep, stress (optional)</summary>
        <div style="margin-top:12px" class="row">
          <label class="f"><span>Exercise (min)</span><input id="f-exmin" type="text" inputmode="numeric" value="${esc(exMin)}"></label>
          <label class="f"><span>Intensity</span><select id="f-exint">${["light", "moderate", "vigorous"].map((x) => `<option ${x === exInt ? "selected" : ""}>${x}</option>`).join("")}</select></label>
        </div>
        <div class="row">
          <label class="f"><span>Sleep (hours)</span><input id="f-sleep" type="text" inputmode="decimal" value="${esc(sleep)}"></label>
          <label class="f"><span>Stress (1–5)</span><select id="f-stress"><option value="">–</option>${[1, 2, 3, 4, 5].map((x) => `<option ${String(x) === String(stress) ? "selected" : ""}>${x}</option>`).join("")}</select></label>
        </div>
        <label class="f"><span>Note</span><textarea id="f-note" rows="2" maxlength="500">${esc(note)}</textarea></label>
        ${rec.a ? `<button class="link d" id="act-clear" type="button">Remove this day's activity entry</button>` : ""}
      </details>
      <button class="btn" id="save" ${saving ? "disabled" : ""}>Save</button>
      <div style="height:10px"></div>
      <button class="btn2" id="fast">Fasting / zero intake — I ate nothing today</button>
      <p class="hint">A logging shortcut for a day with truly zero calories. It is not advice to fast.</p>`;

    wireForm();
  }

  function wireForm() {
    $("f-date").onchange = () => { const d = $("f-date").value; if (!d) return; sel = d; formStatus = null; saveDraftNow(true); renderForm(); };
    document.querySelectorAll('input[name="st"]').forEach((r) => (r.onchange = () => {
      document.querySelectorAll("#seg label").forEach((l) => l.classList.toggle("on", l.querySelector("input").checked));
      draftSoon();
    }));
    ["f-kg", "f-kcal", "f-exmin", "f-exint", "f-sleep", "f-stress", "f-note"].forEach((id) => ($(id).oninput = draftSoon));
    $("save").onclick = save;
    $("fast").onclick = fastClick;
    if ($("zero-remove")) $("zero-remove").onclick = () => removeZero();
    if ($("act-clear")) $("act-clear").onclick = async () => {
      const r = await api("activity", "POST", { date: sel, exerciseMin: "", sleepHours: "", stress: "", note: "" });
      if (r.ok) { S = r.state; formStatus = { kind: "ok", text: "Activity entry removed." }; render(); } else toast(r.error);
    };
  }

  /* ------------------------------------------------------------- drafts */
  let draftTimer = null;
  function currentDraft() {
    if (!$("f-kg")) return null;
    const st = document.querySelector('input[name="st"]:checked');
    const d = { date: sel, kg: val("f-kg"), kcal: val("f-kcal"), status: st ? st.value : "complete", exMin: val("f-exmin"), exInt: val("f-exint"), sleep: val("f-sleep"), stress: val("f-stress"), note: val("f-note") };
    const touched = d.kg.trim() || d.kcal.trim() || d.exMin.trim() || d.sleep.trim() || d.stress || d.note.trim();
    return touched ? d : null;
  }
  function draftSoon() { clearTimeout(draftTimer); draftTimer = setTimeout(() => saveDraftNow(false), 400); }
  async function saveDraftNow() {
    clearTimeout(draftTimer);
    const d = currentDraft();
    // Only keep a draft that differs from what is already saved.
    await api("draft", "PUT", d && differsFromSaved(d) ? d : {});
  }
  function differsFromSaved(d) {
    const rec = dayRecords(d.date);
    const a = rec.a || {};
    return (d.kg.trim() !== (rec.w ? String(rec.w.kg) : "") && d.kg.trim() !== "") ||
      (d.kcal.trim() !== (rec.i ? String(rec.i.kcal) : "") && d.kcal.trim() !== "") ||
      (d.exMin.trim() !== String(a.exerciseMin ?? "") && d.exMin.trim() !== "") ||
      (d.sleep.trim() !== String(a.sleepHours ?? "") && d.sleep.trim() !== "") ||
      (d.stress !== String(a.stress ?? "") && d.stress !== "") ||
      (d.note.trim() !== (a.note ?? "") && d.note.trim() !== "");
  }

  /* --------------------------------------------------------------- save */
  async function save() {
    if (saving) return;
    const d = sel;
    const kgs = val("f-kg").trim();
    const kc = val("f-kcal").trim();
    const exMin = val("f-exmin").trim(), sleep = val("f-sleep").trim(), stress = val("f-stress"), note = val("f-note").trim();
    const st = document.querySelector('input[name="st"]:checked').value;
    const hasAct = exMin || sleep || stress || note;
    if (!kgs && !kc && !hasAct) { formStatus = { kind: "warn", text: "Nothing to save yet. Enter a weight, calories, or an activity note." }; renderForm(); return; }
    saving = true;
    const done = [];
    let state = null;
    const fail = (text) => { saving = false; formStatus = { kind: "bad", text: (done.length ? `Saved: ${done.join(", ")}. ` : "") + text }; if (state) S = state; render(); };
    if (kgs) {
      const r = await api("weight", "POST", { date: d, kg: kgs });
      if (!r.ok) return fail(r.error);
      state = r.state; done.push("weight");
    }
    if (kc) {
      const r = await api("intake", "POST", { date: d, kcal: kc, status: st });
      if (!r.ok) return fail(r.error);
      state = r.state; done.push(st === "complete" ? "calories (day total)" : "calories (partial)");
    }
    if (hasAct) {
      const r = await api("activity", "POST", { date: d, exerciseMin: exMin, intensity: val("f-exint"), sleepHours: sleep, stress, note });
      if (!r.ok) return fail(r.error);
      state = r.state; done.push("activity");
    }
    await api("draft", "PUT", {});
    saving = false;
    S = state; S.draft = null;
    formStatus = { kind: "ok", text: `Saved ${fmt(d)}: ${done.join(", ")}.` };
    render();
  }

  /* ----------------------------------------------------------- fasting */
  function fastClick() {
    const d = sel;
    const rec = S.intake[d];
    modal(`<h3>Record zero calories for ${esc(fmt(d))}?</h3>
      <p>This saves <b>0 kcal as the day's final total</b>, meaning you consumed nothing that day. Use it only if that is true. It is a logging shortcut, not a recommendation to fast.</p>
      ${rec ? `<p>This replaces what is saved for the day now (${esc(int(rec.kcal))} kcal, ${rec.status === "complete" ? "final total" : "partial"}). You can undo it right after.</p>` : ""}
      <div class="acts"><button class="btn" id="m-yes">Yes, I consumed nothing — record 0 kcal</button><button class="btn2" id="m-no">Cancel</button></div>`, () => {
      $("m-no").onclick = closeModal;
      $("m-yes").onclick = async () => {
        closeModal();
        const r = await api("intake/zero", "POST", { date: d, confirmed: true });
        if (!r.ok) { toast(r.error); return; }
        S = r.state; formStatus = { kind: "ok", text: `Zero intake recorded for ${fmt(d)}.` }; render();
        const previous = r.previous ?? null;
        toast("0 kcal recorded.", "Undo", async () => {
          const u = await api("intake/restore", "POST", { date: d, record: previous });
          if (u.ok) { S = u.state; formStatus = { kind: "ok", text: "Zero entry undone." }; render(); } else toast(u.error);
        });
      };
    });
  }
  async function removeZero() {
    const d = sel;
    const r = await api("intake/clear", "POST", { date: d });
    if (!r.ok) { toast(r.error); return; }
    S = r.state; formStatus = { kind: "ok", text: "The zero entry was removed. That day is now not logged." }; render();
    const prev = r.previous;
    toast("Zero entry removed.", "Undo", async () => {
      const u = await api("intake/restore", "POST", { date: d, record: prev });
      if (u.ok) { S = u.state; render(); } else toast(u.error);
    });
  }

  /* ---------------------------------------------------------- widget glance */
  function renderGlance() {
    const sm = S.summary;
    const g = $("glance");
    if (!sm.started) { g.innerHTML = ""; return; }
    const f = sm.forecast;
    const t = sm.trend7;
    const goalDate = f && f.available && f.goalDate ? fmtShort(f.goalDate.date) : null;
    const pd = sm.previousDay;
    const ti = S.intake[S.today];
    const kc = ti ? (ti.zero ? "0" : int(ti.kcal)) : "–";
    const kcNote = ti ? (ti.zero ? "zero intake" : ti.status === "partial" ? "so far" : "day total") : "not logged";
    g.innerHTML = `<div class="card glance"><div class="gl-main"><div><div class="k">Latest</div><div class="gl-v">${kg(sm.latestKg)}<small>kg</small></div></div>
      <div><div class="k">Vs yesterday</div><div class="gl-v ${pd ? dirClass(pd.changeKg) : ""}">${pd ? sgn(pd.changeKg) : "–"}<small>${pd ? "kg" : ""}</small></div></div>
      <div><div class="k">Calories today</div><div class="gl-v">${kc}<small>${ti ? "kcal" : ""}</small></div></div></div>
      <div class="gl-sub" style="margin-top:10px"><span>${t && t.available ? sgn(t.weeklyChangeKg) + " kg per week" : "trend: needs more days"}</span><span>${kcNote}</span><span>${goalDate ? "goal ≈ " + esc(goalDate) : ""}</span></div></div>`;
  }

  /* ------------------------------------------------------- right column */
  function renderRight() {
    const sm = S.summary;
    const right = $("right");
    if (!sm.started) {
      right.innerHTML = `<div class="card"><h2>Your mission</h2>
        <p class="big-n">${esc(kg(sm.goals.primary.goalKg))} <small class="dim" style="font-size:16px">kg primary goal</small></p>
        <p class="dim">Secondary goal: ${esc(kg(sm.goals.secondary.goalKg))} kg. The mission runs until ${esc(fmt(sm.endDate))}, inclusive.</p>
        <p class="dim">Once you save your first weight, this page fills with your progress, trend and an honest forecast.</p></div>${assumptionsCard()}`;
      return;
    }
    const g = sm.goals.primary, g2 = sm.goals.secondary;
    const prev = sm.previousDay;
    const narrow = isNarrow();
    right.innerHTML = (narrow ? `<details class="card more-card"><summary>Full progress, chart, forecast and calories</summary><div class="col" style="margin-top:16px">` : "") + `
      <div class="card"><div class="stats">
        <div class="stat"><div class="k">Starting weight</div><div class="v">${kg(sm.startKg)}<small>kg</small></div><div class="n">${esc(fmt(sm.startDate, { day: "numeric", month: "short", year: "numeric" }))}</div></div>
        <div class="stat"><div class="k">Latest weight</div><div class="v">${kg(sm.latestKg)}<small>kg</small></div><div class="n">${esc(fmt(sm.latestDate, { day: "numeric", month: "short" }))}</div></div>
        <div class="stat"><div class="k">Total change</div><div class="v ${dirClass(sm.totalChangeKg)}">${sgn(sm.totalChangeKg)}<small>kg</small></div><div class="n">since the first weight</div></div>
        <div class="stat"><div class="k">Vs previous day</div><div class="v ${prev ? dirClass(prev.changeKg) : ""}">${prev ? sgn(prev.changeKg) : "–"}<small>${prev ? "kg" : ""}</small></div><div class="n">${prev ? `${kg(prev.kg)} on ${esc(fmtShort(prev.date))}` : "needs weights on two consecutive days"}</div></div>
      </div></div>
      <div class="two">
        <div class="card"><h2>Primary goal · ${kg(g.goalKg)} kg</h2>
          <div class="big-n">${g.reached ? "Reached" : kg(g.remainingKg) + " kg"}<small class="dim" style="font-size:15px;font-weight:500;margin-left:8px">${g.reached ? "" : "to go"}</small></div>
          <div class="bar"><i style="width:${g.percent ?? 0}%"></i></div>
          <div class="dim">${g.percent === null ? "Your starting weight is at or below this goal." : pct(g.percent) + " of the way from " + kg(sm.startKg) + " kg"}</div></div>
        <div class="card"><h2>Mission days</h2>
          <div class="big-n">${sm.days.elapsed}<small class="dim" style="font-size:15px;font-weight:500;margin-left:6px">of ${sm.days.total}</small></div>
          <div class="bar silver"><i style="width:${Math.min(100, (sm.days.elapsed / sm.days.total) * 100)}%"></i></div>
          <div class="dim">${sm.missionEnded ? "The mission ended " + esc(fmt(sm.endDate)) : sm.days.remaining + " day" + (sm.days.remaining === 1 ? "" : "s") + " left including today · ends " + esc(fmt(sm.endDate))}</div></div>
      </div>
      <div class="card"><h2>Weight over the mission</h2>${chart()}
        <div class="legend"><span><i class="dot"></i>Measured weight</span><span><i style="border-color:#6a6a66;border-top-style:dashed"></i>Projection (not a measurement)</span><span><i style="border-color:#0d0d0e;border-top-style:dotted"></i>Primary goal</span><span><i style="border-color:#9c9c96;border-top-style:dotted"></i>Secondary goal</span></div></div>
      ${forecastCard()}
      <div class="two">${trendCard()}${secondaryCard(g2)}</div>
      ${caloriesCard()}
      ${energyCard()}
      ${assumptionsCard()}` + (narrow ? `</div></details>` : "");
  }

  function trendCard() {
    const t = S.summary.trend7;
    if (!t || !t.available) return `<div class="card"><h2>7-day trend</h2><p class="dim">${esc(t ? t.reason : "")}</p></div>`;
    return `<div class="card"><h2>7-day trend</h2>
      <div class="big-n ${dirClass(t.weeklyChangeKg)}">${sgn(t.weeklyChangeKg)}<small class="dim" style="font-size:15px;font-weight:500;margin-left:6px">kg per week</small></div>
      <div class="dim">Average weight this week ${kg(t.averageKg)} kg${t.averageDeltaKg !== null ? ` · ${sgn(t.averageDeltaKg)} vs the week before` : ""}</div>
      <p class="hint">From ${t.count} weights in the last 7 days. Daily weight moves with water and food, so look at the week, not the day.</p></div>`;
  }
  function secondaryCard(g2) {
    return `<div class="card"><h2>Secondary goal · ${kg(g2.goalKg)} kg</h2>
      <div class="big-n">${g2.reached ? "Reached" : kg(g2.remainingKg) + " kg"}<small class="dim" style="font-size:15px;font-weight:500;margin-left:8px">${g2.reached ? "" : "to go"}</small></div>
      <div class="bar silver"><i style="width:${g2.percent ?? 0}%"></i></div>
      <div class="dim">${g2.percent === null ? "Your starting weight is at or below this goal." : pct(g2.percent) + " of the way. Kept separate from the primary goal."}</div></div>`;
  }

  function forecastCard() {
    const f = S.summary.forecast;
    let body = "";
    if (!f.available) body = `<p class="dim">${esc(f.reason)}</p>`;
    else {
      const gd = f.goalDate;
      const pe = f.projectedAtEnd;
      body = `<div class="two" style="gap:24px">
        <div><div class="k faint" style="font-size:11px;letter-spacing:.14em;text-transform:uppercase">Approximate goal date (${kg(S.summary.goals.primary.goalKg)} kg)</div>
          ${gd ? `<div class="big-n">${esc(fmt(gd.date, { day: "numeric", month: "short", year: "numeric" }))}</div>
            <div class="range">Likely between ${esc(fmtShort(gd.earliest))} and ${esc(fmtShort(gd.latest))}${gd.afterMissionEnd ? " — after the end date. The mission is not extended." : ""}</div>`
            : `<div class="big-n dim">No date yet</div><div class="range">${esc(f.reason || "")}</div>`}</div>
        <div><div class="k faint" style="font-size:11px;letter-spacing:.14em;text-transform:uppercase">Projected on ${esc(fmt(pe.date, { day: "numeric", month: "short" }))}</div>
          <div class="big-n">${pe.kg.toFixed(1)}<small class="dim" style="font-size:15px;font-weight:500;margin-left:4px">kg</small></div>
          <div class="range">Range ${pe.rangeKg[0].toFixed(1)} to ${pe.rangeKg[1].toFixed(1)} kg · pace ${sgn(f.weeklyChangeKg)} kg/week (${sgn(f.weeklyChangeRangeKg[0])} to ${sgn(f.weeklyChangeRangeKg[1])})</div></div></div>
        <p class="hint">${esc(f.basis)} It rests on ${f.pointsUsed} measured weights.</p>`;
    }
    return `<div class="card"><h2>Forecast</h2>${body}</div>`;
  }

  function caloriesCard() {
    const c = S.summary.calories;
    const sm = S.summary;
    // One cell per elapsed day, newest 60.
    let strip = "";
    if (sm.started) {
      const end = sm.missionEnded ? sm.endDate : S.today;
      const from = diff(sm.startDate, end) > 59 ? addDays(end, -59) : sm.startDate;
      for (let d = from; d <= end; d = addDays(d, 1)) {
        const r = S.intake[d];
        const cls = !r ? "background:#e9e9e5" : r.zero ? "background:var(--warn)" : r.status === "complete" ? "background:#0d0d0e" : "background:transparent;box-shadow:inset 0 0 0 1.5px #0d0d0e";
        const label = !r ? "not logged" : r.zero ? "zero intake" : r.status === "complete" ? int(r.kcal) + " kcal (day total)" : int(r.kcal) + " kcal (partial)";
        strip += `<i title="${esc(fmt(d))}: ${esc(label)}" style="display:inline-block;width:11px;height:22px;border-radius:4px;margin:0 3px 3px 0;${cls}"></i>`;
      }
    }
    return `<div class="card"><h2>Calories you logged</h2>
      <div class="stats">
        <div class="stat"><div class="k">Average per complete day</div><div class="v">${int(c.averageKcal)}<small>kcal</small></div><div class="n">over ${c.completeDays} complete day${c.completeDays === 1 ? "" : "s"}</div></div>
        <div class="stat"><div class="k">Total logged</div><div class="v">${int(c.totalKcal)}<small>kcal</small></div><div class="n">complete days only</div></div>
        <div class="stat"><div class="k">Coverage</div><div class="v">${c.coverage === null ? "–" : Math.round(c.coverage * 100) + "%"}</div><div class="n">${c.completeDays} of ${c.elapsedDays} days complete</div></div>
        <div class="stat"><div class="k">Last 7 days</div><div class="v">${int(c.last7.average)}<small>kcal</small></div><div class="n">${c.last7.complete} of ${c.last7.days} days complete</div></div>
      </div>
      <div class="chips"><span class="chip"><b>${c.completeDays}</b> complete</span><span class="chip"><b>${c.partialDays}</b> partial</span><span class="chip"><b>${c.zeroDays}</b> zero intake</span><span class="chip"><b>${c.unloggedDays}</b> not logged</span></div>
      <div style="margin-top:14px">${strip}</div>
      <p class="hint">Black: final day total · outline: partial · amber: zero intake · grey: not logged. ${esc(c.note)}</p></div>`;
  }

  function energyCard() {
    const e = S.summary.energy;
    if (!e) return "";
    const d = e.daily;
    let h = `<div class="card"><h2>Estimated energy · estimates only</h2>`;
    if (d) h += `<div class="stats">
      <div class="stat"><div class="k">Estimated daily expenditure</div><div class="v">${int(d.estimatedKcal)}<small>kcal</small></div><div class="n">at ${kg(d.asOfWeight.kg)} kg</div></div>
      <div class="stat"><div class="k">Resting</div><div class="v">${int(d.restingKcal)}<small>kcal</small></div><div class="n">scaled from your measured rate</div></div>
      <div class="stat"><div class="k">Baseline activity</div><div class="v">${int(d.baselineKcal)}<small>kcal</small></div><div class="n">resting × activity factor</div></div>
      <div class="stat"><div class="k">Extra logged exercise</div><div class="v">${int(d.extraExerciseKcal)}<small>kcal</small></div><div class="n">only above the baseline allowance</div></div></div>`;
    if (e.balance.available) {
      h += `<div class="status" style="margin-top:16px"><b>Estimated energy balance: ${sgn(e.balance.averagePerDayKcal, 0)} kcal per day</b> across ${e.balance.days} complete days (${sgn(e.balance.totalKcal, 0)} kcal in total). ${esc(e.balance.label)}</div>`;
      if (e.trendImplied) h += `<p class="hint">${esc(e.trendImplied.label)} Right now: about ${sgn(e.trendImplied.perDayKcal, 0)} kcal per day.</p>`;
    } else h += `<p class="hint" style="margin-top:14px">${esc(e.balance.reason)} (${e.balance.days} so far)</p>`;
    return h + `</div>`;
  }
  function assumptionsCard() {
    return `<div class="card"><h2>How the estimates are made</h2><ul class="assump plain">${S.summary.assumptions.map((a) => `<li>${esc(a)}</li>`).join("")}</ul></div>`;
  }

  /* -------------------------------------------------------------- chart */
  function chart() {
    const sm = S.summary;
    const W = 760, H = 320, L = 52, R = 18, T = 16, B = 34;
    const x0 = sm.startDate, x1 = sm.endDate;
    const span = Math.max(1, diff(x0, x1));
    const pts = Object.keys(S.weights).sort().map((d) => ({ d, x: diff(x0, d), y: S.weights[d].kg }));
    const f = sm.forecast;
    const goals = [sm.goals.primary.goalKg, sm.goals.secondary.goalKg];
    const ys = pts.map((p) => p.y).concat(goals);
    if (f.projectedAtEnd) ys.push(f.projectedAtEnd.rangeKg[0], f.projectedAtEnd.rangeKg[1]);
    let lo = Math.min(...ys), hi = Math.max(...ys);
    const pad = Math.max(1, (hi - lo) * 0.08);
    lo -= pad; hi += pad;
    const X = (x) => L + (x / span) * (W - L - R);
    const Y = (y) => T + (1 - (y - lo) / (hi - lo)) * (H - T - B);
    const step = (hi - lo) > 30 ? 10 : (hi - lo) > 12 ? 5 : 2;
    let grid = "";
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) grid += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="rgba(0,0,0,.07)"/><text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end" fill="#9c9c96" font-size="11">${v}</text>`;
    const months = [];
    for (let d = x0; d <= x1; d = addDays(d, 1)) if (d.endsWith("-01") || d === x0) months.push(d);
    let xl = months.map((d) => `<text x="${X(diff(x0, d))}" y="${H - 10}" fill="#9c9c96" font-size="11">${esc(fmtShort(d))}</text>`).join("");
    xl += `<text x="${W - R}" y="${H - 10}" text-anchor="end" fill="#9c9c96" font-size="11">${esc(fmtShort(x1))}</text>`;
    const goalLine = (v, c, label) => `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="${c}" stroke-dasharray="2 5" stroke-width="1.5"/><text x="${W - R - 4}" y="${Y(v) - 6}" text-anchor="end" fill="${c}" font-size="11">${label} ${v} kg</text>`;
    const line = pts.length > 1 ? `<polyline fill="none" stroke="#0d0d0e" stroke-width="2.4" stroke-linejoin="round" points="${pts.map((p) => `${X(p.x)},${Y(p.y)}`).join(" ")}"/>` : "";
    const dots = pts.map((p) => `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="${pts.length > 60 ? 2.5 : 4}" fill="#0d0d0e" stroke="#fff" stroke-width="1.5"><title>${esc(fmt(p.d))}: ${p.y.toFixed(2)} kg</title></circle>`).join("");
    let proj = "";
    if (f.projectedAtEnd && pts.length) {
      const last = pts[pts.length - 1];
      const ex = X(span);
      proj = `<polygon points="${X(last.x)},${Y(last.y)} ${ex},${Y(f.projectedAtEnd.rangeKg[0])} ${ex},${Y(f.projectedAtEnd.rangeKg[1])}" fill="rgba(13,13,14,.07)"/>
        <line x1="${X(last.x)}" y1="${Y(last.y)}" x2="${ex}" y2="${Y(f.projectedAtEnd.kg)}" stroke="#6a6a66" stroke-width="2" stroke-dasharray="7 6"/>`;
    }
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight over the mission with goals and projection">${grid}${xl}${goalLine(goals[0], "#0d0d0e", "Goal")}${goalLine(goals[1], "#9c9c96", "Secondary")}${proj}${line}${dots}</svg>`;
  }

  /* ------------------------------------------------------------ history */
  function renderHistory() {
    const dates = [...new Set([...Object.keys(S.weights), ...Object.keys(S.intake), ...Object.keys(S.activity)])].sort().reverse();
    const rows = dates.map((d) => {
      const w = S.weights[d], i = S.intake[d], a = S.activity[d];
      const p = S.weights[addDays(d, -1)];
      const dl = w && p ? Math.round((w.kg - p.kg) * 100) / 100 : null;
      const ib = i ? `${int(i.kcal)}${i.zero ? '<span class="tag zero">zero intake</span>' : i.status === "partial" ? '<span class="tag part">partial</span>' : ""}` : '<span class="faint">not logged</span>';
      const ab = a ? [a.exerciseMin ? `${a.exerciseMin} min ${a.intensity || ""}` : "", a.sleepHours !== undefined ? `sleep ${a.sleepHours} h` : "", a.stress ? `stress ${a.stress}/5` : "", a.note ? "“" + a.note + "”" : ""].filter(Boolean).join(" · ") : "";
      return `<tr><td>${esc(fmt(d))}</td><td class="num">${w ? kg(w.kg) : '<span class="faint">–</span>'}</td><td class="num ${dl !== null ? dirClass(dl) : ""}">${dl !== null ? sgn(dl) : ""}</td><td class="num">${ib}</td><td class="dim">${esc(ab)}</td>
        <td class="num"><button class="link" data-edit="${d}">Edit</button>${w ? `<button class="link d" data-delw="${d}">Delete weight</button>` : ""}${i ? `<button class="link d" data-deli="${d}">Delete intake</button>` : ""}</td></tr>`;
    });
    $("view").innerHTML = `<div class="card"><div class="sect"><h2>All records</h2><button class="btn-ghost" id="csv">Export CSV</button></div>
      ${dates.length ? `<table><thead><tr><th>Day</th><th class="num">Weight kg</th><th class="num">vs day before</th><th class="num">Calories</th><th>Activity</th><th></th></tr></thead><tbody>${rows.join("")}</tbody></table>` : `<p class="dim">Nothing recorded yet.</p>`}
      <p class="hint">One record per day. Saving a day again corrects it; the earlier value is kept in the app's revision log. “Not logged” is never counted as zero.</p></div>`;
    $("csv").onclick = () => downloadCsv();
    document.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => { sel = b.dataset.edit; formStatus = null; view = "today"; render(); }));
    document.querySelectorAll("[data-delw]").forEach((b) => (b.onclick = () => confirmDelete("weight", b.dataset.delw)));
    document.querySelectorAll("[data-deli]").forEach((b) => (b.onclick = () => confirmDelete("intake", b.dataset.deli)));
  }
  function confirmDelete(kind, d) {
    modal(`<h3>Delete the ${kind} for ${esc(fmt(d))}?</h3><p>The day stays in your history as not logged. A copy is kept in the revision log and in the automatic backups.</p>
      <div class="acts"><button class="btn" id="m-yes">Delete</button><button class="btn2" id="m-no">Cancel</button></div>`, () => {
      $("m-no").onclick = closeModal;
      $("m-yes").onclick = async () => {
        closeModal();
        const r = await api(kind === "weight" ? "weight/clear" : "intake/clear", "POST", { date: d });
        if (r.ok) { S = r.state; render(); toast("Deleted."); } else toast(r.error);
      };
    });
  }
  async function downloadCsv() {
    const res = await fetch("/api/export.csv", { headers: { "X-Forge-Token": token } });
    if (!res.ok) { toast("Could not export."); return; }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `spartan-forge-${S.today}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    toast("CSV downloaded to your Downloads folder.");
  }

  /* ----------------------------------------------------------- settings */
  async function renderSettings() {
    const st = S.settings, p = st.profile, m = st.mission, r = st.reminders;
    const b = await api("backups");
    $("view").innerHTML = `<div class="grid" style="grid-template-columns:1fr 1fr"><div class="col">
      <div class="card"><h2>Goals</h2>
        <div class="row"><label class="f"><span>Primary goal (kg)</span><input id="s-g1" type="text" inputmode="decimal" value="${esc(m.primaryGoalKg)}"></label>
        <label class="f"><span>Secondary goal (kg)</span><input id="s-g2" type="text" inputmode="decimal" value="${esc(m.secondaryGoalKg)}"></label></div>
        <p class="hint">The mission ends on ${esc(fmt(m.endDate))}, inclusive. It does not restart or extend by itself.</p></div>
      <div class="card"><h2>About you (for the estimates)</h2>
        <div class="row"><label class="f"><span>Age</span><input id="s-age" type="text" value="${esc(p.age)}"></label><label class="f"><span>Height (cm)</span><input id="s-h" type="text" value="${esc(p.heightCm)}"></label></div>
        <div class="row"><label class="f"><span>Measured resting rate (kcal/day)</span><input id="s-rmr" type="text" value="${esc(p.rmrKcal)}"></label><label class="f"><span>Baseline expenditure (kcal/day)</span><input id="s-base" type="text" value="${esc(p.baselineKcal)}"></label></div>
        <label class="f"><span>Exercise minutes the baseline already includes</span><input id="s-bex" type="text" value="${esc(p.baselineExerciseMinPerDay)}"></label>
        <button class="btn" id="s-save-profile">Save goals and profile</button><p class="hint" id="s-msg1"></p></div>
      <div class="card"><h2>Reminders</h2>
        <label class="f"><span><input type="checkbox" id="r-on" ${r.enabled ? "checked" : ""} style="width:auto;margin-right:8px">Remind me</span></label>
        <label class="f"><span>Times (24h, comma separated)</span><input id="r-times" type="text" value="${esc(r.times.join(", "))}"></label>
        <label class="f"><span><input type="checkbox" id="r-miss" ${r.onlyIfMissing ? "checked" : ""} style="width:auto;margin-right:8px">Only if today is not fully logged yet</span></label>
        <div class="row"><button class="btn2" id="r-save">Save reminders</button><button class="btn2" id="r-test">Send a test</button></div>
        <p class="hint">${esc(S.reminders.howItWorks)}</p><p class="hint" id="s-msg2"></p></div>
    </div><div class="col">
      <div class="card"><h2>Backups and export</h2>
        <div class="row"><button class="btn2" id="b-now">Back up now</button><button class="btn2" id="b-csv">Export CSV</button></div>
        <p class="hint">A backup is saved automatically after changes (at most one a minute, the newest 60 are kept). They live in <code>~/Library/Application Support/SpartanForge/data/backups</code>.</p>
        ${b.ok && b.backups.length ? `<table><thead><tr><th>Backup</th><th class="num">Weights</th><th></th></tr></thead><tbody>${b.backups.slice(0, 12).map((x) => `<tr><td>${esc(new Date(x.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }))}</td><td class="num">${x.weights ?? "?"}</td><td class="num"><button class="link" data-restore="${esc(x.name)}">Restore</button></td></tr>`).join("")}</tbody></table>` : `<p class="dim">No backups yet.</p>`}
        <p class="hint" id="s-msg3"></p></div>
      <div class="card"><h2>About</h2><p class="dim">SPARTAN FORGE: BATMAN · build ${esc(window.FORGE_BUILD)} · time zone ${esc(S.zone)}</p>
        <p class="dim">Your records stay on this Mac. Updating the app never replaces them.</p>
        <p class="dim">This app is a record-keeping tool. It does not give medical advice. If you feel unwell, or are unsure about your eating or training, talk to a doctor.</p></div>
    </div></div>`;
    const say = (id, text) => ($(id).textContent = text);
    $("s-save-profile").onclick = async () => {
      const res = await api("settings", "POST", { mission: { primaryGoalKg: val("s-g1").replace(",", "."), secondaryGoalKg: val("s-g2").replace(",", ".") }, profile: { age: val("s-age"), heightCm: val("s-h"), rmrKcal: val("s-rmr"), baselineKcal: val("s-base"), baselineExerciseMinPerDay: val("s-bex") } });
      if (res.ok) { S = res.state; say("s-msg1", "Saved."); } else say("s-msg1", res.error);
    };
    $("r-save").onclick = async () => {
      const times = val("r-times").split(/[,\s]+/).filter(Boolean);
      const res = await api("settings", "POST", { reminders: { enabled: $("r-on").checked, onlyIfMissing: $("r-miss").checked, times } });
      if (res.ok) { S = res.state; say("s-msg2", "Saved."); } else say("s-msg2", res.error);
    };
    $("r-test").onclick = async () => { await api("reminder-test", "POST", {}); say("s-msg2", "A test notification was sent. If nothing appeared, allow notifications for Script Editor or Terminal in System Settings → Notifications."); };
    $("b-now").onclick = async () => { const res = await api("backup", "POST", {}); say("s-msg3", res.ok ? "Backup saved." : res.error); if (res.ok) renderSettings(); };
    $("b-csv").onclick = downloadCsv;
    document.querySelectorAll("[data-restore]").forEach((x) => (x.onclick = () => {
      const name = x.dataset.restore;
      modal(`<h3>Restore this backup?</h3><p>Your current records are backed up first, then replaced by the ones in this backup.</p><div class="acts"><button class="btn" id="m-yes">Restore</button><button class="btn2" id="m-no">Cancel</button></div>`, () => {
        $("m-no").onclick = closeModal;
        $("m-yes").onclick = async () => { closeModal(); const res = await api("restore", "POST", { name }); if (res.ok) { S = res.state; render(); toast("Restored."); } else toast(res.error); };
      });
    }));
  }

  /* ------------------------------------------------------------- boot */
  let wasNarrow = isNarrow();
  let rz = null;
  window.addEventListener("resize", () => {
    clearTimeout(rz);
    rz = setTimeout(() => { if (S && isNarrow() !== wasNarrow) { wasNarrow = isNarrow(); render(); } }, 200);
  });
  setInterval(() => api("heartbeat", "POST", {}), 10000);
  api("heartbeat", "POST", {});
  window.addEventListener("beforeunload", () => { try { const d = currentDraft(); if (d && differsFromSaved(d)) navigator.sendBeacon && fetch("/api/draft", { method: "PUT", keepalive: true, headers: { "X-Forge-Token": token, "Content-Type": "application/json" }, body: JSON.stringify(d) }); } catch {} });
  // A new day starts while the window is open: reload the state.
  setInterval(async () => { const s = await api("state"); if (s.ok && S && s.today !== S.today) { S = s; sel = s.settings.mission.endDate < s.today ? s.settings.mission.endDate : s.today; formStatus = null; render(); } }, 60000);
  load(false);
})();

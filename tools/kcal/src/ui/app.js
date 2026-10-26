"use strict";
(() => {
  const token = document.querySelector('meta[name="kcal-token"]').content;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let S = null; // the last state the server sent
  let sel = null; // the calendar day being edited
  let view = "today";
  let formStatus = null;
  let busy = false;
  let prevPct = null; // where the goal bar was, so it can animate from there
  let fx = null; // what to animate after the next render
  const NARROW = 820;
  const isNarrow = () => window.innerWidth < NARROW;

  /* ------------------------------------------------------------ helpers */
  async function api(path, method = "GET", body) {
    let res;
    try {
      res = await fetch("/api/" + path, {
        method,
        headers: { "X-Kcal-Token": token, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      return { ok: false, error: "kcal is not answering. Close the window and open kcal again. Nothing you typed is lost." };
    }
    let data = null;
    try { data = await res.json(); } catch {}
    return data || { ok: false, error: "kcal did not answer properly." };
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
  const timeOf = (iso) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  function toast(text, actionLabel, action) {
    const t = $("toast");
    t.innerHTML = `<span>${esc(text)}</span>` + (actionLabel ? `<button id="toast-act">${esc(actionLabel)}</button>` : "");
    t.hidden = false;
    t.style.animation = "none"; void t.offsetWidth; t.style.animation = "";
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

  /* ---------------------------------------------------- motion and joy */
  function countUp(el, from, to, ms, format, html) {
    if (!el) return;
    const put = (v) => { if (html) el.innerHTML = format(v); else el.textContent = format(v); };
    if (reduced || from === to || from === null) { put(to); return; }
    const t0 = performance.now();
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      put(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  // A short burst of confetti from a point on screen. Cheap: one canvas, ~90 dots, gone in 1.6 s.
  function confetti(x, y, big) {
    if (reduced) return;
    const c = $("fx");
    c.width = window.innerWidth * devicePixelRatio;
    c.height = window.innerHeight * devicePixelRatio;
    c.style.width = window.innerWidth + "px";
    c.style.height = window.innerHeight + "px";
    const g = c.getContext("2d");
    g.scale(devicePixelRatio, devicePixelRatio);
    const colors = ["#18c27f", "#6ee7c0", "#7cc4ff", "#ffc9a8", "#c9b8ff", "#0c0e0f", "#ffffff"];
    const n = big ? 170 : 80;
    const ps = Array.from({ length: n }, () => {
      const a = Math.random() * Math.PI * 2, v = (big ? 5 : 3) + Math.random() * (big ? 11 : 7);
      return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (big ? 7 : 4), r: 3 + Math.random() * 4, c: colors[(Math.random() * colors.length) | 0], rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, sq: Math.random() < 0.4 };
    });
    const t0 = performance.now();
    const frame = (t) => {
      const age = t - t0;
      g.clearRect(0, 0, window.innerWidth, window.innerHeight);
      for (const p of ps) {
        p.vy += 0.28; p.vx *= 0.992; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        g.globalAlpha = Math.max(0, 1 - age / 1700);
        g.fillStyle = p.c;
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
        if (p.sq) g.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); else { g.beginPath(); g.arc(0, 0, p.r / 1.6, 0, 6.3); g.fill(); }
        g.restore();
      }
      if (age < 1700) requestAnimationFrame(frame); else g.clearRect(0, 0, window.innerWidth, window.innerHeight);
    };
    requestAnimationFrame(frame);
  }
  const centerOf = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };

  // What is new after a save: a new low, a new whole-kg or percent milestone.
  function celebration(before, after) {
    if (!before || !after) return null;
    const b = new Set(before.analytics.milestones.map((m) => m.label));
    const fresh = after.analytics.milestones.filter((m) => !b.has(m.label));
    const low = after.analytics.lows && after.analytics.lows.newLowToday && !(before.analytics.lows && before.analytics.lows.newLowToday && before.analytics.lows.lowestKg === after.analytics.lows.lowestKg);
    if (fresh.length) return { big: true, text: `Milestone: ${fresh[fresh.length - 1].label}` };
    if (low) return { big: false, text: `New low: ${kg(after.summary.latestKg)} kg` };
    return null;
  }

  /* ------------------------------------------------------------- load */
  async function load(keepSel) {
    const s = await api("state");
    if (!s.ok) { $("app").innerHTML = `<div class="card"><h2>Cannot open</h2><p>${esc(s.error)}</p></div>`; return; }
    S = s;
    const maxDay = s.settings.mission.endDate < s.today ? s.settings.mission.endDate : s.today;
    if (!keepSel || !sel) sel = s.draft && s.draft.date && s.draft.date <= maxDay && diff(s.draft.date, s.today) <= 3 ? s.draft.date : maxDay;
    render();
  }

  /* ----------------------------------------------------------- render */
  function render() {
    const sm = S.summary;
    const ended = sm.missionEnded;
    $("app").innerHTML = `
      ${goalBar()}
      <div class="top">
        <div class="t"><h1>kcal</h1>
          <div class="sub">${sm.started ? `Day ${sm.days.elapsed} of ${sm.days.total} · ${ended ? "mission complete" : `${sm.days.remaining} day${sm.days.remaining === 1 ? "" : "s"} left including today`} · until ${esc(fmt(sm.endDate, { day: "numeric", month: "short", year: "numeric" }))}` : `Starts with your first weight · until ${esc(fmt(sm.endDate, { day: "numeric", month: "short", year: "numeric" }))}`}</div></div>
        <div class="nav">${[["today", "Today"], ["insights", "Insights"], ["history", "History"], ["settings", "Settings"]].map(([v, l]) => `<button class="${view === v ? "on" : ""}" data-view="${v}">${l}</button>`).join("")}</div>
      </div>
      ${banners()}
      <div id="view"></div>`;
    document.querySelectorAll("[data-view]").forEach((b) => (b.onclick = () => { view = b.dataset.view; formStatus = null; render(); window.scrollTo({ top: 0 }); }));
    animateBar();
    if (view === "today") renderToday();
    else if (view === "insights") renderInsights();
    else if (view === "history") renderHistory();
    else renderSettings();
    runFx();
  }

  function goalPercent() {
    const g = S.summary.goals.primary;
    return !S.summary.started ? 0 : g.percent === null ? (g.reached ? 100 : 0) : g.percent;
  }
  // The tube that is always on screen: how close the weight is to the goal.
  function goalBar() {
    const sm = S.summary;
    const g = sm.goals.primary;
    const ticks = `<div class="gb-ticks"><i style="left:25%"></i><i style="left:50%"></i><i style="left:75%"></i></div>`;
    const from = prevPct === null ? 0 : prevPct;
    if (!sm.started) {
      return `<div class="goalbar"><div class="gb-top"><b>${kg(g.goalKg)} kg<em>goal</em></b><span>starts with your first weight</span></div><div class="gb-tube">${ticks}<div class="gb-fill" id="gb-fill" style="width:0%"></div></div><div class="gb-sub"><span>Log your exact weight when you wake up</span><span>until ${esc(fmt(sm.endDate, { day: "numeric", month: "short", year: "numeric" }))}</span></div></div>`;
    }
    return `<div class="goalbar"><div class="gb-top"><b id="gb-now">${kg(sm.latestKg)}<em>kg now</em></b><span>${g.reached ? "Goal " + kg(g.goalKg) + " kg reached" : kg(g.remainingKg) + " kg to " + kg(g.goalKg) + " kg"}</span></div>
      <div class="gb-tube">${ticks}<div class="gb-fill" id="gb-fill" style="width:${from}%"></div></div>
      <div class="gb-sub"><span><span id="gb-pct">${from.toFixed(1)}</span>% of the way from ${kg(sm.startKg)} kg</span><span>${sm.missionEnded ? "mission ended" : sm.days.remaining + " day" + (sm.days.remaining === 1 ? "" : "s") + " left"}</span></div></div>`;
  }
  function animateBar() {
    const to = goalPercent();
    const fill = $("gb-fill");
    if (!fill) return;
    const from = prevPct === null ? 0 : prevPct;
    requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = to + "%"; }));
    countUp($("gb-pct"), from, to, 1100, (x) => x.toFixed(1));
    if (fx && fx.weightFrom !== undefined && S.summary.started) countUp($("gb-now"), fx.weightFrom, S.summary.latestKg, 900, (x) => x.toFixed(2) + "<em>kg now</em>", true);
    prevPct = to;
  }
  function runFx() {
    if (!fx) return;
    const f = fx; fx = null;
    if (f.confetti) confetti(f.confetti[0], f.confetti[1], f.big);
    if (f.celebrate) toast(f.celebrate.text);
    if (f.calFrom !== undefined) countUp($("cal-n"), f.calFrom, S.intake[sel] ? S.intake[sel].kcal : 0, 700, (x) => int(x));
    if (f.pop) { const el = $(f.pop); if (el) el.classList.add("pop"); }
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
      $("view").innerHTML = `<div class="col"><div id="read"></div><div class="col" id="formCol"></div><div class="col" id="right"></div></div>`;
    } else {
      $("view").innerHTML = `<div class="grid"><div class="col" id="formCol"></div><div class="col"><div id="read"></div><div class="col" id="right"></div></div></div>`;
    }
    renderRead();
    renderForms();
    renderRight();
  }

  function renderRead() {
    const c = S.coach;
    const an = S.analytics;
    const chips = [];
    if (an.streak && an.streak.current >= 1) chips.push(`<span class="badge mint"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c1 4-2 5-2 8 0 1.5 1 3 2.5 3S15 11.7 14.6 10c2 1.5 3.4 4 3.4 6.4A6 6 0 0 1 6 16.8C6 12 12 9 12 2z"/></svg>${an.streak.current} morning${an.streak.current === 1 ? "" : "s"} in a row</span>`);
    if (an.lows && an.lows.lowestKg !== null && S.summary.started) chips.push(`<span class="badge">Lowest ${kg(an.lows.lowestKg)} kg</span>`);
    const sm = S.summary;
    if (sm.started && sm.trend7 && sm.trend7.available) chips.push(`<span class="badge">${sgn(sm.trend7.weeklyChangeKg)} kg / week</span>`);
    $("read").innerHTML = `<div class="card read"><h2>Today's read</h2><h3>${esc(c.headline)}</h3>${c.lines.map((l) => `<p>${esc(l)}</p>`).join("")}${chips.length ? `<div class="chipline">${chips.join("")}</div>` : ""}</div>`;
  }

  function dayRecords(d) { return { w: S.weights[d] || null, i: S.intake[d] || null, a: S.activity[d] || null }; }

  function renderForms() {
    const sm = S.summary;
    const maxDay = S.settings.mission.endDate < S.today ? S.settings.mission.endDate : S.today;
    const rec = dayRecords(sel);
    const dr = S.draft && S.draft.date === sel ? S.draft : null;
    const first = !sm.started;
    const isToday = sel === S.today;
    const kgv = dr && dr.kg !== undefined ? dr.kg : rec.w ? String(rec.w.kg) : "";
    const totalv = dr && dr.total !== undefined ? dr.total : "";
    const mealv = dr && dr.meal !== undefined ? dr.meal : "";
    const a = rec.a || {};
    const exMin = dr && dr.exMin !== undefined ? dr.exMin : a.exerciseMin ?? "";
    const exInt = dr && dr.exInt ? dr.exInt : a.intensity || "moderate";
    const sleep = dr && dr.sleep !== undefined ? dr.sleep : a.sleepHours ?? "";
    const stress = dr && dr.stress !== undefined ? dr.stress : a.stress ?? "";
    const note = dr && dr.note !== undefined ? dr.note : a.note ?? "";
    const label = (dr && dr.label) || guessLabel();
    const day = rec.i;
    const status = day ? (day.zero ? "zero intake" : day.status === "complete" ? "day total" : "day open") : "not logged";

    let msg = "";
    if (formStatus) msg = `<div class="status ${formStatus.kind}">${esc(formStatus.text)}</div>`;
    else if (dr) msg = `<div class="status warn"><b>Recovered an unsaved entry</b> from ${esc(new Date(dr.savedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }))}. Log it to keep it.</div>`;
    else if (first) msg = `<div class="status"><b>Welcome.</b> Step on the scale when you wake up and log the exact number. That first weight is your starting point. Nothing is assumed.</div>`;

    $("formCol").innerHTML = `
      <div class="card hero" id="cardW">
        <div class="daypick"><b>${isToday ? "Today" : "Editing"} · ${esc(fmt(sel, { weekday: "short", day: "numeric", month: "short" }))}</b><input type="date" id="f-date" value="${esc(sel)}" max="${esc(maxDay)}" aria-label="Day"></div>
        <h2 style="margin-top:14px">Morning weight</h2>
        ${msg}
        <label class="f"><span>Exact scale reading</span><div class="unit"><input class="big" id="f-kg" type="text" inputmode="decimal" autocomplete="off" placeholder="${first ? "Your weight" : "e.g. 106.75"}" value="${esc(kgv)}"><em>kg</em></div></label>
        <button class="btn mint" id="log-w" ${busy ? "disabled" : ""}>${rec.w ? "Update weight" : "Log weight"}</button>
        ${rec.w ? `<p class="hint">Logged ${esc(timeOf(rec.w.savedAt))}. Saving again corrects the day.</p>` : ""}
      </div>
      <div class="card" id="cardC">
        <h2>Calories</h2>
        <div class="cal-total"><span class="n" id="cal-n">${day ? int(day.kcal) : "–"}</span><span class="u">kcal</span><span class="badge" style="margin-left:auto">${esc(status)}</span></div>
        ${day && day.meals && day.meals.length ? `<ul class="meals">${day.meals.map((m, i) => `<li><span class="l">${esc(m.label)}<small>${esc(timeOf(m.at))}</small></span><span class="k">${int(m.kcal)}</span><button data-rm="${i}" aria-label="Remove ${esc(m.label)}">×</button></li>`).join("")}</ul>` : ""}
        ${day && day.zero ? `<div class="status warn"><b>Zero intake is recorded.</b> Adding a meal replaces it. <button class="link" id="zero-remove">Remove it</button></div>` : ""}
        <div class="quick" id="labels">${["breakfast", "lunch", "dinner", "snack", "drink"].map((l) => `<button type="button" data-label="${l}" class="${l === label ? "on" : ""}">${l}</button>`).join("")}</div>
        <div class="addrow"><div class="unit"><input id="f-meal" type="text" inputmode="numeric" autocomplete="off" placeholder="calories" value="${esc(mealv)}"><em>kcal</em></div><button class="btn" id="add-meal" ${busy ? "disabled" : ""}>Add</button></div>
        <div class="row" style="margin-top:12px">
          <button class="btn2" id="finish" ${day && day.status !== "complete" && !day.zero ? "" : "disabled"}>${day && day.status === "complete" ? "Day finished ✓" : "Finish the day"}</button>
          <button class="btn2" id="fast">No food today (0 kcal)</button>
        </div>
        <p class="hint">Empty means not logged: it is never counted as zero. "No food today" is a logging shortcut for a day with truly zero calories, not advice.</p>
        <details class="more"><summary>Type the day's total instead</summary>
          <div style="margin-top:12px" class="row"><div class="unit"><input id="f-total" type="text" inputmode="numeric" autocomplete="off" placeholder="total kcal" value="${esc(totalv)}"><em>kcal</em></div></div>
          <div class="seg" id="seg"><label class="on"><input type="radio" name="st" value="complete" checked>Final total</label><label><input type="radio" name="st" value="partial">So far</label></div>
          <div style="height:10px"></div><button class="btn2" id="save-total">Save total</button>
        </details>
      </div>
      <div class="card" id="cardA"><details class="more" style="border:0;padding:0;margin:0" ${exMin !== "" || sleep !== "" || stress !== "" || note ? "open" : ""}><summary>Activity, sleep, stress (optional)</summary>
        <div style="margin-top:14px" class="row">
          <label class="f"><span>Exercise (min)</span><input id="f-exmin" type="text" inputmode="numeric" value="${esc(exMin)}"></label>
          <label class="f"><span>Intensity</span><select id="f-exint">${["light", "moderate", "vigorous"].map((x) => `<option ${x === exInt ? "selected" : ""}>${x}</option>`).join("")}</select></label>
        </div>
        <div class="row">
          <label class="f"><span>Sleep (hours)</span><input id="f-sleep" type="text" inputmode="decimal" value="${esc(sleep)}"></label>
          <label class="f"><span>Stress (1–5)</span><select id="f-stress"><option value="">–</option>${[1, 2, 3, 4, 5].map((x) => `<option ${String(x) === String(stress) ? "selected" : ""}>${x}</option>`).join("")}</select></label>
        </div>
        <label class="f"><span>Note</span><textarea id="f-note" rows="2" maxlength="500">${esc(note)}</textarea></label>
        <button class="btn2" id="save-act">Save activity</button>
        ${rec.a ? `<p><button class="link d" id="act-clear" type="button">Remove this day's activity entry</button></p>` : ""}
      </details></div>`;
    wireForms();
  }
  function guessLabel() {
    const h = new Date().getHours();
    return h < 11 ? "breakfast" : h < 15 ? "lunch" : h < 18 ? "snack" : "dinner";
  }

  function wireForms() {
    $("f-date").onchange = () => { const d = $("f-date").value; if (!d) return; saveDraftNow(); sel = d; formStatus = null; render(); };
    $("f-kg").addEventListener("keydown", (e) => { if (e.key === "Enter") logWeight(); });
    $("f-meal").addEventListener("keydown", (e) => { if (e.key === "Enter") addMeal(); });
    $("log-w").onclick = logWeight;
    $("add-meal").onclick = addMeal;
    $("finish").onclick = finishDay;
    $("fast").onclick = fastClick;
    $("save-total").onclick = saveTotal;
    $("save-act").onclick = saveActivity;
    document.querySelectorAll("#labels [data-label]").forEach((b) => (b.onclick = () => { document.querySelectorAll("#labels button").forEach((x) => x.classList.toggle("on", x === b)); draftSoon(); }));
    document.querySelectorAll('input[name="st"]').forEach((r) => (r.onchange = () => document.querySelectorAll("#seg label").forEach((l) => l.classList.toggle("on", l.querySelector("input").checked))));
    document.querySelectorAll("[data-rm]").forEach((b) => (b.onclick = () => removeMeal(Number(b.dataset.rm))));
    if ($("zero-remove")) $("zero-remove").onclick = () => removeZero();
    if ($("act-clear")) $("act-clear").onclick = async () => {
      const r = await api("activity", "POST", { date: sel, exerciseMin: "", sleepHours: "", stress: "", note: "" });
      if (r.ok) { S = r.state; formStatus = { kind: "ok", text: "Activity entry removed." }; render(); } else toast(r.error);
    };
    ["f-kg", "f-meal", "f-total", "f-exmin", "f-exint", "f-sleep", "f-stress", "f-note"].forEach((id) => ($(id).oninput = draftSoon));
  }

  /* ------------------------------------------------------------- drafts */
  let draftTimer = null;
  function currentDraft() {
    if (!$("f-kg")) return null;
    const lab = document.querySelector("#labels button.on");
    const d = { date: sel, kg: val("f-kg"), meal: val("f-meal"), label: lab ? lab.dataset.label : "", total: val("f-total"), exMin: val("f-exmin"), exInt: val("f-exint"), sleep: val("f-sleep"), stress: val("f-stress"), note: val("f-note") };
    const touched = d.kg.trim() || d.meal.trim() || d.total.trim() || d.exMin.trim() || d.sleep.trim() || d.stress || d.note.trim();
    return touched ? d : null;
  }
  function draftSoon() { clearTimeout(draftTimer); draftTimer = setTimeout(saveDraftNow, 400); }
  async function saveDraftNow() {
    clearTimeout(draftTimer);
    const d = currentDraft();
    await api("draft", "PUT", d && differsFromSaved(d) ? d : {});
  }
  function differsFromSaved(d) {
    const rec = dayRecords(d.date);
    const a = rec.a || {};
    return (d.kg.trim() !== "" && d.kg.trim() !== (rec.w ? String(rec.w.kg) : "")) || d.meal.trim() !== "" || d.total.trim() !== "" ||
      (d.exMin.trim() !== "" && d.exMin.trim() !== String(a.exerciseMin ?? "")) ||
      (d.sleep.trim() !== "" && d.sleep.trim() !== String(a.sleepHours ?? "")) ||
      (d.stress !== "" && d.stress !== String(a.stress ?? "")) ||
      (d.note.trim() !== "" && d.note.trim() !== (a.note ?? ""));
  }
  async function clearDraftFields(keys, day) { const d = currentDraft(); if (d && d.date !== day) return; if (!d) return api("draft", "PUT", {}); for (const k of keys) d[k] = ""; await api("draft", "PUT", differsFromSaved(d) ? d : {}); }

  /* ------------------------------------------------------------ actions */
  async function logWeight() {
    const day0 = sel; // the day this action is for, even if the screen moves on while it waits
    if (busy) return;
    const v = val("f-kg").trim();
    if (!v) { formStatus = { kind: "warn", text: "Type your exact weight first." }; renderForms(); return; }
    busy = true;
    const before = S;
    const btn = $("log-w");
    const origin = btn ? centerOf(btn) : [innerWidth / 2, innerHeight / 3];
    const r = await api("weight", "POST", { date: day0, kg: v });
    busy = false;
    if (!r.ok) { formStatus = { kind: "bad", text: r.error }; renderForms(); return; }
    await clearDraftFields(["kg"], day0);
    const cel = celebration(before, r.state);
    fx = { weightFrom: before.summary.latestKg ?? undefined, confetti: origin, big: Boolean(cel && cel.big), celebrate: cel, pop: "gb-now" };
    S = r.state; S.draft = null;
    formStatus = { kind: "ok", text: `Logged ${kg(S.weights[day0].kg)} kg for ${fmt(day0)}.` };
    render();
  }
  async function addMeal() {
    const day0 = sel; // the day this action is for, even if the screen moves on while it waits
    if (busy) return;
    const v = val("f-meal").trim();
    if (!v) { formStatus = { kind: "warn", text: "Type the calories of the meal." }; renderForms(); return; }
    const lab = document.querySelector("#labels button.on");
    busy = true;
    const calFrom = S.intake[day0] ? S.intake[day0].kcal : 0;
    const r = await api("meal", "POST", { date: day0, kcal: v, label: lab ? lab.dataset.label : "meal" });
    busy = false;
    if (!r.ok) { formStatus = { kind: "bad", text: r.error }; renderForms(); return; }
    await clearDraftFields(["meal"], day0);
    S = r.state; S.draft = null;
    formStatus = null;
    fx = { calFrom, pop: "cal-n" };
    render();
    const input = $("f-meal"); if (input) input.focus();
  }
  async function removeMeal(i) {
    const day0 = sel; // the day this action is for, even if the screen moves on while it waits
    const r = await api("meal/remove", "POST", { date: day0, index: i });
    if (!r.ok) { toast(r.error); return; }
    const previous = r.previous;
    S = r.state; render();
    toast("Meal removed.", "Undo", async () => { const u = await api("intake/restore", "POST", { date: day0, record: previous }); if (u.ok) { S = u.state; render(); } else toast(u.error); });
  }
  async function finishDay() {
    const day0 = sel; // the day this action is for, even if the screen moves on while it waits
    const btn = $("finish");
    const origin = btn ? centerOf(btn) : [innerWidth / 2, innerHeight / 2];
    const r = await api("intake/finish", "POST", { date: day0 });
    if (!r.ok) { toast(r.error); return; }
    S = r.state;
    formStatus = { kind: "ok", text: `${fmt(day0)} is finished at ${int(S.intake[day0].kcal)} kcal.` };
    fx = { confetti: origin, big: false };
    render();
    const previous = r.previous;
    if (previous) toast("Day finished.", "Undo", async () => { const u = await api("intake/restore", "POST", { date: day0, record: previous }); if (u.ok) { S = u.state; formStatus = null; render(); } else toast(u.error); });
  }
  async function saveTotal() {
    const day0 = sel; // the day this action is for, even if the screen moves on while it waits
    const v = val("f-total").trim();
    if (!v) { formStatus = { kind: "warn", text: "Type the total first." }; renderForms(); return; }
    const st = document.querySelector('input[name="st"]:checked').value;
    const r = await api("intake", "POST", { date: day0, kcal: v, status: st });
    if (!r.ok) { formStatus = { kind: "bad", text: r.error }; renderForms(); return; }
    await clearDraftFields(["total"], day0);
    S = r.state; S.draft = null;
    formStatus = { kind: "ok", text: `Saved ${int(S.intake[day0].kcal)} kcal (${st === "complete" ? "final total" : "so far"}) for ${fmt(day0)}.` };
    render();
  }
  async function saveActivity() {
    const day0 = sel; // the day this action is for, even if the screen moves on while it waits
    const exMin = val("f-exmin").trim(), sleep = val("f-sleep").trim(), stress = val("f-stress"), note = val("f-note").trim();
    if (!(exMin || sleep || stress || note)) { formStatus = { kind: "warn", text: "Nothing to save in the activity box yet." }; renderForms(); return; }
    const r = await api("activity", "POST", { date: day0, exerciseMin: exMin, intensity: val("f-exint"), sleepHours: sleep, stress, note });
    if (!r.ok) { formStatus = { kind: "bad", text: r.error }; renderForms(); return; }
    await clearDraftFields(["exMin", "sleep", "stress", "note"], day0);
    S = r.state; S.draft = null;
    formStatus = { kind: "ok", text: "Activity saved." };
    render();
  }
  function fastClick() {
    const d = sel;
    const rec = S.intake[d];
    modal(`<h3>Record zero calories for ${esc(fmt(d))}?</h3>
      <p>This saves <b>0 kcal as the day's final total</b>, meaning you consumed nothing that day. Use it only if that is true. It is a logging shortcut, not a recommendation to fast.</p>
      ${rec ? `<p>This replaces what is saved for the day now (${esc(int(rec.kcal))} kcal). You can undo it right after.</p>` : ""}
      <div class="acts"><button class="btn" id="m-yes">Yes, I consumed nothing: record 0 kcal</button><button class="btn2" id="m-no">Cancel</button></div>`, () => {
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
    toast("Zero entry removed.", "Undo", async () => { const u = await api("intake/restore", "POST", { date: d, record: prev }); if (u.ok) { S = u.state; render(); } else toast(u.error); });
  }

  /* ------------------------------------------------------- right column */
  function renderRight() {
    const sm = S.summary;
    const right = $("right");
    if (!sm.started) {
      right.innerHTML = `<div class="card"><h2>Your mission</h2>
        <p class="big-n">${esc(kg(sm.goals.primary.goalKg))}<small>kg goal</small></p>
        <p class="dim">Secondary goal: ${esc(kg(sm.goals.secondary.goalKg))} kg. The mission runs until ${esc(fmt(sm.endDate))}, inclusive.</p>
        <p class="dim">Once you log your first weight, this page fills with your progress, trend and an honest forecast.</p></div>`;
      return;
    }
    const g = sm.goals.primary, g2 = sm.goals.secondary;
    const prev = sm.previousDay;
    const narrow = isNarrow();
    right.innerHTML = (narrow ? `<details class="card more-card"><summary>Full progress, chart and forecast</summary><div class="col" style="margin-top:16px">` : "") + `
      <div class="card"><div class="stats">
        <div class="stat"><div class="k">Starting weight</div><div class="v">${kg(sm.startKg)}<small>kg</small></div><div class="n">${esc(fmt(sm.startDate, { day: "numeric", month: "short", year: "numeric" }))}</div></div>
        <div class="stat"><div class="k">Latest weight</div><div class="v">${kg(sm.latestKg)}<small>kg</small></div><div class="n">${esc(fmt(sm.latestDate, { day: "numeric", month: "short" }))}</div></div>
        <div class="stat"><div class="k">Total change</div><div class="v ${dirClass(sm.totalChangeKg)}">${sgn(sm.totalChangeKg)}<small>kg</small></div><div class="n">since the first weight</div></div>
        <div class="stat"><div class="k">Vs previous day</div><div class="v ${prev ? dirClass(prev.changeKg) : ""}">${prev ? sgn(prev.changeKg) : "–"}<small>${prev ? "kg" : ""}</small></div><div class="n">${prev ? `${kg(prev.kg)} on ${esc(fmtShort(prev.date))}` : "needs weights on two consecutive days"}</div></div>
      </div></div>
      <div class="two">
        <div class="card"><h2>Primary goal · ${kg(g.goalKg)} kg</h2>
          <div class="big-n">${g.reached ? "Reached" : kg(g.remainingKg) + "<small>kg to go</small>"}</div>
          <div class="bar"><i style="width:${g.percent ?? 0}%"></i></div>
          <div class="dim">${g.percent === null ? "Your starting weight is at or below this goal." : pct(g.percent) + " of the way from " + kg(sm.startKg) + " kg"}</div></div>
        <div class="card"><h2>Mission days</h2>
          <div class="big-n">${sm.days.elapsed}<small>of ${sm.days.total}</small></div>
          <div class="bar silver"><i style="width:${Math.min(100, (sm.days.elapsed / sm.days.total) * 100)}%"></i></div>
          <div class="dim">${sm.missionEnded ? "The mission ended " + esc(fmt(sm.endDate)) : sm.days.remaining + " day" + (sm.days.remaining === 1 ? "" : "s") + " left including today · ends " + esc(fmt(sm.endDate))}</div></div>
      </div>
      <div class="card"><h2>Weight over the mission</h2>${chart()}
        <div class="legend"><span><i class="dot"></i>Measured weight</span><span><i style="border-color:#5f6866;border-top-style:dashed"></i>Projection (not a measurement)</span><span><i style="border-color:#18c27f;border-top-style:dotted"></i>Primary goal</span><span><i style="border-color:#93a09c;border-top-style:dotted"></i>Secondary goal</span></div></div>
      ${forecastCard()}
      <div class="two">${trendCard()}${secondaryCard(g2)}</div>` + (narrow ? `</div></details>` : "");
  }

  function trendCard() {
    const t = S.summary.trend7;
    if (!t || !t.available) return `<div class="card"><h2>7-day trend</h2><p class="dim">${esc(t ? t.reason : "")}</p></div>`;
    return `<div class="card"><h2>7-day trend</h2>
      <div class="big-n ${dirClass(t.weeklyChangeKg)}">${sgn(t.weeklyChangeKg)}<small>kg per week</small></div>
      <div class="dim">Average weight this week ${kg(t.averageKg)} kg${t.averageDeltaKg !== null ? ` · ${sgn(t.averageDeltaKg)} vs the week before` : ""}</div>
      <p class="hint">From ${t.count} weights in the last 7 days. Daily weight moves with water and food, so look at the week, not the day.</p></div>`;
  }
  function secondaryCard(g2) {
    return `<div class="card"><h2>Secondary goal · ${kg(g2.goalKg)} kg</h2>
      <div class="big-n">${g2.reached ? "Reached" : kg(g2.remainingKg) + "<small>kg to go</small>"}</div>
      <div class="bar silver"><i style="width:${g2.percent ?? 0}%"></i></div>
      <div class="dim">${g2.percent === null ? "Your starting weight is at or below this goal." : pct(g2.percent) + " of the way. Kept separate from the primary goal."}</div></div>`;
  }
  function forecastCard() {
    const f = S.summary.forecast;
    let body = "";
    if (!f.available) body = `<p class="dim">${esc(f.reason)}</p>`;
    else {
      const gd = f.goalDate, pe = f.projectedAtEnd;
      body = `<div class="two" style="gap:24px">
        <div><div class="k faint" style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;font-weight:800">Approximate goal date (${kg(S.summary.goals.primary.goalKg)} kg)</div>
          ${gd ? `<div class="big-n">${esc(fmt(gd.date, { day: "numeric", month: "short", year: "numeric" }))}</div>
            <div class="range">Likely between ${esc(fmtShort(gd.earliest))} and ${esc(fmtShort(gd.latest))}${gd.afterMissionEnd ? ": after the end date. The mission is not extended." : ""}</div>`
            : `<div class="big-n dim">No date yet</div><div class="range">${esc(f.reason || "")}</div>`}</div>
        <div><div class="k faint" style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;font-weight:800">Projected on ${esc(fmt(pe.date, { day: "numeric", month: "short" }))}</div>
          <div class="big-n">${pe.kg.toFixed(1)}<small>kg</small></div>
          <div class="range">Range ${pe.rangeKg[0].toFixed(1)} to ${pe.rangeKg[1].toFixed(1)} kg · pace ${sgn(f.weeklyChangeKg)} kg/week (${sgn(f.weeklyChangeRangeKg[0])} to ${sgn(f.weeklyChangeRangeKg[1])})</div></div></div>
        <p class="hint">${esc(f.basis)} It rests on ${f.pointsUsed} measured weights.</p>`;
    }
    return `<div class="card"><h2>Forecast</h2>${body}</div>`;
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
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) grid += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="rgba(12,14,15,.07)"/><text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end" fill="#93a09c" font-size="11">${v}</text>`;
    const months = [];
    for (let d = x0; d <= x1; d = addDays(d, 1)) if (d.endsWith("-01") || d === x0) months.push(d);
    let xl = months.map((d) => `<text x="${X(diff(x0, d))}" y="${H - 10}" fill="#93a09c" font-size="11">${esc(fmtShort(d))}</text>`).join("");
    xl += `<text x="${W - R}" y="${H - 10}" text-anchor="end" fill="#93a09c" font-size="11">${esc(fmtShort(x1))}</text>`;
    const goalLine = (v, c, label) => `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="${c}" stroke-dasharray="2 5" stroke-width="1.6"/><text x="${W - R - 4}" y="${Y(v) - 6}" text-anchor="end" fill="${c}" font-size="11" font-weight="700">${label} ${v} kg</text>`;
    const area = pts.length > 1 ? `<defs><linearGradient id="wa" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#18c27f" stop-opacity=".28"/><stop offset="1" stop-color="#18c27f" stop-opacity="0"/></linearGradient></defs><polygon fill="url(#wa)" points="${X(pts[0].x)},${H - B} ${pts.map((p) => `${X(p.x)},${Y(p.y)}`).join(" ")} ${X(pts[pts.length - 1].x)},${H - B}"/>` : "";
    const line = pts.length > 1 ? `<polyline fill="none" stroke="#0c0e0f" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" points="${pts.map((p) => `${X(p.x)},${Y(p.y)}`).join(" ")}"/>` : "";
    const dots = pts.map((p) => `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="${pts.length > 60 ? 2.5 : 4.5}" fill="#0c0e0f" stroke="#fff" stroke-width="2"><title>${esc(fmt(p.d))}: ${p.y.toFixed(2)} kg</title></circle>`).join("");
    let proj = "";
    if (f.projectedAtEnd && pts.length) {
      const last = pts[pts.length - 1];
      const ex = X(span);
      proj = `<polygon points="${X(last.x)},${Y(last.y)} ${ex},${Y(f.projectedAtEnd.rangeKg[0])} ${ex},${Y(f.projectedAtEnd.rangeKg[1])}" fill="rgba(12,14,15,.07)"/>
        <line x1="${X(last.x)}" y1="${Y(last.y)}" x2="${ex}" y2="${Y(f.projectedAtEnd.kg)}" stroke="#5f6866" stroke-width="2" stroke-dasharray="7 6"/>`;
    }
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight over the mission with goals and projection">${grid}${xl}${goalLine(goals[0], "#18c27f", "Goal")}${goalLine(goals[1], "#93a09c", "Secondary")}${area}${proj}${line}${dots}</svg>`;
  }

  /* ------------------------------------------------------------ insights */
  function renderInsights() {
    const an = S.analytics, sm = S.summary;
    if (!an.started) {
      $("view").innerHTML = `<div class="card"><h2>Insights</h2><p class="big-n">Nothing to analyse yet</p><p class="dim">Log your first morning weight and your calories, and this page fills with weekly averages, streaks, milestones and patterns. Nothing is invented for days you did not log.</p></div>`;
      return;
    }
    const maxK = Math.max(1, ...an.weekdays.map((d) => d.avgKcal || 0));
    const burnMax = Math.max(1, ...an.burn.map((b) => Math.max(b.kcal || 0, b.estimatedBurn || 0)));
    const days = [];
    const end = sm.missionEnded ? sm.endDate : S.today;
    for (let d = sm.startDate; d <= end; d = addDays(d, 1)) days.push(d);
    const shown = days.slice(-56);
    const next = nextMilestone();
    $("view").innerHTML = `<div class="col">
      <div class="three">
        <div class="card"><h2>Logging streak</h2><div class="big-n" id="n-streak">${an.streak.current}<small>mornings in a row</small></div><p class="dim">Best run: ${an.streak.longest}. ${an.consistency.weightDays} of ${an.consistency.elapsedDays} mornings logged (${an.consistency.percent}%).</p><div class="bar"><i style="width:${an.consistency.percent}%"></i></div></div>
        <div class="card"><h2>Lowest weight</h2><div class="big-n">${kg(an.lows.lowestKg)}<small>kg</small></div><p class="dim">on ${esc(fmt(an.lows.lowestDate, { day: "numeric", month: "short" }))} · ${an.lows.newLowCount} new low${an.lows.newLowCount === 1 ? "" : "s"} so far</p></div>
        <div class="card"><h2>Biggest one-day drop</h2><div class="big-n down">${an.biggestDrop ? sgn(an.biggestDrop.kg) : "–"}<small>${an.biggestDrop ? "kg" : ""}</small></div><p class="dim">${an.biggestDrop ? "on " + esc(fmt(an.biggestDrop.date, { day: "numeric", month: "short" })) : "needs two mornings in a row"}</p></div>
      </div>
      <div class="card"><h2>Mornings logged</h2><div class="heat">${shown.map((d) => `<i class="${S.weights[d] ? "w" : ""}${d === S.today ? " f" : ""}" title="${esc(fmt(d))}: ${S.weights[d] ? kg(S.weights[d].kg) + " kg" : "not logged"}"></i>`).join("")}</div><p class="hint">Green: a weight was logged. Grey: not logged. The last ${shown.length} days.</p></div>
      <div class="card"><h2>Milestones</h2>
        ${an.milestones.length ? `<div class="mile">${an.milestones.slice().reverse().map((m) => `<span class="badge mint"><b>${esc(m.label)}</b> ${esc(fmtShort(m.date))}</span>`).join("")}</div>` : `<p class="dim">Your first milestone is one kilo below your starting weight.</p>`}
        ${next ? `<p class="hint" style="margin-top:12px">Next: <b>${esc(next.label)}</b>, ${kg(next.away)} kg away.</p>` : ""}</div>
      <div class="card"><h2>Week by week</h2><table><thead><tr><th>Week of</th><th class="num">Avg weight</th><th class="num">Change</th><th class="num">Mornings</th><th class="num">Avg kcal</th><th class="num">Complete days</th></tr></thead><tbody>
        ${an.weeks.slice().reverse().map((w) => `<tr><td>${esc(fmtShort(w.start))}</td><td class="num">${w.avgKg === null ? "–" : kg(w.avgKg)}</td><td class="num ${w.changeKg !== null ? dirClass(w.changeKg) : ""}">${w.changeKg === null ? "" : sgn(w.changeKg)}</td><td class="num">${w.weightDays}/${w.days}</td><td class="num">${w.avgKcal === null ? "–" : int(w.avgKcal)}</td><td class="num">${w.completeDays}</td></tr>`).join("")}</tbody></table>
        <p class="hint">Average weight per Monday-to-Sunday week; the change is against the previous week that had a weight. Calories use days saved as a complete day only.</p></div>
      <div class="two">
        <div class="card"><h2>Calories by weekday</h2><div class="bars">${an.weekdays.map((d) => `<div class="b"><span>${d.avgKcal === null ? "–" : int(d.avgKcal)}</span><i class="${d.avgKcal === null ? "none" : ""}" style="height:${d.avgKcal === null ? 3 : Math.max(4, (d.avgKcal / maxK) * 100)}%"></i>${d.dow}</div>`).join("")}</div><p class="hint">Average of complete days. A weekday with no complete day shows a dash.</p></div>
        <div class="card"><h2>Last 14 days: logged vs estimated burn</h2><div class="bars" style="gap:5px">${an.burn.map((b) => `<div class="b" title="${esc(fmt(b.date))}${b.kcal === null ? ": not logged" : ": " + int(b.kcal) + " kcal logged"}${b.estimatedBurn ? ", about " + int(b.estimatedBurn) + " estimated burn" : ""}"><i class="${b.kcal === null ? "none" : ""}" style="height:${b.kcal === null ? 3 : Math.max(4, (b.kcal / burnMax) * 100)}%;${b.status === "partial" ? "opacity:.45" : ""}${b.status === "zero" ? ";background:linear-gradient(180deg,#ffd9a8,#e9a357)" : ""}"></i>${esc(b.date.slice(8))}</div>`).join("")}</div><p class="hint">Bars are what you logged (faded = day still open, amber = zero intake, grey = not logged). The estimated burn is about ${int((an.burn.filter((b) => b.estimatedBurn).slice(-1)[0] || {}).estimatedBurn)} kcal a day. It is an estimate.</p></div>
      </div>
      ${caloriesCard()}
      ${energyCard()}
      ${assumptionsCard()}
    </div>`;
  }
  function nextMilestone() {
    const sm = S.summary;
    if (!sm.started || sm.latestKg <= sm.goals.primary.goalKg) return null;
    const level = Math.ceil(sm.latestKg) - 1 >= sm.latestKg ? Math.ceil(sm.latestKg) - 1 : Math.floor(sm.latestKg);
    const target = Math.max(level, Math.ceil(sm.goals.primary.goalKg));
    return { label: `${target} kg`, away: sm.latestKg - target };
  }

  function caloriesCard() {
    const c = S.summary.calories;
    const sm = S.summary;
    let strip = "";
    if (sm.started) {
      const end = sm.missionEnded ? sm.endDate : S.today;
      const from = diff(sm.startDate, end) > 59 ? addDays(end, -59) : sm.startDate;
      for (let d = from; d <= end; d = addDays(d, 1)) {
        const r = S.intake[d];
        const cls = !r ? "background:rgba(12,14,15,.08)" : r.zero ? "background:var(--warn)" : r.status === "complete" ? "background:linear-gradient(180deg,#5bf0b8,#18c27f)" : "background:transparent;box-shadow:inset 0 0 0 1.5px #18c27f";
        const label = !r ? "not logged" : r.zero ? "zero intake" : r.status === "complete" ? int(r.kcal) + " kcal (day total)" : int(r.kcal) + " kcal (open)";
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
      <div class="chips"><span class="chip"><b>${c.completeDays}</b> complete</span><span class="chip"><b>${c.partialDays}</b> open</span><span class="chip"><b>${c.zeroDays}</b> zero intake</span><span class="chip"><b>${c.unloggedDays}</b> not logged</span></div>
      <div style="margin-top:14px">${strip}</div>
      <p class="hint">Green: final day total · outline: day still open · amber: zero intake · grey: not logged. ${esc(c.note)}</p></div>`;
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

  /* ------------------------------------------------------------ history */
  function renderHistory() {
    const dates = [...new Set([...Object.keys(S.weights), ...Object.keys(S.intake), ...Object.keys(S.activity)])].sort().reverse();
    const rows = dates.map((d) => {
      const w = S.weights[d], i = S.intake[d], a = S.activity[d];
      const p = S.weights[addDays(d, -1)];
      const dl = w && p ? Math.round((w.kg - p.kg) * 100) / 100 : null;
      const ib = i ? `${int(i.kcal)}${i.zero ? '<span class="tag zero">zero intake</span>' : i.status === "partial" ? '<span class="tag">open</span>' : ""}` : '<span class="faint">not logged</span>';
      const ab = a ? [a.exerciseMin ? `${a.exerciseMin} min ${a.intensity || ""}` : "", a.sleepHours !== undefined ? `sleep ${a.sleepHours} h` : "", a.stress ? `stress ${a.stress}/5` : "", a.note ? "“" + a.note + "”" : ""].filter(Boolean).join(" · ") : "";
      return `<tr><td>${esc(fmt(d))}</td><td class="num">${w ? kg(w.kg) : '<span class="faint">–</span>'}</td><td class="num ${dl !== null ? dirClass(dl) : ""}">${dl !== null ? sgn(dl) : ""}</td><td class="num">${ib}</td><td class="dim">${esc(ab)}</td>
        <td class="num"><button class="link" data-edit="${d}">Edit</button>${w ? `<button class="link d" data-delw="${d}">Delete weight</button>` : ""}${i ? `<button class="link d" data-deli="${d}">Delete intake</button>` : ""}</td></tr>`;
    });
    $("view").innerHTML = `<div class="card"><div class="sect"><h2>All records</h2><button class="btn-ghost" id="csv">Export CSV</button></div>
      ${dates.length ? `<table><thead><tr><th>Day</th><th class="num">Weight kg</th><th class="num">vs day before</th><th class="num">Calories</th><th>Activity</th><th></th></tr></thead><tbody>${rows.join("")}</tbody></table>` : `<p class="dim">Nothing recorded yet.</p>`}
      <p class="hint">One record per day. Saving a day again corrects it; the earlier value is kept in the app's revision log. “Not logged” is never counted as zero.</p></div>`;
    $("csv").onclick = () => downloadCsv();
    document.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => { sel = b.dataset.edit; formStatus = null; view = "today"; render(); window.scrollTo({ top: 0 }); }));
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
    const res = await fetch("/api/export.csv", { headers: { "X-Kcal-Token": token } });
    if (!res.ok) { toast("Could not export."); return; }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `kcal-${S.today}.csv`;
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
        <label class="f"><span>Times (24h, comma separated)</span><input id="s-times" type="text" value="${esc(r.times.join(", "))}"></label>
        <label class="f"><span><input type="checkbox" id="r-miss" ${r.onlyIfMissing ? "checked" : ""} style="width:auto;margin-right:8px">Only if today is not fully logged yet</span></label>
        <div class="row"><button class="btn2" id="r-save">Save reminders</button><button class="btn2" id="r-test">Send a test</button></div>
        <p class="hint">${esc(S.reminders.howItWorks)}</p><p class="hint" id="s-msg2"></p></div>
    </div><div class="col">
      <div class="card"><h2>Backups and export</h2>
        <div class="row"><button class="btn2" id="b-now">Back up now</button><button class="btn2" id="b-csv">Export CSV</button></div>
        <p class="hint">A backup is saved automatically after changes (at most one a minute, the newest 60 are kept). They live in <code>~/Library/Application Support/kcal/data/backups</code>.</p>
        ${b.ok && b.backups.length ? `<table><thead><tr><th>Backup</th><th class="num">Weights</th><th></th></tr></thead><tbody>${b.backups.slice(0, 12).map((x) => `<tr><td>${esc(new Date(x.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }))}</td><td class="num">${x.weights ?? "?"}</td><td class="num"><button class="link" data-restore="${esc(x.name)}">Restore</button></td></tr>`).join("")}</tbody></table>` : `<p class="dim">No backups yet.</p>`}
        <p class="hint" id="s-msg3"></p></div>
      <div class="card"><h2>About</h2><p class="dim">kcal · build ${esc(window.KCAL_BUILD)} · time zone ${esc(S.zone)}</p>
        <p class="dim">Your records stay on this Mac. Updating the app never replaces them.</p>
        <p class="dim">This app is a record-keeping tool. It does not give medical advice. If you feel unwell, or are unsure about your eating or training, talk to a doctor.</p></div>
    </div></div>`;
    const say = (id, text) => ($(id).textContent = text);
    $("s-save-profile").onclick = async () => {
      const res = await api("settings", "POST", { mission: { primaryGoalKg: val("s-g1").replace(",", "."), secondaryGoalKg: val("s-g2").replace(",", ".") }, profile: { age: val("s-age"), heightCm: val("s-h"), rmrKcal: val("s-rmr"), baselineKcal: val("s-base"), baselineExerciseMinPerDay: val("s-bex") } });
      if (res.ok) { S = res.state; say("s-msg1", "Saved."); } else say("s-msg1", res.error);
    };
    $("r-save").onclick = async () => {
      const times = val("s-times").split(/[,\s]+/).filter(Boolean);
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
  window.addEventListener("beforeunload", () => { try { const d = currentDraft(); if (d && differsFromSaved(d)) fetch("/api/draft", { method: "PUT", keepalive: true, headers: { "X-Kcal-Token": token, "Content-Type": "application/json" }, body: JSON.stringify(d) }); } catch {} });
  // A new day starts while the window is open: reload the state.
  setInterval(async () => { const s = await api("state"); if (s.ok && S && s.today !== S.today) { S = s; sel = s.settings.mission.endDate < s.today ? s.settings.mission.endDate : s.today; formStatus = null; render(); } }, 60000);
  load(false);
})();

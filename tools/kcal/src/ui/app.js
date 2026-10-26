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
    const colors = ["#2ee59d", "#7dffc9", "#7cc4ff", "#ffb15c", "#c9b8ff", "#ffffff", "#ffffff"];
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
    const had = new Set((before.achievements || []).filter((a) => a.unlocked).map((a) => a.id));
    const earned = (after.achievements || []).filter((a) => a.unlocked && !had.has(a.id));
    if (earned.length) return { big: true, text: `Achievement unlocked: ${earned[0].title}${earned.length > 1 ? ` (+${earned.length - 1} more)` : ""}` };
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
        <div class="nav">${[["today", "Today"], ["insights", "Insights"], ["awards", "Awards"], ["history", "History"], ["settings", "Settings"]].map(([v, l]) => `<button class="${view === v ? "on" : ""}" data-view="${v}">${l}</button>`).join("")}</div>
      </div>
      ${banners()}
      <div id="view"></div>`;
    document.querySelectorAll("[data-view]").forEach((b) => (b.onclick = () => { view = b.dataset.view; formStatus = null; render(); window.scrollTo({ top: 0 }); }));
    animateBar();
    if (view === "today") renderToday();
    else if (view === "insights") renderInsights();
    else if (view === "awards") renderAwards();
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
    wireCharts();
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
    const before = S;
    const r = await api("intake/finish", "POST", { date: day0 });
    if (!r.ok) { toast(r.error); return; }
    const cel = celebration(before, r.state);
    S = r.state;
    formStatus = { kind: "ok", text: `${fmt(day0)} is finished at ${int(S.intake[day0].kcal)} kcal.` };
    fx = { confetti: origin, big: Boolean(cel && cel.big), celebrate: cel };
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
        <div class="stat"><div class="k">Latest weight</div><div class="v">${kg(sm.latestKg)}<small>kg</small></div><div class="n">${esc(fmt(sm.latestDate, { day: "numeric", month: "short" }))}</div>${spark(Object.keys(S.weights).sort().slice(-14).map((d) => S.weights[d].kg), "#2ee59d")}</div>
        <div class="stat"><div class="k">Total change</div><div class="v ${dirClass(sm.totalChangeKg)}">${sgn(sm.totalChangeKg)}<small>kg</small></div><div class="n">since the first weight</div>${spark(Object.keys(S.weights).sort().slice(-14).map((d) => S.weights[d].kg - sm.startKg), "#f4f4f2")}</div>
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
      ${weightCard()}
      ${calCard()}
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

  /* ------------------------------------------------------- Shopify-style charts */
  const chartState = { weight: "mission", cal: "30" };
  const TABS = [["7", "7D"], ["14", "14D"], ["30", "30D"], ["mission", "Mission"]];
  const eachDay = (a, b) => { const o = []; for (let d = a; diff(d, b) >= 0; d = addDays(d, 1)) o.push(d); return o; };
  function windowFor(range) {
    const sm = S.summary;
    const asOf = sm.missionEnded ? sm.endDate : S.today;
    if (range === "mission") return { from: sm.startDate, to: sm.endDate, asOf, mission: true };
    let from = addDays(asOf, -(Number(range) - 1));
    if (diff(sm.startDate, from) < 0) from = sm.startDate;
    return { from, to: asOf, asOf, mission: false };
  }
  // A smooth line through the points (Catmull-Rom turned into Bezier curves).
  function smooth(pts) {
    if (pts.length < 2) return "";
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return d;
  }
  function tabsHtml(which) {
    return `<div class="tabs" data-tabs="${which}">${TABS.map(([v, l]) => `<button data-r="${v}" class="${chartState[which] === v ? "on" : ""}">${l}</button>`).join("")}</div>`;
  }
  function weightCard() {
    const sm = S.summary;
    const win = windowFor(chartState.weight);
    const all = Object.keys(S.weights).sort();
    const pts = all.filter((d) => d >= win.from && d <= win.asOf).map((d) => ({ d, x: diff(win.from, d), y: S.weights[d].kg }));
    const movavg = pts.map((p) => {
      const vals = all.filter((d) => diff(d, p.d) >= 0 && diff(d, p.d) <= 6).map((d) => S.weights[d].kg);
      return { d: p.d, x: p.x, y: vals.reduce((a, b) => a + b, 0) / vals.length };
    });
    const delta = pts.length >= 2 ? pts[pts.length - 1].y - pts[0].y : null;
    const latest = pts.length ? pts[pts.length - 1].y : sm.latestKg;
    const f = sm.forecast;
    const W = 760, H = 290, L = 46, R = 14, T = 14, B = 28;
    const span = Math.max(1, diff(win.from, win.to));
    const ys = pts.map((p) => p.y);
    if (win.mission) { ys.push(sm.goals.primary.goalKg); if (f.projectedAtEnd) ys.push(f.projectedAtEnd.rangeKg[0], f.projectedAtEnd.rangeKg[1]); ys.push(sm.goals.secondary.goalKg); }
    let lo = Math.min(...ys), hi = Math.max(...ys);
    const pad = Math.max(0.6, (hi - lo) * 0.1);
    lo -= pad; hi += pad;
    const X = (x) => L + (x / span) * (W - L - R);
    const Y = (y) => T + (1 - (y - lo) / (hi - lo)) * (H - T - B);
    const step = (hi - lo) > 30 ? 10 : (hi - lo) > 12 ? 5 : (hi - lo) > 5 ? 2 : (hi - lo) > 2.4 ? 1 : 0.5;
    let grid = "";
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) grid += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="rgba(255,255,255,.07)"/><text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end" fill="#63636b" font-size="11">${Number.isInteger(v) ? v : v.toFixed(1)}</text>`;
    const tickEvery = span > 40 ? 14 : span > 14 ? 7 : span > 7 ? 2 : 1;
    let xl = "";
    for (let i = 0; i <= span; i += tickEvery) xl += `<text x="${X(i)}" y="${H - 8}" text-anchor="${i === 0 ? "start" : "middle"}" fill="#63636b" font-size="11">${esc(fmtShort(addDays(win.from, i)))}</text>`;
    const goalLine = (v, c, label) => `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="${c}" stroke-dasharray="2 5" stroke-width="1.5" opacity=".9"/><text x="${W - R - 4}" y="${Y(v) - 6}" text-anchor="end" fill="${c}" font-size="11" font-weight="700">${label} ${v} kg</text>`;
    const xy = pts.map((p) => [X(p.x), Y(p.y)]);
    const area = xy.length > 1 ? `<path class="fadein" d="${smooth(xy)} L${xy[xy.length - 1][0]},${H - B} L${xy[0][0]},${H - B} Z" fill="url(#wgrad)"/>` : "";
    const line = xy.length > 1 ? `<path class="draw" d="${smooth(xy)}" fill="none" stroke="#2ee59d" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>` : "";
    const maxy = movavg.map((p) => [X(p.x), Y(p.y)]);
    const avgLine = maxy.length > 2 ? `<path class="draw" d="${smooth(maxy)}" fill="none" stroke="#f4f4f2" stroke-opacity=".75" stroke-width="1.6" stroke-dasharray="1 0"/>` : "";
    const dots = pts.length <= 45 ? xy.map((q, i) => `<circle class="fadein" cx="${q[0]}" cy="${q[1]}" r="${pts.length > 20 ? 2.6 : 4}" fill="#050506" stroke="#2ee59d" stroke-width="2"/>`).join("") : "";
    let proj = "";
    if (win.mission && f.projectedAtEnd && pts.length) {
      const last = pts[pts.length - 1];
      const ex = X(span);
      proj = `<polygon class="fadein" points="${X(last.x)},${Y(last.y)} ${ex},${Y(f.projectedAtEnd.rangeKg[0])} ${ex},${Y(f.projectedAtEnd.rangeKg[1])}" fill="rgba(255,255,255,.07)"/><line class="fadein" x1="${X(last.x)}" y1="${Y(last.y)}" x2="${ex}" y2="${Y(f.projectedAtEnd.kg)}" stroke="#9a9aa1" stroke-width="2" stroke-dasharray="7 6"/>`;
    }
    const goals = win.mission ? goalLine(sm.goals.primary.goalKg, "#2ee59d", "Goal") + goalLine(sm.goals.secondary.goalKg, "#7a7a82", "Secondary") : "";
    const dCls = delta === null ? "" : delta < 0 ? "good" : delta > 0 ? "bad" : "";
    const label = TABS.find((t) => t[0] === chartState.weight)[1];
    const empty = !pts.length ? `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="#63636b" font-size="14">No weights logged in this range</text>` : "";
    return `<div class="card" id="card-weight"><div class="chead"><div><div class="m">Weight</div><div class="val">${latest === null ? "–" : kg(latest)}<small>kg</small>${delta === null ? "" : `<span class="delta ${dCls}">${delta < 0 ? "▼" : delta > 0 ? "▲" : "–"} ${Math.abs(delta).toFixed(2)} kg · ${label}</span>`}</div></div>${tabsHtml("weight")}</div>
      <div class="chartwrap" id="cw-weight"><svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight chart"><defs><linearGradient id="wgrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2ee59d" stop-opacity=".30"/><stop offset="1" stop-color="#2ee59d" stop-opacity="0"/></linearGradient></defs>${grid}${xl}${goals}${area}${proj}${avgLine}${line}${dots}${empty}<line id="vl-weight" y1="${T}" y2="${H - B}" stroke="#fff" stroke-opacity=".35" stroke-dasharray="3 4" style="display:none"/><circle id="hl-weight" r="6" fill="#2ee59d" stroke="#050506" stroke-width="3" style="display:none"/></svg><div class="tip" id="tip-weight"></div></div>
      <div class="legend"><span><i class="dot"></i>Weight</span><span><i style="border-color:#f4f4f2;opacity:.75"></i>7-day average</span>${win.mission ? `<span><i style="border-color:#9a9aa1;border-top-style:dashed"></i>Projection (not a measurement)</span><span><i style="border-color:#2ee59d;border-top-style:dotted"></i>Goal</span>` : ""}</div></div>`;
  }
  function weightTipData(win) {
    const all = Object.keys(S.weights).sort();
    return all.filter((d) => d >= win.from && d <= win.asOf).map((d) => {
      const i = all.indexOf(d);
      const prev = i > 0 && diff(all[i - 1], d) === 1 ? S.weights[all[i - 1]].kg : null;
      const vals = all.filter((x) => diff(x, d) >= 0 && diff(x, d) <= 6).map((x) => S.weights[x].kg);
      const intake = S.intake[d];
      return { d, x: diff(win.from, d), y: S.weights[d].kg, prev, avg: vals.reduce((a, b) => a + b, 0) / vals.length, intake };
    });
  }

  function calCard() {
    const sm = S.summary;
    const win = windowFor(chartState.cal);
    const days = eachDay(win.from, win.asOf);
    const burn = Object.fromEntries(S.analytics.burn.map((b) => [b.date, b.estimatedBurn]));
    const recs = days.map((d) => ({ d, r: S.intake[d] || null, burn: burn[d] ?? null }));
    const comp = recs.filter((x) => x.r && x.r.status === "complete" && !x.r.zero);
    const avg = comp.length ? comp.reduce((a, x) => a + x.r.kcal, 0) / comp.length : null;
    // The window before this one, same length, for the comparison pill.
    const n = days.length;
    const prevDays = chartState.cal === "mission" ? [] : eachDay(addDays(win.from, -n), addDays(win.from, -1)).filter((d) => diff(sm.startDate, d) >= 0);
    const prevComp = prevDays.filter((d) => S.intake[d] && S.intake[d].status === "complete" && !S.intake[d].zero);
    const prevAvg = prevComp.length ? prevComp.reduce((a, d) => a + S.intake[d].kcal, 0) / prevComp.length : null;
    const dl = avg !== null && prevAvg !== null ? avg - prevAvg : null;
    const W = 760, H = 250, L = 46, R = 14, T = 14, B = 28;
    const maxv = Math.max(500, ...recs.map((x) => Math.max(x.r ? x.r.kcal : 0, x.burn || 0)));
    const top = Math.ceil((maxv * 1.1) / 500) * 500;
    const Y = (v) => T + (1 - v / top) * (H - T - B);
    const bw = (W - L - R) / Math.max(1, recs.length);
    const X = (i) => L + i * bw;
    let grid = "";
    for (let v = 0; v <= top; v += top > 3000 ? 1000 : 500) grid += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="rgba(255,255,255,.07)"/><text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end" fill="#63636b" font-size="11">${v}</text>`;
    const gap = Math.min(6, bw * 0.25);
    const bars = recs.map((x, i) => {
      if (!x.r) return `<rect x="${X(i) + gap / 2}" y="${H - B - 3}" width="${Math.max(2, bw - gap)}" height="3" rx="1.5" fill="#26262b"/>`;
      if (x.r.zero) return `<rect class="barrect" x="${X(i) + gap / 2}" y="${H - B - 8}" width="${Math.max(2, bw - gap)}" height="8" rx="2" fill="#ffb15c" style="animation-delay:${Math.min(i * 12, 500)}ms"/>`;
      const h = (x.r.kcal / top) * (H - T - B);
      const open = x.r.status !== "complete";
      return `<rect class="barrect" x="${X(i) + gap / 2}" y="${H - B - h}" width="${Math.max(2, bw - gap)}" height="${h}" rx="${Math.min(6, bw / 3)}" fill="${open ? "rgba(46,229,157,.28)" : "url(#cgrad)"}" ${open ? 'stroke="#2ee59d" stroke-dasharray="3 3"' : ""} style="animation-delay:${Math.min(i * 12, 500)}ms"/>`;
    }).join("");
    const burnPts = recs.filter((x) => x.burn).map((x) => [X(recs.indexOf(x)) + bw / 2, Y(x.burn)]);
    const burnLine = burnPts.length > 1 ? `<path class="draw" d="${smooth(burnPts)}" fill="none" stroke="#7cc4ff" stroke-width="1.8" stroke-dasharray="1 0" opacity=".9"/>` : "";
    const avgLine = avg !== null ? `<line class="fadein" x1="${L}" x2="${W - R}" y1="${Y(avg)}" y2="${Y(avg)}" stroke="#f4f4f2" stroke-opacity=".6" stroke-dasharray="5 5"/><text class="fadein" x="${W - R - 4}" y="${Y(avg) - 6}" text-anchor="end" fill="#f4f4f2" font-size="11" font-weight="700">avg ${int(avg)}</text>` : "";
    const tickEvery = recs.length > 40 ? 14 : recs.length > 14 ? 7 : recs.length > 7 ? 2 : 1;
    let xl = "";
    for (let i = 0; i < recs.length; i += tickEvery) xl += `<text x="${X(i) + bw / 2}" y="${H - 8}" text-anchor="middle" fill="#63636b" font-size="11">${esc(fmtShort(recs[i].d))}</text>`;
    const label = TABS.find((t) => t[0] === chartState.cal)[1];
    return `<div class="card" id="card-cal"><div class="chead"><div><div class="m">Calories · average per finished day</div><div class="val">${avg === null ? "–" : int(avg)}<small>kcal</small>${dl === null ? "" : `<span class="delta">${dl > 0 ? "▲" : dl < 0 ? "▼" : "–"} ${int(Math.abs(dl))} vs the ${label} before</span>`}</div></div>${tabsHtml("cal")}</div>
      <div class="chartwrap" id="cw-cal"><svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Calories chart"><defs><linearGradient id="cgrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7dffc9"/><stop offset="1" stop-color="#14b878"/></linearGradient></defs>${grid}${xl}${bars}${burnLine}${avgLine}<rect id="hl-cal" y="${T}" height="${H - T - B}" fill="#fff" fill-opacity=".06" style="display:none"/></svg><div class="tip" id="tip-cal"></div></div>
      <div class="legend"><span><i class="dot"></i>Finished day</span><span><i style="border-color:#2ee59d;border-top-style:dashed"></i>Day still open</span><span><i style="border-color:#ffb15c"></i>Zero intake</span><span><i style="border-color:#7cc4ff"></i>Estimated burn (an estimate)</span></div></div>`;
  }

  function wireCharts() {
    for (const which of ["weight", "cal"]) {
      const card = $("card-" + which);
      if (!card) continue;
      card.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => { chartState[which] = b.dataset.r; redrawChart(which); }));
      const svg = card.querySelector("svg.chart");
      svg.querySelectorAll(".draw").forEach((el) => el.style.setProperty("--len", Math.ceil(el.getTotalLength ? el.getTotalLength() : 2000)));
      const wrap = $("cw-" + which), tip = $("tip-" + which);
      const vb = svg.viewBox.baseVal;
      if (which === "weight") {
        const win = windowFor(chartState.weight);
        const data = weightTipData(win);
        if (!data.length) continue;
        const span = Math.max(1, diff(win.from, win.to));
        const L = 46, R = 14;
        const xOf = (x) => L + (x / span) * (vb.width - L - R);
        svg.addEventListener("pointermove", (e) => {
          const r = svg.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * vb.width;
          let best = data[0];
          for (const d of data) if (Math.abs(xOf(d.x) - px) < Math.abs(xOf(best.x) - px)) best = d;
          const vl = $("vl-weight"), hl = $("hl-weight");
          const cx = xOf(best.x);
          const ys = data.map((d) => d.y), allY = [...ys];
          vl.setAttribute("x1", cx); vl.setAttribute("x2", cx); vl.style.display = "";
          // y position from the dot already drawn: recompute with the same scale
          const circles = svg.querySelectorAll('circle[stroke="#2ee59d"]');
          const idx = data.indexOf(best);
          let cy = null;
          if (circles[idx]) cy = Number(circles[idx].getAttribute("cy"));
          if (cy === null) { cy = 150; }
          hl.setAttribute("cx", cx); hl.setAttribute("cy", cy); hl.style.display = "";
          const kc = best.intake ? (best.intake.zero ? "0 kcal (zero intake)" : int(best.intake.kcal) + " kcal" + (best.intake.status === "complete" ? "" : " so far")) : "calories not logged";
          tip.innerHTML = `<em>${esc(fmt(best.d))}</em><b>${kg(best.y)} kg</b>${best.prev !== null ? `<em>${sgn(best.y - best.prev)} kg vs the day before</em><br>` : ""}<em>7-day average ${kg(best.avg)} kg</em><br><em>${esc(kc)}</em>`;
          const wr = wrap.getBoundingClientRect();
          tip.style.left = Math.min(Math.max(((cx / vb.width) * r.width), 80), r.width - 80) + "px";
          tip.style.top = (cy / vb.height) * r.height - 12 + "px";
          tip.classList.add("on");
        });
        svg.addEventListener("pointerleave", () => { tip.classList.remove("on"); $("vl-weight").style.display = "none"; $("hl-weight").style.display = "none"; });
      } else {
        const win = windowFor(chartState.cal);
        const days = eachDay(win.from, win.asOf);
        const burn = Object.fromEntries(S.analytics.burn.map((b) => [b.date, b.estimatedBurn]));
        const L = 46, R = 14, bw = (vb.width - L - R) / Math.max(1, days.length);
        svg.addEventListener("pointermove", (e) => {
          const r = svg.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * vb.width;
          const i = Math.max(0, Math.min(days.length - 1, Math.floor((px - L) / bw)));
          const d = days[i], rec = S.intake[d];
          const hl = $("hl-cal");
          hl.setAttribute("x", L + i * bw); hl.setAttribute("width", bw); hl.style.display = "";
          const total = rec ? (rec.zero ? "0 kcal" : int(rec.kcal) + " kcal") : "not logged";
          const status = rec ? (rec.zero ? "zero intake" : rec.status === "complete" ? "day finished" : "day still open") : "";
          const meals = rec && rec.meals ? rec.meals.map((m) => `${esc(m.label)} ${int(m.kcal)}`).join(" · ") : "";
          tip.innerHTML = `<em>${esc(fmt(d))}</em><b>${esc(total)}</b><em>${esc(status)}</em>${meals ? `<br><em>${meals}</em>` : ""}${burn[d] ? `<br><em>estimated burn about ${int(burn[d])} kcal</em>` : ""}`;
          tip.style.left = Math.min(Math.max(((L + (i + 0.5) * bw) / vb.width) * r.width, 90), r.width - 90) + "px";
          tip.style.top = "30px";
          tip.classList.add("on");
        });
        svg.addEventListener("pointerleave", () => { tip.classList.remove("on"); $("hl-cal").style.display = "none"; });
      }
    }
  }
  function redrawChart(which) {
    const card = $("card-" + which);
    if (!card) return;
    const holder = document.createElement("div");
    holder.innerHTML = which === "weight" ? weightCard() : calCard();
    card.replaceWith(holder.firstElementChild);
    wireCharts();
  }
  // A tiny line for a stat tile.
  function spark(values, color) {
    if (values.length < 2) return "";
    const W = 120, H = 30;
    const lo = Math.min(...values), hi = Math.max(...values), r = hi - lo || 1;
    const pts = values.map((v, i) => [(i / (values.length - 1)) * W, H - 3 - ((v - lo) / r) * (H - 6)]);
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path class="draw" d="${smooth(pts)}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
  }

  /* ------------------------------------------------------------- awards */
  const GLYPH = {
    flame: '<path d="M12 2c1 4-2 5-2 8 0 1.5 1 3 2.5 3S15 11.7 14.6 10c2 1.5 3.4 4 3.4 6.4A6 6 0 0 1 6 16.8C6 12 12 9 12 2z" fill="currentColor"/>',
    down: '<path d="M12 4v13m0 0l-5.5-5.5M12 17l5.5-5.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
    target: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
    crown: '<path d="M4 18l-1.2-10 5 4L12 5l4.2 7 5-4L20 18z" fill="currentColor"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" fill="currentColor"/>',
    sun: '<circle cx="12" cy="12" r="4.2" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2.1 2.1M16.9 16.9L19 19M5 19l2.1-2.1M16.9 7.1L19 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    calendar: '<rect x="4" y="5" width="16" height="15" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 10h16M9 3v4M15 3v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  };
  function medal(a, i) {
    const C = 2 * Math.PI * 34;
    const ring = a.unlocked
      ? `<circle cx="38" cy="38" r="34" fill="none" stroke="url(#mg${i})" stroke-width="4"/>`
      : `<circle cx="38" cy="38" r="34" fill="none" stroke="#26262b" stroke-width="4"/><circle cx="38" cy="38" r="34" fill="none" stroke="#14b878" stroke-width="4" stroke-linecap="round" stroke-dasharray="${(C * a.progress).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 38 38)"/>`;
    return `<svg class="medal" viewBox="0 0 76 76"><defs><linearGradient id="mg${i}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7dffc9"/><stop offset="1" stop-color="#14b878"/></linearGradient><radialGradient id="mb${i}" cx="50%" cy="30%" r="80%"><stop offset="0" stop-color="${a.unlocked ? "#1f3a30" : "#1a1a1d"}"/><stop offset="1" stop-color="#0b0b0c"/></radialGradient></defs>
      <circle cx="38" cy="38" r="31" fill="url(#mb${i})"/>${ring}<g transform="translate(24 24) scale(1.17)" style="color:${a.unlocked ? "#7dffc9" : "#5a5a62"}">${GLYPH[a.icon] || GLYPH.star}</g></svg>`;
  }
  function renderAwards() {
    const list = S.achievements;
    const got = list.filter((a) => a.unlocked).sort((a, b) => (a.date < b.date ? 1 : -1));
    const next = list.filter((a) => !a.unlocked).sort((a, b) => b.progress - a.progress);
    const card = (a, i) => `<div class="award ${a.unlocked ? "on" : "off"}" style="animation-delay:${Math.min(i * 30, 400)}ms">${medal(a, i)}<b>${esc(a.title)}</b><p>${esc(a.desc)}</p>${a.unlocked ? `<div class="when">${esc(fmt(a.date, { day: "numeric", month: "short" }))}</div>` : `<div class="pbar"><i style="width:${Math.round(a.progress * 100)}%"></i></div><div class="when">${a.hint ? esc(a.hint) : Math.round(a.progress * 100) + "%"}</div>`}</div>`;
    $("view").innerHTML = `<div class="col">
      <div class="card"><h2>Awards</h2><div class="big-n" id="n-awards">${got.length}<small>of ${list.length} unlocked</small></div>
        <div class="bar"><i style="width:${(got.length / list.length) * 100}%"></i></div>
        <p class="hint">Awards are for what you did: mornings weighed, kilos down, days finished, goals met. Nothing is awarded for eating less or skipping food.</p></div>
      ${got.length ? `<div class="card"><h2>Unlocked</h2><div class="awards">${got.map(card).join("")}</div></div>` : ""}
      <div class="card"><h2>${got.length ? "Next up" : "Locked"}</h2><div class="awards">${next.map((a, i) => card(a, i + got.length)).join("")}</div></div>
    </div>`;
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
        const cls = !r ? "background:#1f1f23" : r.zero ? "background:var(--warn)" : r.status === "complete" ? "background:linear-gradient(180deg,#7dffc9,#14b878)" : "background:transparent;box-shadow:inset 0 0 0 1.5px #2ee59d";
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

// Every number the app shows is worked out here, from the records and nothing
// else. Nothing is invented: a missing weight stays missing, a day with no
// intake record stays "not logged", and a forecast is only returned when the
// data can carry one (otherwise it says why not).

import { addDays, dayDiff, eachDay } from "./time.mjs";

export const DEFAULT_SETTINGS = {
  mission: { endDate: "2026-12-25", primaryGoalKg: 96, secondaryGoalKg: 90 },
  profile: { age: 29, heightCm: 185, rmrKcal: 1800, baselineKcal: 2790, baselineExerciseMinPerDay: 30 },
  reminders: { enabled: false, times: ["20:00"], onlyIfMissing: true },
};

// Metabolic equivalents (kcal per kg per hour, gross) for the three intensities
// the log offers. Compendium of Physical Activities values for general walking,
// brisk/mixed training and hard training.
export const MET = { light: 3.0, moderate: 5.0, vigorous: 8.0 };

// Mifflin-St Jeor: resting rate rises by 10 kcal/day for every kg of body weight.
export const RMR_KCAL_PER_KG = 10;

// Two-sided 95% Student t, by degrees of freedom.
const T95 = { 1: 12.71, 2: 4.30, 3: 3.18, 4: 2.78, 5: 2.57, 6: 2.45, 7: 2.36, 8: 2.31, 9: 2.26, 10: 2.23, 11: 2.2, 12: 2.18, 13: 2.16, 14: 2.14, 15: 2.13, 20: 2.09, 30: 2.04 };
export function t95(df) {
  if (df < 1) return Infinity;
  if (T95[df]) return T95[df];
  const keys = Object.keys(T95).map(Number).sort((a, b) => a - b);
  for (let i = keys.length - 1; i >= 0; i--) if (keys[i] < df) return T95[keys[i]];
  return 1.96;
}

const round = (x, p = 2) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 10 ** p) / 10 ** p);

/** Least squares line through [x, y] points, with the standard error of the slope. */
export function regression(points) {
  const n = points.length;
  if (n < 2) return null;
  const mx = points.reduce((s, p) => s + p[0], 0) / n;
  const my = points.reduce((s, p) => s + p[1], 0) / n;
  let sxx = 0, sxy = 0;
  for (const [x, y] of points) {
    sxx += (x - mx) ** 2;
    sxy += (x - mx) * (y - my);
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  let sse = 0;
  for (const [x, y] of points) sse += (y - (intercept + slope * x)) ** 2;
  const df = n - 2;
  const se = df > 0 ? Math.sqrt(sse / df / sxx) : null;
  const s = df > 0 ? Math.sqrt(sse / df) : null;
  return { n, slope, intercept, se, s, df, sxx, mx };
}

export function weightPoints(weights, from, to) {
  const out = [];
  for (const [d, w] of Object.entries(weights)) {
    if (d >= from && d <= to) out.push([d, w.kg]);
  }
  return out.sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

/** The weight on a day, or the last one measured before it. Never a later one. */
export function weightAtOrBefore(weights, date) {
  let best = null;
  for (const d of Object.keys(weights)) if (d <= date && (best === null || d > best)) best = d;
  return best ? { date: best, kg: weights[best].kg } : null;
}

/** Resting rate scaled to today's body weight from the measured one. */
export function rmrAt(profile, kg, startKg) {
  if (startKg === null || startKg === undefined) return profile.rmrKcal;
  return profile.rmrKcal + RMR_KCAL_PER_KG * (kg - startKg);
}

export function baselineMultiplier(profile) {
  return profile.baselineKcal / profile.rmrKcal;
}

/**
 * Estimated expenditure for one day, with the working shown.
 * The baseline multiplier already contains ordinary activity and a typical
 * amount of exercise (baselineExerciseMinPerDay). Logged exercise only adds the
 * minutes ABOVE that allowance, and only its net energy (MET - 1), so nothing
 * the multiplier already counts is counted twice.
 */
export function expenditureFor(profile, kg, startKg, activity) {
  const rmr = rmrAt(profile, kg, startKg);
  const baseline = rmr * baselineMultiplier(profile);
  let extra = 0;
  let extraMinutes = 0;
  if (activity && activity.exerciseMin > 0 && MET[activity.intensity]) {
    extraMinutes = Math.max(0, activity.exerciseMin - profile.baselineExerciseMinPerDay);
    extra = (MET[activity.intensity] - 1) * kg * (extraMinutes / 60);
  }
  return { rmr, baseline, extra, extraMinutes, total: baseline + extra };
}

export function validateWeight(kg) {
  if (typeof kg !== "number" || !Number.isFinite(kg)) return "Enter the weight as a number, like 106.75.";
  if (kg < 30 || kg > 400) return "That weight is outside 30 to 400 kg. Check the number.";
  return null;
}
export function validateKcal(kcal) {
  if (typeof kcal !== "number" || !Number.isFinite(kcal)) return "Enter calories as a number.";
  if (kcal < 0) return "Calories cannot be negative.";
  if (kcal > 20000) return "That is above 20,000 kcal. Check the number.";
  return null;
}

/**
 * Everything the screen needs. `today` is a YYYY-MM-DD string chosen by the
 * caller (the server's clock in the user's zone) so this stays testable.
 */
export function summarize(state, today) {
  const { weights, intake, activity } = state;
  const settings = state.settings;
  const { endDate, primaryGoalKg, secondaryGoalKg } = settings.mission;
  const profile = settings.profile;

  const weightDates = Object.keys(weights).sort();
  const startDate = weightDates[0] ?? null;
  const first = startDate ? weights[startDate].kg : null;
  const lastDate = weightDates.length ? weightDates[weightDates.length - 1] : null;
  const latest = lastDate ? weights[lastDate].kg : null;

  const ended = dayDiff(today, endDate) < 0;
  const asOf = ended ? endDate : today;

  const out = {
    today,
    endDate,
    missionEnded: ended,
    missionActive: !ended,
    started: startDate !== null,
    startDate,
    startKg: first,
    latestKg: latest,
    latestDate: lastDate,
    totalChangeKg: first !== null ? round(latest - first) : null,
    previousDay: null,
    goals: {
      primary: goalBlock(first, latest, primaryGoalKg),
      secondary: goalBlock(first, latest, secondaryGoalKg),
    },
    days: null,
    trend7: null,
    forecast: null,
    calories: null,
    energy: null,
    assumptions: assumptionsText(profile),
  };

  if (!startDate) {
    out.days = { elapsed: 0, remaining: Math.max(0, dayDiff(today, endDate) + 1), total: null };
    out.calories = calorieBlock(state, null, asOf);
    out.forecast = { available: false, reason: "Log your first weight to begin. Nothing is assumed about your starting weight." };
    return out;
  }

  // Day counts. Elapsed counts the start day and today; remaining counts today
  // through the end date, inclusive of both ends (the 25th is a full day).
  const elapsed = Math.max(0, dayDiff(startDate, asOf) + 1);
  const remaining = ended ? 0 : dayDiff(today, endDate) + 1;
  out.days = { elapsed, remaining, total: dayDiff(startDate, endDate) + 1 };

  // The day before: only when the weight of both consecutive calendar days exists.
  if (weights[lastDate] && weights[addDays(lastDate, -1)]) {
    out.previousDay = {
      date: addDays(lastDate, -1),
      kg: weights[addDays(lastDate, -1)].kg,
      changeKg: round(weights[lastDate].kg - weights[addDays(lastDate, -1)].kg),
    };
  }

  out.trend7 = trendBlock(weights, asOf);
  out.forecast = forecastBlock(weights, asOf, endDate, primaryGoalKg, first);
  out.calories = calorieBlock(state, startDate, asOf);
  out.energy = energyBlock(state, startDate, asOf, first, out.trend7);
  return out;
}

function goalBlock(first, latest, goal) {
  if (first === null) return { goalKg: goal, remainingKg: null, percent: null, reached: false };
  const remaining = latest - goal;
  let percent = null;
  if (first > goal) percent = Math.max(0, Math.min(100, ((first - latest) / (first - goal)) * 100));
  return {
    goalKg: goal,
    remainingKg: round(Math.max(0, remaining)),
    percent: round(percent, 1),
    reached: latest <= goal,
    alreadyAtStart: first <= goal,
  };
}

function trendBlock(weights, asOf) {
  const pts = weightPoints(weights, addDays(asOf, -6), asOf);
  const span = pts.length ? dayDiff(pts[0][0], pts[pts.length - 1][0]) : 0;
  if (pts.length < 3 || span < 3) {
    return { available: false, count: pts.length, reason: `Needs at least 3 weights over 4 or more days inside the last 7 (there ${pts.length === 1 ? "is" : "are"} ${pts.length}).` };
  }
  const base = pts[0][0];
  const reg = regression(pts.map(([d, y]) => [dayDiff(base, d), y]));
  const avg = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const prevPts = weightPoints(weights, addDays(asOf, -13), addDays(asOf, -7));
  const prevAvg = prevPts.length ? prevPts.reduce((s, p) => s + p[1], 0) / prevPts.length : null;
  return {
    available: true,
    count: pts.length,
    weeklyChangeKg: round(reg.slope * 7),
    averageKg: round(avg),
    previousWeekAverageKg: round(prevAvg),
    averageDeltaKg: prevAvg !== null ? round(avg - prevAvg) : null,
  };
}

const MIN_POINTS = 5;
const MIN_SPAN = 7;
const FLAT_SLOPE = -0.005; // kg/day: slower than about 35 g a week counts as flat

function forecastBlock(weights, asOf, endDate, goalKg, firstKg) {
  const pts = weightPoints(weights, addDays(asOf, -13), asOf);
  const span = pts.length ? dayDiff(pts[0][0], pts[pts.length - 1][0]) : 0;
  const latestDate = pts.length ? pts[pts.length - 1][0] : null;
  const latestKg = latestDate ? weights[latestDate].kg : null;

  // Goal already met by a real measurement: that is a fact, not a forecast.
  const allDates = Object.keys(weights).sort();
  const hit = allDates.find((d) => weights[d].kg <= goalKg && weights[allDates[0]].kg > goalKg);
  const base = {
    available: false,
    basis: "Straight-line fit through the weights of the last 14 days. A projection, not a promise.",
    goalReached: hit ? { date: hit } : null,
  };
  if (pts.length < MIN_POINTS || span < MIN_SPAN) {
    return { ...base, reason: `A forecast needs at least ${MIN_POINTS} weights spread over at least ${MIN_SPAN} days within the last 14 days. There ${pts.length === 1 ? "is" : "are"} ${pts.length} weight${pts.length === 1 ? "" : "s"} over ${span} day${span === 1 ? "" : "s"}.` };
  }
  const x0 = pts[0][0];
  const reg = regression(pts.map(([d, y]) => [dayDiff(x0, d), y]));
  if (!reg || reg.se === null) return { ...base, reason: "Not enough spread in the weights to fit a line." };
  const t = t95(reg.df);
  const lo = reg.slope - t * reg.se;
  const hi = reg.slope + t * reg.se;
  const xNow = dayDiff(x0, asOf);
  const fittedNow = reg.intercept + reg.slope * xNow;
  const daysToEnd = Math.max(0, dayDiff(asOf, endDate));
  const proj = fittedNow + reg.slope * daysToEnd;
  // Uncertainty of the fitted value at the end date: the line and the slope.
  const seFit = reg.s * Math.sqrt(1 / reg.n + (dayDiff(x0, endDate) - reg.mx) ** 2 / reg.sxx);
  const half = t * seFit;
  const result = {
    ...base,
    weeklyChangeKg: round(reg.slope * 7),
    weeklyChangeRangeKg: [round(lo * 7), round(hi * 7)],
    projectedAtEnd: { date: endDate, kg: round(proj, 1), rangeKg: [round(proj - half, 1), round(proj + half, 1)] },
    pointsUsed: pts.length,
  };

  if (latestKg !== null && latestKg <= goalKg) {
    return { ...result, available: true, goalDate: null, reason: "The goal weight has been reached by a measurement." };
  }
  if (reg.slope >= FLAT_SLOPE) {
    return { ...result, available: true, goalDate: null, reason: reg.slope > 0.005 ? "The recent trend is rising, so no goal date can be given." : "The recent trend is flat, so no goal date can be given." };
  }
  if (hi >= 0) {
    return { ...result, available: true, goalDate: null, reason: "The recent weights are too uneven to say with confidence that the trend is falling, so no goal date is given yet. More days will tighten it." };
  }
  // Falling with confidence: date when the line reaches the goal, and the
  // range from the steepest and shallowest slopes the data allows.
  const daysAt = (slope) => (goalKg - fittedNow) / slope;
  const mid = daysAt(reg.slope);
  const earliest = daysAt(lo); // steeper
  const latest = daysAt(hi); // shallower (hi is still negative here)
  const at = (n) => addDays(asOf, Math.ceil(n));
  const beyond = dayDiff(endDate, at(mid)) > 0;
  return {
    ...result,
    available: true,
    goalDate: { date: at(mid), earliest: at(earliest), latest: at(latest), afterMissionEnd: beyond },
    reason: beyond ? "At this pace the goal falls after the end date. The mission is not extended." : null,
  };
}

function calorieBlock(state, startDate, asOf) {
  const { intake } = state;
  const dates = startDate ? eachDay(startDate, asOf) : [];
  let complete = 0, partial = 0, zero = 0, total = 0;
  const rec = (d) => intake[d];
  const win = (list) => {
    let c = 0, p = 0, z = 0, sum = 0;
    for (const d of list) {
      const r = rec(d);
      if (!r) continue;
      if (r.status === "complete") { c++; sum += r.kcal; if (r.zero) z++; }
      else p++;
    }
    return { complete: c, partial: p, zero: z, total: sum, days: list.length, average: c ? round(sum / c, 0) : null, coverage: list.length ? round(c / list.length, 2) : null };
  };
  for (const d of dates) {
    const r = rec(d);
    if (!r) continue;
    if (r.status === "complete") { complete++; total += r.kcal; if (r.zero) zero++; } else partial++;
  }
  const last7 = startDate ? eachDay(dayDiff(startDate, addDays(asOf, -6)) > 0 ? addDays(asOf, -6) : startDate, asOf) : [];
  return {
    elapsedDays: dates.length,
    completeDays: complete,
    partialDays: partial,
    zeroDays: zero,
    unloggedDays: dates.length - complete - partial,
    totalKcal: total,
    averageKcal: complete ? round(total / complete, 0) : null,
    coverage: dates.length ? round(complete / dates.length, 2) : null,
    last7: win(last7),
    note: "Totals and averages use only days saved as a complete day. Partial days and unlogged days are not counted as zero.",
  };
}

function energyBlock(state, startDate, asOf, startKg, trend7) {
  const { intake, activity, weights } = state;
  const profile = state.settings.profile;
  const dates = eachDay(startDate, asOf).filter((d) => intake[d] && intake[d].status === "complete");
  const sample = weightAtOrBefore(weights, asOf);
  const todayExp = sample ? expenditureFor(profile, sample.kg, startKg, activity[asOf]) : null;
  const out = {
    daily: todayExp
      ? {
          restingKcal: round(todayExp.rmr, 0),
          baselineKcal: round(todayExp.baseline, 0),
          extraExerciseKcal: round(todayExp.extra, 0),
          estimatedKcal: round(todayExp.total, 0),
          asOfWeight: sample,
        }
      : null,
    balance: { available: false, reason: "Needs at least 3 complete intake days to estimate an energy balance.", days: dates.length },
    assumptions: assumptionsText(profile),
  };
  if (dates.length < 3) return out;
  let sum = 0;
  for (const d of dates) {
    const w = weightAtOrBefore(weights, d);
    const exp = expenditureFor(profile, w ? w.kg : startKg, startKg, activity[d]);
    sum += intake[d].kcal - exp.total;
  }
  out.balance = {
    available: true,
    days: dates.length,
    totalKcal: round(sum, 0),
    averagePerDayKcal: round(sum / dates.length, 0),
    label: "Estimated from your logged calories and the estimated expenditure. It is an estimate, not a measurement, and not a guarantee of fat loss.",
  };
  if (trend7 && trend7.available) {
    out.trendImplied = {
      perDayKcal: round((trend7.weeklyChangeKg * 7700) / 7, 0),
      label: "Very rough: the 7-day weight trend times 7,700 kcal per kg. Water shifts move it a lot from week to week.",
    };
  }
  return out;
}

export function assumptionsText(p) {
  const pal = (p.baselineKcal / p.rmrKcal).toFixed(2);
  return [
    `Resting rate: your measured ${p.rmrKcal} kcal/day, adjusted by ${RMR_KCAL_PER_KG} kcal/day for each kg your weight differs from your first logged weight (Mifflin-St Jeor's weight term).`,
    `Baseline activity: ${p.baselineKcal} / ${p.rmrKcal} = ${pal} times the resting rate. This already includes ordinary daily movement and about ${p.baselineExerciseMinPerDay} minutes of exercise.`,
    `Logged exercise adds only the minutes above those ${p.baselineExerciseMinPerDay}, and only its net energy: (MET - 1) x weight x hours, with MET ${MET.light} light, ${MET.moderate} moderate, ${MET.vigorous} vigorous.`,
    "Calories you log are your own counts. Food labels and portions are not exact, so treat totals as approximate.",
    "Sleep and stress notes are context only. Nothing about hormones or metabolic adaptation is inferred from the scale.",
  ];
}


/* ================================================================ analytics */

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dowOf = (d) => new Date(d + "T00:00:00Z").getUTCDay();
const mondayOf = (d) => addDays(d, -((dowOf(d) + 6) % 7));
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

/**
 * What the Insights screen shows. Everything comes from records the person
 * entered; nothing is filled in for days that were not logged.
 */
export function analytics(state, today) {
  const { weights, intake, activity } = state;
  const settings = state.settings;
  const end = settings.mission.endDate;
  const asOf = dayDiff(today, end) < 0 ? end : today;
  const dates = Object.keys(weights).sort();
  const start = dates[0] ?? null;
  const out = { started: start !== null, weeks: [], weekdays: [], streak: null, consistency: null, lows: null, biggestDrop: null, milestones: [], burn: [] };
  if (!start) return out;

  // Weekly table: Monday to Sunday, from the week of the first weight.
  for (let ws = mondayOf(start); dayDiff(ws, asOf) >= 0; ws = addDays(ws, 7)) {
    const we = addDays(ws, 6);
    const days = eachDay(ws, we < asOf ? we : asOf);
    const wk = days.filter((d) => weights[d]).map((d) => weights[d].kg);
    const kc = days.filter((d) => intake[d] && intake[d].status === "complete").map((d) => intake[d].kcal);
    out.weeks.push({ start: ws, end: we, days: days.length, weightDays: wk.length, avgKg: round(avg(wk)), completeDays: kc.length, avgKcal: kc.length ? round(avg(kc), 0) : null, changeKg: null });
  }
  let prev = null;
  for (const w of out.weeks) {
    if (w.avgKg !== null && prev !== null) w.changeKg = round(w.avgKg - prev);
    if (w.avgKg !== null) prev = w.avgKg;
  }

  // Calories by weekday, complete days only.
  const byDow = Array.from({ length: 7 }, () => []);
  for (const [d, r] of Object.entries(intake)) if (r.status === "complete" && dayDiff(start, d) >= 0) byDow[dowOf(d)].push(r.kcal);
  out.weekdays = [1, 2, 3, 4, 5, 6, 0].map((i) => ({ dow: DOW[i], days: byDow[i].length, avgKcal: byDow[i].length ? round(avg(byDow[i]), 0) : null }));

  // Logging streak: consecutive days with a weight. Today may still be coming,
  // so a streak that ran through yesterday is still alive.
  let current = 0;
  let d = weights[asOf] ? asOf : addDays(asOf, -1);
  while (weights[d] && dayDiff(start, d) >= 0) { current++; d = addDays(d, -1); }
  let longest = 0, run = 0;
  for (const day of eachDay(start, asOf)) { run = weights[day] ? run + 1 : 0; if (run > longest) longest = run; }
  out.streak = { current, longest, note: "Days in a row with a morning weight logged." };
  const elapsed = dayDiff(start, asOf) + 1;
  out.consistency = { weightDays: dates.filter((x) => x <= asOf).length, elapsedDays: elapsed, percent: round((dates.filter((x) => x <= asOf).length / elapsed) * 100, 0) };

  // Lowest weight, new lows, biggest one-day drop between consecutive days.
  let lowest = null, lowDate = null, newLows = 0;
  for (const day of dates) {
    if (lowest === null || weights[day].kg < lowest) { if (lowest !== null) newLows++; lowest = weights[day].kg; lowDate = day; }
  }
  const lastDate = dates[dates.length - 1];
  out.lows = { lowestKg: lowest, lowestDate: lowDate, newLowToday: dates.length > 1 && lowDate === lastDate, newLowCount: newLows };
  let drop = null;
  for (const day of dates) {
    const p = weights[addDays(day, -1)];
    if (p) { const ch = round(weights[day].kg - p.kg); if (ch < 0 && (drop === null || ch < drop.kg)) drop = { date: day, kg: ch }; }
  }
  out.biggestDrop = drop;

  // Milestones: each whole kg below the starting weight, and 10/25/50/75/100 percent of the way.
  const first = weights[start].kg;
  const goal = settings.mission.primaryGoalKg;
  const reachedOn = (pred) => dates.find((x) => pred(weights[x].kg)) ?? null;
  for (let kgLevel = Math.floor(first); kgLevel >= Math.ceil(goal); kgLevel--) {
    if (kgLevel >= first) continue;
    const when = reachedOn((k) => k <= kgLevel);
    if (when) out.milestones.push({ kind: "kg", label: `${kgLevel} kg`, level: kgLevel, date: when });
  }
  if (first > goal) {
    for (const pc of [10, 25, 50, 75, 100]) {
      const level = first - ((first - goal) * pc) / 100;
      const when = reachedOn((k) => k <= level);
      if (when) out.milestones.push({ kind: "percent", label: `${pc}% of the way`, percent: pc, date: when });
    }
  }

  // Every day so far: what was logged against the estimated expenditure (labelled an estimate on screen).
  const startKg = first;
  for (const day of eachDay(start, asOf)) {
    const w = weightAtOrBefore(weights, day);
    const est = w ? expenditureFor(settings.profile, w.kg, startKg, activity[day]).total : null;
    const r = intake[day];
    out.burn.push({ date: day, kcal: r ? r.kcal : null, status: r ? (r.zero ? "zero" : r.status) : "none", estimatedBurn: est === null ? null : round(est, 0) });
  }
  return out;
}

/**
 * Short, honest lines for the top of the Today screen. Facts only: no pressure,
 * no promises, and nothing that praises eating less.
 */
export function coach(summary, an) {
  const lines = [];
  const sm = summary;
  if (!sm.started) return { headline: "Day 1 starts with your first weight.", lines: ["Step on the scale in the morning, before eating, and log the exact number."] };
  const pd = sm.previousDay;
  const t = sm.trend7;
  let headline;
  if (an.lows && an.lows.newLowToday) headline = `New low: ${sm.latestKg.toFixed(2)} kg.`;
  else if (pd && pd.changeKg < 0) headline = `${Math.abs(pd.changeKg).toFixed(2)} kg down from yesterday.`;
  else if (pd && pd.changeKg > 0) headline = `${pd.changeKg.toFixed(2)} kg up from yesterday. That is normal day-to-day movement.`;
  else if (sm.totalChangeKg < 0) headline = `${Math.abs(sm.totalChangeKg).toFixed(2)} kg down since day 1.`;
  else headline = `Day ${sm.days.elapsed} logged.`;
  if (sm.totalChangeKg < 0 && !(an.lows && an.lows.newLowToday)) lines.push(`${Math.abs(sm.totalChangeKg).toFixed(2)} kg down in total, ${sm.goals.primary.remainingKg.toFixed(2)} kg to your ${sm.goals.primary.goalKg} kg goal.`);
  if (t && t.available) lines.push(`The 7-day trend is ${t.weeklyChangeKg > 0 ? "+" : t.weeklyChangeKg < 0 ? "−" : ""}${Math.abs(t.weeklyChangeKg).toFixed(2)} kg per week.`);
  if (pd && pd.changeKg > 0) lines.push("Water, salt and food timing move the scale by a kilo either way. The week matters more than the day.");
  if (an.streak && an.streak.current >= 2) lines.push(`${an.streak.current} mornings logged in a row.`);
  if (sm.goals.primary.reached) lines.push("Goal weight reached. That is a real measurement, not a forecast.");
  return { headline, lines: lines.slice(0, 3) };
}


/* =============================================================== achievements */

/**
 * Medals for what he did, not for how little he ate. Every one is a plain fact
 * about the records: mornings weighed, kilos down, days finished, goals met.
 * Nothing rewards zero-intake days, fast loss, or skipping food.
 */
export function achievements(state, today) {
  const { weights, intake, settings } = state;
  const end = settings.mission.endDate;
  const asOf = dayDiff(today, end) < 0 ? end : today;
  const goal = settings.mission.primaryGoalKg;
  const goal2 = settings.mission.secondaryGoalKg;
  const dates = Object.keys(weights).sort().filter((d) => d <= asOf);
  const out = [];
  const add = (a) => out.push({ ...a, unlocked: Boolean(a.date), date: a.date ?? null, progress: Math.max(0, Math.min(1, a.progress ?? 0)) });
  if (!dates.length) {
    const none = (id, icon, title, desc, group) => add({ id, icon, title, desc, group, date: null, progress: 0 });
    none("first-weight", "sun", "Day 1", "Log your first morning weight.", "start");
    for (const n of [3, 7, 14, 30]) none(`streak-${n}`, "flame", `${n} mornings in a row`, `Log your weight ${n} mornings in a row.`, "streak");
    for (const n of [1, 2, 5, 10]) none(`kg-${n}`, "down", `${n} kg down`, `Reach ${n} kg below your first weight.`, "kg");
    for (const n of [25, 50, 75]) none(`pct-${n}`, "target", `${n}% of the way`, `Cover ${n}% of the distance to ${goal} kg.`, "goal");
    none("goal", "crown", `${goal} kg`, "Reach your goal weight.", "goal");
    none("goal2", "crown", `${goal2} kg`, "Reach your secondary goal.", "goal");
    none("complete-1", "check", "First finished day", "Finish a day's calories.", "food");
    none("complete-7", "check", "7 finished days", "Finish 7 days of calories.", "food");
    none("full-7", "flame", "7 full days in a row", "Weigh in and finish the day's calories, 7 days running.", "food");
    none("week-down", "down", "A lower week", "A week whose average weight is below the week before.", "weeks");
    none("lows-5", "star", "5 new lows", "Set 5 new lowest weights.", "weeks");
    none("half", "calendar", "Halfway", "Reach the middle of the mission.", "start");
    return out;
  }
  const start = dates[0];
  const first = weights[start].kg;
  const total = dayDiff(start, end) + 1;

  add({ id: "first-weight", icon: "sun", title: "Day 1", desc: "Log your first morning weight.", group: "start", date: start, progress: 1 });

  // Streaks of mornings with a weight.
  const streakDate = {};
  let run = 0, best = 0, cur = 0;
  for (const d of eachDay(start, asOf)) {
    run = weights[d] ? run + 1 : 0;
    if (run > best) best = run;
    for (const n of [3, 7, 14, 30]) if (run >= n && !streakDate[n]) streakDate[n] = d;
  }
  let dd = weights[asOf] ? asOf : addDays(asOf, -1);
  while (weights[dd] && dayDiff(start, dd) >= 0) { cur++; dd = addDays(dd, -1); }
  for (const n of [3, 7, 14, 30]) add({ id: `streak-${n}`, icon: "flame", title: `${n} mornings in a row`, desc: `Log your weight ${n} mornings in a row.`, group: "streak", date: streakDate[n] ?? null, progress: Math.max(best, cur) / n, hint: `${Math.min(Math.max(best, cur), n)} of ${n}` });

  // Kilos below the first weight, and the share of the way to the goal.
  let lowest = first;
  const kgDate = {}, pctDate = {};
  let goalDate = null, goal2Date = null, lowsCount = 0, lowsDate = null;
  let curLow = first;
  for (const d of dates) {
    const k = weights[d].kg;
    if (k < curLow) { curLow = k; lowsCount++; if (lowsCount === 5 && !lowsDate) lowsDate = d; }
    for (const n of [1, 2, 5, 10]) if (first - k >= n && !kgDate[n]) kgDate[n] = d;
    if (first > goal) for (const n of [25, 50, 75]) if (first - k >= ((first - goal) * n) / 100 && !pctDate[n]) pctDate[n] = d;
    if (k <= goal && !goalDate) goalDate = d;
    if (k <= goal2 && !goal2Date) goal2Date = d;
    if (k < lowest) lowest = k;
  }
  for (const n of [1, 2, 5, 10]) add({ id: `kg-${n}`, icon: "down", title: `${n} kg down`, desc: `Reach ${n} kg below your first weight (${(first - n).toFixed(1)} kg).`, group: "kg", date: kgDate[n] ?? null, progress: (first - lowest) / n, hint: `${Math.max(0, first - lowest).toFixed(2)} of ${n} kg` });
  for (const n of [25, 50, 75]) add({ id: `pct-${n}`, icon: "target", title: `${n}% of the way`, desc: `Cover ${n}% of the distance to ${goal} kg.`, group: "goal", date: pctDate[n] ?? null, progress: first > goal ? (first - lowest) / ((first - goal) * (n / 100)) : 0 });
  add({ id: "goal", icon: "crown", title: `${goal} kg`, desc: "Reach your goal weight.", group: "goal", date: goalDate, progress: first > goal ? (first - lowest) / (first - goal) : 0 });
  add({ id: "goal2", icon: "crown", title: `${goal2} kg`, desc: "Reach your secondary goal.", group: "goal", date: goal2Date, progress: first > goal2 ? (first - lowest) / (first - goal2) : 0 });

  // Finished days of calories, and full days (weight and finished calories) in a row.
  const done = Object.keys(intake).filter((d) => intake[d].status === "complete" && !intake[d].zero && d <= asOf).sort();
  const doneDate = (n) => (done.length >= n ? done[n - 1] : null);
  add({ id: "complete-1", icon: "check", title: "First finished day", desc: "Finish a day's calories.", group: "food", date: doneDate(1), progress: done.length / 1 });
  add({ id: "complete-7", icon: "check", title: "7 finished days", desc: "Finish 7 days of calories.", group: "food", date: doneDate(7), progress: done.length / 7, hint: `${Math.min(done.length, 7)} of 7` });
  let fr = 0, frBest = 0, frCur = 0, fullDate = null;
  for (const d of eachDay(start, asOf)) {
    const full = weights[d] && intake[d] && intake[d].status === "complete" && !intake[d].zero;
    fr = full ? fr + 1 : 0;
    if (fr > frBest) frBest = fr;
    if (fr >= 7 && !fullDate) fullDate = d;
  }
  let d2 = asOf;
  const isFull = (d) => weights[d] && intake[d] && intake[d].status === "complete" && !intake[d].zero;
  if (!isFull(d2)) d2 = addDays(d2, -1);
  while (dayDiff(start, d2) >= 0 && isFull(d2)) { frCur++; d2 = addDays(d2, -1); }
  add({ id: "full-7", icon: "flame", title: "7 full days in a row", desc: "Weigh in and finish the day's calories, 7 days running.", group: "food", date: fullDate, progress: Math.max(frBest, frCur) / 7, hint: `${Math.min(Math.max(frBest, frCur), 7)} of 7` });

  // A lower week: a Monday-to-Sunday average below the previous week's.
  const an = analytics(state, today);
  let weekDate = null;
  for (let i = 1; i < an.weeks.length; i++) if (an.weeks[i].changeKg !== null && an.weeks[i].changeKg < 0 && !weekDate) weekDate = an.weeks[i].end < asOf ? an.weeks[i].end : asOf;
  add({ id: "week-down", icon: "down", title: "A lower week", desc: "A week whose average weight is below the week before.", group: "weeks", date: weekDate, progress: weekDate ? 1 : 0 });
  add({ id: "lows-5", icon: "star", title: "5 new lows", desc: "Set 5 new lowest weights.", group: "weeks", date: lowsDate, progress: lowsCount / 5, hint: `${Math.min(lowsCount, 5)} of 5` });
  const elapsed = dayDiff(start, asOf) + 1;
  const halfDays = Math.ceil(total / 2);
  add({ id: "half", icon: "calendar", title: "Halfway", desc: `Reach day ${halfDays} of the mission.`, group: "start", date: elapsed >= halfDays ? addDays(start, halfDays - 1) : null, progress: elapsed / halfDays, hint: `day ${Math.min(elapsed, halfDays)} of ${halfDays}` });
  return out;
}

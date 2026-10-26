// One row per calendar day with anything recorded. Missing stays empty: an
// empty calories cell means "not logged", and a logged zero says 0 plus the
// word "zero".

import { eachDay } from "./time.mjs";

const esc = (v) => {
  if (v === null || v === undefined) return "";
  let s = String(v);
  // A cell that starts with = + - @ would be run as a formula by a spreadsheet.
  if (/^[=+@]/.test(s) || (/^-/.test(s) && !/^-?\d+(\.\d+)?$/.test(s))) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const HEADER = ["date", "weight_kg", "weight_saved_at", "calories_kcal", "calories_status", "calories_zero_confirmed", "intake_saved_at", "exercise_min", "exercise_intensity", "sleep_hours", "stress_1_to_5", "note", "meals"];

export function toCsv(state) {
  const dates = new Set([...Object.keys(state.weights), ...Object.keys(state.intake), ...Object.keys(state.activity)]);
  const sorted = [...dates].sort();
  const rows = [HEADER.join(",")];
  if (sorted.length) {
    for (const d of eachDay(sorted[0], sorted[sorted.length - 1])) {
      if (!dates.has(d)) continue;
      const w = state.weights[d];
      const i = state.intake[d];
      const a = state.activity[d];
      rows.push(
        [
          d,
          w?.kg,
          w?.savedAt,
          i?.kcal,
          i ? (i.status === "complete" ? "complete day" : "partial") : "",
          i ? (i.zero ? "zero" : "") : "",
          i?.savedAt,
          a?.exerciseMin,
          a?.intensity,
          a?.sleepHours,
          a?.stress,
          a?.note,
          i?.meals ? i.meals.map((m) => m.label + ' ' + m.kcal).join('; ') : '',
        ]
          .map(esc)
          .join(","),
      );
    }
  }
  return rows.join("\r\n") + "\r\n";
}

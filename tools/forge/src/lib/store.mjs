// The records, on disk. One JSON file written atomically, a rolling set of
// backups beside it, and a draft file for half-typed entries.
//
// Rules this file keeps:
//  - one weight, one intake record and one activity record per calendar day;
//    saving a day again replaces it (a correction) and keeps the old value in
//    the revision log;
//  - a day with no intake record is "not logged". It is never turned into 0.
//    Zero calories exists only as an explicit record with zero: true;
//  - data from a newer app version is never overwritten by an older one;
//  - an update replaces the program, never the data folder.

import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, readdirSync, copyFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_SETTINGS, validateWeight, validateKcal, MET } from "./calc.mjs";
import { isDate, dayDiff } from "./time.mjs";

export const SCHEMA = 1;
const MAX_REVISIONS = 3000;
const KEEP_BACKUPS = 60;

const clone = (x) => JSON.parse(JSON.stringify(x));

export function emptyState(nowIso) {
  return {
    schema: SCHEMA,
    createdAt: nowIso,
    settings: clone(DEFAULT_SETTINGS),
    weights: {},
    intake: {},
    activity: {},
    revisions: [],
  };
}

// Older files are brought forward here, one step at a time. Add a step per
// schema bump; never edit an old one.
const MIGRATIONS = {
  // 1: (s) => { ...; s.schema = 2; return s; }
};

export function migrate(raw) {
  let s = raw;
  if (typeof s.schema !== "number") throw new Error("not a Spartan Forge file");
  if (s.schema > SCHEMA) {
    const e = new Error(`These records were written by a newer version of the app (schema ${s.schema}). Update the app before opening them.`);
    e.code = "NEWER";
    throw e;
  }
  while (s.schema < SCHEMA) {
    const step = MIGRATIONS[s.schema];
    if (!step) throw new Error(`no migration from schema ${s.schema}`);
    s = step(s);
  }
  s.settings = mergeSettings(s.settings);
  s.weights ||= {};
  s.intake ||= {};
  s.activity ||= {};
  s.revisions ||= [];
  return s;
}

function mergeSettings(saved) {
  const d = clone(DEFAULT_SETTINGS);
  const s = saved || {};
  return {
    mission: { ...d.mission, ...(s.mission || {}) },
    profile: { ...d.profile, ...(s.profile || {}) },
    reminders: { ...d.reminders, ...(s.reminders || {}) },
  };
}

const stamp = (iso) => iso.replace(/[-:]/g, "").replace(/\..*$/, "").replace("T", "-");

export class Store {
  constructor(dir, clock = () => new Date()) {
    this.dir = dir;
    this.clock = clock;
    this.file = join(dir, "state.json");
    this.backupDir = join(dir, "backups");
    this.draftFile = join(dir, "draft.json");
    this.state = null;
    this.loadNotice = null;
  }

  now() {
    return this.clock().toISOString();
  }

  open() {
    mkdirSync(this.backupDir, { recursive: true });
    if (!existsSync(this.file)) {
      this.state = emptyState(this.now());
      this.#write(false);
      return this;
    }
    try {
      this.state = migrate(JSON.parse(readFileSync(this.file, "utf8")));
    } catch (e) {
      if (e.code === "NEWER") throw e;
      // A damaged file: keep it for inspection, then recover from the newest
      // backup that reads. Never start empty over a file that held records.
      const bad = join(this.dir, `state.damaged-${stamp(this.now())}.json`);
      try { copyFileSync(this.file, bad); } catch {}
      const recovered = this.#newestReadableBackup();
      if (!recovered) {
        const err = new Error(`state.json could not be read and there is no usable backup. The damaged file was kept as ${bad}.`);
        err.code = "DAMAGED";
        throw err;
      }
      this.state = recovered.state;
      this.loadNotice = `The records file was damaged. Restored from the backup ${recovered.name}. The damaged file was kept as ${bad}.`;
      this.#write(false);
    }
    return this;
  }

  #newestReadableBackup() {
    for (const name of this.listBackups().map((b) => b.name)) {
      try {
        return { name, state: migrate(JSON.parse(readFileSync(join(this.backupDir, name), "utf8"))) };
      } catch {}
    }
    return null;
  }

  #write(backup = true) {
    const tmp = this.file + ".tmp";
    writeFileSync(tmp, JSON.stringify(this.state, null, 1));
    renameSync(tmp, this.file);
    if (backup) this.#autoBackup();
  }

  // At most one automatic backup per minute, so a burst of edits is one
  // snapshot, and the newest KEEP_BACKUPS are kept.
  #autoBackup() {
    const newest = this.listBackups()[0];
    const last = this.lastBackupMs ?? (newest ? Date.parse(newest.at) : 0);
    if (last > this.clock().getTime() - 60_000) return;
    this.backupNow("auto");
  }

  backupNow(kind = "manual") {
    mkdirSync(this.backupDir, { recursive: true });
    const base = `state-${stamp(this.now())}-${kind}`;
    let name = `${base}.json`;
    let i = 1;
    while (existsSync(join(this.backupDir, name))) name = `${base}-${i++}.json`;
    copyFileSync(this.file, join(this.backupDir, name));
    this.lastBackupMs = this.clock().getTime();
    const all = this.listBackups();
    for (const old of all.slice(KEEP_BACKUPS)) rmSync(join(this.backupDir, old.name), { force: true });
    return name;
  }

  listBackups() {
    if (!existsSync(this.backupDir)) return [];
    return readdirSync(this.backupDir)
      .filter((n) => /^state-.*\.json$/.test(n))
      .map((name) => {
        const st = statSync(join(this.backupDir, name));
        let weights = null;
        let days = null;
        try {
          const j = JSON.parse(readFileSync(join(this.backupDir, name), "utf8"));
          weights = Object.keys(j.weights || {}).length;
          days = Object.keys(j.intake || {}).length;
        } catch {}
        return { name, at: st.mtime.toISOString(), bytes: st.size, weights, intakeDays: days };
      })
      .sort((a, b) => (a.name < b.name ? 1 : -1));
  }

  restore(name) {
    if (!/^state-[A-Za-z0-9._-]+\.json$/.test(name)) throw new Error("not a backup name");
    const path = join(this.backupDir, name);
    if (!existsSync(path)) throw new Error("that backup does not exist");
    const state = migrate(JSON.parse(readFileSync(path, "utf8")));
    this.backupNow("before-restore");
    this.state = state;
    this.#write();
    return name;
  }

  /* ------------------------------------------------------------- writes */

  #limits(date, today) {
    if (!isDate(date)) return "That is not a calendar date.";
    if (dayDiff(date, today) < 0) return "That date is in the future. Record a day on or after it has started.";
    const end = this.state.settings.mission.endDate;
    if (dayDiff(end, date) > 0) return `The mission ended on ${end}. Days after it are not recorded. Earlier days can still be corrected.`;
    return null;
  }

  #revise(kind, date, before, after) {
    const r = this.state.revisions;
    r.push({ at: this.now(), kind, date, before: before ?? null, after: after ?? null });
    if (r.length > MAX_REVISIONS) r.splice(0, r.length - MAX_REVISIONS);
  }

  setWeight(date, kg, today) {
    const bad = this.#limits(date, today) || validateWeight(kg);
    if (bad) return { ok: false, error: bad };
    const clean = Math.round(kg * 100) / 100;
    const before = this.state.weights[date] ?? null;
    this.state.weights[date] = { kg: clean, savedAt: this.now() };
    this.#revise("weight", date, before, this.state.weights[date]);
    this.#write();
    return { ok: true, replaced: Boolean(before) };
  }

  clearWeight(date) {
    const before = this.state.weights[date];
    if (!before) return { ok: false, error: "There is no weight saved for that day." };
    delete this.state.weights[date];
    this.#revise("weight-removed", date, before, null);
    this.#write();
    return { ok: true };
  }

  /** status: "complete" is the day's final total; "partial" is a running count. */
  setIntake(date, kcal, status, today) {
    if (status !== "complete" && status !== "partial") return { ok: false, error: "Say whether this is the day's final total or a partial count." };
    const bad = this.#limits(date, today) || validateKcal(kcal);
    if (bad) return { ok: false, error: bad };
    const before = this.state.intake[date] ?? null;
    this.state.intake[date] = { kcal: Math.round(kcal), status, zero: false, savedAt: this.now() };
    this.#revise("intake", date, before, this.state.intake[date]);
    this.#write();
    return { ok: true, replaced: Boolean(before) };
  }

  /** The explicit "I ate nothing" record. The caller must say it is confirmed. */
  setZeroIntake(date, confirmed, today) {
    if (confirmed !== true) return { ok: false, error: "Zero intake has to be confirmed." };
    const bad = this.#limits(date, today);
    if (bad) return { ok: false, error: bad };
    const before = this.state.intake[date] ?? null;
    this.state.intake[date] = { kcal: 0, status: "complete", zero: true, savedAt: this.now() };
    this.#revise("intake-zero", date, before, this.state.intake[date]);
    this.#write();
    return { ok: true, replaced: Boolean(before), previous: before };
  }

  clearIntake(date) {
    const before = this.state.intake[date];
    if (!before) return { ok: false, error: "There is no intake saved for that day." };
    delete this.state.intake[date];
    this.#revise("intake-removed", date, before, null);
    this.#write();
    return { ok: true, previous: before };
  }

  /** Put an intake record back exactly as it was (the undo for zero). */
  restoreIntake(date, record) {
    if (record === null) {
      delete this.state.intake[date];
    } else {
      const bad = validateKcal(record.kcal);
      if (bad || (record.status !== "complete" && record.status !== "partial")) return { ok: false, error: "That record cannot be restored." };
      this.state.intake[date] = { kcal: record.kcal, status: record.status, zero: Boolean(record.zero), savedAt: this.now() };
    }
    this.#revise("intake-undo", date, null, this.state.intake[date] ?? null);
    this.#write();
    return { ok: true };
  }

  setActivity(date, a, today) {
    const bad = this.#limits(date, today);
    if (bad) return { ok: false, error: bad };
    const rec = {};
    if (a.exerciseMin !== undefined && a.exerciseMin !== null && a.exerciseMin !== "") {
      const m = Number(a.exerciseMin);
      if (!Number.isFinite(m) || m < 0 || m > 1440) return { ok: false, error: "Exercise minutes must be between 0 and 1440." };
      rec.exerciseMin = Math.round(m);
      if (m > 0) {
        if (!MET[a.intensity]) return { ok: false, error: "Choose light, moderate or vigorous for the exercise." };
        rec.intensity = a.intensity;
      }
    }
    if (a.sleepHours !== undefined && a.sleepHours !== null && a.sleepHours !== "") {
      const h = Number(a.sleepHours);
      if (!Number.isFinite(h) || h < 0 || h > 24) return { ok: false, error: "Sleep must be between 0 and 24 hours." };
      rec.sleepHours = Math.round(h * 10) / 10;
    }
    if (a.stress !== undefined && a.stress !== null && a.stress !== "") {
      const s = Number(a.stress);
      if (!Number.isInteger(s) || s < 1 || s > 5) return { ok: false, error: "Stress is a whole number from 1 to 5." };
      rec.stress = s;
    }
    if (typeof a.note === "string" && a.note.trim()) rec.note = a.note.trim().slice(0, 500);
    if (!Object.keys(rec).length) {
      const before = this.state.activity[date];
      if (before) {
        delete this.state.activity[date];
        this.#revise("activity-removed", date, before, null);
        this.#write();
      }
      return { ok: true, cleared: true };
    }
    rec.savedAt = this.now();
    const before = this.state.activity[date] ?? null;
    this.state.activity[date] = rec;
    this.#revise("activity", date, before, rec);
    this.#write();
    return { ok: true, replaced: Boolean(before) };
  }

  setSettings(patch) {
    const cur = this.state.settings;
    const next = clone(cur);
    const num = (v, lo, hi, label) => {
      const n = Number(v);
      if (!Number.isFinite(n) || n < lo || n > hi) throw new Error(`${label} must be between ${lo} and ${hi}.`);
      return n;
    };
    try {
      if (patch.profile) {
        const p = patch.profile;
        if (p.age !== undefined) next.profile.age = num(p.age, 10, 120, "Age");
        if (p.heightCm !== undefined) next.profile.heightCm = num(p.heightCm, 100, 250, "Height");
        if (p.rmrKcal !== undefined) next.profile.rmrKcal = num(p.rmrKcal, 800, 4000, "Resting rate");
        if (p.baselineKcal !== undefined) next.profile.baselineKcal = num(p.baselineKcal, 1000, 6000, "Baseline expenditure");
        if (p.baselineExerciseMinPerDay !== undefined) next.profile.baselineExerciseMinPerDay = num(p.baselineExerciseMinPerDay, 0, 480, "Baseline exercise minutes");
        if (next.profile.baselineKcal < next.profile.rmrKcal) throw new Error("Baseline expenditure cannot be lower than the resting rate.");
      }
      if (patch.mission) {
        const m = patch.mission;
        if (m.primaryGoalKg !== undefined) next.mission.primaryGoalKg = num(m.primaryGoalKg, 30, 400, "Primary goal");
        if (m.secondaryGoalKg !== undefined) next.mission.secondaryGoalKg = num(m.secondaryGoalKg, 30, 400, "Secondary goal");
        // The end date is a fact of the mission (December 25, 2026). It is not editable here.
      }
      if (patch.reminders) {
        const r = patch.reminders;
        if (r.enabled !== undefined) next.reminders.enabled = Boolean(r.enabled);
        if (r.onlyIfMissing !== undefined) next.reminders.onlyIfMissing = Boolean(r.onlyIfMissing);
        if (r.times !== undefined) {
          if (!Array.isArray(r.times) || r.times.length > 6 || !r.times.every((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t))) throw new Error("Reminder times look like 08:30 or 20:00 (up to six).");
          next.reminders.times = [...new Set(r.times)].sort();
        }
      }
    } catch (e) {
      return { ok: false, error: e.message };
    }
    this.#revise("settings", null, cur, next);
    this.state.settings = next;
    this.#write();
    return { ok: true };
  }

  /* ------------------------------------------------------------- drafts */

  readDraft() {
    try {
      return JSON.parse(readFileSync(this.draftFile, "utf8"));
    } catch {
      return null;
    }
  }

  writeDraft(draft) {
    if (draft === null) {
      rmSync(this.draftFile, { force: true });
      return;
    }
    const tmp = this.draftFile + ".tmp";
    writeFileSync(tmp, JSON.stringify({ ...draft, savedAt: this.now() }));
    renameSync(tmp, this.draftFile);
  }
}

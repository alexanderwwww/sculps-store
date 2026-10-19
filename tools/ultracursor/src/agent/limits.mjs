/*
 * Action limits, kept across restarts in <WORK>/agent-limits.json.
 *
 *   createLimits(file, now) -> { startTask(profile), finalAllowed(profile), countFinal(profile) }
 *
 * Each answers null when allowed, or a plain sentence saying which limit was
 * reached and when it frees up. Timestamps older than a day are dropped.
 */
import fs from "node:fs";

const HOUR = 3600000, DAY = 24 * HOUR;

export function createLimits(file, now = () => Date.now()) {
  let data = { tasks: [], finals: {} };
  try { data = Object.assign(data, JSON.parse(fs.readFileSync(file, "utf8"))); } catch { /* first run */ }
  const save = () => {
    try { fs.writeFileSync(file + ".tmp", JSON.stringify(data)); fs.renameSync(file + ".tmp", file); } catch { /* best effort */ }
  };
  const prune = () => {
    const t = now() - DAY;
    data.tasks = (data.tasks || []).filter((x) => x > t);
    for (const k of Object.keys(data.finals || {})) data.finals[k] = data.finals[k].filter((x) => x > t);
  };
  const within = (list, ms) => list.filter((x) => x > now() - ms).length;
  const freesAt = (list, ms) => {
    const oldest = list.filter((x) => x > now() - ms).sort((a, b) => a - b)[0];
    return oldest ? Math.ceil((oldest + ms - now()) / 60000) : 0;
  };
  return {
    startTask(profile) {
      prune();
      const lim = profile.limits || {};
      if (lim.tasksPerHour && within(data.tasks, HOUR) >= lim.tasksPerHour)
        return `the limit of ${lim.tasksPerHour} tasks an hour is reached (frees up in ${freesAt(data.tasks, HOUR)} min)`;
      data.tasks.push(now());
      save();
      return null;
    },
    finalAllowed(profile) {
      prune();
      const lim = profile.limits || {};
      const list = (data.finals[profile.name] = data.finals[profile.name] || []);
      if (lim.finalPerHour && within(list, HOUR) >= lim.finalPerHour)
        return `the limit of ${lim.finalPerHour} final actions an hour on ${profile.name} is reached (frees up in ${freesAt(list, HOUR)} min)`;
      if (lim.finalPerDay && within(list, DAY) >= lim.finalPerDay)
        return `the limit of ${lim.finalPerDay} final actions a day on ${profile.name} is reached`;
      return null;
    },
    countFinal(profile) {
      (data.finals[profile.name] = data.finals[profile.name] || []).push(now());
      save();
    },
  };
}

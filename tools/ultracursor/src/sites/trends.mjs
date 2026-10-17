/*
 * Google Trends, US, last 12 months. Read-only.
 *
 * The chart's data is read from the page's own request, not the drawing:
 * responses whose URL contains /trends/api/widgetdata/multiline, with the
 * ")]}'," guard stripped, hold default.timelineData[].{time, value[0]}.
 */
import { SITES, visit, wall, diag, breathe, say, listen, readDown, errorOf } from "./common.mjs";

export const urlFor = (q) => `${SITES.trends()}/trends/explore?geo=US&date=today%2012-m&q=${encodeURIComponent(q)}`;

export function parseMultiline(text) {
  const s = String(text || "").replace(/^\)\]\}',?\s*/, "");
  const j = JSON.parse(s);
  const rows = j?.default?.timelineData;
  if (!Array.isArray(rows)) return null;
  return rows.map((r) => ({
    t: new Date(Number(r.time) * 1000).toISOString().slice(0, 10),
    v: Array.isArray(r.value) ? Number(r.value[0]) : Number(r.value),
  })).filter((r) => Number.isFinite(r.v));
}

const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

/** growth4w: % change of the mean of the last 4 weeks vs the 4 before. yoy: last 4 weeks vs the first 4 (a year ago). */
export function measures(weekly) {
  if (!weekly || weekly.length < 8) return { growth4w: null, yoy: null, peakWeek: weekly && weekly.length ? [...weekly].sort((a, b) => b.v - a.v)[0].t : null };
  const v = weekly.map((w) => w.v);
  const last = mean(v.slice(-4)), prev = mean(v.slice(-8, -4)), first = mean(v.slice(0, 4));
  const pct = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);
  const peak = [...weekly].sort((a, b) => b.v - a.v)[0];
  return { growth4w: pct(last, prev), yoy: weekly.length >= 50 ? pct(last, first) : null, peakWeek: peak ? peak.t : null };
}

export async function sweep(page, input, ctx) {
  const query = typeof input === "string" ? input : input.query;
  const url = urlFor(query);
  const out = { source: "trends", query, url, blocked: null, weekly: [], growth4w: null, yoy: null, peakWeek: null, how: "network:widgetdata/multiline", diag: null };
  try {
    await say(page, ctx, `Google Trends · ${query}`);
    let navErr = null;
    const got = await listen(page, "/trends/api/widgetdata/multiline", async () => {
      navErr = await visit(page, url, ctx);
      if (navErr) return;
      await breathe(ctx, 1500, 3000);
      await readDown(page, ctx, 1);
    }, parseMultiline);
    if (navErr) { out.blocked = navErr; out.diag = await diag(page); return out; }
    const weekly = got.find((g) => g && g.length) || [];
    out.weekly = weekly;
    Object.assign(out, measures(weekly));
    if (!weekly.length) out.blocked = (await wall(page, false)) || "empty";
    await say(page, ctx, `Google Trends · ${query} · ${out.growth4w === null ? "no trend read" : `${out.growth4w >= 0 ? "+" : ""}${out.growth4w}% in 4 weeks`}`);
    ctx.log && ctx.log(`Trends "${query}": ${weekly.length} weeks, 4-week growth ${out.growth4w ?? "n/a"}%${out.blocked ? ` (${out.blocked})` : ""}`);
    out.diag = await diag(page, { weeks: weekly.length });
  } catch (e) {
    out.blocked = errorOf(e);
    out.diag = await diag(page).catch(() => null);
  }
  return out;
}

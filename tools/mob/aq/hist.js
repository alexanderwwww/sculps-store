// Histories sampled from /api/aq/state by this page, kept in memory and in localStorage so charts are not empty
// after a reload. Nothing here is invented: every point is a value the engine reported at that time.
const KEY = "aq-desk-h2", DAY = 864e5, num = (v) => typeof v === "number" && isFinite(v);
let H = { s: {}, spec: [] }, dirty = false;
try { const j = JSON.parse(localStorage.getItem(KEY) || "null"); if (j && j.s && Array.isArray(j.spec)) { const cut = Date.now() - DAY; H = { s: {}, spec: j.spec.filter((r) => Array.isArray(r) && r[0] > cut) }; for (const k in j.s) { const a = (j.s[k] || []).filter((p) => Array.isArray(p) && p[0] > cut && num(p[1])); if (a.length) H.s[k] = a; } } } catch {}
export function sample(k, v, gap = 20000, cap = 480) { if (!num(v)) return; const a = (H.s[k] ||= []), n = Date.now(), L = a[a.length - 1]; if (L && n - L[0] < gap) { if (L[1] !== v) { L[1] = v; dirty = true; } return; } a.push([n, v]); if (a.length > cap) a.shift(); dirty = true; }
export const series = (k) => H.s[k] || [];
export const lastOf = (k) => { const a = H.s[k]; return a && a.length ? a[a.length - 1][1] : null; };
// spectrogram row: [time, [12 busy shares], {feed: 1|0}]
export function specPush(shares, feeds, gap = 10000, cap = 360) { const n = Date.now(), L = H.spec[H.spec.length - 1]; if (L && n - L[0] < gap) { L[1] = shares; L[2] = feeds; return; } H.spec.push([n, shares, feeds]); if (H.spec.length > cap) H.spec.shift(); dirty = true; }
export const spec = () => H.spec;
function save() { if (!dirty) return; dirty = false; try { localStorage.setItem(KEY, JSON.stringify(H)); } catch {} }
if (typeof window !== "undefined") { setInterval(save, 10000); window.addEventListener("pagehide", save); }

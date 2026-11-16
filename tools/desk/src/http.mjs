// One place for network access, so tests can swap it. Free public endpoints only; no keys.
let impl = (...a) => fetch(...a);
export const setFetch = (f) => { impl = f; };
const UA = { "User-Agent": "Mozilla/5.0 (desk-research-bot)", Accept: "*/*" };
export async function getText(url, { tries = 3, timeoutMs = 15000, headers = {} } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await impl(url, { headers: { ...UA, ...headers }, signal: AbortSignal.timeout(timeoutMs) });
      if (r.status === 429 || r.status >= 500) throw new Error(`HTTP ${r.status}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) { last = e; await new Promise((s) => setTimeout(s, 400 * (i + 1))); }
  }
  throw new Error(`${url.replace(/\?.*/, "")}: ${last?.message}`);
}
export const getJson = async (url, o) => JSON.parse(await getText(url, o));
export async function pmap(items, n, fn) {
  const out = new Array(items.length); let k = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (k < items.length) { const i = k++; try { out[i] = await fn(items[i], i); } catch (e) { out[i] = { error: e.message }; } }
  }));
  return out;
}

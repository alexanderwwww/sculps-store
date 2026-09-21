/**
 * Shared bits for the tests: a check(), a Chrome on a test port, and stub
 * sites so nothing needs the network.
 */
import { openChrome } from "../worker/chrome.mjs";

process.env.OX_CHROME ??= "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
process.env.ORGANIC_CHROME_ARGS ??= "--no-sandbox --disable-gpu --no-proxy-server";

let failed = 0;
export const check = (name, ok, extra = "") => {
  console.log(`${ok ? "  ok  " : "FAIL  "}${name}${extra ? " — " + extra : ""}`);
  if (!ok) failed++;
};
export const failures = () => failed;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function until(fn, ms = 10000, step = 100) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) return null;
    await sleep(step);
  }
}

/** A Chrome on its own port and profile; kill it with fuser afterwards. */
export async function testChrome(port, profile) {
  const { execSync } = await import("node:child_process");
  try { execSync(`fuser -k ${port}/tcp 2>/dev/null`); } catch { /* nothing there */ }
  await sleep(300);
  return openChrome({ port, profile });
}

/** Route every request on the context to a small fake site keyed by hostname. */
export async function stubSites(context, sites) {
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    const html = sites[url.hostname];
    if (!html) return route.fulfill({ status: 404, contentType: "text/html", body: "<h1>nope</h1>" });
    return route.fulfill({ status: 200, contentType: "text/html", body: typeof html === "function" ? html(url) : html });
  });
}

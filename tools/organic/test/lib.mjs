/**
 * Shared bits for the tests: a check(), a Chrome on a test port, and stub
 * sites so nothing needs the network.
 */
import { openChrome } from "../worker/chrome.mjs";

process.env.OX_CHROME ??= "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
process.env.ORGANIC_CHROME_ARGS ??= "--no-sandbox --disable-gpu --no-proxy-server";
// There is no display here, so the tests run the headless path on purpose.
process.env.ORGANIC_HEADLESS ??= "1";

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

/** The app's own browser on a throwaway profile. No port: it does not use one. */
export async function testChrome(_port, profile) {
  return openChrome({ profile });
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

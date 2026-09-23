/**
 * Shared bits for the tests.
 *
 * There is no browser to launch here any more: the app's page lives in the
 * Mac's own web view, so what is testable from Linux is the brain, the wire,
 * and the crew's code running in a stand-in browser.
 */
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failed = 0;
export const check = (name, ok, extra = "") => {
  console.log(`${ok ? "  ok  " : "FAIL  "}${name}${extra ? " — " + extra : ""}`);
  if (!ok) failed++;
};
export const failures = () => failed;

/** Wait for something to become truthy, or give up. */
export async function until(fn, ms = 10000, step = 100) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) return null;
    await sleep(step);
  }
}

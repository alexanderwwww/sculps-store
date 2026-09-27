/**
 * The worker lives in "$HOME/Library/Application Support/CloneMe/worker".
 *
 * That space is not cosmetic. `new URL(".", import.meta.url).pathname`
 * percent-encodes it, so the bridge looked for agent.built.js under
 * "Application%20Support", never found it, and answered 500 — while still
 * holding the port open. The window then retried for twenty seconds and told
 * Alex it could not reach a worker that was listening the whole time.
 *
 * So this runs the packed bridge from a directory with a space in its name and
 * asks it for the page's code. Nothing ships unless that returns 200.
 */
import { pathToFileURL } from "node:url";

const dir = process.argv[2];
const { startBridge } = await import(pathToFileURL(dir + "/bridge.mjs").href);
const bridge = await startBridge({ dir, port: 0, onMessage: () => {} });
const res = await fetch("http://127.0.0.1:" + bridge.port + "/agent.js");
if (res.status !== 200) {
  console.error("/agent.js answered " + res.status + ": " + (await res.text()));
  process.exit(1);
}
process.exit(0);

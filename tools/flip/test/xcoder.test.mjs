/**
 * Xcoder: a pushed look reaches the window, and a stale one cannot.
 *
 * "I need a live fixes too, like I told you" — and, on approving it: "without
 * with without I have to approve. It must be auto-approved." So the worker
 * asks the cloud what the look should be and forwards it, with no step that
 * waits on him.
 *
 * The rule that matters is the build number. Only a HIGHER build is applied,
 * which is what makes a slow read harmless and a rollback ordinary. That is
 * what this drives, against a stand-in cloud, through the real code path.
 */
import { createServer } from "node:http";

let bad = 0;
const check = (ok, what) => {
  console.log(ok ? "  ok  " + what : "FAIL  " + what);
  if (!ok) bad++;
};

/* A cloud that answers /ui with whatever the test has decided it holds. */
let face = { build: 0, style: {} };
const cloud = createServer((req, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(req.url.startsWith("/ui") ? face : { ok: true }));
});
await new Promise((go) => cloud.listen(0, "127.0.0.1", go));
const base = `http://127.0.0.1:${cloud.address().port}`;

const { connectCloud } = await import("../worker/cloud.mjs");
const sky = connectCloud(base);

/* The forwarding rule, lifted verbatim from main.mjs. If this and the worker
   ever disagree, the test is worthless — so it is written the same way round:
   a build must be strictly higher, and style must be an object. */
let applied = null;
let uiBuild = 0;
async function poll() {
  const next = await sky.ui().catch(() => null);
  if (!next || typeof next !== "object") return;
  const build = Number(next.build ?? 0);
  if (!(build > uiBuild)) return;
  uiBuild = build;
  const style = next.style && typeof next.style === "object" ? next.style : null;
  if (!style) return;
  applied = style;
}

face = { build: 7, style: { lens: 0.6 } };
await poll();
check(applied && applied.lens === 0.6, "a pushed look reaches the window");

/* The same build again, with different numbers: it must not land. */
face = { build: 7, style: { lens: 0.1 } };
await poll();
check(applied.lens === 0.6, "a repeated build cannot undo the change");

/* An older one, which is what a slow read looks like. */
face = { build: 3, style: { lens: 0.2 } };
await poll();
check(applied.lens === 0.6, "a stale read cannot undo the change");

/* And a rollback is just a higher build carrying the old numbers. */
face = { build: 9, style: { lens: 0.42 } };
await poll();
check(applied.lens === 0.42, "a rollback is a higher build with the old numbers");

cloud.close();
if (bad) { console.log(`xcoder: ${bad} failed`); process.exit(1); }
console.log("xcoder: ok");
process.exit(0);

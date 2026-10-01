/**
 * The RunPod orchestrator against the REAL pod_agent.py (run locally), with only RunPod's
 * REST API simulated. This proves: upload (chunked), run, poll, download (ranged), cancel,
 * failure, price guard, cap, deadline, and above all that the pod is ALWAYS deleted.
 * What it cannot prove: the GPU scripts themselves. Those first run on a real GPU.
 */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, copyFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import net from "node:net";
const require = createRequire(import.meta.url);
const { RunPod } = require("../runpod.js");

let fail = 0;
const ok = (c, what, extra) => { if (!c) fail++; console.log((c ? "ok    " : "FAIL  ") + what + (extra ? "  — " + extra : "")); };
const sha = (b) => createHash("sha256").update(b).digest("hex");
const freePort = () => new Promise((r) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });

const here = process.cwd();
const scripts = mkdtempSync(join(tmpdir(), "xugc-scripts-"));
copyFileSync(join(here, "train/pod_agent.py"), join(scripts, "pod_agent.py"));
// Fake job scripts: same contract as the real ones (inputs in $JOB_ROOT/in, results in $JOB_ROOT/out).
writeFileSync(join(scripts, "generate.sh"), `set -e
if [ "$FAIL" = "1" ]; then echo "== 00:00:01 making the video"; echo "CUDA out of memory"; exit 3; fi
if [ "$SLOW" = "1" ]; then echo "== 00:00:01 making the video"; sleep 5; echo never; exit 0; fi
echo "== 00:00:01 making the clip"; sleep 0.3
sha256sum "$JOB_ROOT/in/first.png" | cut -d' ' -f1 > "$JOB_ROOT/out/seen.txt"
echo "PROMPT=$PROMPT" >> "$JOB_ROOT/out/seen.txt"
head -c 5000 /dev/urandom > "$JOB_ROOT/out/clip.mp4"
echo "== 00:00:02 done"
`);

writeFileSync(join(scripts, "train_lora.sh"), `set -e
echo "== 00:00:01 training"
for i in $(seq 1 120); do [ -f "$JOB_ROOT/STOP" ] && break; sleep 0.1; done
[ -f "$JOB_ROOT/STOP" ] && echo "stopped early, keeping the checkpoint" || echo "ran to the end"
head -c 3000 /dev/urandom > "$JOB_ROOT/out/lora.safetensors"
echo "== 00:00:02 done"
`);

/** Simulated RunPod REST API; each "pod" is a real pod_agent.py on localhost. */
function world({ costPerHr = 1.6 } = {}) {
  const pods = new Map(); const log = []; let n = 0;
  const f = async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith("https://rest.runpod.io/v1")) {
      const p = u.slice("https://rest.runpod.io/v1".length), m = init.method || "GET";
      const auth = init.headers?.Authorization;
      const res = (code, obj) => new Response(JSON.stringify(obj), { status: code });
      if (auth !== "Bearer KEY-123") return res(401, { error: "bad key" });
      if (m === "GET" && p === "/pods") return res(200, [...pods.values()].filter((x) => !x.deleted).map((x) => ({ id: x.id, name: x.name })).concat([{ id: "other", name: "someone-elses" }]));
      if (m === "POST" && p === "/pods") {
        const body = JSON.parse(init.body); const id = "pod" + ++n; const port = await freePort(); const root = mkdtempSync(join(tmpdir(), "xugc-pod-"));
        log.push({ create: body });
        const py = spawn("python3", [join(scripts, "pod_agent.py")], { env: { ...process.env, AGENT_ROOT: root, AGENT_PORT: String(port), AGENT_TOKEN: body.env.AGENT_TOKEN, MAX_MINUTES: body.env.MAX_MINUTES, AGENT_TICK: "0.2" }, stdio: "ignore" });
        pods.set(id, { id, name: body.name, port, py, deleted: false, root, exited: false });
        py.on("exit", () => { pods.get(id).exited = true; });
        await new Promise((r) => setTimeout(r, 600));
        return res(200, { id, costPerHr, name: body.name });
      }
      const dm = p.match(/^\/pods\/(.+)$/);
      if (m === "DELETE" && dm) { const x = pods.get(dm[1]); if (x) { x.deleted = true; x.py.kill("SIGKILL"); } log.push({ deleted: dm[1] }); return res(200, {}); }
      return res(404, {});
    }
    return fetch(url, init);
  };
  const agentUrl = (id) => `http://127.0.0.1:${pods.get(id).port}`;
  return { f, pods, log, agentUrl };
}

const mk = (w, extra = {}) => new RunPod({ apiKey: "KEY-123", fetch: w.f, agentUrl: w.agentUrl, scriptsDir: scripts, pollMs: 100, sleep: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 100))), chunk: 1000, ...extra });
const png = randomBytes(5000);
const dest = () => mkdtempSync(join(tmpdir(), "xugc-out-"));

// 1. a successful generate job
{
  const w = world(); const rp = mk(w); const prog = []; const d = dest();
  const r = await rp.run({ label: "gen", script: "generate.sh", inputs: { "first.png": png }, env: { PROMPT: "a woman, phone video" }, outputs: ["clip.mp4", "seen.txt"], required: ["clip.mp4"], destDir: d, capUsd: 3, onProgress: (p) => prog.push(p) });
  const seen = readFileSync(join(d, "seen.txt"), "utf8");
  ok(seen.includes(sha(png)), "the 5 KB start image arrived on the 'GPU' bit-for-bit (uploaded in 1000-byte chunks)");
  ok(seen.includes("PROMPT=a woman, phone video"), "the prompt reached the job");
  ok(existsSync(join(d, "clip.mp4")) && readFileSync(join(d, "clip.mp4")).length === 5000, "the 5 KB result came home (ranged download)");
  ok(w.log.some((x) => x.deleted === "pod1") && w.pods.get("pod1").deleted, "the pod was deleted afterwards");
  ok(prog.some((p) => p.stage === "making the clip"), "progress showed the job's own stage", [...new Set(prog.map((p) => p.stage))].join(" | "));
  ok(prog.at(-1).stage === "GPU handed back" && prog.at(-1).gone === true, "the last thing shown is that the GPU was handed back");
  ok(r.costUsd > 0 && r.hourly === 1.6, "cost is reported from the pod's real hourly price", String(r.costUsd));
  const c = w.log[0].create;
  ok(c.dockerStartCmd.join(" ").includes("base64 -d") && c.env.AGENT_B64.length > 1000 && c.ports[0] === "8000/http", "the pod boots the agent from its start command");
  ok(!JSON.stringify(w.log).includes("KEY-123"), "the RunPod key never goes onto the pod");
  ok(Number(c.env.MAX_MINUTES) === 45, "deadline comes from the money cap: $3 at $4.00/hour worst case = 45 min", c.env.MAX_MINUTES);
}
// 1b. the proxy answers 404/502 for a moment after the pod is up: the job must still go through
{
  const w = world(); let flaky = 0; const orig = w.f;
  w.f = async (url, init = {}) => { if (String(url).includes("/in/") || String(url).includes("/run")) { if (flaky++ < 3) return new Response("not ready", { status: flaky % 2 ? 404 : 502 }); } return orig(url, init); };
  const rp = mk(w); const d = dest();
  const r = await rp.run({ label: "gen", script: "generate.sh", inputs: { "first.png": png }, env: { PROMPT: "p" }, outputs: ["clip.mp4"], required: ["clip.mp4"], destDir: d, capUsd: 3 });
  ok(r.saved.includes("clip.mp4") && flaky > 3, "a 404/502 from the proxy while the pod settles is retried, not fatal", `${flaky} calls`);
}
// 2. a failing job still deletes the pod and shows the reason
{
  const w = world(); const rp = mk(w); let err = null;
  try { await rp.run({ label: "t", script: "generate.sh", inputs: { "first.png": png }, env: { FAIL: "1" }, outputs: [], required: ["x"], destDir: dest(), capUsd: 5 }); } catch (e) { err = e; }
  ok(err && /exit 3/.test(err.message) && /out of memory/.test(err.message), "a failed job reports the exit code and the last log lines", err?.message.split("\n")[0]);
  ok(w.pods.get("pod1").deleted, "…and the pod is deleted anyway");
}
// 3. cancel
{
  const w = world(); const rp = mk(w); const sig = { cancelled: false }; let err = null; const t0 = Date.now();
  try { await rp.run({ label: "t", script: "generate.sh", inputs: {}, env: { SLOW: "1" }, outputs: [], required: [], destDir: dest(), capUsd: 5, signal: sig, onProgress: (p) => { if (p.stage === "making the video") sig.cancelled = true; } }); } catch (e) { err = e; }
  ok(err && err.code === "cancelled", "cancelling stops the job", err?.message);
  ok(w.pods.get("pod1").deleted && Date.now() - t0 < 4500, "…and deletes the pod without waiting for the job");
}
// 3b. "Stop and keep": the job is asked to finish, ends early, and its result still comes home
{
  const w = world(); const rp = mk(w); const sig = { cancelled: false, finish: false }; const d = dest(); const t0 = Date.now(); let r = null, err = null;
  try { r = await rp.run({ label: "t", script: "train_lora.sh", inputs: {}, env: {}, outputs: ["lora.safetensors"], required: ["lora.safetensors"], destDir: d, capUsd: 5, signal: sig, onProgress: (p) => { if (p.stage === "training") sig.finish = true; } }); } catch (e) { err = e; }
  ok(!err && r && r.saved.includes("lora.safetensors") && Date.now() - t0 < 9000, "Stop and keep ends the training early and the trained file still comes home", err?.message);
  ok(w.pods.get("pod1").deleted, "…and the pod is deleted");
}
// 4. a GPU pricier than allowed is refused and returned before anything is sent
{
  const w = world({ costPerHr: 9 }); const rp = mk(w); let err = null;
  try { await rp.run({ label: "t", script: "generate.sh", inputs: { "first.png": png }, env: { PROMPT: "x" }, outputs: [], required: [], destDir: dest(), capUsd: 5 }); } catch (e) { err = e; }
  ok(err && err.code === "price", "an over-priced GPU is refused", err?.message);
  ok(w.pods.get("pod1").deleted, "…and handed straight back");
}
// 5. the per-job cap stops a running job
{
  const w = world({ costPerHr: 50000 }); const rp = mk(w, { worstHourly: 100000 }); let err = null;
  try { await rp.run({ label: "t", script: "generate.sh", inputs: {}, env: { SLOW: "1" }, outputs: [], required: [], destDir: dest(), capUsd: 0.5 }); } catch (e) { err = e; }
  ok(err && err.code === "cap", "a job that reaches its dollar limit is stopped", err?.message);
  ok(w.pods.get("pod1").deleted, "…and the pod is deleted");
}
// 6. missing required output is a failure, not a silent success
{
  const w = world(); const rp = mk(w); let err = null;
  try { await rp.run({ label: "t", script: "generate.sh", inputs: { "first.png": png }, env: { PROMPT: "x" }, outputs: [], required: ["lora.safetensors"], destDir: dest(), capUsd: 3 }); } catch (e) { err = e; }
  ok(err && err.code === "missing", "a job that does not produce its file is reported as failed", err?.message);
  ok(w.pods.get("pod1").deleted, "…and the pod is deleted");
}
// 7. keys
{
  const w = world(); let err = null;
  try { await new RunPod({ apiKey: "WRONG", fetch: w.f, scriptsDir: scripts }).check(); } catch (e) { err = e; }
  ok(err && err.code === "auth" && !/WRONG/.test(err.message), "a bad key says so, without printing the key", err?.message);
  const g = await mk(w).check(); ok(g.ok === true, "a good key checks out");
  const swept = await mk(w).sweep(); ok(swept === 0, "sweep with no pods deletes none");
}
// 8. sweep only touches xugc pods
{
  const w = world(); const rp = mk(w);
  await rp.api("POST", "/pods", { name: "xugc-old", env: { AGENT_TOKEN: "t", MAX_MINUTES: "10" } });
  const n = await rp.sweep();
  ok(n === 1 && w.pods.get("pod1").deleted, "sweep deletes leftover xugc pods and nobody else's");
}
// 9. the pod deletes itself at its deadline, with nobody asking
{
  const port = await freePort(); const root = mkdtempSync(join(tmpdir(), "xugc-dl-"));
  const py = spawn("python3", [join(scripts, "pod_agent.py")], { env: { ...process.env, AGENT_ROOT: root, AGENT_PORT: String(port), AGENT_TOKEN: "t", MAX_MINUTES: "0.015", AGENT_TICK: "0.2" }, stdio: "ignore" });
  const t0 = Date.now(); const exited = await new Promise((r) => { py.on("exit", () => r(true)); setTimeout(() => r(false), 5000); });
  ok(exited && Date.now() - t0 < 4000, "the agent shuts its own pod at the deadline, even if the app is gone", `${Date.now() - t0} ms`);
  if (!exited) py.kill("SIGKILL");
}
// 10. only the right token gets in; only allowed scripts run
{
  const port = await freePort(); const root = mkdtempSync(join(tmpdir(), "xugc-tok-"));
  const py = spawn("python3", [join(scripts, "pod_agent.py")], { env: { ...process.env, AGENT_ROOT: root, AGENT_PORT: String(port), AGENT_TOKEN: "right", MAX_MINUTES: "10" }, stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 600));
  const base = `http://127.0.0.1:${port}`;
  ok((await fetch(base + "/status", { headers: { "X-Token": "wrong" } })).status === 401, "a wrong token is refused");
  ok((await fetch(base + "/status")).status === 401, "no token is refused");
  const bad = await fetch(base + "/run", { method: "POST", headers: { "X-Token": "right" }, body: JSON.stringify({ script: "rm -rf /" }) });
  ok(bad.status === 400, "an arbitrary command is refused; only generate.sh runs");
  const esc = await fetch(base + "/in/..%2F..%2Fetc%2Fpasswd", { method: "PUT", headers: { "X-Token": "right" }, body: "x" });
  ok(!existsSync("/etc/passwd.part") && esc.status < 500, "a path-escaping file name cannot leave the job folder", String(esc.status));
  py.kill("SIGKILL");
}
process.exit(fail ? 1 : 0);

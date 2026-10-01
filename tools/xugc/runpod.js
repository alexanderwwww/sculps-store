/**
 * RunPod: rent a GPU, run ONE job on it, bring the result home, and hand the GPU back.
 *
 * The rules this file exists to keep:
 *
 *   1. A pod is ALWAYS deleted when the job ends, fails, is cancelled or throws (the `finally`).
 *   2. The pod deletes ITSELF at a deadline (pod_agent.py), so a crash or a shut laptop cannot
 *      leave it running. The deadline is worked out from the money cap, not guessed.
 *   3. If RunPod hands us a pricier GPU than we allow, the pod is deleted before it does anything.
 *   4. Cost is reported from the pod's real price per hour and the real seconds it lived.
 *   5. The API key is never logged, never put on the pod, never in an error message.
 *
 * Everything that touches the network goes through `fetch` and `sleep`, which tests replace.
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const API = "https://rest.runpod.io/v1";
const IMAGE = "runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04";
// 80 GB cards: LTX-2.5 is a 22B model plus a 12B text encoder (66 GB of files).
const GPUS = ["NVIDIA H100 PCIe", "NVIDIA H100 80GB HBM3", "NVIDIA A100 80GB PCIe", "NVIDIA A100-SXM4-80GB"];
// What we ASSUME the dearest allowed GPU costs per hour. Used to size the deadline and the estimate.
const WORST_HOURLY = 4.0;
const CHUNK = 48 * 1024 * 1024;

class RunPodError extends Error { constructor(msg, code) { super(msg); this.code = code || "runpod"; } }
class Cancelled extends Error { constructor() { super("Cancelled."); this.code = "cancelled"; } }

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));
const money = (n) => Math.round(n * 10000) / 10000;

class RunPod {
  /**
   * @param {{apiKey: string, fetch?: Function, sleep?: Function, agentUrl?: (podId: string) => string,
   *          image?: string, volumeId?: string, worstHourly?: number, scriptsDir?: string, pollMs?: number}} o
   */
  constructor(o) {
    if (!o || !o.apiKey) throw new RunPodError("No RunPod key yet. Paste it in Settings.", "nokey");
    this.key = o.apiKey;
    this.fetch = o.fetch || globalThis.fetch;
    this.sleep = o.sleep || defaultSleep;
    this.agentUrl = o.agentUrl || ((id) => `https://${id}-8000.proxy.runpod.net`);
    this.image = o.image || IMAGE;
    this.volumeId = o.volumeId || "";
    this.worstHourly = o.worstHourly || WORST_HOURLY;
    this.scriptsDir = o.scriptsDir || path.join(__dirname, "train");
    this.pollMs = o.pollMs ?? 4000;
    this.chunk = o.chunk || CHUNK;
  }

  /** Never let the key into a message, even by accident. */
  scrub(s) { return String(s).split(this.key).join("<key>"); }

  async api(method, p, body) {
    let r;
    try {
      r = await this.fetch(API + p, { method, headers: { Authorization: `Bearer ${this.key}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    } catch (e) { throw new RunPodError("Could not reach RunPod: " + this.scrub(e.message || e), "network"); }
    const text = await r.text();
    let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (r.status === 401 || r.status === 403) throw new RunPodError("RunPod refused the key. Make a new one with Read & Write access and paste it in Settings.", "auth");
    if (!r.ok) throw new RunPodError(`RunPod said ${r.status}: ${this.scrub(typeof data === "string" ? data : JSON.stringify(data)).slice(0, 300)}`, "api");
    return data;
  }

  /** Is the key good? Returns how many pods are alive (should be 0 when idle). */
  async check() { const pods = await this.api("GET", "/pods"); return { ok: true, pods: Array.isArray(pods) ? pods.length : 0 }; }

  /** Delete every pod XUGC ever made. Used on start-up and from Settings: the "stop the meter" button. */
  async sweep() {
    const pods = await this.api("GET", "/pods");
    const mine = (Array.isArray(pods) ? pods : []).filter((p) => String(p.name || "").startsWith("xugc-"));
    for (const p of mine) { try { await this.api("DELETE", `/pods/${p.id}`); } catch { /* already gone */ } }
    return mine.length;
  }

  agentFetch(podId, token) {
    const base = this.agentUrl(podId);
    // RunPod's proxy answers 404/502/503/504 (or drops the connection) while a pod is still settling, even
    // after it has answered once. Those mean "not delivered", so asking again is safe.
    return async (method, p, { body, headers, json } = {}) => {
      let last;
      for (let i = 0; i < 8; i++) {
        try {
          const r = await this.fetch(base + p, { method, headers: { "X-Token": token, ...(json ? { "Content-Type": "application/json" } : {}), ...(headers || {}) }, body: json ? JSON.stringify(json) : body });
          if (![404, 502, 503, 504].includes(r.status) || p === "/status") return r;
          last = r;
        } catch (e) { last = null; if (i === 7) throw e; }
        await this.sleep(Math.min(this.pollMs, 3000));
      }
      return last;
    };
  }

  async put(af, name, buf) {
    const total = buf.length;
    let off = 0, last = false;
    do {
      const part = buf.subarray(off, Math.min(total, off + this.chunk));
      last = off + part.length >= total;
      const r = await af("PUT", `/in/${encodeURIComponent(name)}`, { body: part, headers: { "X-Append": off === 0 ? "0" : "1", "X-Final": last ? "1" : "0", "Content-Type": "application/octet-stream" } });
      if (!r.ok) throw new RunPodError(`Upload of ${name} failed (${r.status}).`, "upload");
      off += part.length;
    } while (!last);
  }

  async get(af, name, size, dest) {
    const fd = fs.openSync(dest, "w");
    try {
      for (let off = 0; off < size; off += this.chunk) {
        const end = Math.min(size - 1, off + this.chunk - 1);
        const r = await af("GET", `/out/${encodeURIComponent(name)}`, { headers: { Range: `bytes=${off}-${end}` } });
        if (!(r.status === 206 || r.status === 200)) throw new RunPodError(`Download of ${name} failed (${r.status}).`, "download");
        const buf = Buffer.from(await r.arrayBuffer());
        fs.writeSync(fd, buf, 0, buf.length, off);
      }
    } finally { fs.closeSync(fd); }
  }

  /**
   * Run one job and return what it produced.
   *
   * @param {object} job
   * @param {string} job.label            for the pod's name and the progress lines
   * @param {"generate.sh"} job.script
   * @param {Record<string, string|Buffer>} job.inputs   remote name -> local file path or bytes
   * @param {Record<string,string>} job.env
   * @param {string[]} job.outputs         names to bring back (those that exist)
   * @param {string[]} job.required        names that MUST exist or the job is a failure
   * @param {string} job.destDir
   * @param {number} job.capUsd            hard ceiling for this job
   * @param {number} job.expectedMinutes   what we expect, for the deadline's sanity
   * @param {(p:{stage:string, pct:number, costUsd:number, minutes:number, log:string})=>void} job.onProgress
   * @param {{cancelled:boolean}} job.signal
   */
  async run(job) {
    const token = crypto.randomBytes(24).toString("hex");
    const cap = Math.max(0.5, job.capUsd);
    // The deadline: whichever is smaller, what the money allows at the worst price, or what the job is worth.
    const maxMinutes = Math.max(10, Math.min(Math.floor((cap / this.worstHourly) * 60), job.maxMinutes || 600));
    const agentSrc = fs.readFileSync(path.join(this.scriptsDir, "pod_agent.py"));
    const startedAt = Date.now();
    let pod = null, hourly = 0;
    const costNow = () => money((hourly || this.worstHourly) * ((Date.now() - startedAt) / 3600000));
    const note = (stage, pct, log = "") => job.onProgress && job.onProgress({ stage, pct, costUsd: costNow(), minutes: Math.round(((Date.now() - startedAt) / 60000) * 10) / 10, log });
    const check = () => { if (job.signal && job.signal.cancelled) throw new Cancelled(); };

    try {
      note("Renting a GPU", 2);
      const body = {
        name: `xugc-${job.label}-${Date.now().toString(36)}`,
        imageName: this.image,
        gpuTypeIds: GPUS, gpuCount: 1,
        cloudType: "SECURE",
        containerDiskInGb: this.volumeId ? 40 : 160,
        ports: ["8000/http"],
        env: { AGENT_B64: agentSrc.toString("base64"), AGENT_TOKEN: token, MAX_MINUTES: String(maxMinutes), },
        dockerStartCmd: ["bash", "-c", "echo \"$AGENT_B64\" | base64 -d > /agent.py && exec python3 /agent.py"],
      };
      if (this.volumeId) { body.networkVolumeId = this.volumeId; body.volumeMountPath = "/workspace"; } else { body.volumeInGb = 0; }
      pod = await this.api("POST", "/pods", body);
      if (!pod || !pod.id) throw new RunPodError("RunPod did not return a pod.", "api");
      hourly = Number(pod.costPerHr) || 0;
      if (hourly > this.worstHourly + 0.001) throw new RunPodError(`RunPod gave a GPU at $${hourly.toFixed(2)}/hour, over your $${this.worstHourly.toFixed(2)}/hour ceiling. Nothing was run and the GPU was handed back.`, "price");
      check();

      const af = this.agentFetch(pod.id, token);
      // Wait for the agent: image pull + boot can take several minutes.
      note("Waiting for the GPU to boot", 6);
      let up = false;
      for (let i = 0; i < 360 && !up; i++) {
        check();
        try { const r = await af("GET", "/status"); if (r.ok) up = true; else if (r.status === 401) throw new RunPodError("The GPU answered but refused our token.", "token"); } catch (e) { if (e instanceof RunPodError) throw e; }
        if (!up) { await this.sleep(this.pollMs); if (costNow() > cap) throw new RunPodError(`The GPU did not start in time. Stopped at about $${costNow().toFixed(2)}.`, "boot"); }
      }
      if (!up) throw new RunPodError("The GPU never came up. It was handed back.", "boot");

      note("Sending your files", 10);
      const scripts = [job.script];
      for (const f of scripts) await this.put(af, f, fs.readFileSync(path.join(this.scriptsDir, f)));
      for (const [name, src] of Object.entries(job.inputs || {})) { check(); await this.put(af, name, Buffer.isBuffer(src) ? src : fs.readFileSync(src)); }

      check();
      const started = await af("POST", "/run", { json: { script: job.script, env: job.env || {} } });
      if (!started.ok) throw new RunPodError(`The GPU would not start the job (${started.status}).`, "run");

      let status = null, lastMark = "Starting";
      for (;;) {
        if (job.signal && job.signal.cancelled) { try { await af("POST", "/stop", { json: {} }); } catch {} throw new Cancelled(); }
        await this.sleep(this.pollMs);
        let r; try { r = await af("GET", "/status"); } catch { continue; }
        if (!r.ok) continue;
        status = await r.json();
        const marks = [...String(status.log || "").matchAll(/^== \d\d:\d\d:\d\d (.+)$/gm)];
        if (marks.length) lastMark = marks[marks.length - 1][1];
        const lastLine = String(status.log || "").trim().split("\n").pop() || "";
        note(lastMark, job.stagePct ? job.stagePct(lastMark) : 50, lastLine.slice(0, 200));
        if (costNow() > cap) { try { await af("POST", "/stop", { json: {} }); } catch {} throw new RunPodError(`Stopped: this job reached its $${cap.toFixed(2)} limit before finishing.`, "cap"); }
        if (!status.running && status.exit !== null && status.exit !== undefined) break;
      }
      if (status.exit !== 0) throw Object.assign(new RunPodError(`The GPU job failed (exit ${status.exit}). Last lines:\n${String(status.log || "").trim().split("\n").slice(-12).join("\n")}`, "job"), { log: status.log });

      note("Bringing the result home", 96);
      fs.mkdirSync(job.destDir, { recursive: true });
      const listing = await (await af("GET", "/out")).json();
      const have = new Map(listing.files.map((f) => [f.name, f.size]));
      for (const need of job.required || []) if (!have.has(need)) throw new RunPodError(`The job finished but did not produce ${need}.`, "missing");
      const saved = [];
      for (const name of new Set([...(job.required || []), ...(job.outputs || [])])) {
        if (!have.has(name)) continue;
        await this.get(af, name, have.get(name), path.join(job.destDir, name)); saved.push(name);
      }
      return { saved, log: status.log, costUsd: costNow(), minutes: Math.round(((Date.now() - startedAt) / 60000) * 10) / 10, hourly };
    } finally {
      if (pod && pod.id) {
        // Always. Retry, because this is the one call that must not fail quietly.
        let gone = false;
        for (let i = 0; i < 4 && !gone; i++) { try { await this.api("DELETE", `/pods/${pod.id}`); gone = true; } catch (e) { if (e.code === "auth") break; await this.sleep(this.pollMs); } }
        if (job.onProgress) job.onProgress({ stage: gone ? "GPU handed back" : "WARNING: could not delete the GPU, check runpod.io", pct: 100, costUsd: costNow(), minutes: 0, log: "", gone });
      }
    }
  }
}

module.exports = { RunPod, RunPodError, Cancelled, GPUS, WORST_HOURLY, IMAGE };

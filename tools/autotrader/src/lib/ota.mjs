// Live updates (Alex, 2026-10-29: "build it on the spot like a sculpture"). Claude publishes a new build of the program
// files to R2 (ul-runtime.json, written only with the Cloudflare credentials, served read-only by the Kerberos worker).
// Ultra looks every 2 minutes; when the published build is NEWER it copies its own program, lays the new files over it in
// <data>/ota/<build>, checks every file's sha256, then hands over: this server closes and the new one starts on the same
// port. Open positions come back from the journal. The data folder (wallet key, journals) is never touched.
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join, normalize, isAbsolute } from "node:path";

const SAFE = /^(server\.mjs|lib\/[\w-]+\.mjs|ui\/(index\.html|app\.js|style\.css|icon\.png))$/;

/** Fetch the manifest; null when there is nothing newer (or the network is down). */
export async function checkRuntime({ url, build, fetchImpl = fetch }) {
  try {
    const r = await fetchImpl(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const m = await r.json();
    if (!m || !Number.isInteger(m.build) || !(m.build > Number(build)) || !m.files || typeof m.files !== "object") return null;
    return m;
  } catch { return null; }
}

/** Lay the manifest over a copy of the running program. Throws on any bad path or hash: nothing half-written is ever run. */
export function stageRuntime({ manifest, fromDir, dataDir }) {
  const dir = join(dataDir, "ota", String(manifest.build)), tmp = `${dir}.tmp`;
  rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  cpSync(fromDir, tmp, { recursive: true });
  for (const [p, f] of Object.entries(manifest.files)) {
    if (!SAFE.test(p) || isAbsolute(p) || normalize(p) !== p) throw new Error(`refused path ${p}`);
    const buf = Buffer.from(String(f.b64 || ""), "base64");
    if (createHash("sha256").update(buf).digest("hex") !== f.sha256) throw new Error(`hash mismatch on ${p}`);
    mkdirSync(join(tmp, p, ".."), { recursive: true }); writeFileSync(join(tmp, p), buf);
  }
  writeFileSync(join(tmp, "BUILD"), `${manifest.build}\n`);
  rmSync(dir, { recursive: true, force: true }); cpSync(tmp, dir, { recursive: true }); rmSync(tmp, { recursive: true, force: true });
  if (!existsSync(join(dir, "server.mjs"))) throw new Error("staged build has no server.mjs");
  return dir;
}

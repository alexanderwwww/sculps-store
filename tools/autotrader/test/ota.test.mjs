import test from "node:test"; import assert from "node:assert/strict";
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import crypto from "node:crypto";
import { checkRuntime, stageRuntime } from "../src/lib/ota.mjs";
const file = (txt) => { const b = Buffer.from(txt); return { b64: b.toString("base64"), sha256: crypto.createHash("sha256").update(b).digest("hex") }; };
const fakeFetch = (m) => async () => ({ ok: true, json: async () => m });
test("live update: only a NEWER published build is taken", async () => {
  assert.equal(await checkRuntime({ url: "x", build: "16", fetchImpl: fakeFetch({ build: 16, files: {} }) }), null);
  assert.equal(await checkRuntime({ url: "x", build: "16", fetchImpl: fakeFetch({ build: 15, files: {} }) }), null);
  assert.equal((await checkRuntime({ url: "x", build: "16", fetchImpl: fakeFetch({ build: 17, files: {} }) })).build, 17);
  assert.equal(await checkRuntime({ url: "x", build: "16", fetchImpl: async () => { throw new Error("offline"); } }), null);
});
test("live update: files land over a copy, hashes checked, bad paths refused, the data folder untouched", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ota-")), from = path.join(root, "prog"), data = path.join(root, "data");
  fs.mkdirSync(path.join(from, "lib"), { recursive: true }); fs.writeFileSync(path.join(from, "server.mjs"), "old"); fs.writeFileSync(path.join(from, "lib", "engine.mjs"), "old-engine");
  fs.mkdirSync(data); fs.writeFileSync(path.join(data, "secrets.json"), "KEY");
  const dir = stageRuntime({ manifest: { build: 17, files: { "lib/engine.mjs": file("new-engine") } }, fromDir: from, dataDir: data });
  assert.equal(fs.readFileSync(path.join(dir, "lib", "engine.mjs"), "utf8"), "new-engine");
  assert.equal(fs.readFileSync(path.join(dir, "server.mjs"), "utf8"), "old");
  assert.equal(fs.readFileSync(path.join(dir, "BUILD"), "utf8").trim(), "17");
  assert.equal(fs.readFileSync(path.join(data, "secrets.json"), "utf8"), "KEY");
  assert.throws(() => stageRuntime({ manifest: { build: 18, files: { "lib/engine.mjs": { ...file("x"), sha256: "0".repeat(64) } } }, fromDir: from, dataDir: data }), /hash mismatch/);
  assert.throws(() => stageRuntime({ manifest: { build: 18, files: { "../secrets.json": file("x") } }, fromDir: from, dataDir: data }), /refused path/);
  assert.throws(() => stageRuntime({ manifest: { build: 18, files: { "/etc/x": file("x") } }, fromDir: from, dataDir: data }), /refused path/);
});

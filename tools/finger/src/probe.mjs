// Reads the Mac's own facts for finger_status: the machine, the system, and Xcode.
// UNPROVEN UNTIL HIS MAC: nothing here has run on macOS.
// How Xcode is found is the way Appium's own package does it (appium-ios at the pinned commit):
//   packages/xcode/lib/xcode.ts:39        `xcode-select --print-path` gives <Xcode.app>/Contents/Developer
//   packages/xcode/lib/helpers.ts:74-77   Xcode's Info.plist is one folder up from there
//   packages/xcode/lib/xcode.ts:236       CFBundleShortVersionString in it is the Xcode version
// The system is reported as Node reports it (os.version / os.release): the Darwin kernel
// text, not translated into a macOS name here.
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { parsePlist } from './plist.mjs';

function run(cmd, args, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: timeoutMs }, (err, stdout) => (err ? reject(err) : resolve(String(stdout))));
  });
}

export async function probeXcode({ exec = run, readFile = (f) => fs.readFileSync(f) } = {}) {
  let developerDir;
  try {
    developerDir = (await exec('xcode-select', ['--print-path'])).replace(/\/$/, '').trim();
  } catch (e) {
    return { found: false, error: `xcode-select did not run: ${e.message}` };
  }
  if (!developerDir) return { found: false, error: 'xcode-select gave no path' };
  const plistPath = path.resolve(developerDir, '..', 'Info.plist');
  let raw;
  try { raw = readFile(plistPath); } catch { return { found: false, developerDir, error: `${developerDir} is not inside Xcode.app (Command Line Tools only?)` }; }
  if (raw.subarray(0, 6).toString('latin1') === 'bplist') return { found: true, developerDir, version: null, error: 'Xcode Info.plist is a binary plist; the version was not read' };
  try {
    const info = parsePlist(raw);
    return { found: true, developerDir, bundleId: info.CFBundleIdentifier || null, version: info.CFBundleShortVersionString || null };
  } catch (e) {
    return { found: true, developerDir, version: null, error: `Xcode Info.plist could not be read: ${e.message}` };
  }
}

export async function probe(deps) {
  const cpu = os.cpus()[0];
  return {
    platform: os.platform(),
    arch: os.arch(),
    cpu: cpu ? cpu.model : null,
    memoryGb: Math.round(os.totalmem() / 2 ** 30),
    system: os.version(),
    kernel: os.release(),
    node: process.version,
    xcode: await probeXcode(deps),
  };
}

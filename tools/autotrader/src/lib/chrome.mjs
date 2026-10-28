// Finds Alex's GMGN-logged-in Chrome (the same profile ultracursor uses) or opens it, and attaches over the DevTools port.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
export const MAC_CHROMES = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", path.join(os.homedir(), "Applications/Google Chrome.app/Contents/MacOS/Google Chrome")];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export function loadPlaywright() { try { return require("playwright-core").chromium; } catch (e) { throw new Error(`playwright-core is missing from this install: ${e.message}`); } }

export async function connectChrome({ port = Number(process.env.ULTRA_CHROME_PORT || 9333), profile = process.env.ULTRA_CHROME_PROFILE || path.join(os.homedir(), ".ultracursor-chrome"), binary = process.env.ULTRA_CHROME_BIN || null, startUrl = "https://gmgn.ai/?chain=sol", chromium = loadPlaywright(), wait = sleep, tries = 100 } = {}) {
  const up = async () => { try { return (await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; } };
  let opened = false;
  if (!(await up())) {
    const exe = binary || MAC_CHROMES.find((p) => fs.existsSync(p));
    if (!exe) throw new Error("Google Chrome is not installed. Install it from google.com/chrome, then press Start again.");
    spawn(exe, [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", startUrl], { stdio: "ignore", detached: true }).unref();
    opened = true;
    for (let i = 0; i < tries && !(await up()); i++) await wait(250);
    if (!(await up())) throw new Error("Chrome did not open. Close it fully (Cmd+Q) and press Start again.");
  }
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  return { browser, opened };
}

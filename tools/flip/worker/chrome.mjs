/**
 * His own Chrome, driven by flip.
 *
 * He asked for this eleven times before anyone listened: "let him open one
 * google chrome of mine and i will connect there and then he will have it
 * forever." He was right, and every alternative has failed for the same two
 * reasons.
 *
 * A WKWebView cannot hold a Depop session across builds — its cookie jar is
 * derived from the process, and the process changes. And it can never complete
 * Continue with Google or Continue with Apple, because both refuse an embedded
 * browser on purpose. Chrome has neither problem: it is the real thing, its
 * profile lives in a folder nothing about our builds touches, and OAuth works
 * because it is exactly the browser those flows expect.
 *
 * So: Chrome is launched with a remote debugging port and a profile folder of
 * its own, and the worker drives it over the DevTools protocol — which is
 * plain JSON over the WebSocket we already depend on, no new packages. The
 * agent that already exists is injected into every page it opens, so every
 * site recipe keeps working unchanged.
 *
 * The profile folder is deliberately NOT his default Chrome profile. Chrome
 * refuses remote debugging against the default one, and pointing at it would
 * also mean this app could reach his mail. He signs into Depop once in this
 * window and it persists there for good.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import WebSocket from "ws";

/** Where Chrome lives on a Mac, in the order worth trying. */
const CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
];

export function findChrome(env = process.env) {
  if (env.FLIP_CHROME && existsSync(env.FLIP_CHROME)) return env.FLIP_CHROME;
  for (const path of CANDIDATES) if (existsSync(path)) return path;
  return null;
}

/** Ask the port what it has open. Also how we know Chrome is up. */
async function ask(port, path) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`);
  if (!res.ok) throw new Error(`devtools ${path} said ${res.status}`);
  return res.json();
}

/**
 * Wait for the port to answer.
 *
 * Chrome takes a moment, and on the very first run it takes longer because it
 * is building the profile. Polling beats a fixed sleep: a sleep that is too
 * short is a launch failure nobody can explain.
 */
async function waitForPort(port, { timeoutMs = 25000, everyMs = 150 } = {}) {
  const until = Date.now() + timeoutMs;
  let last;
  while (Date.now() < until) {
    try {
      return await ask(port, "/json/version");
    } catch (error) {
      last = error;
      await new Promise((go) => setTimeout(go, everyMs));
    }
  }
  throw new Error(`Chrome never answered on ${port}: ${last?.message ?? "no reason"}`);
}

/** One open page, spoken to over the DevTools protocol. */
class Target {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.waiting = new Map();
    socket.on("message", (raw) => {
      let message;
      try {
        message = JSON.parse(String(raw));
      } catch {
        return;
      }
      const held = this.waiting.get(message.id);
      if (!held) return;
      this.waiting.delete(message.id);
      if (message.error) held.reject(new Error(message.error.message));
      else held.resolve(message.result);
    });
  }

  send(method, params = {}, { timeoutMs = 20000 } = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting.delete(id);
        reject(new Error(`${method} did not answer in ${timeoutMs}ms`));
      }, timeoutMs);
      this.waiting.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  /**
   * Run an expression in the page and get the value back.
   *
   * `awaitPromise` matters: nearly everything the agent exposes is async, and
   * without it the caller gets a Promise object rather than the answer — the
   * same class of bug as the bridge resolving an envelope instead of a result.
   */
  async eval(expression) {
    const out = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (out.exceptionDetails) {
      const text = out.exceptionDetails.exception?.description
        ?? out.exceptionDetails.text ?? "threw";
      throw new Error(text);
    }
    return out.result?.value;
  }

  close() {
    try { this.socket.close(); } catch { /* already gone */ }
  }
}

/**
 * Launch his Chrome and hold the connection open.
 *
 * `home` is the app's support directory; the profile goes in `chrome/` beside
 * the worker so it survives every rebuild, which is the entire point.
 */
export async function openChrome({ home, port = 0, agent = "", log = () => {} } = {}) {
  const binary = findChrome();
  if (!binary) {
    throw new Error("Google Chrome is not installed. flip drives his own Chrome so the session lasts.");
  }
  const profile = join(home, "chrome");
  await mkdir(profile, { recursive: true });
  const chosen = port || 9333;

  const child = spawn(binary, [
    `--remote-debugging-port=${chosen}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    // Without this the port only listens for the first window.
    "--remote-allow-origins=*",
  ], { stdio: "ignore", detached: false });

  child.on("error", (error) => log(`chrome would not start: ${error.message}`));

  const version = await waitForPort(chosen);
  log(`chrome up: ${version.Browser ?? "unknown"} on ${chosen}`);

  return {
    port: chosen,
    profile,
    binary,
    /** Bring up a page on a url and give back something to talk to it with. */
    async open(url) {
      const made = await ask(chosen, `/json/new?${encodeURIComponent(url)}`);
      return this.attach(made);
    },
    /** The first ordinary page already open, if there is one. */
    async firstPage() {
      const list = await ask(chosen, "/json/list");
      const page = list.find((t) => t.type === "page" && !t.url.startsWith("devtools://"));
      return page ? this.attach(page) : null;
    },
    async attach(info) {
      const socket = new WebSocket(info.webSocketDebuggerUrl, {
        // Chrome rejects a socket with no Origin unless told otherwise, and the
        // flag above is only half of it.
        headers: { Origin: `http://127.0.0.1:${chosen}` },
      });
      await new Promise((go, no) => {
        socket.once("open", go);
        socket.once("error", no);
      });
      const target = new Target(socket);
      await target.send("Page.enable");
      await target.send("Runtime.enable");
      if (agent) {
        /* On every navigation, not just this one — the agent has to survive
           Depop moving between pages or the first click loses it. */
        await target.send("Page.addScriptToEvaluateOnNewDocument", { source: agent });
        await target.eval(agent).catch(() => {});
      }
      return target;
    },
    stop() {
      try { child.kill(); } catch { /* already gone */ }
    },
  };
}

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

/**
 * Ask the port what it has open. Also how we know Chrome is up.
 *
 * `/json/new` wants PUT. It answered GET for years and current Chrome returns
 * 405 for it — the sort of thing that is obvious the first time the code is
 * actually run and invisible forever if it is not.
 */
async function ask(port, path, method = "GET") {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { method });
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
    /* His Mac needs nothing else. FLIP_CHROME_ARGS exists so the tests in this
       container can pass --no-sandbox, which a real Chrome on macOS must never
       be given.
       Split on NEWLINES, one flag per line. Splitting on spaces broke the
       moment a flag had a space in its value — --host-resolver-rules="MAP host
       127.0.0.1:1234" arrived as three separate argv entries, which Chrome read
       as three URLs to open and refused with "multiple targets". */
    ...(process.env.FLIP_CHROME_ARGS
      ? process.env.FLIP_CHROME_ARGS.split("\n").map((f) => f.trim()).filter(Boolean)
      : []),
  ], { stdio: process.env.FLIP_CHROME_LOUD ? "inherit" : "ignore", detached: false });

  child.on("error", (error) => log(`chrome would not start: ${error.message}`));

  const version = await waitForPort(chosen);
  log(`chrome up: ${version.Browser ?? "unknown"} on ${chosen}`);

  return {
    port: chosen,
    profile,
    binary,
    /**
     * Bring up a page on a url and give back something to talk to it with.
     *
     * The tab is created blank and then NAVIGATED over the protocol, rather
     * than asking /json/new to do both. That endpoint took the url encoded and
     * refused it, took it raw and still opened blank, and said nothing either
     * way — so Chrome appeared on his screen with an empty tab and the whole
     * app looked dead. Page.navigate is the same call the loop already uses
     * for every other move and it reports when the load actually finished.
     */
    async open(url) {
      const made = await ask(chosen, "/json/new", "PUT");
      const target = await this.attach(made);
      await target.send("Page.navigate", { url: String(url) });
      await settle(target);
      return target;
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
      /* Where it really ended up. A tab that did not navigate is the bug
         above, and it must never be silent again. */
      const landed = await target.eval("location.href").catch(() => null);
      if (!landed || landed === "about:blank") {
        log(`chrome opened a blank tab instead of ${info.url ?? "the page"}`);
      }
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

/**
 * A Chrome page wearing the same face the app's bridge wears.
 *
 * The whole loop in main.mjs speaks one verb: `page.ask(act, args)`. That is
 * the seam. Give it something with an `ask` and it does not care whether the
 * page is a WKWebView inside his window or a tab in his own Chrome — the site
 * recipes, the readers and the hands are the same code either way.
 *
 * `goto` is handled here rather than in the page, because navigating is the
 * one thing the protocol does better than script: Page.navigate reports when
 * the load actually finished, where a script assignment returns immediately
 * and leaves the next read racing an empty document.
 */
export function pageOverChrome(target, { log = () => {} } = {}) {
  return {
    async ask(act, args = {}) {
      if (act === "goto") {
        await target.send("Page.navigate", { url: String(args.url) });
        await settle(target);
        return { ok: true, url: args.url };
      }
      const call = `window.__organicNS && window.__organicNS.act(${JSON.stringify(act)},${JSON.stringify(args)})`;
      const out = await target.eval(call);
      if (out === undefined || out === null) return { ok: true };
      return out;
    },
    /* The loop calls this when it wants the page to stop what it is doing. */
    async stop() {
      await this.ask("stop", {}).catch(() => {});
    },
    close() { target.close(); },
    log,
  };
}

/**
 * Wait for the document to be usable.
 *
 * Not `load` — Depop is a React app and `load` fires long before anything the
 * readers look for exists. Polling for a body with content in it is cruder and
 * correct; the cap stops a page that never settles from hanging the pass.
 */
async function settle(target, { timeoutMs = 15000, everyMs = 120 } = {}) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const ready = await target
      .eval("document.readyState === 'complete' && !!document.body && document.body.children.length > 0")
      .catch(() => false);
    if (ready) return true;
    await new Promise((go) => setTimeout(go, everyMs));
  }
  return false;
}

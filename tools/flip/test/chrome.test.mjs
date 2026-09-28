/**
 * flip really drives a real browser — proven, not assumed.
 *
 * This is the route he asked for eleven times: his own Chrome, signed in once,
 * kept forever. The thing that must be true is not "the code looks right" but
 * "a browser was launched, a page was opened, the agent was injected, an act
 * ran in it, and the answer came back". So that is what this does, end to end,
 * against the Chromium in this container standing in for his Chrome.
 *
 * It also proves the part that has bitten twice: that the agent survives a
 * NAVIGATION. Injecting once is not enough — Depop moves between pages and the
 * first click would lose it.
 */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { openChrome, pageOverChrome, findChrome } from "../worker/chrome.mjs";

const CHROME = process.env.FLIP_CHROME
  || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
process.env.FLIP_CHROME = CHROME;

let bad = 0;
const check = (ok, what) => {
  console.log(ok ? "  ok  " + what : "FAIL  " + what);
  if (!ok) bad++;
};

check(findChrome() === CHROME, "it finds a browser to drive");

/* Two pages, so a navigation can be proved rather than argued about. */
const PAGES = {
  "/one": "<title>one</title><body><h1 id=where>page one</h1></body>",
  "/two": "<title>two</title><body><h1 id=where>page two</h1></body>",
};
const server = createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html" });
  res.end(PAGES[req.url] ?? PAGES["/one"]);
});
await new Promise((go) => server.listen(0, "127.0.0.1", go));
const { port: web } = server.address();

/* A stand-in for the agent: the loop only ever reaches it through
   window.__organicNS.act, so that is the whole contract being tested. */
const agent = `
  (function(){
    var O = window.__organicNS || (window.__organicNS = {});
    O.act = function(name, args){
      if (name === "read") return Promise.resolve({ where: document.getElementById("where").textContent });
      if (name === "echo") return Promise.resolve({ said: args.say });
      return Promise.reject(new Error("unknown act: " + name));
    };
  })();
`;

const home = await mkdtemp(join(tmpdir(), "flip-chrome-"));
const chrome = await openChrome({
  home,
  port: 9411,
  agent,
  log: (line) => console.log("      " + line),
});

const target = await chrome.open(`http://127.0.0.1:${web}/one`);
const page = pageOverChrome(target);

let read = await page.ask("read");
check(read && read.where === "page one", "an act runs in the page and the value comes back");

const echoed = await page.ask("echo", { say: "chrome" });
check(echoed && echoed.said === "chrome", "arguments reach the act");

/* The one that matters: the agent has to be there after a navigation too. */
await page.ask("goto", { url: `http://127.0.0.1:${web}/two` });
read = await page.ask("read");
check(read && read.where === "page two", "goto lands AND the agent survived it");

let threw = null;
await page.ask("nonsense").catch((error) => { threw = error; });
check(threw !== null, "an unknown act is an error, not a silent success");

/* The profile is the whole point: it must be a folder of its own, under the
   support directory, that no rebuild touches. */
check(chrome.profile === join(home, "chrome"), "the sign-in lives in its own profile folder");

page.close();
chrome.stop();
server.close();
if (bad) { console.log(`chrome: ${bad} failed`); process.exit(1); }
console.log("chrome: ok");
process.exit(0);

/**
 * The whole loop, against a page that answers.
 *
 * The smoke test boots the worker and proves it stays up — which is why five
 * builds shipped with the loop completely dead. Nothing ever opened the
 * socket, so `onePass` was never once executed by anything before his Mac.
 *
 * This connects a fake page, says hello the way the real agent does, answers
 * `goto` / `read` / `tap` / `type` with the shapes `index.js` actually returns,
 * and then holds the worker to what it must do: ask whether he is signed in,
 * read the inbox, go to HIS shop rather than Depop's front page, post a board
 * that is not empty, and — when the tap comes — type the words that were
 * written, once.
 *
 * It also proves the negative: signed out, the app must say so and must not
 * read anything.
 */
import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { mkdtempSync, cpSync, symlinkSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";
import { createServer } from "node:http";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

/* A stand-in for the back end, so the worker talks to something real and the
   test can see exactly what it posted. */
const posted = { board: [], status: [], log: [], ack: [] };
let tray = { items: {} };
const cloud = createServer((req, res) => {
  let body = "";
  req.on("data", (d) => { body += d; });
  req.on("end", () => {
    const path = req.url.split("/").pop();
    const json = (() => { try { return JSON.parse(body); } catch { return {}; } })();
    if (req.method === "POST") {
      if (path === "ack") { for (const id of json.ids ?? []) delete tray.items[id]; posted.ack.push(json.ids); }
      else if (posted[path]) posted[path].push(json);
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(req.method === "GET" && path === "work" ? { items: tray.items } : { ok: true }));
  });
});
await new Promise((r) => cloud.listen(0, "127.0.0.1", r));
const cloudBase = `http://127.0.0.1:${cloud.address().port}/plug/test`;

/* The worker, out of the bundle, from a path with a space, as it really runs. */
const root = mkdtempSync(join(tmpdir(), "plug-loop-"));
const home = join(root, "Application Support", "Plug");
const dir = join(home, "worker");
cpSync(join(ROOT, "app/Plug.app/Contents/Resources/worker"), dir, { recursive: true });
const deps = ["worker/node_modules", "node_modules", "../../node_modules"]
  .map((p) => resolve(ROOT, p))
  .find((p) => existsSync(join(p, "ws")));
assert.ok(deps, "cannot find ws — npm install first");
symlinkSync(deps, join(dir, "node_modules"));

const child = spawn(process.execPath, ["main.mjs"], {
  cwd: dir,
  env: { ...process.env, PLUG_PORT: "0", PLUG_HOME: home, PLUG_CLOUD: cloudBase, PLUG_FAST: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});
let out = "";
child.stdout.on("data", (d) => { out += d; });
child.stderr.on("data", (d) => { out += d; });

const port = await new Promise((done, fail) => {
  const timer = setTimeout(() => fail(new Error(`no port:\n${out}`)), 10000);
  const poll = setInterval(() => {
    const m = /PORT (\d+)/.exec(out);
    if (m) { clearInterval(poll); clearTimeout(timer); done(Number(m[1])); }
  }, 100);
});

/* The page. It answers the way worker/agent/index.js answers. */
const asked = [];
let signedIn = true;
const INBOX = [{
  kind: "message", id: "t1", url: "https://www.depop.com/messages/t1/",
  buyer: "buyerbob", line: "is this still available?", waitingMinutes: 600, unread: true,
}];
let here = "";

function open() {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  ws.on("open", () => ws.send(JSON.stringify({ t: "hello", href: "https://www.depop.com/messages/" })));
  ws.on("message", (raw) => {
    const m = JSON.parse(String(raw));
    if (m.t !== "do") return;
    asked.push({ act: m.act, ...m });
    let result = { ok: true };
    if (m.act === "goto") { here = m.url; result = { ok: true, url: m.url }; }
    if (m.act === "read") {
      if (m.what === "accountStatus") result = { site: "depop", signedIn, who: "@aigis", where: here };
      else if (/depop\.com\/aigis/.test(here)) result = [];
      else result = INBOX;
    }
    if (m.act === "type") result = { ok: true, found: true, typed: "x" };
    if (m.act === "panel") result = { ok: true, open: false };
    ws.send(JSON.stringify({ t: "done", id: m.id, ok: true, result, error: null }));
  });
  return ws;
}

const page = open();
const until = async (what, why, ms = 90000) => {
  const stop = Date.now() + ms;
  while (Date.now() < stop) {
    if (what()) return true;
    await new Promise((r) => setTimeout(r, 120));
  }
  throw new Error(`${why}\nasked: ${JSON.stringify(asked.map((a) => a.act + ":" + (a.what ?? a.url ?? "")))}\n${out}`);
};

// 1. it asks whether he is signed in, before anything else
await until(() => asked.some((a) => a.act === "read" && a.what === "accountStatus"),
  "it never asked whether he was signed in");

// 1b. off the clock it must rest — and "Work anyway" must get it going.
//     (the machine running this is rarely inside Greek seller hours)
await until(() => posted.status.length, "it never said anything at all");
page.send(JSON.stringify({ t: "now" }));

// 2. it reads the inbox, and it goes to HIS shop — never Depop's front page
await until(() => asked.some((a) => a.act === "read" && a.what === "listings"),
  "it never read anything");
await until(() => asked.some((a) => a.act === "goto" && /depop\.com\/aigis/.test(a.url ?? "")),
  "it never opened his own shop");
assert.ok(
  !asked.some((a) => a.act === "goto" && a.url === "https://www.depop.com/"),
  "it opened Depop's front page and would have read strangers' listings as his");

// 3. the board reaches the back end, and it is not empty
await until(() => posted.board.length && (posted.board.at(-1).items ?? []).length,
  "no board was ever posted");
const board = posted.board.at(-1).items;
assert.equal(board[0].id, "t1");
assert.equal(board[0].act, "reply");
assert.ok(board[0].urgent, "ten hours waiting should be urgent");

// 4. Claude writes; the app picks it up and shows it, and types only on a tap
tray.items = { t1: { kind: "reply", reply: "yeah it's still here", ready: true, at: Date.now() } };
await until(() => posted.ack.flat().includes("t1"), "the tray was never acknowledged");
assert.ok(!asked.some((a) => a.act === "type"), "it typed before he tapped Take");

page.send(JSON.stringify({ t: "take", id: "t1" }));
await until(() => asked.some((a) => a.act === "type"), "Take did not type");
const typed = asked.find((a) => a.act === "type");
assert.ok(Array.isArray(typed.strokes) && typed.strokes.length, "typed no strokes");
assert.equal(typed.into, "composer");

// 5. signed out: it must say so, and must not go reading
signedIn = false;
asked.length = 0;
posted.status.length = 0;
// Work anyway gets past the clock, but it must NOT get past the door.
page.send(JSON.stringify({ t: "now" }));
await until(() => posted.status.some((s) => /not signed in/i.test(s.resting ?? "")),
  "signed out, it never said so", 90000);
assert.ok(!asked.some((a) => a.act === "read" && a.what === "listings"),
  "signed out, it went on reading anyway");

child.kill();
cloud.close();
page.close();
console.log("  ok  the loop: asks who, reads, boards, waits for the tap, types once, and knows when it is shut out");

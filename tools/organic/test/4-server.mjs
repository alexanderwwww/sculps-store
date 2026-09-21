import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import WebSocket from "ws";
import { validate } from "../worker/server.mjs";
import { check, failures, until, sleep } from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const guard = setTimeout(() => { console.log("HARD STOP"); process.exit(9); }, 60000);

// validate() — the shape check, without a socket.
check("validate: ok", validate('{"t":"ok"}')?.t === "ok");
check("validate: unknown type dropped", validate('{"t":"exec"}') === null);
check("validate: mouse needs a known id", validate('{"t":"mouse","id":"home","kind":"move","x":0,"y":0}') === null);
check("validate: mouse clamps and numbers", (() => { const m = validate('{"t":"mouse","id":"tiktok","kind":"wheel","x":2,"y":"0.5","dy":"1e9"}'); return m && m.x === 1 && m.y === 0.5 && m.dy === 4000; })());
check("validate: key text is bounded", validate('{"t":"key","id":"instagram","kind":"down","key":"a","code":"KeyA","text":"aaaaaaaaaaaaaaaaaaaaa"}').text.length === 8);
check("validate: focus null is the grid", validate('{"t":"focus","id":null}').id === null);
check("validate: focus of an unknown id is refused", validate('{"t":"focus","id":"home"}') === null);
check("validate: connect needs a platform", validate('{"t":"connect","platform":"market"}') === null && validate('{"t":"connect","platform":"tiktok"}').platform === "tiktok");
check("validate: garbage", validate("{nope") === null && validate("42") === null);

// A real server in a child, so stdout can be checked.
const child = spawn(process.execPath, [join(here, "_fake-main.mjs")], { stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, ORGANIC_PORT: "" } });
let out = "";
child.stdout.on("data", (d) => { out += d; });
let err = "";
child.stderr.on("data", (d) => { err += d; });
const port = await until(() => { const m = /^PORT (\d+)\n/.exec(out); return m ? Number(m[1]) : null; }, 10000);
check("PORT n is the first stdout line", Boolean(port), JSON.stringify(out.slice(0, 40)));
await sleep(300);
check("stdout carries nothing else", out === `PORT ${port}\n`, JSON.stringify(out));
check("say lines go to stderr", err.includes("Reyna · the last one"));

const base = `http://127.0.0.1:${port}`;
const home = await fetch(base + "/");
const html = await home.text();
check("GET / serves the UI", home.status === 200 && html.includes("Connect your accounts") && html.includes("#39FF7A"));
check("nothing else is served", (await fetch(base + "/main.mjs")).status === 404 && (await fetch(base + "/../SPEC.md")).status === 404);

const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
const msgs = [];
ws.on("message", (d) => msgs.push(JSON.parse(String(d))));
await new Promise((r, j) => { ws.once("open", r); ws.once("error", j); });
await until(() => msgs.length >= 41, 5000);
check("state arrives first", msgs[0]?.t === "state" && msgs[0].phase === "setup" && msgs[0].screens[0].handle === "@t");
const says = msgs.filter((m) => m.t === "say");
check("the last 40 say lines follow, oldest first", says.length === 40 && says[0].what === "line 6" && says.at(-1).what === "the last one", `${says.length} ${says[0]?.what}`);

ws.send(JSON.stringify({ t: "exec", cmd: "rm" }));
ws.send(JSON.stringify({ t: "focus", id: "home" }));
ws.send("{garbage");
ws.send(JSON.stringify({ t: "focus", id: "instagram" }));
const echo = await until(() => msgs.find((m) => m.t === "echo"), 3000);
check("bad messages are dropped, a good one is routed", echo && echo.got.id === "instagram" && msgs.filter((m) => m.t === "echo").length === 1);

ws.send(JSON.stringify({ t: "ok" }));
const flipped = await until(() => msgs.find((m) => m.t === "state" && m.phase === "working"), 3000);
check("ok flips the phase and the state is broadcast", Boolean(flipped));

// A second window gets the working state on connect, plus the tail.
const ws2 = new WebSocket(`ws://127.0.0.1:${port}/ws`);
const msgs2 = [];
ws2.on("message", (d) => msgs2.push(JSON.parse(String(d))));
await until(() => msgs2.length >= 41, 5000);
check("a late window gets the current state", msgs2[0]?.t === "state" && msgs2[0].phase === "working");

const bad = await fetch(base + "/ws").catch(() => null);
check("a plain GET on /ws is not a page", !bad || bad.status === 404);

ws.close(); ws2.close();
child.stdin.end();
const code = await new Promise((r) => child.once("exit", r));
check("closing stdin ends the process cleanly", code === 0, String(code));

clearTimeout(guard);
console.log(failures() ? `\n${failures()} FAILED` : "\nall passed");
process.exit(failures() ? 1 : 0);

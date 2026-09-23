/**
 * The wire: the crew's code is served, the conversation goes both ways, and
 * nothing the brain asks for can hang it.
 */
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startBridge } from "../worker/bridge.mjs";
import { check, failures, until, sleep } from "./lib.mjs";

const dir = join(tmpdir(), "organic-bridge-test");
await rm(dir, { recursive: true, force: true });
await mkdir(dir, { recursive: true });
await writeFile(join(dir, "agent.built.js"), "/* the crew */ window.__organic = {};", "utf8");

const heard = [];
const bridge = await startBridge({ dir, port: 0, onMessage: (m) => heard.push(m) });
check("it took a port", bridge.port > 0, String(bridge.port));

const agent = await fetch(`http://127.0.0.1:${bridge.port}/agent.js`);
check("the crew's code is served", agent.status === 200 && (await agent.text()).includes("__organic"));
const nope = await fetch(`http://127.0.0.1:${bridge.port}/anything-else`);
check("nothing else is served", nope.status === 404);

// Nobody is connected yet: an ask must still settle.
const lonely = await bridge.ask("read", { what: "handle" }, { ms: 600 });
check("an ask with no phone settles, it does not hang", lonely.ok === false && /did not answer/.test(lonely.error), JSON.stringify(lonely));

const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}/ws`);
const inbox = [];
ws.on("message", (raw) => inbox.push(JSON.parse(String(raw))));
await until(() => ws.readyState === 1, 5000);
check("the phone connects", ws.readyState === 1);
// What it missed while it was away is waiting for it.
check("the queued ask arrives on connect", Boolean(await until(() => inbox.find((m) => m.act === "read"), 3000)));

// A real round trip.
const pending = bridge.ask("scroll", { px: 400 });
const asked = await until(() => inbox.find((m) => m.act === "scroll"), 3000);
check("the ask reaches the phone with an id", Boolean(asked) && typeof asked.id === "number");
ws.send(JSON.stringify({ t: "done", id: asked.id, ok: true, result: { y: 400 } }));
const answer = await pending;
check("the answer comes back to the caller", answer.ok === true && answer.result.y === 400, JSON.stringify(answer));

// The page speaking on its own.
ws.send(JSON.stringify({ t: "hello", url: "https://www.instagram.com/", platform: "instagram", signedIn: true, handle: "@x" }));
check("the page can speak unprompted", Boolean(await until(() => heard.find((m) => m.t === "hello"), 3000)));
ws.send(JSON.stringify({ t: "nonsense" }));
ws.send("not json at all");
await sleep(200);
check("rubbish is dropped, not forwarded", !heard.some((m) => m.t === "nonsense"));

const refused = await bridge.ask("delete-everything", {}, { ms: 500 });
check("an act that is not on the list is refused", refused.ok === false && /not an act/.test(refused.error));

// Window messages go out as-is; Swift handles them.
bridge.window("move", { dx: 10, dy: -4 });
const moved = await until(() => inbox.find((m) => m.t === "window"), 3000);
check("window messages go to the shell", Boolean(moved) && moved.do === "move" && moved.dx === 10);

ws.close();
await bridge.close();
console.log(failures() ? `\n${failures()} FAILED` : "\nall passed");
process.exit(failures() ? 1 : 0);

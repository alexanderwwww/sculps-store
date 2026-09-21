/** A main() with no Chrome: just the server, a state, and an "ok" that flips the phase. Used by 4-server. */
import { startServer } from "../worker/server.mjs";
import { say, onSay, recent } from "../worker/crew.mjs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
let phase = "setup";
const state = () => ({ t: "state", phase, build: 1, screens: [{ id: "instagram", platform: "instagram", state: "connected", handle: "@t" }], brief: null });
const got = [];
const server = await startServer({
  dir: join(here, "..", "worker"),
  state, recent: () => recent,
  onMessage: (m) => { got.push(m); if (m.t === "ok") { phase = "working"; server.broadcast(state()); } if (m.t === "focus") server.broadcast({ t: "echo", got: m }); if (m.t === "mouse" || m.t === "key") server.broadcast({ t: "echo", got: m }); },
});
onSay((l) => server.broadcast(l));
for (let i = 0; i < 45; i++) say("organic", "line " + i);
say("reyna", "the last one");
process.stdin.on("end", () => process.exit(0));
process.stdin.resume();

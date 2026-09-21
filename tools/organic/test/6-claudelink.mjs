/**
 * The app introduces itself to Claude — additively, and never destructively.
 */
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { linkClaude } from "../worker/claudelink.mjs";

let bad = 0;
const ok = (n, good, extra = "") => { console.log(`${good ? "  ok  " : "FAIL  "}${n}${extra ? " — " + extra : ""}`); if (!good) bad++; };
const URL_ = "https://example.test/organic/KEY/mcp";

const home = await mkdtemp(join(tmpdir(), "organic-link-"));
const code = join(home, ".claude.json");
const desk = join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");

// nothing installed
let r = await linkClaude(URL_, { home });
ok("no Claude, nothing written", r.every((x) => x.state === "no claude here"), JSON.stringify(r.map((x) => x.state)));

// Claude Code, with other things in it that must survive
await writeFile(code, JSON.stringify({
  numStartups: 41, theme: "dark",
  mcpServers: { wand: { type: "http", url: "https://wand.test/mcp" } },
  projects: { "/Users/alex/store": { history: ["one", "two"] } },
}, null, 2));
await mkdir(join(home, "Library", "Application Support", "Claude"), { recursive: true });
await writeFile(desk, JSON.stringify({ mcpServers: {} }, null, 2));

r = await linkClaude(URL_, { home });
ok("added to both", r.filter((x) => x.state === "added").length === 2, JSON.stringify(r));

const after = JSON.parse(await readFile(code, "utf8"));
ok("our server is there", after.mcpServers.organic?.url === URL_ && after.mcpServers.organic?.type === "http");
ok("the wand was left alone", after.mcpServers.wand?.url === "https://wand.test/mcp");
ok("everything else survived", after.numStartups === 41 && after.theme === "dark" && after.projects["/Users/alex/store"].history.length === 2);
await access(code + ".before-organic");
ok("a backup was made first", true);

const afterDesk = JSON.parse(await readFile(desk, "utf8"));
ok("the desktop app gets the stdio bridge", afterDesk.mcpServers.organic?.command === "npx" && afterDesk.mcpServers.organic.args.at(-1) === URL_, JSON.stringify(afterDesk.mcpServers.organic));

// twice is a no-op
r = await linkClaude(URL_, { home });
ok("running again changes nothing", r.every((x) => x.state === "already there"), JSON.stringify(r.map((x) => x.state)));

// a config that is not ours to understand is not touched
const junk = "{ this is not json";
await writeFile(code, junk);
r = await linkClaude(URL_, { home });
ok("unreadable config is left alone", String(r[0].state).startsWith("left alone"), r[0].state);
ok("...and not overwritten", (await readFile(code, "utf8")) === junk);

// a new address replaces the old entry, nothing else
await writeFile(code, JSON.stringify({ mcpServers: { organic: { type: "http", url: "https://old.test/mcp" }, keep: { url: "x" } } }, null, 2));
r = await linkClaude(URL_, { home });
const moved = JSON.parse(await readFile(code, "utf8"));
ok("a changed address is updated", moved.mcpServers.organic.url === URL_ && moved.mcpServers.keep.url === "x", r[0].state);

console.log(bad ? `\n${bad} FAILED` : "\nall passed");
process.exit(bad ? 1 : 0);

/**
 * Introduce the app to Claude, without Alex opening a terminal.
 *
 * The MCP address is how Claude reaches this app — reads what it found, sets
 * the brief, sends it an order, ships it a new build. Adding it by hand means
 * a command in a terminal, and Alex should never have to open one to use
 * something he already opened.
 *
 * So the app writes itself into Claude's own config. Three rules, because
 * this is somebody else's file:
 *
 *   it only ever ADDS — every other key is read, kept, and written back;
 *   it backs the file up the first time it touches it;
 *   it writes to a temporary file and renames, so a config is never left
 *   half-written even if the Mac loses power mid-save.
 *
 * If Claude is not installed, or the file is not ours to understand, it does
 * nothing and says so once.
 */
import { readFile, writeFile, rename, copyFile, access } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const NAME = "organic";

/** Where each Claude keeps its servers, and the shape each one expects. */
function targets(home = homedir()) {
  return [
    {
      what: "Claude Code",
      file: join(home, ".claude.json"),
      entry: (url) => ({ type: "http", url }),
    },
    {
      what: "Claude Desktop",
      file: join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json"),
      // The desktop app speaks stdio, so it reaches an http server through
      // the standard bridge. npx comes with the node the app already needs.
      entry: (url) => ({ command: "npx", args: ["-y", "mcp-remote", url] }),
    },
  ];
}

const exists = (p) => access(p).then(() => true, () => false);

/**
 * @returns [{ what, state: "added" | "already there" | "no claude here" | "left alone: <why>" }]
 */
export async function linkClaude(url, { home = homedir() } = {}) {
  const out = [];
  if (!url) return out;

  for (const t of targets(home)) {
    if (!(await exists(t.file))) {
      out.push({ what: t.what, state: "no claude here" });
      continue;
    }
    let raw;
    try {
      raw = await readFile(t.file, "utf8");
    } catch (e) {
      out.push({ what: t.what, state: `left alone: ${e.message}` });
      continue;
    }
    let config;
    try {
      config = JSON.parse(raw);
    } catch {
      // Not JSON we understand. Somebody else's file stays untouched.
      out.push({ what: t.what, state: "left alone: not readable as config" });
      continue;
    }
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      out.push({ what: t.what, state: "left alone: not readable as config" });
      continue;
    }

    const servers = config.mcpServers && typeof config.mcpServers === "object" ? config.mcpServers : {};
    const already = servers[NAME];
    if (already && JSON.stringify(already) === JSON.stringify(t.entry(url))) {
      out.push({ what: t.what, state: "already there" });
      continue;
    }

    config.mcpServers = { ...servers, [NAME]: t.entry(url) };
    try {
      if (!(await exists(t.file + ".before-organic"))) await copyFile(t.file, t.file + ".before-organic");
      const tmp = t.file + ".organic-tmp";
      // Two spaces, a trailing newline: the way both apps write it themselves.
      await writeFile(tmp, JSON.stringify(config, null, 2) + "\n", "utf8");
      await rename(tmp, t.file);
      out.push({ what: t.what, state: already ? "updated" : "added" });
    } catch (e) {
      out.push({ what: t.what, state: `left alone: ${e.message}` });
    }
  }
  return out;
}

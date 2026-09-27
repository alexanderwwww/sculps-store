/**
 * What it knows, and how it comes to know more.
 *
 * Markdown, on disk, nothing else. Two places are read and merged: the folder
 * shipped inside the app, and `knowledge/` in its own support directory, where
 * Alex drops the files we write from the videos he sends. His copy wins on a
 * name clash, so a shipped file can be overridden without a new build.
 *
 * The app does not interpret any of this. It is posted to the back end so that
 * Claude — which is where the thinking happens — reads the playbook before it
 * writes a title, a price or a reply. Knowledge that only the laptop can see
 * would be knowledge nobody uses.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

/** A file has to be markdown, and has to be worth sending. */
const LIMIT = 120_000;

async function fromDir(dir) {
  let names;
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const out = [];
  for (const name of names.sort()) {
    if (!/\.mdx?$/i.test(name)) continue;
    const path = join(dir, name);
    try {
      const info = await stat(path);
      if (!info.isFile() || info.size === 0) continue;
      const text = await readFile(path, "utf8");
      out.push({
        name,
        // Truncated rather than dropped: half a playbook beats none, and the
        // note says so out loud instead of silently losing the tail.
        text: text.length > LIMIT ? text.slice(0, LIMIT) + "\n\n…[truncated]" : text,
        bytes: info.size,
      });
    } catch {
      /* a file that cannot be read is skipped, not fatal */
    }
  }
  return out;
}

/**
 * Everything it knows, his copy winning over the shipped copy.
 * `dirs` is [shipped, his] — later wins.
 */
export async function readKnowledge(dirs) {
  const byName = new Map();
  for (const dir of dirs) {
    for (const file of await fromDir(dir)) byName.set(file.name, file);
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

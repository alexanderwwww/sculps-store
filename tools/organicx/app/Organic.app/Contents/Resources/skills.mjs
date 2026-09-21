/**
 * What the crew know.
 *
 * A skill is a markdown file under `skills/` — Desmond's bar for killing a
 * clip, Hana's house rules, Lena's treatments, Sam's limits. They live beside
 * the code rather than inside it because they change for the same reasons and
 * at the same speed, and rebuilding an app to teach somebody something would
 * be absurd.
 *
 * They arrive down the same channel the code does, so a new skill reaches a
 * running app in seconds without anybody downloading anything.
 *
 * The app reads them; it does not execute them. A skill is knowledge, and the
 * distinction matters: a file that arrives over a network and is then run is
 * a different and much worse thing than a file that arrives and is read.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

/** name -> { text, front } */
const loaded = new Map();

/**
 * A skill's front matter, if it has any.
 *
 * Deliberately tiny: `who` (which of the crew it belongs to) and `about` (one
 * line). Anything more structured than that and it stops being a thing a
 * person writes in thirty seconds, which is the whole point of it being
 * markdown.
 */
function parse(text) {
  const front = {};
  let body = text;
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (match) {
    body = text.slice(match[0].length);
    for (const line of match[1].split("\n")) {
      const at = line.indexOf(":");
      if (at > 0) front[line.slice(0, at).trim()] = line.slice(at + 1).trim();
    }
  }
  return { front, text: body.trim() };
}

/** Read everything under skills/, or nothing if there is no such folder. */
export async function load(runtimeDir) {
  const dir = join(runtimeDir, "skills");
  loaded.clear();
  let names = [];
  try {
    names = (await readdir(dir)).filter((n) => n.endsWith(".md"));
  } catch {
    return loaded; // none shipped yet, which is fine
  }
  for (const name of names) {
    try {
      const raw = await readFile(join(dir, name), "utf8");
      loaded.set(name.replace(/\.md$/, ""), parse(raw));
    } catch {
      /* A skill that will not read is skipped, not fatal. */
    }
  }
  return loaded;
}

/** Everything one of the crew knows, as text, or "" if they have been taught nothing. */
export function forWho(who) {
  const parts = [];
  for (const [name, skill] of loaded) {
    if ((skill.front.who ?? "").toLowerCase() === String(who).toLowerCase()) {
      parts.push(`# ${name}\n\n${skill.text}`);
    }
  }
  return parts.join("\n\n---\n\n");
}

export function get(name) {
  return loaded.get(name) ?? null;
}

/** What is loaded, for the status board. */
export function list() {
  return [...loaded.entries()].map(([name, s]) => ({
    name,
    who: s.front.who ?? null,
    about: s.front.about ?? null,
    words: s.text.split(/\s+/).length,
  }));
}

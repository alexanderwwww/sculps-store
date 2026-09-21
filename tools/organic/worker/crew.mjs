/**
 * The crew, and the one way any of them speaks.
 *
 * Every line anybody says goes through say(): it reaches the ticker in the
 * window, the control-plane log, and stderr, in that order, and nowhere
 * else. There is no console.log anywhere in the worker — stdout belongs to
 * the launcher, which reads exactly one line from it ("PORT n").
 */

/** The crew, in the order the work moves through them. "organic" is the app's own voice. */
export const CREW = [
  { key: "reyna", name: "Reyna", role: "research" },
  { key: "desmond", name: "Desmond", role: "validation" },
  { key: "nadia", name: "Nadia", role: "strategy" },
  { key: "kofi", name: "Kofi", role: "footage" },
  { key: "lena", name: "Lena", role: "editor" },
  { key: "marcus", name: "Marcus", role: "copy" },
  { key: "tomas", name: "Tomas", role: "sound" },
  { key: "ines", name: "Inés", role: "casting" },
  { key: "sam", name: "Sam", role: "operator" },
  { key: "bea", name: "Bea", role: "traffic" },
  { key: "yusuf", name: "Yusuf", role: "product" },
  { key: "carla", name: "Carla", role: "creative" },
  { key: "eli", name: "Eli", role: "provenance" },
  { key: "hana", name: "Hana", role: "brand" },
  { key: "rosa", name: "Rosa", role: "merchant" },
  { key: "organic", name: "Organic", role: "system" },
];

const byKey = new Map(CREW.map((c) => [c.key, c]));

/** "reyna" → "Reyna". An unknown key is shown as given rather than dropped. */
export function nameOf(key) {
  return byKey.get(String(key).toLowerCase())?.name ?? String(key);
}

/** The last 40 lines, oldest first — sent to every window that connects. */
export const recent = [];

const listeners = new Set();

/** Add a sink (ticker broadcast, cloud log). Returns a function that removes it. */
export function onSay(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * One line of the ticker. Plain language and always a name: "Sam · @spooky
 * connected" rather than a stack trace. Never throws — a sink that fails
 * must not stop the person speaking.
 */
export function say(who, what) {
  const line = { t: "say", who: nameOf(who), what: String(what ?? ""), at: Date.now() };
  recent.push(line);
  while (recent.length > 40) recent.shift();
  process.stderr.write(`${line.who} · ${line.what}\n`);
  for (const fn of listeners) {
    try {
      const r = fn(line);
      if (r && typeof r.catch === "function") r.catch(() => {});
    } catch {
      /* a sink's problem, not the speaker's */
    }
  }
  return line;
}

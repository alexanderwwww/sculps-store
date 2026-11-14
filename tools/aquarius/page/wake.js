// The wake word. Only the words AFTER "Aquarius" are a command; anything said without his name is ignored.
// Mirrored line for line in Shell/main.swift (parseWake). test/wake.test.mjs drives both shapes of input.
export function parseWake(transcript) {
  const t = String(transcript || "");
  const re = /\baquarius\b/gi;
  let m, last = -1, len = 0;
  while ((m = re.exec(t))) { last = m.index; len = m[0].length; }
  if (last < 0) return { woke: false, command: "" };
  const command = t.slice(last + len).replace(/^[\s,.:;!?\-–—]+/, "").replace(/[\s,.;!?\-–—]+$/, "").trim();
  return { woke: true, command };
}

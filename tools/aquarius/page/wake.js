// The wake word. Only the words AFTER "Aquarius" are a command; anything said without his name is ignored.
// Mirrored line for line in Shell/main.swift (parseWake). test/wake.test.mjs drives both shapes of input.
export function parseWake(transcript) {
  const t = String(transcript || "");
  const re = /\b(aquarius|aquarium|a quarius|aqua rius)\b/gi;
  let m, last = -1, len = 0;
  while ((m = re.exec(t))) { last = m.index; len = m[0].length; }
  if (last < 0) return { woke: false, command: "" };
  const command = t.slice(last + len).replace(/^[\s,.:;!?\-–—]+/, "").replace(/[\s,.;!?\-–—]+$/, "").trim();
  return { woke: true, command };
}

// Conversation mode (build 3): once he is called, everything Alex says for `convoMs` after his last line
// is a command too, without the name. "that's all" / "stop listening" ends it.
export function decide(transcript, convoUntil, now, convoMs = 120000) {
  const p = parseWake(transcript), inConvo = now < convoUntil;
  if (!p.woke && !inConvo) return { act: "ignore", convoUntil };
  const cmd = p.woke ? p.command : String(transcript || "").trim();
  if (/^(that'?s all|stop listening|bye aquarius|goodbye)\b/i.test(cmd)) return { act: "end", convoUntil: 0 };
  if (!cmd) return { act: "cancel", convoUntil: p.woke ? now + convoMs : convoUntil };
  return { act: "send", cmd, convoUntil: now + convoMs };
}

/**
 * The check that would have caught it.
 *
 * There is no Mac here, so main.swift ships without ever being compiled —
 * and a single wrong name (Delegate.startingHTML, when the class is Shell)
 * shipped as "Apple's build tools are missing or broken", because a compile
 * failure is all the launcher can see. This reads the file the way a compiler
 * would read the easy half of it: every capitalised name used as a type must
 * be one this file declares or one Apple ships, every brace must close, and a
 * multi-line string must not carry an escape that ends it early.
 */
import { readFile } from "node:fs/promises";

const APPLE = new Set(`
NSObject NSApp NSApplication NSWindow NSView NSEvent NSMenu NSMenuItem NSAlert NSImage NSColor NSRect NSSize NSPoint
NSText NSTextField NSScreen NSNotification NotificationCenter NSValue NSNumber NSString NSData NSError NSBezierPath
WKWebView WKWebViewConfiguration WKWebsiteDataStore WKUserContentController WKUserScript WKScriptMessage
WKScriptMessageHandler WKNavigation WKNavigationDelegate WKUIDelegate WKPreferences WKUserScriptInjectionTime
URL URLRequest URLSession URLSessionConfiguration URLSessionWebSocketTask URLSessionWebSocketDelegate URLResponse
HTTPURLResponse JSONSerialization Data Date DateFormatter TimeInterval DispatchQueue DispatchTime DispatchWorkItem
OperationQueue Timer Bundle FileManager ProcessInfo CommandLine CharacterSet String Int Double Bool CGFloat CGRect
CGSize CGPoint CGColor CALayer Array Dictionary Set Optional Result Error Any AnyObject Never Task MainActor Selector UUID
`.trim().split(/\s+/));

const file = process.argv[2];
const src = await readFile(file, "utf8");

const problems = [];

/* Types this file declares. */
const declared = new Set();
for (const m of src.matchAll(/^\s*(?:public |private |internal |final )*(?:class|struct|enum|protocol|extension|actor)\s+([A-Za-z_][\w]*)/gm)) {
  declared.add(m[1]);
}

/* Comments and strings are prose. A capitalised word in them is English, not
   a type, and reading them as code is how this check cries wolf. */
const code = src
  .replace(/"""[\s\S]*?"""/g, '""')
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/^\s*\/\/.*$/gm, " ")
  .replace(/(?<!:)\/\/.*$/gm, " ")
  .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
for (const body of src.matchAll(/"""([\s\S]*?)"""/g)) {
  if (/\\/.test(body[1])) problems.push(`a multi-line string carries a backslash — it will not end where you think: ...${body[1].slice(0, 40)}`);
}

/* Every Foo.bar where Foo is capitalised. */
const used = new Set();
for (const m of code.matchAll(/(?<![\w.])([A-Z][A-Za-z0-9_]*)\s*[.(]/g)) used.add(m[1]);
for (const name of used) {
  if (declared.has(name) || APPLE.has(name)) continue;
  problems.push(`nothing declares ${name} — a wrong name here is a build failure on the Mac and nothing else`);
}

/* Braces, quotes, parens. */
const counts = { "{": 0, "}": 0, "(": 0, ")": 0 };
let inString = false, inLine = false, inBlock = 0;
for (let i = 0; i < code.length; i++) {
  const c = code[i], next = code[i + 1];
  if (inLine) { if (c === "\n") inLine = false; continue; }
  if (inBlock) { if (c === "*" && next === "/") { inBlock--; i++; } else if (c === "/" && next === "*") { inBlock++; i++; } continue; }
  if (inString) { if (c === "\\") i++; else if (c === '"') inString = false; continue; }
  if (c === "/" && next === "/") { inLine = true; i++; continue; }
  if (c === "/" && next === "*") { inBlock = 1; i++; continue; }
  if (c === '"') { inString = true; continue; }
  if (c in counts) counts[c]++;
}
if (counts["{"] !== counts["}"]) problems.push(`braces do not balance: ${counts["{"]} open, ${counts["}"]} close`);
if (counts["("] !== counts[")"]) problems.push(`parentheses do not balance: ${counts["("]} open, ${counts[")"]} close`);
if (inString) problems.push("a string is left open");

if (problems.length) {
  for (const p of problems) console.log(`FAIL  ${p}`);
  process.exit(1);
}
console.log(`  ok  ${file}: ${declared.size} types declared, ${used.size} names used, all resolve`);

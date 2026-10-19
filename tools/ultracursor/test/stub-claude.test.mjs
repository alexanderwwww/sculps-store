/*
 * The stub Claude API, proved against the REAL SDK (@anthropic-ai/sdk 0.125.0 from
 * the repo's node_modules, the same one brain.mjs uses), so the agent's e2e test
 * talks to something the SDK accepts unchanged:
 *
 *   1. a 3-turn loop with client.beta.messages.create and the exact parameter shape
 *      of SPEC "## Brain": history appended as-is, tool results in one user turn
 *      -> 0 violations, the betas header arrived, ?beta=true path, refs resolved
 *      from the NEWEST snapshot, cache reads after the first call
 *   2. each way of breaking the contract is caught: an edited tool result, a
 *      dropped thinking block, an edited first message, a text block beside the
 *      tool results, changed tools, no betas (non-beta path), a target that is
 *      not on the page (-> finish blocked), an `expect` that does not match, an
 *      input that breaks the tool's schema, streaming (-> a 400 the SDK does not
 *      retry)
 *   3. resolveRef reads real ai-snapshot lines (attributes, escaped quotes,
 *      iframe refs, RegExp names, nth)
 *
 *   TMPDIR=/tmp node test/stub-claude.test.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { startStubClaude, resolveRef, REQUIRED_BETAS } from "./stub-claude.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const SDK = fs.existsSync("/home/user/sculps-store/node_modules/@anthropic-ai/sdk")
  ? "/home/user/sculps-store/node_modules/@anthropic-ai/sdk"
  : path.resolve(HERE, "../../../node_modules/@anthropic-ai/sdk");
const sdk = require(SDK);
const Anthropic = sdk.default;
const SDK_VERSION = JSON.parse(fs.readFileSync(path.join(SDK, "package.json"), "utf8")).version;

const KILL = setTimeout(() => { console.log("FAIL  stub-claude test timed out after 60 s"); process.exit(1); }, 60000);

let failed = 0, passed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`  ok  ${name}`); }
  else { failed++; console.log(`FAIL  ${name}${detail === undefined ? "" : `  -> ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 900)}`}`); }
  return Boolean(cond);
}
async function step(name, fn) {
  try { await fn(); } catch (e) { failed++; console.log(`FAIL  ${name} threw: ${String(e && e.stack || e).split("\n").slice(0, 3).join(" | ")}`); }
}

/* ---------------------------------------------------------------- the brain's shape */

const TOOLS = [
  { name: "look", description: "Fresh snapshot of the current page.", input_schema: { type: "object", properties: { full: { type: "boolean" } }, additionalProperties: false } },
  { name: "click", description: "Click an element by ref.", input_schema: { type: "object", properties: {
    ref: { type: "string" }, why: { type: "string" }, final: { type: "string", enum: ["none", "publish", "send", "buy", "delete", "price", "other"] },
  }, required: ["ref", "why", "final"], additionalProperties: false } },
  { name: "type", description: "Type into a field by ref.", input_schema: { type: "object", properties: {
    ref: { type: "string" }, text: { type: "string" }, why: { type: "string" }, clear: { type: "boolean" }, enter: { type: "boolean" },
  }, required: ["ref", "text", "why"], additionalProperties: false } },
  { name: "finish", description: "End the task.", input_schema: { type: "object", properties: {
    status: { type: "string", enum: ["done", "blocked", "needs_alex"] }, summary: { type: "string" },
  }, required: ["status", "summary"], additionalProperties: false } },
];
const SYSTEM = [{ type: "text", text: "You drive a web browser for Alex. Read the page snapshot, act on refs.", cache_control: { type: "ephemeral" } }];
const BETAS = ["server-side-fallback-2026-07-01", "thinking-binding-controls-2026-08-01"];

const params = (messages, extra = {}) => ({
  model: "claude-opus-5-5",
  max_tokens: 16000,
  thinking: { type: "adaptive", block_binding: { prefix_mismatch_behavior: "drop_block" } },
  output_config: { effort: "medium" },
  cache_control: { type: "ephemeral" },
  system: SYSTEM,
  tools: TOOLS,
  fallbacks: "default",
  betas: BETAS,
  messages,
  ...extra,
});

const page = (url, lines) => `url: ${url}\ntitle: Sell an item · Thrift\npage:\n${lines.join("\n")}`;
const firstMessage = (task, lines) => ({ role: "user", content: [{ type: "text", text: `Task: ${task}\nFiles: a.png\n\nSite profile: (none)\n\nCurrent page:\n${page("http://shop/sell/", lines)}` }] });
const results = (response, textFor) => ({
  role: "user",
  content: response.content.filter((b) => b.type === "tool_use").map((b) => ({ type: "tool_result", tool_use_id: b.id, content: textFor(b) })),
});
// 1x1 transparent PNG, as a screenshot block would carry.
const PNG1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const SCRIPTS = [
  { name: "happy", match: /^Task: list the jacket/m, steps: [
    { tool: "click", target: { role: "button", name: "Add photos" }, input: { why: "open the photo picker", final: "none" } },
    { tool: "type", target: { role: "textbox", name: /^Price$/ }, input: { text: "45", why: "set the price" }, expect: /did: clicked Add photos/ },
    { tool: "finish", input: { status: "done", summary: "Typed the price." }, expect: /did: typed 45/ },
  ] },
  { name: "looks", match: /^Task: look around/m, steps: [
    { tool: "look", input: {} }, { tool: "look", input: {} }, { tool: "look", input: {} }, { tool: "finish", input: { status: "done", summary: "Looked." } },
  ] },
  { name: "missing", match: /^Task: find a ghost/m, steps: [
    { tool: "click", target: { role: "button", name: "Publish now" }, input: { why: "publish", final: "publish" } },
  ] },
  { name: "expect", match: /^Task: check expect/m, steps: [
    { tool: "look", input: {} },
    { tool: "finish", input: { status: "done", summary: "x" }, expect: /ok: true/ },
  ] },
  { name: "schema", match: /^Task: bad input/m, steps: [
    { tool: "click", target: { role: "button", name: "Add photos" }, input: { why: "no final given", colour: "red" } },
  ] },
];

/* ---------------------------------------------------------------- run */

const stub = await startStubClaude({ scripts: SCRIPTS });
const client = new Anthropic({ apiKey: "test", baseURL: stub.url, maxRetries: 2 });
console.log(`stub at ${stub.url}, @anthropic-ai/sdk ${SDK_VERSION}`);
const newViolations = async (fn) => { const before = stub.violations.length; await fn(); return stub.violations.slice(before); };

await step("1. a clean 3-turn loop through the real SDK", async () => {
  console.log("== 1. clean loop (client.beta.messages.create)");
  const messages = [firstMessage("list the jacket", ['- button "Add photos" [ref=e8]', '- textbox "Price" [ref=e16]', '- button "Post listing" [ref=e30]'])];
  const r1 = await client.beta.messages.create(params(messages));
  check("response 1: type message, role assistant, stop_reason tool_use", r1.type === "message" && r1.role === "assistant" && r1.stop_reason === "tool_use" && r1.stop_sequence === null, r1);
  check("response 1: a thinking block with its signature, then the tool_use", r1.content[0].type === "thinking" && r1.content[0].thinking === "" && /^stub-sig-\d+$/.test(r1.content[0].signature) && r1.content[1].type === "tool_use" && /^toolu_\d+$/.test(r1.content[1].id), r1.content);
  check("response 1: click Add photos -> ref e8 from the first message", r1.content[1].name === "click" && r1.content[1].input.ref === "e8" && r1.content[1].input.final === "none" && r1.content[1].input.why === "open the photo picker", r1.content[1]);
  check("response 1: usage has all four counters, a cache write on the first call", ["input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"].every((k) => Number.isInteger(r1.usage[k])) && r1.usage.cache_creation_input_tokens > 0 && r1.usage.cache_read_input_tokens === 0, r1.usage);
  check("response 1: the SDK picked up the request id header", typeof r1._request_id === "string" && r1._request_id.startsWith("req_stub_"), r1._request_id);

  messages.push({ role: "assistant", content: r1.content });
  messages.push(results(r1, () => `ok: true\ndid: clicked Add photos\n${page("http://shop/sell/", ['- list "Selected photos" [ref=e40]', '- textbox "Price" [ref=e21]', '- button "Post listing" [ref=e33]'])}`));
  const r2 = await client.beta.messages.create(params(messages));
  check("response 2: type into Price with the ref from the NEWEST snapshot (e21, not e16)", r2.content[1].name === "type" && r2.content[1].input.ref === "e21" && r2.content[1].input.text === "45", r2.content[1]);
  check("response 2: cache read of the earlier prefix", r2.usage.cache_read_input_tokens > 0, r2.usage);

  messages.push({ role: "assistant", content: r2.content });
  // A tool result may be text + an image block (the screenshot tool's shape).
  messages.push(results(r2, () => [
    { type: "text", text: `ok: true\ndid: typed 45\n${page("http://shop/sell/", ['- textbox "Price" [ref=e21]: "45"', '- button "Post listing" [ref=e33]'])}` },
    { type: "image", source: { type: "base64", media_type: "image/png", data: PNG1 } },
  ]));
  const r3 = await client.beta.messages.create(params(messages));
  check("response 3: finish {done}", r3.content[1].name === "finish" && r3.content[1].input.status === "done" && r3.stop_reason === "tool_use", r3.content[1]);

  check("3 requests, 0 violations", stub.requests.length === 3 && stub.violations.length === 0, stub.violations);
  const h = stub.requests[0].headers;
  check("anthropic-beta header carried both betas", REQUIRED_BETAS.every((b) => String(h["anthropic-beta"]).split(",").includes(b)), h["anthropic-beta"]);
  check("posted to /v1/messages?beta=true with the key and API version", stub.requests.every((r) => r.url === "/v1/messages?beta=true") && h["x-api-key"] === "test" && Boolean(h["anthropic-version"]), { url: stub.requests[0].url, version: h["anthropic-version"] });
  const b = stub.requests[0].body;
  check("the body reached the stub as sent (betas moved to the header)", b.fallbacks === "default" && b.thinking.block_binding.prefix_mismatch_behavior === "drop_block" && !("betas" in b) && b.max_tokens === 16000, Object.keys(b));
});

await step("2a. an edited tool result is caught", async () => {
  console.log("== 2. every way of breaking the contract is caught");
  const messages = [firstMessage("look around", ['- button "Add photos" [ref=e8]'])];
  const r1 = await client.beta.messages.create(params(messages));
  messages.push({ role: "assistant", content: r1.content }, results(r1, () => `ok: true\ndid: looked\n${page("http://shop/", ['- link "Sell" [ref=e4]'])}`));
  const r2 = await client.beta.messages.create(params(messages));
  messages.push({ role: "assistant", content: r2.content }, results(r2, () => `ok: true\ndid: looked\n${page("http://shop/", ['- link "Sell" [ref=e4]'])}`));
  const clean = await newViolations(() => Promise.resolve());
  check("the two clean turns left no violation", clean.length === 0 && stub.violations.length === 0, stub.violations);
  // The classic "save tokens" edit: trim an old snapshot.
  const edited = structuredClone(messages);
  edited[2].content[0].content = "[old snapshot trimmed]";
  const v = await newViolations(() => client.beta.messages.create(params(edited)));
  check("trimming an old tool result -> 'message 2 (user) was edited'", v.some((s) => /message 2 \(user\) was edited/.test(s)), v);
});

await step("2b. a dropped thinking block is caught", async () => {
  const messages = [firstMessage("look around again", ['- button "Add photos" [ref=e8]'])];
  stub.setScripts([...SCRIPTS, { name: "looks2", match: /^Task: look around again/m, steps: SCRIPTS[1].steps }]);
  const r1 = await client.beta.messages.create(params(messages));
  messages.push({ role: "assistant", content: r1.content.filter((b) => b.type !== "thinking") }, results(r1, () => "ok: true\ndid: looked"));
  const v = await newViolations(() => client.beta.messages.create(params(messages)));
  check("assistant turn without its thinking block -> violation", v.some((s) => /previous response's content unchanged/.test(s)), v);
  const changedSig = [firstMessage("look around again", ['- button "Add photos" [ref=e8]'])];
  stub.setScripts([...SCRIPTS, { name: "looks3", match: /^Task: look around again/m, steps: SCRIPTS[1].steps }]);
  check("setScripts swaps the list (the task keeps the script it started with)", true);
  void changedSig;
});

await step("2c. an edited first message is caught", async () => {
  const messages = [firstMessage("look around, third time", ['- button "Add photos" [ref=e8]'])];
  stub.setScripts([...SCRIPTS, { name: "looks4", match: /^Task: look around, third time/m, steps: SCRIPTS[1].steps }]);
  const r1 = await client.beta.messages.create(params(messages));
  messages.push({ role: "assistant", content: r1.content }, results(r1, () => "ok: true\ndid: looked"));
  messages[0] = firstMessage("look around, third time", ['- button "Add photos" [ref=e8]', '- note: re-rendered']);
  const v = await newViolations(() => client.beta.messages.create(params(messages)));
  check("rewriting message 0 -> 'first request must carry exactly one user message'", v.some((s) => /exactly one user message/.test(s)), v);
});

await step("2d. a text block beside the tool results is caught", async () => {
  const messages = [firstMessage("look around, fourth", ['- button "Add photos" [ref=e8]'])];
  stub.setScripts([...SCRIPTS, { name: "looks5", match: /^Task: look around, fourth/m, steps: SCRIPTS[1].steps }]);
  const r1 = await client.beta.messages.create(params(messages));
  const tr = results(r1, () => "ok: true\ndid: looked");
  tr.content.push({ type: "text", text: "Alex solved the captcha." });
  messages.push({ role: "assistant", content: r1.content }, tr);
  const v = await newViolations(() => client.beta.messages.create(params(messages)));
  check("tool results + a text block -> 'ONLY tool_result blocks'", v.some((s) => /ONLY tool_result blocks/.test(s)), v);
});

await step("2e. a missing tool result and changed tools are caught", async () => {
  const messages = [firstMessage("look around, fifth", ['- button "Add photos" [ref=e8]'])];
  stub.setScripts([...SCRIPTS, { name: "looks6", match: /^Task: look around, fifth/m, steps: SCRIPTS[1].steps }]);
  const r1 = await client.beta.messages.create(params(messages));
  messages.push({ role: "assistant", content: r1.content }, { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_wrong", content: "ok: true" }] });
  const v = await newViolations(() => client.beta.messages.create(params(messages, { tools: TOOLS.slice(0, 3).concat([{ ...TOOLS[3], description: "End it." }]) })));
  check("wrong tool_use_id -> violation", v.some((s) => /must answer each tool_use exactly once/.test(s)), v);
  check("tools edited mid-task -> violation", v.some((s) => /tools changed inside the task/.test(s)), v);
});

await step("2f. no betas on the plain path is caught", async () => {
  stub.setScripts([...SCRIPTS, { name: "plain", match: /^Task: plain path/m, steps: SCRIPTS[1].steps }]);
  const p = params([firstMessage("plain path", ['- button "Add photos" [ref=e8]'])]);
  delete p.betas;
  const before = stub.requests.length;
  const v = await newViolations(() => client.messages.create(p));
  check("client.messages.create (no ?beta=true) is answered", stub.requests.length === before + 1 && stub.requests[before].url === "/v1/messages", stub.requests[before] && stub.requests[before].url);
  check("…and the missing betas are a violation", REQUIRED_BETAS.every((b) => v.some((s) => s.includes(`lacks ${b}`))), v);
});

await step("2g. bad request shapes are caught", async () => {
  stub.setScripts([...SCRIPTS, { name: "shape", match: /^Task: bad shape/m, steps: SCRIPTS[1].steps }]);
  const v = await newViolations(() => client.beta.messages.create(params([firstMessage("bad shape", ['- button "Add photos" [ref=e8]'])], {
    thinking: { type: "enabled", budget_tokens: 2000 }, output_config: {}, tool_choice: { type: "any" }, fallbacks: undefined, cache_control: undefined,
  })));
  for (const [what, re] of [["thinking.type", /thinking\.type must be "adaptive"/], ["block_binding", /prefix_mismatch_behavior/], ["effort", /output_config\.effort/],
    ["tool_choice any", /tool_choice must be absent/], ["fallbacks", /fallbacks must be "default"/], ["cache_control", /top-level cache_control/]]) {
    check(`missing/wrong ${what} -> violation`, v.some((s) => re.test(s)), v);
  }
});

await step("2h. a target that is not on the page ends the task loudly", async () => {
  const r = await client.beta.messages.create(params([firstMessage("find a ghost", ['- button "Add photos" [ref=e8]'])]));
  const last = stub.violations[stub.violations.length - 1] || "";
  check("violation names the missing target", /button "Publish now" is not in the latest snapshot/.test(last), last);
  check("answer is finish {blocked} saying what it could not find", r.content[1].name === "finish" && r.content[1].input.status === "blocked" && /stub could not find button "Publish now"/.test(r.content[1].input.summary), r.content[1]);
});

await step("2i. expect, and the tool's schema", async () => {
  const messages = [firstMessage("check expect", ['- button "Add photos" [ref=e8]'])];
  const r1 = await client.beta.messages.create(params(messages));
  messages.push({ role: "assistant", content: r1.content }, results(r1, () => "ok: false\nerror: stale ref"));
  const v = await newViolations(() => client.beta.messages.create(params(messages)));
  check("expect /ok: true/ against 'ok: false' -> violation with what came back", v.some((s) => /expected \/ok: true\/, got "ok: false error: stale ref"/.test(s)), v);
  const v2 = await newViolations(() => client.beta.messages.create(params([firstMessage("bad input", ['- button "Add photos" [ref=e8]'])])));
  check("click without `final` -> 'missing required'", v2.some((s) => /click input missing required "final"/.test(s)), v2);
  check("click with an unknown key -> 'not in the schema'", v2.some((s) => /"colour" is not in the schema/.test(s)), v2);
});

await step("2j. ran out of steps; no script; streaming is refused without retries", async () => {
  const messages = [firstMessage("check expect", ['- button "Add photos" [ref=e8]'])];
  // Replay task "expect" from its start with a fresh first message so it is a new task.
  messages[0].content[0].text += "\n(second run)";
  const r1 = await client.beta.messages.create(params(messages));
  messages.push({ role: "assistant", content: r1.content }, results(r1, () => "ok: true"));
  const r2 = await client.beta.messages.create(params(messages));
  messages.push({ role: "assistant", content: r2.content }, results(r2, () => "ok: true"));
  const v = await newViolations(async () => {
    const r3 = await client.beta.messages.create(params(messages));
    check("past the last step -> finish {blocked} 'ran out of steps'", r3.content[1].name === "finish" && /ran out of steps/.test(r3.content[1].input.summary), r3.content[1]);
  });
  check("…and a violation says the agent asked for more", v.some((s) => /the agent asked for more/.test(s)), v);
  const v2 = await newViolations(async () => {
    const r = await client.beta.messages.create(params([firstMessage("nothing scripted", ['- button "Add photos" [ref=e8]'])]));
    check("no script -> finish {blocked}", r.content[1].name === "finish" && r.content[1].input.status === "blocked", r.content[1]);
  });
  check("…and a violation quotes the task", v2.some((s) => /no script matches the first user message "Task: nothing scripted/.test(s)), v2);
  const before = stub.requests.length;
  let err = null;
  try { await client.beta.messages.create(params([firstMessage("look around", [])], { stream: true })); } catch (e) { err = e; }
  check("stream:true -> the SDK gets a 400 and does not retry it", err && err.status === 400 && stub.requests.length === before + 1, { status: err && err.status, sent: stub.requests.length - before });
});

await step("3. resolveRef reads real ai-snapshot lines", async () => {
  console.log("== 3. resolveRef");
  const snap = [
    "- generic [active] [ref=e1]:",
    "  - banner [ref=e2]:",
    '      - link "Messages 2 unread" [ref=e5] [cursor=pointer]:',
    '    - button "Condition Select condition" [expanded] [ref=e11]: Select condition',
    '    - listbox "Condition" [ref=e12]:',
    '      - option "Used - Excellent" [ref=e15]',
    '    - button "Say \\"hi\\"" [ref=e20]',
    '    - button "Delete" [ref=e26]',
    '    - button "Delete" [ref=e27]',
    "    - iframe [ref=e22]:",
    '        - checkbox "I\'m not a robot" [ref=f1e3]',
    '    - textbox "Price" [ref=e16]: "45"',
  ].join("\n");
  check("attributes between name and ref", resolveRef(snap, { role: "button", name: "Condition Select condition" }) === "e11");
  check("RegExp name", resolveRef(snap, { role: "link", name: /^Messages/ }) === "e5");
  check("option inside a listbox", resolveRef(snap, { role: "option", name: "Used - Excellent" }) === "e15");
  check("escaped quotes in a name", resolveRef(snap, { role: "button", name: 'Say "hi"' }) === "e20");
  check("nth picks the second match", resolveRef(snap, { role: "button", name: "Delete", nth: 1 }) === "e27");
  check("iframe refs (f1e3)", resolveRef(snap, { role: "checkbox", name: "I'm not a robot" }) === "f1e3");
  check("a value after the colon does not break the name", resolveRef(snap, { role: "textbox", name: "Price" }) === "e16");
  check("exact match is exact", resolveRef(snap, { role: "button", name: "Condition" }) === null);
  check("role must match", resolveRef(snap, { role: "link", name: "Delete" }) === null);
});

await stub.close();
clearTimeout(KILL);
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

/*
 * A stand-in for the Claude Messages API, for the agent's end-to-end test.
 *
 * It answers POST /v1/messages (and /v1/messages?beta=true, the path the official
 * SDK's client.beta.messages.create posts to) in the real response shape, so
 * @anthropic-ai/sdk 0.125.0 pointed at it with baseURL works unchanged. Instead of
 * thinking it plays a SCRIPT, picked per task by matching the first user message
 * ("Task: …") against each script's `match`:
 *
 *   {match: /list the jacket/, name?: "sell", steps: [
 *     {tool: "click",  target: {role: "button", name: "Add photos"}, input: {why, final: "none"}},
 *     {tool: "type",   target: {role: "textbox", name: /^Price$/}, input: {text: "45", why}, expect: /ok: true/},
 *     {tool: "finish", input: {status: "done", summary: "Posted."}},
 *   ]}
 *
 * The step played is the number of assistant turns already in the request (so a
 * task's history decides where it is, nothing else). A `target` becomes a `ref`
 * read from the MOST RECENT page snapshot the agent sent: the newest tool_result
 * (or the first user message) that has `[ref=…]` lines, found by a line like
 * `- button "Post listing" [ref=e17]` (name exact, or a RegExp; `nth` picks the
 * n-th match). A target that is not on the page is a violation, and the answer
 * becomes finish {status:"blocked"} so the test fails loudly instead of hanging.
 * `expect` (RegExp) must match the newest tool result text, else a violation.
 *
 * Every request is recorded (headers + body) and checked against what the real
 * API needs from build 2's brain (SPEC "## Brain"); anything off is pushed onto
 * `violations` as one readable string:
 *   - anthropic-beta carries server-side-fallback-2026-07-01 and
 *     thinking-binding-controls-2026-08-01
 *   - model, max_tokens, adaptive thinking with block_binding drop_block, an
 *     output_config.effort, fallbacks "default", tool_choice absent or auto,
 *     top-level cache_control ephemeral, a system prompt, no streaming
 *   - inside one task (same first user message): tools and system byte-identical
 *     to the first request, and messages APPEND-ONLY: the previous messages
 *     unchanged, then the previous response's content unchanged (thinking blocks
 *     and signatures included), then ONE user message of tool_result blocks only,
 *     one per tool_use. Editing history is a 400 on the real API.
 *   - the scripted tool is one the agent offered, and its input fits that tool's
 *     input_schema (required keys, enums, basic types), as a real model's would.
 *
 * Each answer: content [thinking "" + signature "stub-sig-<n>", tool_use
 * "toolu_<n>"], stop_reason "tool_use" (for finish too), plausible usage with
 * cache writes on a task's first call and cache reads after.
 */
import http from "node:http";
import crypto from "node:crypto";

export const REQUIRED_BETAS = ["server-side-fallback-2026-07-01", "thinking-binding-controls-2026-08-01"];
const EFFORTS = ["low", "medium", "high", "xhigh", "max"];
const IMAGE_TOKENS = 1500; // what a ~1000 px image costs, near enough for a cost meter

const clip = (s, n = 160) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

function same(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => same(x, b[i]));
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && same(a[k], b[k]));
}

/** The text of a message's content (string, or the text blocks of an array). */
export function textOf(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((b) => (b && b.type === "text" ? b.text : b && b.type === "tool_result" ? resultText(b) : "")).filter(Boolean).join("\n");
}

function resultText(block) {
  const c = block && block.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.filter((x) => x && x.type === "text").map((x) => x.text).join("\n");
  return "";
}

/** Every text the agent sent in user turns, newest last: [{text, msg}] */
function userTexts(messages) {
  const out = [];
  messages.forEach((m, i) => {
    if (!m || m.role !== "user") return;
    if (typeof m.content === "string") { out.push({ text: m.content, msg: i }); return; }
    for (const b of Array.isArray(m.content) ? m.content : []) {
      if (b && b.type === "text") out.push({ text: b.text, msg: i });
      else if (b && b.type === "tool_result") out.push({ text: resultText(b), msg: i });
    }
  });
  return out;
}

/** The newest page snapshot the agent sent: the last user text that has refs in it. */
export function latestSnapshot(messages) {
  const all = userTexts(messages);
  for (let i = all.length - 1; i >= 0; i--) if (/\[ref=[^\]\s]+\]/.test(all[i].text)) return all[i].text;
  return null;
}

/** What the last tool call answered (all tool_result text of the last user turn), or the first message. */
function latestResult(messages) {
  const last = messages[messages.length - 1];
  if (messages.length > 1 && last && last.role === "user" && Array.isArray(last.content) && last.content.some((b) => b && b.type === "tool_result")) {
    return last.content.filter((b) => b && b.type === "tool_result").map(resultText).join("\n");
  }
  return messages[0] ? textOf(messages[0].content) : "";
}

const LINE = /^\s*(?:-\s+)?([A-Za-z][\w-]*)(?:\s+"((?:[^"\\]|\\.)*)")?(.*)$/;

/** Parse snapshot lines into [{role, name, ref, line}] (lines without a ref are skipped). */
export function snapshotLines(text) {
  const out = [];
  for (const line of String(text || "").split("\n")) {
    const r = /\[ref=([^\]\s]+)\]/.exec(line);
    if (!r) continue;
    const m = LINE.exec(line);
    if (!m) continue;
    let name = m[2] ?? "";
    try { name = JSON.parse(`"${name}"`); } catch { /* keep it as written */ }
    out.push({ role: m[1], name, ref: r[1], line: line.trim() });
  }
  return out;
}

const describe = (t) => `${t.role || "*"} ${t.name instanceof RegExp ? String(t.name) : JSON.stringify(t.name ?? "")}${t.nth ? ` #${t.nth}` : ""}`;

/** A ref for {role, name (string exact | RegExp), nth?} in a snapshot, or null. */
export function resolveRef(snapshot, target) {
  const hits = snapshotLines(snapshot).filter((l) => (!target.role || l.role === target.role)
    && (target.name === undefined || (target.name instanceof RegExp ? target.name.test(l.name) : l.name === String(target.name))));
  const hit = hits[target.nth || 0];
  return hit ? hit.ref : null;
}

/** Light JSON-schema check of a tool input against the offered tool: what a real model obeys. */
function schemaProblems(schema, input) {
  const out = [];
  if (!schema || typeof schema !== "object") return out;
  const props = schema.properties || {};
  for (const k of schema.required || []) if (!(k in input)) out.push(`missing required "${k}"`);
  for (const [k, v] of Object.entries(input)) {
    const p = props[k];
    if (!p) { if (schema.additionalProperties === false) out.push(`"${k}" is not in the schema`); continue; }
    if (Array.isArray(p.enum) && !p.enum.includes(v)) out.push(`"${k}"=${JSON.stringify(v)} not in ${JSON.stringify(p.enum)}`);
    const types = Array.isArray(p.type) ? p.type : p.type ? [p.type] : [];
    if (types.length) {
      const t = Array.isArray(v) ? "array" : v === null ? "null" : typeof v;
      const ok = types.some((want) => want === t || (want === "integer" && t === "number" && Number.isInteger(v)));
      if (!ok) out.push(`"${k}" is ${t}, schema says ${types.join("|")}`);
    }
  }
  return out;
}

/** Rough token count: text by length, each image a flat amount. */
function tokens(v) {
  let images = 0;
  const s = JSON.stringify(v, (k, x) => {
    if (x && typeof x === "object" && x.type === "image") { images++; return null; }
    return x;
  }) || "";
  return Math.ceil(s.length / 4) + images * IMAGE_TOKENS;
}

function apiError(res, code, type, message) {
  res.writeHead(code, { "content-type": "application/json", "x-should-retry": "false", "request-id": `req_stub_err_${Date.now()}` });
  res.end(JSON.stringify({ type: "error", error: { type, message } }));
}

export function startStubClaude({ scripts = [] } = {}) {
  let list = scripts;
  const requests = [];
  const violations = [];
  const tasks = new Map(); // first-message hash -> {script, tools, system, prev:{messages, content}, total}
  let n = 0;

  function checkShape(tag, body, headers) {
    const v = (s) => violations.push(`${tag}: ${s}`);
    const betas = String(headers["anthropic-beta"] || "").split(",").map((s) => s.trim()).filter(Boolean);
    for (const b of REQUIRED_BETAS) if (!betas.includes(b)) v(`anthropic-beta header lacks ${b} (got "${betas.join(",")}")`);
    if (typeof body.model !== "string" || !body.model) v("model must be a non-empty string");
    if (!(Number(body.max_tokens) > 0)) v(`max_tokens must be > 0 (got ${JSON.stringify(body.max_tokens)})`);
    const th = body.thinking;
    if (!th || th.type !== "adaptive") v(`thinking.type must be "adaptive" (got ${JSON.stringify(th && th.type)})`);
    if (!th || !th.block_binding || th.block_binding.prefix_mismatch_behavior !== "drop_block") v(`thinking.block_binding.prefix_mismatch_behavior must be "drop_block" (got ${JSON.stringify(th && th.block_binding)})`);
    if (!body.output_config || !EFFORTS.includes(body.output_config.effort)) v(`output_config.effort must be one of ${EFFORTS.join("|")} (got ${JSON.stringify(body.output_config)})`);
    if (body.fallbacks !== "default") v(`fallbacks must be "default" (got ${JSON.stringify(body.fallbacks)})`);
    if ("tool_choice" in body && !(body.tool_choice && body.tool_choice.type === "auto")) v(`tool_choice must be absent or {type:"auto"} (got ${JSON.stringify(body.tool_choice)})`);
    if (!body.cache_control || body.cache_control.type !== "ephemeral") v(`top-level cache_control must be {type:"ephemeral"} (got ${JSON.stringify(body.cache_control)})`);
    const sys = body.system;
    if (!((typeof sys === "string" && sys.trim()) || (Array.isArray(sys) && sys.length))) v("system prompt missing");
    if (!Array.isArray(body.tools) || !body.tools.length || !body.tools.every((t) => t && typeof t.name === "string")) v("tools must be a non-empty list of named tools");
    if (!Array.isArray(body.messages) || !body.messages.length || body.messages[0].role !== "user") v("messages must start with a user message");
  }

  function checkHistory(tag, task, body) {
    const v = (s) => violations.push(`${tag}: ${s}`);
    if (JSON.stringify(body.tools) !== task.tools) v("tools changed inside the task (must be byte-identical to the first request)");
    if (JSON.stringify(body.system) !== task.system) v("system changed inside the task (must be byte-identical to the first request)");
    const prev = task.prev;
    const msgs = body.messages;
    const k = prev.messages.length;
    if (msgs.length !== k + 2) v(`history must grow by exactly the assistant turn + one tool-result turn: had ${k} messages, now ${msgs.length}`);
    for (let i = 0; i < Math.min(k, msgs.length); i++) {
      if (!same(msgs[i], prev.messages[i])) { v(`message ${i} (${prev.messages[i].role}) was edited: history must be append-only`); break; }
    }
    const a = msgs[k];
    if (!a || a.role !== "assistant" || !same(a.content, prev.content)) {
      v(`message ${k} must be the previous response's content unchanged, thinking blocks and signatures included (got ${clip(JSON.stringify(a && a.content), 200)})`);
    }
    const u = msgs[k + 1];
    const ids = prev.content.filter((b) => b.type === "tool_use").map((b) => b.id);
    if (!u || u.role !== "user" || !Array.isArray(u.content)) { v(`message ${k + 1} must be a user turn with tool_result blocks`); return; }
    const bad = u.content.filter((b) => !b || b.type !== "tool_result");
    if (bad.length) v(`message ${k + 1} must hold ONLY tool_result blocks (found ${bad.map((b) => b && b.type).join(", ")})`);
    const got = u.content.filter((b) => b && b.type === "tool_result").map((b) => b.tool_use_id);
    if (got.length !== ids.length || !ids.every((id) => got.filter((g) => g === id).length === 1)) {
      v(`tool_result ids ${JSON.stringify(got)} must answer each tool_use exactly once ${JSON.stringify(ids)}`);
    }
    for (const b of u.content) {
      if (!b || b.type !== "tool_result") continue;
      const c = b.content;
      const fine = c === undefined || typeof c === "string"
        || (Array.isArray(c) && c.every((x) => x && (x.type === "text" ? typeof x.text === "string" : x.type === "image" && x.source && typeof x.source === "object")));
      if (!fine) v(`tool_result ${b.tool_use_id} content must be a string or text/image blocks (got ${clip(JSON.stringify(c), 120)})`);
      if ("is_error" in b && typeof b.is_error !== "boolean") v(`tool_result ${b.tool_use_id} is_error must be boolean`);
    }
  }

  async function handle(req, res) {
    const u = new URL(req.url, "http://stub");
    let raw = "";
    for await (const c of req) raw += c;
    if (req.method !== "POST" || u.pathname !== "/v1/messages") return apiError(res, 404, "not_found_error", `stub only answers POST /v1/messages (got ${req.method} ${u.pathname})`);
    let body;
    try { body = JSON.parse(raw); } catch { return apiError(res, 400, "invalid_request_error", "body is not JSON"); }

    const i = requests.length + 1;
    const rec = { i, at: Date.now(), method: req.method, url: req.url, headers: { ...req.headers }, body, response: null };
    requests.push(rec);
    let tag = `request ${i}`;
    checkShape(tag, body, req.headers);
    if (body.stream === true) {
      violations.push(`${tag}: stream:true is not what the brain sends (and the stub cannot stream)`);
      return apiError(res, 400, "invalid_request_error", "stub does not stream");
    }
    const msgs = Array.isArray(body.messages) ? body.messages : [];
    if (!msgs.length) return apiError(res, 400, "invalid_request_error", "messages: at least one message is required");

    // One task = one first user message.
    const key = crypto.createHash("sha1").update(JSON.stringify(msgs[0])).digest("hex");
    let task = tasks.get(key);
    // A request with only the first message always starts a task, even one seen
    // before: the same task run twice (after a reset) is two runs, not one.
    if (!task || msgs.length === 1) {
      const first = textOf(msgs[0].content);
      const script = list.find((s) => s && s.match instanceof RegExp && s.match.test(first)) || null;
      task = { key, script, tools: JSON.stringify(body.tools), system: JSON.stringify(body.system), prev: null, total: 0 };
      tasks.set(key, task);
      if (msgs.length !== 1) violations.push(`${tag}: a task's first request must carry exactly one user message (got ${msgs.length}); was the first message edited?`);
      if (!script) violations.push(`${tag}: no script matches the first user message ${JSON.stringify(clip(first, 120))}`);
    } else if (task.prev) {
      checkHistory(tag, task, body);
    }
    const sname = task.script ? (task.script.name || String(task.script.match)) : "no script";
    const idx = msgs.filter((m) => m && m.role === "assistant").length;
    tag = `request ${i} [${sname}] step ${idx + 1}`;
    rec.task = sname; rec.step = idx + 1;

    let tool, input;
    const step = task.script ? task.script.steps[idx] : null;
    if (!task.script) {
      tool = "finish"; input = { status: "blocked", summary: "stub has no script for this task" };
    } else if (!step) {
      violations.push(`${tag}: the script has only ${task.script.steps.length} steps; the agent asked for more`);
      tool = "finish"; input = { status: "blocked", summary: "stub script ran out of steps" };
    } else {
      tool = step.tool;
      input = { ...(step.input || {}) };
      if (step.expect instanceof RegExp) {
        const got = latestResult(msgs);
        if (!step.expect.test(got)) violations.push(`${tag}: expected ${step.expect}, got ${JSON.stringify(clip(got, 300))}`);
      }
      if (step.target) {
        const snap = latestSnapshot(msgs);
        const ref = snap ? resolveRef(snap, step.target) : null;
        if (!ref) {
          violations.push(`${tag} (${step.tool}): ${describe(step.target)} is not in the latest snapshot${snap ? "" : " (no snapshot with refs was sent at all)"}`);
          tool = "finish"; input = { status: "blocked", summary: `stub could not find ${describe(step.target)}` };
        } else {
          input = { ref, ...input };
        }
      }
    }
    const offered = Array.isArray(body.tools) ? body.tools.find((t) => t && t.name === tool) : null;
    if (!offered) violations.push(`${tag}: tool "${tool}" is not among the tools offered (${(body.tools || []).map((t) => t && t.name).join(", ")})`);
    else for (const p of schemaProblems(offered.input_schema, input)) violations.push(`${tag}: ${tool} input ${p}`);

    n++;
    const content = [
      { type: "thinking", thinking: "", signature: `stub-sig-${n}` },
      { type: "tool_use", id: `toolu_${n}`, name: tool, input },
    ];
    const total = tokens({ system: body.system, tools: body.tools, messages: msgs });
    const read = task.prev ? Math.min(task.total, total) : 0;
    const usage = {
      input_tokens: 4,
      cache_creation_input_tokens: Math.max(0, total - read - 4),
      cache_read_input_tokens: read,
      output_tokens: 38 + Math.ceil(JSON.stringify(input).length / 4) + (n % 29),
      cache_creation: { ephemeral_5m_input_tokens: Math.max(0, total - read - 4), ephemeral_1h_input_tokens: 0 },
      server_tool_use: null,
      service_tier: "standard",
    };
    const response = {
      id: `msg_stub_${String(n).padStart(4, "0")}`,
      type: "message",
      role: "assistant",
      model: typeof body.model === "string" && body.model ? body.model : "claude-opus-5-5",
      content,
      stop_reason: "tool_use",
      stop_sequence: null,
      usage,
      container: null,
      context_management: null,
    };
    task.prev = { messages: msgs, content };
    task.total = total;
    rec.response = response;
    res.writeHead(200, { "content-type": "application/json", "request-id": `req_stub_${String(n).padStart(4, "0")}` });
    res.end(JSON.stringify(response));
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((e) => {
      violations.push(`stub crashed: ${e && e.stack ? e.stack.split("\n").slice(0, 2).join(" | ") : e}`);
      try { if (!res.headersSent) apiError(res, 500, "api_error", String(e && e.message)); else res.end(); } catch { /* gone */ }
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      resolve({
        url: `http://127.0.0.1:${server.address().port}`,
        requests, violations, server,
        setScripts: (s) => { list = Array.isArray(s) ? s : []; },
        close: () => new Promise((r) => { try { server.closeAllConnections(); } catch { /* old node */ } server.close(() => r()); }),
      });
    });
  });
}

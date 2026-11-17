// Aquarius helper MCP (JSON-RPC 2.0 over streamable HTTP): POST /api/aq/helper/<AQ_HELPER_KEY>/mcp
// ChatGPT, Codex and Grok connect with this link. LABOR ONLY: read state, read the briefing, post evidence, propose a bot
// (pending until the Council), work the task board, sit on the Council (cases, votes), raise a fast alert and talk in the
// war room (seat.mjs). No tool can trade, change limits, touch the kill switch, read secrets or create an approved bot: a
// vote is one soft rule, an alert only makes the engine check a position's own stop/target at a real quote.
// Every call is logged with the helper's name.
import { db } from "../db.mjs";
import { submitPick } from "./lanes.mjs";
import { councilCases, castVote, fastAlert, chatPost, chatRead, SEATS, TESTERS, CHAT_MAX } from "./seat.mjs";
import { buildState, briefing, helperMessage, proposeBot, ensureSeed, HELPERS, ROLE_DEPT } from "./engine.mjs";

const S = (d, props = {}, req = []) => ({ type: "object", properties: { helper: { type: "string", enum: HELPERS, description: "who is calling" }, ...props }, required: req, additionalProperties: false, description: d });
export const HELPER_TOOLS = [
  { name: "aq_state", description: "Read the Aquarius paper-trading state (equity, positions, council, departments, market). Read only.", inputSchema: S("") },
  { name: "aq_briefing", description: "The daily desk briefing text (BRIEFING FORMAT of the Grok desk).", inputSchema: S("") },
  { name: "aq_post_evidence", description: "Post evidence. Stored labelled, never a trade trigger. section 'x' = X/Twitter talk (always CLAIMED).",
    inputSchema: S("", { role: { type: "string", enum: Object.keys(ROLE_DEPT) }, text: { type: "string" }, label: { type: "string", enum: ["VERIFIED", "REPORTED", "CLAIMED", "INFERRED"] }, section: { type: "string", description: "'x' for X/Twitter, else a dept id" } }, ["role", "text", "label"]) },
  { name: "aq_propose_bot", description: "Propose a new worker. It stays pending until the Council approves it on a tick (free code bots only).",
    inputSchema: S("", { name: { type: "string" }, dept: { type: "string" }, job: { type: "string" }, rules: { type: "string" }, skills: { type: "array", items: { type: "string" } }, power: { type: "string" } }, ["name", "dept", "job"]) },
  { name: "aq_submit_pick", description: "Submit your own complete trade idea. It is NEVER traded on the real ledger: the Council judges it for the record and it is paper-tracked in your own lane (LANE:<helper>) with real prices and measured costs. Your lane's result sets the weight of your evidence.",
    inputSchema: S("", { symbol: { type: "string" }, mint: { type: "string", description: "Solana token address" }, entry: { type: "number", description: "your intended entry price in USD (recorded; the lane enters at the live price)" }, stopPct: { type: "number" }, targetPct: { type: "number" }, thesis: { type: "string" }, labels: { type: "array", items: { type: "string", enum: ["VERIFIED", "REPORTED", "CLAIMED", "INFERRED"] } } }, ["mint", "stopPct", "targetPct", "thesis", "labels"]) },
  { name: "aq_list_tasks", description: "Open tasks on the board (research, writing, code suggestions).", inputSchema: S("", { status: { type: "string", enum: ["open", "done"] } }) },
  { name: "aq_task_done", description: "Hand in a task result.", inputSchema: S("", { id: { type: "integer" }, result: { type: "string" } }, ["id", "result"]) },
  { name: "aq_council_cases", description: "Your Council seat: the cases open for a vote right now. Every coin the Council judged in the last 10 minutes (tier, strategy, signal strength, measured round trip, ATR5, stop/target plan, soft score, verdict with its deciding number, whether the hard blocks are clear) and every open position (entry, now, stop, target, age). Read only.", inputSchema: S("") },
  { name: "aq_council_vote", description: "Cast your Council vote on a case. BUY or SKIP on a judged coin: one soft rule in its score for 5 minutes (it can lift a partial setup to a normal entry or keep the desk out; it never passes a hard block, the cost gate, cash, slots or the kill switch and never changes the size). EXIT on an open position: a warning, the engine checks it with a real sell quote on its next tick and applies its own exit-vote rule. One live vote per coin (a newer one replaces it). Every vote is graded and your weight follows your record.",
    inputSchema: S("", { mint: { type: "string", description: "Solana token address from aq_council_cases" }, vote: { type: "string", enum: ["BUY", "SKIP", "EXIT"] }, confidence: { type: "number", minimum: 0, maximum: 1 }, reason: { type: "string" }, labels: { type: "array", items: { type: "string", enum: ["VERIFIED", "REPORTED", "CLAIMED", "INFERRED"] } } }, ["mint", "vote", "confidence", "reason", "labels"]) },
  { name: "aq_alert", description: "Fast alert on an OPEN position between minute ticks. It is not trusted: the engine takes a real sell quote at once and closes the position only if its own stop or target is truly met at that quote; otherwise it answers 'alert not confirmed'. For a dying story use aq_council_vote EXIT instead.",
    inputSchema: S("", { mint: { type: "string" }, kind: { type: "string", enum: ["stop", "target", "narrative_dead"] }, price: { type: "number", description: "the USD price you saw" }, note: { type: "string" } }, ["mint", "kind"]) },
  { name: "aq_chat_post", description: `War room: post a message to everyone or to one of alex, claude, grok, chatgpt, codex. ${CHAT_MAX} characters at most. Talk only: nothing here is an order to the engine.`,
    inputSchema: S("", { text: { type: "string" }, to: { type: "string", enum: ["alex", "claude", "grok", "chatgpt", "codex"] } }, ["text"]) },
  { name: "aq_training_report", description: "Training mode: report the running totals of YOUR OWN paper data collection (the simulation on your machine). Alex sees them in a GROK window on his panel under the main training numbers. Send it every sweep. Totals since you started, not the last batch. Paper only: nothing here trades or moves money.",
    inputSchema: S("", { trades: { type: "integer" }, won: { type: "integer" }, lost: { type: "integer" }, walletSol: { type: "number", description: "your paper wallet now, started at 1000" }, perMinute: { type: "number" }, best: { type: "string", description: "your best rule so far and its numbers" }, worst: { type: "string" }, note: { type: "string", description: "one lesson from this sweep" } }, ["trades", "won", "lost"]) },
  { name: "aq_chat_read", description: "War room: read messages (the last 30, or everything after message id `since`) and mark them read for you.", inputSchema: S("", { since: { type: "integer" } }) },
];
const NAMED = ["aq_post_evidence", "aq_submit_pick", "aq_council_vote", "aq_alert", "aq_chat_post", "aq_chat_read", "aq_training_report"]; // tools that need to know who is calling
// The bot a helper proposes through: the Learning dept's experiment scheduler (an approved seed bot).
const PROPOSER = "ln.experiments";
const text = (t) => [{ type: "text", text: typeof t === "string" ? t : JSON.stringify(t) }];

async function callTool(env, name, a, helper) {
  const d = db(env);
  if (name === "aq_state") return text(await buildState(env));
  if (name === "aq_briefing") return text(await briefing(env, SEATS.includes(helper) || TESTERS.includes(helper) ? helper : null));
  if (name === "aq_council_cases") return text(await councilCases(env));
  if (name === "aq_council_vote") { const r = await castVote(env, helper, a); if (r.error) throw new Error(r.error); return text(r.vote); }
  if (name === "aq_training_report") {
    const n = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null), s = (v) => (typeof v === "string" ? v.slice(0, 300) : null);
    if (n(a.trades) == null || n(a.won) == null || n(a.lost) == null) throw new Error("trades, won and lost are needed, as numbers");
    const row = { trades: Math.floor(n(a.trades)), won: Math.floor(n(a.won)), lost: Math.floor(n(a.lost)), walletSol: n(a.walletSol), perMinute: n(a.perMinute), best: s(a.best), worst: s(a.worst), note: s(a.note), at: new Date().toISOString() };
    const all = (await d.one(`SELECT v FROM mob_aq_state WHERE k='helper_training'`))?.v || {}; all[helper] = row;
    await d.q(`INSERT INTO mob_aq_state (k, v, at) VALUES ('helper_training', $1, now()) ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v, at=now()`, [JSON.stringify(all)]);
    return text({ saved: row, shown: "in the GROK window on the panel" });
  }
  if (name === "aq_alert") { const r = await fastAlert(env, helper, a); if (r.error) throw new Error(r.error); return text(r.alert); }
  // the sender is the caller's own name, never a field of the message: a helper cannot speak as alex or claude here
  if (name === "aq_chat_post") { const r = await chatPost(env, helper, { text: a.text, to: a.to }); if (r.error) throw new Error(r.error); return text({ posted: r.message }); }
  if (name === "aq_chat_read") { const r = await chatRead(env, helper, { since: a.since ?? null }); if (r.error) throw new Error(r.error); return text(r); }
  if (name === "aq_post_evidence") {
    const sec = String(a.section || "").toLowerCase();
    const r = await helperMessage(env, { from: helper, role: a.role, text: a.text, labels: [a.label], channel: sec === "x" || sec === "twitter" ? "x" : null });
    if (r.error) throw new Error(r.error);
    return text({ stored: r.message.id, evidence: true, trigger: false });
  }
  if (name === "aq_propose_bot") {
    const { name: n, dept, job, rules, skills, power } = a; // anything else (approved, status...) is ignored
    const r = await proposeBot(env, PROPOSER, { name: n, dept, job, rules: `${rules || ""} (proposed by ${helper})`.trim(), skills, power });
    if (r.error) throw new Error(r.error);
    return text({ id: r.bot.id, approved: false, note: "pending: the Council decides on the next tick" });
  }
  if (name === "aq_submit_pick") {
    const r = await submitPick(env, helper, a);
    if (r.error) throw new Error(r.error);
    return text({ ...r.pick, note: "paper lane only; the Council judges it on the next tick" });
  }
  if (name === "aq_list_tasks") {
    const st = a.status === "done" ? "done" : "open";
    return text({ tasks: await d.q(`SELECT id, kind, title, detail, created_by, status, result, done_by, created_at FROM mob_aq_tasks WHERE status=$1 ORDER BY id LIMIT 50`, [st]) });
  }
  if (name === "aq_task_done") {
    const res = typeof a.result === "string" ? a.result.trim().slice(0, 8000) : "";
    if (!res) throw new Error("result is required");
    const r = await d.one(`UPDATE mob_aq_tasks SET status='done', result=$2, done_by=$3, done_at=now() WHERE id=$1 AND status='open' RETURNING id`, [Number(a.id), res, helper]);
    if (!r) throw new Error("no open task with that id");
    await d.q(`INSERT INTO mob_aq_brain (dept, kind, text) VALUES ('learning','task',$1)`, [`${helper} finished task #${r.id}: ${res.slice(0, 200)}`]);
    return text({ done: r.id });
  }
  throw new Error(`no such tool: ${name}`);
}

async function rpc(env, b, session) {
  const id = b && b.id !== undefined ? b.id : null, m = b && b.method, d = db(env);
  const reply = (result) => ({ jsonrpc: "2.0", id, result });
  if (m === "initialize") {
    const who = String(b.params?.clientInfo?.name || "").toLowerCase();
    const helper = HELPERS.find((h) => who.includes(h)) || (who.includes("openai") ? "chatgpt" : who.includes("xai") ? "grok" : "unknown");
    await d.q(`INSERT INTO mob_aq_helper_log (helper, session, tool, args, ok) VALUES ($1,$2,'initialize',$3,true)`, [helper, session.id, JSON.stringify({ clientInfo: b.params?.clientInfo || null })]);
    session.helper = helper;
    return reply({ protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "aquarius-helpers", title: "Aquarius helpers", version: "1.0.0" } });
  }
  if (m === "notifications/initialized") return null;
  if (m === "ping") return reply({});
  if (m === "tools/list") return reply({ tools: HELPER_TOOLS });
  if (m === "tools/call") {
    const name = String(b.params?.name || ""), a = b.params?.arguments || {};
    const said = String(a.helper || "").toLowerCase();
    let helper = HELPERS.includes(said) || TESTERS.includes(said) ? said : session.helper;
    if (!helper && session.id) helper = (await d.one(`SELECT helper FROM mob_aq_helper_log WHERE session=$1 AND tool='initialize' ORDER BY id DESC LIMIT 1`, [session.id]))?.helper;
    helper ||= "unknown";
    const { helper: _h, ...logged } = a;
    try {
      if (NAMED.includes(name) && !HELPERS.includes(helper) && !(TESTERS.includes(helper) && name !== "aq_post_evidence" && name !== "aq_submit_pick")) throw new Error(`say who you are: helper must be one of ${HELPERS.join(", ")}`);
      const content = await callTool(env, name, a, helper);
      await d.q(`INSERT INTO mob_aq_helper_log (helper, session, tool, args, ok) VALUES ($1,$2,$3,$4,true)`, [helper, session.id, name, JSON.stringify(logged)]);
      return reply({ content });
    } catch (e) {
      await d.q(`INSERT INTO mob_aq_helper_log (helper, session, tool, args, ok) VALUES ($1,$2,$3,$4,false)`, [helper, session.id, name.slice(0, 60), JSON.stringify(logged)]);
      return reply({ content: text(`error: ${e.message || e}`), isError: true });
    }
  }
  return { jsonrpc: "2.0", id, error: { code: -32601, message: "method not found" } };
}

export async function helperMcp(req, env, { json }) {
  await ensureSeed(env);
  if (req.method === "GET") return json({ ok: true, server: "aquarius-helpers", tools: HELPER_TOOLS.map((t) => t.name) });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  let b; try { b = await req.json(); } catch { return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }, 400); }
  const given = req.headers.get("mcp-session-id");
  const session = { id: given && /^[a-z0-9]{6,40}$/.test(given) ? given : Date.now().toString(36) + Math.random().toString(36).slice(2, 10), helper: null };
  const out = Array.isArray(b) ? (await Promise.all(b.map((x) => rpc(env, x, session)))).filter(Boolean) : await rpc(env, b, session);
  const r = out && (!Array.isArray(out) || out.length) ? json(out) : new Response(null, { status: 202 });
  r.headers.set("mcp-session-id", session.id);
  return r;
}

export async function createTask(env, b, by) {
  const title = typeof b?.title === "string" ? b.title.trim().slice(0, 200) : "";
  if (!title) return { error: "title is required" };
  const kind = ["research", "writing", "code"].includes(b?.kind) ? b.kind : "research";
  return { task: await db(env).one(`INSERT INTO mob_aq_tasks (kind, title, detail, created_by) VALUES ($1,$2,$3,$4) RETURNING *`, [kind, title, typeof b?.detail === "string" ? b.detail.slice(0, 4000) : null, by]) };
}

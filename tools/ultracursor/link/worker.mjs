/*
 * ultracursor's link: Claude (claude.ai, through MCP) <-> the app on Alex's Mac.
 *
 * A standalone Cloudflare Worker (not Kerberos: deploying this touches no
 * store). Everything sits under one secret path; R2 holds the mailbox.
 *
 *   POST /<KEY>/mcp       MCP (JSON-RPC): ultra_status, ultra_act, ultra_result
 *   GET  /<KEY>/next      the app takes the oldest command (moved to "running")
 *   POST /<KEY>/result    the app answers a command {id, text, image?}
 *   POST /<KEY>/status    the app's heartbeat {build, url, title, mode, card, …}
 *
 * ultra_act queues one browser action and waits up to ~40 s for the app's
 * answer (page snapshot after the action). An approval card that Alex has not
 * pressed yet outlasts that: the call then returns the id, and ultra_result
 * picks the answer up later.
 */

const KEY = "uL7kQ2vN9xR4tB8mW3zY6pD1sF5hJ0cA";
const P = "ul/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const json = (v, status = 200) => new Response(JSON.stringify(v), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" },
});
async function get(env, key) {
  const o = await env.MEDIA.get(P + key);
  if (!o) return null;
  try { return JSON.parse(await o.text()); } catch { return null; }
}
const put = (env, key, v) => env.MEDIA.put(P + key, JSON.stringify(v), { httpMetadata: { contentType: "application/json" } });

const ACTIONS = ["look", "find", "read_text", "click", "type", "select", "upload", "press", "scroll", "navigate", "screenshot", "wait", "done"];

const TOOLS = [
  {
    name: "ultra_status",
    description: "Is ultracursor open on Alex's Mac, and what page is its Chrome on? Call first.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "ultra_act",
    description: [
      "Do ONE step in Alex's ultracursor Chrome (his own signed-in Chrome on his Mac; he watches the cursor).",
      "Returns the page afterwards as an accessibility snapshot with refs like [ref=e17]; act only on refs from the latest snapshot.",
      "action: look {full?} | find {text} | read_text {ref?} | click {ref, why, final} | type {ref, text, why, clear?, enter?} |",
      "select {ref, option, why} | upload {ref, files:[https image URLs], why} | press {key, why} | scroll {direction, amount?} |",
      "navigate {url, why} | screenshot {} | wait {seconds} | done {summary} (ends the session).",
      "final on click: none|publish|send|buy|delete|price|other. Anything final (post, send, buy, delete, save, price change, Enter in a chat box)",
      "waits for Alex to press Approve on a card on his screen; if he takes longer than ~40 s you get an id: call ultra_result with it.",
      "Sign-in pages and captchas pause until Alex deals with them. Passwords and card numbers are never typed.",
    ].join(" "),
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ACTIONS },
        ref: { type: "string" }, text: { type: "string" }, why: { type: "string" },
        final: { type: "string", enum: ["none", "publish", "send", "buy", "delete", "price", "other"] },
        clear: { type: "boolean" }, enter: { type: "boolean" }, option: { type: "string" },
        files: { type: "array", items: { type: "string" } }, key: { type: "string" }, url: { type: "string" },
        direction: { type: "string", enum: ["down", "up"] }, amount: { type: "string", enum: ["small", "page"] },
        full: { type: "boolean" }, seconds: { type: "number" }, summary: { type: "string" },
      },
      required: ["action"],
    },
  },
  {
    name: "ultra_result",
    description: "The answer to an ultra_act that was still waiting (usually for Alex's approval). Waits up to ~40 s.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
];

async function waitResult(env, id, ms = 40000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const r = await get(env, `res/${id}.json`);
    if (r) return r;
    await sleep(1200);
  }
  return null;
}

function toContent(r, id) {
  if (!r) return [{ type: "text", text: `Still running (most likely waiting for Alex to press Approve on his screen). Call ultra_result with id "${id}".` }];
  const out = [{ type: "text", text: String(r.text || "") }];
  if (r.image) out.push({ type: "image", data: r.image, mimeType: "image/jpeg" });
  return out;
}

async function callTool(env, name, args) {
  if (name === "ultra_status") {
    const s = await get(env, "status.json");
    if (!s) return [{ type: "text", text: "ultracursor has never connected. Alex needs to open the app (build 3 or newer)." }];
    const age = Math.round((Date.now() - (s.at || 0)) / 1000);
    const live = age < 30;
    return [{ type: "text", text: `${live ? "connected" : `NOT connected (last seen ${age} s ago)`}\n${JSON.stringify(s, null, 1)}` }];
  }
  if (name === "ultra_act") {
    const action = String(args.action || "");
    if (!ACTIONS.includes(action)) return [{ type: "text", text: `action must be one of ${ACTIONS.join(", ")}` }];
    const s = await get(env, "status.json");
    if (!s || Date.now() - (s.at || 0) > 30000) return [{ type: "text", text: "ultracursor is not connected right now (Alex must open the app). Nothing was queued." }];
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const input = { ...args };
    delete input.action;
    await put(env, `cmd/${Date.now().toString().padStart(15, "0")}-${id}.json`, { id, action, input, at: Date.now() });
    return toContent(await waitResult(env, id), id);
  }
  if (name === "ultra_result") {
    const id = String(args.id || "").replace(/[^a-z0-9]/gi, "");
    return toContent(await waitResult(env, id), id);
  }
  return [{ type: "text", text: `no such tool: ${name}` }];
}

async function mcp(env, body) {
  const id = body && body.id !== undefined ? body.id : null;
  const reply = (result) => ({ jsonrpc: "2.0", id, result });
  const m = body && body.method;
  if (m === "initialize") return reply({ protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "ultracursor", title: "ultracursor", version: "1.0.0" } });
  if (m === "notifications/initialized") return null;
  if (m === "tools/list") return reply({ tools: TOOLS });
  if (m === "tools/call") {
    const content = await callTool(env, (body.params && body.params.name) || "", (body.params && body.params.arguments) || {});
    return reply({ content });
  }
  if (m === "ping") return reply({});
  return { jsonrpc: "2.0", id, error: { code: -32601, message: "method not found" } };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const [key, what] = url.pathname.split("/").filter(Boolean);
    if (request.method === "OPTIONS") return new Response(null, { headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, authorization, mcp-session-id, mcp-protocol-version", "access-control-allow-methods": "GET, POST, OPTIONS" } });
    if (key !== KEY) return new Response("Not found", { status: 404 });

    if (what === "mcp") {
      if (request.method === "GET") return json({ ok: true, server: "ultracursor", tools: TOOLS.map((t) => t.name) });
      let body = null;
      try { body = await request.json(); } catch { return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }, 400); }
      if (Array.isArray(body)) {
        const out = (await Promise.all(body.map((b) => mcp(env, b)))).filter(Boolean);
        return out.length ? json(out) : new Response(null, { status: 202 });
      }
      const out = await mcp(env, body);
      return out ? json(out) : new Response(null, { status: 202 });
    }
    if (what === "next" && request.method === "GET") {
      const list = await env.MEDIA.list({ prefix: P + "cmd/", limit: 1 });
      const obj = list.objects && list.objects[0];
      if (!obj) return json(null);
      const cmd = await get(env, obj.key.slice(P.length));
      await env.MEDIA.delete(obj.key);
      return json(cmd);
    }
    if (what === "result" && request.method === "POST") {
      const b = await request.json().catch(() => null);
      if (!b || !b.id) return json({ ok: false }, 400);
      await put(env, `res/${String(b.id).replace(/[^a-z0-9]/gi, "")}.json`, { text: String(b.text || ""), image: b.image || null, at: Date.now() });
      return json({ ok: true });
    }
    if (what === "status" && request.method === "POST") {
      const b = await request.json().catch(() => ({}));
      await put(env, "status.json", { ...b, at: Date.now() });
      return json({ ok: true });
    }
    if (what === "status") return json(await get(env, "status.json"));
    return new Response("Not found", { status: 404 });
  },
};

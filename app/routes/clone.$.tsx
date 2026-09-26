/**
 * Clone Me's back end: a board, a tray of written work, a status line — and an
 * MCP server, all on one secret path.
 *
 * The reason this file exists rather than an API key on the Mac: the thinking
 * is not done on the Mac at all. The app reads Fiverr and posts what it sees;
 * Claude reads that board from the other side, writes the deliverable and the
 * reply, and posts them back; the app shows them and types them when Alex taps
 * Take. So the brain is a Claude session he already pays for, and his laptop
 * never holds a credential of any kind.
 *
 * Nothing here is shared with the other apps. Its own key, its own R2 slots
 * (`cm-*`), its own tool names (`clone_*`), and no database: the app's session
 * lives on the Mac and nothing about a buyer is kept here longer than the job.
 *
 *   GET  /clone/<key>/board    what is waiting, as the app last saw it
 *   POST /clone/<key>/board    the app saying what it sees
 *   GET  /clone/<key>/work     the written work waiting for the app to show
 *   POST /clone/<key>/work     Claude posting a deliverable and a reply
 *   GET  /clone/<key>/status   what it is doing
 *   POST /clone/<key>/status   the app saying so
 *   GET  /clone/<key>/log      what happened
 *   POST /clone/<key>/log      a line for the record
 *   POST /clone/<key>/mcp      the same things as MCP tools
 *   GET  /clone/<key>/icon.png the app's mark, so the connector wears it
 *
 * The key in the path is the whole of the authentication. Alex signs into
 * Fiverr himself, in the window; nothing to sign in with is ever stored here.
 *
 * What this back end deliberately cannot do: accept an order or deliver one.
 * There is no endpoint for it. Fiverr bans automated order fulfilment and
 * enforces it with a permanent ban, so the last button stays a human's — and
 * the way to keep that true under pressure is for the capability not to exist.
 */
import type { Route } from "./+types/clone.$";

/** Rotating this invalidates every client at once, which is the point. */
const KEY = "FZ0PJ4hdbfoGJQlG5e6KtFANAx6sKziq";

const ORIGIN = "https://kerberos.gardenbuddystore.workers.dev";
const BASE = `${ORIGIN}/clone/${KEY}`;

const FILES = {
  board: "cm-board.json",
  work: "cm-work.json",
  status: "cm-status.json",
  log: "cm-log.json",
} as const;
type Slot = keyof typeof FILES;

type Env = { MEDIA: R2Bucket };

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
    },
  });

async function read(env: Env, slot: Slot): Promise<Record<string, unknown> | null> {
  const object = await env.MEDIA.get(FILES[slot]);
  if (!object) return null;
  return object.json<Record<string, unknown>>().catch(() => null);
}

async function write(env: Env, slot: Slot, value: unknown) {
  await env.MEDIA.put(FILES[slot], JSON.stringify(value), {
    httpMetadata: { contentType: "application/json" },
  });
}

/** The log is short on purpose: it is for reading, not for auditing. */
async function append(env: Env, line: Record<string, unknown>) {
  const now = (await read(env, "log")) ?? {};
  const lines = Array.isArray(now.lines) ? (now.lines as unknown[]) : [];
  lines.push({ ...line, at: Date.now() });
  await write(env, "log", { lines: lines.slice(-200) });
}

const TOOLS = [
  {
    name: "clone_board",
    description:
      "What Clone Me is looking at on Fiverr right now: the jobs it shortlisted, what each pays, and which of them are still waiting to be written. Read this first — everything else acts on a job id from here.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "clone_status",
    description:
      "What the app is doing, whether it is inside the seller's hours, how many jobs it has taken today, and its last lines. Read this before answering anything about whether Clone Me is working.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "clone_write",
    description:
      "Put a written job in front of Alex. `reply` is the message to the buyer and `deliverable` is the finished work; set `ready` false and give `questions` instead when the brief is too thin to deliver against. Nothing is sent by this — it lands on his board with a Take button.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The job id from clone_board." },
        reply: { type: "string", description: "The message to the buyer. Short, plain, no claim that a human made the work." },
        deliverable: { type: "string", description: "The finished work, ready to paste or attach." },
        ready: { type: "boolean", description: "False when a question has to be answered first." },
        questions: { type: "array", items: { type: "string" }, description: "What must be answered. Only when ready is false." },
      },
      required: ["id", "reply"],
    },
  },
  {
    name: "clone_log",
    description: "A line for the record, so what happened is readable later.",
    inputSchema: {
      type: "object",
      properties: { line: { type: "string" } },
      required: ["line"],
    },
  },
];

async function callTool(env: Env, name: string, args: Record<string, unknown>) {
  if (name === "clone_board") {
    const board = (await read(env, "board")) ?? { jobs: [], at: null };
    const work = ((await read(env, "work")) ?? {}) as { items?: Record<string, unknown> };
    const written = new Set(Object.keys(work.items ?? {}));
    const jobs = Array.isArray(board.jobs) ? (board.jobs as Record<string, unknown>[]) : [];
    return {
      at: board.at ?? null,
      // Said explicitly rather than left to be worked out: the whole point of
      // reading this is to find what still needs writing.
      waiting: jobs.filter((j) => !written.has(String(j.id))),
      written: jobs.filter((j) => written.has(String(j.id))).map((j) => j.id),
      count: jobs.length,
    };
  }

  if (name === "clone_status") {
    const status = (await read(env, "status")) ?? {};
    const log = (await read(env, "log")) ?? {};
    const lines = Array.isArray(log.lines) ? (log.lines as unknown[]) : [];
    return { ...status, tail: lines.slice(-12) };
  }

  if (name === "clone_write") {
    const id = String(args.id ?? "").trim();
    if (!id) return { ok: false, error: "which job — pass the id from clone_board" };
    const reply = String(args.reply ?? "").trim();
    if (!reply) return { ok: false, error: "a job needs a reply, even when it is only a question" };

    const ready = args.ready !== false;
    const questions = Array.isArray(args.questions) ? args.questions.map(String).filter(Boolean) : [];
    // A job that is not ready must say what it is waiting on, or the board
    // shows a button that asks nothing.
    if (!ready && !questions.length) {
      return { ok: false, error: "not ready, but no questions — say what has to be answered" };
    }

    const now = ((await read(env, "work")) ?? {}) as { items?: Record<string, unknown> };
    const items = { ...(now.items ?? {}) };
    items[id] = {
      reply,
      deliverable: String(args.deliverable ?? ""),
      ready,
      questions,
      at: Date.now(),
    };
    await write(env, "work", { items });
    await append(env, { kind: "written", id, ready });
    return { ok: true, id, ready, waitingOnHim: true };
  }

  if (name === "clone_log") {
    const line = String(args.line ?? "").trim();
    if (!line) return { ok: false, error: "nothing to write" };
    await append(env, { line });
    return { ok: true };
  }

  return { ok: false, error: `no tool called ${name}` };
}

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env as unknown as Env;
  const path = String(params["*"] ?? "").split("/").filter(Boolean);
  if (path[0] !== KEY) return json({ ok: false, error: "no" }, 404);
  const what = path[1] ?? "";

  /* The mark, so the connector shows his icon rather than a default glyph.
     Served from the bucket rather than the bundle: the app is replaced on
     every update and the picture should not have to be. */
  if (what === "icon.png" || what === "icon-256.png") {
    const object = await env.MEDIA.get(what === "icon-256.png" ? "cm-icon-256.png" : "cm-icon-512.png");
    if (!object) return new Response("no", { status: 404 });
    return new Response(object.body, {
      headers: {
        "content-type": "image/png",
        "cache-control": "public, max-age=86400",
        "access-control-allow-origin": "*",
      },
    });
  }

  if (what === "board") return json((await read(env, "board")) ?? { jobs: [], at: null });
  if (what === "status") return json((await read(env, "status")) ?? {});
  if (what === "log") return json((await read(env, "log")) ?? { lines: [] });

  /* The tray the app drains. Reading it hands the work over and clears it, so
     the same reply can never be typed twice — a duplicate message to a buyer
     is worse than a missing one. */
  if (what === "work") {
    const now = ((await read(env, "work")) ?? {}) as { items?: Record<string, unknown> };
    const items = now.items ?? {};
    if (Object.keys(items).length) await write(env, "work", { items: {} });
    return json({ items });
  }

  if (!what) return json({ ok: true, app: "Clone Me", base: BASE, endpoints: Object.keys(FILES) });
  return json({ ok: false, error: "no such thing here" }, 404);
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const env = context.cloudflare.env as unknown as Env;
  const path = String(params["*"] ?? "").split("/").filter(Boolean);
  if (path[0] !== KEY) return json({ ok: false, error: "no" }, 404);
  const what = path[1] ?? "";

  if (what === "mcp") {
    const body = (await request.json().catch(() => null)) as
      | { jsonrpc?: string; id?: unknown; method?: string; params?: { name?: string; arguments?: unknown } }
      | null;
    if (!body) return json({ ok: false, error: "not json" }, 400);
    const reply = (result: unknown) => json({ jsonrpc: "2.0", id: body.id ?? null, result });

    if (body.method === "initialize") {
      return reply({
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: {
          name: "clone-me",
          title: "Clone Me",
          version: "1.0.0",
          websiteUrl: ORIGIN,
          icons: [
            { src: `${BASE}/icon.png`, mimeType: "image/png", sizes: ["512x512"] },
            { src: `${BASE}/icon-256.png`, mimeType: "image/png", sizes: ["256x256"] },
          ],
        },
      });
    }
    if (body.method === "tools/list") return reply({ tools: TOOLS });
    if (body.method === "tools/call") {
      const given = body.params?.arguments;
      const args = given && typeof given === "object" && !Array.isArray(given) ? (given as Record<string, unknown>) : {};
      const out = await callTool(env, String(body.params?.name ?? ""), args);
      return reply({ content: [{ type: "text", text: JSON.stringify(out, null, 2) }] });
    }
    return reply({});
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ ok: false, error: "not json" }, 400);

  if (what === "board") {
    const jobs = Array.isArray(body.jobs) ? body.jobs : [];
    await write(env, "board", { jobs, at: Date.now() });
    return json({ ok: true, jobs: jobs.length });
  }

  if (what === "status") {
    await write(env, "status", { ...body, at: Date.now() });
    return json({ ok: true });
  }

  if (what === "log") {
    const lines = Array.isArray(body.lines) ? body.lines : [body];
    for (const line of lines.slice(-20)) {
      await append(env, typeof line === "string" ? { line } : (line as Record<string, unknown>));
    }
    return json({ ok: true });
  }

  /* Claude writes here too, for anything that is not going through MCP. */
  if (what === "work") {
    const out = await callTool(env, "clone_write", body);
    return json(out);
  }

  return json({ ok: false, error: "no such thing here" }, 404);
}

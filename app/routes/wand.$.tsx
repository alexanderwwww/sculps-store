/**
 * The Magic Wand's own back end: a status board, an order desk, and an MCP
 * server, all on one secret path.
 *
 * Until now the app read a file Claude had uploaded and nothing came back the
 * other way. That works for telling it what to do and is useless for finding
 * out what it did — every problem arrived as a photograph of a screen, which
 * is a slow way to debug a program. Now the app posts what it is doing after
 * every step, and Claude reads it.
 *
 * Three ways in, the same four things underneath:
 *
 *   GET  /wand/<key>/status   what the app is doing, and its last lines
 *   POST /wand/<key>/status   the app saying so
 *   GET  /wand/<key>/order    the app asking whether it has been told anything
 *   POST /wand/<key>/order    continue, pause, stop, pictures, skip
 *   GET  /wand/<key>/queue    the job
 *   POST /wand/<key>/queue    a new job
 *   POST /wand/<key>/mcp      the same four as MCP tools, for claude.ai
 *
 * The key in the path is the whole of the authentication, which is the right
 * amount for a channel whose worst case is somebody typing a prompt into a
 * chat window that is already open on somebody's own laptop. It is not in the
 * repository's public surface anywhere else, and rotating it is editing one
 * line here.
 */
import type { Route } from "./+types/wand.$";

/** Rotating this invalidates every client at once, which is the point. */
const KEY = "0ikn4sXuXNntr2Im2Mil7zRxLBmlCWtu";

const FILES = {
  status: "wand-status.json",
  order: "wand-control.json",
  queue: "wand-queue.json",
} as const;

/** Where finished pictures land, so they come back here instead of only to a Desktop. */
const SHOTS = "wand-shots/";

type Slot = keyof typeof FILES;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // Read from a browser, from node, and from Claude's own fetcher.
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      // Never a stale answer: the whole value of this is that it is current.
      "cache-control": "no-store",
    },
  });

async function read(env: Env, slot: Slot) {
  const obj = await env.MEDIA?.get(FILES[slot]);
  if (!obj) return null;
  try {
    return JSON.parse(await obj.text());
  } catch {
    return null;
  }
}

async function write(env: Env, slot: Slot, value: unknown) {
  await env.MEDIA?.put(FILES[slot], JSON.stringify(value, null, 2), {
    httpMetadata: { contentType: "application/json", cacheControl: "no-store" },
  });
}

/* ----------------------------------------------------------------- shots */

/**
 * The pictures themselves, sent up as they are saved.
 *
 * A run used to end with a zip on Alex's Desktop and nothing anywhere else,
 * which meant every picture had to be found, downloaded, re-uploaded and
 * pointed at a product by hand. They arrive here now, one POST each, as the
 * run makes them — so by the time it finishes they are already somewhere the
 * shop can be pointed at and somewhere Claude can look.
 */
async function listShots(env: Env, job?: string) {
  const prefix = job ? `${SHOTS}${job}/` : SHOTS;
  const out: { key: string; job: string; name: string; size: number; uploaded: string }[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.MEDIA.list({ prefix, cursor, limit: 500 });
    for (const o of page.objects) {
      const rest = o.key.slice(SHOTS.length);
      const cut = rest.indexOf("/");
      out.push({
        key: o.key,
        job: cut < 0 ? "" : rest.slice(0, cut),
        name: cut < 0 ? rest : rest.slice(cut + 1),
        size: o.size,
        uploaded: o.uploaded.toISOString(),
      });
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  out.sort((a, b) => a.key.localeCompare(b.key));
  return out;
}

/* ------------------------------------------------------------------- MCP */

/**
 * The four tools, described the way an MCP client expects them.
 *
 * They are deliberately the same four things the plain URLs do. An MCP server
 * that can do more than the app it fronts is a second app to keep in step.
 */
const TOOLS = [
  {
    name: "wand_status",
    description:
      "What Magic Wand is doing right now on Alex's Mac: the job, which prompt it is on, " +
      "whether it is running, paused or waiting for approval, how many pictures it has " +
      "saved, and the last lines it printed. Read this before answering anything about " +
      "whether the wand is working.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "wand_order",
    description:
      "Tell Magic Wand what to do right now. 'continue' also says yes to a job that is " +
      "waiting for approval. The app obeys within two seconds wherever it is, including " +
      "in the middle of waiting for a picture.",
    inputSchema: {
      type: "object",
      properties: {
        cmd: { type: "string", enum: ["continue", "pause", "stop", "pictures", "skip"] },
      },
      required: ["cmd"],
    },
  },
  {
    name: "wand_queue_get",
    description: "The job Magic Wand is currently being offered, or running.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "wand_queue_set",
    description:
      "Give Magic Wand a new job. Replaces whatever was queued. Every prompt runs in the "
      + "one chat the app is already on, which is what keeps the reference picture and "
      + "the style consistent across a long run. `newChat: true` asks for a fresh thread "
      + "per prompt instead — only worth it for a genuinely different product. " +
      "`selectors` overrides the app's idea of where the buttons and pictures are on " +
      "that site, for this job only — which is how a site redesign gets fixed without a " +
      "new version of the app.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        site: { type: "string", enum: ["chatgpt", "gemini"] },
        prompts: { type: "array", items: { type: "string" } },
        newChat: { type: "boolean" },
        refs: {
          type: "array",
          items: { type: "string" },
          description:
            "Urls of reference pictures. The app downloads and attaches them itself, so " +
            "nothing has to be dropped onto the card by hand.",
        },
        wait: { type: "number" },
        url: { type: "string" },
        selectors: { type: "object" },
      },
      required: ["name", "prompts"],
    },
  },
  {
    name: "wand_shots",
    description:
      "The pictures Magic Wand has sent up from Alex's Mac, newest run included. Each one " +
      "has a url that can be fetched directly. Use this to see what a run actually " +
      "produced, and to put the pictures on the shop.",
    inputSchema: {
      type: "object",
      properties: { job: { type: "string", description: "Only this run's pictures." } },
    },
  },
] as const;

async function callTool(env: Env, name: string, args: Record<string, unknown>) {
  if (name === "wand_status") {
    return (await read(env, "status")) ?? { state: "no report yet — the app has not been opened since this was added" };
  }
  if (name === "wand_shots") {
    const shots = await listShots(env, args.job ? String(args.job) : undefined);
    return {
      count: shots.length,
      shots: shots.map((x) => ({
        ...x,
        url: `https://kerberos.gardenbuddystore.workers.dev/wand/${KEY}/file/${x.job}/${x.name}`,
      })),
    };
  }
  if (name === "wand_queue_get") {
    return (await read(env, "queue")) ?? { queued: null };
  }
  if (name === "wand_order") {
    const cmd = String(args.cmd ?? "");
    if (!["continue", "pause", "stop", "pictures", "skip"].includes(cmd)) {
      return { ok: false, error: `not an order: ${cmd}` };
    }
    await write(env, "order", { cmd, at: Date.now() });
    return { ok: true, sent: cmd };
  }
  if (name === "wand_queue_set") {
    /*
     * An MCP client is free to hand a list over as a JSON string, and this one
     * does. Taking only a real array meant `refs` was quietly dropped — the
     * job ran, the reference was never attached, and the picture came back
     * wrong with nothing anywhere saying why.
     */
    const list = (v: unknown): string[] => {
      if (Array.isArray(v)) return v.map(String).filter(Boolean);
      if (typeof v === "string" && v.trim()) {
        try {
          const parsed = JSON.parse(v);
          if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
        } catch {
          // Not JSON: one url, or several separated by commas or newlines.
        }
        return v.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
      }
      return [];
    };
    const obj = (v: unknown): Record<string, unknown> | null => {
      if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
      if (typeof v === "string" && v.trim().startsWith("{")) {
        try {
          const parsed = JSON.parse(v);
          if (parsed && typeof parsed === "object") return parsed;
        } catch { /* leave it out rather than guess */ }
      }
      return null;
    };

    const prompts = list(args.prompts);
    if (!prompts.length) return { ok: false, error: "a job with no prompts is not a job" };
    const job = {
      id: `job-${Date.now()}`,
      name: String(args.name ?? "Untitled"),
      site: args.site === "gemini" ? "gemini" : "chatgpt",
      newChat: Boolean(args.newChat),
      ...(list(args.refs).length ? { refs: list(args.refs) } : {}),
      ...(args.wait ? { wait: Number(args.wait) } : {}),
      ...(args.url ? { url: String(args.url) } : {}),
      ...(obj(args.selectors) ? { selectors: obj(args.selectors) } : {}),
      prompts,
    };
    await write(env, "queue", job);
    return { ok: true, queued: job.id, prompts: prompts.length };
  }
  return { ok: false, error: `no such tool: ${name}` };
}

/** JSON-RPC, the three methods a client needs before it can call anything. */
async function mcp(env: Env, body: any) {
  const id = body?.id ?? null;
  const reply = (result: unknown) => ({ jsonrpc: "2.0", id, result });

  if (body?.method === "initialize") {
    return reply({
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: {
        name: "magic-wand",
        title: "Magic Wand",
        version: "1.0.0",
        websiteUrl: "https://kerberos.gardenbuddystore.workers.dev",
        // Offered the way the spec allows. Whether a given client draws it is
        // the client's business, and none of this depends on it.
        icons: [
          {
            src: `https://kerberos.gardenbuddystore.workers.dev/wand/${KEY}/icon.png`,
            mimeType: "image/png",
            sizes: ["512x512"],
          },
        ],
      },
    });
  }
  if (body?.method === "notifications/initialized") return null;
  if (body?.method === "tools/list") return reply({ tools: TOOLS });
  if (body?.method === "tools/call") {
    const out = await callTool(env, body?.params?.name ?? "", body?.params?.arguments ?? {});
    // Every MCP client can read text; only some read structured content.
    return reply({ content: [{ type: "text", text: JSON.stringify(out, null, 2) }] });
  }
  return { jsonrpc: "2.0", id, error: { code: -32601, message: "method not found" } };
}

/* ----------------------------------------------------------------- routes */

function parse(splat: string | undefined) {
  const parts = (splat ?? "").split("/").filter(Boolean);
  return { key: parts[0] ?? "", what: parts[1] ?? "" };
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const { key, what } = parse(params["*"]);
  if (key !== KEY) throw new Response("Not found", { status: 404 });
  const env = context.cloudflare.env;

  if (what === "status") return json((await read(env, "status")) ?? { state: "never reported" });
  if (what === "order") return json((await read(env, "order")) ?? { cmd: "", at: 0 });
  if (what === "queue") return json((await read(env, "queue")) ?? {});
  if (what === "shots") {
    const shots = await listShots(env);
    return json({ count: shots.length, shots });
  }
  if (what === "file") {
    // Everything after /file/ is the picture's own path.
    const rest = (params["*"] ?? "").split("/").slice(2).join("/");
    const obj = rest ? await env.MEDIA.get(`${SHOTS}${rest}`) : null;
    if (!obj) throw new Response("Not found", { status: 404 });
    return new Response(obj.body, {
      headers: {
        "content-type": obj.httpMetadata?.contentType ?? "image/png",
        "cache-control": "public, max-age=3600",
        "access-control-allow-origin": "*",
      },
    });
  }
  if (what === "icon.png" || what === "icon") {
    // The wand's own mark, for whatever draws the connector.
    const obj = await env.MEDIA.get("wand-icon.png");
    if (!obj) throw new Response("Not found", { status: 404 });
    return new Response(obj.body, {
      headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" },
    });
  }
  if (what === "mcp") {
    // A GET on the MCP endpoint is a client checking it is there.
    return json({ ok: true, server: "magic-wand", tools: TOOLS.map((t) => t.name) });
  }
  throw new Response("Not found", { status: 404 });
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const { key, what } = parse(params["*"]);
  if (request.method === "OPTIONS") return json({ ok: true });
  if (key !== KEY) throw new Response("Not found", { status: 404 });
  const env = context.cloudflare.env;

  /*
   * A picture is bytes, not JSON, and it is the one thing posted here that is
   * — so it is handled before anything tries to parse the body as text.
   */
  if (what === "shot") {
    const url = new URL(request.url);
    const clean = (v: string) => v.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 80);
    const job = clean(url.searchParams.get("job") || "run");
    const name = clean(url.searchParams.get("name") || `${Date.now()}.png`);
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength) return json({ ok: false, error: "empty" }, 400);
    if (bytes.byteLength > 25_000_000) return json({ ok: false, error: "too big" }, 413);
    await env.MEDIA.put(`${SHOTS}${job}/${name}`, bytes, {
      httpMetadata: { contentType: request.headers.get("content-type") ?? "image/png" },
    });
    return json({ ok: true, url: `${url.origin}/wand/${KEY}/file/${job}/${name}` });
  }

  let body: any = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  if (what === "mcp") {
    const out = await mcp(env, body);
    // A notification gets no reply at all, which is not the same as an empty one.
    return out ? json(out) : new Response(null, { status: 202 });
  }

  if (what === "status") {
    // Whatever the app says, plus when it said it — so a stale board is
    // obvious rather than convincing.
    await write(env, "status", { ...(body ?? {}), at: Date.now() });
    return json({ ok: true });
  }
  if (what === "order") {
    const cmd = String(body?.cmd ?? "");
    await write(env, "order", { cmd, at: Date.now() });
    return json({ ok: true, sent: cmd });
  }
  if (what === "queue") {
    await write(env, "queue", body ?? {});
    return json({ ok: true });
  }
  throw new Response("Not found", { status: 404 });
}

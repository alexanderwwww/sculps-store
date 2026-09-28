/**
 * flip's back end: the shop's board, its playbook, and the work waiting — plus
 * an MCP server, all on one secret path.
 *
 * Same shape as the other apps and for the same reason: the thinking is not
 * done on the Mac. The app reads Depop and posts what it sees; Claude reads
 * that from the other side, writes the listing, the price, the reply or the
 * offer, and posts it back; the app shows it and types it when Alex taps Take.
 * His laptop never holds a credential.
 *
 * What is different here is the playbook. The app publishes the markdown it
 * was fed — the resale knowledge distilled from the videos he sends — and
 * `flip_playbook` hands it back. So the rules that decide a title or a price
 * are read from his own playbook rather than from whatever a model happens to
 * remember about Depop.
 *
 *   GET  /flip/<key>/board      what is on the shop floor
 *   POST /flip/<key>/board      the app saying what it sees
 *   GET  /flip/<key>/work       written work waiting for the app to show
 *   POST /flip/<key>/work       Claude posting a listing, a reply or an offer
 *   GET  /flip/<key>/knowledge  the playbook
 *   POST /flip/<key>/knowledge  the app publishing what it was fed
 *   GET  /flip/<key>/status     what it is doing
 *   POST /flip/<key>/status     the app saying so
 *   GET  /flip/<key>/log        what happened
 *   POST /flip/<key>/log        a line for the record
 *   POST /flip/<key>/mcp        the same things as MCP tools
 *
 * What this deliberately cannot do: complete a sale, or ship. There is no
 * endpoint for it. Depop enforces against behaviour rather than tooling, and
 * this shop is the business — so the last button stays his, and the way to
 * keep that true under pressure is for the capability not to exist.
 */
import type { Route } from "./+types/flip.$";

const KEY = "aes7lzINLJbOC490K8GDwLCe";

const ORIGIN = "https://kerberos.gardenbuddystore.workers.dev";
const BASE = `${ORIGIN}/flip/${KEY}`;

const FILES = {
  board: "flip-board.json",
  work: "flip-work.json",
  status: "flip-status.json",
  log: "flip-log.json",
  knowledge: "flip-knowledge.json",
  ui: "flip-ui.json",
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

async function append(env: Env, line: Record<string, unknown>) {
  const now = (await read(env, "log")) ?? {};
  const lines = Array.isArray(now.lines) ? (now.lines as unknown[]) : [];
  lines.push({ ...line, at: Date.now() });
  await write(env, "log", { lines: lines.slice(-200) });
}

const TOOLS = [
  {
    name: "flip_playbook",
    description:
      "The resale playbook the shop runs on, as markdown — title formulas, pricing, refresh timing, offer rules, photo order, what sells. Read this BEFORE writing any listing, price or reply. It is Alex's own knowledge, distilled from the sellers he rates, and it overrides anything you remember about Depop.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "flip_board",
    description:
      "What the shop needs right now: items waiting to be listed, messages waiting on a reply, listings sitting long enough to deserve an offer, and what is stale. Everything else acts on an id from here.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "flip_status",
    description: "What the app is doing, how many it has listed today, and its last lines.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "flip_write",
    description:
      "Put written work in front of Alex: a listing, a reply to a buyer, or an offer. Nothing is sent by this — it lands on his phone with a Take button. Follow flip_playbook for the title formula and the photo order; price against sold comps, never against asking prices.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The id from flip_board." },
        kind: { type: "string", enum: ["listing", "reply", "offer"], description: "What this is." },
        title: { type: "string", description: "Listing only. [Brand] [Style] [Era] [Colour] [Feature]." },
        description: { type: "string", description: "Listing only. Casual, with measurements in inches and every flaw named." },
        hashtags: { type: "array", items: { type: "string" }, description: "Listing only. Five, specific, no generic tags." },
        images: {
          type: "array",
          items: { type: "string" },
          description:
            "Listing only. Up to 8 image URLs, in order — the first is the cover and it is most of the decision. The app downloads and attaches them itself. Generate them; never hand over a competitor's file, which trips Depop's duplicate detection.",
        },
        category: { type: "string", description: "Listing only. Depop's category, e.g. Tops." },
        subcategory: { type: "string", description: "Listing only, when it has one." },
        brand: { type: "string", description: "Listing only." },
        condition: { type: "string", description: "Listing only. Depop's own words: Brand new, Like new, Used - excellent, Used - good, Used - fair." },
        size: { type: "string", description: "Listing only." },
        colour: { type: "string", description: "Listing only." },
        priceCents: { type: "integer", description: "Listing or offer. In cents." },
        reply: { type: "string", description: "Reply only. In his voice, short, no corporate tone." },
        why: { type: "string", description: "One line on the reasoning — the comp, the rule, the read." },
        ready: { type: "boolean", description: "False when something has to be answered first." },
        questions: { type: "array", items: { type: "string" }, description: "What must be answered. Only when ready is false." },
      },
      required: ["id", "kind"],
    },
  },
  {
    name: "flip_ui",
    description:
      "Change how the glass looks, live. The orb is drawn by AppKit, so what travels is the numbers it is made of — the running app applies them within seconds, with no restart and nothing to download. Raise `build` above the current one; a push that is not higher is ignored, and a rollback is a higher build carrying the old numbers. Every value is optional and anything left out is untouched. This is the look and nothing else — it cannot reach the shop, the worker or the Mac.",
    inputSchema: {
      type: "object",
      properties: {
        build: { type: "integer", description: "Higher than the running build, or it is ignored." },
        lens: {
          type: "number",
          description:
            "How hard the glass bends what is behind it, 0 to 1. 0.42 is the shipped value; 0.7 is a fisheye and 0.1 is nearly flat.",
        },
        rim: {
          type: "number",
          description: "How lit the edge is, 0 to 1. 0.72 ships. This is the thickness of the glass.",
        },
        sheen: {
          type: "number",
          description:
            "The travelling highlight, 0 to 1. 0.13 ships, and it is the ceiling — above that the orb reads milky, which he has rejected four times.",
        },
        drift: { type: "number", description: "Seconds for the drop to cross. 11 ships. Below 4 it reads as a loading bar." },
        radius: { type: "number", description: "The squircle's corner, in points. 56 ships." },
        why: { type: "string", description: "One line for the log, so a bad look can be found and undone." },
      },
      required: ["build"],
    },
  },
  {
    name: "flip_log",
    description: "A line for the record, so what happened is readable later.",
    inputSchema: {
      type: "object",
      properties: { line: { type: "string" } },
      required: ["line"],
    },
  },
];

async function callTool(env: Env, name: string, args: Record<string, unknown>) {
  if (name === "flip_playbook") {
    const store = ((await read(env, "knowledge")) ?? {}) as { files?: unknown };
    const files = Array.isArray(store.files) ? store.files : [];
    if (!files.length) {
      return {
        ok: false,
        error:
          "no playbook published yet — the app posts it at start, so either it has not run or its knowledge folder is empty",
      };
    }
    return { files };
  }

  if (name === "flip_board") {
    const board = (await read(env, "board")) ?? { items: [], at: null };
    const work = ((await read(env, "work")) ?? {}) as {
      items?: Record<string, unknown>;
      handed?: string[];
    };
    /* What is still in the tray AND what the app has already taken. Counting
       only the tray meant that the moment the app drained it, every row read
       as waiting again and Claude rewrote replies it had already written. */
    const written = new Set([...Object.keys(work.items ?? {}), ...(work.handed ?? [])]);
    const items = Array.isArray(board.items) ? (board.items as Record<string, unknown>[]) : [];
    return {
      at: board.at ?? null,
      waiting: items.filter((i) => !written.has(String(i.id))),
      written: items.filter((i) => written.has(String(i.id))).map((i) => i.id),
      count: items.length,
    };
  }

  if (name === "flip_status") {
    const status = (await read(env, "status")) ?? {};
    const log = (await read(env, "log")) ?? {};
    const lines = Array.isArray(log.lines) ? (log.lines as unknown[]) : [];
    return { ...status, tail: lines.slice(-12) };
  }

  if (name === "flip_write") {
    const id = String(args.id ?? "").trim();
    if (!id) return { ok: false, error: "which item — pass the id from flip_board" };
    const kind = String(args.kind ?? "").trim();
    if (!["listing", "reply", "offer"].includes(kind)) {
      return { ok: false, error: "kind must be listing, reply or offer" };
    }

    const ready = args.ready !== false;
    const questions = Array.isArray(args.questions) ? args.questions.map(String).filter(Boolean) : [];
    if (!ready && !questions.length) {
      return { ok: false, error: "not ready, but no questions — say what has to be answered" };
    }

    // A listing with no title is not a listing, and a reply with no words is
    // a button that does nothing. Caught here rather than on his screen.
    if (ready && kind === "listing" && !String(args.title ?? "").trim()) {
      return { ok: false, error: "a listing needs a title — [Brand] [Style] [Era] [Colour] [Feature]" };
    }
    if (ready && kind === "listing" && !(Array.isArray(args.images) && args.images.length)) {
      return {
        ok: false,
        error: "a listing needs images — without good ones it will not sell, and the app cannot invent them",
      };
    }
    if (ready && kind === "reply" && !String(args.reply ?? "").trim()) {
      return { ok: false, error: "a reply needs words" };
    }
    if (ready && kind === "offer" && !Number.isFinite(Number(args.priceCents))) {
      return { ok: false, error: "an offer needs priceCents" };
    }

    const now = ((await read(env, "work")) ?? {}) as { items?: Record<string, unknown> };
    const items = { ...(now.items ?? {}) };
    items[id] = {
      kind,
      title: String(args.title ?? ""),
      description: String(args.description ?? ""),
      hashtags: Array.isArray(args.hashtags) ? args.hashtags.map(String).slice(0, 5) : [],
      images: Array.isArray(args.images) ? args.images.map(String).slice(0, 8) : [],
      category: String(args.category ?? ""),
      subcategory: String(args.subcategory ?? ""),
      brand: String(args.brand ?? ""),
      condition: String(args.condition ?? ""),
      size: String(args.size ?? ""),
      colour: String(args.colour ?? ""),
      priceCents: Number.isFinite(Number(args.priceCents)) ? Number(args.priceCents) : null,
      reply: String(args.reply ?? ""),
      why: String(args.why ?? ""),
      ready,
      questions,
      at: Date.now(),
    };
    await write(env, "work", { items });
    await append(env, { kind: "written", id, what: kind, ready });
    return { ok: true, id, ready, waitingOnHim: true };
  }

  if (name === "flip_ui") {
    const build = Number(args.build);
    if (!Number.isFinite(build) || build <= 0) return { ok: false, error: "build must be a number" };
    const now = ((await read(env, "ui")) ?? {}) as { build?: number; style?: Record<string, number> };
    if (Number(now.build ?? 0) >= build) {
      return { ok: false, error: `build ${build} is not above the running ${now.build ?? 0}` };
    }
    /*
     * Only the keys the window knows, only numbers, and only inside the range
     * each one is sane in. A pushed look cannot take the app down, and it
     * cannot quietly put the orb back to the milky slab he rejected: `sheen`
     * is capped at the value that has already been argued over four times.
     */
    const LIMITS: Record<string, [number, number]> = {
      lens: [0, 1],
      rim: [0, 1],
      sheen: [0, 0.13],
      drift: [4, 60],
      radius: [0, 120],
    };
    const style: Record<string, number> = {};
    for (const [key, [low, high]] of Object.entries(LIMITS)) {
      if (args[key] === undefined) continue;
      const value = Number(args[key]);
      if (!Number.isFinite(value)) return { ok: false, error: `${key} is not a number` };
      if (value < low || value > high) {
        return { ok: false, error: `${key} must be between ${low} and ${high}` };
      }
      style[key] = value;
    }
    if (!Object.keys(style).length) return { ok: false, error: "nothing to change" };
    /* Merged, so a push that carries one value does not blank the rest. */
    const merged = { ...(now.style ?? {}), ...style };
    await write(env, "ui", { build, style: merged, why: String(args.why ?? ""), at: Date.now() });
    await append(env, { line: `new look, build ${build}: ${Object.keys(style).join(", ")}`, why: args.why });
    return { ok: true, build, style: merged };
  }

  if (name === "flip_log") {
    const line = String(args.line ?? "").trim();
    if (!line) return { ok: false, error: "nothing to write" };
    await append(env, { line });
    return { ok: true };
  }

  return { ok: false, error: `no tool called ${name}` };
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env as unknown as Env;
  const path = String(params["*"] ?? "").split("/").filter(Boolean);
  if (path[0] !== KEY) return json({ ok: false, error: "no" }, 404);
  const what = path[1] ?? "";

  if (what === "board") return json((await read(env, "board")) ?? { items: [], at: null });
  if (what === "status") return json((await read(env, "status")) ?? {});
  if (what === "log") return json((await read(env, "log")) ?? { lines: [] });
  if (what === "knowledge") return json((await read(env, "knowledge")) ?? { files: [] });
  /* The face. The app asks every few seconds and takes anything newer. */
  if (what === "ui") return json((await read(env, "ui")) ?? { build: 0, html: null });

  /*
   * The tray, handed over but not yet thrown away.
   *
   * It used to clear on read. If the response was slow or the Mac's link
   * dropped — and the app gives up after ten seconds — the tray was already
   * empty and everything Claude had written in that window was gone for good,
   * with nothing anywhere saying so. The app acknowledges what it actually
   * received, and only then is it cleared.
   *
   * Handed-over ids are remembered, so `flip_board` does not offer the same
   * row back to Claude to be written a second time.
   */
  if (what === "work") {
    const now = ((await read(env, "work")) ?? {}) as {
      items?: Record<string, unknown>;
      handed?: string[];
    };
    const items = now.items ?? {};
    return json({ items, ids: Object.keys(items), handed: now.handed ?? [] });
  }

  if (!what) return json({ ok: true, app: "flip", base: BASE, endpoints: Object.keys(FILES) });
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
        serverInfo: { name: "flip", title: "flip", version: "1.0.0", websiteUrl: ORIGIN },
      });
    }
    /* A notification takes no response. Answering one with a result is a
       protocol error and strict clients reject the whole connection. */
    if (String(body.method ?? "").startsWith("notifications/")) {
      return new Response(null, { status: 202, headers: { "access-control-allow-origin": "*" } });
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
    const items = Array.isArray(body.items) ? body.items : [];
    await write(env, "board", { items, at: Date.now() });
    return json({ ok: true, items: items.length });
  }

  if (what === "status") {
    await write(env, "status", { ...body, at: Date.now() });
    return json({ ok: true });
  }

  /* The playbook, as the app found it on disk. Replaced whole rather than
     merged: a file he deleted should stop being read. */
  if (what === "knowledge") {
    const files = Array.isArray(body.files) ? body.files : [];
    await write(env, "knowledge", { files, at: Date.now() });
    await append(env, { line: `playbook published: ${files.length} file(s)` });
    return json({ ok: true, files: files.length });
  }

  /* The app saying what it actually has. Only these ids leave the tray. */
  if (what === "ack") {
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
    const now = ((await read(env, "work")) ?? {}) as {
      items?: Record<string, unknown>;
      handed?: string[];
    };
    const items = { ...(now.items ?? {}) };
    for (const id of ids) delete items[id];
    const handed = [...new Set([...(now.handed ?? []), ...ids])].slice(-500);
    await write(env, "work", { items, handed });
    return json({ ok: true, cleared: ids.length, left: Object.keys(items).length });
  }

  if (what === "log") {
    const lines = Array.isArray(body.lines) ? body.lines : [body];
    for (const line of lines.slice(-20)) {
      await append(env, typeof line === "string" ? { line } : (line as Record<string, unknown>));
    }
    return json({ ok: true });
  }

  if (what === "work") {
    const out = await callTool(env, "flip_write", body);
    return json(out);
  }

  return json({ ok: false, error: "no such thing here" }, 404);
}

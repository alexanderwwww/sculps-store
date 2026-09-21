/**
 * Organic's back end: a status board, an order desk, the brief, the log, the
 * app's own code, and an MCP server — all on one secret path.
 *
 * The same shape as OrganicX's control plane, and fresh: nothing in here is
 * shared with it. New key, new R2 slots (`og-*`), new tables (`og_*`), new
 * tool names (`organic_*`). The app on the Mac cannot be reached from here,
 * so the only way to know what it is doing is for it to say so after every
 * step — that is what `status` and `log` are.
 *
 * The routes:
 *
 *   GET  /organic/<key>/status    what the app is doing, and its last lines
 *   POST /organic/<key>/status    the app saying so
 *   GET  /organic/<key>/order     the app asking whether it has been told anything
 *   POST /organic/<key>/order     run, pause, stop, connect, update
 *   GET  /organic/<key>/brief     the standing instruction: products, market, platforms
 *   POST /organic/<key>/brief     a new one
 *   GET  /organic/<key>/log       what happened
 *   POST /organic/<key>/log       one more thing that happened
 *   GET  /organic/<key>/runtime   the app's own code and build number
 *   POST /organic/<key>/runtime   refused — only organic_push writes code
 *   GET  /organic/<key>/skills    what the crew has been taught, outside the code
 *   POST /organic/<key>/skills    a new set
 *   POST /organic/<key>/db        the app's memory: a named operation, never a query
 *   POST /organic/<key>/mcp       the same things as MCP tools
 *   GET  /organic/<key>/icon.png  the app's mark
 *
 * The key in the path is the whole of the authentication. Rotating it is
 * editing one line here.
 *
 * What is NOT here, on purpose: a password, a session cookie, or any platform
 * credential. The app drives a headless Chrome that Alex signed into himself
 * through the screens. Nothing logs in on his behalf and nothing to log in
 * with is ever stored — not on this Worker, not in R2, not in the repo.
 */
import type { Route } from "./+types/organic.$";
import { runOp } from "~/lib/organic-db.server";

/** Rotating this invalidates every client at once, which is the point. */
const KEY = "6pT0ha8Y_4_VdVyzThF96kJw2rXmcVU7";

/**
 * Every word the app will act on.
 *
 * `run` starts working on the brief. `pause` and `stop` are what they say.
 * `connect` puts a screen at its login page so Alex can sign in himself.
 * `update` makes the app pull the runtime and restart. `do` carries a job
 * written by organic_do.
 */
const ORDERS = ["run", "pause", "stop", "connect", "update", "do"] as const;

/** The three platforms, and nothing else is accepted anywhere in this file. */
const PLATFORMS = ["instagram", "tiktok", "youtube"] as const;
type Platform = (typeof PLATFORMS)[number];

/** The screens a hand-driven job may borrow. There is no fifth. */
const SCREENS = ["instagram", "tiktok", "youtube", "market"] as const;

const AUTONOMY = ["queue", "approve-then-run", "full-auto"] as const;

/**
 * The free-hand vocabulary.
 *
 * A vocabulary rather than `eval` on purpose. Handing the other end of a
 * network channel the ability to run arbitrary code on somebody's Mac is a
 * different product with a different risk, and this loses nothing: every
 * step is also readable in the log afterwards, which arbitrary code is not.
 */
const STEPS = ["goto", "find", "click", "type", "scroll", "wait", "say", "look", "back"] as const;

function stepError(step: unknown): string | null {
  if (!step || typeof step !== "object") return "each step must be an object";
  const { do: verb, value } = step as { do?: string; value?: unknown };
  if (!verb || !(STEPS as readonly string[]).includes(verb)) {
    return `not a step: ${verb ?? "(none)"} — one of ${STEPS.join(", ")}`;
  }
  if (verb === "goto") {
    let url: URL;
    try {
      url = new URL(String(value));
    } catch {
      return `not a URL: ${String(value)}`;
    }
    /* http and https only. A file:// or chrome:// would have the app reading
       the disk or its own settings, which is not what a screen is for. */
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return `only http and https: ${url.protocol}`;
    }
  }
  return null;
}

function orderError(cmd: string): string | null {
  if ((ORDERS as readonly string[]).includes(cmd)) return null;
  /* "connect tiktok" — put one screen at its login page rather than all. */
  const one = /^connect (\w+)$/.exec(cmd);
  if (one) {
    return (PLATFORMS as readonly string[]).includes(one[1]!)
      ? null
      : `not a platform: ${one[1]}`;
  }
  return `not an order: ${cmd}`;
}

/**
 * A file the runtime may carry. Worker code and its JSON beside it, the
 * UI's files under ui/, and a skill under skills/. One slash at most, only
 * in those positions, and never a "..": this writes to disk on somebody's
 * Mac, and a path in a filename is the one thing that must not get through.
 */
const RUNTIME_FILE = /^(ui\/)?[\w.-]+\.(mjs|json|html)$/;
const SKILL_FILE = /^skills\/[\w.-]+\.md$/;

function runtimeFileOk(name: string): boolean {
  return (RUNTIME_FILE.test(name) || SKILL_FILE.test(name)) && !name.includes("..");
}

const FILES = {
  status: "og-status.json",
  order: "og-control.json",
  brief: "og-brief.json",
  log: "og-log.json",
  /*
   * The app's own code, and the build number it belongs to. The worker reads
   * this every few seconds; when the build is above the one it is running,
   * it writes the files beside itself and exits 75, and the launcher brings
   * it back new. Written only by organic_push.
   */
  runtime: "og-runtime.json",
  /* What the crew has been taught, kept apart from the code so it can be
     read on its own. */
  skills: "og-skills.json",
  /*
   * What the app has asked for and cannot do itself — a picture, usually.
   * It raises the request and carries on; Claude answers it when next here.
   */
  asks: "og-asks.json",
} as const;

type Slot = keyof typeof FILES;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
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

/* ------------------------------------------------------------------- log */

/** A journal rather than an archive: the last few hundred lines. */
const LOG_KEEP = 400;

async function append(env: Env, entry: Record<string, unknown>) {
  const existing = (await read(env, "log")) as { entries?: unknown[] } | null;
  const entries = Array.isArray(existing?.entries) ? existing!.entries! : [];
  entries.push({ at: new Date().toISOString(), ...entry });
  await write(env, "log", { entries: entries.slice(-LOG_KEEP) });
}

/* ----------------------------------------------------------------- brief */

/**
 * The standing instruction, in the shape the SPEC fixes.
 *
 * A list of products and a list of market terms rather than one product:
 * the market screen searches for each, and the account screens derive their
 * hashtags from the products and the notes. Nothing store-specific lives in
 * the code; all of it is here.
 */
function strings(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === "string") return v.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
  return [];
}

function briefOf(args: Record<string, unknown>) {
  const platforms = strings(args.platforms).filter((p): p is Platform =>
    (PLATFORMS as readonly string[]).includes(p),
  );
  const lead = (PLATFORMS as readonly string[]).includes(String(args.lead))
    ? (args.lead as Platform)
    : (platforms[0] ?? "instagram");
  return {
    store: args.store == null ? null : String(args.store),
    // The storefront the crew opens first to see what is for sale. Products
    // are read from it, not typed here; `products` below is only a seed.
    storeUrl: /^https?:\/\//.test(String(args.storeUrl ?? "")) ? String(args.storeUrl) : null,
    products: strings(args.products),
    market: strings(args.market),
    platforms: platforms.length ? platforms : ["instagram", "tiktok"],
    lead,
    autonomy: (AUTONOMY as readonly string[]).includes(String(args.autonomy))
      ? String(args.autonomy)
      : "queue",
    notes: args.notes == null ? null : String(args.notes),
    setAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------- MCP */

const TOOLS = [
  {
    name: "organic_status",
    description:
      "What Organic is doing right now on Alex's Mac: which phase it is in (setup or " +
      "working), which screens are connected and as whom, which build it runs, and the " +
      "last lines it printed. Read this before answering anything about whether the app " +
      "is working.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "organic_order",
    description:
      "Tell Organic what to do right now. 'run' starts working on the brief. 'pause' and " +
      "'stop' are what they say. 'connect' or 'connect <platform>' puts a screen at its " +
      "login page so Alex signs in himself — no password is ever stored or typed by the " +
      "app. 'update' makes it pull a new build and restart itself. The app obeys within a " +
      "few seconds wherever it is.",
    inputSchema: {
      type: "object",
      properties: {
        cmd: {
          type: "string",
          description: "run | pause | stop | connect | connect <platform> | update",
        },
      },
      required: ["cmd"],
    },
  },
  {
    name: "organic_brief_set",
    description:
      "Set the standing instruction: which store, which products, which market terms to " +
      "research, which platforms, which one leads, and how far it may go without asking. " +
      "Everything store-specific lives here and nowhere in the code.",
    inputSchema: {
      type: "object",
      properties: {
        store: { type: "string" },
        storeUrl: {
          type: "string",
          description: "The storefront, e.g. https://blackreaper.us — the crew reads the products from it.",
        },
        products: {
          type: "array",
          items: { type: "string" },
          description: "Extra product names to hunt, on top of what the storefront shows.",
        },
        market: {
          type: "array",
          items: { type: "string" },
          description: "Search terms for the market screen, e.g. [\"halloween decoration\"].",
        },
        platforms: {
          type: "array",
          items: { type: "string", enum: [...PLATFORMS] },
        },
        lead: {
          type: "string",
          enum: [...PLATFORMS],
          description: "Which platform gets the effort when something has to give.",
        },
        autonomy: {
          type: "string",
          enum: [...AUTONOMY],
          description:
            "queue: nothing posts without Alex. approve-then-run: he approves the batch. " +
            "full-auto: the crew's own checks are the only approval.",
        },
        notes: { type: "string", description: "Free text; #tags in here seed the research." },
      },
      required: ["products"],
    },
  },
  {
    name: "organic_brief_get",
    description: "The standing instruction the app is working to.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "organic_accounts",
    description:
      "The account register, from the app's memory: which platforms are connected and as " +
      "which handle, when each was last used, how many days it has been warmed, and " +
      "whether one has hit friction — a captcha, a verification prompt, an action block — " +
      "and is therefore parked for the day.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "organic_findings",
    description:
      "What the research turned up: ads in the Ad Library (advertiser, when it started, " +
      "how long it has run), clips under the product hashtags, sellers, products. Filter by " +
      "product and by kind. Numbers are what was visible on the page — nothing in here is " +
      "a claim that was not read off a screen.",
    inputSchema: {
      type: "object",
      properties: {
        product: { type: "string" },
        kind: { type: "string", enum: ["ad", "clip", "seller", "product"] },
        limit: { type: "number", description: "Default 50." },
      },
    },
  },
  {
    name: "organic_log",
    description:
      "The crew ticker: who did what, newest last, in plain language. Not code. Filter by " +
      "who to follow one of them.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "number" }, who: { type: "string" } },
    },
  },
  {
    name: "organic_push",
    description:
      "Ship a change to the running app without Alex downloading anything. Give it the new " +
      "build number and the files that changed: worker code (name.mjs, name.json), the UI " +
      "(ui/index.html) or a skill (skills/name.md). The app sees the new build within a " +
      "few seconds, writes the files beside itself, and restarts. Only the files named are " +
      "replaced; everything else is left alone.",
    inputSchema: {
      type: "object",
      properties: {
        build: { type: "number", description: "Must be higher than the build it is running." },
        files: {
          type: "object",
          description:
            "Filename to source, e.g. { \"main.mjs\": \"...\", \"ui/index.html\": \"...\" }. " +
            "Names match ^(ui/)?[\\w.-]+\\.(mjs|json|html)$ or ^skills/[\\w.-]+\\.md$.",
        },
        note: { type: "string", description: "One line for the ticker: what changed." },
      },
      required: ["build", "files"],
    },
  },
  {
    name: "organic_do",
    description:
      "Drive the app by hand: a list of steps it carries out on one of its screens, at " +
      "human speed. Steps are goto (http/https only), find (a CSS selector or text), click, " +
      "type, scroll, wait, say (a line on the ticker), look (send back what is on screen) " +
      "and back. It runs on the market screen unless `screen` names an account screen, so " +
      "nothing touches a signed-in session by accident.",
    inputSchema: {
      type: "object",
      properties: {
        steps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              do: { type: "string", enum: [...STEPS] },
              value: { type: "string" },
              as: { type: "string", description: "Which crew name to show on the ticker." },
            },
            required: ["do"],
          },
        },
        screen: {
          type: "string",
          enum: [...SCREENS],
          description: "Which screen to borrow. Default market.",
        },
        why: { type: "string", description: "One line for the ticker." },
      },
      required: ["steps"],
    },
  },
  {
    name: "organic_ask",
    description:
      "What Organic has asked for that it cannot do itself — a picture it wants drawn, a " +
      "judgement it wants made. It raises the request on its own and carries on working; " +
      "Claude answers it when next here.",
    inputSchema: {
      type: "object",
      properties: { state: { type: "string", enum: ["open", "done", "failed", "all"] } },
    },
  },
  {
    name: "organic_answer",
    description:
      "Close one of Organic's requests by handing it what it asked for. The app picks it " +
      "up on its next pass without being restarted.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, result: { type: "object" }, error: { type: "string" } },
      required: ["id"],
    },
  },
] as const;

function databaseUrl(env: Env): string | null {
  return (env as unknown as { DATABASE_URL?: string }).DATABASE_URL ?? null;
}

async function callTool(env: Env, name: string, args: Record<string, unknown>) {
  switch (name) {
    case "organic_status":
      return (await read(env, "status")) ?? { state: "never started" };

    case "organic_order": {
      const cmd = String(args.cmd ?? "").trim();
      const bad = orderError(cmd);
      if (bad) return { ok: false, error: bad };
      await write(env, "order", { cmd, at: Date.now() });
      await append(env, { kind: "order", cmd });
      return { ok: true, sent: cmd };
    }

    case "organic_brief_set": {
      const brief = briefOf(args);
      if (!brief.products.length && !brief.storeUrl) return { ok: false, error: "a brief needs a storeUrl or at least one product" };
      await write(env, "brief", brief);
      await append(env, {
        kind: "brief",
        products: brief.products,
        market: brief.market,
        platforms: brief.platforms,
      });
      return { ok: true, brief };
    }

    case "organic_brief_get":
      return (await read(env, "brief")) ?? { brief: null };

    case "organic_accounts": {
      const url = databaseUrl(env);
      if (!url) return { ok: false, error: "the Worker has no DATABASE_URL" };
      const out = await runOp(url, "accounts", {});
      return out.ok ? { accounts: out.result } : out;
    }

    case "organic_findings": {
      const url = databaseUrl(env);
      if (!url) return { ok: false, error: "the Worker has no DATABASE_URL" };
      const out = await runOp(url, "findings", {
        product: args.product ?? null,
        kind: args.kind ?? null,
        limit: args.limit ?? 50,
      });
      return out.ok ? { findings: out.result } : out;
    }

    case "organic_log": {
      const store = ((await read(env, "log")) as { entries?: Record<string, unknown>[] } | null) ?? { entries: [] };
      const limit = Math.max(1, Math.min(LOG_KEEP, Number(args.limit ?? 60)));
      const who = String(args.who ?? "").toLowerCase();
      const all = store.entries ?? [];
      const rows = who ? all.filter((e) => String(e.who ?? "").toLowerCase() === who) : all;
      return { entries: rows.slice(-limit) };
    }

    case "organic_do": {
      const steps = Array.isArray(args.steps) ? args.steps : [];
      if (!steps.length) return { ok: false, error: "no steps" };
      for (const step of steps) {
        const bad = stepError(step);
        if (bad) return { ok: false, error: bad };
      }
      const screen = String(args.screen ?? "market");
      if (!(SCREENS as readonly string[]).includes(screen)) {
        return { ok: false, error: `not a screen: ${screen} — one of ${SCREENS.join(", ")}` };
      }
      const job = {
        id: crypto.randomUUID(),
        steps,
        screen,
        why: args.why ?? null,
        at: Date.now(),
      };
      await write(env, "order", { cmd: "do", job, at: Date.now() });
      await append(env, {
        who: "claude",
        did: args.why ? String(args.why) : `${steps.length} step${steps.length > 1 ? "s" : ""} by hand`,
      });
      return { ok: true, id: job.id, steps: steps.length };
    }

    case "organic_push": {
      const build = Number(args.build);
      if (!Number.isFinite(build) || build < 1) return { ok: false, error: "build must be a number" };
      const given = args.files;
      if (!given || typeof given !== "object" || Array.isArray(given)) {
        return { ok: false, error: "files must be an object of filename to source" };
      }
      const files: Record<string, string> = {};
      for (const [name, source] of Object.entries(given as Record<string, unknown>)) {
        if (!runtimeFileOk(name)) {
          return { ok: false, error: `not a filename this will write: ${name}` };
        }
        if (typeof source !== "string") {
          return { ok: false, error: `${name}: source must be a string` };
        }
        files[name] = source;
      }
      if (!Object.keys(files).length) return { ok: false, error: "no files" };
      await write(env, "runtime", { build, files, note: args.note ?? null, at: Date.now() });
      await append(env, {
        who: "claude",
        did: `shipped build ${build}${args.note ? ` — ${args.note}` : ""}`,
      });
      return { ok: true, build, files: Object.keys(files) };
    }

    case "organic_ask": {
      const store = ((await read(env, "asks")) as { asks?: Record<string, unknown>[] } | null) ?? { asks: [] };
      const want = String(args.state ?? "open");
      const asks = store.asks ?? [];
      return { asks: want === "all" ? asks : asks.filter((a) => (a.state ?? "open") === want) };
    }

    case "organic_answer": {
      const store = ((await read(env, "asks")) as { asks?: Record<string, unknown>[] } | null) ?? { asks: [] };
      const asks = store.asks ?? [];
      const ask = asks.find((a) => a.id === String(args.id));
      if (!ask) return { ok: false, error: "no request with that id" };
      ask.state = args.error ? "failed" : "done";
      ask.result = args.result ?? null;
      ask.error = args.error ?? null;
      ask.answeredAt = new Date().toISOString();
      await write(env, "asks", { asks });
      await append(env, {
        who: "claude",
        did: args.error ? `could not do it: ${args.error}` : "handed back what was asked for",
      });
      return { ok: true, ask };
    }

    default:
      return { ok: false, error: `no such tool: ${name}` };
  }
}

/* ---------------------------------------------------------------- routing */

export async function loader({ params, context, request }: Route.LoaderArgs) {
  const parts = (params["*"] ?? "").split("/").filter(Boolean);
  if (parts[0] !== KEY) return new Response("no", { status: 404 });
  const env = context.cloudflare.env;
  const what = parts[1] ?? "";

  /* The app's own mark, for any client that draws one next to a tool call. */
  if (what === "icon.png") {
    const obj = await env.MEDIA.get("og-icon.png");
    if (!obj) return new Response("no", { status: 404 });
    return new Response(obj.body, {
      headers: {
        "content-type": "image/png",
        "cache-control": "public, max-age=86400",
        "access-control-allow-origin": "*",
      },
    });
  }

  if (what === "log") {
    const store = ((await read(env, "log")) as { entries?: unknown[] } | null) ?? { entries: [] };
    const limit = Math.max(1, Math.min(LOG_KEEP, Number(new URL(request.url).searchParams.get("limit") ?? 60)));
    return json({ entries: (store.entries ?? []).slice(-limit) });
  }

  if (Object.hasOwn(FILES, what)) {
    const value = await read(env, what as Slot);
    /* An order is read once and then cleared, so the app never obeys the
       same "stop" every five seconds for the rest of the day. */
    if (what === "order" && value) await write(env, "order", null);
    return json(value ?? null);
  }

  return new Response("no", { status: 404 });
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const parts = (params["*"] ?? "").split("/").filter(Boolean);
  if (parts[0] !== KEY) return new Response("no", { status: 404 });
  const env = context.cloudflare.env;
  const what = parts[1] ?? "";

  if (request.method === "OPTIONS") return json({ ok: true });

  /*
   * The app's memory, answered here so the Mac never holds the database URL.
   * A name and its arguments in, a result out; the list of names is fixed in
   * organic-db.server.ts and nothing takes a query from the caller.
   */
  if (what === "db") {
    const body = (await request.json().catch(() => null)) as { op?: string; args?: Record<string, unknown> } | null;
    if (!body?.op) return json({ ok: false, error: "no op" }, 400);
    const url = databaseUrl(env);
    if (!url) return json({ ok: false, error: "the Worker has no DATABASE_URL" }, 500);
    const args = body.args && typeof body.args === "object" && !Array.isArray(body.args) ? body.args : {};
    return json(await runOp(url, String(body.op), args));
  }

  if (what === "mcp") {
    const body = ((await request.json().catch(() => ({}))) ?? {}) as {
      method?: string;
      id?: unknown;
      params?: { name?: string; arguments?: Record<string, unknown> };
    };
    const reply = (result: unknown) => json({ jsonrpc: "2.0", id: body.id ?? null, result });

    if (body.method === "initialize") {
      return reply({
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: {
          name: "organic",
          title: "Organic",
          version: "1.0.0",
          websiteUrl: "https://kerberos.gardenbuddystore.workers.dev",
          icons: [
            {
              src: `https://kerberos.gardenbuddystore.workers.dev/organic/${KEY}/icon.png`,
              mimeType: "image/png",
              sizes: ["256x256"],
            },
          ],
        },
      });
    }
    if (body.method === "tools/list") return reply({ tools: TOOLS });
    if (body.method === "tools/call") {
      const given = body.params?.arguments;
      const args = given && typeof given === "object" && !Array.isArray(given) ? given : {};
      const out = await callTool(env, String(body.params?.name ?? ""), args);
      return reply({ content: [{ type: "text", text: JSON.stringify(out, null, 2) }] });
    }
    return reply({});
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ ok: false, error: "not json" }, 400);

  if (what === "order") {
    const cmd = String(body.cmd ?? "").trim();
    const bad = orderError(cmd);
    if (bad) return json({ ok: false, error: bad }, 400);
    await write(env, "order", { cmd, at: Date.now() });
    await append(env, { kind: "order", cmd });
    return json({ ok: true, sent: cmd });
  }

  if (what === "log") {
    await append(env, body);
    return json({ ok: true });
  }

  /* The brief takes the same shape whichever door it comes through. */
  if (what === "brief") {
    const brief = briefOf(body);
    if (!brief.products.length && !brief.storeUrl) return json({ ok: false, error: "a brief needs a storeUrl or at least one product" }, 400);
    await write(env, "brief", brief);
    await append(env, { kind: "brief", products: brief.products, market: brief.market });
    return json({ ok: true, brief });
  }

  if (what === "asks") {
    const store = ((await read(env, "asks")) as { asks?: Record<string, unknown>[] } | null) ?? { asks: [] };
    const asks = store.asks ?? [];
    const ask = {
      id: String(body.id ?? crypto.randomUUID()),
      kind: String(body.kind ?? "picture"),
      /* Plain language, because a person reads this before Claude acts on it. */
      wants: String(body.wants ?? ""),
      context: (body.context as Record<string, unknown>) ?? {},
      state: "open",
      result: null as unknown,
      error: null as string | null,
      raisedAt: new Date().toISOString(),
      answeredAt: null as string | null,
    };
    const at = asks.findIndex((a) => a.id === ask.id);
    if (at >= 0) asks[at] = ask;
    else asks.push(ask);
    await write(env, "asks", { asks: asks.slice(-100) });
    await append(env, { who: "organic", did: `asked: ${ask.wants}` });
    return json({ ok: true, id: ask.id });
  }

  if (Object.hasOwn(FILES, what)) {
    /*
     * The runtime slot is code the app will execute. It is written only by
     * organic_push, which validates every filename; a raw POST here would
     * have skipped that check entirely, and a channel that writes code to
     * somebody's Mac does not get a second, unchecked door.
     */
    if (what === "runtime") return json({ ok: false, error: "use organic_push" }, 403);
    await write(env, what as Slot, body);
    return json({ ok: true });
  }

  return new Response("no", { status: 404 });
}

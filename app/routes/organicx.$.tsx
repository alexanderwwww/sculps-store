/**
 * OrganicX's back end: a status board, an order desk, the account register,
 * the persona store, the approval gate, and an MCP server — all on one secret
 * path.
 *
 * This is deliberately the same shape as the Magic Wand's control plane, and
 * for the same reason: the app on the Mac cannot be reached from here, so the
 * only way to know what it is doing is for it to say so after every step. The
 * wand proved that out over seventy builds. Nothing here re-derives it.
 *
 * What it carries that the wand's does not:
 *
 *   accounts   which platforms are connected, and when each was last used
 *   personas   the person behind each account, written once and then kept
 *   gate       what is waiting for four signatures, and what each one said
 *   log        what actually happened, in the order it happened
 *
 * The routes:
 *
 *   GET  /organicx/<key>/status    what the app is doing, and its last lines
 *   POST /organicx/<key>/status    the app saying so
 *   GET  /organicx/<key>/order     the app asking whether it has been told anything
 *   POST /organicx/<key>/order     run, pause, stop, connect, skip, update
 *   GET  /organicx/<key>/brief     the standing instruction: product, days, platforms
 *   POST /organicx/<key>/brief     a new one
 *   GET  /organicx/<key>/accounts  the register
 *   POST /organicx/<key>/accounts  the app updating it after a connect
 *   GET  /organicx/<key>/personas  every persona
 *   POST /organicx/<key>/personas  a persona, written once
 *   GET  /organicx/<key>/gate      what is waiting for approval
 *   POST /organicx/<key>/gate      queue something, or sign it off
 *   GET  /organicx/<key>/log       what happened
 *   POST /organicx/<key>/log       one more thing that happened
 *   GET  /organicx/<key>/runtime   the app's own code and build number
 *   POST /organicx/<key>/runtime   a new build, which the app installs itself
 *   POST /organicx/<key>/mcp       the same things as MCP tools
 *
 * The key in the path is the whole of the authentication. That is the right
 * amount for a channel whose worst case is somebody queueing a caption on a
 * laptop that is already logged in. Rotating it is editing one line here.
 *
 * What is NOT here, on purpose: a password, a session cookie, or any platform
 * credential. The app drives a Chrome that Alex logged into himself. Nothing
 * logs in on his behalf and nothing to log in with is ever stored — not on
 * this Worker, not in R2, not in the repo.
 */
import type { Route } from "./+types/organicx.$";

/** Rotating this invalidates every client at once, which is the point. */
const KEY = "q9DpKpatiPsqZc_sSQr5Vo-8UI4FR3ck";

/**
 * Every word the app will act on.
 *
 * `run` starts the brief. `pause` and `stop` are what they say. `connect`
 * opens the login pages so Alex can sign in himself. `skip` abandons the
 * current step. `update` makes the app pull the runtime and restart.
 */
const ORDERS = ["run", "pause", "stop", "connect", "skip", "update", "warm", "do"] as const;

/** The three platforms, and nothing else is accepted anywhere in this file. */
const PLATFORMS = ["tiktok", "instagram", "youtube"] as const;
type Platform = (typeof PLATFORMS)[number];

/**
 * The four signatures. None of them made the thing they are judging, and any
 * one of them can stop a post.
 *
 * They are stored by name rather than as a count because the point of the
 * gate is that Alex can read WHO refused and why. "Rejected 3-1" tells him
 * nothing; "Eli: this clip has been posted into the ground" tells him whether
 * it is a product problem, a creative problem, a safety problem or a brand
 * problem.
 */
const SIGNATURES = ["yusuf", "carla", "eli", "hana"] as const;
type Signature = (typeof SIGNATURES)[number];

/**
 * The free-hand vocabulary.
 *
 * The app is not a script with a fixed list of things it can do — it is a
 * browser with hands, and this is how it is told to use them. Enough to drive
 * anything: go somewhere, find something, click it, type into it, scroll,
 * wait, say something on the panel, send back what is on screen.
 *
 * A vocabulary rather than `eval` on purpose. Handing the other end of a
 * network channel the ability to run arbitrary code on somebody's Mac is a
 * different product with a different risk, and this loses nothing: every step
 * below is also readable in the log afterwards, which arbitrary code is not.
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
    /*
     * http and https only. A file:// or chrome:// sent down this channel
     * would have the app reading the disk or its own settings, which is not
     * what a browser with hands is for.
     */
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return `only http and https: ${url.protocol}`;
    }
  }
  return null;
}

function orderError(cmd: string): string | null {
  if ((ORDERS as readonly string[]).includes(cmd)) return null;
  /* "connect tiktok" — open one platform's login rather than all three. */
  const one = /^connect (\w+)$/.exec(cmd);
  if (one) {
    return (PLATFORMS as readonly string[]).includes(one[1]!)
      ? null
      : `not a platform: ${one[1]}`;
  }
  return `not an order: ${cmd}`;
}

const FILES = {
  status: "ox-status.json",
  order: "ox-control.json",
  brief: "ox-brief.json",
  accounts: "ox-accounts.json",
  personas: "ox-personas.json",
  gate: "ox-gate.json",
  log: "ox-log.json",
  /*
   * What the app has asked for and cannot do itself.
   *
   * The first of these is a picture: OrganicX wants a story card or a
   * thumbnail, Magic Wand is the thing on this Mac that draws, and both
   * already sit on the same Worker and the same bucket. So the app raises a
   * request and carries on working; Claude writes the wand's prompt — because
   * a prompt written without checking the product's real facts is exactly how
   * a black projector ended up in a white projector's listing — and hands the
   * finished key back here.
   */
  asks: "ox-asks.json",
  /*
   * The app's own code, and the build number it belongs to.
   *
   * This is the whole of "version one updates itself". The runner reads this
   * every few seconds; when the build is not the one it is running, it pulls
   * the files named here, writes them next to itself and exits with a code
   * its launcher restarts on. From the outside the app blinks and comes back
   * new. Magic Wand reached build 71 because every fix meant Alex
   * downloading a .app; this one takes a fix without him doing anything.
   */
  runtime: "ox-runtime.json",
} as const;

/** Where pulled clips and finished cuts land. */
const CLIPS = "ox-clips/";

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

/**
 * Append one line to the record of what happened.
 *
 * Capped, because this is a journal rather than an archive: the last few
 * hundred things the app did is what answers "why did it stop", and the
 * thousand before that answer nothing anybody asks.
 */
const LOG_KEEP = 400;

async function append(env: Env, entry: Record<string, unknown>) {
  const existing = (await read(env, "log")) as { entries?: unknown[] } | null;
  const entries = Array.isArray(existing?.entries) ? existing!.entries! : [];
  entries.push({ at: new Date().toISOString(), ...entry });
  await write(env, "log", { entries: entries.slice(-LOG_KEEP) });
}

/* --------------------------------------------------------------- accounts */

interface AccountRow {
  platform: Platform;
  handle: string;
  /** Set by the app once it has seen a logged-in session. Never a password. */
  connected: boolean;
  connectedAt: string | null;
  /** The persona's id, so two accounts on one product never behave alike. */
  personaId: string | null;
  /** The app writes this after every session, so a quiet account is visible. */
  lastSeenAt: string | null;
  /**
   * Set when the platform pushed back — a captcha, a verification prompt, an
   * action block. The app stops that account for the day rather than pushing
   * through, because pushing through is how accounts are lost.
   */
  friction: string | null;
  frictionAt: string | null;
}

function emptyAccounts(): { accounts: AccountRow[] } {
  return { accounts: [] };
}

/* ----------------------------------------------------------------- gate */

interface GateItem {
  id: string;
  /** What it is: a cut, a caption, a comment, a follow batch. */
  kind: string;
  platform: Platform;
  accountHandle: string;
  /** Everything the four need in order to judge it. */
  subject: Record<string, unknown>;
  /** name -> {ok, why}. Absent means not yet looked at. */
  signatures: Partial<Record<Signature, { ok: boolean; why: string }>>;
  /** Set once all four have signed, or as soon as one refuses. */
  verdict: "pending" | "approved" | "refused";
  /** Who refused, so Alex reads one line rather than a table. */
  refusedBy: Signature | null;
  queuedAt: string;
  decidedAt: string | null;
}

/**
 * Work out where an item stands from its signatures alone.
 *
 * Derived rather than stored, so a half-written verdict cannot disagree with
 * the signatures underneath it. One refusal is final — the gate is not a vote,
 * it is four people who can each stop a post.
 */
function verdictOf(item: GateItem): Pick<GateItem, "verdict" | "refusedBy"> {
  for (const name of SIGNATURES) {
    const sig = item.signatures?.[name];
    if (sig && !sig.ok) return { verdict: "refused", refusedBy: name };
  }
  const all = SIGNATURES.every((name) => item.signatures?.[name]?.ok);
  return { verdict: all ? "approved" : "pending", refusedBy: null };
}

/* ------------------------------------------------------------------- MCP */

const TOOLS = [
  {
    name: "organicx_status",
    description:
      "What OrganicX is doing right now on Alex's Mac: which account it is on, which step " +
      "of the loop, whether it is running, paused or waiting, and the last lines it " +
      "printed. Read this before answering anything about whether the app is working.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "organicx_order",
    description:
      "Tell OrganicX what to do right now. 'run' starts the brief. 'connect' opens the " +
      "login pages so Alex signs in himself — no password is ever stored or typed by the " +
      "app. 'warm' runs behaviour only, no posting. 'update' makes it pull a new build and " +
      "restart itself. The app obeys within a couple of seconds wherever it is.",
    inputSchema: {
      type: "object",
      properties: {
        cmd: {
          type: "string",
          description:
            "run | pause | stop | connect | connect <platform> | skip | warm | update",
        },
      },
      required: ["cmd"],
    },
  },
  {
    name: "organicx_brief_set",
    description:
      "Set the standing instruction: which store, which product, how many days, which " +
      "platforms, and how far it may go without asking. This is the big command — the crew " +
      "already know what a validation is, so the brief is three lines rather than forty.",
    inputSchema: {
      type: "object",
      properties: {
        store: { type: "string" },
        product: { type: "string", description: "The product name, or a link to it." },
        days: { type: "number", description: "The five-day rule's clock. Default 5." },
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
          enum: ["queue", "approve-then-run", "full-auto"],
          description:
            "queue: stops at the gate, nothing posts without Alex. approve-then-run: he " +
            "approves the batch, it posts overnight. full-auto: the gate is the only " +
            "approval.",
        },
        notes: { type: "string" },
      },
      required: ["product"],
    },
  },
  {
    name: "organicx_brief_get",
    description: "The standing instruction the app is working to.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "organicx_accounts",
    description:
      "The account register: which platforms are connected, which persona each carries, " +
      "when each was last used, and whether one has hit friction — a captcha, a " +
      "verification prompt, an action block — and is therefore parked for the day.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "organicx_gate",
    description:
      "What is waiting for four signatures, and what each of them said. Yusuf checks it is " +
      "actually our product, Carla the creative, Eli the provenance, Hana the house rules. " +
      "Any one of them can stop a post, and a refusal comes back as one line naming who.",
    inputSchema: {
      type: "object",
      properties: {
        verdict: { type: "string", enum: ["pending", "approved", "refused"] },
      },
    },
  },
  {
    name: "organicx_sign",
    description:
      "Put one of the four signatures on a gate item. Nobody signs their own work, so this " +
      "is only ever used by the inspectors, never by the studio.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        who: { type: "string", enum: [...SIGNATURES] },
        ok: { type: "boolean" },
        why: { type: "string", description: "One line Alex can read." },
      },
      required: ["id", "who", "ok", "why"],
    },
  },
  {
    name: "organicx_log",
    description:
      "The crew ticker: who did what, newest last, in plain language — 'Reyna: 34 accounts " +
      "in on #halloweendecor', 'Sam: @spookyhome, watched 14, liked 2, resting'. Not code. " +
      "Views are views — nothing in here is a claim that was not measured.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "number" }, who: { type: "string" } },
    },
  },
  {
    name: "organicx_do",
    description:
      "Drive the app by hand: a list of steps it carries out in its browser, at human " +
      "speed, with the cursor visible. Steps are goto (http/https only), find (a CSS " +
      "selector or text), click, type, scroll, wait, say (a line on the panel), look (send " +
      "back what is on screen) and back. Use it to try something the app has no routine " +
      "for yet, or to look at a page with it. It runs in the signed-out research browser " +
      "unless `account` names one, so nothing touches a logged-in session by accident.",
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
              as: { type: "string", description: "Which crew name to show on the panel." },
            },
            required: ["do"],
          },
        },
        account: {
          type: "string",
          description:
            "A handle, to run this as that account instead of signed out. Only for things " +
            "an account must do itself — research never needs it.",
        },
        why: { type: "string", description: "One line for the ticker." },
      },
      required: ["steps"],
    },
  },
  {
    name: "organicx_push",
    description:
      "Ship a change to the running app without Alex downloading anything. Give it the new " +
      "build number and the files that changed — including browser.mjs, which carries the " +
      "cursor and the on-screen panel, so the UI can be changed on the spot. The app sees " +
      "the new build within a couple of seconds, writes the files beside itself, and " +
      "restarts. Only the files named are replaced; everything else is left alone.",
    inputSchema: {
      type: "object",
      properties: {
        build: { type: "number", description: "Must be higher than the build it is running." },
        files: {
          type: "object",
          description: "Filename to source, e.g. { \"browser.mjs\": \"...\" }. No paths.",
        },
        note: { type: "string", description: "One line for the ticker: what changed." },
      },
      required: ["build", "files"],
    },
  },
  {
    name: "organicx_ask",
    description:
      "What OrganicX has asked for that it cannot do itself — most often a picture it wants " +
      "Magic Wand to draw for a story or a post. It raises the request on its own and carries " +
      "on working; Claude fulfils it when he is next here, writes the wand's prompt properly, " +
      "and hands the finished file back. The app never writes its own image prompt, because a " +
      "prompt written without checking the product's real facts is how a black projector ends " +
      "up in a white projector's listing.",
    inputSchema: {
      type: "object",
      properties: { state: { type: "string", enum: ["open", "done", "failed", "all"] } },
    },
  },
  {
    name: "organicx_answer",
    description:
      "Close one of OrganicX's requests by handing it what it asked for — usually the R2 key " +
      "of a picture Magic Wand has now drawn. The app picks it up on its next pass without " +
      "being restarted.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, result: { type: "object" }, error: { type: "string" } },
      required: ["id"],
    },
  },
] as const;

async function callTool(env: Env, name: string, args: Record<string, unknown>) {
  switch (name) {
    case "organicx_status":
      return (await read(env, "status")) ?? { state: "never started" };

    case "organicx_order": {
      const cmd = String(args.cmd ?? "").trim();
      const bad = orderError(cmd);
      if (bad) return { ok: false, error: bad };
      await write(env, "order", { cmd, at: Date.now() });
      await append(env, { kind: "order", cmd });
      return { ok: true, sent: cmd };
    }

    case "organicx_brief_set": {
      const brief = {
        store: args.store ?? null,
        product: String(args.product ?? ""),
        days: Number(args.days ?? 5),
        platforms: Array.isArray(args.platforms) && args.platforms.length
          ? args.platforms.filter((p): p is Platform =>
              (PLATFORMS as readonly string[]).includes(String(p)),
            )
          : [...PLATFORMS],
        lead: (PLATFORMS as readonly string[]).includes(String(args.lead))
          ? (args.lead as Platform)
          : "instagram",
        autonomy: ["queue", "approve-then-run", "full-auto"].includes(String(args.autonomy))
          ? String(args.autonomy)
          : "approve-then-run",
        notes: args.notes ?? null,
        setAt: new Date().toISOString(),
      };
      await write(env, "brief", brief);
      await append(env, { kind: "brief", product: brief.product, days: brief.days });
      return { ok: true, brief };
    }

    case "organicx_brief_get":
      return (await read(env, "brief")) ?? { brief: null };

    case "organicx_accounts":
      return (await read(env, "accounts")) ?? emptyAccounts();

    case "organicx_gate": {
      const store = ((await read(env, "gate")) as { items?: GateItem[] } | null) ?? { items: [] };
      const items = (store.items ?? []).map((item) => ({ ...item, ...verdictOf(item) }));
      const want = String(args.verdict ?? "");
      return { items: want ? items.filter((i) => i.verdict === want) : items };
    }

    case "organicx_sign": {
      const store = ((await read(env, "gate")) as { items?: GateItem[] } | null) ?? { items: [] };
      const items = store.items ?? [];
      const item = items.find((i) => i.id === String(args.id));
      if (!item) return { ok: false, error: "no gate item with that id" };
      const who = String(args.who) as Signature;
      if (!SIGNATURES.includes(who)) return { ok: false, error: `not one of the four: ${who}` };
      item.signatures = { ...(item.signatures ?? {}), [who]: { ok: Boolean(args.ok), why: String(args.why ?? "") } };
      Object.assign(item, verdictOf(item));
      if (item.verdict !== "pending" && !item.decidedAt) item.decidedAt = new Date().toISOString();
      await write(env, "gate", { items });
      await append(env, {
        kind: "signature",
        id: item.id,
        who,
        ok: Boolean(args.ok),
        why: String(args.why ?? ""),
      });
      return { ok: true, item };
    }

    case "organicx_log": {
      const store = ((await read(env, "log")) as { entries?: Record<string, unknown>[] } | null) ?? { entries: [] };
      const limit = Math.max(1, Math.min(LOG_KEEP, Number(args.limit ?? 60)));
      const who = String(args.who ?? "").toLowerCase();
      const all = store.entries ?? [];
      const rows = who ? all.filter((e) => String(e.who ?? "").toLowerCase() === who) : all;
      return { entries: rows.slice(-limit) };
    }

    case "organicx_do": {
      const steps = Array.isArray(args.steps) ? args.steps : [];
      if (!steps.length) return { ok: false, error: "no steps" };
      for (const step of steps) {
        const bad = stepError(step);
        if (bad) return { ok: false, error: bad };
      }
      const job = {
        id: crypto.randomUUID(),
        steps,
        account: args.account ?? null,
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

    case "organicx_push": {
      const build = Number(args.build);
      if (!Number.isFinite(build) || build < 1) return { ok: false, error: "build must be a number" };
      const given = (args.files ?? {}) as Record<string, string>;
      /*
       * Names only, never paths. This writes to disk on somebody's Mac, so a
       * "../" in a filename is the one thing that must not get through.
       */
      const files: Record<string, string> = {};
      for (const [name, source] of Object.entries(given)) {
        if (!/^[\w.-]+\.(mjs|json)$/.test(name) || name.includes("..")) {
          return { ok: false, error: `not a filename this will write: ${name}` };
        }
        files[name] = String(source);
      }
      if (!Object.keys(files).length) return { ok: false, error: "no files" };
      await write(env, "runtime", { build, files, note: args.note ?? null, at: Date.now() });
      await append(env, {
        who: "claude",
        did: `shipped build ${build}${args.note ? ` — ${args.note}` : ""}`,
      });
      return { ok: true, build, files: Object.keys(files) };
    }

    case "organicx_ask": {
      const store = ((await read(env, "asks")) as { asks?: Record<string, unknown>[] } | null) ?? { asks: [] };
      const want = String(args.state ?? "open");
      const asks = store.asks ?? [];
      return { asks: want === "all" ? asks : asks.filter((a) => (a.state ?? "open") === want) };
    }

    case "organicx_answer": {
      const store = ((await read(env, "asks")) as { asks?: Record<string, unknown>[] } | null) ?? { asks: [] };
      const asks = store.asks ?? [];
      const ask = asks.find((a) => a.id === String(args.id));
      if (!ask) return { ok: false, error: "no request with that id" };
      ask.state = args.error ? "failed" : "done";
      ask.result = args.result ?? null;
      ask.error = args.error ?? null;
      ask.answeredAt = new Date().toISOString();
      await write(env, "asks", { asks });
      await append(env, { who: "claude", did: args.error ? `could not do it: ${args.error}` : "handed back what was asked for" });
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
    const obj = await env.MEDIA.get("ox-icon.png");
    if (!obj) return new Response("no", { status: 404 });
    return new Response(obj.body, {
      headers: {
        "content-type": "image/png",
        "cache-control": "public, max-age=86400",
        "access-control-allow-origin": "*",
      },
    });
  }

  if (what === "clips") {
    const prefix = parts[2] ? `${CLIPS}${parts[2]}/` : CLIPS;
    const out: { key: string; name: string; size: number; uploaded: string }[] = [];
    let cursor: string | undefined;
    do {
      const page = await env.MEDIA.list({ prefix, cursor, limit: 500 });
      for (const o of page.objects) {
        out.push({
          key: o.key,
          name: o.key.slice(CLIPS.length),
          size: o.size,
          uploaded: o.uploaded.toISOString(),
        });
      }
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    out.sort((a, b) => a.key.localeCompare(b.key));
    return json({ clips: out });
  }

  if (what === "file") {
    const key = `${CLIPS}${parts.slice(2).join("/")}`;
    const obj = await env.MEDIA.get(key);
    if (!obj) return new Response("no", { status: 404 });
    return new Response(obj.body, {
      headers: {
        "content-type": obj.httpMetadata?.contentType ?? "application/octet-stream",
        "cache-control": "no-store",
        "access-control-allow-origin": "*",
      },
    });
  }

  if (what === "log") {
    const store = ((await read(env, "log")) as { entries?: unknown[] } | null) ?? { entries: [] };
    const limit = Math.max(1, Math.min(LOG_KEEP, Number(new URL(request.url).searchParams.get("limit") ?? 60)));
    return json({ entries: (store.entries ?? []).slice(-limit) });
  }

  if (what === "gate") {
    const store = ((await read(env, "gate")) as { items?: GateItem[] } | null) ?? { items: [] };
    return json({ items: (store.items ?? []).map((item) => ({ ...item, ...verdictOf(item) })) });
  }

  if (what in FILES) {
    const value = await read(env, what as Slot);
    /*
     * An order is read once and then cleared. Leaving it in place made the
     * app obey the same "stop" every two seconds for the rest of the day.
     */
    if (what === "order" && value) await write(env, "order", null);
    return json(value ?? (what === "accounts" ? emptyAccounts() : null));
  }

  return new Response("no", { status: 404 });
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const parts = (params["*"] ?? "").split("/").filter(Boolean);
  if (parts[0] !== KEY) return new Response("no", { status: 404 });
  const env = context.cloudflare.env;
  const what = parts[1] ?? "";

  if (request.method === "OPTIONS") return json({ ok: true });

  /* The pictures and clips themselves, sent up as they are made. */
  if (what === "file") {
    const key = `${CLIPS}${parts.slice(2).join("/")}`;
    await env.MEDIA.put(key, request.body, {
      httpMetadata: {
        contentType: request.headers.get("content-type") ?? "application/octet-stream",
        cacheControl: "no-store",
      },
    });
    return json({ ok: true, key });
  }

  if (what === "mcp") {
    const body = (await request.json()) as {
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
          name: "organicx",
          title: "OrganicX",
          version: "1.0.0",
          websiteUrl: "https://kerberos.gardenbuddystore.workers.dev",
          // Offered the way the spec allows, the same as the wand's. Whether a
          // given client draws it is the client's business, and nothing here
          // depends on it.
          icons: [
            {
              src: `https://kerberos.gardenbuddystore.workers.dev/organicx/${KEY}/icon.png`,
              mimeType: "image/png",
              sizes: ["256x256"],
            },
          ],
        },
      });
    }
    if (body.method === "tools/list") return reply({ tools: TOOLS });
    if (body.method === "tools/call") {
      const out = await callTool(env, String(body.params?.name ?? ""), body.params?.arguments ?? {});
      return reply({ content: [{ type: "text", text: JSON.stringify(out, null, 2) }] });
    }
    return reply({});
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return json({ ok: false, error: "not json" }, 400);

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

  if (what === "asks") {
    const store = ((await read(env, "asks")) as { asks?: Record<string, unknown>[] } | null) ?? { asks: [] };
    const asks = store.asks ?? [];
    const ask = {
      id: String(body.id ?? crypto.randomUUID()),
      /* "picture" is the only kind so far. Others take the same shape. */
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
    await append(env, { who: "organicx", did: `asked for a picture: ${ask.wants}` });
    return json({ ok: true, id: ask.id });
  }

  if (what === "gate") {
    const store = ((await read(env, "gate")) as { items?: GateItem[] } | null) ?? { items: [] };
    const items = store.items ?? [];
    const item: GateItem = {
      id: String(body.id ?? crypto.randomUUID()),
      kind: String(body.kind ?? "post"),
      platform: (PLATFORMS as readonly string[]).includes(String(body.platform))
        ? (body.platform as Platform)
        : "instagram",
      accountHandle: String(body.accountHandle ?? ""),
      subject: (body.subject as Record<string, unknown>) ?? {},
      signatures: {},
      verdict: "pending",
      refusedBy: null,
      queuedAt: new Date().toISOString(),
      decidedAt: null,
    };
    /* Re-queueing the same id replaces it rather than making a second row. */
    const at = items.findIndex((i) => i.id === item.id);
    if (at >= 0) items[at] = item;
    else items.push(item);
    await write(env, "gate", { items });
    await append(env, { kind: "gate-queued", id: item.id, what: item.kind });
    return json({ ok: true, id: item.id });
  }

  if (what in FILES) {
    await write(env, what as Slot, body);
    return json({ ok: true });
  }

  return new Response("no", { status: 404 });
}

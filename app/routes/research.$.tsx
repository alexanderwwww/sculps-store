/**
 * The research app's back end: a status board, an order desk, the hunt, the
 * log, the app's own code, the reports it publishes — and an MCP server, all
 * on one secret path.
 *
 * Nothing here is shared with the organic app. Its own key, its own R2 slots
 * (`rs-*`), its own tool names (`research_*`), and no database at all: this
 * app's evidence lives on the Mac and its reports live in R2. The Mac cannot
 * be reached from here, so the only way to know what it is doing is for it to
 * say so — that is what `status` and `log` are.
 *
 *   GET  /research/<key>/status    what it is doing, and its last lines
 *   POST /research/<key>/status    the app saying so
 *   GET  /research/<key>/order     the app asking whether it has been told anything
 *   POST /research/<key>/order     run, pause, stop, update
 *   GET  /research/<key>/hunt      what to look for, in Alex's words
 *   POST /research/<key>/hunt      a new thing to look for
 *   GET  /research/<key>/report    the latest report, as a page he can print
 *   POST /research/<key>/report    the app publishing one
 *   GET  /research/<key>/log       what happened
 *   GET  /research/<key>/runtime   the app's own code and build number
 *   GET  /research/<key>/skills    the judgement it works to
 *   POST /research/<key>/mcp       the same things as MCP tools
 *   GET  /research/<key>/icon.png  the app's mark
 *
 * The key in the path is the whole of the authentication. No password, no
 * cookie, no platform credential: Alex signs into anything himself, in the
 * window, and nothing to sign in with is ever stored here.
 */
import type { Route } from "./+types/research.$";

/** Rotating this invalidates every client at once, which is the point. */
const KEY = "SUSwMWKlnnu0jiEOVkEJuF1smRni9Lvk";

const ORIGIN = "https://kerberos.gardenbuddystore.workers.dev";
const BASE = `${ORIGIN}/research/${KEY}`;

/** Every word the app will act on. */
const ORDERS = ["run", "pause", "stop", "update"] as const;

const FILES = {
  status: "rs-status.json",
  order: "rs-control.json",
  hunt: "rs-hunt.json",
  log: "rs-log.json",
  runtime: "rs-runtime.json",
  skills: "rs-skills.json",
  report: "rs-report.json",
  reports: "rs-reports.json",
} as const;
type Slot = keyof typeof FILES;

type Env = { MEDIA: R2Bucket };

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "GET, POST, OPTIONS",
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

const LOG_KEEP = 400;

async function append(env: Env, entry: Record<string, unknown>) {
  const existing = (await read(env, "log")) as { entries?: unknown[] } | null;
  const entries = Array.isArray(existing?.entries) ? existing!.entries! : [];
  entries.push({ at: new Date().toISOString(), ...entry });
  await write(env, "log", { entries: entries.slice(-LOG_KEEP) });
}

/* ------------------------------------------------------------------ hunt */

/**
 * What he asked for, kept in his own words.
 *
 * `looking` is the sentence he typed. Everything else is optional and nothing
 * is filled in on his behalf: a hunt with no target is a hunt with no target,
 * and the report says the arithmetic could not be done rather than inventing
 * a number to do it with.
 */
function huntOf(body: Record<string, unknown>) {
  const looking = String(body.looking ?? body.what ?? "").trim();
  const target = Number(body.targetPerDay ?? body.target ?? 0);
  return {
    id: String(body.id ?? crypto.randomUUID()),
    looking,
    targetPerDay: Number.isFinite(target) && target > 0 ? target : null,
    window: body.window ? String(body.window).trim() : null,
    terms: Array.isArray(body.terms) ? body.terms.map((t) => String(t).trim()).filter(Boolean).slice(0, 12) : [],
    depth: Math.max(1, Math.min(10, Number(body.depth ?? 5))),
    at: Date.now(),
  };
}

/* ---------------------------------------------------------------- report */

const money = (n: unknown) =>
  typeof n === "number" && Number.isFinite(n) ? n.toLocaleString("en-US") : null;

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

type Candidate = {
  query: string; score: number; thin: boolean; verdict: string;
  longestRunDays: number; provenSellers: number; sellers: number; ads: number;
  clips: number; bestViews: number;
  topSellers?: { who: string; days: number; url: string | null }[];
  topClips?: { url: string | null; who: string | null; views: number; platform: string | null }[];
  topAds?: { who: string | null; days: number; text: string; url: string | null }[];
  math?: { known: boolean; note?: string; why?: string; ordersPerDay?: number; price?: number };
};

/**
 * The report as a page, built for paper as much as for the screen.
 *
 * He asked for a PDF; a page that prints to one in a keystroke is the same
 * thing without a PDF library on a Worker. The print stylesheet is the point,
 * not decoration: A4, black on white, links spelled out, nothing cut in half.
 */
function reportPage(report: Record<string, unknown> | null) {
  if (!report) {
    return `<!doctype html><meta charset="utf-8"><title>No report yet</title>
      <style>body{font:16px -apple-system,system-ui,sans-serif;margin:12vh auto;max-width:36rem;padding:0 1.5rem;color:#1c1c1e}</style>
      <h1>No report yet</h1><p>Nothing has been hunted for yet. Tell the app what to look for and it will publish one here.</p>`;
  }
  const r = report as {
    looking?: string; at?: number; targetPerDay?: number | null; window?: string | null;
    seen?: { findings?: number; candidates?: number };
    best?: Candidate | null; nothingSolid?: boolean; candidates?: Candidate[];
  };
  const when = r.at ? new Date(r.at).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" }) : "";
  const best = r.best ?? null;

  const evidence = (c: Candidate) => `
    <table class="ev">
      <tr><th>Advertisers past 28 days</th><td>${c.provenSellers} of ${c.sellers}</td></tr>
      <tr><th>Longest ad running</th><td>${c.longestRunDays ? `${c.longestRunDays} days` : "not readable"}</td></tr>
      <tr><th>Ads seen</th><td>${c.ads}</td></tr>
      <tr><th>Clips seen</th><td>${c.clips}${c.bestViews ? ` · best ${money(c.bestViews)} views` : ""}</td></tr>
      ${c.math?.known ? `<tr><th>To hit the target</th><td>${esc(c.math.note)}</td></tr>`
        : `<tr><th>Arithmetic</th><td>Not possible: ${esc(c.math?.why ?? "not enough was read")}</td></tr>`}
    </table>
    ${(c.topSellers ?? []).length ? `<h4>Who is paying for it</h4><ul>${(c.topSellers ?? []).map((s) =>
      `<li>${esc(s.who)} — ${s.days} days${s.url ? ` · <a href="${esc(s.url)}">ad library</a>` : ""}</li>`).join("")}</ul>` : ""}
    ${(c.topClips ?? []).length ? `<h4>What people watch</h4><ul>${(c.topClips ?? []).map((cl) =>
      `<li>${cl.views ? `${money(cl.views)} views` : "views not readable"}${cl.who ? ` · ${esc(cl.who)}` : ""}${cl.platform ? ` · ${esc(cl.platform)}` : ""}${cl.url ? ` · <a href="${esc(cl.url)}">${esc(cl.url)}</a>` : ""}</li>`).join("")}</ul>` : ""}`;

  return `<!doctype html><html lang="en"><meta charset="utf-8">
<title>Product research — ${esc(r.looking ?? "")}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root { --ink:#141417; --soft:#5b5b66; --line:#e4e4ea; --violet:#7b3fe4; }
  *{box-sizing:border-box}
  body{font:16px/1.55 -apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif;
       color:var(--ink);margin:0;background:#fff;}
  main{max-width:46rem;margin:0 auto;padding:3.5rem 1.6rem 6rem;}
  .kicker{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--violet);font-weight:700;}
  h1{font-size:2rem;line-height:1.15;margin:.35rem 0 .2rem;letter-spacing:-.02em;}
  .asked{color:var(--soft);margin:0 0 2rem;}
  .verdict{border-left:3px solid var(--violet);padding:.1rem 0 .1rem 1rem;margin:0 0 2rem;}
  .verdict h2{font-size:1.35rem;margin:0 0 .35rem;}
  h3{font-size:1.05rem;margin:2.2rem 0 .5rem;}
  h4{font-size:.8rem;text-transform:uppercase;letter-spacing:.07em;color:var(--soft);margin:1.1rem 0 .3rem;}
  table.ev{border-collapse:collapse;width:100%;margin:.6rem 0;}
  table.ev th{text-align:left;font-weight:600;color:var(--soft);width:14rem;
              padding:.35rem .6rem .35rem 0;vertical-align:top;font-size:.92rem;}
  table.ev td{padding:.35rem 0;border-bottom:1px solid var(--line);}
  ul{margin:.3rem 0 0;padding-left:1.1rem;} li{margin:.15rem 0;}
  a{color:var(--violet);word-break:break-all;}
  .thin{color:var(--soft);}
  .card{border:1px solid var(--line);border-radius:14px;padding:1.1rem 1.3rem;margin:1rem 0;}
  footer{margin-top:3rem;color:var(--soft);font-size:.85rem;border-top:1px solid var(--line);padding-top:1rem;}
  @media print {
    @page { size: A4; margin: 18mm 16mm; }
    body{font-size:11pt;} main{padding:0;max-width:none;}
    a{color:#000;text-decoration:underline;}
    .card,.verdict{break-inside:avoid;} h3{break-after:avoid;}
  }
</style>
<main>
  <div class="kicker">Product research</div>
  <h1>${esc(r.looking ?? "")}</h1>
  <p class="asked">${when}${r.targetPerDay ? ` · target ${money(r.targetPerDay)} a day` : ""}${r.window ? ` · ${esc(r.window)}` : ""} · ${r.seen?.findings ?? 0} things seen across ${r.seen?.candidates ?? 0} candidates</p>

  ${best ? `<div class="verdict"><h2>${esc(best.query)}</h2><p>${esc(best.verdict)}</p></div>
  ${evidence(best)}` : `<div class="verdict"><h2>Nothing solid yet</h2>
    <p>The sweep did not find a product with enough behind it to recommend. That is a result, not a failure — it means another sweep, wider words, or a different market.</p></div>`}

  <h3>Everything else the sweep saw</h3>
  ${(r.candidates ?? []).filter((c) => !best || c.query !== best.query).map((c) => `
    <div class="card">
      <strong>${esc(c.query)}</strong>${c.thin ? ' <span class="thin">— thin</span>' : ""}
      <p class="thin">${esc(c.verdict)}</p>
      ${evidence(c)}
    </div>`).join("") || '<p class="thin">Nothing else was seen.</p>'}

  <footer>Every number here came off a page that was loaded during the sweep. Where something could not be read it says so rather than guessing. Print this page to get it as a PDF.</footer>
</main></html>`;
}

/* ------------------------------------------------------------------- MCP */

const TOOLS = [
  {
    name: "research_hunt",
    description:
      "Send the app looking for a product. `looking` is what to find, in plain words. Add `targetPerDay` (what the product has to make in a day) and `window` (how long the season has left) and the report does the arithmetic against them. Nothing is assumed: leave them out and the report says the sums could not be done.",
    inputSchema: {
      type: "object",
      properties: {
        looking: { type: "string", description: "What to find, in plain words." },
        targetPerDay: { type: "number", description: "What it has to make per day, in whatever currency the prices are in." },
        window: { type: "string", description: "How long is left, e.g. '6 weeks to Halloween'." },
        terms: { type: "array", items: { type: "string" }, description: "Extra search terms to include." },
        depth: { type: "number", description: "How many searches to run, 1-10. Default 5." },
      },
      required: ["looking"],
    },
  },
  {
    name: "research_status",
    description: "What the research app is doing right now on Alex's Mac: whether it is sweeping, what it is looking for, which build it runs, and its last lines. Read this before answering anything about whether it is working.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "research_report",
    description: "The last report it published: the best candidate, the evidence behind it, and the link to the printable page.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "research_order",
    description: "Tell the app what to do right now: run, pause, stop, or update (pull a new build and restart).",
    inputSchema: {
      type: "object",
      properties: { cmd: { type: "string", description: "run | pause | stop | update" } },
      required: ["cmd"],
    },
  },
  {
    name: "research_log",
    description: "What the app has said lately, oldest first.",
    inputSchema: { type: "object", properties: { limit: { type: "number" } } },
  },
  {
    name: "research_skills",
    description: "Read or replace the judgement the app works to — how it reads the Ad Library, what makes a product worth selling, the margin maths, what a report must contain. Markdown files, pushed to the app without it downloading anything.",
    inputSchema: {
      type: "object",
      properties: {
        files: { type: "object", description: "name.md -> markdown. Leave out to read what is there." },
      },
    },
  },
] as const;

async function callTool(env: Env, name: string, args: Record<string, unknown>) {
  switch (name) {
    case "research_status": {
      const status = (await read(env, "status")) ?? null;
      return status ?? { state: "never reported", note: "the app has not said anything yet" };
    }
    case "research_report": {
      const latest = (await read(env, "report")) as { report?: unknown } | null;
      return latest ? { url: `${BASE}/report`, ...latest } : { url: `${BASE}/report`, report: null };
    }
    case "research_hunt": {
      const hunt = huntOf(args);
      if (!hunt.looking) return { ok: false, error: "say what to look for" };
      await write(env, "hunt", hunt);
      await append(env, { kind: "hunt", looking: hunt.looking, targetPerDay: hunt.targetPerDay });
      return { ok: true, hunt, note: "the app picks this up within a few seconds and starts sweeping" };
    }
    case "research_order": {
      const cmd = String(args.cmd ?? "").trim();
      if (!ORDERS.includes(cmd as (typeof ORDERS)[number])) return { ok: false, error: `orders are: ${ORDERS.join(", ")}` };
      await write(env, "order", { cmd, at: Date.now() });
      await append(env, { kind: "order", cmd });
      return { ok: true, sent: cmd };
    }
    case "research_log": {
      const store = ((await read(env, "log")) as { entries?: unknown[] } | null) ?? { entries: [] };
      const limit = Math.max(1, Math.min(LOG_KEEP, Number(args.limit ?? 60)));
      return { entries: (store.entries ?? []).slice(-limit) };
    }
    case "research_skills": {
      const given = args.files;
      if (!given || typeof given !== "object" || Array.isArray(given)) {
        return (await read(env, "skills")) ?? { files: {} };
      }
      const files: Record<string, string> = {};
      for (const [k, v] of Object.entries(given as Record<string, unknown>)) {
        if (!/^[\w.-]+\.md$/.test(k)) return { ok: false, error: `not a skill file: ${k}` };
        files[k] = String(v);
      }
      await write(env, "skills", { files, at: Date.now() });
      return { ok: true, files: Object.keys(files) };
    }
    default:
      return { ok: false, error: `no such tool: ${name}` };
  }
}

/* ---------------------------------------------------------------- routes */

export async function loader({ params, context, request }: Route.LoaderArgs) {
  const parts = (params["*"] ?? "").split("/").filter(Boolean);
  if (parts[0] !== KEY) return new Response("no", { status: 404 });
  const env = context.cloudflare.env as unknown as Env;
  const what = parts[1] ?? "";

  if (what === "icon.png" || what === "icon-256.png") {
    const obj = await env.MEDIA.get(what === "icon-256.png" ? "rs-icon-256.png" : "rs-icon-512.png");
    if (!obj) return new Response("no", { status: 404 });
    return new Response(obj.body, {
      headers: {
        "content-type": "image/png",
        "cache-control": "public, max-age=86400",
        "access-control-allow-origin": "*",
      },
    });
  }

  /* The report is a page, because he reads it and prints it. */
  if (what === "report") {
    const latest = (await read(env, "report")) as { report?: Record<string, unknown> } | null;
    if (new URL(request.url).searchParams.get("json")) return json(latest ?? null);
    return new Response(reportPage(latest?.report ?? null), {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }

  if (what === "log") {
    const store = ((await read(env, "log")) as { entries?: unknown[] } | null) ?? { entries: [] };
    const limit = Math.max(1, Math.min(LOG_KEEP, Number(new URL(request.url).searchParams.get("limit") ?? 60)));
    return json({ entries: (store.entries ?? []).slice(-limit) });
  }

  if (Object.hasOwn(FILES, what)) {
    const value = await read(env, what as Slot);
    /* An order is read once and then cleared, so the app never obeys the same
       "stop" every few seconds for the rest of the day. */
    if (what === "order" && value) await write(env, "order", null);
    return json(value ?? null);
  }

  return new Response("no", { status: 404 });
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const parts = (params["*"] ?? "").split("/").filter(Boolean);
  if (parts[0] !== KEY) return new Response("no", { status: 404 });
  const env = context.cloudflare.env as unknown as Env;
  const what = parts[1] ?? "";

  if (request.method === "OPTIONS") return json({ ok: true });

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
          name: "research",
          title: "Product Research",
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
      const args = given && typeof given === "object" && !Array.isArray(given) ? given : {};
      const out = await callTool(env, String(body.params?.name ?? ""), args);
      return reply({ content: [{ type: "text", text: JSON.stringify(out, null, 2) }] });
    }
    return reply({});
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ ok: false, error: "not json" }, 400);

  if (what === "status") {
    await write(env, "status", { ...body, at: Date.now() });
    return json({ ok: true });
  }

  if (what === "order") {
    const cmd = String(body.cmd ?? "").trim();
    if (!ORDERS.includes(cmd as (typeof ORDERS)[number])) return json({ ok: false, error: `orders are: ${ORDERS.join(", ")}` }, 400);
    await write(env, "order", { cmd, at: Date.now() });
    return json({ ok: true, sent: cmd });
  }

  if (what === "hunt") {
    const hunt = huntOf(body);
    if (!hunt.looking) return json({ ok: false, error: "say what to look for" }, 400);
    await write(env, "hunt", hunt);
    await append(env, { kind: "hunt", looking: hunt.looking });
    return json({ ok: true, hunt });
  }

  if (what === "log") {
    const lines = Array.isArray(body.lines) ? body.lines : [body];
    for (const line of lines.slice(-20)) await append(env, typeof line === "string" ? { line } : (line as Record<string, unknown>));
    return json({ ok: true });
  }

  /* A published report, kept as the latest and in a short list of the ones
     before it — a sweep from last week is still worth comparing against. */
  if (what === "report") {
    const report = body.report && typeof body.report === "object" ? body.report : null;
    if (!report) return json({ ok: false, error: "no report" }, 400);
    const entry = { id: String(body.id ?? crypto.randomUUID()), at: Date.now(), report };
    await write(env, "report", entry);
    const list = ((await read(env, "reports")) as { reports?: unknown[] } | null) ?? { reports: [] };
    await write(env, "reports", { reports: [...(list.reports ?? []), { id: entry.id, at: entry.at, looking: (report as { looking?: string }).looking ?? null }].slice(-40) });
    await append(env, { kind: "report", looking: (report as { looking?: string }).looking ?? null });
    return json({ ok: true, url: `${BASE}/report` });
  }

  /* Code is pushed, never posted: the runtime slot is written by hand from
     the checkout, the same way the organic app's is. */
  if (what === "runtime") return json({ ok: false, error: "the runtime is not written through this door" }, 403);

  return new Response("no", { status: 404 });
}

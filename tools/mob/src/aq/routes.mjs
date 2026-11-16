// Aquarius routes (CONTRACT.md). Page and assets behind the admin session like /city; /api/aq/* also takes bearer MOB_API_TOKEN;
// the helper inbox and briefing also take AQUARIUS_KEY (same key as /api/aquarius) so Grok/ChatGPT bridges can post evidence.
import { db } from "../db.mjs";
import { AQ_PAGE, AQ_JS } from "../aq-bundle.mjs";
import { buildState, createBot, helperMessage, briefing, ensureSeed, rebuild, sellAll } from "./engine.mjs";
import { helperMcp, createTask } from "./mcp.mjs";
import { safeEqual } from "../auth.mjs";

const TYPES = { glb: "model/gltf-binary", gltf: "model/gltf+json", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", ktx2: "image/ktx2",
  json: "application/json", js: "text/javascript", mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav", bin: "application/octet-stream", hdr: "application/octet-stream", svg: "image/svg+xml" };

export async function aqPage(req, env, path, { json, html }) {
  if (req.method !== "GET") return json({ error: { message: "read-only" } }, 405);
  if (path === "/aq") return html(AQ_PAGE, 200, { "content-security-policy": "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' blob: data:; worker-src 'self' blob:", "x-robots-tag": "noindex" });
  if (path === "/aq/app.js") return new Response(AQ_JS, { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" } });
  const m = path.match(/^\/aq\/assets\/([A-Za-z0-9._\/-]+)$/);
  if (m && !m[1].split("/").includes("..")) {
    const o = env.MEDIA && (await env.MEDIA.get(`aq/${m[1]}`));
    if (!o) return new Response("not found", { status: 404 });
    const ext = m[1].split(".").pop().toLowerCase();
    return new Response(o.body, { headers: { "content-type": TYPES[ext] || "application/octet-stream", "cache-control": "private, max-age=604800, immutable" } });
  }
  return json({ error: { message: "not found" } }, 404);
}

export async function aqApi(req, env, url, path, { json, apiErr, admin, bearer, keyOk }) {
  const M = req.method;
  const body = async () => { try { return await req.json(); } catch { return null; } };
  const hm = path.match(/^\/api\/aq\/helper\/([^/]+)\/mcp$/);
  if (hm) {
    // Link + access code for ChatGPT / Codex / Grok. Unset secret or wrong key = 404 (nothing to discover).
    if (!env.AQ_HELPER_KEY || !safeEqual(hm[1], env.AQ_HELPER_KEY)) return new Response("Not found", { status: 404 });
    return helperMcp(req, env, { json });
  }
  if ((path === "/api/aq/helper" || path === "/api/aq/briefing") && !(admin || bearer || keyOk)) return apiErr(401, "unauthorized", "Admin session, bearer MOB_API_TOKEN or AQUARIUS_KEY required");
  if (path === "/api/aq/helper" && M === "POST") { const r = await helperMessage(env, await body()); return r.error ? apiErr(400, "validation", r.error) : json(r, 201); }
  if (path === "/api/aq/briefing" && M === "GET") return new Response(await briefing(env), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  if (!(admin || bearer)) return apiErr(401, "unauthorized", "Admin session or bearer MOB_API_TOKEN required");
  if (path === "/api/aq/state" && M === "GET") return json(await buildState(env));
  if (path === "/api/aq/bots" && M === "POST") { const r = await createBot(env, await body()); return r.error ? apiErr(400, "validation", r.error) : json(r, 201); }
  if (path === "/api/aq/sellall" && M === "POST") return admin ? json(await sellAll(env)) : apiErr(403, "forbidden", "Only Alex (admin session) can sell all");
  if (path === "/api/aq/rebuild" && M === "POST") return admin ? json(await rebuild(env)) : apiErr(403, "forbidden", "Only Alex (admin session) can rebuild the island");
  if (path === "/api/aq/tasks" && M === "POST") { const r = await createTask(env, await body(), admin ? "alex" : "brain"); return r.error ? apiErr(400, "validation", r.error) : json(r, 201); }
  if (path === "/api/aq/kill" && M === "POST") {
    const b = await body();
    if (typeof b?.on !== "boolean") return apiErr(400, "validation", "on must be true or false");
    await ensureSeed(env);
    await db(env).q(`INSERT INTO mob_aq_state (k, v, at) VALUES ('kill', $1, now()) ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v, at=now()`, [JSON.stringify(b.on)]);
    await db(env).q(`INSERT INTO mob_aq_brain (dept, kind, text) VALUES ('risk','event',$1)`, [`Kill switch turned ${b.on ? "ON" : "off"} by the CEO.`]);
    return json({ killSwitch: b.on });
  }
  return apiErr(404, "not_found", "No such endpoint");
}

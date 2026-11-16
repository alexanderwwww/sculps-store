// Aquarius routes (CONTRACT.md). Page and assets behind the admin session like /city; /api/aq/* also takes bearer MOB_API_TOKEN;
// the helper inbox and briefing also take AQUARIUS_KEY (same key as /api/aquarius) so Grok/ChatGPT bridges can post evidence.
import { db } from "../db.mjs";
import { AQ_PAGE, AQ_JS } from "../aq-bundle.mjs";
import { buildState, createBot, helperMessage, briefing, ensureSeed, rebuild, sellAll } from "./engine.mjs";
import { helperMcp, createTask } from "./mcp.mjs";
import { diag } from "./diag.mjs";
import { chatPost, chatRead, SEATS } from "./seat.mjs";
import { setTraining, trainingState } from "./arena.mjs";
import { safeEqual } from "../auth.mjs";

const DROP_MAX = 95 * 1024 * 1024;
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
  // File drop-off (ChatGPT has no GitHub): PUT a .zip with the access code, list, read back. Nothing else.
  const dm = path.match(/^\/api\/aq\/drop\/([^/]+)(?:\/([^/]+))?$/);
  if (dm) {
    if (!env.AQ_DROP_KEY || !safeEqual(dm[1], env.AQ_DROP_KEY) || !env.MEDIA) return new Response("Not found", { status: 404 });
    const name = dm[2] ? decodeURIComponent(dm[2]) : null;
    if (M === "PUT" && name) {
      if (!/^[A-Za-z0-9._-]{1,80}\.zip$/.test(name)) return apiErr(400, "validation", "name must be letters, digits, dot, dash or underscore and end in .zip");
      const len = Number(req.headers.get("content-length") || 0);
      if (len > DROP_MAX) return apiErr(413, "too_large", "95 MB at most");
      if (!req.body) return apiErr(400, "validation", "empty body");
      const key = `aq-drop/${Date.now()}-${name}`;
      await env.MEDIA.put(key, req.body, { httpMetadata: { contentType: "application/zip" } });
      const h = await env.MEDIA.head(key);
      if (h && h.size > DROP_MAX) { await env.MEDIA.delete?.(key); return apiErr(413, "too_large", "95 MB at most"); }
      return json({ ok: true, key, size: h ? h.size : len });
    }
    if (M === "GET" && !name) {
      const l = await env.MEDIA.list({ prefix: "aq-drop/", limit: 200 });
      return json({ files: l.objects.map((o) => ({ name: o.key.slice(8), size: o.size, uploaded: o.uploaded })) });
    }
    if (M === "GET" && /^[A-Za-z0-9._-]{1,120}\.zip$/.test(name)) {
      const o = await env.MEDIA.get(`aq-drop/${name}`);
      return o ? new Response(o.body, { headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" } }) : new Response("Not found", { status: 404 });
    }
    return apiErr(405, "method_not_allowed", "PUT a .zip, GET the list, or GET one file");
  }
  // Feed diagnostic with the helper access code: asks a FIXED list of public data sources from this Worker and reports the
  // status and the first bytes, so "does it answer from production" is read, never guessed. No URL comes from the caller.
  const gm = path.match(/^\/api\/aq\/helper\/([^/]+)\/diag$/);
  if (gm) {
    if (!env.AQ_HELPER_KEY || !safeEqual(gm[1], env.AQ_HELPER_KEY)) return new Response("Not found", { status: 404 });
    return json(await diag(env));
  }
  const hm = path.match(/^\/api\/aq\/helper\/([^/]+)\/mcp$/);
  if (hm) {
    // Link + access code for ChatGPT / Codex / Grok. Unset secret or wrong key = 404 (nothing to discover).
    if (!env.AQ_HELPER_KEY || !safeEqual(hm[1], env.AQ_HELPER_KEY)) return new Response("Not found", { status: 404 });
    return helperMcp(req, env, { json });
  }
  // War room. Who is speaking comes from HOW the caller is signed in, never from the message: Alex's admin session = "alex";
  // bearer MOB_API_TOKEN = "claude"; the helper access code (header x-aq-helper-key) = the helper it names, "claude" included
  // (Claude's own sessions hold that code), never "alex".
  if (path === "/api/aq/chat" || path === "/api/aq/chat/read") {
    const b = M === "POST" ? await body() : null, hk = req.headers.get("x-aq-helper-key") || "";
    const viaKey = !!env.AQ_HELPER_KEY && !!hk && safeEqual(hk, env.AQ_HELPER_KEY);
    const named = String((M === "POST" ? b?.helper : url.searchParams.get("helper")) || "").toLowerCase();
    if (!(admin || bearer || viaKey)) return apiErr(401, "unauthorized", "Admin session, bearer MOB_API_TOKEN or the helper access code required");
    if (!admin && !bearer && !["claude", ...SEATS].includes(named)) return apiErr(403, "forbidden", `with the helper access code, helper must be one of claude, ${SEATS.join(", ")}`);
    const who = admin ? "alex" : bearer ? "claude" : named;
    await ensureSeed(env);
    if (path === "/api/aq/chat" && M === "POST") { const r = await chatPost(env, who, { text: b?.text, to: b?.to }); return r.error ? apiErr(/^rate limit/.test(r.error) ? 429 : 400, /^rate limit/.test(r.error) ? "rate_limited" : "validation", r.error) : json(r, 201); }
    if (path === "/api/aq/chat" && M === "GET") return json({ as: who, ...(await chatRead(env, who, { since: url.searchParams.get("since"), mark: url.searchParams.get("mark") === "1" })) });
    if (path === "/api/aq/chat/read" && M === "POST") return json({ as: who, ...(await chatRead(env, who, { since: null, mark: true })) });
    return apiErr(405, "method_not_allowed", "POST a message, GET the messages, or POST /api/aq/chat/read");
  }
  // Training arena switch. Alex's admin session, or the helper access code naming "claude" (the coordinator flips it for him).
  // It moves no money and never touches the main ledger: it only starts or stops the separate arena.
  if (path === "/api/aq/training") {
    const b = M === "POST" ? await body() : null, hk = req.headers.get("x-aq-helper-key") || "";
    const viaClaude = !!env.AQ_HELPER_KEY && !!hk && safeEqual(hk, env.AQ_HELPER_KEY) && String((M === "POST" ? b?.helper : url.searchParams.get("helper")) || "").toLowerCase() === "claude";
    if (!(admin || viaClaude)) return apiErr(admin || bearer || hk ? 403 : 401, admin || bearer || hk ? "forbidden" : "unauthorized", "Only Alex (admin session) switches training mode");
    await ensureSeed(env);
    if (M === "GET") return json({ training: await trainingState(db(env)) });
    if (M !== "POST") return apiErr(405, "method_not_allowed", "POST {on:true|false}");
    if (typeof b?.on !== "boolean") return apiErr(400, "validation", "on must be true or false");
    return json({ training: await setTraining(env, b.on, admin ? "Alex" : "Claude for Alex") });
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

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
import * as RH from "./robinhood.mjs";
import { createWallet, walletStatus, saveWalletLimits } from "./wallet.mjs";
import { sellAllLive, liveState } from "./live.mjs";
import { savePayout, withdraw, preview, restoreWallet } from "./payout.mjs";
import * as PH from "./phantom.mjs";
import { AQ_PHANTOM_JS } from "../aq-bundle.mjs";

const DROP_MAX = 95 * 1024 * 1024;
const TYPES = { glb: "model/gltf-binary", gltf: "model/gltf+json", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", ktx2: "image/ktx2",
  json: "application/json", js: "text/javascript", mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav", bin: "application/octet-stream", hdr: "application/octet-stream", svg: "image/svg+xml" };

export async function aqPage(req, env, path, { json, html }) {
  if (req.method !== "GET") return json({ error: { message: "read-only" } }, 405);
  if (path === "/aq") return html(AQ_PAGE, 200, { "content-security-policy": "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' blob: data:; worker-src 'self' blob:", "x-robots-tag": "noindex" });
  if (path === "/aq/phantom-tx.js") return new Response(AQ_PHANTOM_JS, { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" } });
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
  // Alex's Phantom wallet: the server keeps only its public address and hands back UNSIGNED transactions for him to approve
  // in Phantom. Admin session only. Nothing here signs or sends (src/aq/phantom.mjs).
  if (path === "/api/aq/phantom" || path.startsWith("/api/aq/phantom/")) {
    if (!admin) return apiErr(bearer ? 403 : 401, bearer ? "forbidden" : "unauthorized", "Only Alex (admin session) uses the Phantom link");
    await ensureSeed(env);
    const out = (r, okStatus = 200) => (r.error ? apiErr(r.missing ? 404 : 400, r.secret ? "secret_refused" : "refused", r.error) : json(r, okStatus));
    if (path === "/api/aq/phantom" && M === "GET") return json(await PH.status(env));
    if (M !== "POST") return apiErr(405, "method_not_allowed", "POST");
    if (path === "/api/aq/phantom/connect") return out(await PH.connect(env, await body()));
    if (path === "/api/aq/phantom/disconnect") return json(await PH.disconnect(env));
    if (path === "/api/aq/phantom/trade") return out(await PH.buildTrade(env, await body()), 201);
    if (path === "/api/aq/phantom/fund") return out(await PH.buildFund(env, await body()), 201);
    if (path === "/api/aq/phantom/cancel") return out(await PH.cancel(env, await body()));
    if (path === "/api/aq/phantom/sent") { const r = await PH.sent(env, await body()); return r.error ? out(r) : json(r, r.notSeenYet ? 202 : 200); }
    return apiErr(404, "not_found", "No such Phantom endpoint");
  }
  // Robinhood agent account: sign-in, read-only status, limits. Alex's admin session only (not the bearer, not a helper code).
  // Nothing under here can place, change or cancel an order (src/aq/robinhood.mjs).
  if (path.startsWith("/api/aq/rh/")) {
    const go = (to) => new Response(null, { status: 302, headers: { location: to, "cache-control": "no-store", "referrer-policy": "no-referrer" } });
    const nav = M === "GET" && (path === "/api/aq/rh/connect" || path === "/api/aq/rh/callback");
    if (!admin) return nav ? go("/login") : apiErr(bearer ? 403 : 401, bearer ? "forbidden" : "unauthorized", "Only Alex (admin session) uses the Robinhood link");
    await ensureSeed(env);
    if (path === "/api/aq/rh/connect" && M === "GET") { try { return go(await RH.connectUrl(env)); } catch (e) { const m = String(e.message || e).slice(0, 300); await db(env).q(`INSERT INTO mob_aq_state (k, v, at) VALUES ('rh_status', $1, now()) ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v, at=now()`, [JSON.stringify({ lastError: m, at: new Date().toISOString() })]); return go("/aq?rh=error"); } }
    if (path === "/api/aq/rh/callback" && M === "GET") { const r = await RH.finishConnect(env, url.searchParams); return go(r.ok ? "/aq?rh=connected" : "/aq?rh=error"); }
    if (path === "/api/aq/rh/status" && M === "GET") return json(await RH.status(env, { fresh: url.searchParams.get("fresh") === "1" }));
    if (path === "/api/aq/rh/disconnect" && M === "POST") return json(await RH.disconnect(env));
    if (path === "/api/aq/rh/limits" && M === "POST") { const r = await RH.saveLimits(env, await body()); return r.error ? apiErr(400, "validation", r.error) : json(r); }
    return apiErr(404, "not_found", "No such Robinhood endpoint");
  }
  // The Aquarius Solana wallet: made on the server, read here, with its limits. Alex's admin session only. No route returns
  // the secret key, and there is no swap or transfer route (src/aq/wallet.mjs).
  if (path === "/api/aq/wallet" || path.startsWith("/api/aq/wallet/")) {
    if (!admin) return apiErr(bearer ? 403 : 401, bearer ? "forbidden" : "unauthorized", "Only Alex (admin session) uses the Aquarius wallet");
    await ensureSeed(env);
    if (path === "/api/aq/wallet" && M === "GET") return json(await walletStatus(env, { fresh: url.searchParams.get("fresh") === "1" }));
    if (path === "/api/aq/wallet/create" && M === "POST") { const r = await createWallet(env); return r.error ? apiErr(r.exists ? 409 : 500, r.exists ? "exists" : "failed", r.error) : json(r, 201); }
    if (path === "/api/aq/wallet/limits" && M === "POST") { const r = await saveWalletLimits(env, await body()); return r.error ? apiErr(400, "validation", r.error) : json(r); }
    // live orders: what is open and what was refused, and Alex's SELL ALL LIVE. There is no route that buys.
    if (path === "/api/aq/wallet/live" && M === "GET") return json(await liveState(db(env)));
    if (path === "/api/aq/wallet/sellall" && M === "POST") return json(await sellAllLive(env));
    // the way out: SOL to the ONE saved payout address (never an address from the request), and the key's restore from its second copy
    if (path === "/api/aq/wallet/payout-address" && M === "POST") { const r = await savePayout(env, await body()); return r.error ? apiErr(400, "validation", r.error) : json(r); }
    if (path === "/api/aq/wallet/withdraw-preview" && M === "GET") { const q = url.searchParams.get("sol"); return json(await preview(env, q === "all" ? "all" : Number(q))); }
    if (path === "/api/aq/wallet/withdraw" && M === "POST") { const r = await withdraw(env, await body()); return r.error ? apiErr(r.pending ? 409 : 400, r.pending ? "pending" : "refused", r.error) : json(r, r.confirmed ? 200 : 202); }
    if (path === "/api/aq/wallet/restore" && M === "POST") { const r = await restoreWallet(env); return r.error ? apiErr(r.exists ? 409 : 400, r.exists ? "exists" : "refused", r.error) : json(r, 201); }
    return apiErr(404, "not_found", "No such wallet endpoint");
  }
  if ((path === "/api/aq/helper" || path === "/api/aq/briefing") && !(admin || bearer || keyOk)) return apiErr(401, "unauthorized", "Admin session, bearer MOB_API_TOKEN or AQUARIUS_KEY required");
  if (path === "/api/aq/helper" && M === "POST") { const r = await helperMessage(env, await body()); return r.error ? apiErr(400, "validation", r.error) : json(r, 201); }
  if (path === "/api/aq/briefing" && M === "GET") return new Response(await briefing(env), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  if (!(admin || bearer)) return apiErr(401, "unauthorized", "Admin session or bearer MOB_API_TOKEN required");
  if (path === "/api/aq/state" && M === "GET") return json(await buildState(env));
  // the daily brain backups in R2: the list, and one file to download (for scripts/aq-restore.mjs)
  if (path === "/api/aq/backup" && M === "GET") { const l = env.MEDIA ? await env.MEDIA.list({ prefix: "aq-backup/", limit: 1000 }) : { objects: [] }; return json({ backups: l.objects.map((o) => ({ day: o.key.slice(10, 20), key: o.key, bytes: o.size })) }); }
  const bm = path.match(/^\/api\/aq\/backup\/(\d{4}-\d\d-\d\d)$/);
  if (bm && M === "GET") { const o = env.MEDIA && (await env.MEDIA.get(`aq-backup/${bm[1]}.json.gz`)); return o ? new Response(o.body, { headers: { "content-type": "application/gzip", "content-disposition": `attachment; filename="aq-backup-${bm[1]}.json.gz"`, "cache-control": "no-store" } }) : apiErr(404, "not_found", "No backup for that day"); }
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

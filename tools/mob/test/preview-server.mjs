// Local preview of the mob admin for screenshots: the real worker, a throwaway Neon schema, mocked R2 and
// fixture data that exists ONLY in that schema (production never sees it). Not a test file (no .test.).
// Usage: DATABASE_URL=... node test/preview-server.mjs <port> <state> <mediaDir>
//   state: filled | empty | setup (each platform in a different onboarding state)
// A request with cookie slow=1 makes /ui/data/* wait 60 s so skeletons can be captured.
import http from "node:http";
import { readFileSync, readdirSync } from "node:fs";
import { makeEnv, dropEnv, r2 } from "./helpers.mjs";
import { db } from "../src/db.mjs";
import * as C from "../src/core.mjs";
import { makeSessionCookie } from "../src/auth.mjs";

const [port = "8787", state = "filled", mediaDir] = process.argv.slice(2);
const files = mediaDir ? readdirSync(mediaDir).filter((f) => f.endsWith(".mp4")).sort((a, b) => parseInt(a.split("-")[1]) - parseInt(b.split("-")[1])) : [];
const media = r2(Object.fromEntries(files.map((f) => [f, new Uint8Array(readFileSync(`${mediaDir}/${f}`))])));
const keys = state === "filled" || state === "unlock" ? {} : { GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: undefined, IG_APP_ID: undefined, IG_APP_SECRET: undefined, TIKTOK_CLIENT_KEY: undefined, TIKTOK_CLIENT_SECRET: undefined };
if (state === "setup") Object.assign(keys, { IG_APP_ID: "x", IG_APP_SECRET: "y" });
const env = await makeEnv({ MEDIA: media, PUBLIC_MEDIA_BASE: `http://localhost:${port}/media`, ...keys });
const d = db(env);
const DAY = 864e5, iso = (t) => new Date(t).toISOString().slice(0, 10);

if (state === "empty") await C.setSetting(env, "welcomed", true);
if (state === "setup") {
  await C.setStage(env, "youtube", { stage: "claude_working", stage_note: "Preparing YouTube for you. Nothing to do." });
  await C.setStage(env, "tiktok", { stage: "none" });
}
if (state === "filled" || state === "unlock") {
  const A = [];
  for (const [p, h, f0, v0, g] of [["youtube", "oraktys.clips", 18400, 2_310_000, 52000], ["youtube", "leonida.daily", 6200, 640_000, 21000], ["instagram", "oraktys", 9100, 980_000, 30000], ["tiktok", "oraktys.tt", 27300, 3_120_000, 88000]]) {
    const a = await C.upsertAccount(env, p, { external_id: h, handle: h, access_token: "x", refresh_token: "y", scopes: C.PLATFORMS[p].SCOPES.join(p === "youtube" ? " " : ","), meta: { stats_status: "ok" } });
    A.push(a);
    let views = v0;
    const series = [];
    for (let i = 0; i <= 29; i++) { series.push(views); views -= Math.round(g * (1 + 0.45 * Math.sin(i / 2.3 + v0 % 7) + (i < 6 ? 0.5 : 0))); }
    for (let i = 29; i >= 0; i--) {
      const views = series[i];
      await d.q(`INSERT INTO mob_account_stats (account_id, day, taken_at, views_total, followers, videos) VALUES ($1,$2,$3,$4,$5,$6)`, [a.id, iso(Date.now() - i * DAY), new Date(Date.now() - i * DAY - 12 * 60000).toISOString(), views, Math.round(f0 - i * 40), 40 + Math.round((29 - i) / 2)]);
    }
  }
  const c1 = await d.one(`INSERT INTO mob_campaigns (name, url, platforms, cpm_usd, min_payout_usd, max_payout_usd, budget_usd, paid_out_usd, rules) VALUES ('ORAKTYS Clipping','https://contentrewards.com/c/oraktys','{youtube,instagram,tiktok}',1.5,5,500,20000,12400,'#oraktys in caption, 15-60 s') RETURNING id`);
  const c2 = await d.one(`INSERT INTO mob_campaigns (name, url, platforms, cpm_usd, min_payout_usd, max_payout_usd, budget_usd, paid_out_usd) VALUES ('Leonida GTA Shorts','https://contentrewards.com/c/leonida','{youtube,tiktok}',0.8,2,150,8000,2100) RETURNING id`);
  const titles = ["The heist went wrong in 3 seconds", "Vice City sunset drive", "He did NOT see that coming", "Best clutch of the week", "Why everyone is talking about this", "Rooftop chase, no cuts", "The quietest win ever", "One frame decided it", "Night market in Leonida", "The 40 second comeback", "Unreal reaction", "Final circle"];
  const now = Date.now();
  for (let i = 0; i < 12; i++) {
    const a = A[i % 4], camp = i % 3 === 2 ? c2.id : c1.id;
    const posted = i < 8;
    const st = posted ? "posted" : i === 8 ? "failed" : i === 9 ? "processing" : "scheduled";
    const when = posted ? now - (i + 1) * 9 * 3600000 : i < 10 ? now - (i - 7) * 1800000 : now + (i - 9) * 5 * 3600000;
    const p = await d.one(`INSERT INTO mob_posts (account_id, clip_key, title, caption, scheduled_at, status, remote_id, remote_url, campaign_id, error, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [a.id, files[i % files.length] || "oraktys-1.mp4", titles[i], "#oraktys #gta6 #shorts", new Date(when).toISOString(), st, posted ? `v${i}` : null, posted ? `https://www.youtube.com/shorts/v${i}` : null, camp, st === "failed" ? "Clip is longer than 60 seconds. Pick a shorter one." : null, new Date(Math.min(now, when)).toISOString()]);
    if (posted) {
      const total = [184000, 96000, 61000, 44000, 38000, 21000, 9600, 3100][i];
      for (let k = 6; k >= 0; k--) await d.q(`INSERT INTO mob_post_stats (account_id, post_id, remote_id, day, title, url, views, likes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [a.id, p.id, `v${i}`, iso(now - k * DAY), titles[i], `https://www.youtube.com/shorts/v${i}`, Math.round(total * (1 - k / 8)), Math.round(total / 40)]);
      if (i < 5) await d.q(`INSERT INTO mob_submissions (campaign_id, post_id, posted_url, status, payout_usd) VALUES ($1,$2,$3,$4,$5)`, [camp, p.id, `https://www.youtube.com/shorts/v${i}`, i < 2 ? "paid" : "submitted", i < 2 ? [90, 60][i] : null]);
    }
  }
  await C.setSetting(env, "claude_seen", new Date(now - 2 * 60000).toISOString());
  await C.setSetting(env, "welcomed", true);
}

if (state === "filled" || state === "unlock") {
  const names = ["The heist went wrong", "Vice City sunset", "Did not see that coming", "Best clutch", "Everyone is talking", "Rooftop chase", "Quietest win", "One frame", "Night market", "40 second comeback", "Unreal reaction", "Final circle"];
  for (const [i, f] of files.entries()) await d.q(`INSERT INTO mob_clips (key, title, size_bytes, source) VALUES ($1,$2,$3,'fixture') ON CONFLICT DO NOTHING`, [f, names[i] || f, 18_400_000 + i * 1_300_000]);
}
const cookie = (await makeSessionCookie(env)).split(";")[0];
const { default: worker } = await import("../src/worker.mjs");
// "unlock": accounts connected before stats existed (open issue 8) -> the one Overview banner.
if (state === "unlock") await d.q(`UPDATE mob_accounts SET meta = meta || '{"stats_status":"reconnect"}'::jsonb WHERE handle IN ('leonida.daily','oraktys')`);
http.createServer(async (req, res) => {
  const url = `http://localhost:${port}${req.url}`;
  if (req.url.startsWith("/media/")) {
    const k = decodeURIComponent(req.url.slice(7).split("#")[0].split("?")[0]);
    const v = media.store.get(k);
    if (!v) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": "video/mp4", "content-length": v.length, "accept-ranges": "none" }); return res.end(Buffer.from(v));
  }
  if (req.url === "/__cookie") { res.writeHead(200, { "content-type": "text/plain" }); return res.end(cookie); }
  if (req.url.startsWith("/ui/data/") && /slow=1/.test(req.headers.cookie || "")) await new Promise((r) => setTimeout(r, 60000));
  const chunks = []; for await (const ch of req) chunks.push(ch);
  const r = await worker.fetch(new Request(url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks), redirect: "manual", duplex: "half" }), env, { waitUntil() {} });
  const h = Object.fromEntries(r.headers); res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer()));
}).listen(Number(port), () => console.log(`ready ${port} ${state}`));
const stop = async () => { await dropEnv(env); process.exit(0); };
process.on("SIGTERM", stop); process.on("SIGINT", stop);
process.on("uncaughtException", (e) => console.log("ignored", e.code || e.message));

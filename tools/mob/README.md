# mob (for Claude)

Our own posting platform: R2 clips -> YouTube Shorts, Instagram Reels, TikTok, from many accounts, plus Whop Content
Rewards campaign/submission tracking. Standalone Worker `mob` (https://mob.gardenbuddystore.workers.dev). Never touches Kerberos.

## Layout (mob-3, 2026-11-14: "Shopify for clipping")
- `src/worker.mjs` routes (OAuth, form posts, `/api/*`, `/healthz`, the app shell for every admin page) + `scheduled()` cron. `BUILD` = build on screen.
- `src/ui.mjs` shell + CSS. `src/shopadmin.mjs` = Shop Admin's font link, tokens, base rules and keyframes copied byte for byte from
  `design/prototype/Shop Admin.dc.html` (light only). `src/client.mjs` = the browser app, served as `/static/app.js` via
  `app.toString()`, so it must not use anything outside its own function. `src/uiapi.mjs` = `/ui/data/*` (reads) and `/ui/act/*` (writes), cookie only.
- `src/stats.mjs` hourly stats pull (cron step `pullStats`, 3 accounts per tick, 60 min apart) + overview/earnings summaries.
  `src/money.mjs` the one earnings rule. Each platform module has `stats(env, acct)` with its doc URLs on top.
- `src/core.mjs` accounts, clips, posts, the cron tick (refresh -> claim with SKIP LOCKED -> publish -> poll -> reap).
- `src/platforms/{youtube,instagram,tiktok}.mjs` each starts with the official doc URLs it was written from.
- `src/db.mjs` Neon HTTP, tables `mob_*` (schema in `src/schema.mjs`, copy in `schema.sql`). `src/auth.mjs` cookie, bearer, AES-GCM token sealing.

## Test (real Neon, throwaway schema `mob_test_*` created and dropped; all platform HTTP mocked)
    cd tools/mob && npm i && npm test        # needs DATABASE_URL

## Deploy — ALWAYS pass -c
The repo root has `.wrangler/deploy/config.json` redirecting to Kerberos' build. Plain `npx wrangler deploy` from this
folder deploys KERBEROS config. Use:
    npx wrangler deploy -c ./wrangler.toml
Secrets Claude sets once (`npx wrangler secret put NAME -c ./wrangler.toml`): ADMIN_PASSWORD, MOB_API_TOKEN, MOB_ENC_KEY
(never change it after accounts exist: tokens become unreadable), DATABASE_URL, CF_API_TOKEN (Workers Scripts:Edit), CF_ACCOUNT_ID.
Claude sets the platform keys through POST /api/settings/keys (Settings > Advanced is the fallback): GOOGLE_CLIENT_ID/SECRET, IG_APP_ID/SECRET, TIKTOK_CLIENT_KEY/SECRET.
Every request and the cron create the tables on first use (ensureMigrated); /admin/migrate also does it by hand.
Deploy checklist (all checked on mob-2, 2026-11-14): /healthz ok+db up · login · every page 200 · /api/clips lists R2 ·
POST /api/run with nothing connected returns no errors · upload a small file on /clips then delete it · /settings Save
writes a secret (check `wrangler secret list -c ./wrangler.toml`, then delete the test value).
CF_API_TOKEN today is the deploy token (this session could not mint a Workers-Scripts-only token: 9109). Replace it with a
narrower one when Alex makes one in the dashboard.

## Preview and screenshots (fixtures only ever live in a throwaway schema)
    DATABASE_URL=... node test/preview-server.mjs 8791 filled <dir with mp4s>   # states: filled | empty | setup; cookie slow=1 = skeletons
Final renders: `tools/mob/shots/` (1440 and 390; filled, skeleton-, empty-, onboarding-).

## Setup API for Claude (no developer console ever shown to Alex)
GET /api/setup -> per platform {state, stage, note, review_status, keys_set, live, redirect_uri, scopes_required[], accounts, asked_at}
POST /api/setup/:platform {stage: none|claude_working|app_created|keys_set|live|review_pending|needs_alex, stage_note?, review_status?}
POST /api/settings/keys (= POST /api/platform-keys) {platform, client_id|id, client_secret|secret} -> Worker secrets via putSecret, never echoed.
  State is "activating" until the Worker has the secrets, then "ready". GET /api/platform-keys -> states only.
GET /api/stats?range=today|7d|30d|all&account= · POST /api/stats/pull {account_id?} · GET /api/earnings?campaign=
POST /api/campaigns/parse {url, name, cpm_usd, min_payout_usd, max_payout_usd, budget_usd, paid_out_usd, platforms, rules} (upsert by url) · POST /api/campaigns/:id
Accounts connected before mob-3 lack the stats scopes: they show "Unlock stats" (Reconnect), never an error.

## API (Authorization: Bearer MOB_API_TOKEN)
GET /api/accounts · GET /api/clips?cursor= · POST /api/posts {clip_key, account_ids[]|platforms[], title, caption, scheduled_at?, campaign_id?, spread_minutes?}
(unconnected platforms come back in `skipped`) · GET /api/posts?status=&since= · GET /api/posts/:id · POST /api/posts/:id/cancel · POST /api/posts/:id/retry {confirm?} ·
GET/POST /api/campaigns · GET/POST /api/submissions · POST /api/run (one cron pass; never against real accounts in tests).

## Platform facts (from the docs, 2026-11-14)
- YouTube: 100 videos.insert per day per project (enforced). Consent screen should be Published, or Google sign-ins lapse.
- Instagram: professional accounts, Instagram Login, Graph v27.0, container polled on later ticks, capped 50 posts/24h/account.
- TikTok: until the app passes TikTok's audit, only private accounts can be posted to and posts are SELF_ONLY.
  PULL_FROM_URL needs blackreaper.us verified in the TikTok portal; otherwise mob falls back to FILE_UPLOAD chunks.

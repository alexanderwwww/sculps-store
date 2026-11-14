# mob (for Claude)

Our own posting platform: R2 clips -> YouTube Shorts, Instagram Reels, TikTok, from many accounts, plus Whop Content
Rewards campaign/submission tracking. Standalone Worker `mob` (https://mob.gardenbuddystore.workers.dev). Never touches Kerberos.

## Layout
- `src/worker.mjs` routes (admin pages, OAuth, `/api/*`, `/healthz`) + `scheduled()` cron (every 5 min). `BUILD` constant = build number on screen.
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
Alex sets the platform keys himself on /settings: GOOGLE_CLIENT_ID/SECRET, IG_APP_ID/SECRET, TIKTOK_CLIENT_KEY/SECRET.
Every request and the cron create the tables on first use (ensureMigrated); /admin/migrate also does it by hand.
Deploy checklist (all checked on mob-2, 2026-11-14): /healthz ok+db up · login · every page 200 · /api/clips lists R2 ·
POST /api/run with nothing connected returns no errors · upload a small file on /clips then delete it · /settings Save
writes a secret (check `wrangler secret list -c ./wrangler.toml`, then delete the test value).
CF_API_TOKEN today is the deploy token (this session could not mint a Workers-Scripts-only token: 9109). Replace it with a
narrower one when Alex makes one in the dashboard.

## API (Authorization: Bearer MOB_API_TOKEN)
GET /api/accounts · GET /api/clips?cursor= · POST /api/posts {clip_key, account_ids[]|platforms[], title, caption, scheduled_at?, campaign_id?, spread_minutes?}
(unconnected platforms come back in `skipped`) · GET /api/posts?status=&since= · GET /api/posts/:id · POST /api/posts/:id/cancel · POST /api/posts/:id/retry {confirm?} ·
GET/POST /api/campaigns · GET/POST /api/submissions · POST /api/run (one cron pass; never against real accounts in tests).

## Platform facts (from the docs, 2026-11-14)
- YouTube: 100 videos.insert per day per project (enforced). Consent screen should be Published, or Google sign-ins lapse.
- Instagram: professional accounts, Instagram Login, Graph v27.0, container polled on later ticks, capped 50 posts/24h/account.
- TikTok: until the app passes TikTok's audit, only private accounts can be posted to and posts are SELF_ONLY.
  PULL_FROM_URL needs blackreaper.us verified in the TikTok portal; otherwise mob falls back to FILE_UPLOAD chunks.

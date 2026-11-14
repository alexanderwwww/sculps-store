---
name: mob
description: mob is Alex's own posting platform, like Metricool, running on our Cloudflare account. It posts R2 clips to YouTube Shorts, Instagram Reels and TikTok from many accounts, and tracks Whop Content Rewards campaigns and submissions. Use it when the work involves mob, posting clips, "post to YouTube/Instagram/TikTok", connecting accounts, Content Rewards submissions or the clip library.
---
# mob

**What it is:** our own platform for posting clips. Claude drives it, and Alex's job is to connect accounts. It takes clips from R2 (`oraktys-*.mp4`, made by `tools/clipper/daily.py`, plus uploads) and posts them to **YouTube Shorts, Instagram Reels and TikTok**, from as many accounts as are connected. Any platform with no connected account is skipped, which is not an error. Campaigns and submissions for Whop Content Rewards (contentrewards.com) are tracked in the same place.

- **URL:** https://mob.gardenbuddystore.workers.dev (Worker `mob`, standalone; it never touches Kerberos). The build number shows in the sidebar, and `/healthz` returns `{"ok":true,"db":"up","build":"mob-2"}` live; mob-3 (Shopify-for-clipping rebuild, 2026-11-14) is built and tested but NOT deployed yet. Way back: `npx wrangler rollback -c ./wrangler.toml` to mob-2.
- **Code:** `tools/mob` (see its README). Neon tables `mob_*` live in the Kerberos DB. R2 bucket is `gardenbuddy-media`, served publicly at `https://blackreaper.us/media/<key>`.
- **Cron:** runs every 5 min. Each pass refreshes tokens, claims due posts, publishes them, polls IG/TikTok processing, and reaps stuck posts.
- **Deploy:** `cd tools/mob && npx wrangler deploy -c ./wrangler.toml`. **Always pass -c.** A plain deploy from this folder picks up the Kerberos redirect config. Tests: `npm test`, which needs DATABASE_URL, runs against a throwaway schema and mocks all platform HTTP.

## mob-3 look and setup (settled 2026-11-14, Alex: "Do it like a Shopify, but for clipping")
- mob is Shop Admin's sibling: same tokens/type/keyframes copied byte for byte (src/shopadmin.mjs), light only. Pages: Home, Clips, Posts, Calendar, Analytics (+Live), Campaigns, Earnings, Channels, Settings, /welcome onboarding.
- Alex never sees a developer console or the words OAuth/client/secret/token/scope/API. Claude sets up each platform's developer app (Cursor Clipper) and reports with POST /api/setup/:p {stage}, then POST /api/settings/keys. Alex only presses Connect.
- Stats: hourly pull, 3 accounts per tick. Earnings estimate = views/1000 x $/1K, 0 below min, capped at max (src/money.mjs; "min" meaning still to verify on a live Content Rewards page).

## Admin pages (password login, 5 wrong tries per 15 min locks the IP)
`/` dashboard · `/accounts` connect, reconnect, turn off, remove · `/clips` library and MP4 upload · `/schedule` (clip → accounts → time in Athens → caption; a typed time always wins) · `/posts` · `/campaigns`, `/campaigns/:id` (posts waiting to be submitted, submissions) · `/settings` (Alex pastes platform keys here, no terminal).

## API for Claude (`Authorization: Bearer MOB_API_TOKEN`)
- `GET /api/clips?cursor=` returns `{clips:[{key,url,size,uploaded}],cursor}`.
- `GET /api/accounts` returns `[{id,platform,handle,status}]`.
- `POST /api/posts {clip_key, account_ids[] | platforms[], title?, caption?, scheduled_at?, campaign_id?, spread_minutes?}` returns 201 `{posts, skipped}`. Platforms with no connected account come back in `skipped`. An unknown clip_key returns 400.
- `GET /api/posts?status=&since=ISO` · `GET /api/posts/:id` · `POST /api/posts/:id/cancel`.
- `POST /api/posts/:id/retry {confirm?}`: if the upload may already be live (upload started, or the worker was interrupted), it returns 409 `may_be_live`. Check the account before sending `{"confirm":true}`, because a duplicate gets rejected by Content Rewards.
- `GET/POST /api/campaigns {name,url,rules,platforms[],cpm_usd}` · `GET /api/submissions?campaign_id=` · `POST /api/submissions {campaign_id, post_id | posted_url, status, views, payout_usd, note}`.
- `POST /api/run` runs one cron pass right away. Never use it to test against real accounts.

## Secrets (Worker secrets; the values are never in git)
Set by Claude at deploy time: `ADMIN_PASSWORD`, `MOB_API_TOKEN`, `MOB_ENC_KEY` (encrypts the account tokens; **never change it once accounts exist**), `DATABASE_URL`, `CF_API_TOKEN`, `CF_ACCOUNT_ID`. The last two let /settings write secrets. CF_API_TOKEN is currently the deploy token, because this session could not mint a narrower one. Swap it for a token with only Workers Scripts:Edit when one exists. The admin password and API token are given to Alex privately and never written into the repo.
Set by Alex on /settings: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `IG_APP_ID`, `IG_APP_SECRET`, `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`.

## What Alex does, per platform (the /settings page walks him through it, with copy buttons)
- **YouTube:** at console.cloud.google.com, create the project "mob", turn on YouTube Data API v3, set up the OAuth consent screen as External, add himself as a test user and press **Publish app** (otherwise sign-ins lapse after 7 days). Create a Web OAuth client, paste the redirect `https://mob.gardenbuddystore.workers.dev/oauth/youtube/callback`, and paste the Client ID and secret into Settings. Then go to Accounts → Connect, once per channel. Limit: 100 uploads a day per project.
- **Instagram:** switch each account to Professional. At developers.facebook.com, create a Business app, add Instagram → "API setup with Instagram login", paste the redirect `.../oauth/instagram/callback`, add each account as an Instagram Tester and accept the invite in the Instagram app. Paste the app ID and secret, then Connect. mob caps posting at 50 per 24 h per account.
- **TikTok:** at developers.tiktok.com, connect an app with Login Kit and Content Posting API (Direct Post), scopes `user.info.basic` and `video.publish`. Paste the redirect `.../oauth/tiktok/callback`, verify the blackreaper.us domain (Claude adds the DNS record), paste the key and secret, then Connect. **Until TikTok audits the app, posts go out private (SELF_ONLY).** Earnings also need the follower minimum the campaign sets. After the audit, posts go public on their own.

## Rules learned building it
- Every platform file starts with the URLs of the official docs it was written from. Never guess a field; read the docs.
- Duplicate safety: once bytes may have reached a platform (`upload_started_at` set), mob never requeues on its own. Instagram `media_publish` runs at most once per container (`published_id`).
- A refresh failure signs an account out only on a real refusal (invalid_grant/400/401). 5xx, 429 and network errors are retried on the next tick.
- No live test posts to real accounts. Platform code is proven with mocked fetch.

# Environment map for Codex (names and status only, no values)

Values are never written to the repo. Read them from the owner's `.dev.vars` (local, git-ignored) or the Cloudflare dashboard.

## 1. Local `.dev.vars` (present)
ADMIN_ACCESS_CODE, ADMIN_ORIGIN, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, CLOUDFLARE_WORKER_NAME, DATABASE_URL, ENCRYPTION_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, RESEND_API_KEY, SQUARE_ACCESS_TOKEN, SQUARE_APPLICATION_ID, VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT

## 2. Cloudflare Worker secrets on `kerberos` (present)
ADMIN_ACCESS_CODE, ADMIN_ORIGIN, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, CLOUDFLARE_WORKER_NAME, DATABASE_URL, ENCRYPTION_KEY, RESEND_API_KEY, VAPID_PRIVATE_KEY

## 3. Missing on the Worker
- GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (local only; set as Worker secrets only if Google sign-in is used)
- SQUARE_ACCESS_TOKEN, SQUARE_APPLICATION_ID (local only; Square is closed for Black Reaper, so not needed there)
- VAPID_PUBLIC_KEY, VAPID_SUBJECT (set as plain `vars` in `wrangler.jsonc`, so they do not appear as secrets)

## 4. Worker and deploy
- Worker name: `kerberos` (wrangler.jsonc `name`, entry `./workers/app.ts`)
- Build then deploy, only after the owner approves:
  `rm -rf build && npm run build`
  `set -a; . ./.dev.vars; set +a; export CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID; npx wrangler deploy`

## 5. Database
- `DATABASE_URL` (Neon Postgres connection string). Present locally and on the Worker.

## 6. Payment provider encryption
- `ENCRYPTION_KEY`. Decrypts `payment_providers.secret_key_enc`. Present locally and on the Worker. Never print it.

## 7. Black Reaper Stripe rows (`payment_providers`, store slug `reaper`)
- `stripe`: AIGIS LLC card processing. Publishable key set, secret encrypted. Active.
- `stripe_bnpl`: Klarna and Affirm on the same AIGIS LLC account. Publishable key set, secret encrypted. Active.
- `paypal`: off (no publishable key).
- `square`: removed.
- `stripe_closed`: removed (Greek account, closed).
- Stripe account: AIGIS LLC, live, charges and payouts enabled. Read the account through the API; never print keys.

## 8. Resend (email)
- Env var: `RESEND_API_KEY` (present on the Worker).
- Sender domains: blackreaper.us (verified), gardenbuddy.store (verified).
- Black Reaper sender: orders@blackreaper.us. Contact: hello@blackreaper.us.

## 9. Cloudflare account and zone
- `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` (present locally and on the Worker). Used for deploys and logs.
- DNS and Apple Pay domain: the domain association file is served at `/.well-known/apple-developer-merchantid-domain-association` (200). Apple Pay is registered for `blackreaper.us` on the live Stripe account.

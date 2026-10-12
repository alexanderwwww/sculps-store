# Reconnecting a machine to Kerberos after `.dev.vars` is lost

Names only. No value of any secret belongs in this file, in Git, in chat or in a screenshot.

## Which code is live

- Live Kerberos branch: `claude/kerberos-phase1-db-setup-6vjdq9` (Worker `kerberos`, config in `wrangler.jsonc`).
- `main` is hundreds of commits stale. `kerberos/phase-1` is the September scaffold. `codex/plug-mac-signin` is Plug work. Never deploy any of them as Kerberos.
- The deployed Worker was last put up by hand with Wrangler, so its exact commit is not recorded. Before any deploy, compare the live site
  against this branch (Cloudflare → Workers → kerberos → Deployments shows the version and date).

## The one rule that matters most

A Worker secret already set in Cloudflare keeps working even when the local file is gone. **Only `.dev.vars` was lost, not the Worker.**
So the live store and Shop Admin still have every secret. Rebuilding `.dev.vars` is only so a machine can deploy and run scripts.
Do not overwrite a Worker secret unless it is actually broken.

## Each name, where it comes from, and whether it is safe to replace

| Name | Where it lives | Get it from | Safe to replace? |
|---|---|---|---|
| `CLOUDFLARE_API_TOKEN` | local only (Wrangler) | Cloudflare → My Profile → API Tokens → Create → "Edit Cloudflare Workers" | Yes, make a new one |
| `CLOUDFLARE_ACCOUNT_ID` | local only | Cloudflare → Workers & Pages, right-hand column | Not a secret; copy it |
| `CLOUDFLARE_WORKER_NAME` | local | `kerberos` | Not a secret |
| `DATABASE_URL` | Worker secret + local | Neon console → project → Connect → pooled connection string | Copy it; do not reset the Neon password (the Worker uses the current one) |
| `RESEND_API_KEY` | Worker secret + local | Resend → API Keys → Create (sending access, domain blackreaper.us) | Yes. Set the new one locally AND as the Worker secret at the same time, then revoke the old one only after a test email lands |
| `ADMIN_ACCESS_CODE` | Worker secret | Choose one, 16+ characters | Yes. Shorter than 16 is silently refused (`app/lib/auth.server.ts`) |
| `ADMIN_EMAIL` / `ADMIN_ORIGIN` / `STORE_ONE_DOMAIN` | Worker | Plain settings | Yes |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Worker secret | Google Cloud console → Credentials | Leave unset unless Google sign-in is wanted. **When set, the access code stops working** (`app/routes/admin.login.tsx`) |
| `VAPID_PUBLIC_KEY` / `VAPID_SUBJECT` | `wrangler.jsonc` vars | Already in the repo | Not secret |
| `VAPID_PRIVATE_KEY` | Worker secret | No dashboard can show it | **Do not replace.** A new key pair breaks every saved phone push subscription. Leave the Worker secret alone; locally it is only needed to send push |
| `ENCRYPTION_KEY` | Worker secret | No dashboard can show it | **Never rotate.** It decrypts the Stripe secret keys, webhook secrets and Meta CAPI token stored in the database (`app/lib/crypto.server.ts`). A new value makes checkout unable to read Stripe. Leave the Worker secret as it is; a local copy is not needed to deploy |

## Order of work

1. Cloudflare token + account ID into the ignored `.dev.vars`. Check: `npx wrangler whoami`, then `npx wrangler secret list` (lists names, never values).
2. `DATABASE_URL` from Neon into `.dev.vars`. Check: a read-only `select count(*) from orders`.
3. Resend: confirm in the Resend dashboard that `blackreaper.us` is Verified. The From address is per store in the database (`fromAddress`, e.g. `orders@blackreaper.us`); the code falls back to `orders@resend.dev` when it is empty.
   New key → `.dev.vars` and `npx wrangler secret put RESEND_API_KEY`.
4. Admin code, if needed: `npx wrangler secret put ADMIN_ACCESS_CODE`.
5. Send one test email to Alex's own address and see it land before writing to any customer.
6. Payments are not touched by any of this.

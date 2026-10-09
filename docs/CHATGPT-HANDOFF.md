# Handoff for ChatGPT (or any agent) — Black Reaper

Read this file, then `AGENTS.md` at the repo root. Both are safe to read. This file contains **no secrets**.

## What you are looking at
- **Store:** blackreaper.us, one product: The 16 ft Scream ($369.99). Run by AIGIS LLC (Miami, FL).
- **Platform:** Kerberos, React Router v7 on Cloudflare Workers, Drizzle ORM, Neon Postgres.
- **Repo branch:** `claude/kerberos-phase1-db-setup-6vjdq9`. Do not push to `main`.

## Where things are
- Storefront code: `app/storefronts/ceiling-buddy/` (buy box, bundles, coupon, cart drawer), `app/storefronts/reaper/theme.css` (Black Reaper look).
- Checkout: `app/routes/checkout.tsx` (Stripe express row, ultra express option), `app/routes/checkout.intent.tsx` (payment intent).
- Payments: `app/lib/payments.server.ts`, `app/lib/cart.server.ts` (server-side pricing), `app/lib/bnpl.server.ts` (Klarna/Affirm).
- Recovery emails: `app/lib/recovery.server.ts` ($50 come-back code).
- Skills: `.claude/skills/payments/SKILL.md`, `.claude/skills/kerberos/SKILL.md`, `.claude/skills/listing-images/SKILL.md`.

## Current state (2026-10-09)
- Stripe: AIGIS LLC account, category 5399, bank Mercury (default), charges and payouts on. Card, Apple Pay, Cash App, Klarna, Affirm, Link and Pay by Bank active. Google Pay on request.
- Square: closed. Do not reconnect it.
- PayPal: off. Greek Stripe: closed. Do not reconnect either.
- Products: only The Scream is active. Other products are drafts.

## Rules you must follow
1. Never suggest test charges, fake cards or small "try" payments on a live processor account.
2. Test checkout only in a sandbox, with a test key the owner supplies himself.
3. Checkout never gets a mistake. Check every branch before shipping.
4. Customer copy never mentions shipping dates, delays, refunds or payment trouble.
5. Answer the exact question asked, especially about money or applications.
6. Never ask the owner to "say go". Act on his instruction, and confirm only before irreversible money or account actions.

## Access
- Read the repo through GitHub.
- Live secrets (Stripe, database, Cloudflare) stay on the owner's machine in `.dev.vars`. They are never shared in chat or files.
- For live checks, use the public pages and the read-only status endpoint: `https://kerberos.gardenbuddystore.workers.dev/healthz`.

## Open problem
Customers reported that checkout failed for several people. The cause is not yet known. Start with the checkout code paths listed above, then compare them with the exact error the customers saw.

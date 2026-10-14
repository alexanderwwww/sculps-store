Read AGENTS.md first. Then deploy Kerberos and check the Mr. Snowman page. Do nothing else.

1. git fetch origin claude/kerberos-phase1-db-setup-6vjdq9
   git checkout claude/kerberos-phase1-db-setup-6vjdq9 && git pull origin claude/kerberos-phase1-db-setup-6vjdq9
   Never deploy main or any other branch.

2. Before deploying, open https://blackreaper.us/products/the-scream and note that it renders, so you can compare afterwards.

3. Deploy:
   rm -rf build && npm run build
   set -a; . ./.dev.vars; set +a; export CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID; npx wrangler deploy

4. Check, and report what you actually see:
   - https://kerberos.gardenbuddystore.workers.dev/healthz returns {"ok":true,"db":"up"}
   - https://blackreaper.us/products/the-scream looks exactly as it did before the deploy, and still says "BLACK REAPER" above the title.
   - Open https://kerberos.gardenbuddystore.workers.dev/products/the-snowman?store=snowman. The store is password-protected, so use the store password from the admin if it asks. Check that:
     - the page is white, in the Black Reaper style, not dark brown
     - "MR. SNOWMAN" is above the title
     - the buy box shows the 8 panels with nothing cut off
     - the moving strip says "Plug in, press snow", not "Back in the garage by November"
     - the sections run in this order: buy box, FAQ, photo strip, Before/After ad, 4 ad cards, "Out there, on real lawns", In the box, big snowman band, trust icons, closing call to action
     - check whether the "your dad bought a 16 foot snowman" text-chat section shows, and if it does not, say so
   - Take a desktop and a phone screenshot of the snowman page and give them to Alex.

5. If Black Reaper looks different from before in any way, roll back straight away with `npx wrangler rollback` and say what changed.

Rules: no payment, Stripe, or checkout changes. Never print or commit secrets. Do not take the snowman store off password.

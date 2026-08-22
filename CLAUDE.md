# XERO Chiron — working rules

## NEVER push these files to the store

`templates/index.json` and `templates/product.json` are **owned by the Shopify theme
editor**, not by this repo. The owner sets images, section order and copy there.

Every `themeFilesUpsert` of these files from a local copy silently reverts whatever the
owner changed in the editor since the last pull. This has already destroyed uploaded
images more than once.

**Rules:**

1. Do NOT upload `templates/*.json` as part of a normal code change. Section `.liquid`
   files are safe to upload freely — they carry no owner content.
2. If a `.json` template genuinely must change (a new section added to `order`, a
   renamed section type), then:
   - Pull the LIVE file first via `theme(id:).files(filenames:)` → `body.content`
   - Apply the single minimal edit to that pulled content
   - Push it back immediately, before the owner touches the editor again
   - Never apply the edit to the local copy and push that
3. The local copies in this repo are STALE by design. Treat them as history, not truth.
4. Prefer changing a schema `default` in the section file over changing a template
   setting - defaults do not fight the editor.

## Other standing constraints

- Never advertise the bike as pre-order, made to order, or built to order. It exists.
- Never describe unmeasured figures as certified. Manufacturer figures, not independently
  certified, is the agreed wording.
- Never label brand footage or renders as customer/owner content.
- Do NOT add off-road / not-street-legal / homologation notices to page copy, banners,
  footers or consent bars. The owner has ruled on this. Those facts belong in the Terms
  of service, section 6, which is linked in the footer and forms part of the contract.
  Do not reinstate them as schema defaults either - a default becomes live copy the
  moment a section is added or reset.
- Do not touch the 3D model or `assets/xero-model.js` bike rendering without being asked.

## NEVER GUESS. Verify, then speak.

The cart bug cost three wrong diagnoses in a row (password redirect, stale
availability cache, editor cookies) because each was a theory offered before
the facts were in. The rule, permanently:

1. Every diagnostic claim must cite its evidence in the same breath - a query
   result, a file read, a checksum, an error body. No evidence, no claim.
2. When the storefront misbehaves, instrument it before explaining it: make the
   code print what it posted and surface the server's own error text verbatim.
   Shopify's reason string beats any inference about it.
3. Admin API state and storefront state are different systems. Never assert the
   storefront's view from an Admin query alone - say which one was checked.
4. If the evidence is not reachable (blocked host, no browser), say exactly
   that and give the user the one test that would settle it - do not fill the
   gap with a plausible story.
5. Being wrong once is data; repeating a diagnosis pattern that already failed
   is guessing. Stop, re-read the code, and widen the search instead.

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
- Do not touch the 3D model or `assets/xero-model.js` bike rendering without being asked.

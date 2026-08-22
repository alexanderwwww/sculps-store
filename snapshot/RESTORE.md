# Rebuilding this store from scratch

Everything needed to stand up an identical copy of **xerochiron.com** on a fresh
Shopify account. Snapshot taken **2026-08-22** from `dmkwx2-8s.myshopify.com`.

## What is in here

| File | What it holds |
|---|---|
| `../` (repo root) | The theme itself — all 103 files, verified identical to the live store |
| `index.json.live` | The live homepage composition: 20 sections, their order, and every setting |
| `media-manifest.json` | 48 images + 5 videos: filename, dimensions, alt text, public CDN URL |
| `media-refs-index.json` | The 30 `shopify://` references the homepage actually uses |
| `store-config.json` | Shop, market, location, delivery, menus, checkout |
| `products.json` | Both products, all variants, prices, SKUs, weights, inventory |
| `pages.json` | The 9 pages and their handles |
| `../STORE-POLICIES.md` | Full text of all six legal policies, ready to paste |

## The one thing that is NOT here

**The media binaries.** The environment this snapshot was taken from blocks
`cdn.shopify.com`, so the actual `.png` and `.mp4` files could not be downloaded.

This matters less than it looks: `fileCreate` accepts a URL and **Shopify fetches it
server-side**, so a restore never needs the bytes locally. The URLs in
`media-manifest.json` are what the restore actually consumes.

**The risk:** those URLs live exactly as long as the source store does. If
`dmkwx2-8s.myshopify.com` is ever closed, they die and the manifest becomes a list of
filenames. **Before closing the source store**, open the manifest, download all 53
URLs from a normal browser, and commit them to `snapshot/media/`.

## Order of operations

Order matters — later steps depend on earlier ones.

### 1. Store settings

From `store-config.json`. None of this is set by the theme.

- Settings → General: name **XERO** (not "WORKSHOP" — it prints on order
  confirmations and card statements), store phone, address, timezone
  **America/New_York**, weight unit **pounds**
- Settings → Taxes: **untick** "All prices include tax" — US stores are tax-exclusive
- Settings → Markets: primary market region must be **United States**. A market named
  "United States" containing a different country is a geo-mismatch flag in underwriting
- Settings → Locations: one location at the US address. An address-less or foreign
  location under a US billing address is the same flag

### 2. Policies

Paste all six from `STORE-POLICIES.md` into **Settings → Policies**.

These cannot be scripted: `shopPolicyUpdate` needs the `write_legal_policies` scope,
which Shopify does not grant to this connection. It must be done by hand, once.

Do not confuse these with the policy **pages**. Checkout links only to Settings →
Policies. Pages with the same text do not satisfy it — empty policy objects are a
top-three decline reason on a payments application.

### 3. Media

For each entry in `media-manifest.json`:

```graphql
mutation ($files: [FileCreateInput!]!) {
  fileCreate(files: $files) {
    files { ... on MediaImage { id image { url } } }
    userErrors { field message }
  }
}
```

with `{ originalSource: <url>, contentType: IMAGE, alt: <alt> }` (use `VIDEO` for the
five `.mp4` entries — take the `hd` URL).

**Filenames must survive.** Every `shopify://shop_images/<filename>` reference in
`index.json.live` resolves by filename. Upload with a different name and the section
silently renders empty. Check the new store's filenames against the manifest before
moving on — Shopify appends a suffix when a name is already taken.

### 4. Products

From `products.json`. Create both, then set for every variant:

- SKU and weight — a 0 kg product that requires shipping breaks carrier rates
- `inventoryPolicy: DENY` and `tracked: true` with a real quantity

Overselling an unlimited number of $4,999 vehicles from zero stock is the textbook
undelivered-goods profile. Keep it off.

Attach product media (alt text is in `products.json`) and publish to **Online Store**
and **Shop**.

### 5. Pages

From `pages.json`. `activate` and `track` have empty bodies on purpose — they render
from `templates/page.activate.liquid` and `templates/page.track.liquid`.

### 6. Theme

Upload the repo. Either `themeCreate` from a zip, or `themeFilesUpsert` with
`body: {type: URL}` pointing at raw GitHub URLs pinned to a commit SHA.

Do the media (step 3) **first**. The theme's JSON templates reference images by
filename, and a template uploaded ahead of its media renders blank.

Then push `index.json.live` as `templates/index.json` to restore the page composition.

### 7. Shipping

From `store-config.json`: one profile, one **United States** zone, one **Free
delivery** rate at $0.00. Confirm no leftover zones for other countries.

### 8. Launch

- Publish the theme
- Remove the storefront password
- Load the store on a phone and walk it: specs count up, reel plays, footer shows all
  six policies, add to cart, check the delivery line in the cart drawer

## Rules that outlive this snapshot

Also recorded in `CLAUDE.md` at the repo root.

1. **Never push `templates/*.json` from a local copy.** Those files are owned by the
   theme editor. Every blind push reverts whatever the owner changed since the last
   pull — this destroyed uploaded images more than once. Pull the live file, apply one
   minimal edit to *that*, push it straight back. Section `.liquid` files are safe.
2. **The bike exists.** Never describe it as pre-order, made to order, or built to
   order.
3. **Figures are manufacturer figures, not independently certified.** IP69K names a
   formal test standard — say "engineered to", never "certified to".
4. **Never label brand footage or renders as customer or owner content.** A store with
   no orders cannot have owner footage, and that is checkable.
5. **No off-road / not-street-legal notices in page copy, banners or bars.** Owner's
   ruling. That belongs in Terms of service §6, which is linked in the footer and forms
   part of the contract. Do not reinstate it as a schema default either — a default
   becomes live copy the moment a section is added or reset.

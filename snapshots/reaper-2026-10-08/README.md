# Black Reaper — the one-product store, saved 2026-10-08

Alex's word: "the ultimate one product store, the checkout like that, and everything like that."
This is the frozen copy of how it stands, so it can be rebuilt or cloned for the next product.

## What is saved
- **Code:** git tag `snapshot/reaper-2026-10-08` (the code is at the commit just before this folder was added: 35c0391). Check it out to get every page, the checkout, the cart drawer, Square/Klarna/Affirm/PayPal paths, priority shipping.
- **Store content (this folder, JSON):** the store row, 14 pages, 85 sections, 336 blocks, 8 products, 18 variants, theme, 2 menus, 22 media records, 2 domains, Meta pixel id, 26 discount codes, 142 reviews.
- **Frames (`screens/`):** home page full length, cart drawer and checkout, each on phone and desktop. This is "exactly how it looked".
- **Images and video** live in the R2 bucket `gardenbuddy-media` (keys are in media.json). They are not touched by anything here.

## What is NOT saved here, on purpose
Orders, customers, carts, analytics, payment keys, the Meta conversion token and the store password hash. They are private; the export script drops any column that looks like a secret (see _dropped-columns.json).

## Live switches worth knowing
- Priority shipping: `stores.priority_ship_cents` (2999) and `priority_ship_copy`. Null = off.
- Checkout add-ons: `app/lib/promote.ts`.

## To bring it back or clone it
Ask Claude: "restore Black Reaper from the 2026-10-08 snapshot" or "clone it for <new product>". The JSON has every row and the tag has the code; nothing here has been auto-restored, so a restore is always a deliberate step.

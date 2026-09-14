# New store, start to finish

The fixed order for standing up a store on Kerberos. Ceiling Buddy was built
this way in one session. Do not improvise a new order — every step here exists
because skipping it cost a session once.

**What Alex supplies:** a logo, product photos, a price, and a name. Nothing
else is needed to get a store live. Domain, Stripe and the pixel come after.

---

## 0. Before touching anything

Read the assets. Open every image. The design follows the photography, not the
other way round — Ceiling Buddy went white because its shots are dark rooms,
and Garden Buddy did not. Decide the palette from the logo: its colours are
the brand's colours, no invention.

## 1. Media into R2

Rename to `<slug>-<what-it-is>.png`, convert to webp, key out any logo
background, upload under a content hash.

```bash
# convert
python3 -c "from PIL import Image; import glob
for f in glob.glob('*.png'):
    Image.open(f).save(f.replace('.png','.webp'),'WEBP',quality=88,method=6)"

# upload — the key is the file's own hash, so a changed image is a new key
set -a; . ./.dev.vars; set +a; export CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID
for f in *.webp; do
  key="$(sha256sum "$f" | cut -c1-16).webp"
  npx wrangler r2 object put "gardenbuddy-media/$key" --file "$f" \
    --content-type image/webp --remote
  echo "$f -> /media/$key"
done
```

Write a `media` row per file so the admin's Media screen sees them.

## 2. Seed the store

One script, run with `set -a; . ./.dev.vars; set +a; node seed-<slug>.mjs`.
In order: `stores` → `media` → `products` → `variants` → `themes` → `pages` →
`sections` (all sixteen, in `SECTIONS` order, position 0..15) → `blocks`.

Non-negotiables:

- **`products.status = 'active'`.** A draft product makes Add to cart silently
  do nothing. This has bitten two stores.
- **`variants.available > 0`**, or `/cart/add` rejects the line.
- **One variant `is_default`.** It is what the sticky bar and the closing CTA
  sell.
- **No invented content.** No reviews, no before/after, no specs you have not
  measured. Seed those sections `hidden: true`, or leave the spec value `''`
  so it renders "Spec pending". Never a guess, never a placeholder number.
- `domain` can be `<slug>.pending` until a real one is bought — it only has to
  be unique.

## 3. Build the theme

`app/storefronts/<slug>/` — `theme.css`, `index.tsx`, `cart-drawer.tsx`.
Copy the closest existing store and rewrite the design; copy the *mechanics*
verbatim. Scope every class with the store's own two-letter prefix, and put
the palette on one `.<prefix>` block as custom properties.

**The CSS trap that has now cost two sessions.** Grid children default to
`min-width: auto`, and a plain `1fr` track is `minmax(auto, 1fr)` — both are
content-sized. One horizontally scrolling strip inside will push the whole
page sideways on a phone. So, always:

```css
.grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.grid > * { min-width: 0; }
@media (max-width: 780px) { .grid { grid-template-columns: minmax(0, 1fr); } }
```

Never `grid-template-columns: 1fr`. Never a bare `repeat(n, 1fr)`.

Other rules learned the hard way:

- A negative `z-index` on a `::after` highlight paints behind the section's
  own background. Use a `linear-gradient` on the element instead.
- **A scoped reset outranks your components.** `.cb button { color: inherit }`
  is specificity (0,1,1) and beats `.cb-btn` at (0,1,0), so the theme's own
  button label was repainted with the inherited ink — white text on a black
  button rendered black on black, and it looked like a missing label rather
  than a cascade problem. Any component that sets a colour the reset also sets
  must be written `.cb .cb-btn`, or the reset must not set that property.
  Check this by asking the browser which rules actually match:
  `el.matches(rule.selectorText) && rule.style.color` over `document.styleSheets`.
- Contain, don't cover, product photography whose subject is at one edge —
  cropping the ceiling out of a ceiling product is the whole failure.
- Anything rendered outside the theme's root div has no palette at all,
  because the custom properties are declared on that div.

### Every storefront must have these — checked, not assumed

Alex has had to ask for these more than once. They are not Shopify defaults
here, because there is no theme doing them for us. Tick every line before
showing him a store.

- [ ] **A burger menu under 880px.** The desktop nav is hidden on a phone and
      without a burger the links are simply gone — and most traffic is phone.
      Panel, veil, Escape to close, close on link tap, and a buy button in it.
- [ ] Sticky add-to-cart bar once the buy box scrolls off.
- [ ] Cart drawer opens on add, and shows the item and the subtotal.
- [ ] Zero horizontal scroll at 400px.
- [ ] Every image has alt text, every icon button an `aria-label`.
- [ ] At most **two** bundle options. Three tiers of a $100+ product puts a
      number at the top of the page nobody will pay and kills the sale before
      the cheap option is read. Badge the upsell, never the default.
- [ ] Section headings anchor the nav links (`#how`, `#proof`, `#reviews`,
      `#faq`) and those anchors actually exist.

### Where the brand stops and the buying starts

The lesson from Ceiling Buddy, in one line: **character on the things being
looked at, quiet confidence on the things being clicked.**

Heavy keylines, hard offset shadows and tilted stickers belong on chips,
photo tiles, steps and the FAQ. The gallery, the bundle rows and the buy
button get hairline borders, soft shadows and one strong colour — a cartoon
buy box reads as a toy and does not convert. Do not strip the personality to
fix this; move it.

## 4. Wire it up

In `app/routes/storefront.tsx`: import the component and its
`theme.css?url`, add the slug constant, add the branch **above** the existing
ones. Then `npx react-router typegen` if routes changed.

## 5. Gate, build, deploy — in this order, never two at once

```bash
npx tsc -b --force --pretty false     # must be silent
npm run build                          # NEVER run two builds concurrently
set -a; . ./.dev.vars; set +a; export CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID
npx wrangler deploy
```

Two concurrent builds print "The build was canceled" and ship a stale bundle.

## 6. Verify — every line of this, every time

Nothing is reported as working until it has been checked in the same turn.

```bash
B=https://kerberos.gardenbuddystore.workers.dev
# 1. every store still answers — a new theme must not break the others
for s in <slug> garden-buddy bodies garden-kneeler; do
  echo "$s $(curl -s -o /dev/null -w '%{http_code}' "$B/?store=$s")"; done
# 2. every media file
curl -s -o /dev/null -w '%{http_code}\n' "$B/media/<key>.webp"
# 3. money actually moves
J=/tmp/j; rm -f $J
curl -s -c $J -b $J -o /dev/null "$B/?store=<slug>"
curl -s -c $J -b $J -X POST "$B/cart/add?store=<slug>" -d "variantId=<id>" -o /dev/null
curl -s -b $J "$B/checkout?store=<slug>" | grep -oE '\$[0-9]+\.[0-9]{2}' | sort -u
```

The checkout must print the price you seeded. If it does not, the product is
draft or the variant is out of stock.

## 7. Look at it

The browser here cannot reach the live site, so pull the page into one
self-contained file and render that: inline the `/assets/*.css`, base64 every
`/media` file, strip remote scripts, drop `loading="lazy"` so the whole page
photographs. **Check each fetch, and retry** — a stylesheet that comes back as HTML gives a
page with no layout and a 77,000px screenshot, which looks like a code bug and
is not one. Deploys also race: a page fetched mid-deploy references an asset
hash that is not live yet. `scratchpad/render.sh` retries six times before
giving up.

When a rendered page disagrees with the served CSS, do not keep re-rendering
the whole page. Pull the one fragment and the live stylesheet into a small test
file and inspect that — it isolates the bug in one step instead of five.

Then assert, in the page: `document.documentElement.scrollWidth -
clientWidth === 0` at 400px wide. Screenshot desktop and mobile and actually
read them.

## 8. Write it down

Update the status section of `.claude/skills/kerberos/SKILL.md`, and record
the store's palette and any design decision Alex rejected, so it is not
proposed to him a second time.

---

## What is still missing when this is done

A store built this way renders, takes a cart and reaches checkout. It cannot
take money until: a domain on the store row, a Stripe account connected under
Payments, and a Meta pixel under Meta. Say that plainly rather than letting
him think it is finished.

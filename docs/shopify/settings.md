# Settings — screen-by-screen specification

Companion to `docs/shopify/domains.md` (the Domains pane, transcribed from Alex's
admin) and `docs/shopify/online-store.md`. Sections here run in Shopify's own
left-nav order and skip **Domains**, which `domains.md` already covers.
`docs/shopify-parity.md` covers Payments, Domains, Meta and Shipping at a
high level; §5 (Payments), §8 (Shipping and delivery) and §9 (Taxes and duties)
below go to field level and do not restate it.

## How to read this file

- Copy in `"double quotes"` is Shopify's own string as it appears in the admin
  or in a citable Shopify source (help.shopify.com, shopify.dev, the Admin
  GraphQL schema).
- Copy marked **⚠ unverified** is the shape of the string, not a transcription.
  I could not pin the exact wording to a source. Build the control, treat the
  words as a placeholder, and replace them the next time someone has the real
  admin open.
- Where an option list is backed by an Admin GraphQL enum, the enum name is
  given — that list is exhaustive and authoritative even when the *label*
  is not.

## The Settings shell (applies to every pane)

Two columns inside a modal-style screen, per `domains.md`:

- **Left rail, top:** store card — square avatar with the store's initials,
  store name in medium weight, primary domain underneath in grey.
- **Left rail, then:** a **Search** field (placeholder ⚠ `"Search settings"`).
- **Left rail, then:** the nav list, each row a monochrome icon + label, the
  active row on a light-grey pill:

  General · Plan · Billing · Users · Payments · Checkout · Customer accounts ·
  Shipping and delivery · Taxes and duties · Locations · Markets · Apps ·
  Sales channels · Domains · Customer events · Notifications ·
  Metafields and metaobjects · Languages · Customer privacy · Policies

- **Right pane:** white, its own header row (icon + pane title on the left,
  pane-level actions on the right), then a vertical stack of cards with 16px
  gaps. Cards are white, 1px border, ~8px radius, a bold title in the header
  and — where the card has one — a footer strip holding **Save**.
- **Save model:** Shopify saves per-pane, not per-card. Editing any field
  raises a sticky **contextual save bar** across the top of the pane reading
  "Unsaved changes" with **Discard** (secondary) and **Save** (primary) on the
  right. Cards that manage a *list* (domains, locations, users, rates) save
  their rows immediately instead and have no save bar.
- **Error model:** a red banner at the top of the pane, "There was a problem",
  listing each invalid field as a link; the field itself gets a red border and
  red inline text under it.

---

## 1. General

Header: **General**, no header actions.

### Card 1 — "Store details"

| Field | Control | Options / default | Help text | Validation |
|---|---|---|---|---|
| Store name | text | store's name; required | ⚠ "Appears on your storefront, invoices and email" | non-empty, ≤ 255 |
| Store logo | image picker: a square thumb + **Add image** / **Change** | none | ⚠ "Used on invoices and email" | image mime, ≤ 20 MB |
| Store phone | tel with country-code prefix select | blank | — | E.164 after prefix |
| Store email | email | store owner's email | "The shop owner's email address. Shopify will use this email address to communicate with the shop owner." (`Shop.email`) | valid email |
| Sender email | email + a **Verify** / status chip | defaults to the store email | ⚠ "Emails to customers are sent from this address" | valid email; domain must pass SPF/DKIM or Shopify rewrites the From |

`Shop.contactEmail` and `Shop.email` are two different fields and both appear
here: contact email is "The public-facing contact email address for the shop.
Customers will use this email to communicate with the shop owner."

### Card 2 — "Billing information"

Header has a right-aligned **Edit** link that opens a modal.

| Field | Control | Notes |
|---|---|---|
| Legal business name | text | required before Payments can be activated |
| Country/region | select | full ISO-3166 country list (`CountryCode` enum) |
| Address | text | |
| Apartment, suite, etc. | text | optional |
| City | text | |
| State / Province | select, list keyed off country | hidden for countries with no subdivisions |
| ZIP / Postal code | text | format validated per country |

### Card 3 — "Store defaults"

| Field | Control | Options | Default |
|---|---|---|---|
| Currency | select | full `CurrencyCode` enum | store's `Shop.currencyCode` |
| Unit system | select | "Metric system", "Imperial system" (`UnitSystem` enum: `METRIC_SYSTEM`, `IMPERIAL_SYSTEM`) | Metric outside the US |
| Default weight unit | select | "Kilograms", "Grams", "Pounds", "Ounces" (`WeightUnit`: `KILOGRAMS`, `GRAMS`, `POUNDS`, `OUNCES`) | Kilograms |
| Time zone | select | full IANA list rendered as `(GMT-05:00) Eastern Time (US & Canada)` | `Shop.ianaTimezone` |

Currency has an inline note that a store which has taken an order cannot change
currency without contacting support; the select goes read-only with a **Change
store currency** link instead. Time zone is display-only — it does not move
recorded timestamps.

### Card 4 — "Order ID"

Two text fields side by side, **Prefix** and **Suffix**, backed by
`Shop.orderNumberFormatPrefix` / `Shop.orderNumberFormatSuffix`. Prefix
defaults to `#`, suffix to empty. Under them a live preview line, ⚠ of the form
"Your order ID will appear as #1001". Max 20 chars each; the numeric part is
never editable.

### Card 5 — "Store currency" / "Standards and formats"
Region-dependent. Holds the currency display formats (`Shop.currencyFormats`:
HTML with currency, HTML without currency, email with currency, email without
currency) behind a **Change formatting** link. Four text fields taking Liquid
tokens like `${{amount}}`.

### Card 6 — "Store status"
Shown only on unpaid/paused stores. Status pill words: "Trial", "Paused",
"Frozen". ⚠ copy unverified.

---

## 2. Plan

Header: **Plan**.

### Card 1 — current plan
- Left: plan name in large type ("Basic", "Grow", "Advanced", "Plus",
  "Starter", "Retail" — `ShopPlan.displayName`), the price line
  ⚠ "$XX USD every month", and the renewal line ⚠ "Your next bill is on
  <date>".
- Right of the header: **Change plan** (primary).
- Footer: a **Cancel plan** link, left-aligned, red text.
- On a trial, a banner card above it reading ⚠ "Your free trial ends in N days"
  with a **Choose a plan** button.

### Card 2 — "Plan features" / comparison
A two-column table of what the current plan includes; ⚠ copy unverified. Items
Shopify keys plan tiers on: staff account count, number of inventory locations,
transaction-fee percentage on third-party gateways, shipping-discount tier,
"Checkout editor apps", "Checkout Branding API" (Plus only),
"Customize checkout with apps for information, shipping and payments pages"
(Plus only).

### Card 3 — invoices
List rows: date, description, amount, a **View** / download link. Empty state
⚠ "No invoices yet".

### States
- Status pill on the plan card: "Active", "Trial", "Paused", "Cancelled".
- Cancelling opens a modal with a reason radio list and a typed confirmation.

---

## 3. Billing

Header: **Billing**. This is money owed *to Shopify*, distinct from Payments
(money owed *to you*).

### Card 1 — "Payment methods"
- Rows: card brand icon, `•••• 4242`, expiry, a "Primary" chip on the default.
- Row overflow **⋯**: "Make primary", "Replace", "Remove".
- Header right: **Add payment method**.
- Empty state: ⚠ "No payment method on file" with body ⚠ "Add a payment method
  to keep your store active."

### Card 2 — "Bills" / billing history
Table columns: Date · Description · Amount · Status · (download icon).
Status pill words: "Paid", "Pending", "Failed", "Refunded". ⚠ exact set
unverified. Filter chips above the table for date range.

### Card 3 — "Credits"
Shows unapplied account credit as a single amount plus an expiry note; empty
state ⚠ "You have no credits".

### Card 4 — "Subscriptions"
One row per recurring app charge and per plan charge: app name, amount,
frequency, next bill date, a **Cancel** overflow action.

### Card 5 — "Statement of charges" / "Billing settings"
- **Billing currency** — display only after the first charge.
- **Send invoices to** — email, ⚠ help "Invoices and billing notices go here."
- Tax registration / VAT number field for applicable regions.

---

## 4. Users

Shopify labels this "Users" in the nav and "Users and permissions" in the pane
header on some versions; use **Users**.

### Card 1 — "Store owner"
One row: avatar, name, email, a "Store owner" chip, and a **⋯** with
"Transfer ownership". Ownership transfer opens a modal requiring the new
owner's email and the current owner's password.

### Card 2 — "Staff"
- Header right: **Add staff**.
- Rows: avatar, name (link to the staff detail screen), email underneath,
  last-login line ⚠ "Last login <relative time>", and a status chip.
- Status chip words: "Active", "Pending", "Suspended". A staff member who has
  been invited but not accepted shows "Pending" plus a **Resend invite**
  overflow action.
- Empty state (single-operator store): ⚠ "No staff yet".
- Footer note giving the plan's staff limit, ⚠ "You can add N more staff".

**Staff detail screen** (a full page, not a modal):
- "Account" card — first name, last name, email (text fields), and a
  **Deactivate** / **Remove** destructive action in the footer.
- "Permissions" card — a checkbox tree. Top row is
  ⚠ "Select all" / a "Full access" checkbox; below it groups matching the admin
  nav — Home, Orders, Draft orders, Products, Gift cards, Inventory,
  Customers, Reports, Marketing, Discounts, Apps, Domains, Settings,
  each expanding to per-action checkboxes (e.g. under Orders:
  "View orders", "Create orders", "Edit orders", "Refund orders",
  "Cancel orders", "Delete orders"). The exact leaf labels are documented at
  help.shopify.com/en/manual/your-account/users/roles/permissions.
- Checking a parent checks all children; a partial selection renders the parent
  as an indeterminate checkbox.

### Card 3 — "Collaborators"
- A **Collaborator request code** field: a 4-digit code, read-only, with a
  copy button and a **Generate new code** link.
- A radio pair controlling who may request access:
  ⚠ "Anyone can send a collaborator request" /
  ⚠ "Only people with a collaborator request code can send a collaborator
  request" — the second is the default and is why the code field exists.
- Below, collaborator rows identical in shape to staff rows plus the partner
  organisation name.

### Card 4 — "Security"
- **Two-step authentication** — a toggle ⚠ "Require two-step authentication"
  applying to every staff account, with a note naming how many accounts do not
  yet have it.
- **Login services** — rows for "Google" and "Apple" with Enable/Disable.
- **Store activity log** link row, ⚠ "View the security and activity log".

---

## 5. Payments

`docs/shopify-parity.md` §1 has the card order and the dispute/payout detail.
Field-level additions only:

### Card — the active provider
- Header: provider name + logo, right side **Manage**.
- Body rows: "Status" with a green "Active" pill; the payout schedule line;
  the card-brand icon row (Visa, Mastercard, Amex, Discover, Diners, JCB,
  Elo, plus Shop Pay / Apple Pay / Google Pay wallet marks).
- Test-mode banner when enabled, wording per parity doc §1.3 item 4.

### Card — "Payment capture method"
Radio group, three options, verified against the parity doc:
- "Automatic" — capture at checkout.
- "Manual" — authorize only, capture within the authorization window.
- "Automatic at fulfillment" — capture when the order's items are fulfilled.

### Card — "Supported payment methods"
A searchable list of alternative providers with **Activate** per row and a
**Deactivate** on active ones. Third-party gateways show the plan's transaction
fee as a warning line under the row.

### Card — "Manual payment methods"
Header right: an **Add manual payment method ▾** menu with fixed entries
"Bank Deposit", "Money Order", "Cash on Delivery (COD)", and
"Create custom payment method". Each opens a form with **Additional details**
(textarea, shown at checkout under the method name) and **Payment instructions**
(textarea, shown on the order-confirmation page).

### Card — "Payment customizations" (Plus / apps)
Empty state ⚠ "No payment customizations".

---

## 6. Checkout

The densest pane. Header: **Checkout**.

### Card 0 — "Checkout configurations" (multi-config stores only)
A list of configurations with a "Live" chip on the published one and
**Publish** / **Duplicate** overflow actions. Single-config stores do not see
this card.

### Card 1 — "Customer contact method"
Radio group:
- "Phone number or email"
- "Email"

⚠ label wording of the radio pair unverified; the two states are certain.
Below it a checkbox ⚠ "Require the customer to log in before checkout" when
customer accounts are set to required (mirrors
`CustomerAccountsV2.loginRequiredAtCheckout`).

### Card 2 — "Customer information"
Four rows, each a radio pair or triple:

| Row | Options | Default |
|---|---|---|
| Full name | "Only require last name" / "Require first and last name" | Require first and last name |
| Company name | "Don't include" / "Optional" / "Required" | Don't include |
| Address line 2 (apartment, unit, etc.) | "Don't include" / "Optional" / "Required" | Optional |
| Shipping address phone number | "Don't include" / "Optional" / "Required" | Optional |

These four rows and their exact three-way option wording are the strongest
copy in the pane — they are stable across Shopify versions and match the
existing implementation in `CheckoutPane`.

### Card 3 — "Marketing options"
- Checkbox ⚠ "Show a sign-up option at checkout" for email.
- Checkbox ⚠ "Show a sign-up option at checkout" for SMS
  (`Shop.marketingSmsConsentEnabledAtCheckout`).
- A radio pair controlling the pre-tick state:
  ⚠ "Preselected" / ⚠ "Not preselected". Several US states forbid preselection;
  the safe default is not preselected.

### Card 4 — "Tipping"
Toggle ⚠ "Show tipping options at checkout", and when on, three percentage
fields for the preset tip amounts plus a "Custom" checkbox.

### Card 5 — "Abandoned checkouts"
- Checkbox "Automatically send abandoned checkout emails".
- Radio "Send to": ⚠ "Anyone who abandons a checkout" /
  ⚠ "Email subscribers who abandon a checkout".
- Select "Send after": "1 hour", "6 hours", "10 hours", "24 hours". The four
  intervals are verified; the label is ⚠.

### Card 6 — "Order processing"
Verified from help.shopify.com/en/manual/checkout-settings/order-processing:
- "Require a confirmation step" — checkbox; sends customers to review the order
  before the checkout completes.
- "Automatically fulfill the order's line items" — checkbox, with a nested
  checkbox for notifying the customer and one for overriding fraud analysis.
- "Automatically archive the order" — checkbox; archives an order once it is
  paid and fulfilled, or fully refunded.
- Address autocomplete — checkbox ⚠ "Use the shipping address autocomplete".

### Card 7 — "Checkout language"
A select of the store's published locales plus a **Manage checkout language**
link that opens the checkout translation editor.

### Card 8 — "Checkout rules"
List of installed validation-function apps; empty state ⚠ "No checkout rules".

### Card 9 — "Post-purchase page"
A select of installed post-purchase extensions, plus "None" as the default.

### Card 10 — "Order status page" → "Additional scripts"
A monospace textarea. Deprecated in favour of customer events but still
present on non-upgraded stores; help text warns that scripts here run for every
buyer.

### Card 11 — "Checkout expiry" / "Abandoned cart expiry"
⚠ wholly unverified. Governs how long a checkout holds inventory.

### Card 12 — policy links
Read-only rows for Refund policy, Privacy policy, Terms of service, Shipping
policy, each with an **Edit** link jumping to §19 Policies.

Header right of the pane: **Customize** — opens the checkout editor, a separate
screen out of scope here.

---

## 7. Customer accounts

Header: **Customer accounts**.

### Card 1 — account version
Radio pair, backed by `CustomerAccountsVersion`:
- "New customer accounts" — passwordless; "Customers enter their email and
  receive a one-time 6-digit verification code"; sessions "persist for up to
  365 days".
- "Legacy customer accounts" — email + password.

Selecting new accounts shows a sub-list of what the customer gets:
"view and manage their orders, edit profile information, and take key actions
such as self-serve returns or reordering."

### Card 2 — "Login links"
Toggle backed by `CustomerAccountsV2.loginLinksVisibleOnStorefrontAndCheckout`,
⚠ labelled "Show login links in the online store and checkout".

### Card 3 — "Accounts in checkout"
Radio triple. The three states are certain
(`ShopCustomerAccountsSetting`: `DISABLED`, `OPTIONAL`, `REQUIRED`):
- "Don't use accounts" — customers check out as guests only.
- "Accounts are optional" — customers may log in or check out as guests.
- "Accounts are required" — customers must log in to check out
  (`loginRequiredAtCheckout = true`).

⚠ exact label wording unverified; the enum is authoritative.

### Card 4 — "Customer account URL"
Read-only text with a copy button, from `CustomerAccountsV2.url`
(`https://shopify.com/<shop-id>/account`). Underneath, a **Manage** link to
the customer-account branding editor.

### Card 5 — sign-in methods
Rows for "Shop Pay", "Google", "Facebook", each a toggle; and, on Plus, a
"Custom identity provider" row with an **Add** action (OIDC issuer, client ID,
client secret fields).

### Card 6 — "Self-serve returns"
Toggle ⚠ "Let customers request returns from their account", plus a window in
days and a **Return rules** link.

---

## 8. Shipping and delivery

Parity doc §4 has the profiles/zones/rates model. Pane layout only:

- **Card "Shipping"** — the list of delivery profiles. First row is
  "General shipping rates" (the default profile, `DeliveryProfile.default`),
  then one row per custom profile with its product count. Header right:
  **Create new profile**. Each row links to the profile editor, which shows
  zones and, per zone, the rate rows; a rate row is name + condition + price.
  Rate conditions are weight-based or price-based, matching
  `DeliveryMethodDefinition`.
- **Card "Local delivery"** — one row per location, "Not set up" / a distance
  or postal-code list, with **Manage**.
- **Card "Local pickup"** — one row per location, with a **Manage** that
  opens pickup-instruction and expected-time fields.
- **Card "Packages"** — saved box/envelope dimensions; header right
  **Add package**; empty state ⚠ "No packages saved".
- **Card "Custom order fulfilment"** / "Shipping labels" — carrier accounts and
  the label-purchase defaults.
- **Card "Saved package"/"Processing time"** — order cut-off time and
  processing-days fields feeding delivery-date estimates.
- **Card "Order routing"** — the location priority list, drag-reorderable, plus
  a checkbox ⚠ "Fulfil from the location closest to the customer".

---

## 9. Taxes and duties

Header: **Taxes and duties**.

### Card 1 — "Tax regions"
A table, one row per region where the store has a shipping zone
(`Shop.countriesInShippingZones`): region name, the collection state, and a
**Manage** link on the right.
- Status text per row: ⚠ "Collecting" / ⚠ "Not collecting".
- The region detail screen holds the state/province rate list, each row a
  state name, a rate, and a select for how it combines with the federal rate.
  For the US the combination options are ⚠ "added to", ⚠ "instead of",
  ⚠ "compounded on top of" the federal rate.
- **Sales tax collection** sub-card with an **Add region** / **Collect sales
  tax** action taking a state and a tax ID.

### Card 2 — tax service
Radio triple:
- "Shopify Tax" — automatic rates plus rooftop-accurate US calculation;
  priced per order over a threshold.
- "Basic Tax" — automatic rates, no rooftop accuracy, no reports.
- "Manual Tax" — the merchant enters every rate.

The three service names are verified; the one-line descriptions are ⚠.

### Card 3 — "Global settings" / tax calculations
Three checkboxes, all verified as `Shop` fields:
- "Include tax in prices" (`Shop.taxesIncluded`) — help ⚠ "Prices shown on
  your storefront already include tax."
- "Charge tax on shipping rates" (`Shop.taxShipping`).
- "Charge VAT on digital goods" — EU only.

### Card 4 — "Duties and import taxes"
Toggle ⚠ "Collect duties and import taxes at checkout", plus a note that every
product needs an HS code and a country of origin, and a link to the products
that are missing one.

### Card 5 — "Tax overrides"
Rows: collection or shipping-zone name, region, rate. Header right:
**Add override** (modal: "Products" or "Shipping" radio, a collection picker,
a country/region select, a rate field). Empty state ⚠ "No overrides".

---

## 10. Locations

Header: **Locations**, right side **Add location** (primary).

### Card 1 — the location list
Rows: location name in medium weight, address on the second line, and on the
right a chip set:
- "Default" chip on the default location.
- ⚠ "Inactive" chip on deactivated locations.
- ⚠ "Fulfils online orders" / a fulfilment-status line.
Row overflow **⋯**: "Deactivate location", "Delete location". The default
location cannot be deactivated; the item renders disabled with a tooltip.

Footer of the card: the plan's location count, ⚠ "N of M locations used".

### Location detail screen
- Card "Location details": Location name (text, required), Address, Apartment
  suite etc., City, Country/region (select), State (select), ZIP, Phone.
- Checkbox "Fulfil online orders from this location" — unchecking removes it
  from order routing.
- Checkbox ⚠ "This location has a physical address" for virtual/dropship
  locations.
- Card "Local pickup" / "Local delivery" links.
- Footer: **Deactivate location** (destructive). Deactivation opens a modal
  demanding a destination location for the remaining inventory.

### Card 2 — "Default location"
A select of active locations. Help: ⚠ "Used when an order does not specify a
location and for products with no inventory anywhere."

### Empty state
Impossible — every store has at least one location.

---

## 11. Markets

Header: **Markets**, right side **Add market** (primary) and a **⋯**.

### Card 1 — "Primary market"
One row: the market name, its countries summarised ("United States" or
"3 countries"), a "Primary" chip, and **Manage**.

### Card 2 — "Other markets"
Rows: market name, country summary, a status chip — "Active" (green) or
"Draft" (grey). Row overflow: "Set as primary", "Deactivate", "Delete".
Empty state ⚠ "No other markets".

### Market detail screen — cards in order
1. **"Countries/regions"** — a chip list with an **Add countries** search
   modal; a country may belong to exactly one market and the picker greys out
   ones already claimed.
2. **"Domains and languages"** / web presence — a radio pair
   ⚠ "Use a subfolder of the primary domain" (`/en-ca`) versus
   ⚠ "Use a different domain or subdomain", then a domain select drawn from
   Settings → Domains; then the published languages for this market with one
   marked default.
3. **"Products and pricing"** — the catalog assigned to the market, a
   percentage **Price adjustment** field (`+`/`-` and a number, help ⚠
   "Applied to every product price in this market"), and a
   **Rounding** select whose options are ⚠ "No rounding",
   ⚠ "Round to the nearest whole number", ⚠ "End all prices in .99",
   ⚠ "End all prices in .00".
4. **"Currency"** — a select of presentment currencies
   (`Shop.enabledPresentmentCurrencies`) with an ⚠ "Auto-convert prices"
   checkbox using Shopify's rate.
5. **"Shipping"** — which delivery profiles serve this market.
6. **"Duties and import taxes"** — per-market override of §9 Card 4.
7. Footer: **Deactivate market** / **Delete market**.

Status pill wording on the market header: "Active", "Draft".

---

## 12. Apps

Nav label **Apps** (older builds: "Apps and sales channels"). Header right:
**Shopify App Store** (secondary, opens externally) and
**Develop apps** (secondary).

### Card 1 — "Installed apps"
- A search field in the card header, plus a sort ⚠ "Sort by: App name".
- Rows: app icon, app name, developer name underneath, and on the right a
  **⋯** with "App details", "View in App Store", "Uninstall". Some rows carry
  a chip ⚠ "Needs attention" when a scope change is pending.
- Empty state ⚠ "No apps installed" with body ⚠ "Browse the Shopify App Store
  to find apps for your store." and a **Visit the Shopify App Store** button.

### Card 2 — "Pending installation requests"
Rows for apps a collaborator requested; **Approve** / **Decline**. Hidden when
empty.

### Card 3 — "App and sales channel settings" / developer apps
A link row **Develop apps for your store**, and, once enabled, a list of custom
apps with their Admin API access-token state — ⚠ "API credentials" per row and
a one-time reveal of the token.

Uninstall opens a confirmation modal naming the app and warning that its data
is deleted after 48 hours; ⚠ exact copy unverified.

---

## 13. Sales channels

Header: **Sales channels**. On many builds this is the second card of the Apps
pane rather than its own nav row; Alex's admin (per `domains.md`) lists it
separately, so build it separately.

### Card 1 — the channel list
Rows: channel icon, channel name ("Online Store", "Point of Sale", "Shop",
"Facebook & Instagram", "Google & YouTube", "TikTok", "Amazon"), a status chip,
and a **⋯** with "Remove channel" / "Manage".
- Status chip words: ⚠ "Active", ⚠ "Needs attention", ⚠ "Setup incomplete".
- Online Store cannot be removed; the menu item renders disabled.

### Card 2 — "Recommended channels" / available channels
Drawn from `Shop.availableChannelApps` — the sales channels not installed. Each
row has an **Add** button and a one-line description.

### Card 3 — channel visibility default
⚠ Unverified. A checkbox controlling whether newly created products are
published to every channel by default.

---

## 14. Customer events

Header: **Customer events**, right side **Add custom pixel** (primary).

### Card 1 — the pixel list
Table: Name · Type · Status · Permission.
- Type values: ⚠ "Custom pixel" and ⚠ "App pixel".
- Status pill: "Connected" (green) / "Disconnected" (grey). These two are
  verified in `docs/shopify-parity.md` §5.1 item 14.
- Row click opens the pixel detail.

Empty state ⚠ "No customer events yet" with body pointing at the App Store and
at **Add custom pixel**.

### Custom pixel detail screen
- **Name** — text, required, unique.
- **Permission** — radio pair: ⚠ "Required — the pixel runs regardless of
  customer consent" / ⚠ "Not required — the pixel only runs after the customer
  consents". Default is the consent-respecting option.
- **Data sale** — a radio pair for CCPA "Data sale" classification; ⚠ copy
  unverified.
- **Code** — a large monospace editor pre-seeded with a subscribe example.
  The events it may subscribe to are the Web Pixels standard events:
  `page_viewed`, `product_viewed`, `collection_viewed`, `search_submitted`,
  `product_added_to_cart`, `product_removed_from_cart`, `cart_viewed`,
  `checkout_started`, `checkout_contact_info_submitted`,
  `checkout_address_info_submitted`, `checkout_shipping_info_submitted`,
  `payment_info_submitted`, `checkout_completed`, `alert_displayed`,
  `ui_extension_errored`, `clicked`, `form_submitted`, `input_blurred`,
  `input_changed`, `input_focused`.
- Footer: **Save** (primary), **Connect** / **Disconnect**, **Delete pixel**
  (destructive).

---

## 15. Notifications

Header: **Notifications**.

### Card 1 — "Sender email" / "Email sender"
- Field: sender address (text). Help ⚠ "Customer notifications are sent from
  this address."
- Below it a DNS card appearing once a custom domain is entered: a three-column
  table Type · Host · Value with CNAME/TXT rows for SPF and DKIM, each with a
  copy button, plus a **Verify** button and a status chip ⚠ "Authenticated" /
  ⚠ "Not authenticated".

### Card 2 — "Customer notifications"
Link rows grouped by heading, exactly these groups:
**Order**, **Shipping**, **Customer**, **Local delivery**, **Local pickup**,
**Returns**. Each row is the template name plus a chevron; clicking opens the
template editor.

Template names Shopify ships (group → template):
- Order: "Order confirmation", "Order edited", "Order invoice",
  "Order cancelled", "Order refund", "Draft order invoice",
  "Abandoned checkout", "POS exchange receipt", "Payment error",
  "Pending payment error", "Pending payment success".
- Shipping: "Fulfillment request", "Shipping confirmation",
  "Shipping update", "Out for delivery", "Delivered".
- Customer: "Customer account invite", "Customer account welcome",
  "Customer account password reset", "Contact customer",
  "Gift card created".
- Local delivery: "Local order out for delivery",
  "Local order delivered", "Local order missed delivery".
- Local pickup: "Ready for pickup", "Picked up".
- Returns: "Return instructions", "Return label", "Return approved",
  "Return declined".

⚠ The grouping is verified (parity doc §5.1 item 16); a handful of individual
template names in this list are from memory of the admin, not a citable page —
treat any name you cannot find in the Shopify Help Center as provisional.

**Template editor screen:** the template's subject line as a text field, a
monospace Liquid/HTML editor, a **Preview** pane, a **Send test** button in the
header, **Revert to default** in the footer, and **Save** (primary).

### Card 3 — "Staff notifications"
- Rows: a recipient email or "Order notification to <email>", with a
  location filter chip when the store has more than one location.
- Header right: **Add recipient** — a modal with an email field and a select
  ⚠ "Send notifications for orders from: All locations / <location>".
- Empty state ⚠ "No one is notified about new orders".

### Card 4 — "Webhooks"
- Rows: `<topic>` in mono, the URL underneath, then the format and API version
  on the right, plus **⋯** with "Edit", "Send test notification", "Delete".
- Header right: **Create webhook** — modal with an **Event** select (the full
  webhook topic list: `orders/create`, `orders/paid`, `orders/fulfilled`,
  `orders/cancelled`, `products/create`, `customers/create`, … ), a **Format**
  radio ("JSON" / "XML"), a **URL** field, and an **API version** select.
- Below the list, the shared webhook signing secret in mono with a copy button
  and the line ⚠ "All your webhooks will be signed with <secret>".
- Empty state ⚠ "No webhooks".

---

## 16. Metafields and metaobjects

Header: **Metafields and metaobjects**. Older builds label the nav row
"Custom data".

### Card 1 — "Metafields"
Link rows, one per owner resource, each showing the count of definitions:
Products, Variants, Collections, Customers, Orders, Draft orders, Pages,
Blogs, Blog posts, Locations, Markets, Companies, Company locations,
Discounts, Gift card transactions, Selling plans, Shop. The authoritative list
is the `MetafieldOwnerType` enum: `PRODUCT`, `PRODUCTVARIANT`, `COLLECTION`,
`CUSTOMER`, `ORDER`, `DRAFTORDER`, `PAGE`, `BLOG`, `ARTICLE`, `LOCATION`,
`MARKET`, `COMPANY`, `COMPANY_LOCATION`, `DISCOUNT`, `GIFT_CARD_TRANSACTION`,
`SELLING_PLAN`, `SHOP`, plus the app-only owners `API_PERMISSION`,
`PAYMENT_CUSTOMIZATION`, `DELIVERY_CUSTOMIZATION`, `VALIDATION`,
`CARTTRANSFORM`, `FULFILLMENT_CONSTRAINT_RULE`,
`ORDER_ROUTING_LOCATION_RULE`.

Clicking a resource opens its definition list. Header right there:
**Add definition**.

### Definition editor — every field, from `MetafieldDefinitionInput`
| Field | Control | Validation |
|---|---|---|
| Name | text, required | human-readable |
| Namespace and key | two text fields, shown behind a **⋯**/"Edit" affordance, prefilled from the name | namespace 3–255 chars, alphanumeric + hyphen + underscore; key 2–64 chars, same charset; the pair is immutable after creation |
| Description | textarea, optional | — |
| Type | a **Select type** picker opening a categorised list | one of the supported metafield types |
| Validation | type-dependent rows (min/max, min/max length, regex, allowed values, file types) | `MetafieldDefinitionValidationInput` name/value pairs |
| Storefront access | checkbox ⚠ "Storefronts" | `PUBLIC_READ` / `NONE` |
| Customer account access | select | `READ_WRITE` / `READ` / `NONE` |
| Admin access | select | "Merchant read" / "Merchant read and write" (`MERCHANT_READ`, `MERCHANT_READ_WRITE`) |
| Pin definition | checkbox ⚠ "Pin definition" | pinned definitions show on the resource form by default |
| Use as collection condition | checkbox | capability `smartCollectionCondition` |
| Filterable in admin | checkbox | capability `adminFilterable` |
| Unique values | checkbox | capability `uniqueValues` |

Type list (the picker's own groupings): single line text, multi-line text,
rich text, integer, decimal, money, true/false, date, date and time, URL,
color, rating, dimension, volume, weight, JSON, file, and reference types —
product, product variant, collection, page, file, metaobject, customer,
company, order, variant. Each scalar type also offers a "list of" variant.

### Card 2 — "Metaobjects"
- Rows: definition name, entry count, and the type handle in mono.
- Header right: **Add definition**.
- Empty state ⚠ "No metaobject definitions".
- Definition editor: **Name** (text), **Type** (handle, auto-derived, editable
  once), a repeatable **Fields** list using the same type picker and validation
  set as metafields, and an **Options** card with checkboxes for
  ⚠ "Storefronts" access, ⚠ "Publishable" (adds a draft/active status to each
  entry), and ⚠ "Web page" (gives each entry an online-store URL, with a URL
  handle prefix field).

---

## 17. Languages

Header: **Languages**, right side **Add language** (primary).

### Card 1 — "Published languages"
Rows: language name plus its locale code in grey, a "Default" chip on the
default, a **Translate** link on the right, and a **⋯** with
"Make default", "Unpublish", "Remove". The default language cannot be
unpublished.

### Card 2 — "Unpublished languages"
Same row shape; the primary row action is **Publish**. Empty state
⚠ "No unpublished languages".

### Card 3 — the translation app row
A link row for **Translate & Adapt** (Shopify's own app) that installs it if
absent. Help ⚠ "Translate your store content into your published languages."

Adding a language opens a modal with a searchable select of locales; the modal
warns that untranslated content falls back to the default language.

`Add language` is capped by plan (2 on Basic, 5 on Grow, 20 on Advanced,
20+ on Plus) — the button disables at the cap with the count in a tooltip.
⚠ the specific caps are from memory, verify before relying on them.

---

## 18. Customer privacy

Header: **Customer privacy**.

### Card 1 — "Cookie banner"
- A status line and a **Customize banner** / **Set up** button.
- **Region visibility** — a checkbox list of the regulatory regions the banner
  shows in: "European Economic Area and the United Kingdom",
  "California", ⚠ plus rows for Canada, Japan, Thailand and other regions
  Shopify has added. Each row states the law it maps to (GDPR, CPRA, …).
  ⚠ the row labels are unverified.
- **Banner position** — radio/select. Options ⚠ "Bottom left",
  ⚠ "Bottom center", ⚠ "Bottom full-width".
- **Appearance** — ⚠ "Light" / "Dark", plus a corner-radius or style control.
- A live preview of the banner, showing the "Accept" / "Decline" /
  "Privacy preferences" buttons.

### Card 2 — "Data sale opt-out"
- Toggle ⚠ "Show a data sale opt-out page" and a read-only storefront URL for
  the "Do not sell my personal information" page, with a copy button.
- Region checkbox list mirroring Card 1.

### Card 3 — "Data processing / data region restrictions"
⚠ Largely unverified. Controls whether the store restricts processing to
certain regions, and holds the "Limit the use of my sensitive personal
information" affordance.

### Card 4 — "Customer data requests" / GDPR requests
A list of open requests with type ("Request data", "Delete data") and status
pills ⚠ "Pending", ⚠ "Completed". Requests are surfaced here and forwarded to
apps as the `customers/data_request`, `customers/redact` and `shop/redact`
webhooks.

### Card 5 — privacy policy link
A read-only row showing whether a privacy policy exists, with an **Edit** link
to §19.

---

## 19. Policies

Header: **Policies**. Older builds put this under Checkout.

### Card 1 — "Store policies"
Link rows in this order, matching the `ShopPolicyType` enum exactly:

| Row | Enum value |
|---|---|
| Return and refund policy | `REFUND_POLICY` |
| Privacy policy | `PRIVACY_POLICY` |
| Terms of service | `TERMS_OF_SERVICE` |
| Shipping policy | `SHIPPING_POLICY` |
| Terms of sale | `TERMS_OF_SALE` |
| Legal notice | `LEGAL_NOTICE` |
| Subscription policy (labelled "Cancellation policy" in the schema description) | `SUBSCRIPTION_POLICY` |
| Contact information | `CONTACT_INFORMATION` |

Each row shows the policy title, a one-line excerpt or ⚠ "Not set", and a
chevron.

### Policy editor
- A rich-text editor with a formatting toolbar (bold, italic, headings, lists,
  link, image, clear formatting, and a `</>` HTML view).
- Above the editor, a **Create from template** button that fills the editor
  with Shopify's boilerplate, substituting the store name, address and contact
  email. It is destructive of current content and confirms first.
- Below the editor, the policy's public URL in mono with a copy button, of the
  form `https://<domain>/policies/refund-policy`.
- Footer: **Save**; the editor has no separate publish step — saving publishes.
- Validation: policies may be empty (the row then reads "Not set" and the
  storefront omits the footer link).

### Card 2 — where policies appear
A note that policies are linked in the storefront footer and on the checkout,
and that Shop Pay and payment providers require at least a refund policy and
contact information. ⚠ wording unverified.

---

# What we have and what is missing

Checked against `app/routes/admin.settings.tsx` (12 panes in `PANES`),
`app/admin/settings-ui.tsx` (the card/field primitives) and
`app/db/schema.ts` (`stores`, `taxRates`, `paymentProviders`, `domains`,
`users`, `sessions`).

Our panes: `profile · general · domains · payments · notifications · taxes ·
shipping · checkout · policies · branding · billing · data`.

## Pane-by-pane audit

| Shopify pane | Ours | Verdict |
|---|---|---|
| General | `general` | partial — store details + business address only; no logo, no store defaults card, no order-ID card |
| Plan | folded into `billing` | n/a for self-hosted; the cost readout is the honest analogue |
| Billing | `billing` | correct as-is (no subscription exists) |
| Users | `profile` | single-user; no staff, no permissions, no collaborators |
| Payments | `payments` | see parity §1.3 |
| Checkout | `checkout` | customer-information card matches; everything else absent or a `DeadRow` |
| Customer accounts | — | missing entirely |
| Shipping and delivery | `shipping` | one flat rate; see parity §4.3 |
| Taxes and duties | `taxes` | US-only Basic-Tax equivalent; no regions table, no duties, no overrides |
| Locations | — | missing entirely |
| Markets | — | missing entirely |
| Apps | — | missing; nothing to install, but the pane should exist to list Stripe/Meta/Resend as connections |
| Sales channels | — | missing |
| Customer events | — | missing; the Meta pixel lives on its own route |
| Notifications | `notifications` | sender domain done; no templates, no staff recipients, no webhooks |
| Metafields and metaobjects | — | missing entirely |
| Languages | — | missing entirely |
| Customer privacy | — | missing entirely — the biggest legal gap |
| Policies | `policies` | 4 of 8 policy types, plain textareas |
| — | `branding` | ours; Shopify calls it Brand |
| — | `data` | ours; no Shopify analogue, keep |

## P0 — a real store cannot operate or is legally exposed without these

1. **Cookie banner** — add `stores.cookieBannerEnabled` (boolean, default
   false), `stores.cookieBannerRegions` (text, comma-separated region keys:
   `eea`, `uk`, `california`), `stores.cookieBannerPosition`
   (`bottom_left | bottom_center | bottom_full`, default `bottom_center`),
   `stores.cookieBannerTheme` (`light | dark`). New `CustomerPrivacyPane`.
2. **Gate the pixel on consent** — the storefront banner must set a consent
   flag before `pixelScript` fires. Needs a `consentGranted()` helper in
   `app/lib/meta.server.ts`'s client counterpart and a guard in the storefront
   script tag. Depends on 1.
3. **Data-sale opt-out page** — a `/pages/do-not-sell` storefront route driven
   by `stores.dataSaleOptOut` (boolean) and linked from the footer.
4. **Store defaults on General** — `stores.unitSystem`
   (`metric | imperial`, default `metric`) and `stores.weightUnit`
   (`kg | g | lb | oz`, default `kg`) as a third card in `GeneralPane`.
   Blocks weight-based shipping rates.
5. **Order ID prefix/suffix** — `stores.orderPrefix` (default `#`),
   `stores.orderSuffix` (default empty). Add an `orderLabel(store, order)`
   helper in `app/lib/orders.server.ts` and use it everywhere `orders.number`
   renders today.
6. **Password page UI** — surface the existing `passwordEnabled`,
   `passwordHash`, `passwordMessage` columns as an "Online store availability"
   card on General. The columns exist and nothing sets them.
7. **Policies: the missing four types** — extend the policy handle set to the
   full `ShopPolicyType` list, adding `terms-of-sale`, `legal-notice`,
   `subscription-policy`, `contact-information`. Storefront routes at
   `/policies/<handle>` follow for free.
8. **Contact information policy specifically** — Stripe and Meta both check
   for it. Same task as 7 but it is the one that blocks an account review.

## P1 — a visible parity gap the operator hits weekly

9. **Locations table** — `locations` (`id, storeId, name, address1, address2,
   city, region, postalCode, country, phone, fulfillsOnlineOrders boolean,
   isDefault boolean, active boolean, priority integer`), a `LocationsPane`
   with the list + detail per §10, and `stores.defaultLocationId`.
10. **Customer accounts mode** — `stores.customerAccountsMode`
    (`disabled | optional | required`, default `disabled`) plus a
    `CustomerAccountsPane`. Checkout reads it to decide whether to force login.
11. **Abandoned checkout timing** — `stores.abandonedAfterHours`
    (integer, one of 1/6/10/24, default 10) and
    `stores.abandonedSendTo` (`everyone | subscribers`). Wire to a scheduled
    job; the `checkoutCaptureAbandoned` toggle currently lies.
12. **Address line 2 and shipping-phone controls on Checkout** —
    `stores.checkoutAddress2Mode` and reuse of `checkoutPhoneMode` for the
    shipping-address phone, so all four §6 Card 2 rows exist.
13. **Order processing card on Checkout** — `stores.autoFulfil` (boolean),
    `stores.autoArchive` (boolean), `stores.requireConfirmationStep`
    (boolean). `autoArchive` hooks `afterPaid`/`afterFulfilled` in
    `app/lib/fulfilment.server.ts`.
14. **Notification templates** — `notificationTemplates`
    (`id, storeId, key, subject, html, isDefault boolean, updatedAt`), a link
    row per template in `NotificationsPane`, an editor route, and
    `Send test` reusing the existing `send-test-email` action. Seed keys:
    `order_confirmation`, `shipping_confirmation`, `order_refund`,
    `order_cancelled`, `abandoned_checkout`.
15. **Staff order notifications** — `orderNotificationRecipients`
    (`id, storeId, email, locationId nullable`) and the Add-recipient modal.
16. **Webhooks out** — `webhookEndpoints` (`id, storeId, topic, url, format,
    apiVersion, secret, active, createdAt`) plus a `dispatchWebhook(db, env,
    storeId, topic, payload)` helper called from the order lifecycle. Include
    `Send test notification`.
17. **Tax regions table** — replace the flat `taxRates` list with a
    `taxRegions` table (`id, storeId, country, region, rate, collecting
    boolean, taxId`) so non-US stores are representable, and add
    `stores.taxService` (`shopify | basic | manual`) to back §9 Card 2.
18. **Charge VAT on digital goods** — `stores.taxDigitalGoods` (boolean).
    One checkbox, blocks EU selling.
19. **Customer events pane** — a `pixels` table — `id, storeId, name,
    kind` (`custom | app`), `status` (`connected | disconnected`),
    `consentRequired` boolean, `code` text — and a `CustomerEventsPane` listing them; move the
    Meta pixel from `admin.meta.tsx` into it as an `app` row.
20. **Brand pane completion** — `stores.squareLogoUrl`, `coverImageUrl`,
    `slogan`, `shortDescription`, and the social set
    (`socialFacebook`, `socialInstagram`, `socialTiktok`, `socialYoutube`,
    `socialPinterest`, `socialX`). These feed the storefront footer and
    JSON-LD.
21. **SEO card** — surface the existing unused `seoTitle`, `metaDescription`,
    `socialImageUrl` columns on General or Brand.
22. **Store logo on General** — `stores.logoUrl` already exists but sits in
    Branding with a "nothing reads these" note; move it to General Card 1 and
    make the email layer read it.
23. **Policy editor: rich text + Create from template** — swap the textarea for
    the editor primitive and add a `POLICY_TEMPLATES` map in
    `app/lib/policies.server.ts` keyed by handle, interpolating store name,
    address and contact email.
24. **Currency-change guard** — block the `currency` select on General once the
    store has any order; render read-only with the reason. One query in the
    loader.

## P2 — completeness

25. **Users and permissions** — `storeUsers` (`storeId, userId, role,
    permissions text[]`), an invite flow with a `pending` state, and the
    permission checkbox tree of §4. Fold the existing session list from
    `ProfilePane` into the staff detail screen.
26. **Markets** — `markets` (`id, storeId, name, countries, isPrimary, status,
    priceAdjustmentPct, rounding, currency`) plus a `marketDomains` join to
    `domains`, per §11.
27. **Metafield definitions** — `metafieldDefinitions` (`id, storeId,
    ownerType, namespace, key, name, description, type, validations json,
    pinned, storefrontAccess`) and `metafields` (`id, storeId, ownerType,
    ownerId, namespace, key, value, type`). Start with `PRODUCT` only.
28. **Metaobjects** — `metaobjectDefinitions` + `metaobjects`. Only worth it
    once 27 exists.
29. **Languages** — `storeLocales` (`storeId, locale, published, isDefault`)
    and a `translations` table keyed by resource. Large; nothing depends on it.
30. **Apps / connections pane** — one card listing Stripe, Meta, Resend and
    Cloudflare with a connected/disconnected chip, replacing the scattered
    per-integration screens. Read-only rows linking to the existing panes.
31. **Sales channels pane** — with a single online store this is one
    non-removable row; build it only for shape parity.
32. **Tax overrides** — `taxOverrides` — `id, storeId, scope`
    (`products | shipping`), `collectionId, region, rate`.
33. **Duties and import taxes** — `stores.collectDuties` boolean plus
    `products.hsCode` and `products.countryOfOrigin`.
34. **Store activity log** — an `auditLog` table (`id, storeId, userId, action,
    subjectType, subjectId, detail json, createdAt`) written by every admin
    mutation, surfaced under Users → Security.
35. **Gift cards** — `giftCards` table and checkout redemption. Out of scope
    until there is demand.
36. **Nav relabel to Shopify's words** — `General` stays, `Taxes` →
    `Taxes and duties`, `Shipping` → `Shipping and delivery`, `Branding` →
    `Brand`, `Profile` → `Users`, `Plan & billing` → split into `Plan` and
    `Billing` or keep as `Billing`. One edit to `PANES` in
    `app/routes/admin.settings.tsx`, plus reordering it to Shopify's order.

## Verification debt

Strings marked **⚠** above are the ones to re-check with the real admin open.
The heaviest concentrations are §6 Checkout (marketing options, tipping,
abandoned checkouts, checkout expiry), §18 Customer privacy (every region and
position label), §11 Markets (rounding options) and §15 Notifications (several
template names). Everything anchored to a GraphQL enum — policy types,
metafield owner types and access levels, unit and weight units, customer
account versions and settings — is exact and needs no re-check.

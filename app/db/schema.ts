/**
 * Kerberos / Shop Admin — database schema.
 *
 * One database, many stores. Every row that belongs to a storefront carries
 * storeId, so nothing bleeds between stores.
 *
 * Money is always integer cents. Never floats.
 * Percent-saved is never stored — it is calculated from price vs compare-at.
 */
import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uuid,
  index,
  uniqueIndex,
  real,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

/* ------------------------------------------------------------------ stores */

export const stores = pgTable("stores", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** short key used in the admin switcher and in URLs, e.g. "gk" */
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  /** the customer-facing domain this store answers on */
  domain: text("domain").notNull().unique(),
  currency: text("currency").notNull().default("USD"),
  timezone: text("timezone").notNull().default("America/New_York"),
  /** where the store itself sits, so Live View can fly a sale home to it */
  lat: real("lat"),
  lon: real("lon"),
  contactEmail: text("contact_email"),
  /** what shows on the customer's card statement */
  statementDescriptor: text("statement_descriptor"),
  /** sender for transactional email, on this store's own domain */
  emailFrom: text("email_from"),
  /** brand colour used by the admin switcher dot */
  color: text("color").notNull().default("#4CAF7D"),
  /** sales tax rate as a decimal, e.g. 0.0875 */
  taxRate: real("tax_rate").notNull().default(0),
  /** next order number for this store */
  orderSeq: integer("order_seq").notNull().default(1001),

  /* Business address — invoices and tax */
  legalName: text("legal_name"),
  address1: text("address1"),
  city: text("city"),
  region: text("region"),
  postalCode: text("postal_code"),
  /** ISO-2, the same vocabulary the checkout and Meta use */
  country: text("country"),
  phone: text("phone"),

  /* Taxes */
  /** automatic | manual */
  taxMode: text("tax_mode").notNull().default("manual"),
  pricesIncludeTax: boolean("prices_include_tax").notNull().default(false),
  taxOnShipping: boolean("tax_on_shipping").notNull().default(false),

  /* Shipping */
  shipFlatCents: integer("ship_flat_cents").notNull().default(0),
  shipFreeOverCents: integer("ship_free_over_cents"),
  shipEstimate: text("ship_estimate"),
  shipAlwaysFree: boolean("ship_always_free").notNull().default(true),
  shipEtaOnProduct: boolean("ship_eta_on_product").notNull().default(true),

  /* Checkout */
  /** full | last */
  checkoutNameMode: text("checkout_name_mode").notNull().default("full"),
  /** optional | required | hidden */
  checkoutPhoneMode: text("checkout_phone_mode").notNull().default("optional"),
  /** hidden | optional | required */
  checkoutCompanyMode: text("checkout_company_mode").notNull().default("hidden"),
  checkoutConsent: boolean("checkout_consent").notNull().default(true),
  checkoutCaptureAbandoned: boolean("checkout_capture_abandoned").notNull().default(true),
  checkoutTip: boolean("checkout_tip").notNull().default(false),
  /**
   * Package protection, priced by the store and never by the browser.
   * Null means this store does not sell it, and the row is not drawn at all.
   */
  packageProtectionCents: integer("package_protection_cents"),
  packageProtectionCopy: text("package_protection_copy"),

  /* Branding — emails and checkout only, never the storefront layout */
  logoUrl: text("logo_url"),
  faviconUrl: text("favicon_url"),
  brandColor: text("brand_color"),
  accentColor: text("accent_color"),

  /* Online Store → Preferences */
  seoTitle: text("seo_title"),
  metaDescription: text("meta_description"),
  socialImageUrl: text("social_image_url"),
  passwordEnabled: boolean("password_enabled").notNull().default(false),
  /** sha-256 of the storefront password; the plaintext is never stored */
  passwordHash: text("password_hash"),
  passwordMessage: text("password_message"),

  /* Email sender domain, verified through Resend */
  resendDomainId: text("resend_domain_id"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Manual per-state sales tax rates. Only read when taxMode = manual. */
export const taxRates = pgTable(
  "tax_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    /** two-letter state code, e.g. OK */
    region: text("region").notNull(),
    /** decimal, e.g. 0.0875 */
    rate: real("rate").notNull(),
  },
  (t) => [uniqueIndex("tax_rates_store_region_idx").on(t.storeId, t.region)],
);

/**
 * Payment credentials live in their own table, one row per provider per store.
 * Deliberately separate: one frozen account must never take another store down,
 * and adding PayPal later must not touch orders or checkout.
 */
export const paymentProviders = pgTable(
  "payment_providers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    /** "stripe" today; "paypal" / "manual" later */
    provider: text("provider").notNull(),
    label: text("label"),
    accountName: text("account_name"),
    /** publishable key is not secret */
    publishableKey: text("publishable_key"),
    /** encrypted at rest; master key lives in Cloudflare, never in the repo */
    secretKeyEnc: text("secret_key_enc"),
    webhookSecretEnc: text("webhook_secret_enc"),
    /** automatic | manual */
    capture: text("capture").notNull().default("automatic"),
    submitDisputeEvidence: boolean("submit_dispute_evidence").notNull().default(true),
    emailOnFailedPayment: boolean("email_on_failed_payment").notNull().default(false),
    isPrimary: boolean("is_primary").notNull().default(false),
    isBackup: boolean("is_backup").notNull().default(false),
    connectedAt: timestamp("connected_at", { withTimezone: true }),
  },
  (t) => [index("payment_providers_store_idx").on(t.storeId)],
);

export const metaConfig = pgTable("meta_config", {
  storeId: uuid("store_id")
    .primaryKey()
    .references(() => stores.id, { onDelete: "cascade" }),
  pixelId: text("pixel_id"),
  /** encrypted at rest */
  capiTokenEnc: text("capi_token_enc"),
  adAccountId: text("ad_account_id"),
  testEventCode: text("test_event_code"),
  lastTestAt: timestamp("last_test_at", { withTimezone: true }),
});

export const domains = pgTable(
  "domains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    hostname: text("hostname").notNull().unique(),
    /** pending | connected */
    status: text("status").notNull().default("pending"),
    /** none | provisioning | active */
    ssl: text("ssl").notNull().default("none"),
    isPrimary: boolean("is_primary").notNull().default(false),
    /** null unless this domain is being transferred in to us */
    transferStep: integer("transfer_step"),
    /** Cloudflare zone id once the domain has been added there */
    cloudflareZoneId: text("cloudflare_zone_id"),
    /** the nameservers Cloudflare assigned; what he sets at his registrar */
    nameservers: jsonb("nameservers").notNull().default([]),
    /** Cloudflare Workers custom-domain record id once bound */
    cloudflareDomainId: text("cloudflare_domain_id"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("domains_store_idx").on(t.storeId)],
);

/* ---------------------------------------------------------------- products */

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    handle: text("handle").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    /** draft | active */
    status: text("status").notNull().default("draft"),
    supplierName: text("supplier_name"),
    supplierUrl: text("supplier_url"),
    /** what the product costs him, in cents — drives the live margin readout */
    costCents: integer("cost_cents"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("products_store_handle_idx").on(t.storeId, t.handle)],
);

/**
 * A variant is a bundle option: "Buy 2 — most popular".
 * savedPercent is NOT a column. Change a price and every badge follows.
 */
export const variants = pgTable(
  "variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    sublabel: text("sublabel"),
    priceCents: integer("price_cents").notNull(),
    compareAtCents: integer("compare_at_cents"),
    sku: text("sku"),
    /** the picture shown on this option's card; the product's first photo when unset */
    imageUrl: text("image_url"),
    position: integer("position").notNull().default(0),
    isDefault: boolean("is_default").notNull().default(false),
    available: integer("available").notNull().default(0),
    committed: integer("committed").notNull().default(0),
    incoming: integer("incoming").notNull().default(0),
    lowStockThreshold: integer("low_stock_threshold").notNull().default(0),
  },
  (t) => [index("variants_product_idx").on(t.productId)],
);

/* ------------------------------------------------- pages, sections, blocks */

export const pages = pgTable(
  "pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    /**
     * Which theme this page belongs to. Duplicating a theme copies its pages,
     * sections and blocks, so the copy can be edited without touching what is
     * live. Null only for rows seeded before themes existed.
     */
    themeId: uuid("theme_id"),
    /** product | standalone */
    kind: text("kind").notNull().default("standalone"),
    /** set when kind = product */
    productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    handle: text("handle").notNull(),
    /** rich text, only used by standalone pages like the refund policy */
    body: text("body").notNull().default(""),
    visible: boolean("visible").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("pages_theme_handle_idx").on(t.themeId, t.handle), index("pages_store_idx").on(t.storeId)],
);

/**
 * A section is one of the fifteen. Its `type` and `position` are written by
 * code at seed time and never changed from the admin — the admin may only edit
 * `values` and flip `hidden`. That is what stops a theme editor from ever
 * overwriting the developer's layout again.
 */
export const sections = pgTable(
  "sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    position: integer("position").notNull(),
    /** { heading, subheading, body, image, ... } — shape defined in lib/sections.ts */
    values: jsonb("values").notNull().default({}),
    hidden: boolean("hidden").notNull().default(false),
  },
  (t) => [uniqueIndex("sections_page_position_idx").on(t.pageId, t.position)],
);

/** A repeating item inside a section: an FAQ row, a feature, a spec row. */
export const blocks = pgTable(
  "blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    values: jsonb("values").notNull().default({}),
  },
  (t) => [index("blocks_section_idx").on(t.sectionId)],
);

/* ------------------------------------------------------------------ orders */

/**
 * Fulfilment: Unfulfilled → Ordered with supplier → Fulfilled. Cancelled is
 * for an order that never shipped and never will. Refunds are a payment fact
 * and live in paymentStatus, not here.
 */
export const ORDER_STATES = ["new", "ordered", "fulfilled", "refunded", "cancelled"] as const;
export type OrderState = (typeof ORDER_STATES)[number];

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "restrict" }),
    /** human number shown everywhere, e.g. 1084 */
    number: integer("number").notNull(),
    state: text("state").notNull().default("new"),

    customerName: text("customer_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    address1: text("address1"),
    address2: text("address2"),
    city: text("city"),
    region: text("region"),
    postalCode: text("postal_code"),
    country: text("country").notNull().default("US"),
    lat: real("lat"),
    lon: real("lon"),

    subtotalCents: integer("subtotal_cents").notNull(),
    taxCents: integer("tax_cents").notNull().default(0),
    shippingCents: integer("shipping_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull(),
    refundedCents: integer("refunded_cents").notNull().default(0),
    currency: text("currency").notNull().default("USD"),
    /** the code as it was typed at checkout, kept so the order explains itself */
    discountCode: text("discount_code"),
    discountCents: integer("discount_cents").notNull().default(0),
    /** what was charged for package protection on this order, in cents */
    protectionCents: integer("protection_cents").notNull().default(0),

    paymentProvider: text("payment_provider"),
    paymentRef: text("payment_ref"),
    /** pending | paid | failed | partially_refunded | refunded — never paid by default */
    paymentStatus: text("payment_status").notNull().default("pending"),

    tracking: text("tracking"),
    carrier: text("carrier"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),

    source: text("source"),
    campaign: text("campaign"),
    /** shared by the browser pixel and the server CAPI event so Meta dedupes */
    metaEventId: text("meta_event_id"),
    fbp: text("fbp"),
    fbc: text("fbc"),

    note: text("note").notNull().default(""),
    /** ticked the marketing box at checkout — never pre-ticked */
    marketingConsent: boolean("marketing_consent").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("orders_store_number_idx").on(t.storeId, t.number),
    index("orders_store_created_idx").on(t.storeId, t.createdAt),
    index("orders_state_idx").on(t.state),
    /**
     * One order per payment. Two submits of the same intent used to race the
     * "does an order already exist?" read and both insert, leaving two rows
     * for one charge — and the webhook would mark whichever it found paid.
     * The database settles it: the second insert simply fails.
     */
    uniqueIndex("orders_payment_ref_idx")
      .on(t.paymentRef)
      // Real Stripe payments only: the simulated orders seeded for the Live
      // View demo all share one reference and are not payments at all.
      .where(sql`${t.paymentRef} like 'pi_%'`),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id").references(() => variants.id, { onDelete: "set null" }),
    /** copied at purchase time so history survives a price change */
    title: text("title").notNull(),
    label: text("label").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    quantity: integer("quantity").notNull().default(1),
  },
  (t) => [index("order_items_order_idx").on(t.orderId)],
);

/**
 * The permanent timeline. Every state change gets a row, nothing is ever
 * deleted, and the whole table is exportable. This is the evidence that wins
 * a payment-processor review.
 */
export const orderEvents = pgTable(
  "order_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    text: text("text").notNull(),
    meta: jsonb("meta").notNull().default({}),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("order_events_order_idx").on(t.orderId, t.at)],
);

/* ------------------------------------------------------- carts and traffic */

export const carts = pgTable(
  "carts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    /**
     * The email the customer typed into this store's own checkout, and
     * nothing else. Null until they type one — a cart with no email belongs
     * to nobody and must never be counted as a person.
     */
    email: text("email"),
    /** set at the same moment the email is, so the cart has a person on it */
    customerId: uuid("customer_id"),
    items: jsonb("items").notNull().default([]),
    /** open | converted | abandoned */
    status: text("status").notNull().default("open"),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    /** the discount code applied to this cart, so it survives a reload */
    discountCode: text("discount_code"),
    /**
     * The customer ticked package protection. Only the choice lives here —
     * what it costs is read from the store row when the cart is priced.
     */
    packageProtection: boolean("package_protection").notNull().default(false),
    /**
     * The Stripe PaymentIntent this cart is paying with.
     *
     * Kept on the cart so a reload of the one-page checkout reuses the intent
     * it already has — its amount is updated when the total moves — instead of
     * leaving a trail of abandoned intents behind every refresh.
     */
    paymentIntentId: text("payment_intent_id"),
    /**
     * What that intent is already worth, and the token the browser needs to
     * pay it. Both are held here so a checkout whose total has not moved can
     * hand the browser its secret with no call to Stripe at all — that call
     * was the slowest thing on the page. Neither is a secret key: the client
     * secret only ever authorises paying this one intent, which is why Stripe
     * puts it in the page in the first place.
     */
    paymentIntentAmount: integer("payment_intent_amount"),
    paymentIntentSecret: text("payment_intent_secret"),
    /**
     * When a recovery email was sent for this cart, and which one.
     *
     * One per cart, ever. A second chase is spam, she marks it as such, and
     * that costs every future email from this domain its place in the inbox.
     * Stamped before the send so a retry of the same scheduled run cannot
     * send twice.
     */
    recoveryEmailedAt: timestamp("recovery_emailed_at", { withTimezone: true }),
    /** cart | checkout — which message went */
    recoveryStage: text("recovery_stage"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("carts_store_idx").on(t.storeId, t.status),
    index("carts_recovery_idx").on(t.status, t.recoveryEmailedAt, t.updatedAt),
  ],
);

/**
 * A person who has told this store who they are.
 *
 * A row exists here only because someone typed their email into this store's
 * own checkout — either completing the email field, or placing an order. A
 * visitor who types nothing has no row: an anonymous session is not a
 * customer, and there is nothing here that was bought, enriched, guessed from
 * an IP, or joined across stores. storeId is on every row for that reason.
 *
 * `ordersCount` and `totalSpentCents` are denormalised so the list renders in
 * one query, but they are never incremented hopefully — they are recomputed
 * from the `orders` table every time an order is placed.
 */
export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    /** always stored lowercased, so one person is one row */
    email: text("email").notNull(),
    /** what they typed; empty when unknown — never a placeholder */
    name: text("name"),
    phone: text("phone"),
    /** where the request came from at the edge, the same view Live View has */
    city: text("city"),
    region: text("region"),
    country: text("country"),
    /** exactly what they ticked. This decides whether he may email them. */
    marketingConsent: boolean("marketing_consent").notNull().default(false),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    /** recomputed from orders, never guessed */
    ordersCount: integer("orders_count").notNull().default(0),
    totalSpentCents: integer("total_spent_cents").notNull().default(0),
    /** the visitor session they were last seen on, so their pages can be read */
    lastSessionId: text("last_session_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("customers_store_email_idx").on(t.storeId, t.email),
    index("customers_store_seen_idx").on(t.storeId, t.lastSeenAt),
  ],
);

/** Feeds Live View and Analytics. One row per visitor action. */
export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    /** view | cart | checkout | purchase | leave */
    type: text("type").notNull(),
    sessionId: text("session_id").notNull(),
    path: text("path"),
    city: text("city"),
    region: text("region"),
    country: text("country"),
    lat: real("lat"),
    lon: real("lon"),
    source: text("source"),
    campaign: text("campaign"),
    /** desktop | mobile | tablet, read from the user agent */
    device: text("device"),
    amountCents: integer("amount_cents"),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    /**
     * A browser ran JavaScript on this visit and said so.
     *
     * A loader records a view for anything that asks for the HTML, and a
     * public domain is scanned around the clock by things that send a
     * browser's user agent and never run a line of script. Those were being
     * counted as visitors — 287 of one day's 305 "sessions" were single hits
     * on `/` from datacentres — which put phantom dots on the globe and made
     * the traffic numbers fiction. Nothing is deleted and nothing is guessed:
     * the row is written either way, and only a confirmed one is counted.
     */
    human: boolean("human").notNull().default(false),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("events_store_at_idx").on(t.storeId, t.at),
    index("events_session_idx").on(t.sessionId),
    index("events_human_idx").on(t.storeId, t.human, t.at),
  ],
);

/**
 * Who is on the storefront right now.
 *
 * One row per visitor, rewritten by a heartbeat from their own browser while
 * the tab is open and visible. This is what the globe's dots are: presence,
 * not history. A visitor who closes the tab stops beating and drops off the
 * map on their own, which is the only honest way to draw "who is here now" —
 * the events table can only ever say what already happened.
 */
export const presence = pgTable(
  "presence",
  {
    sessionId: text("session_id").primaryKey(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    /** view | cart | checkout — where they are, for the dot's colour */
    stage: text("stage").notNull().default("view"),
    path: text("path"),
    city: text("city"),
    region: text("region"),
    country: text("country"),
    lat: real("lat"),
    lon: real("lon"),
    device: text("device"),
    firstSeen: timestamp("first_seen", { withTimezone: true }).notNull().defaultNow(),
    lastSeen: timestamp("last_seen", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("presence_store_seen_idx").on(t.storeId, t.lastSeen)],
);

/* ------------------------------------------------------------------- media */

export const media = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    /** object key in Cloudflare R2 */
    key: text("key").notNull().unique(),
    filename: text("filename").notNull(),
    mime: text("mime").notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    width: integer("width"),
    height: integer("height"),
    alt: text("alt"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("media_store_idx").on(t.storeId)],
);

/* ----------------------------------------------------------------- reviews */

/**
 * source is NOT nullable and has NO default on purpose. Every review must be
 * declared either the customer's or the supplier listing's before it can be
 * published. Nothing here is ever generated.
 */
export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    rating: integer("rating").notNull(),
    title: text("title"),
    body: text("body").notNull().default(""),
    reviewedOn: timestamp("reviewed_on", { withTimezone: true }),
    country: text("country"),
    imageUrl: text("image_url"),
    verified: boolean("verified").notNull().default(false),
    /** "customer" | "supplier_listing" — required, never defaulted */
    source: text("source").notNull(),
    published: boolean("published").notNull().default(false),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("reviews_store_product_idx").on(t.storeId, t.productId)],
);

/* --------------------------------------------------------------- relations */

export const storeRelations = relations(stores, ({ many, one }) => ({
  products: many(products),
  pages: many(pages),
  orders: many(orders),
  domains: many(domains),
  paymentProviders: many(paymentProviders),
  meta: one(metaConfig, { fields: [stores.id], references: [metaConfig.storeId] }),
}));

export const productRelations = relations(products, ({ many, one }) => ({
  variants: many(variants),
  store: one(stores, { fields: [products.storeId], references: [stores.id] }),
}));

export const pageRelations = relations(pages, ({ many, one }) => ({
  sections: many(sections),
  store: one(stores, { fields: [pages.storeId], references: [stores.id] }),
  product: one(products, { fields: [pages.productId], references: [products.id] }),
}));

export const sectionRelations = relations(sections, ({ many, one }) => ({
  blocks: many(blocks),
  page: one(pages, { fields: [sections.pageId], references: [pages.id] }),
}));

export const blockRelations = relations(blocks, ({ one }) => ({
  section: one(sections, { fields: [blocks.sectionId], references: [sections.id] }),
}));

export const orderRelations = relations(orders, ({ many, one }) => ({
  items: many(orderItems),
  timeline: many(orderEvents),
  store: one(stores, { fields: [orders.storeId], references: [stores.id] }),
}));

/**
 * Core Web Vitals, measured on real visits.
 *
 * Shopify's Online Store screen reports LCP, INP and CLS at the 75th
 * percentile over thirty days, which is the same window and percentile Google
 * ranks on. These rows are what the browser actually measured on this store's
 * pages — there is no synthetic run behind them.
 */
export const webVitals = pgTable(
  "web_vitals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull(),
    /** LCP | INP | CLS */
    metric: text("metric").notNull(),
    /** milliseconds for LCP and INP; CLS is unitless and stored x1000 */
    value: integer("value").notNull(),
    path: text("path"),
    device: text("device"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("web_vitals_store_at_idx").on(t.storeId, t.metric, t.at)],
);

/* ------------------------------------------------------------ admin access */

/**
 * Who may open the admin. One row per person, and in practice one row: Alex.
 *
 * Sign-in is Google only — there is no password column here on purpose, so
 * there is no password to leak, reset, or brute force. A Google account that
 * is not in this table cannot get in, which is what makes the admin URL being
 * public harmless.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** lowercased Google account address — the allow-list is this column */
  email: text("email").notNull().unique(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  /** Google's stable account id, filled in on first successful sign-in */
  googleSub: text("google_sub").unique(),
  notifyEveryOrder: boolean("notify_every_order").notNull().default(true),
  notifyChargebacks: boolean("notify_chargebacks").notNull().default(true),
  notifyWeekly: boolean("notify_weekly").notNull().default(false),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A signed-in browser. "Remember me" is this row living for 30 days and being
 * renewed on use, rather than a long-lived cookie that cannot be revoked —
 * deleting the row signs that browser out immediately.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** sha-256 of the cookie value; the raw token is never stored */
    tokenHash: text("token_hash").notNull().unique(),
    userAgent: text("user_agent"),
    ip: text("ip"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** Failed sign-in attempts, for the brute-force guard. Rows expire in minutes. */
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ip: text("ip").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("login_attempts_ip_at_idx").on(t.ip, t.at)],
);

/* ------------------------------------------------------------------ themes */

/**
 * A theme is a named set of storefront content for one store: the fifteen
 * sections and their blocks.
 *
 * Structure still lives in code — a theme cannot reorder or invent sections.
 * What it holds is the words, images and videos. That is what makes
 * "duplicate, edit the copy, publish it" safe: the layout cannot drift.
 *
 * Exactly one theme per store has isLive = true. Editing the live one is
 * allowed on purpose; Shopify's restriction is the thing being dropped here.
 */
export const themes = pgTable(
  "themes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    isLive: boolean("is_live").notNull().default(false),
    /** set when this theme was made with "duplicate" */
    duplicatedFromId: uuid("duplicated_from_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("themes_store_idx").on(t.storeId)],
);

/* ------------------------------------------------------------- navigation */

/**
 * The storefront's header and footer menus. Two per store, by handle. The
 * storefront layout is code; what these hold is the list of links inside the
 * slots that layout already has.
 */
export const menus = pgTable(
  "menus",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    /** main | footer */
    handle: text("handle").notNull(),
    title: text("title").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("menus_store_handle_idx").on(t.storeId, t.handle)],
);

export const menuLinks = pgTable(
  "menu_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    menuId: uuid("menu_id")
      .notNull()
      .references(() => menus.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    label: text("label").notNull(),
    /** a page handle, "product", "cart", or "custom" */
    destination: text("destination").notNull(),
    /** only when destination = custom */
    url: text("url"),
  },
  (t) => [index("menu_links_menu_idx").on(t.menuId)],
);

export const userRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
}));

export const sessionRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const themeRelations = relations(themes, ({ one, many }) => ({
  store: one(stores, { fields: [themes.storeId], references: [stores.id] }),
  pages: many(pages),
}));

/* -------------------------------------------------------------- discounts */

/**
 * A discount code. One row per code per store; the code itself is stored
 * uppercased so "SAVE10" and "save10" are the same code and cannot both exist.
 */
export const discounts = pgTable(
  "discounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    /** always stored uppercased */
    code: text("code").notNull(),
    /** percentage | fixed | free_shipping */
    kind: text("kind").notNull().default("percentage"),
    /** percent 1-100 for percentage, cents for fixed, unused for free_shipping */
    value: integer("value").notNull().default(0),
    /** order | shipping */
    appliesTo: text("applies_to").notNull().default("order"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    /** null means no limit */
    usageLimit: integer("usage_limit"),
    /**
     * A cache of how many redemptions exist, incremented under the same
     * conditional write that enforces the limit. discountRedemptions is the
     * record; this column is what makes the limit race-safe.
     */
    usedCount: integer("used_count").notNull().default(0),
    oncePerCustomer: boolean("once_per_customer").notNull().default(false),
    minimumSubtotalCents: integer("minimum_subtotal_cents"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("discounts_store_code_idx").on(t.storeId, t.code)],
);

/**
 * One row per actual use, written when an order is paid — never when a code
 * is typed. "Used 3 times" is a count of these rows, not a hopeful counter.
 */
export const discountRedemptions = pgTable(
  "discount_redemptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    discountId: uuid("discount_id")
      .notNull()
      .references(() => discounts.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    amountCents: integer("amount_cents").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("discount_redemptions_discount_idx").on(t.discountId),
    uniqueIndex("discount_redemptions_order_idx").on(t.orderId),
  ],
);

/* ------------------------------------------------------- push notifications */

/**
 * One browser that has agreed to be woken when something sells.
 *
 * This is how he hears a sale on his phone and on his laptop without an app
 * in either store: each browser hands us an endpoint owned by Apple or
 * Google, plus the two keys that let us encrypt a message only that browser
 * can open. We never see the device, only the endpoint — and when the browser
 * throws the subscription away the push service says so and the row is
 * deleted.
 */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** the push service URL; unique because it already identifies the browser */
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    /** "iPhone", "MacBook" — whatever the browser told us, for the settings list */
    label: text("label"),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("push_subscriptions_user_idx").on(t.userId)],
);

/**
 * One scratch card, one cart.
 *
 * The prize is drawn by the server the moment the card is created, before
 * anything is scratched — the scratching is how it is shown, never how it is
 * decided. The row is what stops a customer redrawing until they like the
 * answer: one cart gets one card, and the code it produced is written here.
 */
export const scratchPlays = pgTable(
  "scratch_plays",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    /** the cart token — one card per cart */
    cartToken: text("cart_token").notNull(),
    /** percent off that was drawn */
    percent: integer("percent").notNull(),
    /** the single-use code this play created */
    code: text("code").notNull(),
    discountId: uuid("discount_id").references(() => discounts.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("scratch_plays_cart_idx").on(t.storeId, t.cartToken)],
);

/**
 * Something went wrong in a customer's browser.
 *
 * Written by the checkout when a wallet fails to draw, a script fails to
 * load, or anything else that only exists on the other side of the screen.
 * Without it the only evidence is the owner saying "it did not render", which
 * is not enough to fix anything. No personal data: what broke, what it said,
 * and which browser said it.
 */
export const clientEvents = pgTable(
  "client_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id").references(() => stores.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    detail: text("detail"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("client_events_store_idx").on(t.storeId, t.createdAt)],
);

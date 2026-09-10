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
import { relations } from "drizzle-orm";

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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

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

/** New → Ordered with supplier → Fulfilled → Refunded. */
export const ORDER_STATES = ["new", "ordered", "fulfilled", "refunded"] as const;
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

    paymentProvider: text("payment_provider"),
    paymentRef: text("payment_ref"),
    paymentStatus: text("payment_status").notNull().default("paid"),

    tracking: text("tracking"),
    carrier: text("carrier"),

    source: text("source"),
    campaign: text("campaign"),
    /** shared by the browser pixel and the server CAPI event so Meta dedupes */
    metaEventId: text("meta_event_id"),
    fbp: text("fbp"),
    fbc: text("fbc"),

    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("orders_store_number_idx").on(t.storeId, t.number),
    index("orders_store_created_idx").on(t.storeId, t.createdAt),
    index("orders_state_idx").on(t.state),
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
    email: text("email"),
    items: jsonb("items").notNull().default([]),
    /** open | converted | abandoned */
    status: text("status").notNull().default("open"),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("carts_store_idx").on(t.storeId, t.status)],
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
    amountCents: integer("amount_cents"),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("events_store_at_idx").on(t.storeId, t.at),
    index("events_session_idx").on(t.sessionId),
  ],
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

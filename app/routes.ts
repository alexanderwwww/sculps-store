import { type RouteConfig, index, route, layout, prefix } from "@react-router/dev/routes";

export default [
  // Storefront. Which store answers is decided by the hostname the visitor
  // arrived on, not by the path.
  index("routes/storefront.tsx"),
  route("healthz", "routes/healthz.ts"),
  // Apple Pay will not show until Stripe can fetch this from the live domain.
  route(".well-known/apple-developer-merchantid-domain-association", "routes/apple-pay-domain.ts"),

  // Storefront buying flow. Same Worker, same hostname rules as the storefront.
  route("cart", "routes/cart.tsx"),
  route("cart/add", "routes/cart.add.tsx"),
  route("checkout", "routes/checkout.tsx"),
  // Checkout posts the email here the moment it is completed, so the cart has
  // a person on it before an order exists.
  route("checkout/geocode", "routes/checkout.geocode.tsx"),
  route("checkout/suggest", "routes/checkout.suggest.tsx"),
  route("checkout/identify", "routes/checkout.identify.tsx"),
  route("checkout/intent", "routes/checkout.intent.tsx"),
  route("checkout/pay", "routes/checkout.pay.tsx"),
  // PayPal: create the order, then capture it. Two steps, one route.
  route("checkout/paypal", "routes/checkout.paypal.tsx"),
  route("checkout/diag", "routes/checkout.diag.tsx"),
  route("push/log", "routes/push.log.tsx"),
  route("thanks", "routes/thanks.tsx"),
  route("subscribe", "routes/subscribe.tsx"),
  // The store's second product. The root sells the first one.
  route("mower", "routes/mower.tsx"),
  route("pages/:handle", "routes/pages.$handle.tsx"),
  // The shapes Shopify used. Old links stay alive rather than dying in the
  // index and in every ad that already points at them.
  // bodies sells one board in four colours, so each colour has its own
  // address. Every other store still redirects its old Shopify links home.
  route("products/:handle", "routes/products.bodies.tsx"),
  route("collections/:handle", "routes/collections.$handle.tsx"),
  route("sitemap.xml", "routes/sitemap[.]xml.ts"),
  route("robots.txt", "routes/robots[.]txt.ts"),
  route("password", "routes/password.tsx"),
  route("vitals", "routes/vitals.tsx"),
  // The storefront heartbeat: who is on the site right now, and proof that a
  // browser — not a scanner — is the one asking.
  route("seen", "routes/seen.tsx"),
  route("media/:key", "routes/media.$key.tsx"),
  // The Magic Wand's status board, order desk and MCP server. Everything
  // behind it is guarded by the key in the path.
  route("wand/*", "routes/wand.$.tsx"),
  route("organicx/*", "routes/organicx.$.tsx"),
  route("organic/*", "routes/organic.$.tsx"),
  route("research/*", "routes/research.$.tsx"),
  // Shop Admin on the phone. It uses the admin's own manifest, icons and
  // service worker — there is one Shop Admin, and it has one face.
  route("m", "routes/m.$.tsx"),
  route("m/data", "routes/m.data.tsx"),
  route("m/manifest.webmanifest", "routes/m.manifest.tsx"),
  route("webhooks/stripe", "routes/webhooks.stripe.tsx"),

  // Admin. Sign-in lives outside the layout so it is reachable when signed out.
  route("admin/login", "routes/admin.login.tsx"),
  route("admin/auth/callback", "routes/admin.auth.callback.tsx"),
  route("admin/logout", "routes/admin.logout.tsx"),

  // The theme editor is its own environment, the way Shopify's is: no
  // sidebar, no top bar, nothing but the page being edited. It sits outside
  // the admin layout for exactly that reason.
  route("admin/online-store/editor/:pageId", "routes/admin.online-store.editor.$pageId.tsx"),

  layout("routes/admin.tsx", [
    ...prefix("admin", [
      index("routes/admin._index.tsx"),
      route("orders", "routes/admin.orders._index.tsx"),
      route("orders/export", "routes/admin.orders.export.tsx"),
      route("orders/:id", "routes/admin.orders.$id.tsx"),
      route("products", "routes/admin.products._index.tsx"),
      route("products/:id", "routes/admin.products.$id.tsx"),
      route("inventory", "routes/admin.inventory.tsx"),
      route("customers", "routes/admin.customers.tsx"),
      route("reviews", "routes/admin.reviews.tsx"),
      route("marketing", "routes/admin.marketing.tsx"),
      route("discounts", "routes/admin.discounts.tsx"),
      route("meta", "routes/admin.meta.tsx"),
      // Payments has its own screen rather than a panel inside Settings: it is
      // the part that decides whether money arrives, and there is more than
      // one provider now.
      route("payments", "routes/admin.payments.tsx"),
      route("media", "routes/admin.media.tsx"),
      route("analytics", "routes/admin.analytics.tsx"),
      route("analytics/behavior", "routes/admin.analytics.behavior.tsx"),
      route("live", "routes/admin.live.tsx"),
      route("notifications", "routes/admin.notifications.tsx"),
      route("push", "routes/admin.push.tsx"),
      route("search", "routes/admin.search.tsx"),
      route("settings", "routes/admin.settings.tsx"),
      route("settings/email-preview", "routes/admin.settings.email-preview.tsx"),
      route("events/export", "routes/admin.events.export.tsx"),
      route("online-store", "routes/admin.online-store.tsx"),
      route("stores/new", "routes/admin.stores.new.tsx"),
    ]),
  ]),
  // Last, so it only ever sees a path nothing else claimed: a bare product
  // handle from an ad or a pasted link, moved to its real address.
  route("*", "routes/handle.$.tsx"),
] satisfies RouteConfig;

import { type RouteConfig, index, route, layout, prefix } from "@react-router/dev/routes";

export default [
  // Storefront. Which store answers is decided by the hostname the visitor
  // arrived on, not by the path.
  index("routes/storefront.tsx"),
  route("healthz", "routes/healthz.ts"),

  // Storefront buying flow. Same Worker, same hostname rules as the storefront.
  route("cart", "routes/cart.tsx"),
  route("cart/add", "routes/cart.add.tsx"),
  route("checkout", "routes/checkout.tsx"),
  route("thanks", "routes/thanks.tsx"),
  route("pages/:handle", "routes/pages.$handle.tsx"),
  // The shapes Shopify used. Old links stay alive rather than dying in the
  // index and in every ad that already points at them.
  route("products/:handle", "routes/products.$handle.tsx"),
  route("collections/:handle", "routes/collections.$handle.tsx"),
  route("password", "routes/password.tsx"),
  route("vitals", "routes/vitals.tsx"),
  route("media/:key", "routes/media.$key.tsx"),
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
      route("media", "routes/admin.media.tsx"),
      route("analytics", "routes/admin.analytics.tsx"),
      route("live", "routes/admin.live.tsx"),
      route("notifications", "routes/admin.notifications.tsx"),
      route("search", "routes/admin.search.tsx"),
      route("settings", "routes/admin.settings.tsx"),
      route("settings/email-preview", "routes/admin.settings.email-preview.tsx"),
      route("events/export", "routes/admin.events.export.tsx"),
      route("online-store", "routes/admin.online-store.tsx"),
      route("stores/new", "routes/admin.stores.new.tsx"),
    ]),
  ]),
] satisfies RouteConfig;

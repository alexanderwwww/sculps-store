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
  route("webhooks/stripe", "routes/webhooks.stripe.tsx"),

  // Admin. Sign-in lives outside the layout so it is reachable when signed out.
  route("admin/login", "routes/admin.login.tsx"),
  route("admin/auth/callback", "routes/admin.auth.callback.tsx"),
  route("admin/logout", "routes/admin.logout.tsx"),

  layout("routes/admin.tsx", [
    ...prefix("admin", [
      index("routes/admin._index.tsx"),
      route("orders", "routes/admin.orders._index.tsx"),
      route("orders/export", "routes/admin.orders.export.tsx"),
      route("orders/:id", "routes/admin.orders.$id.tsx"),
      route("products", "routes/admin.products._index.tsx"),
      route("products/:id", "routes/admin.products.$id.tsx"),
      route("inventory", "routes/admin.inventory.tsx"),
      route("reviews", "routes/admin.reviews.tsx"),
      route("meta", "routes/admin.meta.tsx"),
      route("media", "routes/admin.media.tsx"),
      route("analytics", "routes/admin.analytics.tsx"),
      route("live", "routes/admin.live.tsx"),
      route("settings", "routes/admin.settings.tsx"),
      route("settings/email-preview", "routes/admin.settings.email-preview.tsx"),
      route("events/export", "routes/admin.events.export.tsx"),
      route("online-store", "routes/admin.online-store.tsx"),
      route("online-store/editor/:pageId", "routes/admin.online-store.editor.$pageId.tsx"),
      route("stores/new", "routes/admin.stores.new.tsx"),
    ]),
  ]),
] satisfies RouteConfig;

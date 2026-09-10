import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  // Storefront. Which store answers is decided by the hostname the visitor
  // arrived on, not by the path.
  index("routes/storefront.tsx"),
  route("healthz", "routes/healthz.ts"),
] satisfies RouteConfig;

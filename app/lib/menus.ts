/**
 * The two storefront menus. Shared by the admin UI and the server, so it
 * lives outside the .server module — the client build refuses to import that.
 */
export const MENU_HANDLES = [
  ["main", "Header menu", "top navigation"],
  ["footer", "Footer menu", "footer"],
] as const;

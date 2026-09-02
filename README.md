# sculps-store

Rebuild of the storefront. This repo holds a full snapshot of the existing
Shopify store (theme code + content data) so the new store can be built from a
known baseline instead of guesswork.

## Layout

```
theme/          Theme code pulled from the live/copy theme
  layout/       theme.liquid, checkout.liquid
  templates/    JSON + liquid templates
  sections/     Section liquid files
  blocks/       Theme blocks (Online Store 2.0)
  snippets/     Reusable snippets
  assets/       CSS, JS, images, fonts
  config/       settings_schema.json, settings_data.json
  locales/      Translation files

store-data/     Content exported from the Admin API (JSON)
  products/     Full product records incl. variants, media, options
  collections/  Manual + smart collections and their rules
  pages/        Online store pages
  blogs/        Blogs and articles
  navigation/   Menus / link lists
  metafields/   Metafield + metaobject definitions and values
  settings/     Shop settings, policies, markets, shipping zones

docs/           Notes: brand direction, rebuild plan, ad prompts
```

## Snapshot workflow

The store is reached through the Shopify MCP connector. Nothing is fetched with
a hard-coded API token, so there are no credentials in this repo.

1. Authorize the Shopify connector (see below).
2. Pull the theme named `ALEXANDER` (the working copy, not the live theme) into
   `theme/`.
3. Export products, collections, pages, blogs, menus, metafields and shop
   settings into `store-data/`.
4. Commit the snapshot as its own commit so the "before" state stays diffable.
5. Rebuild on top of it.

### Reauthorizing the connector

The connector's token expires. When it does, reconnect it from
claude.ai → Settings → Connectors → Shopify, or run `/mcp` in an interactive
Claude Code session. Automated sessions can't complete the OAuth flow.

## Rules

- No API tokens, passwords, or customer PII committed to this repo.
- Customer and order data stays out of `store-data/` — the snapshot is for
  content and configuration only.

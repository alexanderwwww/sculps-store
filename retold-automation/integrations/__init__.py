"""RETOLD external-service integrations (Component 4).

Thin, dependency-free (stdlib-only) API clients used by the n8n pipeline and by
the engine. Each reads its secrets from environment variables (repo-root .env)
and never hardcodes credentials.

Modules:
  shopify   — webhook HMAC verification + mark-order-fulfilled
  lulu      — OAuth + create/poll the physical book print job
  peecho    — print the personalised grandchild voice cards
  shotstack — build + render the memory film from book.json + assets
  klaviyo   — emit 'RETOLD Status' events that drive the status-email Flows
"""

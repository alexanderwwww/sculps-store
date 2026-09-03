# build/ — rendered output, not source

These files are produced by `tools/render_static.py` from `sections/*.liquid`
plus the owner's live editor settings in `snapshot/index.json.live`.

They are committed so the exact bytes that went to BigCommerce are recoverable,
but they are generated: edit the `.liquid` sources and re-render, never edit
these by hand.

    python3 tools/render_static.py xero-popup,xero-consent,xero-product-data
    python3 tools/build_bc_theme.py

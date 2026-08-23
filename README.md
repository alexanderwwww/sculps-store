# sculps-store
sculps

## `helios/` — recovered HELIOS theme (final live build)

The custom build that was **live on helios-wins.com**, recovered from the build
session after the store lost admin access. This is a later snapshot than
`superglide-shopify/` — different sections, different copy, the state the store
was actually serving.

```
helios/
  sections/     23 custom helios-* sections
  templates/    homepage + product page (layout, copy, all settings)
  preview/      static HTML render of both pages — open in a browser
  tools/        render.py — regenerates the preview from the Liquid
  README.md     what's included, what's missing, what to fix before reuse
```

**Verified:** all 28 sections render through a real Liquid engine with the real
saved settings, zero errors — nothing truncated.

Regenerate the preview after editing any section:

```bash
cd helios/tools && pip install python-liquid && python3 render.py
```

Before reusing this anywhere, see `helios/README.md` — in particular the
unverifiable "21.622 units sold" / "No.1 seller" claims and the "Verified
buyers" review copy, which need to come out first.

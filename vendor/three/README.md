# Self-hosted three.js r169 (for the XERO 3D viewer)

These are the exact files hosted on Shopify Files and referenced by the importmap in
`layout/theme.liquid`. The store no longer loads three.js from unpkg (that external
dependency was slow/blocked on mobile and caused the bike not to load).

- `three.module.min.js`  — three.js r169, minified build
- `GLTFLoader.js`        — r169, ONE edit: the `../utils/BufferGeometryUtils.js` import was
                            rewired to the bare specifier `three/addons/utils/BufferGeometryUtils.js`
                            so it resolves through the importmap (Shopify assets are flat).
- `DRACOLoader.js`       — r169 (GLB has no DRACO, so the decoder is never fetched)
- `BufferGeometryUtils.js` — r169

## Re-host / upgrade
Upload these four to Content > Files, then update the four URLs (and `?v=`) in the
importmap in `layout/theme.liquid`. All four are served as `text/javascript` with CORS `*`.

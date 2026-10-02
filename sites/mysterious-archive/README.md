# Mysterious Archive: the website

Static site, no dependencies. White page, the catalogue PDF's type, layout and hairlines.

## Add, edit, sell or remove a piece
Everything lives in `data/products.json`. Add a block to `pieces` (copy an existing one), put its photos in `assets/photos/piece-NN/`
(`hero.jpg`, `hero-600.jpg`, `detail-1.jpg` ...), then run `node build.mjs`. The pages are written to `dist/`.
- Mark sold: `"sold": true`. The price becomes SOLD and the piece stays on the site.
- Remove: delete its block.
- Contact: `site.contact.email` and `site.contact.instagram` are placeholders. Replace them.

The same pieces are in Shop Admin (store "Mysterious Archive"). `node seed-mysterious-archive.mjs` (repo root) copies products.json into it.

# Mysterious Archive certificate maker
Makes the real certificate (white-script-v1 layout: script logo, CERTIFICATE OF AUTHENTICITY, Item/Category/Material/Hallmarks/Condition,
photo, Inspected by Chrome Jesus, Issued by Mysterious Archive, blue signature, gold seal). Never use ChatGPT's "ITEM CERTIFICATE" page.
1. Put a white-background photo (cropped tight) in this folder, write `<item>.json` like ring.json.
2. `node make.cjs <item>.json` -> `<out>.png` (1280x1600) + `<out>.pdf`.
3. Upload both to R2 as `ma-cert-<random hex>.png/.pdf`, then add the handle to `ma-certificates.json` (items) and
   `ma-certificates-7259c9b78713c268cb84.json` (certificates). The product page shows it within 60 s.
Titles containing bag/tote/pouch/backpack are hidden from the archive grid (isBag in archive.tsx): say "pouch" in the description.
- 2026-11-11: seal.png is now Alex's gold holographic MYSTERIOUS ARCHIVE NEW YORK sticker (all 63 live certificates re-issued with it).

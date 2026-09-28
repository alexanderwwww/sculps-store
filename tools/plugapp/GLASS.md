# plug — Liquid Glass spec (DO NOT CHANGE THE GLASS)

Give this file + `plug.dc.html` + `assets/plug-icon.png` to Claude / ChatGPT.
Tell it: **"Build the app, but copy the glass exactly as written here. Do not simplify, replace with blur, or 'improve' it."**

Reference implementation: `plug.dc.html` (open in Chrome).

---

## How the glass works (4 stacked layers, in this order)

Every glass shape = a container with `position:relative; border-radius:R` holding:

1. **Refraction layer** — `backdrop-filter: url(#lg-<shape>) saturate(1.35) brightness(1.06)`
   An SVG filter bends the desktop behind it **only at the rim**. Centre stays perfectly clear. No blur.
2. **Light layer** — specular + rim highlights (box-shadows, no fill).
3. **Chromatic rim** — 1.2–1.5px conic-gradient ring (faint rainbow edge).
4. **Content** — text/icons on top, never refracted.

Sizes used: pill **320×64, R=32** · phone **393×852, R=46**.
Glass params: `refraction = 90`, `bezel = 28px`, `dispersion = 8%` (pill: refraction ×0.55, bezel = min(bezel×0.75, 24)).

---

## 1. Displacement map (generate once per shape size)

```js
function glassMap(W, H, R, B) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d'), img = ctx.createImageData(W, H), d = img.data;
  const hw = W/2, hh = H/2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const px = x+.5-hw, py = y+.5-hh, sx = Math.sign(px)||1, sy = Math.sign(py)||1;
    const qx = Math.abs(px)-(hw-R), qy = Math.abs(py)-(hh-R);
    let dist, nx, ny;
    if (qx > 0 && qy > 0) { const l = Math.hypot(qx, qy); dist = R-l; nx = sx*qx/l; ny = sy*qy/l; }
    else if (qx > qy) { dist = R-qx; nx = sx; ny = 0; }
    else { dist = R-qy; nx = 0; ny = sy; }
    const t = Math.min(1, Math.max(0, dist/B));
    const m = Math.pow(1-t, 2.4) * (t > 0 ? 1 : 0);   // steep at rim, flat inside
    const i = (y*W+x)*4;
    d[i] = 128 - nx*m*127; d[i+1] = 128 - ny*m*127; d[i+2] = 128; d[i+3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}
// phone: glassMap(393, 852, 46, 28)   pill: glassMap(320, 64, 32, 21)
```

## 2. SVG filter (one per shape; chromatic split = 3 displacements)

```html
<svg width="0" height="0" style="position:absolute">
  <filter id="lg-phone" x="0" y="0" width="393" height="852"
          filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse"
          color-interpolation-filters="sRGB">
    <feImage href="MAP_DATA_URL" x="0" y="0" width="393" height="852" preserveAspectRatio="none" result="map"/>
    <feDisplacementMap in="SourceGraphic" in2="map" scale="97.2" xChannelSelector="R" yChannelSelector="G" result="dR"/>
    <feColorMatrix in="dR" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r"/>
    <feDisplacementMap in="SourceGraphic" in2="map" scale="90" xChannelSelector="R" yChannelSelector="G" result="dG"/>
    <feColorMatrix in="dG" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g"/>
    <feDisplacementMap in="SourceGraphic" in2="map" scale="82.8" xChannelSelector="R" yChannelSelector="G" result="dB"/>
    <feColorMatrix in="dB" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b"/>
    <feBlend in="r" in2="g" mode="screen" result="rg"/>
    <feBlend in="rg" in2="b" mode="screen"/>
  </filter>
  <!-- lg-pill: same, 320×64, scales 54.5 / 49.5 / 45.5 -->
</svg>
```
Scales = refraction × (1 + dispersion), refraction, refraction × (1 − dispersion).

## 3. Layers (CSS)

```css
.glass        { position:relative; border-radius:46px; }            /* 32px for pill */
.glass-refract{ position:absolute; inset:0; border-radius:inherit;
                backdrop-filter:url(#lg-phone) saturate(1.35) brightness(1.06);
                -webkit-backdrop-filter:blur(2px) saturate(1.5); }   /* Safari fallback */
.glass-light  { position:absolute; inset:0; border-radius:inherit; pointer-events:none;
                background:radial-gradient(90% 40% at 22% 0%, rgba(255,255,255,.22), transparent 55%);
                box-shadow:
                  inset 2px 3px 0 -1px rgba(255,255,255,.95),
                  inset -2px -3px 0 -1px rgba(170,215,255,.8),
                  inset 0 0 26px rgba(255,255,255,.28),
                  inset 14px 18px 30px -24px rgba(255,255,255,.9),
                  inset -16px -14px 32px -24px rgba(120,190,255,.8),
                  0 30px 60px -30px rgba(8,20,70,.4); }
.glass-rim    { position:absolute; inset:0; border-radius:inherit; pointer-events:none; padding:1.5px;
                background:conic-gradient(from 210deg, rgba(255,255,255,.95), rgba(255,150,220,.75),
                  rgba(140,200,255,.6), rgba(120,255,225,.7), rgba(255,255,255,.95),
                  rgba(255,215,140,.7), rgba(175,145,255,.7), rgba(255,255,255,.95));
                -webkit-mask:linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
                -webkit-mask-composite:xor; mask-composite:exclude; }
.glass-content{ position:relative; height:100%; }
```

---

## Rules for whoever builds the app

- **Never** replace the refraction layer with `blur()` / frosted / white fill. The centre must stay clear.
- If the window size changes, **regenerate the map + filter** at the new W/H/R.
- Content goes in `.glass-content` only — never inside the refraction layer.
- Inner cards/buttons are *light*, not surfaces: `border:1px solid rgba(255,255,255,.6)`, fill ≤ `rgba(255,255,255,.2)`.
- One accent: `#2fe58f`. Solid colours only for marketplace marks: Depop `#ff2300`, Vestiaire `#f3e9d8`.

## Native macOS app (Swift) note
`backdrop-filter:url()` is Chromium-only. For a real Mac app:
- **Electron** → paste this code as-is (Chromium renders it identically); make the window `transparent: true, frame: false, vibrancy: none`. Caveat: backdrop only sees content *inside* the window, so for true desktop refraction use a native build.
- **SwiftUI (macOS 26+)** → use Apple's `.glassEffect()` on a `RoundedRectangle(cornerRadius: 46)`; match rim/highlight with the values above.

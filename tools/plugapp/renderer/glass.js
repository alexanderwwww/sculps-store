/**
 * The glass. Copied from the approved design, not reinterpreted.
 *
 * The recipe is in GLASS.md and the reference is reference.dc.html. Every
 * number here comes from one of those two files: refraction 90, bezel 28,
 * dispersion 8%, radius 46 for the phone and 32 for the pill, and the pill's
 * refraction at 0.55 with its bezel capped at 24.
 *
 * Do not replace any of it with blur, frost or a white panel. The centre of
 * the glass stays perfectly clear and the bending happens only at the rim —
 * that is the whole design, and the thing eleven earlier builds failed to be.
 */

export const REFRACTION = 90;
export const BEZEL = 28;
export const DISPERSION = 0.08;

export const SHAPES = {
  phone: { w: 393, h: 852, r: 46 },
  pill: { w: 320, h: 64, r: 32 },
};

/**
 * The displacement map: a picture of which way the glass bends light, drawn
 * once per shape and size.
 *
 * Each pixel's red and green say how far to push what is behind it sideways
 * and vertically. Inside the bezel the push falls off as (1-t)^2.4 — steep at
 * the rim, flat in the middle — which is why the centre reads as clear glass
 * rather than as a lens over everything.
 */
export function glassMap(W, H, R, B) {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const hw = W / 2;
  const hh = H / 2;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = x + 0.5 - hw;
      const py = y + 0.5 - hh;
      const sx = Math.sign(px) || 1;
      const sy = Math.sign(py) || 1;
      const qx = Math.abs(px) - (hw - R);
      const qy = Math.abs(py) - (hh - R);
      let dist;
      let nx;
      let ny;
      if (qx > 0 && qy > 0) {
        const l = Math.hypot(qx, qy);
        dist = R - l;
        nx = (sx * qx) / l;
        ny = (sy * qy) / l;
      } else if (qx > qy) {
        dist = R - qx;
        nx = sx;
        ny = 0;
      } else {
        dist = R - qy;
        nx = 0;
        ny = sy;
      }
      const t = Math.min(1, Math.max(0, dist / B));
      const m = Math.pow(1 - t, 2.4) * (t > 0 ? 1 : 0);
      const i = (y * W + x) * 4;
      d[i] = 128 - nx * m * 127;
      d[i + 1] = 128 - ny * m * 127;
      d[i + 2] = 128;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

/**
 * The filter, as three displacements of the same map at slightly different
 * strengths — red pushed furthest, blue least — recombined with screen blends.
 *
 * That split is the rainbow at the edge of the glass. It is what makes it read
 * as crystal rather than as a distortion effect, and it is why there are three
 * feDisplacementMaps instead of one.
 */
export function filterSVG(id, { w, h, r }, refraction, bezel) {
  const map = glassMap(w, h, r, bezel);
  const sR = refraction * (1 + DISPERSION);
  const sG = refraction;
  const sB = refraction * (1 - DISPERSION);
  const channel = (which) => {
    const rows = { r: "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0", g: "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0", b: "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0" };
    return `${rows[which]}  0 0 0 1 0`;
  };
  return `
  <filter id="${id}" x="0" y="0" width="${w}" height="${h}"
          filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse"
          color-interpolation-filters="sRGB">
    <feImage href="${map}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="map"/>
    <feDisplacementMap in="SourceGraphic" in2="map" scale="${sR}" xChannelSelector="R" yChannelSelector="G" result="dR"/>
    <feColorMatrix in="dR" type="matrix" values="${channel("r")}" result="r"/>
    <feDisplacementMap in="SourceGraphic" in2="map" scale="${sG}" xChannelSelector="R" yChannelSelector="G" result="dG"/>
    <feColorMatrix in="dG" type="matrix" values="${channel("g")}" result="g"/>
    <feDisplacementMap in="SourceGraphic" in2="map" scale="${sB}" xChannelSelector="R" yChannelSelector="G" result="dB"/>
    <feColorMatrix in="dB" type="matrix" values="${channel("b")}" result="b"/>
    <feBlend in="r" in2="g" mode="screen" result="rg"/>
    <feBlend in="rg" in2="b" mode="screen"/>
  </filter>`;
}

/**
 * Build both filters into the page.
 *
 * Called again whenever a shape's size changes, because a map drawn for one
 * size bends the wrong pixels at another — the rim lands in the middle of the
 * window and the whole thing looks broken rather than merely wrong.
 */
export function installFilters(root = document) {
  const pill = SHAPES.pill;
  const svg = `<svg width="0" height="0" style="position:absolute" aria-hidden="true">
    ${filterSVG("lg-phone", SHAPES.phone, REFRACTION, BEZEL)}
    ${filterSVG("lg-pill", pill, REFRACTION * 0.55, Math.min(BEZEL * 0.75, 24))}
  </svg>`;
  let host = root.getElementById("glass-filters");
  if (!host) {
    host = root.createElement("div");
    host.id = "glass-filters";
    root.body.appendChild(host);
  }
  host.innerHTML = svg;
}

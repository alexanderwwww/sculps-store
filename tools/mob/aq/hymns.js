// HYMN screen (rebuilt 2026-11-18 on Alex's golden temple art, aq/brand/hymn-frame.webp, served from our own origin):
// the 88 Orphic hymns (Greek, aq/data/orphic-hymns.json, Wikisource CC BY-SA) roll up inside the temple's black screen like
// film credits, hymn after hymn, looping forever. No buttons, no selector. Lightning flickers in the corners and a slow gold
// shimmer runs over the frame. The screen area was measured on the image: x 225-1310 of 1536, y 263-832 of 1024.
import { hymns } from "./data/orphic-hymns.json";
import { esc } from "./main.js";

const W = 1536, H = 1024, PX_PER_SEC = 1.1; // scroll speed in % of the art's width a second (slow, readable)
const box = (x, y, w, h) => `left:${(x / W * 100).toFixed(3)}%;top:${(y / H * 100).toFixed(3)}%;width:${(w / W * 100).toFixed(3)}%;height:${(h / H * 100).toFixed(3)}%`;
const CSS = `
#hymn{margin:14px auto;max-width:1100px;padding:0 8px}
#hymn .hy-art{position:relative;width:100%;aspect-ratio:${W}/${H};container-type:inline-size}
#hymn .hy-art>img{position:absolute;inset:0;width:100%;height:100%;display:block;user-select:none}
#hymn .hy-art>*{position:absolute}
#hymn .hy-screen{overflow:hidden;-webkit-mask-image:linear-gradient(180deg,transparent 0,#000 12%,#000 88%,transparent 100%);mask-image:linear-gradient(180deg,transparent 0,#000 12%,#000 88%,transparent 100%)}
#hymn .hy-roll{position:absolute;left:0;right:0;top:0;text-align:center;font-family:"GFS Didot","Palatino Linotype",Palatino,Georgia,serif;color:#f3e3b5;will-change:transform;animation:hyRoll var(--dur,600s) linear infinite}
#hymn .hy-h{margin:0 0 2cqw}#hymn .hy-h h3{margin:0 0 .4cqw;font-size:2.2cqw;letter-spacing:.06em;color:#ffd77a;text-shadow:0 0 1cqw rgba(255,190,80,.35)}
#hymn .hy-h .inc{margin:0 0 .8cqw;font-size:1.1cqw;font-style:italic;color:#c9a96a}#hymn .hy-h p{margin:0;font-size:1.45cqw;line-height:1.55}
#hymn .hy-h .sep{margin:1.6cqw auto 0;width:12cqw;height:1px;background:linear-gradient(90deg,transparent,#c9a24a,transparent)}
#hymn .bolt{opacity:0;background:radial-gradient(ellipse,rgba(190,225,255,.75),rgba(160,200,255,0) 70%);mix-blend-mode:screen;animation:hyBolt 7s infinite}
#hymn .shine{inset:0;background:linear-gradient(115deg,transparent 35%,rgba(255,230,160,.18) 50%,transparent 65%) -150% 0/300% 100% no-repeat;mix-blend-mode:screen;pointer-events:none;animation:hyShine 11s ease-in-out infinite;
  -webkit-mask-image:linear-gradient(#000,#000),linear-gradient(#000,#000);-webkit-mask-composite:xor;mask-composite:exclude}
#hymn .hy-credit{margin:6px 0 0;text-align:center;font:11px var(--mono);color:#8a7a52}
@keyframes hyRoll{from{transform:translateY(var(--from))}to{transform:translateY(var(--to))}}
@keyframes hyBolt{0%,88%,100%{opacity:0}89%{opacity:1}90%{opacity:.2}91.5%{opacity:.9}93%{opacity:0}}
@keyframes hyShine{0%,100%{background-position:-150% 0}50%{background-position:250% 0}}
`;
export function hymnScreen() {
  const el = document.createElement("section"); el.id = "hymn";
  el.innerHTML = `<style>${CSS}</style><div class="hy-art"><img src="/aq/brand/hymn-frame.webp" alt="" draggable="false">
    ${[[60, 0, 180, 150, 0], [1320, 10, 190, 130, 2.6], [0, 300, 100, 190, 4.1], [1440, 300, 96, 180, 5.5]].map(([x, y, w, h, dl]) => `<i class="bolt" style="${box(x, y, w, h)};animation-delay:${dl}s"></i>`).join("")}
    <i class="shine"></i>
    <div class="hy-screen" style="${box(232, 268, 1070, 558)}"><div class="hy-roll">${hymns.map((x) => `<div class="hy-h"><h3>${esc(x.n)} · ${esc(x.title)}</h3>${x.incense ? `<p class="inc">${esc(x.incense)}</p>` : ""}${x.lines.map((l) => `<p>${esc(l)}</p>`).join("")}<div class="sep"></div></div>`).join("")}</div></div>
  </div><p class="hy-credit">Text: Greek Wikisource, CC BY-SA 4.0; Abel 1885</p>`;
  // the roll starts just under the screen and ends when the last hymn has left the top, then starts again (forever)
  const fit = () => { const sc = el.querySelector(".hy-screen"), roll = el.querySelector(".hy-roll"); if (!sc || !sc.clientHeight) return;
    const h = roll.scrollHeight, s = sc.clientHeight, speed = sc.clientWidth * PX_PER_SEC / 100 * 2.2; // px a second
    roll.style.setProperty("--from", s + "px"); roll.style.setProperty("--to", -h + "px"); roll.style.setProperty("--dur", ((h + s) / Math.max(8, speed)).toFixed(0) + "s"); };
  requestAnimationFrame(fit); if (typeof ResizeObserver !== "undefined") new ResizeObserver(() => fit()).observe(el);
  return el;
}

// THE TV (Alex, 2026-11-18): the feature screens play on their own, one after another, like a channel. Smooth crossfade,
// 20 s a screen; the hymns screen moves to the next hymn each time it comes on, so all 88 roll by in order. Hovering pauses
// it (quietly, no controls). Nothing is chosen by hand; the hymn picker is hidden here.
const SHOW_MS = 20000;
export function tv(screens) {
  const el = document.createElement("section"); el.id = "tv";
  el.innerHTML = `<style>#tv{position:relative;display:grid}#tv>.tv-s{grid-area:1/1;transition:opacity 1.2s ease;opacity:0;pointer-events:none;min-width:0}#tv>.tv-s.on{opacity:1;pointer-events:auto}#tv .hy-nav{display:none!important}</style>`;
  const slides = screens.map((s) => { const w = document.createElement("div"); w.className = "tv-s"; w.append(s); el.append(w); return w; });
  let i = 0, paused = false;
  const nextHymn = (w) => w.querySelector('#hymn [data-d="1"]')?.click();
  const show = (k) => { slides.forEach((w, j) => w.classList.toggle("on", j === k)); };
  show(0);
  el.addEventListener("mouseenter", () => (paused = true)); el.addEventListener("mouseleave", () => (paused = false));
  setInterval(() => { if (paused || document.hidden) return; i = (i + 1) % slides.length; if (slides[i].querySelector("#hymn")) nextHymn(slides[i]); show(i); }, SHOW_MS);
  return el;
}

// THE TV (Alex, 2026-11-18): the feature screens play on their own, one after another, like a channel. Smooth crossfade,
// 20 s a screen (the hymns keep rolling on their own underneath). Hovering pauses it (quietly, no controls). Nothing is chosen by hand.
const SHOW_MS = 20000;
export function tv(screens) {
  const el = document.createElement("section"); el.id = "tv";
  el.innerHTML = `<style>#tv{position:relative;display:grid}#tv>.tv-s{grid-area:1/1;transition:opacity 1.2s ease;opacity:0;pointer-events:none;min-width:0}#tv>.tv-s.on{opacity:1;pointer-events:auto}</style>`;
  const slides = screens.map((s) => { const w = document.createElement("div"); w.className = "tv-s"; w.append(s); el.append(w); return w; });
  let i = 0, paused = false;
  const show = (k) => { slides.forEach((w, j) => w.classList.toggle("on", j === k)); };
  show(0);
  el.addEventListener("mouseenter", () => (paused = true)); el.addEventListener("mouseleave", () => (paused = false));
  setInterval(() => { if (paused || document.hidden) return; i = (i + 1) % slides.length; show(i); }, SHOW_MS);
  return el;
}

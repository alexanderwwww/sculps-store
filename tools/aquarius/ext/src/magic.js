// Aquarius's magic, drawn in whatever page he is working in: a sparkle burst and a short wand trail
// at (x, y), and a soft chime made in WebAudio (no audio files). Self-contained on purpose: it is
// injected with chrome.scripting.executeScript({ func }), so it may not use anything outside itself.
export function aqMagic(x, y, opts) {
  const o = opts || {};
  const host = document.createElement("div");
  host.id = "__aq_magic";
  host.setAttribute("data-aq", "magic");
  host.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none";
  const sh = host.attachShadow({ mode: "open" });
  const W = 220;
  const c = document.createElement("canvas");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = W * dpr; c.height = W * dpr;
  c.style.cssText = `position:fixed;left:${x - W / 2}px;top:${y - W / 2}px;width:${W}px;height:${W}px;pointer-events:none`;
  sh.appendChild(c);
  (document.body || document.documentElement).appendChild(host);
  const g = c.getContext("2d"); g.scale(dpr, dpr);
  const N = 22, parts = [];
  for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2 + Math.random() * 0.3, v = 1.4 + Math.random() * 2.6; parts.push({ a, v, r: 2 + Math.random() * 3.5, gold: Math.random() < 0.45 }); }
  const trail = []; for (let i = 0; i < 9; i++) trail.push({ x: W / 2 - 70 + i * 8, y: W / 2 - 55 + i * 6 + Math.sin(i) * 3 });
  const star = (px, py, r, a, col) => {
    g.globalAlpha = a; g.fillStyle = col; g.beginPath();
    g.moveTo(px, py - r); g.lineTo(px + r * 0.25, py - r * 0.25); g.lineTo(px + r, py); g.lineTo(px + r * 0.25, py + r * 0.25);
    g.lineTo(px, py + r); g.lineTo(px - r * 0.25, py + r * 0.25); g.lineTo(px - r, py); g.lineTo(px - r * 0.25, py - r * 0.25); g.closePath(); g.fill();
    g.fillStyle = "#fff"; g.fillRect(Math.round(px) - 1, Math.round(py) - 1, 2, 2);
  };
  const t0 = performance.now(), LIFE = o.life || 700;
  function tick(now) {
    const k = Math.min(1, (now - t0) / LIFE);
    g.clearRect(0, 0, W, W); g.globalCompositeOperation = "lighter";
    const glow = g.createRadialGradient(W / 2, W / 2, 1, W / 2, W / 2, 40 + 30 * k);
    glow.addColorStop(0, `rgba(140,230,255,${0.45 * (1 - k)})`); glow.addColorStop(1, "rgba(140,230,255,0)");
    g.globalAlpha = 1; g.fillStyle = glow; g.fillRect(0, 0, W, W);
    const tk = Math.min(1, k * 2.2); // the wand trail sweeps in, then fades
    for (let i = 0; i < trail.length; i++) { const p = trail[i], on = i / trail.length <= tk; if (on) star(p.x, p.y, 2 + i * 0.25, (1 - k) * (0.3 + i / trail.length), i % 2 ? "#ffe08a" : "#9ff8ff"); }
    for (const p of parts) { const d = p.v * 38 * Math.sqrt(k); star(W / 2 + Math.cos(p.a) * d, W / 2 + Math.sin(p.a) * d + k * k * 18, p.r * (1 - k * 0.6), 1 - k, p.gold ? "#ffd75e" : "#a6f6ff"); }
    g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
    if (k < 1 && !o.freeze) requestAnimationFrame(tick); else if (!o.keep) host.remove();
  }
  requestAnimationFrame(tick);
  if (o.freeze) tick(t0 + LIFE * o.freeze);
  if (!o.silent) {
    try {
      const A = window.__aqAudio || (window.__aqAudio = new (window.AudioContext || window.webkitAudioContext)());
      if (A.state === "suspended") A.resume().catch(() => {});
      const now = A.currentTime, out = A.createGain(); out.gain.value = 0.07; out.connect(A.destination);
      [1318.5, 1760, 2637].forEach((f, i) => { // E6, A6, E7: a soft bell
        const os = A.createOscillator(), gn = A.createGain(); os.type = "sine"; os.frequency.value = f * (o.pitch || 1);
        gn.gain.setValueAtTime(0, now + i * 0.05); gn.gain.linearRampToValueAtTime(1 / (i + 1), now + i * 0.05 + 0.01);
        gn.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.05 + 0.6);
        os.connect(gn).connect(out); os.start(now + i * 0.05); os.stop(now + i * 0.05 + 0.65);
      });
    } catch (e) { /* no sound is fine; the sparkle still shows */ }
  }
  return true;
}

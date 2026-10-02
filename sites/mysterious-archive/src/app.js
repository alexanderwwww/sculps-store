// Photo viewer for the product page. Nothing else on the site needs JavaScript.
(function () {
  var main = document.querySelector("main.piece");
  var lb = document.getElementById("lb");
  if (!main || !lb) return;
  var photos = [];
  try { photos = JSON.parse(main.getAttribute("data-photos")); } catch (e) { return; }
  var img = lb.querySelector(".lb-img"), count = lb.querySelector(".lb-count"), cur = 0, opener = null;
  function show(i) {
    cur = (i + photos.length) % photos.length;
    img.src = photos[cur];
    count.textContent = String(cur + 1).padStart(2, "0") + " / " + String(photos.length).padStart(2, "0");
  }
  function open(i, from) { opener = from; show(i); lb.hidden = false; document.body.style.overflow = "hidden"; lb.querySelector("[data-lb-close]").focus(); }
  function close() { lb.hidden = true; document.body.style.overflow = ""; img.removeAttribute("src"); if (opener) opener.focus(); }
  main.querySelectorAll("[data-lb]").forEach(function (b) { b.addEventListener("click", function () { open(Number(b.getAttribute("data-lb")), b); }); });
  lb.querySelector("[data-lb-close]").addEventListener("click", close);
  lb.querySelector("[data-lb-prev]").addEventListener("click", function () { show(cur - 1); });
  lb.querySelector("[data-lb-next]").addEventListener("click", function () { show(cur + 1); });
  lb.addEventListener("click", function (e) { if (e.target === lb) close(); });
  document.addEventListener("keydown", function (e) {
    if (lb.hidden) return;
    if (e.key === "Escape") close();
    if (e.key === "ArrowLeft") show(cur - 1);
    if (e.key === "ArrowRight") show(cur + 1);
  });
  var x0 = null;
  lb.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener("touchend", function (e) { if (x0 === null) return; var dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 50) show(cur + (dx < 0 ? 1 : -1)); }, { passive: true });
})();

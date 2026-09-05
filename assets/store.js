/* =========================================================================
   THE BLACK REAPER — shared storefront behaviour.
   Each page defines CUTOFF, VARIANTS and REVIEWS inline before loading this.
   Every lookup is guarded so a page can omit any block.
   ========================================================================= */

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const money = n => '$' + n.toFixed(2);

/* ---------- cutoff countdown ---------- */
const clockEl = $('#clock');
// Formatted in the store's own timezone so every visitor sees the same date.
const fmt = o => new Intl.DateTimeFormat('en-US', { ...o, timeZone:'America/New_York' });
const cutoffLabel = fmt({ weekday:'long', month:'long', day:'numeric' }).format(CUTOFF);

const setText = (sel, txt) => { const el = $(sel); if (el) el.textContent = txt; };

setText('#cutoff-date',  cutoffLabel);
setText('#deliver-date', cutoffLabel);
$$('.js-cutoff').forEach(el => el.textContent = cutoffLabel);

// Honest delivery window: dispatch next day, then a 3–7 day transit band.
const dayFmt = fmt({ month:'short', day:'numeric' });
const addDays = n => new Date(Date.now() + n * 864e5);
setText('#eta-window', `${dayFmt.format(addDays(4))} – ${dayFmt.format(addDays(8))}`);

function tick(){
  const ms = CUTOFF - Date.now();

  if (ms <= 0){
    if (clockEl) clockEl.textContent = 'Cutoff has passed';
    const note = $('.ship-note');
    if (note) note.innerHTML =
      '<span>The Halloween delivery cutoff has passed. Orders still ship within 24 hours, ' +
      'but we can no longer promise it arrives before the 31st.</span>';
    return;
  }

  const d = Math.floor(ms / 864e5),
        h = Math.floor(ms % 864e5 / 36e5),
        m = Math.floor(ms % 36e5 / 6e4),
        s = Math.floor(ms % 6e4 / 1e3);

  if (clockEl) clockEl.textContent =
    `${d}d ${String(h).padStart(2,'0')}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s left`;
  setText('#deliver-left', d > 0 ? `${d} day${d === 1 ? '' : 's'}` : `${h} hours`);
}
tick();
setInterval(tick, 1000);

/* ---------- options + order summary ---------- */
const tiers = $$('.tier');
let selected = tiers.find(t => t.getAttribute('aria-checked') === 'true') || tiers[0];
if (!selected) console.warn('No purchase options found on this page.');

const addons = $$('.addon');
const chosenAddons = () => addons.filter(a => a.getAttribute('aria-checked') === 'true');

// One function owns the price. Options and add-ons both just call it.
function render(){
  if (!selected) return;

  const { label, price, compare, save } = selected.dataset;
  const base = +price, baseCompare = +compare;
  let saved = +save;

  const picked = chosenAddons();
  const extra  = picked.reduce((a, el) => a + (+el.dataset.price), 0);
  saved += picked.reduce((a, el) => a + (+el.dataset.compare - +el.dataset.price), 0);

  const total = base + extra;

  setText('#sum-label',  label);
  setText('#sum-sub',    money(baseCompare));
  setText('#total',      money(total));
  setText('#mbar-price', money(total));

  // Add-on lines are rebuilt from scratch each time, above the discount row.
  const saveRow = $('#sum-save-row');
  $$('.summary .addon-row').forEach(el => el.remove());
  if (saveRow){
    picked.forEach(el => {
      const row = document.createElement('div');
      row.className = 'row addon-row';
      row.innerHTML = '<span></span><span></span>';
      row.children[0].textContent = el.dataset.label;
      row.children[1].textContent = money(+el.dataset.compare);
      saveRow.before(row);
    });
    saveRow.hidden = saved <= 0;
  }
  setText('#sum-save', '−' + money(saved));

  const cartLabel = picked.length
    ? `${label} + ${picked.length} extra${picked.length === 1 ? '' : 's'}`
    : label;
  setText('#add-qty', cartLabel);
  setText('#mbar-qty', saved > 0 ? `${cartLabel} · Save $${Math.round(saved)}` : cartLabel);
}

function select(tier){
  selected = tier;
  tiers.forEach(t => t.setAttribute('aria-checked', String(t === tier)));
  render();
}

addons.forEach(a => a.addEventListener('click', () => {
  a.setAttribute('aria-checked', String(a.getAttribute('aria-checked') !== 'true'));
  render();
}));

tiers.forEach(t => {
  t.addEventListener('click', () => select(t));
  t.addEventListener('keydown', e => {
    if (!['ArrowDown','ArrowUp','ArrowLeft','ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    const dir  = (e.key === 'ArrowDown' || e.key === 'ArrowRight') ? 1 : -1;
    const next = tiers[(tiers.indexOf(t) + dir + tiers.length) % tiers.length];
    next.focus();
    select(next);
  });
});
if (selected) select(selected);

/* ---------- add to cart ---------- */
function addToCart(){
  const keys  = [selected.dataset.key, ...chosenAddons().map(a => a.dataset.key)];
  const lines = keys.map(k => VARIANTS[k]);
  const bad   = keys.filter((k, i) => !lines[i] || String(lines[i]).startsWith('REPLACE_'));

  if (bad.length){
    console.warn('Missing Shopify variant IDs for: ' + bad.join(', '));
    location.hash = '#buy';
    return;
  }
  // Shopify cart permalink: /cart/<variant>:<qty>,<variant>:<qty> — straight to checkout.
  location.href = '/cart/' + lines.map(id => id + ':1').join(',');
}
$$('#add, #mbar-add').forEach(b => b.addEventListener('click', addToCart));

/* ---------- gallery ---------- */
const thumbs = $$('.gal-thumbs button');
thumbs.forEach(b => b.addEventListener('click', () => {
  thumbs.forEach(x => x.setAttribute('aria-selected', String(x === b)));
  // ASSET: swap the real media source here. The placeholder swaps its caption.
  $('#gal-label').textContent = b.dataset.label;
}));

/* ---------- reviews ---------- */
const starRow = n => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);

if (typeof REVIEWS !== 'undefined' && REVIEWS.length && $('#rev-grid')){
  const grid = $('#rev-grid');
  const avg  = REVIEWS.reduce((a, r) => a + r.stars, 0) / REVIEWS.length;

  grid.innerHTML = REVIEWS.map(r => `
    <article class="rev">
      ${r.photo ? `<div class="shot"><img src="${r.photo}" alt="" loading="lazy"></div>` : ''}
      <div class="body">
        <span class="stars" aria-label="${r.stars} out of 5">${starRow(r.stars)}</span>
        <p></p>
        <div class="who">
          <b></b>
          ${r.place ? `<span></span>` : ''}
          ${r.verified ? '<span class="verified">✓ Verified order</span>' : ''}
        </div>
      </div>
    </article>`).join('');

  // Customer words are set as text, never as markup.
  $$('.rev', grid).forEach((el, i) => {
    $('p', el).textContent = REVIEWS[i].text;
    $('.who b', el).textContent = REVIEWS[i].name;
    const place = $('.who span:not(.verified)', el);
    if (place) place.textContent = REVIEWS[i].place;
  });

  setText('#rev-stars', starRow(Math.round(avg)));
  setText('#rev-count',
    `${avg.toFixed(1)} out of 5 · ${REVIEWS.length} verified review${REVIEWS.length === 1 ? '' : 's'}`);

  $('#rev-summary').hidden = false;
  grid.hidden = false;
  $('#rev-empty').hidden = true;
}

/* ---------- faq ---------- */
$$('.faq-q').forEach(q => q.addEventListener('click', () => {
  const open = q.getAttribute('aria-expanded') === 'true';
  q.setAttribute('aria-expanded', String(!open));
  q.nextElementSibling.classList.toggle('open', !open);
}));

/* ---------- sticky mobile bar ---------- */
const mbar = $('#mbar'), buyCol = $('.buy');
if (mbar && buyCol && 'IntersectionObserver' in window){
  new IntersectionObserver(([e]) => {
    mbar.classList.toggle('show', e.boundingClientRect.top < 0 && !e.isIntersecting);
  }, { threshold: 0 }).observe(buyCol);
}

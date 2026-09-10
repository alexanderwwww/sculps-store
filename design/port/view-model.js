
const STORES = [
  { id:'gk', name:'Garden Kneeler', domain:'kneelwell.com', color:'#4CAF7D', initial:'G', product:'Garden Kneeler & Seat', bundles:[{label:'Buy 1',price:89,compare:129},{label:'Buy 2',price:129,compare:218},{label:'Family bundle',price:179,compare:338}], stripe:'Amboras LLC', descriptor:'KNEELWELL.COM', pixel:'', ads:['kneeler-video-3','kneeler-ugc-7','retarget-30d','Direct'], campaign:'GK · Prospecting US 55+', seq:1084, tax:.0875, sessions:0, aov:118, conv:.031, base:3900 },
  { id:'hd', name:'Halloween Decor', domain:'hauntedporch.com', color:'#F28C28', initial:'H', product:'Motion-Sensor Porch Ghoul', bundles:[{label:'Buy 1',price:59,compare:89},{label:'Buy 2',price:99,compare:178},{label:'Buy 3',price:139,compare:267}], stripe:'Hauntworks LLC', descriptor:'HAUNTEDPORCH', pixel:'', ads:['ghoul-jumpscare-2','porch-ugc-1','retarget-14d','Direct'], campaign:'HD · Seasonal US', seq:2041, tax:.0825, sessions:0, aov:84, conv:.023, base:1700 },
  { id:'eb', name:'E-Bike', domain:'voltcommuter.com', color:'#3B82F6', initial:'V', product:'Volt Commuter E-Bike', bundles:[{label:'Standard',price:899,compare:1199},{label:'With rack & lights',price:979,compare:1349}], stripe:'Volt Mobility LLC', descriptor:'VOLTCOMMUTER', pixel:'', ads:['commute-cost-calc','ebike-test-ride','retarget-30d','Direct'], campaign:'EB · Urban commuters', seq:3007, tax:.0725, sessions:0, aov:930, conv:.0095, base:2000 }
];
const ALL = { id:'all', name:'All stores', domain:'3 stores', color:'#A78BFA', initial:'K', product:'All products', bundles:[], stripe:'3 accounts', pixel:'', ads:[], sessions:0 };
const CITIES = [['Tulsa','OK',-95.99,36.15],['Phoenix','AZ',-112.07,33.45],['Columbus','OH',-83,39.96],['Fresno','CA',-119.79,36.74],['Erie','PA',-80.09,42.13],['Boise','ID',-116.2,43.62],['Omaha','NE',-95.93,41.26],['Knoxville','TN',-83.92,35.96],['Dayton','OH',-84.19,39.76],['Spokane','WA',-117.43,47.66],['Albuquerque','NM',-106.65,35.08],['Lubbock','TX',-101.86,33.58],['Richmond','VA',-77.44,37.54],['Des Moines','IA',-93.6,41.59],['Chattanooga','TN',-85.31,35.05],['El Paso','TX',-106.49,31.76],['Sarasota','FL',-82.53,27.34],['Grand Rapids','MI',-85.67,42.96],['Little Rock','AR',-92.29,34.75],['Tucson','AZ',-110.97,32.22],['Wichita','KS',-97.34,37.69],['Eugene','OR',-123.09,44.05],['Louisville','KY',-85.76,38.25],['Reno','NV',-119.81,39.53],['Greenville','SC',-82.39,34.85],['Baton Rouge','LA',-91.15,30.45],['Colorado Springs','CO',-104.82,38.83],['Toledo','OH',-83.56,41.65],['Savannah','GA',-81.1,32.08],['Madison','WI',-89.4,43.07],['Dallas','TX',-96.8,32.78],['Houston','TX',-95.37,29.76],['Atlanta','GA',-84.39,33.75],['Chicago','IL',-87.63,41.88],['Seattle','WA',-122.33,47.61],['Denver','CO',-104.99,39.74],['Minneapolis','MN',-93.27,44.98],['Nashville','TN',-86.78,36.16],['Charlotte','NC',-80.84,35.23],['Tampa','FL',-82.46,27.95]];
const NAMES = ['Margaret Ellis','Harold Whitfield','Diane Kowalski','Ruth Navarro','Walter Brennan','Carol Jensen','Frank Delgado','Linda Pruitt','Gerald Okafor','Nancy Lindqvist','Barbara Huang','Dennis Marsh','Joyce Abernathy','Raymond Fitch','Shirley Beaumont','Eugene Halvorsen','Patricia Ochoa','Norman Seagrave','Judith Carver','Arthur Pennington','Helen Stroud','Lawrence Bixby','Dorothy Fairbanks','Ernest Villanueva','Marilyn Hodge','Clifford Ames','Betty Lachance','Roger Thibodeaux','Gloria Sandoval','Howard Kessler','Phyllis Ridgeway','Vernon Oyelaran','Irene Castellano','Leonard Brightwater','Doris Whitcomb','Stanley Ferguson','Martha Quill','Alvin Rasmussen'];
const STREETS = ['1412 S Utica Ave','3310 E Camelback Rd','88 N High St','6420 N Palm Ave','2901 W 8th St','1105 W Idaho St','7811 Dodge St','5201 Kingston Pike','40 W 2nd St','808 W Main Ave','6600 Menaul Blvd NE','5011 82nd St','1601 W Broad St','400 Locust St','728 Market St'];
const TODAY_TIMES = ['2:32 pm','1:58 pm','1:14 pm','12:40 pm','11:52 am','10:21 am','9:05 am','8:44 am','8:12 am','7:50 am','7:31 am','7:02 am','6:48 am','6:15 am','5:57 am','5:30 am','4:44 am','3:12 am','2:05 am','1:40 am','12:58 am','12:21 am','12:08 am'];
const YDAY_TIMES = ['9:47 pm','8:30 pm','6:47 pm','5:12 pm','3:12 pm','1:44 pm','11:30 am','10:05 am','8:22 am','7:15 am'];
const REF = n => 'pi_3Q' + (n*7919).toString(36).slice(0,6) + '…' + (n*31).toString(36).slice(-3).toUpperCase();
const money = n => '$' + n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const money0 = n => '$' + Math.round(n).toLocaleString('en-US');
const round2 = n => Math.round(n*100)/100;
const STATE_KIND = { New:'warning', Ordered:'purple', Fulfilled:'success', Refunded:'neutral' };
const STATE_LABEL = { New:'New', Ordered:'Ordered with supplier', Fulfilled:'Fulfilled', Refunded:'Refunded' };
const TRACK = n => '9400 1112 0620 ' + String(3841+n*13).padStart(4,'0') + ' ' + String(2207+n*7).padStart(4,'0') + ' ' + String(61+n%30).padStart(2,'0');
const rng = seed => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

function makeOrder(s, seq, name, city, bi, day, time, state, src, dayIndex, i) {
  const b = s.bundles[bi], tax = round2(b.price * s.tax);
  const o = { id: s.id + '-' + seq, number: '#' + seq, store: s.id, customer: name, city: city[0], st: city[1], lon: city[2], lat: city[3], zip: String(10000 + (seq*37)%89999), address: STREETS[(seq + i) % STREETS.length],
    email: name.toLowerCase().split(' ').map((w,k)=>k===0?w[0]+'.':w).join('') + '@' + ['gmail.com','yahoo.com','aol.com','outlook.com'][seq%4],
    phone: '(' + (200 + (seq*7)%700) + ') ' + String(200 + (seq*13)%700) + '-' + String(1000 + (seq*17)%9000),
    bundle: b.label, price: b.price, tax, subtotal: b.price, total: round2(b.price + tax), payment: state==='Refunded' ? 'Refunded' : 'Paid',
    state, day, time, date: day + ', ' + time, dayIndex, tracking: state==='Fulfilled' ? TRACK(seq) : '', carrier: state==='Fulfilled' ? (seq%4===1?'UPS':'USPS') : '',
    source: src, campaign: src==='Direct' ? '— (no ad click)' : s.campaign, eventId: 'evt_' + (seq*2654435761 % 1e9).toString(36), ref: REF(seq), note: '', hasUpsell: false, timeline: [] };
  const tl = [
    { t: o.date, text: 'Landed on ' + s.domain + ' from ' + (src==='Direct' ? 'direct visit' : 'ad ' + src), dot: 'var(--ink-3)' },
    { t: o.date, text: 'Added ' + b.label + ' to cart', dot: 'var(--ink-3)' },
    { t: o.date, text: 'Checkout started', dot: 'var(--ink-3)' },
    { t: o.date, text: 'Order created · ' + o.number, dot: 'var(--link)' },
    { t: o.date, text: 'Payment of ' + money(o.total) + ' captured via Stripe · ' + o.ref, dot: '#22C55E' },
    { t: o.date, text: 'Meta Purchase event sent · ' + o.eventId + ' · deduplicated', dot: 'var(--ink-3)' } ];
  if (state !== 'New') tl.push({ t: o.date, text: 'Marked as ordered with supplier', dot: 'var(--link)' });
  if (state === 'Fulfilled') tl.push({ t: o.date, text: 'Tracking ' + o.tracking + ' (' + o.carrier + ') added · Shipping confirmation sent to ' + o.email, dot: '#22C55E' });
  if (state === 'Refunded') tl.push({ t: 'Sep 8, 4:10 pm', text: 'Refund of ' + money(o.total) + ' issued via Stripe · Item damaged in transit', dot: 'var(--critical)' });
  o.timeline = tl; return o;
}
function buildOrders() {
  const out = [];
  const plan = { gk: { today: 23, yday: 10, older: 5 }, hd: { today: 9, yday: 6, older: 3 }, eb: { today: 2, yday: 1, older: 2 } };
  STORES.forEach((s, si) => {
    let seq = s.seq; const p = plan[s.id], total = p.today + p.yday + p.older;
    for (let i = 0; i < total; i++) {
      const name = NAMES[(si*5 + i) % NAMES.length], city = CITIES[(si*5 + i) % CITIES.length];
      const bi = s.id==='gk' ? [1,0,1,2,1,0,1,1,2,0,1,1][i%12] : (i%3) % s.bundles.length;
      const isToday = i < p.today, isYday = i >= p.today && i < p.today + p.yday;
      const day = isToday ? 'Sep 9' : isYday ? 'Sep 8' : (i - p.today - p.yday < 3 ? 'Sep 7' : 'Sep 6');
      const time = isToday ? TODAY_TIMES[i % TODAY_TIMES.length] : isYday ? YDAY_TIMES[(i-p.today) % YDAY_TIMES.length] : YDAY_TIMES[(i*3) % YDAY_TIMES.length];
      let state = 'New';
      if (isToday) state = i < Math.ceil(p.today*0.55) ? 'New' : 'Ordered';
      else if (isYday) state = i - p.today < 2 ? 'Ordered' : (i - p.today === 6 ? 'Refunded' : 'Fulfilled');
      else state = 'Fulfilled';
      const src = s.ads[[0,1,0,2,0,3,1,0,2,0,1,0][i%12]];
      const o = makeOrder(s, seq, name, city, bi, day, time, state, src, isToday ? 0 : isYday ? 1 : (day==='Sep 7' ? 2 : 3), i);
      if (s.id==='gk' && seq===1079) { o.chargeback = true; o.chargebackBy = 'Sep 13'; o.chargebackReason = 'Product not received'; o.timeline.push({ t: 'Sep 9, 10:40 am', text: 'Chargeback opened by cardholder · Product not received · respond by Sep 13', dot: 'var(--critical)', color: 'var(--critical)' }); }
      out.push(o); seq--;
    }
  });
  return out;
}
const HOURS0 = { today: new Array(24).fill(0), yday: new Array(24).fill(0) };
const HOURLY = {
  gk: { today:[0,0,0,20,0,45,110,180,220,260,300,340,410,380,455], yday:[0,15,0,0,30,60,95,150,190,230,250,270,300,330,320,340,370,360,390,410,380,330,260,150] },
  hd: { today:[0,0,0,0,0,25,60,90,120,160,180,210,240,225,260], yday:[0,0,0,10,20,40,70,100,130,150,170,190,210,200,220,240,250,230,260,270,240,200,150,80] },
  eb: { today:[0,0,0,0,0,0,0,0,0,0,899,899,0,979,0], yday:[0,0,0,0,0,0,0,0,0,899,0,0,0,0,0,0,0,0,979,0,0,0,0,0] }
};
const sumArr = (a, b) => a.map((v, i) => v + (b[i] || 0));

const LAND = [
  [[-168,66],[-160,70],[-152,71],[-141,70],[-133,69],[-124,70],[-114,69],[-105,69],[-95,69],[-85,68],[-80,72],[-88,74],[-96,74],[-104,74],[-112,74],[-120,72],[-125,70],[-115,70],[-105,68],[-95,68],[-88,67],[-82,66],[-78,68],[-73,63],[-64,60],[-56,52],[-60,47],[-66,45],[-70,43],[-74,40],[-76,37],[-76,35],[-81,32],[-80,26],[-82,25],[-84,30],[-89,29],[-94,29],[-97,26],[-98,22],[-105,20],[-110,23],[-114,28],[-117,32],[-121,35],[-124,40],[-124,46],[-131,52],[-136,58],[-146,60],[-153,58],[-158,56],[-162,60],[-165,64]],
  [[-92,18],[-88,15],[-83,10],[-79,9],[-77,7],[-80,9],[-85,13],[-89,17]],
  [[-83,30],[-81,27],[-80,25],[-81,25],[-82,28],[-84,29]],
  [[-85,22],[-80,23],[-75,20],[-80,21]],
  [[-45,60],[-42,63],[-38,66],[-30,68],[-22,70],[-20,74],[-24,78],[-30,82],[-40,83],[-50,82],[-58,78],[-62,74],[-60,70],[-55,66],[-50,62]],
  [[-24,64],[-19,66],[-14,66],[-14,64],[-19,63]],
  [[-81,7],[-77,8],[-72,11],[-66,11],[-60,10],[-52,5],[-50,0],[-44,-2],[-38,-5],[-35,-8],[-39,-13],[-39,-18],[-44,-23],[-48,-25],[-53,-34],[-58,-38],[-62,-40],[-65,-45],[-68,-50],[-66,-55],[-72,-54],[-75,-50],[-73,-44],[-73,-37],[-71,-30],[-70,-23],[-70,-18],[-76,-14],[-79,-8],[-81,-5],[-80,0],[-78,2],[-77,4]],
  [[-17,15],[-17,21],[-13,28],[-9,30],[-5,35],[3,37],[10,34],[15,32],[20,32],[25,32],[30,31],[33,31],[35,28],[37,22],[39,15],[43,12],[45,11],[51,12],[51,8],[48,5],[44,2],[41,-2],[40,-7],[39,-11],[36,-17],[35,-22],[32,-26],[30,-31],[25,-34],[20,-35],[18,-32],[15,-27],[13,-22],[12,-17],[13,-12],[11,-6],[9,-1],[9,4],[5,5],[0,5],[-4,5],[-8,4],[-11,6],[-13,9],[-16,12]],
  [[-10,36],[-9,39],[-9,43],[-2,43],[0,47],[-2,48],[-4,48],[-2,51],[3,51],[4,53],[7,53],[8,57],[10,57],[12,54],[19,54],[21,56],[24,57],[28,59],[30,60],[26,65],[22,66],[21,70],[26,71],[31,70],[40,68],[45,68],[50,69],[57,70],[60,70],[68,72],[75,73],[80,73],[90,75],[100,77],[110,76],[120,74],[130,71],[140,72],[150,70],[160,69],[170,68],[179,66],[179,60],[170,60],[163,58],[155,57],[150,59],[142,54],[140,52],[135,45],[132,43],[130,42],[128,38],[126,35],[122,31],[121,28],[117,24],[112,21],[110,18],[107,11],[105,9],[102,12],[100,13],[99,10],[98,8],[97,17],[95,16],[94,20],[91,22],[89,22],[87,21],[84,21],[81,16],[80,10],[78,8],[76,9],[73,15],[72,21],[70,23],[68,24],[65,25],[62,25],[58,24],[56,26],[50,29],[48,30],[43,33],[36,36],[30,36],[27,37],[23,37],[20,40],[16,41],[13,38],[12,45],[13,46],[10,44],[5,43],[0,41],[-3,37]],
  [[-5,50],[-4,53],[-3,55],[-5,58],[-3,58],[-1,54],[1,52],[0,51],[-4,50]],
  [[-10,52],[-7,54],[-6,55],[-9,55]],
  [[130,31],[132,33],[135,34],[137,35],[139,35],[141,38],[142,41],[145,43],[145,44],[141,42],[140,40],[138,37],[135,33],[131,32]],
  [[120,6],[126,7],[126,13],[122,18],[120,16],[119,11]],
  [[95,5],[99,3],[104,-2],[106,-6],[102,-5],[98,1]],
  [[105,-6],[114,-8],[112,-7],[108,-7]],
  [[109,2],[117,4],[119,0],[116,-3],[110,-3],[108,0]],
  [[131,-1],[141,-3],[147,-8],[141,-9],[134,-8],[131,-4]],
  [[80,6],[82,7],[81,9],[80,9]],
  [[43,-12],[47,-15],[50,-16],[48,-22],[45,-25],[44,-21],[43,-16]],
  [[113,-22],[114,-26],[115,-32],[118,-35],[123,-34],[129,-32],[134,-33],[137,-35],[140,-38],[145,-38],[148,-37],[150,-35],[153,-31],[153,-28],[151,-24],[149,-21],[146,-19],[143,-14],[142,-11],[137,-12],[132,-11],[130,-13],[126,-14],[122,-17],[118,-20]],
  [[145,-41],[148,-41],[148,-43],[145,-43]],
  [[173,-35],[175,-37],[178,-38],[174,-41],[171,-44],[167,-46],[166,-45],[170,-42],[172,-40]],
  [[-180,-90],[180,-90],[180,-71],[120,-67],[60,-68],[0,-70],[-60,-72],[-62,-66],[-70,-70],[-120,-74],[-180,-78]]
];
const HOLES = [
  [[-95,58],[-88,55],[-81,55],[-78,60],[-80,63],[-88,64],[-94,62]],
  [[-92,48],[-86,49],[-79,45],[-77,44],[-83,42],[-88,43],[-92,46]],
  [[28,41],[33,42],[38,43],[41,44],[38,46],[33,46],[29,45]],
  [[47,37],[52,38],[54,42],[52,47],[48,46],[46,42]],
  [[17,54],[21,56],[24,58],[22,60],[19,59],[16,56]]
];
function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function buildLandGrid(step) {
  const pts = [];
  for (let lat = -84; lat <= 84; lat += step) for (let lon = -180; lon < 180; lon += step) {
    for (let p = 0; p < LAND.length; p++) if (inPoly(lon, lat, LAND[p])) { pts.push([lon, lat]); break; }
  }
  return pts;
}
const PATHS = { gk: ['/', '/products/garden-kneeler-seat', '/cart', '/checkout', '/pages/reviews'], hd: ['/', '/products/porch-ghoul', '/cart', '/checkout', '/collections/halloween'], eb: ['/', '/products/volt-commuter', '/cart', '/checkout', '/pages/range-calculator'] };
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];

class Component extends DCLogic {
  constructor(p) {
    super(p);
        this.state = {
      storeId: 'gk', route: { screen: 'home', id: null }, orders: [], isMobile: typeof window !== 'undefined' && window.innerWidth < 900,
      storeMenuOpen: false, bellOpen: false, paletteOpen: false, paletteQuery: '', paletteIdx: 0, dateMenuOpen: false, homeRange: 'Today', drawerOpen: false, fullscreen: false,
      ordersTab: 'All', ordersQuery: '', sort: { key: 'date', dir: 'desc' }, selected: {}, page: 0, filterOpen: false, sortMenuOpen: false, filters: { payment: '', bundle: '', date: '' }, menuFor: null, exportOpen: false, exportScope: 'page',
      trackingInput: '', carrier: 'USPS', comment: '', refundOpen: false, refundReason: 'Customer changed mind', moreMenuOpen: false, noteEditing: false, noteDraft: '',
      toast: null, chartHover: -1, confirm: null, dirty: false, cfg: {}, account: {}, setTab: 'domains', showToken: false, reviews: [], campaigns: [], subscribers: [], media: [], inv: {}, editorCfg: {}, editorHidden: {}, editorSel: null, mkTab: 'campaigns', mkBlocks: [], mdView: 'grid', autos: {}, osTab: 'themes', themeLib: [], edZoom: 1, edDevice: 'desktop', edHist: [], edFuture: [], navMenus: { header: [], footer: [] }, prefs: {},
      pages: [['Refund policy','/refund-policy'],['Privacy policy','/privacy-policy'],['Terms of service','/terms-of-service'],['Shipping policy','/shipping-policy'],['Contact','/contact']].map(([title, handle], i) => ({ id: 'pg' + i, title, handle, body: '', updated: 'never', visible: false }))
    };
    this.paletteRef = React.createRef();
    this.seqs = { gk: 1084, hd: 2041, eb: 3007 };
    this.initExtras && this.initExtras();
  }
  componentDidMount() {
    this._resize = () => this.setState({ isMobile: window.innerWidth < 900 });
    this._key = e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); this.setState({ paletteOpen: true, paletteQuery: '', paletteIdx: 0 }, () => this.paletteRef.current && this.paletteRef.current.focus()); }
      if (e.key === 'Escape') this.setState({ paletteOpen: false, refundOpen: false, exportOpen: false, storeMenuOpen: false, bellOpen: false, filterOpen: false, sortMenuOpen: false, menuFor: null, moreMenuOpen: false, dateMenuOpen: false, drawerOpen: false, confirm: null, soundPopOpen: false, modal: null });
    };
    window.addEventListener('resize', this._resize); window.addEventListener('keydown', this._key);
    this.mountExtras && this.mountExtras();
  }
  componentWillUnmount() { window.removeEventListener('resize', this._resize); window.removeEventListener('keydown', this._key); clearTimeout(this._toastT); this.unmountExtras && this.unmountExtras(); }
  toast(text) { clearTimeout(this._toastT); this.setState({ toast: text }); this._toastT = setTimeout(() => this.setState({ toast: null }), 3200); }
  go(screen, id) { this.setState({ route: { screen, id: id || null }, drawerOpen: false, storeMenuOpen: false, bellOpen: false, paletteOpen: false, menuFor: null, moreMenuOpen: false, trackingInput: '', comment: '', noteEditing: false, fullscreen: false }); const m = document.querySelector('main'); if (m) m.scrollTop = 0; }
  store() { return this.state.storeId === 'all' ? ALL : STORES.find(s => s.id === this.state.storeId); }
  isAll() { return this.state.storeId === 'all'; }
  storeOrders() { return this.isAll() ? this.state.orders : this.state.orders.filter(o => o.store === this.state.storeId); }
  now() { const d = new Date(); let h = d.getHours(), m = d.getMinutes(); return 'Sep 9, ' + (h % 12 || 12) + ':' + String(m).padStart(2,'0') + ' ' + (h < 12 ? 'am' : 'pm'); }
  updateOrder(id, fn) { this.setState(s => ({ orders: s.orders.map(o => o.id === id ? fn({ ...o, timeline: [...o.timeline] }) : o) })); }
  markOrdered(id) {
    const o = this.state.orders.find(x => x.id === id); if (!o || o.state !== 'New') { this.toast('Order is already past this step'); return; }
    this.updateOrder(id, o => { o.state = 'Ordered'; o.timeline.push({ t: this.now(), text: 'Marked as ordered with supplier', dot: 'var(--link)' }); return o; });
    this.toast('Marked as ordered with supplier');
  }
  fulfill(id, tracking, carrier) {
    this.updateOrder(id, o => { o.state = 'Fulfilled'; o.tracking = tracking; o.carrier = carrier; o.timeline.push({ t: this.now(), text: 'Tracking ' + tracking + ' (' + carrier + ') added · Shipping confirmation sent to ' + o.email, dot: '#22C55E' }); return o; });
    this.setState({ trackingInput: '' }); this.toast('Fulfillment updated · Tracking sent to customer');
  }
  refund(id, reason) {
    this.updateOrder(id, o => { o.state = 'Refunded'; o.payment = 'Refunded'; o.timeline.push({ t: this.now(), text: 'Refund of ' + money(o.total) + ' issued via Stripe · ' + reason, dot: 'var(--critical)' }); return o; });
    this.setState({ refundOpen: false }); this.toast('Refund issued');
  }
  createLiveOrder(storeId, city, source) {
    const s = STORES.find(x => x.id === storeId); const seq = ++this.seqs[storeId];
    const bi = Math.random() < .5 ? Math.min(1, s.bundles.length - 1) : Math.floor(Math.random() * s.bundles.length);
    const name = NAMES[Math.floor(Math.random() * NAMES.length)];
    const t = this.now();
    const o = makeOrder(s, seq, name, city, bi, 'Sep 9', t.split(', ')[1], 'New', source, 0, seq);
    o.date = t; o.timeline.forEach(e => e.t = t);
    this.setState(x => ({ orders: [o, ...x.orders] }));
    return o;
  }
  filteredOrders() {
    const { ordersTab, ordersQuery, filters, sort } = this.state;
    let list = this.storeOrders();
    if (ordersTab !== 'All') list = list.filter(o => o.state === ordersTab);
    if (filters.payment) list = list.filter(o => o.payment === filters.payment);
    if (filters.bundle) list = list.filter(o => o.bundle === filters.bundle);
    if (filters.date === 'today') list = list.filter(o => o.dayIndex === 0);
    if (filters.date === 'yesterday') list = list.filter(o => o.dayIndex === 1);
    if (filters.date === '7') list = list.filter(o => o.dayIndex <= 6);
    const q = ordersQuery.trim().toLowerCase();
    if (q) list = list.filter(o => (o.number + ' ' + o.customer + ' ' + o.email + ' ' + o.city).toLowerCase().includes(q));
    const dir = sort.dir === 'asc' ? 1 : -1, idx = o => this.state.orders.indexOf(o);
    return [...list].sort((a, b) => sort.key === 'total' ? (a.total - b.total) * dir : sort.key === 'customer' ? a.customer.localeCompare(b.customer) * dir : (idx(b) - idx(a)) * dir);
  }
  paletteResults() {
    const q = this.state.paletteQuery.trim().toLowerCase(), st = this.store(), groups = [];
    const orders = this.storeOrders().filter(o => !q || (o.number + ' ' + o.customer + ' ' + o.email + ' ' + o.city).toLowerCase().includes(q)).slice(0, q ? 6 : 4);
    if (orders.length) groups.push({ label: 'Orders', short: '#', items: orders.map(o => ({ title: o.number + ' · ' + o.customer, sub: o.city + ', ' + o.st + ' · ' + o.bundle + ' · ' + money(o.total), act: () => this.go('order', o.id) })) });
    const prods = (this.isAll() ? STORES : [st]).filter(s => !q || s.product.toLowerCase().includes(q) || 'product'.includes(q));
    if (prods.length) groups.push({ label: 'Products', short: 'P', items: prods.map(s => ({ title: s.product, sub: s.bundles.length + ' bundle options · Active · ' + s.name, act: () => this.go('products') })) });
    const screens = [['Home','home'],['Orders','orders'],['Products','products'],['Analytics','analytics'],['Live View','live'],['Meta','meta'],['Settings','settings']].filter(s => !q || s[0].toLowerCase().includes(q));
    if (screens.length) groups.push({ label: 'Go to', short: '→', items: screens.map(s => ({ title: s[0], sub: 'Screen', act: () => this.go(s[1]) })) });
    return groups;
  }
  baseVals() {
    const s = this.state, st = this.store(), route = s.route, all = this.isAll();
    const stop = e => e && e.stopPropagation && e.stopPropagation();
    const mine = this.storeOrders();
    const storeOf = o => STORES.find(x => x.id === o.store);
    const newCount = mine.filter(o => o.state === 'New').length, orderedCount = mine.filter(o => o.state === 'Ordered').length;
    const todayOrders = mine.filter(o => o.dayIndex === 0);
    const closeAll = { storeMenuOpen: false, bellOpen: false, filterOpen: false, sortMenuOpen: false, menuFor: null, moreMenuOpen: false, dateMenuOpen: false, soundPopOpen: false };
    const navKeys = ['home','orders','products','inventory','customers','marketing','analytics','live','meta','store','media','settings'];
    const activeKey = route.screen === 'order' ? 'orders' : route.screen === 'editor' ? 'store' : route.screen;
    const nav = {}, navShadow = {}, navRail = {};
    navKeys.forEach(k => { const a = k === activeKey; nav[k] = a ? 'var(--side-active)' : 'transparent'; navShadow[k] = a ? 'var(--shadow)' : 'none'; navRail[k] = a ? 'var(--side-rail)' : 'transparent'; });
    const isMobile = s.isMobile;
    const stores = all ? STORES : [st];
    const H = { today: HOURS0.today.slice(), yday: HOURS0.yday.slice() };
    const sales = todayOrders.reduce((a, o) => a + (o.payment === 'Paid' ? o.total : 0), 0);
    const ydaySales = H.yday.reduce((a, b) => a + b, 0);
    const sessions = st.sessions, conv = todayOrders.length / sessions * 100;
    const dp = (v, digits, suffix) => ({ up: v >= 0, str: (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(digits) + suffix });
    const dSales = dp((sales - ydaySales * 0.6) / (ydaySales * 0.6) * 100, 0, '%'), dOrders = dp(todayOrders.length - Math.round(todayOrders.length * 0.84), 0, ''), dConv = dp(-0.2, 1, ' pt');
    const metrics = [
      { label: 'Total sales', value: money0(sales), delta: dSales.str, up: dSales.up }, { label: 'Orders', value: String(todayOrders.length), delta: dOrders.str, up: dOrders.up },
      { label: 'Sessions', value: sessions.toLocaleString(), delta: '+11%', up: true }, { label: 'Conversion rate', value: conv.toFixed(2) + '%', delta: dConv.str, up: dConv.up }
    ].map(m => ({ ...m, arrow: m.up ? '▲' : '▼', color: m.up ? 'var(--success)' : 'var(--critical)' }));
    const rawSum = H.today.reduce((a, b) => a + b, 0) || 1;
    const scale = H.today.map((v, i) => H.today.slice(0, i + 1).reduce((a, b) => a + b, 0) * sales / rawSum);
    const yScale = H.yday.map((v, i) => H.yday.slice(0, i + 1).reduce((a, b) => a + b, 0));
    const maxV = Math.max(...yScale, ...scale) * 1.1 || 1;
    const X = i => (i / 23) * 800, Y = v => 178 - (v / maxV) * 170;
    const pathOf = arr => arr.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' ');
    const hi = s.chartHover;
    const chart = { todayPath: pathOf(scale), ydayPath: pathOf(yScale), areaPath: pathOf(scale) + ' L' + X(scale.length - 1).toFixed(1) + ' 179 L0 179 Z',
      tipX: hi >= 0 ? X(hi) : 0, tipLeft: hi >= 0 ? (hi / 23 * 100) + '%' : '0%', tipOpacity: hi >= 0 ? 1 : 0,
      tipLabel: hi >= 0 ? (hi % 12 || 12) + (hi < 12 ? ' AM' : ' PM') : '', tipToday: hi >= 0 ? (hi < scale.length ? money0(scale[hi]) : '—') : '', tipYday: hi >= 0 ? money0(yScale[hi]) : '' };
    const chargebacks = mine.filter(o => o.chargeback && o.state !== 'Refunded');
    const todos = [
      newCount && { count: newCount, strong: newCount + (newCount === 1 ? ' order' : ' orders'), rest: 'to place with supplier', iconBg: 'var(--b-warning-bg)', iconFg: 'var(--b-warning-fg)', open: () => this.setState({ ordersTab: 'New', page: 0 }, () => this.go('orders')) },
      orderedCount && { count: orderedCount, strong: orderedCount + (orderedCount === 1 ? ' order' : ' orders'), rest: 'awaiting tracking number', iconBg: 'var(--b-purple-bg)', iconFg: 'var(--b-purple-fg)', open: () => this.setState({ ordersTab: 'Ordered', page: 0 }, () => this.go('orders')) },
      chargebacks.length && { count: chargebacks.length, strong: chargebacks.length + ' chargeback', rest: 'needs evidence by ' + chargebacks[0].chargebackBy, iconBg: 'var(--b-critical-bg)', iconFg: 'var(--b-critical-fg)', open: () => this.go('order', chargebacks[0].id) }
    ].filter(Boolean);
    const rowOf = o => { const so = storeOf(o); return {
      id: o.id, number: o.number, customer: o.customer, date: o.date, dateLong: 'Sep 9, 2026 at ' + o.time, shipTo: o.city + ', ' + o.st, items: o.bundle + ' · ' + so.product, total: money(o.total),
      payment: o.payment, payKind: o.payment === 'Paid' ? 'success' : 'neutral', stateLabel: STATE_LABEL[o.state], stateKind: STATE_KIND[o.state], storeColor: so.color, storeName: so.name, storeInitial: so.initial, product: so.product, stripe: so.stripe, taxRate: (so.tax*100).toFixed(2) + '%',
      tracking: o.tracking || '—', chargeback: !!o.chargeback, open: e => { stop(e); this.go('order', o.id); } }; };
    const recentOrders = mine.slice(0, 6).map(rowOf);
    const filtered = this.filteredOrders();
    const PER = 25, pages = Math.max(1, Math.ceil(filtered.length / PER)), page = Math.min(s.page, pages - 1);
    const pageRows = filtered.slice(page * PER, page * PER + PER);
    const selectedIds = Object.keys(s.selected).filter(k => s.selected[k]);
    const orderRows = pageRows.map(o => ({ ...rowOf(o), selected: !!s.selected[o.id], rowBg: s.selected[o.id] ? 'var(--sel)' : 'transparent', menuOpen: s.menuFor === o.id,
      toggle: () => this.setState(x => ({ selected: { ...x.selected, [o.id]: !x.selected[o.id] } })),
      menu: e => { stop(e); this.setState({ menuFor: s.menuFor === o.id ? null : o.id }); },
      markOrdered: e => { stop(e); this.setState({ menuFor: null }); this.markOrdered(o.id); },
      addTracking: e => { stop(e); this.go('order', o.id); },
      print: e => { stop(e); this.setState({ menuFor: null }); this.toast('Packing slip for ' + o.number + ' sent to printer'); },
      refund: e => { stop(e); this.setState({ menuFor: null }); this.go('order', o.id); this.setState({ refundOpen: true }); } }));
    const tabs = ['All','New','Ordered','Fulfilled','Refunded'].map(k => ({ label: k === 'All' ? 'All' : STATE_LABEL[k], count: k === 'All' ? mine.length : mine.filter(o => o.state === k).length, bg: s.ordersTab === k ? 'var(--accent-soft)' : 'transparent', color: s.ordersTab === k ? 'var(--ink)' : 'var(--ink-2)', select: () => this.setState({ ordersTab: k, page: 0, selected: {} }) }));
    const sortOptions = [['date','Newest first','desc'],['date','Oldest first','asc'],['total','Total: high to low','desc'],['total','Total: low to high','asc'],['customer','Customer A–Z','asc']].map(([key,label,dir]) => ({ label, mark: s.sort.key === key && s.sort.dir === dir ? '✓' : '', bg: s.sort.key === key && s.sort.dir === dir ? 'var(--accent-soft)' : 'transparent', select: () => this.setState({ sort: { key, dir }, sortMenuOpen: false }) }));
    const sortMark = {}; ['number','date','customer','total'].forEach(k => sortMark[k] = s.sort.key === k ? (s.sort.dir === 'asc' ? '↑' : '↓') : '');
    const sortBy = key => () => this.setState(x => ({ sort: { key, dir: x.sort.key === key && x.sort.dir === 'desc' ? 'asc' : 'desc' } }));
    const filterCount = ['payment','bundle','date'].filter(k => s.filters[k]).length;
    const ordersEmpty = filtered.length === 0, hasFilters = !!(s.ordersQuery || filterCount || s.ordersTab !== 'All');
    const cur = route.screen === 'order' ? s.orders.find(o => o.id === route.id) : null;
    let o = {}, timeline = [], evidence = [];
    if (cur) {
      const custOrders = s.orders.filter(x => x.customer === cur.customer && x.store === cur.store).length;
      o = { ...rowOf(cur), bundle: cur.bundle, priceStr: money(cur.price), subtotalStr: money(cur.subtotal), taxStr: money(cur.tax), totalStr: money(cur.total), ref: cur.ref, source: cur.source, campaign: cur.campaign, eventId: cur.eventId,
        email: cur.email, phone: cur.phone, address: cur.address, city: cur.city, st: cur.st, zip: cur.zip, carrier: cur.carrier, hasUpsell: cur.hasUpsell,
        isNew: cur.state === 'New', canFulfill: cur.state === 'New' || cur.state === 'Ordered', isFulfilled: cur.state === 'Fulfilled', isRefunded: cur.state === 'Refunded', refundOpacity: cur.state === 'Refunded' ? .5 : 1,
        chargeback: !!cur.chargeback && cur.state !== 'Refunded', chargebackBy: cur.chargebackBy, chargebackReason: cur.chargebackReason, orderCountText: custOrders === 1 ? 'First order' : custOrders + ' orders' };
      timeline = [...cur.timeline].reverse().map(e => ({ ...e, color: e.color || 'var(--ink)' }));
      evidence = [['Order details', cur.number + ' · ' + money(cur.total)], ['Tracking number', cur.tracking || 'Added when fulfilled'], ['Delivery confirmation', cur.state === 'Fulfilled' ? 'Carrier scan on file' : 'Pending carrier scan'], ['Customer communications', 'Order + shipping emails to ' + cur.email], ['Billing/shipping match', 'AVS matched · ' + cur.city + ', ' + cur.st]].map(([label, value]) => ({ label, value }));
    }
    const pal = this.paletteResults(); let flat = []; pal.forEach(g => g.items.forEach(it => flat.push(it)));
    const pIdx = Math.min(s.paletteIdx, Math.max(0, flat.length - 1)); let k = 0;
    const paletteGroups = pal.map(g => ({ ...g, items: g.items.map(it => { const i = k++; return { ...it, bg: i === pIdx ? 'var(--accent-soft)' : 'transparent', hintOpacity: i === pIdx ? 1 : 0, go: it.act, hover: () => this.setState({ paletteIdx: i }) }; }) }));
    const notifications = [];
    const stubTitles = {};
    const gotoStore = id => () => this.setState({ storeId: id, storeMenuOpen: false, drawerOpen: false, selected: {}, page: 0, route: route.screen === 'order' ? { screen: 'orders' } : route });
    const storeRows = STORES.map(x => { const to = s.orders.filter(q => q.store === x.id && q.dayIndex === 0); const sl = to.reduce((a, q) => a + (q.payment === 'Paid' ? q.total : 0), 0); return { name: x.name, color: x.color, sales: money0(sl), orders: to.length, sessions: x.sessions.toLocaleString(), conv: (to.length / x.sessions * 100).toFixed(2) + '%', select: gotoStore(x.id) }; });
    const isLive = route.screen === 'live';
    return {
      stop, stopPrevent: e => { e.preventDefault(); stop(e); }, isMobile, notMobile: !isMobile, showSidebar: !isMobile && !s.fullscreen && route.screen !== 'editor', notFullscreen: !s.fullscreen, drawerOpen: s.drawerOpen, openDrawer: () => this.setState({ drawerOpen: true }), closeDrawer: () => this.setState({ drawerOpen: false }),
      pagePad: (isLive || route.screen === 'editor') ? '0' : isMobile ? '16px' : '20px 24px 40px', mainOverflow: (isLive || route.screen === 'editor') ? 'hidden' : 'auto', homeCols: isMobile ? '1fr' : 'minmax(0,1fr) 300px', detailCols: isMobile ? '1fr' : 'minmax(0,1fr) 300px', recentCols: isMobile ? '72px 1fr 70px auto' : '84px 1.2fr 1.6fr 90px 150px',
      store: st, isAll: all, storeRows, storeOptions: [ALL, ...STORES].map(x => {
        const os = x.id === 'all' ? s.orders.filter(q => q.dayIndex === 0) : s.orders.filter(q => q.store === x.id && q.dayIndex === 0);
        const rev = os.reduce((a, q) => a + (q.payment === 'Paid' ? q.total : 0), 0);
        const cb = s.orders.some(q => q.chargeback && q.state !== 'Refunded' && (x.id === 'all' || q.store === x.id));
        const health = cb ? '#F59E0B' : '#22C55E';
        return { ...x, active: x.id === s.storeId, bg: x.id === s.storeId ? 'var(--accent-soft)' : 'transparent', select: gotoStore(x.id),
          revenue: money0(rev), orderCount: os.length + (os.length === 1 ? ' order' : ' orders'),
          health, healthRing: cb ? 'rgba(245,158,11,.2)' : 'rgba(34,197,94,.18)', healthLabel: cb ? 'Needs attention · open chargeback' : 'Healthy' };
      }),
      storeMenuOpen: s.storeMenuOpen, toggleStoreMenu: () => this.setState({ ...closeAll, storeMenuOpen: !s.storeMenuOpen }),
      nav, navShadow, navRail, hasNew: newCount > 0, newCount,
      goHome: () => this.go('home'), goOrders: e => { if (e && e.preventDefault) e.preventDefault(); this.go('orders'); }, goProducts: () => this.go('products'), goAnalytics: () => this.go('analytics'), goMeta: () => this.go('meta'), goLive: () => this.go('live'), goStore: () => this.go('store'), goEditor: e => { stop(e); this.go('editor'); }, goMedia: () => this.go('media'), goSettings: () => this.go('settings'),
      bellOpen: s.bellOpen, toggleBell: () => this.setState({ ...closeAll, bellOpen: !s.bellOpen }), notifications,
      closeMenus: () => { if (s.storeMenuOpen || s.bellOpen || s.filterOpen || s.sortMenuOpen || s.menuFor || s.moreMenuOpen || s.dateMenuOpen || s.soundPopOpen) this.setState(closeAll); },
      saveBar: s.dirty, discardChanges: () => this.setState({ dirty: false, general: null }), saveChanges: () => { this.setState({ dirty: false }); this.toast('Saved'); },
      isHome: route.screen === 'home', homeRange: s.homeRange, dateMenuOpen: s.dateMenuOpen, toggleDateMenu: e => { stop(e); this.setState({ ...closeAll, dateMenuOpen: !s.dateMenuOpen }); },
      homeRanges: ['Today','Yesterday','Last 7 days'].map(r => ({ label: r, bg: r === s.homeRange ? 'var(--accent-soft)' : 'transparent', select: () => this.setState({ homeRange: r, dateMenuOpen: false }) })),
      metrics, chart, yTop: money0(maxV), yMid2: money0(maxV * 2 / 3), yMid: money0(maxV / 3),
      chartMove: e => { const r = e.currentTarget.getBoundingClientRect(); const i = Math.round((e.clientX - r.left) / r.width * 23); if (i !== s.chartHover) this.setState({ chartHover: Math.max(0, Math.min(23, i)) }); }, chartLeave: () => this.setState({ chartHover: -1 }),
      todos, recentOrders, capi: todayOrders.length + '/' + todayOrders.length, pixelRows: stores.map(x => ({ label: 'Pixel firing · ' + x.name, value: x.pixel })),
      statusRows: [...stores.map(x => ({ text: x.domain + ' · SSL active', open: () => { this.setState({ settingsTab: 'Domains' }); this.go('settings'); } })), ...stores.map(x => ({ text: 'Stripe connected · ' + x.stripe, open: () => { this.setState({ settingsTab: 'Payments' }); this.go('settings'); } }))],
      isOrders: route.screen === 'orders', tabs, ordersQuery: s.ordersQuery, setOrdersQuery: e => this.setState({ ordersQuery: e.target.value, page: 0 }),
      filterOpen: s.filterOpen, toggleFilter: e => { stop(e); this.setState({ ...closeAll, filterOpen: !s.filterOpen }); }, filterCount, filters: s.filters,
      setFilterPayment: e => this.setState({ filters: { ...s.filters, payment: e.target.value }, page: 0 }), setFilterBundle: e => this.setState({ filters: { ...s.filters, bundle: e.target.value }, page: 0 }), setFilterDate: e => this.setState({ filters: { ...s.filters, date: e.target.value }, page: 0 }),
      clearFilters: () => this.setState({ filters: { payment: '', bundle: '', date: '' } }), clearAllOrderFilters: () => this.setState({ filters: { payment: '', bundle: '', date: '' }, ordersQuery: '', ordersTab: 'All' }),
      bundleNames: [...new Set(stores.flatMap(x => x.bundles.map(b => b.label)))], sortMenuOpen: s.sortMenuOpen, toggleSortMenu: e => { stop(e); this.setState({ ...closeAll, sortMenuOpen: !s.sortMenuOpen }); }, sortOptions, sortMark,
      sortByNumber: sortBy('number'), sortByDate: sortBy('date'), sortByCustomer: sortBy('customer'), sortByTotal: sortBy('total'),
      saveView: () => this.toast('View saved as “' + (s.ordersTab === 'All' ? 'All orders' : STATE_LABEL[s.ordersTab]) + (s.ordersQuery ? ' · ' + s.ordersQuery : '') + '”'),
      hasSelection: selectedIds.length > 0, selectedCount: selectedIds.length, clearSelection: () => this.setState({ selected: {} }),
      allSelected: pageRows.length > 0 && pageRows.every(r => s.selected[r.id]), toggleAll: () => { const allSel = pageRows.every(r => s.selected[r.id]); const sel = { ...s.selected }; pageRows.forEach(r => sel[r.id] = !allSel); this.setState({ selected: sel }); },
      bulkOrdered: () => { let n = 0; this.setState(x => ({ orders: x.orders.map(q => { if (x.selected[q.id] && q.state === 'New') { n++; return { ...q, state: 'Ordered', timeline: [...q.timeline, { t: this.now(), text: 'Marked as ordered with supplier (bulk)', dot: 'var(--link)' }] }; } return q; }), selected: {} }), () => this.toast(n + (n === 1 ? ' order' : ' orders') + ' marked as ordered with supplier')); },
      ordersEmpty, emptyTitle: hasFilters ? 'No orders match' : 'No orders yet', emptyBody: hasFilters ? 'Try a different search or clear the filters.' : 'Orders from ' + st.domain + ' will appear here the moment a customer pays.',
      showOrdersTable: !ordersEmpty && !isMobile, showOrdersCards: !ordersEmpty && isMobile, orderRows,
      pageInfo: filtered.length ? (page * PER + 1) + '–' + Math.min(filtered.length, (page + 1) * PER) + ' of ' + filtered.length : '0 orders', noPrev: page === 0, noNext: page >= pages - 1, prevOpacity: page === 0 ? .4 : 1, nextOpacity: page >= pages - 1 ? .4 : 1,
      prevPage: () => this.setState({ page: Math.max(0, page - 1) }), nextPage: () => this.setState({ page: Math.min(pages - 1, page + 1) }),
      exportOpen: s.exportOpen, openExport: () => this.setState({ exportOpen: true, exportScope: 'page' }), openExportSelected: () => this.setState({ exportOpen: true, exportScope: 'selected' }), closeExport: () => this.setState({ exportOpen: false }),
      exportScopes: [['page','Current page (' + pageRows.length + ')'],['all','All orders (' + mine.length + ')'],['selected', selectedIds.length + ' selected']].filter(x => x[0] !== 'selected' || selectedIds.length).map(([kk, label]) => ({ label, checked: s.exportScope === kk, select: () => this.setState({ exportScope: kk }) })),
      confirmExport: () => { this.setState({ exportOpen: false }); this.toast('Export started · you’ll get an email at ops@' + (all ? 'kneelwell.com' : st.domain)); },
      createOrder: () => this.toast('Draft orders are created from the storefront in this build'),
      isOrder: !!cur, o, timeline, evidence, trackingInput: s.trackingInput, setTracking: e => this.setState({ trackingInput: e.target.value }), carrier: s.carrier, setCarrier: e => this.setState({ carrier: e.target.value }),
      noTracking: !s.trackingInput.trim(), fulfillOpacity: s.trackingInput.trim() ? 1 : .5, fulfill: () => cur && s.trackingInput.trim() && this.fulfill(cur.id, s.trackingInput.trim(), s.carrier), markOrdered: () => cur && this.markOrdered(cur.id),
      resendTracking: () => this.toast('Tracking sent to customer'), submitEvidence: () => { this.updateOrder(cur.id, q => { q.chargeback = false; q.timeline.push({ t: this.now(), text: 'Chargeback evidence submitted to Stripe · 5 documents', dot: '#22C55E' }); return q; }); this.toast('Evidence submitted to Stripe'); },
      comment: s.comment, setComment: e => this.setState({ comment: e.target.value }), commentKey: e => { if (e.key === 'Enter' && s.comment.trim()) { this.updateOrder(cur.id, q => { q.timeline.push({ t: this.now(), text: 'AK: ' + s.comment.trim(), dot: 'var(--link)' }); return q; }); this.setState({ comment: '' }); } },
      postComment: () => { if (s.comment.trim()) { this.updateOrder(cur.id, q => { q.timeline.push({ t: this.now(), text: 'AK: ' + s.comment.trim(), dot: 'var(--link)' }); return q; }); this.setState({ comment: '' }); } },
      moreMenuOpen: s.moreMenuOpen, toggleMoreMenu: e => { stop(e); this.setState({ ...closeAll, moreMenuOpen: !s.moreMenuOpen }); },
      printSlip: () => { this.setState(closeAll); this.toast('Packing slip sent to printer'); }, resendConfirmation: () => { this.setState(closeAll); this.toast('Order confirmation resent to ' + (cur && cur.email)); }, copyOrderLink: () => { this.setState(closeAll); this.toast('Order link copied'); }, viewOnStripe: () => { this.setState(closeAll); this.toast('Opening ' + (cur && cur.ref) + ' in Stripe'); },
      noteEditing: s.noteEditing, noteViewing: !s.noteEditing, noteEditLabel: s.noteEditing ? 'Save' : 'Edit', noteDraft: s.noteDraft, setNoteDraft: e => this.setState({ noteDraft: e.target.value }),
      toggleNoteEdit: () => { if (s.noteEditing) { this.updateOrder(cur.id, q => { q.note = s.noteDraft; return q; }); this.setState({ noteEditing: false }); this.toast('Saved'); } else this.setState({ noteEditing: true, noteDraft: cur.note || '' }); },
      noteText: cur && cur.note ? cur.note : 'No notes from customer', noteColor: cur && cur.note ? 'var(--ink)' : 'var(--ink-2)',
      refundOpen: s.refundOpen, openRefund: () => cur && cur.state !== 'Refunded' && this.setState({ refundOpen: true }), closeRefund: () => this.setState({ refundOpen: false }), refundReason: s.refundReason, setRefundReason: e => this.setState({ refundReason: e.target.value }), confirmRefund: () => cur && this.refund(cur.id, s.refundReason),
      isStub: !!stubTitles[route.screen], stubTitle: stubTitles[route.screen] || '',
      paletteOpen: s.paletteOpen, openPalette: () => this.setState({ paletteOpen: true, paletteQuery: '', paletteIdx: 0 }, () => this.paletteRef.current && this.paletteRef.current.focus()), closePalette: () => this.setState({ paletteOpen: false }), paletteRef: this.paletteRef,
      paletteQuery: s.paletteQuery, setPaletteQuery: e => this.setState({ paletteQuery: e.target.value, paletteIdx: 0 }), paletteGroups, paletteEmpty: flat.length === 0,
      paletteKey: e => { if (e.key === 'ArrowDown') { e.preventDefault(); this.setState({ paletteIdx: Math.min(flat.length - 1, pIdx + 1) }); } else if (e.key === 'ArrowUp') { e.preventDefault(); this.setState({ paletteIdx: Math.max(0, pIdx - 1) }); } else if (e.key === 'Enter' && flat[pIdx]) flat[pIdx].act(); },
      confirm: s.confirm ? { ...s.confirm, bg: s.confirm.critical ? 'var(--critical)' : 'var(--accent)', go: () => { const f = s.confirm.onConfirm; this.setState({ confirm: null }); f && f(); } } : null, closeConfirm: () => this.setState({ confirm: null }),
      toast: s.toast, dismissToast: () => this.setState({ toast: null }),
      _ctx: { st, all, stores, mine, todayOrders, isMobile, closeAll, stop, sales, ydaySales, isLive, route, storeOf }
    };
  }
  unmountExtras() { clearInterval(this._sim); clearInterval(this._roll); }
  async loadMap() {
    for (let i = 0; i < 60 && !(window.d3 && window.topojson); i++) await new Promise(r => setTimeout(r, 100));
    if (!(window.d3 && window.topojson)) return;
    try {
      const topo = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json').then(r => r.json());
      const fc = window.topojson.feature(topo, topo.objects.countries);
      const usa = fc.features.find(f => f.id === '840' || (f.properties && f.properties.name === 'United States of America'));
      if (!usa) return;
      const proj = window.d3.geoAlbersUsa().fitSize([780, 400], usa);
      this.proj = p => { const q = proj(p); return q ? { x: q[0] + 10, y: q[1] + 10 } : null; };
      this.setState({ usPath: window.d3.geoPath(proj)(usa).split('M').map((s,i)=>i?'M'+s:s).join(''), mapReady: true });
      this._shift = true;
    } catch (e) {}
  }
  pushFeed(ev) {
    this.setState(s => {
      const id = s.feedSeq + 1;
      return { feedSeq: id, liveFeed: [{ ...ev, id, t: this.clock() }, ...s.liveFeed].slice(0, 40) };
    });
  }
  clock() { const d = new Date(); return (d.getHours() % 12 || 12) + ':' + String(d.getMinutes()).padStart(2,'0') + ':' + String(d.getSeconds()).padStart(2,'0'); }
  landOrder(storeId, city, ad) {
    const o = this.createLiveOrder(storeId, city, ad);
    const st = STORES.find(x => x.id === storeId);
    this.pushFeed({ type: 'purchase', store: st, city, bundle: o.bundle, ad, amount: o.total, orderId: o.id, number: o.number });
    this.setState(s => ({ liveFunnel: { ...s.liveFunnel, purchased: s.liveFunnel.purchased + 1 } }));
    const pt = this.proj && this.proj([city[2], city[3]]);
    if (pt) {
      const pid = null && 'p';
      this.setState(s => ({ livePulses: [...s.livePulses, { id: pid, x: Math.round(pt.x), y: Math.round(pt.y), ty: Math.round(pt.y) - 12, amount: '+' + money(o.total) }] }));
      setTimeout(() => this.setState(s => ({ livePulses: s.livePulses.filter(p => p.id !== pid) })), 2400);
    }
    if (this.state.soundOn) this.chaching();
    return o;
  }
  extraVals(v) {
    const s = this.state, c = v._ctx, st = c.st, stores = c.stores, isM = c.isMobile;
    const todayOrders = c.todayOrders, sales = c.sales;
    const sessions = st.sessions, orders = todayOrders.length;
    const aov = orders ? sales / orders : 0;
    if (Math.abs(s.salesDisplay - sales) > 0.5) {
      clearInterval(this._roll);
      this._roll = setInterval(() => {
        this.setState(x => { const d = sales - x.salesDisplay; if (Math.abs(d) < 1) { clearInterval(this._roll); return { salesDisplay: sales }; } return { salesDisplay: x.salesDisplay + d * 0.18 }; });
      }, 40);
    }
    const maxBar = Math.max(...s.liveHistory, 10);
    const visitorBars = s.liveHistory.map((h, i) => ({ h: Math.max(3, Math.round(h / maxBar * 38)) + 'px', color: i >= s.liveHistory.length - 2 ? '#A78BFA' : 'rgba(167,139,250,.42)' }));
    const H = HOURS0.today.slice();
    const cum = H.map((x, i) => H.slice(0, i + 1).reduce((a, b) => a + b, 0));
    const mx = Math.max(...cum) || 1;
    const spark = cum.map((x, i) => [(i / (cum.length - 1)) * 120, 32 - (x / mx) * 28]);
    const sparkPath = spark.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const cityCounts = {};
    todayOrders.forEach(o => { cityCounts[o.city + ', ' + o.st] = (cityCounts[o.city + ', ' + o.st] || 0) + 1; });
    const topLoc = Object.entries(cityCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const maxLoc = topLoc.length ? topLoc[0][1] : 1;
    const adAgg = {};
    todayOrders.forEach(o => { const k = o.source; adAgg[k] = adAgg[k] || { sales: 0, n: 0 }; adAgg[k].sales += o.total; adAgg[k].n++; });
    const topAds = Object.entries(adAgg).sort((a, b) => b[1].sales - a[1].sales).slice(0, 5);
    const maxAd = topAds.length ? topAds[0][1].sales : 1;
    const pageBase = [['/ · Home', .34], ['/products/' + (stores[0].product.split(' ')[0].toLowerCase()), .41], ['/checkout', .17], ['/thank-you', .08]];
    const maxPage = Math.max(...pageBase.map(p => p[1]));
    const f = s.liveFunnel, fMax = Math.max(f.viewing, 1);
    const feedMeta = { view: ['#7CC4FF', 'Viewing product'], cart: ['#FFD666', 'Added to cart'], checkout: ['#A78BFA', 'Checking out'], purchase: ['#4ADE80', 'Purchased'] };
    const visibleFeed = s.liveFeed.filter(e => this.isAll() || e.store.id === st.id);
    const dots = [];
    if (this.proj) CITIES.forEach((ct, i) => { const p = this.proj([ct[2], ct[3]]); if (p) dots.push({ x: Math.round(p.x), y: Math.round(p.y), r: 2.5 + (i % 4), o: 0.25 + ((i * 7) % 5) / 10 }); });
    return {
      isLive: c.isLive, liveCols: isM ? '1fr' : 'minmax(0,1fr) 330px', liveTopCols: isM ? '1fr' : '1fr 1fr', liveListCols: isM ? '1fr' : 'repeat(3,minmax(0,1fr))',
      liveVisitors: s.liveVisitors, visitorBars, liveSalesRoll: money0(s.salesDisplay), liveSalesDelta: '+18%', sparkPath, sparkArea: sparkPath + ' L120 34 L0 34 Z',
      liveStoreValue: s.storeId, setLiveStore: e => this.setState({ storeId: e.target.value, selected: {}, page: 0 }), liveStoreLabel: this.isAll() ? 'Across 3 stores' : st.domain,
      liveStats: [ { label: 'Sessions', value: sessions.toLocaleString(), sub: 'today' }, { label: 'Orders', value: String(orders), sub: 'today' },
        { label: 'Conversion rate', value: (orders / sessions * 100).toFixed(2) + '%', sub: 'sessions → paid' }, { label: 'AOV', value: money0(aov), sub: 'average order value' } ],
      funnel: [ { label: 'Viewing', count: f.viewing, width: '100%', color: '#7CC4FF', note: 'on product pages' },
        { label: 'Added to cart', count: f.cart, width: Math.round(f.cart / fMax * 100) + '%', color: '#FFD666', note: 'carts with items' },
        { label: 'Checking out', count: f.checkout, width: Math.round(f.checkout / fMax * 100) + '%', color: '#A78BFA', note: 'reached checkout' },
        { label: 'Purchased', count: f.purchased, width: Math.round(f.purchased / fMax * 100) + '%', color: '#4ADE80', note: 'since you opened this' } ],
      liveLists: [
        { title: 'Top pages', unit: 'sessions', rows: pageBase.map(p => ({ label: p[0], bar: Math.round(p[1] / maxPage * 100) + '%', value: Math.round(sessions * p[1]).toLocaleString() })) },
        { title: 'Top locations', unit: 'orders', rows: topLoc.length ? topLoc.map(l => ({ label: l[0], bar: Math.round(l[1] / maxLoc * 100) + '%', value: String(l[1]) })) : [{ label: 'No orders yet today', bar: '0%', value: '0' }] },
        { title: 'Top ads', unit: 'sales', rows: topAds.length ? topAds.map(a => ({ label: a[0], bar: Math.round(a[1].sales / maxAd * 100) + '%', value: money0(a[1].sales) })) : [{ label: 'No attributed sales yet', bar: '0%', value: '$0' }] }
      ],
      usPath: s.usPath, mapDots: dots, mapPulses: s.livePulses, mapNote: s.mapReady ? CITIES.length + ' active regions' : 'loading map…',
      feed: visibleFeed.map(e => { const m = feedMeta[e.type]; const purchase = e.type === 'purchase'; return {
          id: e.id, time: e.t, color: m[0], title: m[1] + ' · ' + e.city[0] + ', ' + e.city[1], sub: e.store.name + ' · ' + e.bundle + (e.ad && e.ad !== 'Direct' ? ' · ad ' + e.ad : ' · direct'),
          amount: purchase ? '+' + money(e.amount) : '', bg: purchase ? 'rgba(74,222,128,.09)' : 'transparent', cursor: purchase ? 'pointer' : 'default',
          open: purchase ? () => this.go('order', e.orderId) : () => {} }; }),
      feedCount: visibleFeed.length,
      soundOn: s.soundOn, soundPopOpen: s.soundPopOpen, toggleSoundPop: e => { c.stop(e); this.setState({ soundPopOpen: !s.soundPopOpen }); },
      toggleSound: () => this.setState({ soundOn: !s.soundOn }, () => { if (this.state.soundOn) this.chaching(); }),
      soundTrack: s.soundOn ? '#4ADE80' : 'rgba(255,255,255,.18)', soundKnob: s.soundOn ? '13px' : '2px',
      volume: s.volume, volumePct: s.volume + '%', setVolume: e => this.setState({ volume: Number(e.target.value) }), previewSound: () => this.chaching(),
      simulateOrder: () => { const stx = this.isAll() ? STORES[Math.floor(Math.random()*STORES.length)] : st; const city = CITIES[Math.floor(Math.random()*CITIES.length)]; const o = this.landOrder(stx.id, city, stx.ads[Math.floor(Math.random()*stx.ads.length)]); this.toast('Test order ' + o.number + ' · ' + money(o.total) + ' · ' + city[0] + ', ' + city[1]); },
      toggleFullscreen: () => this.setState({ fullscreen: !s.fullscreen }), fullscreenLabel: s.fullscreen ? 'Exit full screen' : 'Full screen'
    };
  }
  initExtras() {
    this.globeRef = React.createRef();
    this.landPts = null; this.effects = []; this.rot = { lam: 98, phi: 38 }; this.zoom = 1;
    const hits = {};
    STORES.forEach(st => {
      const os = this.state.orders.filter(o => o.store === st.id && o.dayIndex === 0);
      const pages = {}, ads = {}, cities = {};
      os.forEach(o => { ads[o.source] = (ads[o.source] || 0) + o.total; cities[o.city + ', ' + o.st] = (cities[o.city + ', ' + o.st] || 0) + 1; });
      hits[st.id] = { pages, ads, cities, sessions: 0, cart: 0, checkout: 0 };
    });
    const visitors = [];
    Object.assign(this.state, { hits, visitors, vHistory: new Array(20).fill(0), liveFeed: [], feedSeq: 0,
      salesDisplay: 0, soundOn: true, volume: 60, soundPopOpen: false, globeFloats: [], globeTick: 0, products: [], draft: null, pQuery: '', pStatus: '' });
  }
  mountExtras() {

    this.startGlobe();
    this.timers = [];
    const loop = (fn, lo, hi) => { const t = setTimeout(() => { fn(); loop(fn, lo, hi); }, rand(lo, hi) * 1000); this.timers.push(t); };
    this._hist = setInterval(() => this.setState(s => ({ vHistory: [...s.vHistory.slice(1), s.visitors.length] })), 30000);
    this._prune = setInterval(() => this.setState(s => ({ visitors: s.visitors.filter(v => v.stage === 'done' ? Date.now() - v.born < 20000 : (Date.now() - v.born < 150000 || v.stage !== 'view')).slice(-70) })), 15000);
  }
  unmountExtras() { (this.demoT || []).forEach(clearTimeout); (this.timers || []).forEach(clearTimeout); clearInterval(this._hist); clearInterval(this._prune); clearInterval(this._roll); cancelAnimationFrame(this._raf); }
  scopeStores() { return this.isAll() ? STORES : [this.store()]; }
  bump(storeId, fn) { this.setState(s => { const h = { ...s.hits }; h[storeId] = fn({ ...h[storeId] }); return { hits: h }; }); }
  evView() {
    const st = pick(this.scopeStores()), city = pick(CITIES), path = pick(PATHS[st.id].slice(0, 3)), ad = pick(st.ads);
    const v = { id: 'v' + Date.now() + Math.random().toFixed(3), store: st.id, city, stage: 'view', born: Date.now(), ad };
    this.setState(s => ({ visitors: [...s.visitors, v].slice(-90) }));
    this.bump(st.id, h => { h.pages = { ...h.pages, [path]: (h.pages[path] || 0) + 1 }; h.sessions++; h.cities = { ...h.cities }; return h; });
    this.effects.push({ type: 'new', lon: city[2], lat: city[3], born: performance.now() });
    this.pushFeed({ type: 'view', store: st, city, bundle: path, ad });
  }
  evCart() {
    const cands = this.state.visitors.filter(v => v.stage === 'view' && this.scopeStores().some(s => s.id === v.store));
    if (!cands.length) return; const v = pick(cands), st = STORES.find(x => x.id === v.store), b = pick(st.bundles);
    this.setState(s => ({ visitors: s.visitors.map(x => x.id === v.id ? { ...x, stage: 'cart', bundle: b.label } : x) }));
    this.bump(st.id, h => { h.cart++; return h; });
    this.pushFeed({ type: 'cart', store: st, city: v.city, bundle: b.label, ad: v.ad || pick(st.ads) });
  }
  evCheckout() {
    const cands = this.state.visitors.filter(v => v.stage === 'cart' && this.scopeStores().some(s => s.id === v.store));
    if (!cands.length) return; const v = pick(cands), st = STORES.find(x => x.id === v.store);
    this.setState(s => ({ visitors: s.visitors.map(x => x.id === v.id ? { ...x, stage: 'checkout' } : x) }));
    this.bump(st.id, h => { h.checkout++; return h; });
    this.pushFeed({ type: 'checkout', store: st, city: v.city, bundle: v.bundle || pick(st.bundles).label, ad: v.ad || pick(st.ads) });
  }
  evPurchase() {
    const cands = this.state.visitors.filter(v => v.stage === 'checkout' && this.scopeStores().some(s => s.id === v.store));
    const v = cands.length ? pick(cands) : null;
    const st = v ? STORES.find(x => x.id === v.store) : pick(this.scopeStores());
    const city = v ? v.city : pick(CITIES);
    this.landOrder(st.id, city, v && v.ad ? v.ad : pick(st.ads));
    if (v) this.setState(s => ({ visitors: s.visitors.map(x => x.id === v.id ? { ...x, stage: 'done', born: Date.now() } : x) }));
  }
  pushFeed(ev) { this.setState(s => { const id = s.feedSeq + 1; return { feedSeq: id, liveFeed: [{ ...ev, id, t: this.clock() }, ...s.liveFeed].slice(0, 60) }; }); }
  clock() { const d = new Date(); return (d.getHours() % 12 || 12) + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0'); }
  landOrder(storeId, city, ad) {
    const o = this.createLiveOrder(storeId, city, ad), st = STORES.find(x => x.id === storeId);
    this.pushFeed({ type: 'purchase', store: st, city, bundle: o.bundle, ad, amount: o.total, orderId: o.id, number: o.number });
    this.bump(storeId, h => { h.ads = { ...h.ads, [ad]: (h.ads[ad] || 0) + o.total }; h.cities = { ...h.cities, [city[0] + ', ' + city[1]]: (h.cities[city[0] + ', ' + city[1]] || 0) + 1 }; return h; });
    this.effects.push({ type: 'purchase', lon: city[2], lat: city[3], born: performance.now() });
    const scr = this.project(city[2], city[3]);
    if (scr && scr.vis) {
      const fid = 'f' + Date.now() + Math.random();
    }
    if (this.state.soundOn) this.chaching();
    return o;
  }
  project(lon, lat) {
    const cv = this.globeRef && this.globeRef.current; if (!cv) return null;
    const w = cv.clientWidth, h = cv.clientHeight, R = Math.min(w, h) * 0.42 * this.zoom;
    const D = Math.PI / 180, lamR = (lon + this.rot.lam) * D, phiR = lat * D, t = this.rot.phi * D;
    const x1 = Math.cos(phiR) * Math.sin(lamR), y1 = Math.sin(phiR), z1 = Math.cos(phiR) * Math.cos(lamR);
    const y2 = y1 * Math.cos(t) - z1 * Math.sin(t), z2 = y1 * Math.sin(t) + z1 * Math.cos(t);
    const x = w / 2 + x1 * R, y = h / 2 - y2 * R;
    return { x, y, z: z2, vis: z2 > 0, pct: { x: (x / w) * 100, y: (y / h) * 100 } };
  }
  extraVals(v) {
    const s = this.state, c = v._ctx, st = c.st, stores = c.stores, isM = c.isMobile;
    const todayOrders = c.todayOrders, sales = c.sales;
    const scoped = this.isAll() ? null : s.storeId;
    const hitsFor = stores.map(x => s.hits[x.id]);
    const sessions = stores.reduce((a, x) => a + x.sessions, 0) + hitsFor.reduce((a, h) => a + h.sessions, 0);
    const orders = todayOrders.length, aov = orders ? sales / orders : 0;
    if (Math.abs(s.salesDisplay - sales) > 0.5) {
      clearInterval(this._roll);
      this._roll = setInterval(() => this.setState(x => { const d = sales - x.salesDisplay; if (Math.abs(d) < 1) { clearInterval(this._roll); return { salesDisplay: sales }; } return { salesDisplay: x.salesDisplay + d * 0.16 }; }), 40);
    }
    const visitorsNow = s.visitors.filter(x => x.stage !== 'done' && (!scoped || x.store === scoped)).length;
    const hist = [...s.vHistory.slice(1), visitorsNow], maxBar = Math.max(...hist, 10);
    const visitorBars = hist.map((hh, i) => ({ h: Math.max(3, Math.round(hh / maxBar * 38)) + 'px', color: i >= hist.length - 2 ? '#A78BFA' : 'rgba(167,139,250,.42)' }));
    const H = HOURS0.today.slice();
    const cum = H.map((x, i) => H.slice(0, i + 1).reduce((a, b) => a + b, 0)), mx = Math.max(...cum) || 1;
    const sparkPath = cum.map((x, i) => (i ? 'L' : 'M') + ((i / (cum.length - 1)) * 120).toFixed(1) + ' ' + (32 - (x / mx) * 28).toFixed(1)).join(' ');
    const agg = key => { const m = {}; hitsFor.forEach(h => Object.entries(h[key]).forEach(([k, n]) => m[k] = (m[k] || 0) + n)); return m; };
    const pages = agg('pages'), cities = agg('cities'), ads = agg('ads');
    const rows = (obj, fmt, unitMax) => { const e = Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, 5); const m = e.length ? Math.max(...e.map(x => x[1])) || 1 : 1;
      return e.length ? e.map(x => ({ label: x[0], bar: Math.round(x[1] / m * 100) + '%', value: fmt(x[1]) })) : [{ label: 'Nothing yet today', bar: '0%', value: fmt(0) }]; };
    const cartN = hitsFor.reduce((a, h) => a + h.cart, 0), checkoutN = hitsFor.reduce((a, h) => a + h.checkout, 0);
    const fMax = Math.max(visitorsNow, cartN, checkoutN, orders, 1);
    const feedMeta = { view: ['#7CC4FF', 'Viewing'], cart: ['#FFD666', 'Added to cart'], checkout: ['#A78BFA', 'Checking out'], purchase: ['#4ADE80', 'Purchased'] };
    const visibleFeed = s.liveFeed.filter(e => !scoped || e.store.id === scoped);
    return {
      isLive: c.isLive, liveCols: isM ? '1fr' : 'minmax(0,1fr) 330px', liveTopCols: (typeof window !== 'undefined' && window.innerWidth < 1180) ? '1fr' : '1fr 1fr', liveListCols: (typeof window !== 'undefined' && window.innerWidth < 1180) ? '1fr' : 'repeat(3,minmax(0,1fr))',
      globeRef: this.globeRef, globeH: isM ? '340px' : '480px', globeFloats: s.globeFloats,
      globeNote: visitorsNow + ' visitors · ' + Object.keys(cities).length + ' cities today',
      globeDown: e => { this.dragging = true; const sx = e.clientX, sy = e.clientY, l0 = this.rot.lam, p0 = this.rot.phi;
        const mv = ev => { ev.preventDefault(); this.rot.lam = l0 + (ev.clientX - sx) * 0.24; this.rot.phi = Math.max(-72, Math.min(72, p0 + (ev.clientY - sy) * 0.18)); };
        const up = () => { this.dragging = false; window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
        window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up); },
      globeWheel: e => { e.preventDefault(); this.zoom = Math.max(0.7, Math.min(2.6, this.zoom * (e.deltaY > 0 ? 0.92 : 1.08))); },
      globeReset: () => { this.rot = { lam: 98, phi: 38 }; this.zoom = 1; },
      liveVisitors: visitorsNow, visitorBars, liveSalesRoll: money0(s.salesDisplay), liveSalesDelta: '+18%', sparkPath, sparkArea: sparkPath + ' L120 34 L0 34 Z',
      liveStoreValue: s.storeId, setLiveStore: e => this.setState({ storeId: e.target.value, selected: {}, page: 0 }), liveStoreLabel: this.isAll() ? 'Across 3 stores' : st.domain,
      liveStats: [ { label: 'Sessions', value: sessions.toLocaleString(), sub: 'today' }, { label: 'Orders', value: String(orders), sub: 'today' },
        { label: 'Conversion rate', value: (orders / sessions * 100).toFixed(2) + '%', sub: 'sessions → paid' }, { label: 'AOV', value: money0(aov), sub: 'average order value' } ],
      funnel: [ { label: 'Viewing', count: visitorsNow, width: Math.round(visitorsNow / fMax * 100) + '%', color: '#7CC4FF', note: 'on the store right now' },
        { label: 'Added to cart', count: cartN, width: Math.round(cartN / fMax * 100) + '%', color: '#FFD666', note: 'carts today' },
        { label: 'Checking out', count: checkoutN, width: Math.round(checkoutN / fMax * 100) + '%', color: '#A78BFA', note: 'reached checkout' },
        { label: 'Purchased', count: orders, width: Math.round(orders / fMax * 100) + '%', color: '#4ADE80', note: 'paid orders today' } ],
      liveLists: [
        { title: 'Top pages', unit: 'sessions', rows: rows(pages, n => n.toLocaleString()) },
        { title: 'Top locations', unit: 'orders', rows: rows(cities, n => String(n)) },
        { title: 'Top ads', unit: 'sales', rows: rows(ads, n => money0(n)) }
      ],
      feed: visibleFeed.map(e => { const m = feedMeta[e.type], p = e.type === 'purchase'; return {
          id: e.id, time: e.t, color: m[0], title: m[1] + ' · ' + e.city[0] + ', ' + e.city[1], sub: e.store.name + ' · ' + e.bundle + (e.ad && e.ad !== 'Direct' ? ' · ad ' + e.ad : ' · direct'),
          amount: p ? '+' + money(e.amount) : '', bg: p ? 'rgba(74,222,128,.09)' : 'transparent', cursor: p ? 'pointer' : 'default', open: p ? () => this.go('order', e.orderId) : () => {} }; }),
      feedCount: visibleFeed.length,
      soundOn: s.soundOn, soundPopOpen: s.soundPopOpen, toggleSoundPop: e => { c.stop(e); this.setState({ soundPopOpen: !s.soundPopOpen }); },
      toggleSound: () => this.setState({ soundOn: !s.soundOn }, () => { if (this.state.soundOn) this.chaching(); }),
      soundTrack: s.soundOn ? '#4ADE80' : 'rgba(255,255,255,.18)', soundKnob: s.soundOn ? '13px' : '2px',
      volume: s.volume, volumePct: s.volume + '%', setVolume: e => this.setState({ volume: Number(e.target.value) }), previewSound: () => this.chaching(),
      simulateOrder: () => { const stx = this.isAll() ? pick(STORES) : st; const city = pick(CITIES); const o = this.landOrder(stx.id, city, pick(stx.ads)); this.toast('Test order ' + o.number + ' · ' + money(o.total) + ' · ' + city[0] + ', ' + city[1]); },
      toggleFullscreen: () => this.setState({ fullscreen: !s.fullscreen }), fullscreenLabel: s.fullscreen ? 'Exit full screen' : 'Full screen'
    };
  }
  buildHex(n) {
    const pts = [], GA = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
      const y = 1 - (2 * i) / (n - 1), r = Math.sqrt(Math.max(0, 1 - y * y)), th = i * GA;
      const x = Math.cos(th) * r, z = Math.sin(th) * r;
      const lat = Math.asin(y) * 180 / Math.PI, lon = Math.atan2(z, x) * 180 / Math.PI;
      let land = false;
      for (let p = 0; p < LAND.length; p++) if (inPoly(lon, lat, LAND[p])) { land = true; break; }
      if (land) for (let p = 0; p < HOLES.length; p++) if (inPoly(lon, lat, HOLES[p])) { land = false; break; }
      pts.push({ lon, lat, land, heat: 0 });
    }
    return pts;
  }
  nearestHex(lon, lat) {
    if (!this.hexPts) return -1;
    let best = -1, bd = 1e9;
    for (let i = 0; i < this.hexPts.length; i++) {
      const p = this.hexPts[i], dl = Math.abs(p.lon - lon), d = (p.lat - lat) * (p.lat - lat) + (dl > 180 ? 360 - dl : dl) * (dl > 180 ? 360 - dl : dl) * 0.6;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  analyticsVals(v) {
    const s = this.state, c = v._ctx, st = c.st, stores = c.stores, isM = c.isMobile;
    const mine = c.mine, todayOrders = c.todayOrders;
    const paid = todayOrders.filter(o => o.payment === 'Paid');
    const sales = paid.reduce((a, o) => a + o.total, 0), orders = todayOrders.length;
    const sessions = stores.reduce((a, x) => a + x.sessions, 0) + stores.reduce((a, x) => a + ((s.hits && s.hits[x.id]) ? s.hits[x.id].sessions : 0), 0);
    const dash = '—';
    const pct = (n, d) => d ? (n / d * 100).toFixed(2) + '%' : dash;
    const connected = !!s.metaConnected;
    const narrow = typeof window !== 'undefined' && window.innerWidth < 1180;
    const range = s.aRange || 'Today', gran = s.aGran || 'Day';
    const setS = o => () => this.setState(o);
    const empty = (title, body) => ({ title, body });
    const zeroRows = label => [{ label, bar: '0%', value: dash, empty: true }];
    const bd = (title, unit, label) => ({ title, unit, rows: zeroRows(label) });
    const flat = 'M0 76 L760 76';
    const mcard = (label, value, note) => ({ label, value, delta: dash, deltaColor: 'var(--ink-2)', note, spark: 'M0 26 L120 26' });
    return {
      // ---- honest zero state everywhere ----
      metrics: [ { label: 'Total sales', value: money(sales), delta: dash }, { label: 'Orders', value: String(orders), delta: dash },
        { label: 'Sessions', value: sessions.toLocaleString(), delta: dash }, { label: 'Conversion rate', value: pct(orders, sessions), delta: dash }
      ].map(m => ({ ...m, arrow: '', color: 'var(--ink-2)' })),
      yTop: '$3', yMid2: '$2', yMid: '$1',
      hasNew: false, newCount: '',
      todosEmpty: !c.todayOrders.length, recentEmpty: !mine.length,
      notifications: [], notifEmpty: true,
      capi: '0 / 0',
      pixelRows: stores.map(x => ({ label: 'Meta pixel · ' + x.name, value: connected ? 'Connected' : 'Not connected', dot: connected ? '#22C55E' : 'var(--ink-3)' })),
      capiDot: connected ? '#22C55E' : 'var(--ink-3)', dedupe: connected ? '100%' : dash, dedupeDot: connected ? '#22C55E' : 'var(--ink-3)',
      statusRows: [],
      storeRows: STORES.map(x => { const os = s.orders.filter(q => q.store === x.id && q.dayIndex === 0); const sl = os.reduce((a, q) => a + (q.payment === 'Paid' ? q.total : 0), 0);
        return { name: x.name, color: x.color, sales: money0(sl), orders: os.length, sessions: (x.sessions + ((s.hits && s.hits[x.id]) ? s.hits[x.id].sessions : 0)).toLocaleString(), conv: pct(os.length, x.sessions), select: () => this.setState({ storeId: x.id }) }; }),
      // ---- live view zero state ----
      liveStats: [ { label: 'Sessions', value: sessions.toLocaleString(), sub: 'today' }, { label: 'Orders', value: String(orders), sub: 'today' },
        { label: 'Conversion rate', value: pct(orders, sessions), sub: 'sessions → paid' }, { label: 'AOV', value: orders ? money(sales / orders) : dash, sub: 'average order value' } ],
      liveSalesDelta: dash,
      liveNarrow: narrow, liveWrapDisplay: narrow ? 'block' : 'grid', liveWrapOverflow: narrow ? 'auto' : 'hidden',
      liveCols: narrow ? 'none' : 'minmax(0,1fr) 330px', liveRows: narrow ? 'none' : 'minmax(0,1fr)',
      boardOverflow: narrow ? 'visible' : 'auto', boardMinH: narrow ? '0' : '0',
      railL: narrow ? '0' : '1px solid rgba(255,255,255,.08)', railT: narrow ? '1px solid rgba(255,255,255,.08)' : '0',
      railMinH: narrow ? '320px' : '0', railOverflow: narrow ? 'visible' : 'hidden', feedOverflow: narrow ? 'visible' : 'auto',
      globeCap: narrow ? 'none' : '72vh',
      liveLists: [ { title: 'Top pages', unit: 'sessions', rows: zeroRows('No sessions yet') },
        { title: 'Top locations', unit: 'orders', rows: zeroRows('No orders yet') },
        { title: 'Top ads', unit: 'sales', rows: zeroRows('No attributed sales yet') } ],
      simulateLabel: 'Simulate order (test)', feedEmpty: !(s.liveFeed || []).length,
      demoLabel: s.demoOn ? 'Stop simulated traffic' : 'Simulate live traffic',
      demoBg: s.demoOn ? '#FF2FB9' : 'var(--accent)', demoFg: s.demoOn ? '#fff' : 'var(--accent-ink)',
      demoDot: s.demoOn ? '#fff' : 'rgba(255,255,255,.55)',
      toggleDemo: () => { if (this.state.demoOn) { this.stopDemo(); } else { this.startDemo(); } },
      liveTopCols: (typeof window !== 'undefined' && window.innerWidth < 700) ? '1fr' : '1fr 1fr',
      liveListCols: (typeof window !== 'undefined' && window.innerWidth < 860) ? '1fr' : 'repeat(3,minmax(0,1fr))',
      // ---- analytics screen ----
      isAnalytics: s.route.screen === 'analytics',
      aRange: range, aRanges: ['Today', 'Yesterday', 'Last 7 days', 'Last 30 days', 'Custom'].map(r => ({ label: r, bg: r === range ? 'var(--accent-soft)' : 'transparent', select: () => this.setState({ aRange: r, aRangeOpen: false }) })),
      aRangeOpen: !!s.aRangeOpen, toggleARange: e => { c.stop(e); this.setState({ aRangeOpen: !s.aRangeOpen }); },
      aCompare: !!s.aCompare, toggleCompare: () => this.setState({ aCompare: !s.aCompare }),
      compareTrack: s.aCompare ? 'var(--accent)' : 'var(--border-strong)', compareKnob: s.aCompare ? '15px' : '2px',
      compareNote: s.aCompare ? 'vs previous period' : 'no comparison',
      aExport: () => this.toast('Nothing to export yet — no data in ' + range.toLowerCase()),
      aGran: gran, setGranDay: () => this.setState({ aGran: 'Day' }), setGranHour: () => this.setState({ aGran: 'Hour' }),
      granDayBg: gran === 'Day' ? 'var(--accent-soft)' : 'transparent', granHourBg: gran === 'Hour' ? 'var(--accent-soft)' : 'transparent',
      aCards: [ mcard('Total sales', money(sales), 'gross, minus refunds'), mcard('Sessions', sessions.toLocaleString(), 'unique visits'),
        mcard('Conversion rate', pct(orders, sessions), 'sessions → paid'), mcard('Average order value', orders ? money(sales / orders) : dash, 'per paid order'),
        mcard('Orders', String(orders), 'paid + pending'), mcard('Returning customer rate', dash, 'second-time buyers'), mcard('Refund rate', dash, 'refunded / paid') ],
      aFlat: flat, aChartTotal: money(sales),
      aXLabels: gran === 'Hour' ? ['12 AM', '4 AM', '8 AM', '12 PM', '4 PM', '8 PM', '11 PM'] : ['Sep 4', 'Sep 5', 'Sep 6', 'Sep 7', 'Sep 8', 'Sep 9', 'Sep 10'],
      aBreakdowns: [ bd('Sales by store', 'sales', 'No sales in this period'), bd('Sales by bundle option', 'sales', 'No sales in this period'),
        bd('Sessions by traffic source', 'sessions', 'No sessions in this period'), bd('Sessions by device', 'sessions', 'No sessions in this period'),
        bd('Top products by units sold', 'units', 'No units sold'), bd('Sales by state', 'sales', 'No sales in this period') ],
      aCols: isM ? '1fr' : 'repeat(auto-fit,minmax(300px,1fr))',
      aMarketing: [], aMarketingEmpty: true,
      aRefunds: [ { label: 'Refunds issued', value: money(0), sub: '0 orders' }, { label: 'Refund rate', value: dash, sub: 'of paid orders' },
        { label: 'Chargebacks opened', value: '0', sub: 'none open' }, { label: 'Chargebacks won', value: dash, sub: 'no history yet' } ],
      // meta ads connect
      metaConnected: connected, metaNotConnected: !connected,
      metaSpend: money(0), metaRoas: dash, metaRevenue: money(0), metaProfit: money(0),
      metaOpen: !!s.metaOpen, openMeta: () => this.setState({ metaOpen: true }), closeMeta: () => this.setState({ metaOpen: false }),
      metaPixel: s.metaPixel || '', setMetaPixel: e => this.setState({ metaPixel: e.target.value, dirty: true }),
      metaToken: s.metaToken || '', setMetaToken: e => this.setState({ metaToken: e.target.value, dirty: true }),
      metaAcct: s.metaAcct || '', setMetaAcct: e => this.setState({ metaAcct: e.target.value, dirty: true }),
      metaTestLabel: s.metaTest === 'ok' ? 'Connected' : s.metaTest === 'fail' ? 'Not received' : 'Not tested',
      metaTestBg: s.metaTest === 'ok' ? 'var(--b-success-bg)' : s.metaTest === 'fail' ? 'var(--b-critical-bg)' : 'var(--b-neutral-bg)',
      metaTestFg: s.metaTest === 'ok' ? 'var(--b-success-fg)' : s.metaTest === 'fail' ? 'var(--b-critical-fg)' : 'var(--b-neutral-fg)',
      testMeta: () => { const ok = (s.metaPixel || '').trim().length >= 6 && (s.metaToken || '').trim().length >= 8;
        this.setState({ metaTest: ok ? 'ok' : 'fail' }); this.toast(ok ? 'Test event received by Meta' : 'Add a Pixel ID and access token first'); },
      saveMeta: () => { const ok = (s.metaPixel || '').trim().length >= 6 && (s.metaToken || '').trim().length >= 8;
        if (!ok) { this.toast('Add a Pixel ID and access token first'); return; }
        this.setState({ metaConnected: true, metaOpen: false, dirty: false, metaTest: 'ok' }); this.toast('Meta ads connected'); },
      disconnectMeta: () => this.setState({ metaConnected: false, metaTest: null, metaOpen: false }, () => this.toast('Meta ads disconnected'))
    };
  }
  chaching() {
    try {
      if (!this._audio) { this._audio = new Audio('assets/sale.mp3'); this._audio.preload = 'auto'; }
      this._audio.currentTime = 0; this._audio.volume = Math.max(0, Math.min(1, this.state.volume / 100));
      const p = this._audio.play(); if (p && p.catch) p.catch(() => {});
    } catch (e) {}
  }
  reduced() { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  ring(lon, lat, color, delay, dur, max) {
    if (this.reduced()) return;
    this.rings = this.rings || []; this.ringQ = this.ringQ || [];
    const item = { lon, lat, color, born: performance.now() + (delay || 0), dur: dur || 1400, max: max || 46, w: 2 };
    if (this.rings.filter(r => r.born <= performance.now()).length >= 4) this.ringQ.push(item); else this.rings.push(item);
  }
  bumpMetric(key) { this.setState(s => ({ bumps: { ...(s.bumps || {}), [key]: ((s.bumps || {})[key] || 0) + 1 } })); }
  flashCard(keys, color, ms) {
    const until = Date.now() + (ms || 700);
    this.setState(s => { const fl = { ...(s.flash || {}) }; keys.forEach(k => fl[k] = { color, until }); return { flash: fl }; });
    setTimeout(() => this.forceUpdate(), (ms || 700) + 40);
  }
  clickSound() {
    try { if (!this._click) { this._click = new Audio('assets/sale.mp3'); } this._click.currentTime = 0;
      this._click.volume = Math.max(0, Math.min(1, (this.state.volume / 100) * 0.15)); const p = this._click.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
  }
  vendorTestEvent(kind) {
    const g = this.globe; if (!g) { this.toast('Globe still loading'); return; }
    this.liveIds = this.liveIds || [];
    const st = this.isAll() ? pick(STORES) : this.store();
    if (kind === 'view') {
      const c = pick(CITIES), id = 'v' + Date.now();
      this.liveIds.push({ id, store: st.id, stage: 'visitor' });
      g.push({ type: 'visitor', id, lat: c[3], lon: c[2], city: c[0] + ', ' + c[1], store: st.id });
      return;
    }
    const wanted = kind === 'cart' ? 'visitor' : kind === 'checkout' ? 'cart' : kind === 'purchase' ? 'checkout' : null;
    let m = this.liveIds.filter(x => x.stage === wanted);
    if (!m.length) { this.testEvent(kind === 'cart' ? 'view' : kind === 'checkout' ? 'cart' : 'checkout'); setTimeout(() => this.testEvent(kind), 300); return; }
    const target = pick(m);
    if (kind === 'leave') { const any = pick(this.liveIds); if (!any) return; g.push({ type: 'leave', id: any.id, store: any.store });
      this.liveIds = this.liveIds.filter(x => x.id !== any.id); this.bumpMetric('visitors'); return; }
    if (kind === 'purchase') {
      const stx = STORES.find(x => x.id === target.store) || st;
      const b = pick(stx.bundles);
      target.stage = 'order';
      g.push({ type: 'order', id: target.id, amount: b.price, store: stx.id });
      return;
    }
    target.stage = kind;
    g.push({ type: kind, id: target.id, store: target.store });
  }
  testEvent(kind) {
    const st = this.isAll() ? pick(STORES) : this.store();
    if (kind === 'view') {
      const city = pick(CITIES);
      const who = pick(NAMES);
      const v = { id: 'v' + Date.now(), store: st.id, city, stage: 'view', born: Date.now(), at: performance.now(), ad: pick(st.ads),
        name: who, email: who.toLowerCase().split(' ').map((w, k) => k === 0 ? w[0] + '.' : w).join('') + '@' + pick(['gmail.com', 'icloud.com', 'outlook.com']) };
      this.setState(s => ({ visitors: [...s.visitors, v] }));
      this.pushFeed({ type: 'view', store: st, city, bundle: '/', ad: v.ad });
      this.bump(st.id, h => { h.sessions++; h.pages = { ...h.pages, '/': (h.pages['/'] || 0) + 1 }; return h; });
      this.bumpMetric('visitors'); this.bumpMetric('sessions');
      return;
    }
    if (kind === 'leave') {
      const cands = this.state.visitors.filter(x => x.stage !== 'purchase');
      if (!cands.length) { this.toast('No visitors on the globe yet'); return; }
      const v = pick(cands);
      this.setState(s => ({ visitors: s.visitors.map(x => x.id === v.id ? { ...x, stage: 'leaving', at: performance.now() } : x) }));
      setTimeout(() => this.setState(s => ({ visitors: s.visitors.filter(x => x.id !== v.id) })), 420);
      this.bumpMetric('visitors');
      return;
    }
    if (kind === 'cart' || kind === 'checkout') {
      let cands = this.state.visitors.filter(x => x.stage === (kind === 'cart' ? 'view' : 'cart'));
      if (!cands.length) { this.testEvent(kind === 'cart' ? 'view' : 'cart'); cands = null; setTimeout(() => this.testEvent(kind), 260); return; }
      const v = pick(cands), s2 = STORES.find(x => x.id === v.store), b = pick(s2.bundles);
      this.setState(s => ({ visitors: s.visitors.map(x => x.id === v.id ? { ...x, stage: kind, at: performance.now(), bundle: b.label } : x) }));
      this.bump(v.store, h => { if (kind === 'cart') h.cart++; else h.checkout++; return h; });
      this.pushFeed({ type: kind, store: s2, city: v.city, bundle: b.label, ad: v.ad || pick(s2.ads) });
      if (kind === 'cart') {
        this.flashCard(['carts'], '#FF9AE0', 600); this.bumpMetric('carts'); }
      else { this.flashCard(['checkout'], '#FF57C8', 600); this.bumpMetric('checkout'); }
      return;
    }
    // purchase
    let v = pick(this.state.visitors.filter(x => x.stage === 'checkout') , 1) || null;
    const pool = this.state.visitors.filter(x => x.stage === 'checkout');
    v = pool.length ? pick(pool) : null;
    const city = v ? v.city : pick(CITIES);
    const store = v ? STORES.find(x => x.id === v.store) : st;
    if (!v) { this.bump(store.id, h => { h.sessions++; return h; }); this.bumpMetric('sessions'); }
    const o = this.landOrder(store.id, city, v && v.ad ? v.ad : pick(store.ads));
    if (v) { this.setState(s => ({ visitors: s.visitors.map(x => x.id === v.id ? { ...x, stage: 'purchase', at: performance.now(), purchaseAt: Date.now() } : x) }));
      setTimeout(() => this.setState(s => ({ visitors: s.visitors.map(x => x.id === v.id ? { ...x, stage: 'view', at: performance.now() } : x) })), 8000); }
    else { const nv = { id: 'v' + Date.now(), store: store.id, city, stage: 'purchase', born: Date.now(), at: performance.now(), purchaseAt: Date.now() };
      this.setState(s => ({ visitors: [...s.visitors, nv] }));
      setTimeout(() => this.setState(s => ({ visitors: s.visitors.map(x => x.id === nv.id ? { ...x, stage: 'view', at: performance.now() } : x) })), 8000); }
    this.glass(0, 0, 'Purchased', money(o ? o.total : 0) + ' · ' + city[0] + ', ' + city[1], '#FF2FB9', v ? v.email : '');
    this.pulses = (this.pulses || []).slice(-3);
    this.pulses.push({ lon: city[2], lat: city[3], born: performance.now(), dur: 1400 });
    this.arcs = (this.arcs || []).slice(-3);
    this.arcs.push({ lon1: city[2], lat1: city[3], lon2: -74.006, lat2: 40.7128, born: performance.now(), dur: 1500 });
    setTimeout(() => { this.flashCard(['sales', 'orders'], '#FF2FB9', 800); this.bumpMetric('sales'); this.bumpMetric('orders'); }, 150);
    return o;
  }
  startDemo() {
    this.setState({ demoOn: true });
    this.demoT = this.demoT || [];
    const at = (ms, fn) => this.demoT.push(setTimeout(fn, ms));
    const cycle = () => {
      at(0, () => this.testEvent('view')); at(900, () => this.testEvent('view'));
      at(2000, () => this.testEvent('view')); at(3200, () => this.testEvent('cart'));
      at(5200, () => this.testEvent('view')); at(6000, () => this.testEvent('checkout'));
      at(7400, () => this.testEvent('cart')); at(9000, () => this.testEvent('purchase'));
      at(11500, () => this.testEvent('leave')); at(13000, () => this.testEvent('view'));
      at(15000, () => this.testEvent('checkout')); at(17000, () => this.testEvent('purchase'));
      at(19000, () => { if (this.state.demoOn) cycle(); });
    };
    cycle();
  }
  stopDemo() { (this.demoT || []).forEach(clearTimeout); this.demoT = []; this.setState({ demoOn: false }); }
  glass(lon, lat, title, sub, tone, email) {
    const id = 'gc' + Date.now() + Math.random();
    this.setState(s => ({ glassCards: [...(s.glassCards || []).slice(-2), { id, title, sub, tone, email }] }));
    setTimeout(() => this.setState(s => ({ glassCards: (s.glassCards || []).filter(c => c.id !== id) })), 3600);
  }
  wave(lon, lat, col, dur, max) { if (this.reduced()) return; this.waves = this.waves || []; if (this.waves.length > 5) this.waves.shift(); this.waves.push({ lon, lat, col, dur, max, born: performance.now() }); }
  tileFlash(city) { this.tileHits = this.tileHits || []; this.tileHits.push({ lon: city[2], lat: city[3], born: performance.now() }); }
  liveUI(v) {
    const s = this.state, c = v._ctx, st = c.st, stores = c.stores;
    const narrow = typeof window !== 'undefined' && window.innerWidth < 1080;
    const dash = '—';
    const paid = c.todayOrders.filter(o => o.payment === 'Paid');
    const sales = paid.reduce((a, o) => a + o.total, 0);
    const sessions = stores.reduce((a, x) => a + x.sessions + ((s.hits && s.hits[x.id]) ? s.hits[x.id].sessions : 0), 0);
    const scoped = this.isAll() ? null : s.storeId;
    const cityCount = {};
    c.todayOrders.forEach(o => { const k = o.city + ', ' + o.st; cityCount[k] = (cityCount[k] || 0) + 1; });
    const locs = Object.entries(cityCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const locMax = locs.length ? locs[0][1] : 1;
    return {
      liveDir: narrow ? 'column' : 'row', boardW: narrow ? '100%' : 'clamp(360px, 30%, 580px)',
      liveWrapOverflow: narrow ? 'auto' : 'hidden', boardOverflow: narrow ? 'visible' : 'auto',
      globeFlex: narrow ? 'none' : '1 1 auto', globeBoxH: narrow ? '540px' : 'auto', globeBoxMinH: narrow ? '540px' : '0',
      liveStamp: 'Just now',
      liveCards: (() => { const sq = 'M1 17 q5 -9 10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0';
        return [ { key: 'v', tone: '#38A0FF', spark: sq, label: 'Visitors right now', value: String(s.visitors.filter(x => x.stage !== 'done' && (!scoped || x.store === scoped)).length) },
        { key: 's', tone: '#FF2FB9', spark: sq, label: 'Total sales', value: money0(s.salesDisplay || sales) },
        { key: 'e', tone: '#38A0FF', spark: sq, label: 'Total sessions', value: sessions.toLocaleString() },
        { key: 'o', tone: '#FF2FB9', spark: sq, label: 'Total orders', value: String(c.todayOrders.length) } ]; })(),
      behavior: [ { label: 'Active carts', value: String(stores.reduce((a, x) => a + ((s.hits && s.hits[x.id]) ? s.hits[x.id].cart : 0), 0)) },
        { label: 'Checking out', value: String(stores.reduce((a, x) => a + ((s.hits && s.hits[x.id]) ? s.hits[x.id].checkout : 0), 0)) },
        { label: 'Purchased', value: String(c.todayOrders.length) } ],
      locEmpty: !locs.length, locRows: locs.map(l => ({ label: 'United States · ' + l[0], bar: Math.max(12, Math.round(l[1] / locMax * 100)) + '%', value: String(l[1]) })),
      locQuery: s.locQuery || '', locWidth: narrow ? '180px' : '230px',
      setLocQuery: e => this.setState({ locQuery: e.target.value }),
      locKey: e => { if (e.key !== 'Enter') return; const q = (s.locQuery || '').trim().toLowerCase();
        const hit = CITIES.find(ct => (ct[0] + ', ' + ct[1]).toLowerCase().includes(q));
        if (!q) return;
        if (hit) { this.rot = { lam: -hit[2], phi: hit[3] }; this.zoom = 1.6; this.toast('Centred on ' + hit[0] + ', ' + hit[1]); }
        else this.toast('No location matches “' + (s.locQuery || '') + '”'); },
      showDots: s.showDots !== false, dotsBg: s.showDots === false ? 'var(--surface)' : 'var(--accent-soft)',
      dotsTitle: s.showDots === false ? 'Show visitor dots' : 'Hide visitor dots',
      toggleDots: () => this.setState({ showDots: s.showDots === false }),
      gridBg: s.showGrid ? 'var(--accent-soft)' : 'var(--surface)', gridTitle: s.showGrid ? 'Hide grid' : 'Show grid',
      toggleGrid: () => this.setState({ showGrid: !s.showGrid }),
      zoomIn: () => { this.zoom = Math.min(2.6, this.zoom * 1.15); }, zoomOut: () => { this.zoom = Math.max(0.7, this.zoom / 1.15); },
      feedEmpty: !(s.liveFeed || []).length,
      glassCards: (s.glassCards || []).map(c2 => ({ ...c2, hasEmail: !!c2.email, shadow: (c2.tone || '#FF2FB9') + '66' }))
    };
  }
  buildTiles(stepDeg) {
    const pts = [];
    for (let lat = -78; lat <= 78; lat += stepDeg) {
      const circ = Math.cos(lat * Math.PI / 180);
      const n = Math.max(6, Math.round((360 / stepDeg) * circ));
      const off = (Math.round((lat + 78) / stepDeg) % 2) ? (360 / n) / 2 : 0;
      for (let k = 0; k < n; k++) {
        const lon = -180 + off + k * (360 / n);
        const land = (window.ShopGlobe && window.ShopGlobe.isLand) ? !!window.ShopGlobe.isLand(lat, lon) : false;
        pts.push({ lon, lat, land });
      }
    }
    return pts;
  }
  mountVendorGlobe() {
    const tryMount = () => {
      const cv = this.globeRef && this.globeRef.current;
      if (!cv || !window.ShopGlobe) { this._mountT = setTimeout(tryMount, 120); return; }
      if (this.globe) return;
      this.globe = window.ShopGlobe.mount(cv, {
        soundUrl: 'assets/sale.mp3',
        onEvent: (e, stats) => this.onGlobeEvent(e, stats)
      });
    };
    clearTimeout(this._mountT); tryMount();
  }
  onGlobeEvent(e, stats) {
    this.setState({ globeStats: stats });
    const st = STORES.find(x => x.id === (e.store || (this.isAll() ? 'gk' : this.state.storeId))) || STORES[0];
    const city = e.city || (e.cityName || '');
    if (e.type === 'visitor') { this.bump(st.id, h => { h.sessions++; return h; }); this.bumpMetric('visitors'); this.bumpMetric('sessions'); }
    if (e.type === 'cart') { this.bumpMetric('carts'); this.flashCard(['carts'], '#FFB020', 600); }
    if (e.type === 'checkout') { this.bumpMetric('checkout'); this.flashCard(['checkout'], '#FF8A3D', 600); }
    if (e.type === 'order') {
      const parts = String(city || '').split(',');
      const tuple = [(parts[0] || 'Unknown').trim(), (parts[1] || '').trim(), e.lon != null ? e.lon : 0, e.lat != null ? e.lat : 0];
      const o = this.createLiveOrder(st.id, tuple, e.ad || pick(st.ads));
      this.bumpMetric('sales'); this.bumpMetric('orders'); this.flashCard(['sales', 'orders'], '#FF2FB9', 800);
      this.pushFeed({ type: 'order', store: st, cityLabel: city, bundle: o ? o.bundle : '', ad: e.ad || 'direct', amount: e.amount || (o ? o.total : 0), orderId: o ? o.id : null });
      return;
    }
    if (e.type !== 'leave') this.pushFeed({ type: e.type, store: st, cityLabel: city, bundle: e.path || '', ad: e.ad || 'direct' });
  }
  startGlobe() {
    const draw = () => {
      const cv0 = this.globeRef && this.globeRef.current;
      if (!cv0 || this.state.route.screen !== 'live') { this._raf = setTimeout(draw, 400); return; }
      this._raf = requestAnimationFrame(draw);
      const tNow = performance.now();
      if (this._lastFrame && tNow - this._lastFrame < 30) return;
      this._lastFrame = tNow;
      const cv = cv0;
      if (!this.tiles) { if (!(window.ShopGlobe && window.ShopGlobe.isLand)) return; this.tiles = this.buildTiles(1.25); this.dotPts = this.tiles; }
      const dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
      if (!w || !h) return;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
      const red = this.reduced();
      if (!this.dragging && !red) this.rot.lam -= 0.03;
      const R = Math.min(w, h) * 0.46 * this.zoom, cx = w * 0.52, cy = h / 2;
      const D = Math.PI / 180, t = this.rot.phi * D, ct = Math.cos(t), stt = Math.sin(t);
      const proj = (lon, lat) => { const lamR = (lon + this.rot.lam) * D, phiR = lat * D;
        const x1 = Math.cos(phiR) * Math.sin(lamR), y1 = Math.sin(phiR), z1 = Math.cos(phiR) * Math.cos(lamR);
        return { x: cx + x1 * R, y: cy - (y1 * ct - z1 * stt) * R, z: y1 * stt + z1 * ct }; };
      // soft purple bloom on the white page
      const bloom = g.createRadialGradient(cx, cy, R * 0.92, cx, cy, R * 1.30);
      bloom.addColorStop(0, 'rgba(109,61,245,.20)'); bloom.addColorStop(.5, 'rgba(109,61,245,.07)'); bloom.addColorStop(1, 'rgba(109,61,245,0)');
      g.fillStyle = bloom; g.beginPath(); g.arc(cx, cy, R * 1.30, 0, 6.284); g.fill();
      // dark violet glass body, lit upper-left
      const body = g.createRadialGradient(cx - R * .40, cy - R * .44, R * .04, cx + R * .26, cy + R * .34, R * 1.32);
      body.addColorStop(0, '#5A4699'); body.addColorStop(.16, '#43336F'); body.addColorStop(.34, '#2A2052');
      body.addColorStop(.5, '#34285F'); body.addColorStop(.66, '#1D1439'); body.addColorStop(.84, '#221845'); body.addColorStop(1, '#0A0618');
      g.fillStyle = body; g.beginPath(); g.arc(cx, cy, R, 0, 6.284); g.fill();
      const sheen = g.createLinearGradient(cx - R * .7, cy - R * .7, cx + R * .5, cy + R * .8);
      sheen.addColorStop(0, 'rgba(255,255,255,.10)'); sheen.addColorStop(.28, 'rgba(255,255,255,.02)');
      sheen.addColorStop(.55, 'rgba(190,170,255,.06)'); sheen.addColorStop(.8, 'rgba(255,255,255,0)');
      g.fillStyle = sheen; g.beginPath(); g.arc(cx, cy, R, 0, 6.284); g.fill();
      // glass rim light + inner shadow
      g.save(); g.beginPath(); g.arc(cx, cy, R, 0, 6.284); g.clip();
      const rim = g.createRadialGradient(cx, cy, R * 0.86, cx, cy, R);
      rim.addColorStop(0, 'rgba(167,139,250,0)'); rim.addColorStop(.82, 'rgba(167,139,250,.16)'); rim.addColorStop(1, 'rgba(214,199,255,.55)');
      g.fillStyle = rim; g.beginPath(); g.arc(cx, cy, R, 0, 6.284); g.fill();
      g.restore();
      // faint graticule
      g.strokeStyle = 'rgba(196,181,253,.10)'; g.lineWidth = 1;
      for (let lat = -60; lat <= 60; lat += 30) { g.beginPath(); let on = false;
        for (let lon = -180; lon <= 180; lon += 4) { const p = proj(lon, lat); if (p.z > 0) { on ? g.lineTo(p.x, p.y) : (g.moveTo(p.x, p.y), on = true); } else on = false; } g.stroke(); }
      for (let lon = -180; lon < 180; lon += 30) { g.beginPath(); let on = false;
        for (let lat = -78; lat <= 78; lat += 4) { const p = proj(lon, lat); if (p.z > 0) { on ? g.lineTo(p.x, p.y) : (g.moveTo(p.x, p.y), on = true); } else on = false; } g.stroke(); }
      const now = performance.now();
      this.tileHits = (this.tileHits || []).filter(x => now - x.born < 320);
      const hr = R * 0.0122;
      if (!this.sprites || Math.abs((this.spriteHr || 0) - hr) > 0.25) {
        this.spriteHr = hr; this.sprites = { land: [], sea: [] };
        const mk = (rgb, alpha) => { const size = Math.max(4, Math.ceil(hr * 2.6)), cvs = document.createElement('canvas');
          cvs.width = size; cvs.height = size; const c2 = cvs.getContext('2d'); const cc = size / 2, rad = hr;
          c2.beginPath(); for (let k = 0; k < 6; k++) { const ang = k * 1.0471976 + 0.5236, px = cc + rad * Math.cos(ang), py = cc + rad * Math.sin(ang); k ? c2.lineTo(px, py) : c2.moveTo(px, py); }
          c2.closePath(); c2.fillStyle = 'rgba(' + rgb + ',' + alpha.toFixed(3) + ')'; c2.fill(); return cvs; };
        for (let b = 0; b < 10; b++) { this.sprites.land.push(mk('226,220,255', 0.28 + b * 0.072)); this.sprites.sea.push(mk('150,135,215', 0.05 + b * 0.011)); }
      }
      const spr = (set, bucket, x, y, scl) => { const img = set[bucket], sz = Math.max(2, hr * 2.6 * scl);
        g.drawImage(img, x - sz / 2, y - sz / 2, sz, sz); };
      const hex = (x, y, rad) => { g.beginPath();
        for (let k = 0; k < 6; k++) { const a = k * 1.0471976 + 0.5236, px = x + rad * Math.cos(a), py = y + rad * Math.sin(a); k ? g.lineTo(px, py) : g.moveTo(px, py); }
        g.closePath(); };
      // unit vectors once, so event maths is cheap
      if (!this.tvec) { const DD = Math.PI / 180;
        this.tvec = this.tiles.map(p => { const la = p.lat * DD, lo = p.lon * DD, cl = Math.cos(la);
          return [cl * Math.cos(lo), Math.sin(la), cl * Math.sin(lo)]; }); }
      const vec = (lon, lat) => { const DD = Math.PI / 180, la = lat * DD, lo = lon * DD, cl = Math.cos(la); return [cl * Math.cos(lo), Math.sin(la), cl * Math.sin(lo)]; };
      const SC = { view: [77, 163, 255], cart: [255, 154, 224], checkout: [255, 87, 200], purchase: [255, 47, 185] };
      const scopedNow = this.isAll() ? null : this.state.storeId;
      // one owner tile per marker
      const owners = [];
      (this.state.visitors || []).forEach(vv => { if (scopedNow && vv.store !== scopedNow) return;
        if (vv.ti == null) { const t = vec(vv.city[2], vv.city[3]); let bi = -1, bd = -2;
          for (let i = 0; i < this.tvec.length; i++) { if (!this.tiles[i].land) continue;
            const d = this.tvec[i][0] * t[0] + this.tvec[i][1] * t[1] + this.tvec[i][2] * t[2];
            if (d > bd) { bd = d; bi = i; } }
          vv.ti = bi; }
        owners.push(vv); });
      const ownerOf = {}; owners.forEach(vv => { if (vv.ti >= 0) ownerOf[vv.ti] = vv; });
      // hex ripples: a wave of lit tiles spreading out from an event
      this.waves = (this.waves || []).filter(x => now - x.born < x.dur);
      // liquid swell: a soft dome of light that rises and settles — no shockwave band
      const waves = this.waves.map(x => { const k = Math.min(1, (now - x.born) / x.dur);
        const rise = k < 0.22 ? k / 0.22 : 1, settle = k < 0.22 ? 1 : 1 - (k - 0.22) / 0.78;
        const ease = Math.sin(Math.min(1, rise) * Math.PI / 2) * (settle * settle);
        return { v: vec(x.lon, x.lat), cosR: Math.cos((x.max * (0.35 + 0.65 * rise)) * Math.PI / 180), amp: ease, col: x.col }; });
      const MRGB = { view: '96,190,255', leaving: '96,190,255', cart: '255,105,205', checkout: '255,87,200', purchase: '255,20,170' };
      const scopedTiles = this.isAll() ? null : this.state.storeId;
      const picked = {};
      (this.state.visitors || []).forEach(vv => { if (scopedTiles && vv.store !== scopedTiles) return;
        if (vv.ti == null) { const t = vec(vv.city[2], vv.city[3]); let bi = -1, bd = -2;
          for (let i2 = 0; i2 < this.tvec.length; i2++) { if (!this.tiles[i2].land) continue;
            const d = this.tvec[i2][0] * t[0] + this.tvec[i2][1] * t[1] + this.tvec[i2][2] * t[2];
            if (d > bd) { bd = d; bi = i2; } }
          vv.ti = bi; }
        if (vv.ti < 0) return;
        const age = now - (vv.at || now);
        let amp = 1;
        if (vv.stage === 'view') amp = 0.8 + 0.2 * (0.5 - 0.5 * Math.cos((now / 1600) + (vv.ph || (vv.ph = Math.random() * 6))));
        else if (vv.stage === 'purchase') { const k = Math.min(1, age / 2400); amp = 0.55 + 0.45 * Math.abs(Math.cos(k * Math.PI * 2.5)) * (1 - k); }
        else if (vv.stage === 'leaving') amp = Math.max(0, 1 - age / 400);
        picked[vv.ti] = { rgb: MRGB[vv.stage] || MRGB.view, amp, stage: vv.stage }; });
      for (let i = 0; i < this.tiles.length; i++) {
        const p = this.tiles[i], q = proj(p.lon, p.lat);
        if (q.z <= 0.02) continue;
        const depth = 0.45 + 0.55 * q.z;
        let scale = (0.65 + 0.35 * q.z) * 0.86;
        const pk = picked[i];
        if (pk) {
          g.shadowColor = 'rgba(' + pk.rgb + ',' + (0.5 + 0.45 * pk.amp).toFixed(2) + ')';
          g.shadowBlur = (pk.stage === 'purchase' ? 13 : 7) * (0.55 + 0.45 * pk.amp);
          g.fillStyle = 'rgba(' + pk.rgb + ',' + Math.min(1, 0.72 + 0.28 * q.z).toFixed(3) + ')';
          hex(q.x, q.y, hr * scale * 1.3); g.fill(); g.shadowBlur = 0;
          g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 0.9; g.stroke();
          continue;
        }
        const bk = Math.max(0, Math.min(9, Math.round(q.z * 9)));
        if (p.land) spr(this.sprites.land, bk, q.x, q.y, scale);
        else spr(this.sprites.sea, bk, q.x, q.y, scale * 0.92);
      }
      // specular highlight (glass)
      const spec = g.createRadialGradient(cx - R * .42, cy - R * .46, 0, cx - R * .42, cy - R * .46, R * .62);
      spec.addColorStop(0, 'rgba(255,255,255,.20)'); spec.addColorStop(.45, 'rgba(255,255,255,.06)'); spec.addColorStop(1, 'rgba(255,255,255,0)');
      g.save(); g.beginPath(); g.arc(cx, cy, R, 0, 6.284); g.clip(); g.fillStyle = spec; g.fillRect(cx - R, cy - R, R * 2, R * 2); g.restore();
      // rings
      this.rings = (this.rings || []).filter(r => now - r.born < r.dur);
      this.ringQ = this.ringQ || [];
      while (this.rings.filter(r => r.born <= now).length < 4 && this.ringQ.length) { const it = this.ringQ.shift(); it.born = now; this.rings.push(it); }
      // one hairline glass ring that opens slowly and dissolves — nothing else

      // glowing arc: purchase city → the store in New York
      this.arcs = (this.arcs || []).filter(a => now - a.born < a.dur + 700);
      this.pulses = (this.pulses || []).filter(p2 => now - p2.born < p2.dur);
      // crisp celestial glow above the point of sale — drawn over the sphere, never on the tiles
      this.pulses.forEach(pu => { const q = proj(pu.lon, pu.lat); if (q.z <= 0.02) return;
        const k = Math.min(1, (now - pu.born) / pu.dur);
        const grow = 1 - Math.pow(1 - k, 3), fade = k < .1 ? k / .1 : 1 - (k - .1) / .9;
        const rad = 3 + grow * 26, al = Math.max(0, fade);
        const gl = g.createRadialGradient(q.x, q.y, 0, q.x, q.y, rad * 1.5);
        gl.addColorStop(0, 'rgba(255,255,255,' + (0.5 * al).toFixed(3) + ')');
        gl.addColorStop(.35, 'rgba(255,20,170,' + (0.22 * al).toFixed(3) + ')');
        gl.addColorStop(1, 'rgba(255,20,170,0)');
        g.fillStyle = gl; g.beginPath(); g.arc(q.x, q.y, rad * 1.5, 0, 6.284); g.fill();
        g.strokeStyle = 'rgba(255,255,255,' + (0.8 * al).toFixed(3) + ')'; g.lineWidth = 1.1;
        g.shadowColor = 'rgba(255,20,170,.9)'; g.shadowBlur = 10 * al;
        g.beginPath(); g.arc(q.x, q.y, rad, 0, 6.284); g.stroke(); g.shadowBlur = 0; });
      this.arcs.forEach(a => {
        const k = Math.min(1, (now - a.born) / a.dur), tail = Math.max(0, k - 0.26);
        const gc = (t) => { // great-circle interpolation, lifted off the surface
          const p1 = vec(a.lon1, a.lat1), p2 = vec(a.lon2, a.lat2);
          const dot = Math.max(-1, Math.min(1, p1[0]*p2[0] + p1[1]*p2[1] + p1[2]*p2[2])), om = Math.acos(dot);
          const s1 = Math.sin((1 - t) * om) / (Math.sin(om) || 1), s2 = Math.sin(t * om) / (Math.sin(om) || 1);
          const x = p1[0]*s1 + p2[0]*s2, y = p1[1]*s1 + p2[1]*s2, z = p1[2]*s1 + p2[2]*s2;
          const len = Math.hypot(x, y, z) || 1, lift = 1 + 0.17 * Math.sin(t * Math.PI);
          const lamR = Math.atan2(z / len, x / len) * 180 / Math.PI, phiR = Math.asin(y / len) * 180 / Math.PI;
          const q2 = proj(lamR - this.rot.lam, phiR);
          return { x: cx + (q2.x - cx) * lift, y: cy + (q2.y - cy) * lift, z: q2.z };
        };
        const N = 44, pts = [];
        for (let i2 = 0; i2 <= N; i2++) { const t = tail + (k - tail) * (i2 / N); if (t < 0) continue; pts.push(gc(t)); }
        if (pts.length < 2) return;
        const fade = now - a.born > a.dur ? Math.max(0, 1 - (now - a.born - a.dur) / 700) : 1;
        for (let pass = 0; pass < 2; pass++) {
          g.beginPath(); let started = false;
          pts.forEach(p2 => { if (p2.z <= -0.25) { started = false; return; } if (!started) { g.moveTo(p2.x, p2.y); started = true; } else g.lineTo(p2.x, p2.y); });
          g.strokeStyle = pass === 0 ? 'rgba(255,20,170,' + (0.22 * fade).toFixed(3) + ')' : 'rgba(255,140,225,' + (0.95 * fade).toFixed(3) + ')';
          g.lineWidth = pass === 0 ? 7 : 1.8; g.lineCap = 'round';
          if (pass === 0) { g.shadowColor = 'rgba(255,20,170,.85)'; g.shadowBlur = 16; } else g.shadowBlur = 0;
          g.stroke(); g.shadowBlur = 0;
        }
        const head = pts[pts.length - 1], prev = pts[pts.length - 2];
        if (head && prev && head.z > -0.25) {
          const ang = Math.atan2(head.y - prev.y, head.x - prev.x);
          g.save(); g.translate(head.x, head.y); g.rotate(ang);
          g.fillStyle = 'rgba(255,255,255,' + fade.toFixed(2) + ')';
          g.shadowColor = 'rgba(255,20,170,.9)'; g.shadowBlur = 12;
          g.beginPath(); g.moveTo(6, 0); g.lineTo(-4, 3.2); g.lineTo(-2, 0); g.lineTo(-4, -3.2); g.closePath(); g.fill();
          g.restore(); g.shadowBlur = 0;
        }
      });

      const scoped = this.isAll() ? null : this.state.storeId;
      this.hit = [];
      const M = { view: '#0EA5E9', leaving: '#0EA5E9', cart: '#FF9AE0', checkout: '#FF57C8', purchase: '#FF2FB9' };
      (this.state.visitors || []).forEach(vv => { if (scoped && vv.store !== scoped) return;
        const q = proj(vv.city[2], vv.city[3]); if (q.z <= 0.02) return;
        const age = now - (vv.at || now), col = M[vv.stage] || M.view;
        let rr = vv.stage === 'purchase' ? (age < 200 ? 7 - 1.5 * (age / 200) : 5.5) : vv.stage === 'checkout' ? 6 : 4;
        let op = 1;
        if (vv.stage === 'leaving') { const k = Math.min(1, age / 400); rr = 4 * (1 - k); op = 1 - k; }
        else if (age < 250) op = age / 250;
        if (rr <= 0.2) return;
        if (!red && vv.stage === 'checkout') { g.save(); g.translate(q.x, q.y); g.rotate((now / 3000) * 6.283);
          g.strokeStyle = 'rgba(255,87,200,.95)'; g.lineWidth = 1.4; g.setLineDash([3, 4]);
          g.beginPath(); for (let k2 = 0; k2 < 6; k2++) { const ang = k2 * 1.0471976 + 0.5236, rad = hr * 2.1; const px = rad * Math.cos(ang), py = rad * Math.sin(ang); k2 ? g.lineTo(px, py) : g.moveTo(px, py); }
          g.closePath(); g.stroke(); g.setLineDash([]); g.restore(); }

        this.hit.push({ x: q.x, y: q.y, r: Math.max(9, rr + 5), city: vv.city, stage: vv.stage });
      });
    };
    cancelAnimationFrame(this._raf); this._raf = requestAnimationFrame(draw);
  }
  liveUI2(v) {
    const s = this.state, c = v._ctx, stores = c.stores;
    const b = s.bumps || {}, fl = s.flash || {}, now = Date.now();
    const anim = k => ((b[k] || 0) % 2) ? 'kRollA .4s ease-out' : 'kRollB .4s ease-out';
    const border = k => (fl[k] && fl[k].until > now) ? fl[k].color : 'var(--border)';
    const scoped = this.isAll() ? null : s.storeId;
    const vis = (s.visitors || []).filter(x => x.stage !== 'leaving' && (!scoped || x.store === scoped));
    const paid = c.todayOrders.filter(o => o.payment === 'Paid');
    const sales = paid.reduce((a, o) => a + o.total, 0);
    const sessions = stores.reduce((a, x) => a + x.sessions + ((s.hits && s.hits[x.id]) ? s.hits[x.id].sessions : 0), 0);
    const RAIL = { view: '#4DA3FF', visitor: '#4DA3FF', cart: '#FF9AE0', checkout: '#FF57C8', purchase: '#FF2FB9', order: '#FF2FB9' };
    const META = { view: ['#4DA3FF', 'Viewing'], visitor: ['#4DA3FF', 'Viewing'], cart: ['#FF9AE0', 'Added to cart'], checkout: ['#FF57C8', 'Checking out'], purchase: ['#FF2FB9', 'Purchased'], order: ['#FF2FB9', 'Purchased'] };
    const feedList = (s.liveFeed || []).filter(e => !scoped || e.store.id === scoped);
    const tip = s.tip;
    return {
      liveCards: (() => {
        const wave = amp => { let d = 'M1 ' + (17).toFixed(0); for (let i2 = 0; i2 < 9; i2++) d += (i2 ? ' t10 0' : ' q5 ' + (-amp) + ' 10 0'); return d; };
        const sq = wave(9);
        return [
        { key: 'v', tone: '#38A0FF', label: 'Visitors right now', value: String(vis.length), anim: anim('visitors'), border: border('visitors'), spark: sq },
        { key: 's', tone: '#FF2FB9', label: 'Total sales', value: money0(s.salesDisplay || sales), anim: anim('sales'), border: border('sales'), spark: sq },
        { key: 'e', tone: '#38A0FF', label: 'Total sessions', value: sessions.toLocaleString(), anim: anim('sessions'), border: border('sessions'), spark: sq },
        { key: 'o', tone: '#FF2FB9', label: 'Total orders', value: String(c.todayOrders.length), anim: anim('orders'), border: border('orders'), spark: sq }
      ]; })(),
      behaviorBorder: (fl.carts && fl.carts.until > now) ? fl.carts.color : (fl.checkout && fl.checkout.until > now) ? fl.checkout.color : 'var(--border)',
      ...(() => {
        const carts = stores.reduce((a, x) => a + ((s.hits && s.hits[x.id]) ? s.hits[x.id].cart : 0), 0);
        const chk = stores.reduce((a, x) => a + ((s.hits && s.hits[x.id]) ? s.hits[x.id].checkout : 0), 0);
        const bought = c.todayOrders.length, mx = Math.max(carts, chk, bought, sessions, 1);
        const H = 122, h = v2 => v2 ? Math.max(58, Math.round(38 + (v2 / mx) * (H - 38))) : 0;
        const h0 = h(carts), h1 = h(chk), h2 = h(bought);
        const y = hh => 128 - hh;
        const slope = 'M2 ' + y(h0) + ' L96 ' + y(h0) + ' L103 ' + y(h1) + ' L197 ' + y(h1) + ' L204 ' + y(h2) + ' L298 ' + y(h2) + ' L298 128 L2 128 Z';
        return { fn: { y0: y(h0), h0, y1: y(h1), h1, y2: y(h2), h2, sh0: Math.min(10, h0), sh1: Math.min(10, h1), sh2: Math.min(10, h2) },
          funnelSlope: slope, funnelEmpty: !(carts || chk || bought) };
      })(),
      behavior: (() => {
        const carts = stores.reduce((a, x) => a + ((s.hits && s.hits[x.id]) ? s.hits[x.id].cart : 0), 0);
        const chk = stores.reduce((a, x) => a + ((s.hits && s.hits[x.id]) ? s.hits[x.id].checkout : 0), 0);
        const bought = c.todayOrders.length, mx = Math.max(carts, chk, bought, 1);
        const row = (label, val, color, colorHi, tint, key, note, flags) => ({ label, value: String(val), anim: anim(key), color, colorHi, tintBg: tint,
          bar: val ? Math.max(12, Math.round(val / mx * 100)) + '%' : '0%', note: val ? note : 'nothing yet',
          rowBg: 'rgba(255,255,255,.55)', rowBorder: 'rgba(27,18,48,.07)',
          fillA: color + '2E', fillB: colorHi + '14', ...flags });
        return [
          row('Active carts', carts, '#FF9AE0', '#FFC2EE', 'rgba(255,154,224,.14)', 'carts', 'carts with items', { isCart: true, isCheckout: false, isBought: false }),
          row('Checking out', chk, '#FF57C8', '#FF9AE0', 'rgba(255,87,200,.14)', 'checkout', 'reached checkout', { isCart: false, isCheckout: true, isBought: false }),
          row('Purchased', bought, '#FF2FB9', '#FF6FD1', 'rgba(255,47,185,.14)', 'orders', 'paid orders today', { isCart: false, isCheckout: false, isBought: true })
        ];
      })(),
      feed: feedList.map(e => { const m = META[e.type] || META.view, p = (e.type === 'purchase' || e.type === 'order');
        const label = e.cityLabel || (e.city ? (e.city[0] + (e.city[1] ? ', ' + e.city[1] : '')) : '');
        return {
        id: e.id, time: e.t, color: m[0], rail: RAIL[e.type] || RAIL.view, title: m[1] + (label ? ' · ' + label : ''),
        sub: e.store.name + (e.bundle ? ' · ' + e.bundle : '') + (e.ad && e.ad !== 'Direct' && e.ad !== 'direct' ? ' · ad ' + e.ad : ' · direct'),
        amount: p ? '+' + money(e.amount || 0) : '', bg: p ? 'kTint 2s ease-out forwards' : 'none',
        cursor: p ? 'pointer' : 'default', open: p ? () => this.go('order', e.orderId) : () => {} }; }),
      feedCount: feedList.length, feedEmpty: !feedList.length,
      tests: [ { label: 'Visitor', go: () => this.testEvent('view') }, { label: 'Cart', go: () => this.testEvent('cart') },
        { label: 'Checkout', go: () => this.testEvent('checkout') }, { label: 'Leaves', go: () => this.testEvent('leave') } ],
      simulateOrder: () => { const o = this.testEvent('purchase'); if (o) this.toast('Test order ' + o.number + ' · ' + money(o.total)); },
      globeMove: e => { const r = e.currentTarget.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
        const hitList = this.hit || []; let found = null;
        for (let i = 0; i < hitList.length; i++) { const hh = hitList[i];
          if ((hh.x - mx) * (hh.x - mx) + (hh.y - my) * (hh.y - my) <= hh.r * hh.r) { found = hh; break; } }
        const cur = s.tip;
        if (!found) { if (cur) this.setState({ tip: null }); return; }
        const label = found.city[0] + ', ' + found.city[1];
        const amt = found.stage === 'purchase' ? (this.lastAmount || '') : '';
        if (!cur || cur.label !== label || cur.x !== Math.round(found.x)) this.setState({ tip: { label, amount: amt, x: Math.round(found.x), y: Math.round(found.y) } }); },
      globeLeave: () => { if (s.tip) this.setState({ tip: null }); },
      tipOn: !!tip, tipLabel: tip ? tip.label : '', tipAmount: tip ? tip.amount : '', tipHasAmount: !!(tip && tip.amount),
      tipLeft: tip ? (tip.x + 'px') : '0', tipTop: tip ? (Math.max(6, tip.y - 44) + 'px') : '0'
    };
  }
  productVals(v) {
    const s = this.state, c = v._ctx, isM = c.isMobile;
    const list = s.products || [];
    const q = (s.pQuery || '').trim().toLowerCase();
    const filtered = list.filter(p => (!q || (p.title || '').toLowerCase().includes(q)) && (!s.pStatus || p.status === s.pStatus));
    const draft = s.draft;
    const num = x => { const n = parseFloat(String(x).replace(/[^0-9.]/g, '')); return isFinite(n) ? n : 0; };
    const setDraft = fn => this.setState(st => ({ draft: fn({ ...st.draft }), dirty: true }));
    const opts = draft ? (draft.options || []) : [];
    const cost = draft ? num(draft.cost) : 0;
    const defOpt = opts.find(o => o.def) || opts[0];
    const defPrice = defOpt ? num(defOpt.price) : 0;
    const margin = defPrice > 0 ? (defPrice - cost) / defPrice * 100 : null;
    const storeName = id => (STORES.find(x => x.id === id) || {}).name || '—';
    return {
      isProducts: s.route.screen === 'products', isProduct: s.route.screen === 'product',
      hasProducts: list.length > 0, productCount: list.length,
      pQuery: s.pQuery || '', setPQuery: e => this.setState({ pQuery: e.target.value }),
      pStatus: s.pStatus || '', setPStatus: e => this.setState({ pStatus: e.target.value }),
      pCols: isM ? '40px minmax(0,1fr) auto' : '40px minmax(0,1.6fr) 110px 90px 110px 100px',
      productsEmpty: filtered.length === 0, hasProductRows: filtered.length > 0,
      pEmptyTitle: list.length ? 'No products match' : 'No products yet',
      pEmptyBody: list.length ? 'Try a different search or clear the status filter.' : 'Add your first product to set its bundle options, images and supplier cost.',
      productRows: filtered.map(p => { const ps = (p.options || []).map(o => num(o.price)).filter(x => x > 0);
        return { id: p.id, title: p.title || 'Untitled product', thumb: (p.media && p.media[0]) ? '' : (p.title || 'P').slice(0, 1).toUpperCase(),
          storeName: storeName(p.store), status: p.status, statusKind: p.status === 'Active' ? 'success' : 'neutral',
          options: (p.options || []).length + ((p.options || []).length === 1 ? ' option' : ' options'),
          priceFrom: ps.length ? money(Math.min(...ps)) : '—', units: '0',
          open: () => this.setState({ draft: JSON.parse(JSON.stringify(p)), dirty: false }, () => this.go('product', p.id)) }; }),
      newProduct: () => { const id = 'p' + Date.now();
        this.setState({ draft: { id, title: '', description: '', status: 'Draft', store: s.storeId === 'all' ? 'gk' : s.storeId, contentId: '', supplier: '', supplierUrl: '', cost: '', media: [], options: [{ id: 'o1', label: 'Buy 1', sublabel: '', price: '', compare: '', def: true }] }, dirty: false }, () => this.go('product', id)); },
      pdHeading: draft ? (draft.title || 'New product') : 'New product',
      pdTitle: draft ? draft.title : '', setPdTitle: e => { const val = e.target.value; setDraft(d => { d.title = val; return d; }); },
      pdDesc: draft ? draft.description : '', setPdDesc: e => { const val = e.target.value; setDraft(d => { d.description = val; return d; }); },
      pdStatus: draft ? draft.status : 'Draft', setPdStatus: e => { const val = e.target.value; setDraft(d => { d.status = val; return d; }); },
      pdStore: draft ? draft.store : 'gk', setPdStore: e => { const val = e.target.value; setDraft(d => { d.store = val; return d; }); },
      pdContentId: draft ? draft.contentId : '', setPdContentId: e => { const val = e.target.value; setDraft(d => { d.contentId = val; return d; }); },
      pdSupplier: draft ? draft.supplier : '', setPdSupplier: e => { const val = e.target.value; setDraft(d => { d.supplier = val; return d; }); },
      pdSupplierUrl: draft ? draft.supplierUrl : '', setPdSupplierUrl: e => { const val = e.target.value; setDraft(d => { d.supplierUrl = val; return d; }); },
      pdCost: draft ? draft.cost : '', setPdCost: e => { const val = e.target.value; setDraft(d => { d.cost = val; return d; }); },
      pdMedia: draft ? (draft.media || []).map((m, i) => ({ ...m, bg: 'url("' + m.url + '")', remove: () => setDraft(d => { d.media = d.media.filter((_, k) => k !== i); return d; }) })) : [],
      pdMediaNote: draft && (draft.media || []).length ? (draft.media.length + ' image' + (draft.media.length === 1 ? '' : 's') + ' · first one is the thumbnail') : 'PNG or JPG. The first image is used as the thumbnail.',
      uploadMedia: e => { const files = Array.from(e.target.files || []); if (!files.length) return;
        files.forEach(file => { const rd = new FileReader();
          rd.onload = () => setDraft(d => { d.media = [...(d.media || []), { name: file.name, url: rd.result }]; return d; });
          rd.readAsDataURL(file); });
        this.toast(files.length + (files.length === 1 ? ' image added' : ' images added')); },
      pdNoOptions: opts.length === 0,
      pdOptions: opts.map((o, i) => { const p = num(o.price), cp = num(o.compare), sv = cp > p && cp > 0 ? Math.round((cp - p) / cp * 100) : null;
        return { ...o, isDefault: !!o.def, saved: sv === null ? '—' : sv + '%', savedColor: sv === null ? 'var(--ink-3)' : 'var(--success)',
          setLabel: e => { const val = e.target.value; setDraft(d => { d.options[i].label = val; return d; }); },
          setSub: e => { const val = e.target.value; setDraft(d => { d.options[i].sublabel = val; return d; }); },
          setPrice: e => { const val = e.target.value; setDraft(d => { d.options[i].price = val; return d; }); },
          setCompare: e => { const val = e.target.value; setDraft(d => { d.options[i].compare = val; return d; }); },
          setDefault: () => setDraft(d => { d.options.forEach((x, k) => x.def = k === i); return d; }),
          remove: () => setDraft(d => { d.options = d.options.filter((_, k) => k !== i); if (d.options.length && !d.options.some(x => x.def)) d.options[0].def = true; return d; }),
          dragStart: e => { this._dragI = i; try { e.dataTransfer.effectAllowed = 'move'; } catch (er) {} },
          dragOver: e => e.preventDefault(),
          drop: e => { e.preventDefault(); const from = this._dragI; if (from == null || from === i) return;
            setDraft(d => { const arr = d.options.slice(); const [m] = arr.splice(from, 1); arr.splice(i, 0, m); d.options = arr; return d; }); this._dragI = null; } }; }),
      addOption: () => setDraft(d => { d.options = [...(d.options || []), { id: 'o' + Date.now(), label: '', sublabel: '', price: '', compare: '', def: !(d.options || []).length }]; return d; }),
      marginText: margin === null ? '—' : margin.toFixed(0) + '%',
      marginColor: margin === null ? 'var(--ink-3)' : margin >= 60 ? 'var(--success)' : margin >= 35 ? 'var(--ink)' : 'var(--critical)',
      marginNote: margin === null ? 'set a price and cost' : money(defPrice - cost) + ' per unit on ' + (defOpt ? (defOpt.label || 'default option') : 'default'),
      pdExisting: !!(draft && list.some(p => p.id === draft.id)),
      deleteProduct: () => this.setState({ confirm: { title: 'Delete this product?', body: 'It will be removed from the store and from Meta catalogue syncs. This cannot be undone.', label: 'Delete', critical: true,
        onConfirm: () => { this.setState(st => ({ products: (st.products || []).filter(p => p.id !== st.draft.id), draft: null, dirty: false }), () => { this.go('products'); this.toast('Product deleted'); }); } } }),
      saveBar: !!s.dirty,
      discardChanges: () => { const orig = list.find(p => draft && p.id === draft.id);
        this.setState({ draft: orig ? JSON.parse(JSON.stringify(orig)) : null, dirty: false }, () => { if (!orig) this.go('products'); this.toast('Changes discarded'); }); },
      saveChanges: () => { if (!draft) { this.setState({ dirty: false }); return; }
        if (!(draft.title || '').trim()) { this.toast('Give the product a title first'); return; }
        this.setState(st => { const arr = (st.products || []).slice(); const i = arr.findIndex(p => p.id === st.draft.id);
          if (i >= 0) arr[i] = JSON.parse(JSON.stringify(st.draft)); else arr.push(JSON.parse(JSON.stringify(st.draft)));
          return { products: arr, dirty: false }; }, () => this.toast('Product saved')); }
    };
  }
  cfg() { const s = this.state; return s.cfg || {}; }
  storeCfg(id) { const c = this.cfg()[id] || {}; return c; }
  setCfg(id, fn) { this.setState(s => { const cfg = { ...(s.cfg || {}) }; cfg[id] = fn({ ...(cfg[id] || {}) }); return { cfg, dirty: true }; }); }
  copy(text, label) { try { navigator.clipboard.writeText(text); } catch (e) {} this.toast((label || 'Value') + ' copied'); }
  settingsVals(v) {
    const s = this.state, c = v._ctx, isM = c.isMobile, all = c.all, st = c.st;
    const sid = all ? null : s.storeId, cf = sid ? this.storeCfg(sid) : {};
    const tab = s.setTab || 'domains';
    const TABS = [['profile','Profile'],['general','General'],['domains','Domains'],['payments','Payments'],['notifications','Notifications'],['taxes','Taxes'],['shipping','Shipping'],['checkout','Checkout'],['policies','Policies'],['branding','Branding'],['billing','Plan & billing'],['data','Data export']];
    const mask = x => x ? x.slice(0, 4) + '••••••••••••' + x.slice(-4) : '';
    const set = (k, val) => sid ? this.setCfg(sid, d => { d[k] = val; return d; }) : this.toast('Pick a single store to edit this');
    const fText = (label, k, ph, help, span, mono) => ({ label, isText: true, isSelect: false, isArea: false, type: 'text', value: cf[k] || '', placeholder: ph || '', help: help || '', hasHelp: !!help, span: span || 'auto', font: mono ? "'JetBrains Mono',monospace" : 'inherit', set: e => set(k, e.target.value) });
    const fSel = (label, k, options, help) => ({ label, isText: false, isSelect: true, isArea: false, value: cf[k] || options[0], options, help: help || '', hasHelp: !!help, span: 'auto', set: e => set(k, e.target.value) });
    const fArea = (label, k, ph) => ({ label, isText: false, isSelect: false, isArea: true, value: cf[k] || '', placeholder: ph || '', hasHelp: false, span: '1 / -1', set: e => set(k, e.target.value) });
    const tg = (label, help, k, dflt) => { const on = cf[k] === undefined ? !!dflt : !!cf[k];
      return { label, help, track: on ? 'var(--accent)' : 'var(--border-strong)', knob: on ? '18px' : '2px', toggle: () => set(k, !on) }; };
    const card = o => ({ hasSub: !!o.sub, hasNote: !!o.note, hasSteps: !!o.steps, hasDns: !!o.dns, hasRows: !!o.rows, rowsEmpty: !!o.rows && o.rows.length === 0,
      hasFields: !!o.fields, hasToggles: !!o.toggles, hasLinks: !!o.links, hasCost: !!o.costs, fieldCols: o.fieldCols || (isM ? '1fr' : 'repeat(2,minmax(0,1fr))'),
      actions: (o.actions || []).map(a => ({ ...a, border: a.primary ? '0' : '1px solid var(--border)', bg: a.primary ? 'var(--accent)' : 'var(--surface)', fg: a.primary ? 'var(--accent-ink)' : (a.danger ? 'var(--critical)' : 'var(--ink)'), weight: a.primary ? 600 : 550 })),
      rows: (o.rows || []).map(r => ({ ...r, hasNote: !!r.note, badges: r.badges || [], actions: (r.actions || []).map(a => ({ ...a, fg: a.danger ? 'var(--critical)' : 'var(--ink)', disabled: !!a.disabled, opacity: a.disabled ? .45 : 1 })) })),
      steps: o.steps, dns: o.dns, fields: o.fields, toggles: o.toggles, links: o.links, costs: o.costs, costTotal: o.costTotal,
      emptyTitle: o.emptyTitle || 'Nothing here yet', emptyBody: o.emptyBody || '', title: o.title, sub: o.sub, note: o.note });

    const domains = cf.domains || [];
    const KIND = { Pending: 'warning', Connected: 'success', Transferring: 'info' };
    const dnsFor = d => [
      { type: 'A', name: '@', value: '198.51.100.24' },
      { type: 'CNAME', name: 'www', value: 'stores.shopadmin.app' },
      { type: 'TXT', name: '_shopadmin', value: 'verify=' + (d || 'domain').replace(/\W/g, '').slice(0, 12) + 'x7' }
    ].map(r => ({ ...r, copy: () => this.copy(r.value, r.type + ' record') }));
    const addDomain = (name, mode) => { if (!name.trim()) { this.toast('Enter a domain first'); return; }
      this.setCfg(sid, d => { d.domains = [...(d.domains || []), { name: name.trim().toLowerCase(), status: mode === 'transfer' ? 'Transferring' : 'Pending', ssl: 'Pending', primary: !(d.domains || []).length, mode, step: mode === 'transfer' ? 1 : 0 }]; d.newDomain = ''; return d; });
      this.toast(mode === 'transfer' ? 'Transfer started' : 'Domain added · add the DNS records'); };
    const upDomain = (i, fn) => this.setCfg(sid, d => { const arr = (d.domains || []).map(x => ({ ...x })); fn(arr[i], arr); d.domains = arr; return d; });

    let cards = [];
    if (all && (tab === 'domains' || tab === 'payments' || tab === 'notifications' || tab === 'general' || tab === 'taxes' || tab === 'shipping' || tab === 'checkout' || tab === 'policies' || tab === 'branding')) {
      cards = [card({ title: 'Pick a store', note: 'These settings belong to a single store — each one has its own domain, payment account and email sender, so a problem on one store can never touch the others. Choose a store in the switcher, top right.' })];
    } else if (tab === 'domains') {
      cards.push(card({ title: 'Domains · ' + st.name, sub: domains.length ? domains.length + (domains.length === 1 ? ' domain' : ' domains') : 'None connected',
        rows: domains.map((d, i) => ({ name: d.name, note: d.mode === 'transfer' ? 'Registration transferring in — step ' + d.step + ' of 6' : 'Pointing here via DNS',
          badges: [{ label: d.status, kind: KIND[d.status] || 'neutral' }, { label: 'SSL ' + d.ssl, kind: d.ssl === 'Active' ? 'success' : 'neutral' }].concat(d.primary ? [{ label: 'Primary', kind: 'info' }] : []),
          actions: [
            { label: 'Verify connection', run: () => upDomain(i, x => { if (x.status === 'Pending') { x.status = 'Connected'; this.toast('DNS verified · issuing certificate'); setTimeout(() => upDomain(i, y => { y.ssl = 'Active'; }), 1200); } else if (x.ssl !== 'Active') { x.ssl = 'Active'; this.toast('SSL active'); } else this.toast('Already connected with SSL'); }), disabled: d.mode === 'transfer' },
            { label: 'Set as primary', disabled: d.primary, run: () => { upDomain(i, (x, arr) => { arr.forEach(y => y.primary = false); x.primary = true; }); this.toast(d.name + ' is now primary'); } },
            { label: 'Remove', danger: true, run: () => this.setState({ confirm: { title: 'Remove ' + d.name + '?', body: 'The storefront stops answering on this domain immediately.', label: 'Remove', critical: true, onConfirm: () => { upDomain(i, (x, arr) => arr.splice(i, 1)); this.toast('Domain removed'); } } }) }
          ] })),
        emptyTitle: 'No domains connected', emptyBody: 'Connect a domain you already own, or transfer its registration here.',
        actions: [{ label: 'Add subdomain', run: () => { const base = domains[0]; if (!base) { this.toast('Connect a root domain first'); return; } addDomain('shop.' + base.name, 'connect'); } }] }));
      cards.push(card({ title: 'Connect an existing domain', sub: 'The domain stays at your registrar and simply points here',
        fields: [fText('Domain', 'newDomain', 'yourstore.com', 'No http:// and no www', '1 / -1')],
        actions: [{ label: 'Add domain', primary: true, run: () => addDomain(cf.newDomain || '', 'connect') }],
        dns: dnsFor(cf.newDomain || (domains[0] && domains[0].name)),
        note: 'Add these three records at your DNS provider, then press Verify connection on the domain above. Status moves Pending → Connected → SSL Active.' }));
      const tstep = (domains.find(d => d.mode === 'transfer') || {}).step || 0;
      const tdom = domains.find(d => d.mode === 'transfer');
      const STEPS = [['Unlock the domain at your current registrar', 'Turn off the transfer lock in its dashboard'], ['Turn off WHOIS privacy', 'Registrars block transfers while privacy is on'], ['Get the authorisation (EPP) code', 'Your registrar emails it to the owner address'], ['Paste the code below', 'We submit the transfer request with it'], ['Approve the confirmation email', 'Sent to the domain owner address on file'], ['Wait 5–7 days', 'ICANN holds every transfer for this window']];
      cards.push(card({ title: 'Transfer a domain in', sub: tdom ? tdom.name + ' · step ' + tstep + ' of 6' : 'Move the registration itself to us',
        note: 'The domain must be more than 60 days old and not transferred in the last 60 days — ICANN blocks it otherwise.',
        steps: STEPS.map((x, i) => { const n = i + 1, done = tstep > n, active = tstep === n;
          return { n, label: x[0], help: x[1], state: done ? 'Done' : active ? 'In progress' : 'Waiting',
            color: active ? 'var(--ink)' : done ? 'var(--ink-2)' : 'var(--ink-3)', dotBg: done ? 'var(--success)' : active ? 'var(--accent)' : 'var(--bg)', dotFg: done || active ? '#fff' : 'var(--ink-3)' }; }),
        fields: [fText('Domain to transfer', 'transferDomain', 'yourstore.com'), fText('Authorisation (EPP) code', 'eppCode', 'e.g. A7x-K29-pQ4')],
        actions: tdom ? [{ label: 'Advance step', primary: true, run: () => { const i = domains.indexOf(tdom); upDomain(i, x => { x.step = Math.min(6, (x.step || 1) + 1); if (x.step === 6) { x.status = 'Connected'; x.ssl = 'Active'; } }); this.toast(tstep >= 5 ? 'Transfer complete' : 'Step ' + (tstep + 1) + ' recorded'); } },
          { label: 'Cancel transfer', danger: true, run: () => { const i = domains.indexOf(tdom); upDomain(i, (x, arr) => arr.splice(i, 1)); this.toast('Transfer cancelled'); } }]
          : [{ label: 'Start transfer', primary: true, run: () => { if (!(cf.eppCode || '').trim()) { this.toast('Paste the EPP code first'); return; } addDomain(cf.transferDomain || '', 'transfer'); } }] }));
      cards.push(card({ title: 'Admin domain', note: 'This admin runs on admin.shopadmin.app — its own domain, entirely separate from every storefront. Removing a store domain never affects your access here.' }));
    } else if (tab === 'payments') {
      const provs = cf.providers || [{ id: 'stripe1', kind: 'Stripe', name: '', pk: '', sk: '', wh: '', desc: '', connected: false, backup: false }];
      const upProv = (i, fn) => this.setCfg(sid, d => { const arr = (d.providers || provs).map(x => ({ ...x })); fn(arr[i], arr); d.providers = arr; return d; });
      cards.push(card({ title: 'Payments · ' + st.name, note: st.name + ' has its own payment account. If this account is ever frozen, your other stores keep taking money — nothing is shared between them.' }));
      provs.forEach((p, i) => {
        cards.push(card({ title: p.kind + (p.name ? ' · ' + p.name : '') + (i === 0 ? ' (primary)' : ''), sub: p.connected ? 'Connected' : 'Not connected',
          fields: [
            { label: 'Account name', isText: true, type: 'text', value: p.name, placeholder: 'Legal entity on the account', span: 'auto', font: 'inherit', hasHelp: false, set: e => upProv(i, x => x.name = e.target.value) },
            { label: 'Statement descriptor', isText: true, type: 'text', value: p.desc, placeholder: 'What buyers see on their card', span: 'auto', font: 'inherit', hasHelp: false, set: e => upProv(i, x => x.desc = e.target.value) },
            { label: 'Publishable key', isText: true, type: 'text', value: p.pk, placeholder: 'pk_live_…', span: 'auto', font: "'JetBrains Mono',monospace", hasHelp: false, set: e => upProv(i, x => x.pk = e.target.value) },
            { label: 'Secret key', isText: true, type: 'password', value: p.sk, placeholder: 'sk_live_…', span: 'auto', font: "'JetBrains Mono',monospace", hasHelp: !!p.sk, help: p.sk ? 'Stored encrypted · ' + mask(p.sk) : '', set: e => upProv(i, x => x.sk = e.target.value) },
            { label: 'Webhook signing secret', isText: true, type: 'password', value: p.wh, placeholder: 'whsec_…', span: 'auto', font: "'JetBrains Mono',monospace", hasHelp: !!p.wh, help: p.wh ? 'Stored encrypted · ' + mask(p.wh) : '', set: e => upProv(i, x => x.wh = e.target.value) }
          ],
          rows: [{ name: p.connected ? 'Connection verified' : 'Not connected', note: p.connected ? 'Test charge authorised and voided' : 'Add the keys above, then test the connection',
            badges: [{ label: p.connected ? 'Connected' : 'Not connected', kind: p.connected ? 'success' : 'neutral' }].concat(p.backup ? [{ label: 'Backup — used if primary fails', kind: 'info' }] : []),
            actions: [{ label: 'Test connection', run: () => { if (!(p.sk || '').trim()) { this.toast('Add a secret key first'); return; } upProv(i, x => x.connected = true); this.toast('Connected · test charge voided'); } },
              { label: p.backup ? 'Unset backup' : 'Mark as backup', disabled: i === 0 && provs.length === 1, run: () => upProv(i, x => x.backup = !x.backup) },
              { label: 'Remove', danger: true, disabled: provs.length === 1, run: () => { upProv(i, (x, arr) => arr.splice(i, 1)); this.toast('Provider removed'); } }] }] }));
      });
      cards.push(card({ title: 'Add a payment provider', sub: 'A second account can take over if the first is frozen',
        actions: [['Stripe','Stripe account'],['PayPal','PayPal'],['Manual','Manual method']].map(([k, label]) => ({ label: 'Add ' + label, run: () => { this.setCfg(sid, d => { d.providers = [...(d.providers || provs), { id: k + Date.now(), kind: k, name: '', pk: '', sk: '', wh: '', desc: '', connected: false, backup: true }]; return d; }); this.toast(k + ' provider added'); } })) }));
      cards.push(card({ title: 'Payment handling',
        fields: [fSel('Payment capture', 'capture', ['Automatic — charge at checkout', 'Manual — authorise now, capture later'])],
        toggles: [tg('Submit dispute evidence automatically', 'We assemble tracking, delivery scans and emails and file them with Stripe', 'autoEvidence', true), tg('Email me on every failed payment', 'Card declines and webhook failures', 'failEmail', false)],
        links: [{ label: 'Export all payment records', help: 'CSV of charges, refunds and disputes for this store', run: () => this.toast('Export started · you’ll get an email when it’s ready') }] }));
    } else if (tab === 'profile') {
      const acc = s.account || {};
      const setAcc = (k, val) => this.setState(x => ({ account: { ...(x.account || {}), [k]: val }, dirty: true }));
      cards.push(card({ title: 'Your account',
        fields: [
          { label: 'Name', isText: true, type: 'text', value: acc.name || '', placeholder: 'Your name', span: 'auto', font: 'inherit', hasHelp: false, set: e => setAcc('name', e.target.value) },
          { label: 'Email', isText: true, type: 'text', value: acc.email || '', placeholder: 'you@yourdomain.com', span: 'auto', font: 'inherit', hasHelp: false, set: e => setAcc('email', e.target.value) }
        ],
        actions: [{ label: 'Change password', run: () => this.toast('Password reset link sent') }] }));
      cards.push(card({ title: 'Security',
        toggles: [tg('Two-factor authentication', 'Require a code from your authenticator app at sign-in', 'twoFactor', false)],
        links: [{ label: 'Sign out of all devices', help: 'Ends every session except this one', run: () => this.toast('All other sessions signed out') }] }));
      cards.push(card({ title: 'Notification preferences',
        toggles: [tg('Email me on every order', '', 'notifOrder', true), tg('Email me on chargebacks', '', 'notifCb', true), tg('Weekly summary', 'Monday morning, all stores', 'notifWeekly', false)] }));
    } else if (tab === 'general') {
      cards.push(card({ title: 'Store details',
        fields: [fText('Store name', 'storeName', st.name), fText('Contact email', 'contactEmail', 'support@' + (st.domain || 'yourstore.com')),
          fSel('Currency', 'currency', ['USD $', 'CAD $', 'EUR €', 'GBP £']), fSel('Timezone', 'timezone', ['(GMT−05:00) Eastern Time', '(GMT−06:00) Central Time', '(GMT−07:00) Mountain Time', '(GMT−08:00) Pacific Time'])] }));
      cards.push(card({ title: 'Business address', sub: 'Used on invoices and for tax calculation',
        fields: [fText('Legal business name', 'legalName', ''), fText('Street', 'street', ''), fText('City', 'city', ''), fText('State', 'state', ''), fText('ZIP', 'zip', ''), fText('Phone', 'phone', '')] }));
    } else if (tab === 'notifications') {
      const dom = (domains.find(d => d.primary) || domains[0] || {}).name;
      cards.push(card({ title: 'Sender', sub: dom ? 'Sending from ' + dom : 'Connect a domain first',
        fields: [fText('From address', 'fromEmail', dom ? 'orders@' + dom : 'orders@yourstore.com', 'Must be on your own domain so mail lands in inboxes', '1 / -1')],
        rows: [{ name: 'SPF', note: dom ? 'TXT record found on ' + dom : 'No domain connected', badges: [{ label: cf.spf ? 'Verified' : 'Not verified', kind: cf.spf ? 'success' : 'neutral' }], actions: [{ label: 'Verify', run: () => { set('spf', true); this.toast('SPF verified'); } }, { label: 'Copy record', run: () => this.copy('v=spf1 include:mail.shopadmin.app ~all', 'SPF record') }] },
          { name: 'DKIM', note: 'Signs every message so it isn’t marked as spam', badges: [{ label: cf.dkim ? 'Verified' : 'Not verified', kind: cf.dkim ? 'success' : 'neutral' }], actions: [{ label: 'Verify', run: () => { set('dkim', true); this.toast('DKIM verified'); } }, { label: 'Copy record', run: () => this.copy('sa1._domainkey CNAME sa1.dkim.shopadmin.app', 'DKIM record') }] }] }));
      cards.push(card({ title: 'Customer emails',
        rows: [['Order confirmation', 'Sent the moment payment is captured'], ['Shipping confirmation', 'Sent when you add a tracking number'], ['Refund notification', 'Sent when you issue a refund']].map(([n, note]) => ({ name: n, note,
          badges: [{ label: 'Active', kind: 'success' }],
          actions: [{ label: 'Preview', run: () => this.setState({ emailPreview: { title: n, store: st.name, from: cf.fromEmail || (dom ? 'orders@' + dom : 'orders@yourstore.com') } }) }, { label: 'Send test', run: () => this.toast('Test ' + n.toLowerCase() + ' sent to ' + (s.account && s.account.email ? s.account.email : 'your account email')) }] })) }));
    } else if (tab === 'taxes') {
      cards.push(card({ title: 'US sales tax',
        fields: [fSel('Calculation', 'taxMode', ['Automatic — rates by destination', 'Manual — I set the rates']), fText('Default rate', 'taxRate', '0.00%', 'Used when no state rate matches')],
        toggles: [tg('Prices include tax', 'Show tax-inclusive prices on the storefront', 'taxIncluded', false), tg('Charge tax on shipping', '', 'taxShipping', false)],
        rows: (cf.taxStates || []).map((r, i) => ({ name: r.state + ' · ' + r.rate, note: 'Manual rate', actions: [{ label: 'Remove', danger: true, run: () => this.setCfg(sid, d => { d.taxStates = (d.taxStates || []).filter((_, k) => k !== i); return d; }) }] })),
        emptyTitle: 'No manual state rates', emptyBody: 'Automatic calculation covers every state where you have nexus.',
        actions: [{ label: 'Add state rate', run: () => this.setCfg(sid, d => { d.taxStates = [...(d.taxStates || []), { state: 'OK', rate: '0.00%' }]; return d; }) }] }));
    } else if (tab === 'shipping') {
      cards.push(card({ title: 'Rates',
        fields: [fText('Flat rate', 'shipFlat', '$0.00'), fText('Free shipping over', 'shipFree', '$0.00'), fText('Delivery estimate shown at checkout', 'shipEta', 'e.g. 5–9 business days', '', '1 / -1')],
        toggles: [tg('Free shipping on every order', 'Overrides the flat rate', 'shipAlwaysFree', true), tg('Show the estimate on the product page too', '', 'shipEtaProduct', true)] }));
    } else if (tab === 'checkout') {
      cards.push(card({ title: 'Customer information',
        fields: [fSel('Full name', 'coName', ['Require first and last name', 'Require last name only']), fSel('Phone number', 'coPhone', ['Optional', 'Required', 'Hidden']), fSel('Company address', 'coCompany', ['Hidden', 'Optional', 'Required'])],
        toggles: [tg('Email marketing consent checkbox', 'Pre-ticked is not allowed in several states', 'coConsent', true), tg('Capture abandoned checkouts', 'Feeds the abandoned-checkout automation in Marketing', 'coAbandon', true), tg('Tip field', '', 'coTip', false)] }));
    } else if (tab === 'policies') {
      cards.push(card({ title: 'Store policies', note: 'These publish to your storefront and are linked in the footer and at checkout.',
        fields: [fArea('Refund policy', 'polRefund', 'Paste or write your refund policy…'), fArea('Privacy policy', 'polPrivacy', ''), fArea('Terms of service', 'polTerms', ''), fArea('Shipping policy', 'polShipping', '')],
        actions: [{ label: 'Publish policies', primary: true, run: () => this.toast('Policies published to ' + (st.domain || 'the storefront')) }] }));
    } else if (tab === 'branding') {
      cards.push(card({ title: 'Branding', sub: 'Used in emails, checkout and the favicon — not the storefront layout',
        fields: [fText('Logo URL', 'logoUrl', 'https://…'), fText('Favicon URL', 'faviconUrl', 'https://…'), fText('Brand colour', 'brandColor', '#000000'), fText('Accent colour', 'brandAccent', '#000000')],
        note: 'Storefront design lives in code, written per store by your developer. This only styles the parts we render: emails and checkout.' }));
    } else if (tab === 'billing') {
      const costs = [['Hosting & CDN', 'Vercel Pro · all stores', '$20.00'], ['Database', 'Postgres, 8 GB', '$25.00'], ['Object storage', 'Media library, 50 GB', '$5.00'], ['Email sending', 'Up to 50k messages', '$15.00'], ['Domains', (cf.domains || []).length + ' registered · billed yearly', '$0.00'], ['Stripe fees', '2.9% + 30¢ per charge · usage', 'Usage'], ['Meta CAPI', 'Free tier', 'Free']];
      cards.push(card({ title: 'What this platform costs you', sub: 'Your own infrastructure — there is no subscription to us',
        costs: costs.map(([name, note, price]) => ({ name, note, price, color: price === 'Free' ? 'var(--success)' : 'var(--ink)' })),
        costTotal: '$65.00 / month + usage' }));
      cards.push(card({ title: 'Payment method for infrastructure', rows: [], emptyTitle: 'No card on file', emptyBody: 'Each service bills you directly today. Add a card here to consolidate.', actions: [{ label: 'Add card', run: () => this.toast('Card form opens once billing is wired up') }] }));
    } else if (tab === 'data') {
      cards.push(card({ title: 'Data export', note: 'Every export is a CSV, emailed to your account address. Exporting never deletes anything.',
        links: [['Orders', 'All fields including tracking, refunds and Meta attribution'], ['Customers', 'Contact details, order counts and marketing consent'], ['Events', 'Raw visitor and purchase events with event IDs'], ['Payment records', 'Charges, refunds and disputes'], ['Everything', 'A full archive of this account']].map(([label, help]) => ({ label: 'Export ' + label.toLowerCase(), help, run: () => this.toast(label + ' export started') })) }));
      cards.push(card({ title: 'Danger zone', actions: [{ label: 'Delete a store', danger: true, run: () => this.toast('Store deletion is confirmed by email once wired up') }] }));
    }
    return {
      isSettings: s.route.screen === 'settings', setCols: isM ? '1fr' : '208px minmax(0,1fr)',
      setTabs: TABS.map(([k, label]) => ({ label, bg: tab === k ? 'var(--accent-soft)' : 'transparent', weight: tab === k ? 600 : 450, select: () => this.setState({ setTab: k }) })),
      setCards: cards, scopeName: all ? 'All stores' : st.name
    };
  }
  metaVals(v) {
    const s = this.state, c = v._ctx, all = c.all, st = c.st, isM = c.isMobile;
    const sid = all ? null : s.storeId, cf = sid ? this.storeCfg(sid) : {};
    const connected = !!(cf.pixel && cf.capiToken);
    const set = (k, val) => sid ? this.setCfg(sid, d => { d[k] = val; return d; }) : this.toast('Pick a single store first');
    const dot = connected ? '#22C55E' : 'var(--ink-3)';
    return {
      isMeta: s.route.screen === 'meta',
      mt: {
        scopeAll: all, scopeOne: !all, cols: isM ? '1fr' : 'repeat(2,minmax(0,1fr))',
        statusLabel: all ? 'Per store' : connected ? 'Connected' : 'Not connected', kind: connected ? 'success' : 'neutral',
        pixel: cf.pixel || '', setPixel: e => set('pixel', e.target.value),
        adAccount: cf.adAccount || '', setAdAccount: e => set('adAccount', e.target.value),
        tokenShown: cf.capiToken || '', setToken: e => set('capiToken', e.target.value),
        tokenType: s.showToken ? 'text' : 'password', tokenBtn: s.showToken ? 'Hide' : 'Show', toggleToken: () => this.setState({ showToken: !s.showToken }),
        sendTest: () => { if (!cf.pixel) { this.toast('Add a pixel ID first'); return; } set('testEvent', true); this.toast('Test event sent · check Events Manager'); },
        testLabel: cf.testEvent ? 'Received' : 'Not tested', testKind: cf.testEvent ? 'success' : 'neutral',
        browserEvents: ['PageView', 'ViewContent', 'AddToCart', 'InitiateCheckout', 'Purchase'].map(name => ({ name, dot, count: '0' })),
        serverEvents: ['ViewContent', 'AddToCart', 'InitiateCheckout', 'Purchase'].map(name => ({ name, dot, count: '0' })),
        emq: connected ? '—' : '—', emqColor: 'var(--ink-3)',
        adsEmpty: true, hasAds: false, adRows: []
      }
    };
  }
  bizVals(v) {
    const s = this.state, c = v._ctx, isM = c.isMobile, all = c.all, st = c.st, stores = c.stores;
    const R = s.route.screen, prods = s.products || [];
    const nameOf = id => (STORES.find(x => x.id === id) || {}).name || '—';
    const prodNames = prods.length ? prods.map(p => p.title || 'Untitled product') : stores.map(x => x.product);
    const num = x => { const n = parseInt(String(x).replace(/[^0-9−\-]/g, '').replace('−', '-'), 10); return isFinite(n) ? n : 0; };

    // ---------- INVENTORY ----------
    const invSeed = () => { const out = [];
      (prods.length ? prods : []).forEach(p => (p.options || []).forEach(o => out.push({ key: p.id + ':' + o.id, product: p.title || 'Untitled product', store: p.store, variant: o.label || 'Option', sku: '' })));
      return out; };
    const invBase = invSeed();
    const invState = s.inv || {};
    const invRows = invBase.filter(r => (!s.invStore || r.store === s.invStore) && (!s.invQuery || (r.product + ' ' + r.variant + ' ' + (invState[r.key] || {}).sku).toLowerCase().includes(s.invQuery.toLowerCase())))
      .map(r => { const d = invState[r.key] || {}; const avail = d.available || 0, thr = d.threshold === undefined ? 0 : d.threshold;
        const committed = s.orders.filter(o => o.store === r.store && o.state !== 'Fulfilled' && o.state !== 'Refunded' && o.bundle === r.variant).length;
        return { ...r, available: avail, threshold: thr, committed: 0, incoming: d.incoming || 0, low: thr > 0 && avail <= thr, storeName: nameOf(r.store),
          sku: d.sku || '—',
          inc: () => this.setInv(r.key, x => { x.available = (x.available || 0) + 1; return x; }),
          dec: () => this.setInv(r.key, x => { x.available = Math.max(0, (x.available || 0) - 1); return x; }),
          setThreshold: e => { const val = num(e.target.value); this.setInv(r.key, x => { x.threshold = val; return x; }); },
          adjust: () => this.setState({ invAdjust: { key: r.key, name: r.product + ' · ' + r.variant, from: avail }, invAdjustQty: '', invAdjustReason: 'Received from supplier' }) }; })
      .filter(r => !s.invLowOnly || r.low);
    const adj = s.invAdjust;

    // ---------- CUSTOMERS ----------
    const byEmail = {};
    (all ? s.orders : s.orders.filter(o => o.store === s.storeId)).forEach(o => {
      const k = o.email; if (!byEmail[k]) byEmail[k] = { name: o.customer, email: o.email, orders: [], city: o.city, st: o.st, address: o.address, zip: o.zip };
      byEmail[k].orders.push(o); });
    let custList = Object.values(byEmail).map(x => ({ ...x, count: x.orders.length, spent: x.orders.reduce((a, o) => a + (o.payment === 'Paid' ? o.total : 0), 0), marketing: x.orders.some(o => o.dayIndex <= 1) }));
    const cq = (s.cuQuery || '').toLowerCase();
    if (cq) custList = custList.filter(x => (x.name + ' ' + x.email + ' ' + x.city).toLowerCase().includes(cq));
    if (s.cuFilter === 'marketing') custList = custList.filter(x => x.marketing);
    if (s.cuFilter === 'repeat') custList = custList.filter(x => x.count > 1);
    const drawerCust = s.cuDrawer ? custList.find(x => x.email === s.cuDrawer) : null;

    // ---------- REVIEWS ----------
    const revAll = s.reviews || [];
    const revScoped = all ? revAll : revAll.filter(r => r.store === s.storeId);
    let revRows = revScoped;
    if (s.rvQuery) revRows = revRows.filter(r => ((r.body || '') + (r.title || '') + (r.name || '')).toLowerCase().includes(s.rvQuery.toLowerCase()));
    if (s.rvProduct) revRows = revRows.filter(r => r.product === s.rvProduct);
    if (s.rvRating) revRows = revRows.filter(r => String(r.rating) === s.rvRating);
    if (s.rvState === 'published') revRows = revRows.filter(r => r.published);
    if (s.rvState === 'hidden') revRows = revRows.filter(r => !r.published);
    if (s.rvState === 'photo') revRows = revRows.filter(r => !!r.image);
    const stars = n => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
    const revSum = revScoped.length ? (revScoped.reduce((a, r) => a + (r.rating || 0), 0) / revScoped.length) : 0;
    const revSel = s.rvSel || {};
    const selIds = Object.keys(revSel).filter(k => revSel[k]);
    const upRev = (id, fn) => this.setState(x => ({ reviews: (x.reviews || []).map(r => r.id === id ? fn({ ...r }) : r) }));
    const imp = s.rvImport;

    // ---------- MARKETING ----------
    const mkTab = s.mkTab || 'campaigns';
    const camps = (s.campaigns || []).filter(x => all || x.store === s.storeId);
    const blocks = s.mkBlocks || [];
    const BT = [['heading','Heading','Headline text'],['text','Text','Paragraph'],['image','Image',''],['button','Button','Button label'],['product','Product','Product name'],['divider','Divider','']];
    const senderFor = x => { const cf = this.storeCfg(x.id) || {}; const d = (cf.domains || []).find(dd => dd.primary) || (cf.domains || [])[0]; return cf.fromEmail || (d ? 'orders@' + d.name : 'orders@' + x.domain); };
    const sender = senderFor(all ? STORES[0] : st);
    const AUTOS = [
      ['Abandoned checkout', 'Checkout started, no order', [['1 hour', 'Still thinking it over?'], ['22 hours', 'Your cart is still here'], ['3 days', 'Last call on your cart']]],
      ['Post-purchase', 'Order paid', [['15 minutes', 'Thanks — here’s what happens next']]],
      ['Shipping confirmation', 'Tracking number added', [['Immediately', 'Your order has shipped']]],
      ['Win-back', 'No order in 45 days', [['45 days', 'It’s been a while']]],
      ['Review request', 'Order delivered', [['14 days', 'How is it working out?']]]
    ];

    // ---------- MEDIA ----------
    const files = s.media || [];
    const mq = (s.mdQuery || '').toLowerCase();
    const shown = files.filter(f => !mq || f.name.toLowerCase().includes(mq));
    const usedIn = f => { let n = 0; prods.forEach(p => (p.media || []).forEach(m => { if (m.url === f.url) n++; })); (s.editorCfg || {}) && Object.values(s.editorCfg || {}).forEach(sec => JSON.stringify(sec).includes(f.url) && n++); return n; };
    const mdUpload = ev => { const list = Array.from((ev.target && ev.target.files) || (ev.dataTransfer && ev.dataTransfer.files) || []);
      if (!list.length) return;
      list.forEach((file, i) => { const rd = new FileReader();
        this.setState({ mdUploadName: file.name, mdUploadPct: 10 });
        rd.onload = () => { this.setState(x => ({ media: [...(x.media || []), { id: 'm' + Date.now() + i, name: file.name, url: rd.result, size: (file.size / 1024 > 1024 ? (file.size / 1048576).toFixed(1) + ' MB' : Math.round(file.size / 1024) + ' KB'), type: file.type || 'image' }], mdUploadPct: 100 }));
          setTimeout(() => this.setState({ mdUploadName: null }), 600); };
        rd.readAsDataURL(file); }); };

    // ---------- THEME EDITOR ----------
    const SECTIONS = [
      ['buy', 'Buy box', [['title','Product title','text'],['subtitle','Subtitle','area'],['image','Main image','image'],['cta','Button label','text'],['reassurance','Under-button line','text']], null],
      ['videofaq', 'Video with FAQ', [['title','Heading','text'],['video','Video','image']], ['faqs', 'Questions', 'question', [['q','Question','text'],['a','Answer','area']]]],
      ['social', 'Social proof images', [['title','Heading','text']], ['images', 'Images', 'image', [['image','Image','image'],['caption','Caption','text']]]],
      ['clips', 'Video clips', [['title','Heading','text']], ['clips', 'Clips', 'clip', [['video','Video','image'],['label','Label','text']]]],
      ['grid', 'Product grid', [['title','Heading','text']], ['tiles', 'Tiles', 'tile', [['image','Image','image'],['title','Title','text'],['price','Price','text']]]],
      ['trust', 'Trust icons', [['title','Heading','text']], ['icons', 'Icons', 'icon', [['icon','Icon','image'],['label','Label','text']]]],
      ['steps', 'Three steps', [['title','Heading','text']], ['steps', 'Steps', 'step', [['title','Step title','text'],['text','Step text','area']]]],
      ['benefits', 'Benefits', [['title','Heading','text']], ['items', 'Benefits', 'benefit', [['title','Benefit','text'],['text','Detail','area']]]],
      ['features', 'Features', [['title','Heading','text']], ['items', 'Features', 'feature', [['image','Image','image'],['title','Feature','text'],['text','Detail','area']]]],
      ['compare', 'Comparison table', [['title','Heading','text'],['us','Your column label','text'],['them','Their column label','text']], ['rows', 'Rows', 'row', [['label','Row label','text'],['us','Yours','text'],['them','Theirs','text']]]],
      ['reviews', 'Reviews', [['title','Heading','text']], null],
      ['whofor', 'Who it’s for', [['title','Heading','text']], ['items', 'Audiences', 'audience', [['title','Who','text'],['text','Why','area']]]],
      ['box', 'What’s in the box', [['title','Heading','text'],['image','Photo','image']], ['items', 'Contents', 'item', [['title','Item','text']]]],
      ['specs', 'Specifications', [['title','Heading','text']], ['rows', 'Specs', 'spec', [['label','Spec','text'],['value','Value','text']]]],
      ['cta', 'Closing CTA', [['title','Heading','text'],['subtitle','Sub-line','area'],['cta','Button label','text']], null]
    ];
    const ecfg = (s.editorCfg || {});
    const hidden = s.editorHidden || {};
    const sel = s.editorSel;
    const secDef = SECTIONS.find(x => x[0] === sel);
    const setSec = (key, fn) => this.setState(x => { const cfg = { ...(x.editorCfg || {}) }; cfg[key] = fn({ ...(cfg[key] || {}) }); return { editorCfg: cfg, dirty: true }; });
    const pickInto = (onPick) => this.setState({ mdPicker: { onPick } });
    const fieldOf = (key, f) => { const cur = (ecfg[key] || {})[f[0]] || '';
      return { label: f[1], isText: f[2] === 'text', isArea: f[2] === 'area', isImage: f[2] === 'image',
        value: f[2] === 'image' ? (cur ? cur.split('/').pop().slice(0, 28) : 'Choose image…') : cur, placeholder: f[1],
        set: e => { const val = e.target.value; setSec(key, d => { d[f[0]] = val; return d; }); },
        pick: () => pickInto(file => setSec(key, d => { d[f[0]] = file.url; return d; })) }; };
    const blocksOf = key => ((ecfg[key] || {}).blocks || []);
    const previewOf = () => SECTIONS.filter(x => !hidden[x[0]]).map(x => {
      const key = x[0], d = ecfg[key] || {}, bl = d.blocks || [];
      if (key === 'specs') { const rows = bl.map(b => ({ label: b.label || 'Spec', value: b.value || 'Spec pending', color: b.value ? '#1A1A1A' : '#9A9A9A' }));
        return { key, name: x[1], isBuy: false, isReviews: false, isSpecs: true, isGeneric: false, pad: '18px', title: d.title || x[1], rows, rowsEmpty: rows.length === 0 }; }
      if (key === 'buy') { const p = prods[0];
        return { key, name: x[1], isBuy: true, isReviews: false, isSpecs: false, isGeneric: false, pad: '18px', title: d.title || (p ? p.title : '') || 'Product title', subtitle: d.subtitle || 'Add a subtitle in the editor',
          image: d.image ? 'url("' + d.image + '")' : 'none', imageLabel: d.image ? '' : 'Main image',
          options: (p ? (p.options || []) : []).map((o, i) => ({ label: o.label || 'Option', sublabel: o.sublabel || '', price: o.price ? '$' + o.price : '$0.00', border: i === 0 ? '#1A1A1A' : '#E3E3E3', dot: i === 0 ? '#1A1A1A' : '#C9C9C9' })),
          noOptions: !(p && (p.options || []).length), cta: d.cta || 'Add to cart', reassurance: d.reassurance || '' }; }
      if (key === 'reviews') { const pub = revScoped.filter(r => r.published);
        return { key, name: x[1], isBuy: false, isReviews: true, isSpecs: false, isGeneric: false, pad: '18px', title: d.title || 'Reviews',
          reviews: pub.slice(0, 3).map(r => ({ name: r.name, stars: stars(r.rating || 5), body: (r.body || '').slice(0, 110), thumb: r.image ? 'url("' + r.image + '")' : 'none' })), reviewsEmpty: pub.length === 0 }; }
      const items = bl.map(b => ({ title: b.title || b.q || b.label || b.item || '—', text: b.text || b.a || b.value || b.them || '', hasText: !!(b.text || b.a || b.value), hasImage: !!b.image || !!b.video || !!b.icon, image: (b.image || b.video || b.icon) ? 'url("' + (b.image || b.video || b.icon) + '")' : 'none' }));
      return { key, name: x[1], isBuy: false, isReviews: false, isSpecs: false, isGeneric: true, pad: '18px', kicker: x[1], title: d.title || x[1], body: d.subtitle || '', hasBody: !!d.subtitle,
        hasItems: items.length > 0, items, itemCols: items.length > 2 ? 'repeat(3,minmax(0,1fr))' : items.length === 2 ? 'repeat(2,minmax(0,1fr))' : '1fr',
        isEmptySection: items.length === 0 && x[3], emptyHint: x[3] ? 'No ' + x[3][1].toLowerCase() + ' yet — add one in the panel' : '' };
    });

    return {
      storeList: STORES, navExtra: [
        ['inventory', 'Inventory', 'M3 6.5 10 3l7 3.5v7L10 17l-7-3.5zM3 6.5 10 10l7-3.5M10 10v7'],
        ['customers', 'Customers', 'M10 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4 17c0-3 2.7-4.6 6-4.6S16 14 16 17'],
        ['reviews', 'Reviews', 'M10 3l2.2 4.5 5 .7-3.6 3.5.9 4.9L10 14.3l-4.5 2.3.9-4.9L2.8 8.2l5-.7z'],
        ['marketing', 'Marketing', 'M3 7.5h3.5L13 4v12L6.5 12.5H3zM16 8.5v3']
      ].map(([k, label, icon]) => ({ label, icon, go: () => this.go(k), bg: R === k ? 'var(--side-active)' : 'transparent', shadow: R === k ? 'var(--shadow)' : 'none', rail: R === k ? 'var(--accent)' : 'transparent',
        hasCount: k === 'reviews' ? revAll.length > 0 : false, count: k === 'reviews' ? String(revAll.length) : '' })),
      goAnalytics2: () => this.go('analytics'), goReviews: () => this.go('reviews'),
      isStore: R === 'store', goEditorBtn: () => this.go('editor'),
      healthNote: all ? 'across ' + STORES.length + ' stores' : st.domain,
      healthRows: (() => {
        const list = all ? STORES : [st];
        const g = '#22C55E', n2 = 'var(--ink-3)';
        const cfs = list.map(x => this.storeCfg(x.id) || {});
        const doms = cfs.map(cf => (cf.domains || []).find(d => d.primary) || (cf.domains || [])[0]);
        const connected = doms.filter(d => d && d.status === 'Connected').length;
        const ssl = doms.filter(d => d && d.ssl === 'Active').length;
        const pay = cfs.filter(cf => (cf.providers || []).some(p => p.connected)).length;
        const meta = cfs.filter(cf => cf.pixel && cf.capiToken).length;
        const of = k => all ? k + ' of ' + list.length + ' stores' : (k ? 'ready' : 'not set up yet');
        return [
          { label: 'Domain', help: all ? of(connected) : (doms[0] ? doms[0].name + ' · ' + doms[0].status : 'No domain connected'), dot: connected === list.length ? g : n2, open: () => this.setState({ setTab: 'domains' }, () => this.go('settings')) },
          { label: 'SSL certificate', help: all ? of(ssl) : (doms[0] ? 'SSL ' + doms[0].ssl : 'Connect a domain first'), dot: ssl === list.length && ssl > 0 ? g : n2, open: () => this.setState({ setTab: 'domains' }, () => this.go('settings')) },
          { label: 'Payments', help: all ? of(pay) : (pay ? 'Stripe connected' : 'No provider connected'), dot: pay === list.length && pay > 0 ? g : n2, open: () => this.setState({ setTab: 'payments' }, () => this.go('settings')) },
          { label: 'Products', help: prods.length ? prods.length + ' product' + (prods.length === 1 ? '' : 's') + ' · ' + prods.filter(p => p.status === 'Active').length + ' active' : 'Nothing to sell yet', dot: prods.length ? g : n2, open: () => this.go('products') },
          { label: 'Meta', help: all ? of(meta) : (meta ? 'Pixel and CAPI connected' : 'Pixel not connected'), dot: meta === list.length && meta > 0 ? g : n2, open: () => this.go('meta') }
        ]; })(),
      os: (() => {
        const sub = s.osTab || 'themes', cf = all ? {} : (this.storeCfg(s.storeId) || {});
        const dom = (cf.domains || []).find(d => d.primary) || (cf.domains || [])[0];
        const brand = ((ecfg.buy || {}).title || (all ? 'Your store' : st.name));
        const pages = s.pages || [];
        const pg = s.pageEdit ? pages.find(p => p.id === s.pageEdit) : null;
        const upPage = (id, fn) => this.setState(x => ({ pages: (x.pages || []).map(p => p.id === id ? fn({ ...p }) : p), dirty: true }));
        const menus = [['header', 'Header menu', 'top navigation'], ['footer', 'Footer menu', 'footer']];
        const navData = s.navMenus || { header: [], footer: [] };
        const upMenu = (k, fn) => this.setState(x => { const nm = { ...(x.navMenus || { header: [], footer: [] }) }; nm[k] = fn((nm[k] || []).map(l => ({ ...l }))); return { navMenus: nm, dirty: true }; });
        const prefs = s.prefs || {};
        const setPref = (k, val) => this.setState(x => ({ prefs: { ...(x.prefs || {}), [k]: val }, dirty: true }));
        return {
          tabs: [['themes','Themes'],['pages','Pages'],['navigation','Navigation'],['preferences','Preferences']].map(([k, label]) => ({ label, bg: sub === k ? 'var(--accent-soft)' : 'transparent', color: sub === k ? 'var(--ink)' : 'var(--ink-2)', select: () => this.setState({ osTab: k, pageEdit: null }) })),
          isThemes: sub === 'themes', isPages: sub === 'pages', isNav: sub === 'navigation', isPrefs: sub === 'preferences',
          domain: dom ? dom.name : (all ? 'no domain' : st.domain), brand: String(brand).split(' ')[0] || 'Store',
          themeCols: isM ? '1fr' : 'minmax(0,300px) minmax(0,1fr)',
          themeName: (all ? 'Storefront' : st.name) + ' — custom', themeUpdated: s.themeUpdated || 'not yet',
          heroImage: (ecfg.buy || {}).image ? 'url("' + (ecfg.buy || {}).image + '")' : 'none',
          visibleCount: SECTIONS.filter(x => !hidden[x[0]]).length,
          customize: () => this.go('editor'),
          actionsOpen: !!s.osActions, toggleActions: e => { c.stop(e); this.setState({ osActions: !s.osActions }); },
          actions: [
            ['Preview', () => this.toast('Opening a preview of ' + (dom ? dom.name : 'the storefront'))],
            ['Rename', () => this.toast('Theme names come from the store name')],
            ['Duplicate', () => { this.setState(x => ({ themeLib: [...(x.themeLib || []), { id: 't' + Date.now(), name: (all ? 'Storefront' : st.name) + ' — copy', date: 'just now' }], osActions: false })); this.toast('Version saved to the library'); }],
            ['Download', () => this.toast('Zipping the current content as JSON')],
            ['View store', () => this.toast(dom ? 'Opening ' + dom.name : 'Connect a domain first')]
          ].map(([label, run]) => ({ label, run: () => { this.setState({ osActions: false }); run(); } })),
          library: (s.themeLib || []).map(l => ({ ...l,
            restore: () => this.toast('Restored ' + l.name),
            remove: () => this.setState(x => ({ themeLib: (x.themeLib || []).filter(q => q.id !== l.id) })) })),
          libraryEmpty: !(s.themeLib || []).length,
          pgCols: isM ? '1fr 80px' : 'minmax(0,1.4fr) minmax(0,1fr) 110px 80px',
          pages: pages.map(p => ({ ...p, track: p.visible ? 'var(--accent)' : 'var(--border-strong)', knob: p.visible ? '18px' : '2px',
            open: () => this.setState({ pageEdit: p.id }),
            toggle: () => upPage(p.id, x => { x.visible = !x.visible; return x; }) })),
          pageList: !pg, pageEditing: !!pg,
          pageTitle: pg ? (pg.title || 'Untitled page') : '', pageHandle: pg ? pg.handle : '',
          pageTitleVal: pg ? pg.title : '', setPageTitle: e => { const val = e.target.value; upPage(pg.id, x => { x.title = val; return x; }); },
          pageBody: pg ? pg.body : '', setPageBody: e => { const val = e.target.value; upPage(pg.id, x => { x.body = val; return x; }); },
          pageWords: pg ? ((pg.body || '').trim() ? (pg.body.trim().split(/\s+/).length + ' words') : 'Empty — this page shows nothing yet') : '',
          savePage: () => { upPage(pg.id, x => { x.updated = 'just now'; return x; }); this.setState({ dirty: false }); this.toast('Page saved'); },
          closePage: () => this.setState({ pageEdit: null }),
          addPage: () => { const id = 'pg' + Date.now(); this.setState(x => ({ pages: [...(x.pages || []), { id, title: '', handle: '/new-page', body: '', updated: 'never', visible: false }], pageEdit: id })); },
          destinations: [(all ? 'Product page' : st.product), 'Cart', ...pages.map(p => p.handle)],
          menus: menus.map(([k, name, where]) => ({ name, where, empty: !(navData[k] || []).length,
            add: () => upMenu(k, arr => [...arr, { label: '', dest: '', url: '' }]),
            links: (navData[k] || []).map((l, i) => ({ ...l, isCustom: l.dest === 'custom',
              setLabel: e => { const val = e.target.value; upMenu(k, arr => { arr[i].label = val; return arr; }); },
              setDest: e => { const val = e.target.value; upMenu(k, arr => { arr[i].dest = val; return arr; }); },
              setUrl: e => { const val = e.target.value; upMenu(k, arr => { arr[i].url = val; return arr; }); },
              remove: () => upMenu(k, arr => arr.filter((_, q) => q !== i)),
              dragStart: () => { this._navDrag = k + ':' + i; }, dragOver: e => e.preventDefault(),
              drop: e => { e.preventDefault(); const d = this._navDrag; if (!d) return; const [dk, di] = d.split(':');
                if (dk !== k || +di === i) return; upMenu(k, arr => { const [m] = arr.splice(+di, 1); arr.splice(i, 0, m); return arr; }); this._navDrag = null; } })) })),
          prefCols: isM ? '1fr' : 'minmax(0,1fr) minmax(0,1fr)',
          seoTitle: prefs.seoTitle || '', setSeoTitle: e => setPref('seoTitle', e.target.value),
          seoDesc: prefs.seoDesc || '', setSeoDesc: e => setPref('seoDesc', e.target.value),
          seoTitleCount: (prefs.seoTitle || '').length + ' of 60 characters',
          seoDescCount: (prefs.seoDesc || '').length + ' of 155 characters',
          seoUrl: dom ? dom.name + ' › product' : 'yourstore.com › product',
          seoTitlePreview: prefs.seoTitle || (all ? 'Your store title appears here' : st.name + ' — add a title'),
          seoDescPreview: prefs.seoDesc || 'Your meta description appears here. Google shows about 155 characters.',
          socialBg: prefs.social ? 'url("' + prefs.social + '")' : 'none', socialBtn: prefs.social ? 'Change image' : 'Choose image',
          pickSocial: () => pickInto(file => setPref('social', file.url)),
          faviconBg: prefs.favicon ? 'url("' + prefs.favicon + '")' : 'none', faviconBtn: prefs.favicon ? 'Change favicon' : 'Choose favicon',
          pickFavicon: () => pickInto(file => setPref('favicon', file.url)),
          pwdOn: !!prefs.pwdOn, pwdTrack: prefs.pwdOn ? 'var(--accent)' : 'var(--border-strong)', pwdKnob: prefs.pwdOn ? '18px' : '2px',
          togglePwd: () => setPref('pwdOn', !prefs.pwdOn),
          pwd: prefs.pwd || '', setPwd: e => setPref('pwd', e.target.value),
          pwdMsg: prefs.pwdMsg || '', setPwdMsg: e => setPref('pwdMsg', e.target.value)
        };
      })(),

      isInventory: R === 'inventory', isCustomers: R === 'customers', isReviews: R === 'reviews', isMarketing: R === 'marketing', isMedia: R === 'media', isEditor: R === 'editor',
      iv: { query: s.invQuery || '', setQuery: e => this.setState({ invQuery: e.target.value }),
        store: s.invStore || '', setStore: e => this.setState({ invStore: e.target.value }),
        lowOnly: !!s.invLowOnly, toggleLow: () => this.setState({ invLowOnly: !s.invLowOnly }),
        rows: invRows, hasRows: invRows.length > 0, empty: invRows.length === 0,
        emptyTitle: invBase.length ? 'Nothing matches' : 'No stock to track yet',
        emptyBody: invBase.length ? 'Try another search, or turn off the low-stock filter.' : 'Add a product with bundle options in Products — each option becomes a tracked variant here.',
        adjustOpen: !!adj, adjustName: adj ? adj.name : '', adjustFrom: adj ? adj.from : 0,
        adjustTo: adj ? Math.max(0, adj.from + num(s.invAdjustQty)) : 0,
        adjustQty: s.invAdjustQty || '', setAdjustQty: e => this.setState({ invAdjustQty: e.target.value }),
        adjustReason: s.invAdjustReason || 'Received from supplier', setAdjustReason: e => this.setState({ invAdjustReason: e.target.value }),
        closeAdjust: () => this.setState({ invAdjust: null }),
        applyAdjust: () => { const d = num(s.invAdjustQty); if (!d) { this.toast('Enter a quantity'); return; }
          this.setInv(adj.key, x => { x.available = Math.max(0, (x.available || 0) + d); return x; });
          this.setState({ invAdjust: null }); this.toast((d > 0 ? '+' : '') + d + ' · ' + (s.invAdjustReason || '').toLowerCase()); } },
      cu: { query: s.cuQuery || '', setQuery: e => this.setState({ cuQuery: e.target.value }),
        filter: s.cuFilter || '', setFilter: e => this.setState({ cuFilter: e.target.value }),
        cols: (typeof window !== 'undefined' && window.innerWidth < 1100) ? 'minmax(90px,1fr) minmax(120px,1.3fr) 44px 76px minmax(80px,auto) 92px' : 'minmax(140px,1.1fr) minmax(160px,1.4fr) 64px 96px minmax(110px,auto) 104px',
        rows: custList.map(x => ({ name: x.name, email: x.email, orders: String(x.count), spent: money(x.spent), location: x.city + ', ' + x.st,
          marketing: x.marketing ? 'Subscribed' : 'No', mkKind: x.marketing ? 'success' : 'neutral', open: () => this.setState({ cuDrawer: x.email }) })),
        hasRows: custList.length > 0, empty: custList.length === 0,
        emptyTitle: 'No customers yet', emptyBody: 'Anyone who checks out appears here with their orders and lifetime spend.',
        export: () => this.toast(custList.length ? 'Exporting ' + custList.length + ' customers' : 'Nothing to export yet'),
        drawer: !!drawerCust, closeDrawer: () => this.setState({ cuDrawer: null }),
        d: drawerCust ? { name: drawerCust.name, email: drawerCust.email, orders: String(drawerCust.count), spent: money(drawerCust.spent),
          address: drawerCust.address, cityLine: drawerCust.city + ', ' + drawerCust.st + ' ' + drawerCust.zip,
          marketing: drawerCust.marketing ? 'Subscribed' : 'Not subscribed', mkKind: drawerCust.marketing ? 'success' : 'neutral',
          orderList: drawerCust.orders.map(o => ({ number: o.number, date: o.date, bundle: o.bundle, total: money(o.total), state: STATE_LABEL[o.state], kind: STATE_KIND[o.state], open: () => { this.setState({ cuDrawer: null }); this.go('order', o.id); } })) } : {} },
      rv: { avg: revScoped.length ? revSum.toFixed(1) : '—', avgStars: revScoped.length ? stars(Math.round(revSum)) : '☆☆☆☆☆',
        total: String(revScoped.length), photoPct: revScoped.length ? Math.round(revScoped.filter(r => r.image).length / revScoped.length * 100) + '%' : '0%',
        sumCols: isM ? '1fr 1fr' : '150px 120px 120px minmax(0,1fr)',
        dist: [5,4,3,2,1].map(n => { const cnt = revScoped.filter(r => r.rating === n).length; return { star: n, count: cnt, pct: revScoped.length ? Math.round(cnt / revScoped.length * 100) + '%' : '0%' }; }),
        query: s.rvQuery || '', setQuery: e => this.setState({ rvQuery: e.target.value }),
        fProduct: s.rvProduct || '', setFProduct: e => this.setState({ rvProduct: e.target.value }),
        fRating: s.rvRating || '', setFRating: e => this.setState({ rvRating: e.target.value }),
        fState: s.rvState || '', setFState: e => this.setState({ rvState: e.target.value }),
        productNames: prodNames, cols: (typeof window !== 'undefined' && window.innerWidth < 1180) ? '40px 40px minmax(140px,1fr) 84px minmax(150px,180px) 62px' : '52px 44px minmax(240px,2fr) minmax(110px,auto) minmax(160px,auto) 74px',
        rows: revRows.map((r, i) => ({ ...r, selected: !!revSel[r.id], bg: revSel[r.id] ? 'var(--accent-soft)' : 'transparent',
          stars: stars(r.rating || 0), thumb: r.image ? 'url("' + r.image + '")' : 'none', thumbText: r.image ? '' : 'No photo',
          date: r.date || '—', country: r.country || '—', product: r.product || '—',
          noSource: !r.source, sourceBorder: r.source ? 'var(--input-border)' : 'var(--critical)',
          pubTrack: r.published ? 'var(--accent)' : 'var(--border-strong)', pubKnob: r.published ? '18px' : '2px',
          toggle: () => this.setState(x => ({ rvSel: { ...(x.rvSel || {}), [r.id]: !(x.rvSel || {})[r.id] } })),
          setTitle: e => { const val = e.target.value; upRev(r.id, x => { x.title = val; return x; }); },
          setBody: e => { const val = e.target.value; upRev(r.id, x => { x.body = val; return x; }); },
          setSource: e => { const val = e.target.value; upRev(r.id, x => { x.source = val; if (!val) x.published = false; return x; }); },
          togglePub: () => { if (!r.source) { this.toast('Choose a source first — I never guess where a review came from'); return; } upRev(r.id, x => { x.published = !x.published; return x; }); },
          remove: () => this.setState({ confirm: { title: 'Delete this review?', body: 'It disappears from the storefront immediately.', label: 'Delete', critical: true, onConfirm: () => this.setState(x => ({ reviews: (x.reviews || []).filter(q => q.id !== r.id) })) } }),
          dragStart: () => { this._rvDrag = i; }, dragOver: e => e.preventDefault(),
          drop: e => { e.preventDefault(); const from = this._rvDrag; if (from == null || from === i) return;
            this.setState(x => { const arr = (x.reviews || []).slice(); const [m] = arr.splice(from, 1); arr.splice(i, 0, m); return { reviews: arr }; }); this._rvDrag = null; } })),
        empty: revRows.length === 0, emptyTitle: revScoped.length ? 'No reviews match' : 'No reviews yet',
        emptyBody: revScoped.length ? 'Try a different search or clear the filters.' : 'Import a CSV, JSON or ZIP from your old review app, or add one by hand. Nothing is ever generated for you.',
        hasSel: selIds.length > 0, selCount: selIds.length, clearSel: () => this.setState({ rvSel: {} }),
        bulkPublish: () => { let blocked = 0; this.setState(x => ({ reviews: (x.reviews || []).map(r => { if (!selIds.includes(r.id)) return r; if (!r.source) { blocked++; return r; } return { ...r, published: true }; }), rvSel: {} }), () => this.toast(blocked ? blocked + ' skipped — source not set' : selIds.length + ' published')); },
        bulkHide: () => { this.setState(x => ({ reviews: (x.reviews || []).map(r => selIds.includes(r.id) ? { ...r, published: false } : r), rvSel: {} })); this.toast(selIds.length + ' unpublished'); },
        bulkDelete: () => this.setState({ confirm: { title: 'Delete ' + selIds.length + ' reviews?', body: 'This cannot be undone.', label: 'Delete', critical: true, onConfirm: () => this.setState(x => ({ reviews: (x.reviews || []).filter(r => !selIds.includes(r.id)), rvSel: {} })) } }),
        reassign: '', setReassign: e => { const val = e.target.value; if (!val) return; this.setState(x => ({ reviews: (x.reviews || []).map(r => selIds.includes(r.id) ? { ...r, product: val } : r), rvSel: {} })); this.toast(selIds.length + ' moved to ' + val); },
        exportCsv: () => this.toast(revScoped.length ? 'Exporting ' + revScoped.length + ' reviews' : 'Nothing to export yet'),
        addManual: () => { const id = 'r' + Date.now();
          this.setState(x => ({ reviews: [{ id, store: all ? 'gk' : s.storeId, name: '', rating: 5, title: '', body: '', date: '', country: '', image: '', verified: false, source: '', published: false, product: prodNames[0] || '' }, ...(x.reviews || [])] }));
          this.toast('Blank review added — fill it in and choose a source'); },
        openImport: () => this.setState({ rvImport: { step: 1 } }),
        closeImport: () => this.setState({ rvImport: null }),
        importOpen: !!imp, impStep1: !!imp && imp.step === 1, impStep2: !!imp && imp.step === 2, impStep3: !!imp && imp.step === 3, impStep4: !!imp && imp.step === 4,
        importTitle: imp && imp.step === 2 ? 'Map your columns' : imp && imp.step >= 3 ? 'Importing' : 'Import reviews',
        impFileName: imp ? imp.fileName : '', impRowCount: imp ? String(imp.rows || 0) : '0', impImages: imp ? (imp.images ? imp.images + ' images found' : 'no image folder') : '',
        impHeaders: imp ? (imp.headers || []) : [], impPreview: imp ? (imp.preview || []) : [],
        impMap: imp ? (imp.headers || []).map((h, i) => ({ column: h, target: (imp.map || {})[h] || '',
          set: e => { const val = e.target.value; this.setState(x => ({ rvImport: { ...x.rvImport, map: { ...(x.rvImport.map || {}), [h]: val } } })); } })) : [],
        impProduct: imp ? (imp.product || prodNames[0] || '') : '', setImpProduct: e => { const val = e.target.value; this.setState(x => ({ rvImport: { ...x.rvImport, product: val } })); },
        impSource: imp ? (imp.source || '') : '', setImpSource: e => { const val = e.target.value; this.setState(x => ({ rvImport: { ...x.rvImport, source: val } })); },
        impSourceBorder: imp && imp.source ? 'var(--input-border)' : 'var(--critical)',
        impPct: imp ? (imp.pct || 0) + '%' : '0%', impProgressText: imp ? (imp.progressText || '') : '',
        impDone: imp ? String(imp.done || 0) : '0', impSkipped: imp ? String(imp.skipped || 0) : '0', impSummary: imp ? (imp.summary || '') : '',
        dragOver: e => e.preventDefault(), dropFile: e => { e.preventDefault(); this.readReviewFile((e.dataTransfer.files || [])[0]); },
        pickFile: e => this.readReviewFile((e.target.files || [])[0]),
        runImport: () => this.runReviewImport() },
      mk: { tabs: [['campaigns','Campaigns'],['automations','Automations'],['subscribers','Subscribers']].map(([k, label]) => ({ label, bg: mkTab === k ? 'var(--accent-soft)' : 'transparent', color: mkTab === k ? 'var(--ink)' : 'var(--ink-2)', select: () => this.setState({ mkTab: k, mkBuilder: false }) })),
        isCampaigns: mkTab === 'campaigns', showCampaigns: mkTab === 'campaigns' && !s.mkBuilder, showAutomations: mkTab === 'automations', showSubscribers: mkTab === 'subscribers',
        showBuilder: mkTab === 'campaigns' && !!s.mkBuilder, builderCols: isM ? '1fr' : 'minmax(0,1fr) minmax(0,1fr)',
        create: () => this.setState({ mkTab: 'campaigns', mkBuilder: true }), closeBuilder: () => this.setState({ mkBuilder: false }),
        campCols: isM ? '1fr auto' : 'minmax(0,1.6fr) 110px 90px 90px 90px 100px',
        campaigns: camps.map(x => ({ ...x, kind: x.status === 'Sent' ? 'success' : x.status === 'Scheduled' ? 'info' : 'neutral' })),
        campaignsEmpty: camps.length === 0, hasCampaigns: camps.length > 0,
        audience: s.mkAudience || 'All subscribers (0)', setAudience: e => this.setState({ mkAudience: e.target.value }),
        subject: s.mkSubject || '', setSubject: e => this.setState({ mkSubject: e.target.value }),
        preheader: s.mkPre || '', setPreheader: e => this.setState({ mkPre: e.target.value }),
        blockTypes: BT.map(([k, label]) => ({ label, add: () => this.setState(x => ({ mkBlocks: [...(x.mkBlocks || []), { id: 'b' + Date.now(), type: k, value: '' }] })) })),
        blocks: blocks.map((b, i) => ({ type: b.type, value: b.value, editable: b.type !== 'image' && b.type !== 'divider', isImage: b.type === 'image',
          placeholder: (BT.find(t => t[0] === b.type) || [])[2] || '',
          set: e => { const val = e.target.value; this.setState(x => ({ mkBlocks: (x.mkBlocks || []).map((q, k) => k === i ? { ...q, value: val } : q) })); },
          pick: () => pickInto(file => this.setState(x => ({ mkBlocks: (x.mkBlocks || []).map((q, k) => k === i ? { ...q, value: file.url } : q) }))),
          remove: () => this.setState(x => ({ mkBlocks: (x.mkBlocks || []).filter((_, k) => k !== i) })),
          dragStart: () => { this._mkDrag = i; }, dragOver: e => e.preventDefault(),
          drop: e => { e.preventDefault(); const from = this._mkDrag; if (from == null || from === i) return; this.setState(x => { const arr = (x.mkBlocks || []).slice(); const [m] = arr.splice(from, 1); arr.splice(i, 0, m); return { mkBlocks: arr }; }); this._mkDrag = null; } })),
        previewSubject: s.mkSubject || 'Subject line', previewPre: s.mkPre || 'Preview text appears here', previewFrom: 'From ' + sender, previewFooter: (all ? 'Your store' : st.name),
        previewEmpty: blocks.length === 0,
        previewBlocks: blocks.map(b => ({ isHeading: b.type === 'heading', isText: b.type === 'text', isButton: b.type === 'button', isDivider: b.type === 'divider', isImg: b.type === 'image', isProduct: b.type === 'product',
          value: b.value || ((BT.find(t => t[0] === b.type) || [])[2] || ''), bg: b.type === 'image' && b.value ? 'url("' + b.value + '")' : 'none', label: b.value ? '' : 'Image' })),
        schedule: s.mkSchedule || '', setSchedule: e => this.setState({ mkSchedule: e.target.value }),
        sendNow: () => { if (!(s.mkSubject || '').trim()) { this.toast('Add a subject first'); return; }
          this.setState(x => ({ campaigns: [...(x.campaigns || []), { id: 'c' + Date.now(), store: all ? 'gk' : s.storeId, subject: x.mkSubject, audience: x.mkAudience || 'All subscribers (0)', status: 'Sent', recipients: '0', open: '—', click: '—', revenue: '$0.00' }], mkBuilder: false, mkSubject: '', mkPre: '', mkBlocks: [] }));
          this.toast('Campaign sent to 0 subscribers — nobody is on the list yet'); },
        scheduleSend: () => { if (!(s.mkSchedule || '').trim()) { this.toast('Enter a send time'); return; }
          this.setState(x => ({ campaigns: [...(x.campaigns || []), { id: 'c' + Date.now(), store: all ? 'gk' : s.storeId, subject: x.mkSubject || 'Untitled', audience: x.mkAudience || 'All subscribers (0)', status: 'Scheduled', recipients: '0', open: '—', click: '—', revenue: '$0.00' }], mkBuilder: false }));
          this.toast('Scheduled for ' + s.mkSchedule); },
        automations: AUTOS.map(([name, trigger, steps], i) => { const on = (s.autos || {})[name] !== false;
          return { name, trigger, statusLabel: on ? 'Active' : 'Paused', kind: on ? 'success' : 'neutral',
            track: on ? 'var(--accent)' : 'var(--border-strong)', knob: on ? '18px' : '2px',
            toggle: () => this.setState(x => ({ autos: { ...(x.autos || {}), [name]: !on } })),
            sender, sentCount: '0',
            steps: steps.map(([delay, subject]) => ({ delay, subject, body: 'Sent from ' + sender + ' · edit the copy and blocks', edit: () => { this.setState({ mkTab: 'campaigns', mkBuilder: true, mkSubject: subject, mkBlocks: [{ id: 'b1', type: 'heading', value: subject }, { id: 'b2', type: 'text', value: '' }, { id: 'b3', type: 'button', value: 'Complete your order' }] }); this.toast('Editing “' + subject + '”'); } })) }; }),
        subQuery: s.mkSubQuery || '', setSubQuery: e => this.setState({ mkSubQuery: e.target.value }),
        subCols: isM ? '1fr auto' : 'minmax(0,1.6fr) 130px 110px 110px',
        subs: (s.subscribers || []).filter(x => !s.mkSubQuery || x.email.toLowerCase().includes((s.mkSubQuery || '').toLowerCase())).map(x => ({ ...x, kind: x.status === 'Subscribed' ? 'success' : 'neutral' })),
        subsEmpty: !(s.subscribers || []).length,
        importSubs: e => { const file = (e.target.files || [])[0]; if (!file) return;
          const rd = new FileReader();
          rd.onload = () => { const lines = String(rd.result).split(/\r?\n/).filter(x => x.trim() && x.includes('@'));
            this.setState(x => ({ subscribers: [...(x.subscribers || []), ...lines.map((l, i) => ({ id: 's' + Date.now() + i, email: l.split(',')[0].trim(), source: 'Imported · ' + file.name, status: 'Subscribed', date: 'Today' }))] }));
            this.toast(lines.length + ' subscribers imported'); };
          rd.readAsText(file); },
        exportSubs: () => this.toast((s.subscribers || []).length ? 'Exporting ' + (s.subscribers || []).length + ' subscribers' : 'Nothing to export yet') },
      ed: (() => {
        const ICONS = { buy: 'M4 4h12v13l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L4 17z', videofaq: 'M3 5h14v10H3zM8 8l4 2-4 2z', social: 'M3 5h14v10H3zm0 7 4-4 4 4 3-3 3 3', clips: 'M3 5h14v10H3zM7 5v10M13 5v10', grid: 'M3 3h6v6H3zM11 3h6v6h-6zM3 11h6v6H3zM11 11h6v6h-6z', trust: 'M10 3l6 2.5v5c0 3.5-2.5 5.5-6 6.5-3.5-1-6-3-6-6.5v-5z', steps: 'M3 15h4V9H3zM8 15h4V5H8zM13 15h4v-4h-4z', benefits: 'M4 10.5 8 14l8-8', features: 'M10 3l2.2 4.5 5 .7-3.6 3.5.9 4.9L10 14.3l-4.5 2.3.9-4.9L2.8 8.2l5-.7z', compare: 'M3 4h14M3 10h14M3 16h14M10 3v14', reviews: 'M3 5h14v8H8l-5 4z', whofor: 'M10 9.5a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2zM4 16c0-2.6 2.7-4 6-4s6 1.4 6 4', box: 'M3 6.5 10 3l7 3.5v7L10 17l-7-3.5zM3 6.5 10 10l7-3.5M10 10v7', specs: 'M4 5h12M4 10h12M4 15h8', cta: 'M4 7h12v6H4zM7 10h6' };
        const sel2 = sel, secDef2 = secDef;
        const openB = s.edBlockOpen === undefined ? 0 : s.edBlockOpen;
        const zoom = s.edZoom || 1;
        const dev = s.edDevice || 'desktop';
        const imgField = (key, f) => { const cur = (ecfg[key] || {})[f[0]] || '';
          return { bg: cur ? 'url("' + cur + '")' : 'none', thumbText: cur ? '' : 'Empty', fileName: cur ? String(cur).split('/').pop().slice(0, 24) : 'No image chosen',
            clearOpacity: cur ? 1 : .4, clear: () => setSec(key, d => { d[f[0]] = ''; return d; }) }; };
        const blockSummary = (b, bf) => { const first = bf.map(x => b[x[0]]).find(x => x && String(x).trim() && !String(x).startsWith('data:'));
          return first ? String(first).slice(0, 34) : 'Empty block'; };
        return {
        themeName: (all ? 'Storefront' : st.name) + ' — custom', domain: all ? '—' : st.domain,
        brandName: ((ecfg.buy || {}).title ? String((ecfg.buy || {}).title).split(' ')[0] : (all ? 'Store' : st.name)),
        page: s.edPage || 'product', setPage: e => this.setState({ edPage: e.target.value }),
        devices: [['desktop', 'Desktop', 'M3 5h14v8H3zM8 16h4M10 13v3'], ['tablet', 'Tablet', 'M5 3h10v14H5zM9 15h2'], ['mobile', 'Mobile', 'M6 3h8v14H6zM9 15h2']].map(([k, title, icon]) => ({ title, icon, bg: dev === k ? 'rgba(255,255,255,.22)' : 'transparent', select: () => this.setState({ edDevice: k }) })),
        zoom, zoomLabel: Math.round(zoom * 100) + '%',
        zoomIn: () => this.setState({ edZoom: Math.min(1.4, zoom + 0.1) }), zoomOut: () => this.setState({ edZoom: Math.max(0.6, zoom - 0.1) }),
        frameW: dev === 'mobile' ? '390px' : dev === 'tablet' ? '640px' : '1000px',
        buyCols: dev === 'desktop' && !isM ? '1fr 1fr' : '1fr',
        dir: isM ? 'column' : 'row', wrapOverflow: isM ? 'auto' : 'hidden',
        panelW: isM ? '100%' : (typeof window !== 'undefined' && window.innerWidth < 1240 ? '244px' : '300px'),
        rightW: isM ? '100%' : (typeof window !== 'undefined' && window.innerWidth < 1240 ? '270px' : '320px'), previewMinH: isM ? '520px' : '0',
        frameRef: this.edFrameRef || (this.edFrameRef = React.createRef()),
        exit: () => this.go('store'), previewStore: () => this.toast('Opening the storefront preview'),
        save: () => { this.setState({ dirty: false, themeUpdated: 'just now' }); this.toast('Saved'); },
        undo: () => this.editorUndo(), redo: () => this.editorRedo(),
        noUndo: !(s.edHist || []).length, noRedo: !(s.edFuture || []).length,
        undoOpacity: (s.edHist || []).length ? 1 : .4, redoOpacity: (s.edFuture || []).length ? 1 : .4,
        visibleCount: SECTIONS.filter(x => !hidden[x[0]]).length,
        sections: SECTIONS.map(x => ({ name: x[1], icon: ICONS[x[0]] || ICONS.specs, visible: !hidden[x[0]], hidden: !!hidden[x[0]],
          bg: sel2 === x[0] ? 'var(--accent-soft)' : 'transparent', rail: sel2 === x[0] ? 'var(--accent)' : 'transparent',
          color: hidden[x[0]] ? 'var(--ink-3)' : 'var(--ink)', weight: sel2 === x[0] ? 650 : 450,
          strike: hidden[x[0]] ? 'line-through' : 'none',
          iconColor: hidden[x[0]] ? 'var(--ink-3)' : 'var(--ink-2)',
          eyeColor: hidden[x[0]] ? 'var(--ink-3)' : 'var(--ink-2)', eyeTitle: hidden[x[0]] ? 'Show section' : 'Hide section',
          select: () => this.selectSection(x[0]),
          toggle: e => { c.stop(e); this.pushEdHist(); this.setState(q => ({ editorHidden: { ...(q.editorHidden || {}), [x[0]]: !(q.editorHidden || {})[x[0]] }, dirty: true })); } })),
        noSel: !sel2, editMode: !!sel2, back: () => this.setState({ editorSel: null }),
        currentName: secDef2 ? secDef2[1] : '', isReviewsSection: sel2 === 'reviews',
        reviewCount: revScoped.filter(r => r.published).length, reviewDrafts: revScoped.filter(r => !r.published).length,
        revHeading: (ecfg.reviews || {}).title || '', setRevHeading: e => { const val = e.target.value; setSec('reviews', d => { d.title = val; return d; }); },
        hasFields: !!secDef2 && sel2 !== 'reviews',
        fields: secDef2 && sel2 !== 'reviews' ? secDef2[2].map(f => { const base = fieldOf(sel2, f); return f[2] === 'image' ? { ...base, ...imgField(sel2, f) } : base; }) : [],
        hasBlocks: !!(secDef2 && secDef2[3]), blockSingular: secDef2 && secDef2[3] ? secDef2[3][2] : '',
        blockCount: secDef2 && secDef2[3] ? (blocksOf(sel2).length + ' ' + (blocksOf(sel2).length === 1 ? secDef2[3][2] : secDef2[3][2] + 's')) : '',
        specHint: sel2 === 'specs',
        blocks: secDef2 && secDef2[3] ? blocksOf(sel2).map((b, i) => ({
          summary: blockSummary(b, secDef2[3][3]), open: openB === i, bg: openB === i ? 'var(--bg)' : 'transparent',
          toggleOpen: () => this.setState({ edBlockOpen: openB === i ? -1 : i }),
          fields: secDef2[3][3].map(bf => ({ label: bf[1], isText: bf[2] === 'text', isArea: bf[2] === 'area', isImage: bf[2] === 'image', placeholder: bf[1],
            bg: bf[2] === 'image' && b[bf[0]] ? 'url("' + b[bf[0]] + '")' : 'none',
            value: bf[2] === 'image' ? (b[bf[0]] ? 'Change image' : 'Choose image…') : (b[bf[0]] || ''),
            set: e => { const val = e.target.value; setSec(sel2, d => { const arr = (d.blocks || []).map(x => ({ ...x })); arr[i][bf[0]] = val; d.blocks = arr; return d; }); },
            pick: () => pickInto(file => setSec(sel2, d => { const arr = (d.blocks || []).map(x => ({ ...x })); arr[i][bf[0]] = file.url; d.blocks = arr; return d; })) })),
          remove: () => { this.pushEdHist(); setSec(sel2, d => { d.blocks = (d.blocks || []).filter((_, k) => k !== i); return d; }); },
          dragStart: () => { this._edDrag = i; }, dragOver: e => e.preventDefault(),
          drop: e => { e.preventDefault(); const from = this._edDrag; if (from == null || from === i) return; this.pushEdHist();
            setSec(sel2, d => { const arr = (d.blocks || []).slice(); const [m] = arr.splice(from, 1); arr.splice(i, 0, m); d.blocks = arr; return d; }); this._edDrag = null; } })) : [],
        addBlock: () => { this.pushEdHist(); const n = blocksOf(sel2).length; setSec(sel2, d => { d.blocks = [...(d.blocks || []), {}]; return d; }); this.setState({ edBlockOpen: n }); },
        curTrack: sel2 && !hidden[sel2] ? 'var(--accent)' : 'var(--border-strong)', curKnob: sel2 && !hidden[sel2] ? '18px' : '2px',
        toggleCurrent: () => { this.pushEdHist(); this.setState(q => ({ editorHidden: { ...(q.editorHidden || {}), [sel2]: !(q.editorHidden || {})[sel2] }, dirty: true })); },
        goReviews: () => this.go('reviews'),
        headerLinks: ((s.navMenus || {}).header || []).filter(l => l.label).map(l => ({ label: l.label })),
        footerLinks: ((s.navMenus || {}).footer || []).filter(l => l.label).map(l => ({ label: l.label })),
        preview: previewOf().map(p => ({ ...p, isSelected: p.key === sel2, label: p.name,
          outline: p.key === sel2 ? '2px solid #2F5CF5' : 'none',
          click: () => this.selectSection(p.key) }))
        }; })(),
      md: { isGrid: (s.mdView || 'grid') === 'grid' && shown.length > 0, isList: s.mdView === 'list' && shown.length > 0,
        gridBg: (s.mdView || 'grid') === 'grid' ? 'var(--accent-soft)' : 'transparent', listBg: s.mdView === 'list' ? 'var(--accent-soft)' : 'transparent',
        setGrid: () => this.setState({ mdView: 'grid' }), setList: () => this.setState({ mdView: 'list' }),
        query: s.mdQuery || '', setQuery: e => this.setState({ mdQuery: e.target.value }),
        upload: mdUpload, dragOver: e => e.preventDefault(), drop: e => { e.preventDefault(); mdUpload(e); },
        uploading: !!s.mdUploadName, uploadName: s.mdUploadName || '', uploadPct: (s.mdUploadPct || 0) + '%',
        empty: shown.length === 0, emptyTitle: files.length ? 'Nothing matches' : 'Your library is empty',
        emptyBody: files.length ? 'Try another search.' : 'Drop images or video above. Products and the theme editor pick from here.',
        files: shown.map(f => ({ ...f, bg: 'url("' + f.url + '")', used: usedIn(f) + ' place' + (usedIn(f) === 1 ? '' : 's'),
          copy: () => this.copy(f.url.slice(0, 60), f.name),
          choose: () => { const cb = (s.mdPicker || {}).onPick; this.setState({ mdPicker: null }); cb && cb(f); },
          remove: () => this.setState({ confirm: { title: 'Delete ' + f.name + '?', body: usedIn(f) ? 'It is used in ' + usedIn(f) + ' place(s) and will break there.' : 'This cannot be undone.', label: 'Delete', critical: true, onConfirm: () => this.setState(x => ({ media: (x.media || []).filter(q => q.id !== f.id) })) } }) })),
        pickerOpen: !!s.mdPicker, closePicker: () => this.setState({ mdPicker: null }) },

    };
  }
  selectSection(key) {
    this.setState({ editorSel: key, edBlockOpen: 0 });
    setTimeout(() => { const box = this.edFrameRef && this.edFrameRef.current; if (!box) return;
      const el = box.querySelector('[data-sec="' + key + '"]'); if (el) box.scrollTop = Math.max(0, el.offsetTop - 60); }, 30);
  }
  pushEdHist() {
    const snap = JSON.stringify({ cfg: this.state.editorCfg || {}, hid: this.state.editorHidden || {} });
    this.setState(s => ({ edHist: [...(s.edHist || []).slice(-24), snap], edFuture: [] }));
  }
  editorUndo() {
    const h = this.state.edHist || []; if (!h.length) { this.toast('Nothing to undo'); return; }
    const snap = h[h.length - 1], cur = JSON.stringify({ cfg: this.state.editorCfg || {}, hid: this.state.editorHidden || {} });
    const d = JSON.parse(snap);
    this.setState(s => ({ editorCfg: d.cfg, editorHidden: d.hid, edHist: (s.edHist || []).slice(0, -1), edFuture: [...(s.edFuture || []), cur], dirty: true }));
  }
  editorRedo() {
    const fu = this.state.edFuture || []; if (!fu.length) { this.toast('Nothing to redo'); return; }
    const snap = fu[fu.length - 1], cur = JSON.stringify({ cfg: this.state.editorCfg || {}, hid: this.state.editorHidden || {} });
    const d = JSON.parse(snap);
    this.setState(s => ({ editorCfg: d.cfg, editorHidden: d.hid, edFuture: (s.edFuture || []).slice(0, -1), edHist: [...(s.edHist || []), cur], dirty: true }));
  }
  setInv(key, fn) { this.setState(s => { const inv = { ...(s.inv || {}) }; inv[key] = fn({ ...(inv[key] || {}) }); return { inv }; }); }
  readReviewFile(file) {
    if (!file) return;
    const name = file.name || 'file', lower = name.toLowerCase();
    if (lower.endsWith('.zip')) {
      this.setState({ rvImport: { step: 2, fileName: name, rows: 0, images: 0, headers: ['name', 'rating', 'title', 'body', 'date', 'country', 'image'], preview: [], map: { name: 'name', rating: 'rating', title: 'title', body: 'body', date: 'date', country: 'country', image: 'image' }, product: '', source: '', zip: true } });
      this.toast('ZIP read · confirm the mapping, then import');
      return;
    }
    const rd = new FileReader();
    rd.onload = () => {
      const text = String(rd.result);
      let headers = [], rows = [];
      try {
        if (lower.endsWith('.json')) {
          const data = JSON.parse(text); const arr = Array.isArray(data) ? data : (data.reviews || []);
          headers = arr.length ? Object.keys(arr[0]) : [];
          rows = arr.map(o => headers.map(h => String(o[h] === undefined ? '' : o[h])));
        } else {
          const lines = text.split(/\r?\n/).filter(x => x.trim());
          const split = l => l.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map(x => x.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"')).slice(0, -1);
          headers = split(lines[0] || '');
          rows = lines.slice(1).map(split);
        }
      } catch (e) { this.toast('Could not read that file — check it is valid CSV or JSON'); return; }
      if (!headers.length) { this.toast('No columns found in that file'); return; }
      const guess = h => { const k = h.toLowerCase();
        if (/name|author|customer/.test(k)) return 'name'; if (/rating|stars|score/.test(k)) return 'rating';
        if (/title|headline|subject/.test(k)) return 'title'; if (/body|review|text|content|comment/.test(k)) return 'body';
        if (/date|created|time/.test(k)) return 'date'; if (/country|location|region/.test(k)) return 'country';
        if (/image|photo|picture|media/.test(k)) return 'image'; if (/verified|purchase/.test(k)) return 'verified'; return ''; };
      const map = {}; headers.forEach(h => map[h] = guess(h));
      this.setState({ rvImport: { step: 2, fileName: name, rows: rows.length, images: 0, headers, allRows: rows, map, product: '', source: '',
        preview: rows.slice(0, 5).map(r => ({ cells: r })) } });
    };
    rd.readAsText(file);
  }
  runReviewImport() {
    const imp = this.state.rvImport; if (!imp) return;
    if (!imp.source) { this.toast('Choose a source first — every review must say where it came from'); return; }
    const product = imp.product || 'Untitled product';
    const cols = {}; (imp.headers || []).forEach((h, i) => { const t = (imp.map || {})[h]; if (t) cols[t] = i; });
    if (cols.body === undefined && cols.title === undefined) { this.toast('Map at least a Body or Title column'); return; }
    const rows = imp.allRows || [];
    const store = this.isAll() ? 'gk' : this.state.storeId;
    let done = 0, skipped = 0;
    const built = [];
    rows.forEach((r, i) => {
      const g = k => cols[k] === undefined ? '' : String(r[cols[k]] || '').trim();
      const body = g('body'), title = g('title');
      if (!body && !title) { skipped++; return; }
      const rating = Math.max(1, Math.min(5, parseInt(g('rating'), 10) || 5));
      built.push({ id: 'r' + Date.now() + i, store, name: g('name') || 'Anonymous', rating, title, body, date: g('date'), country: g('country'), image: g('image'),
        verified: /true|yes|1/i.test(g('verified')), source: imp.source, published: false, product });
      done++;
    });
    this.setState({ rvImport: { ...imp, step: 3, pct: 8, progressText: 'Reading ' + rows.length + ' rows…' } });
    let pct = 8;
    const tick = setInterval(() => {
      pct = Math.min(100, pct + 12);
      this.setState(x => x.rvImport ? ({ rvImport: { ...x.rvImport, pct, progressText: pct < 100 ? 'Importing… ' + Math.round(pct) + '%' : 'Finishing up' } }) : {});
      if (pct >= 100) { clearInterval(tick);
        this.setState(x => ({ reviews: [...built, ...(x.reviews || [])], rvImport: { ...x.rvImport, step: 4, done, skipped,
          summary: done + ' imported as unpublished, marked “' + imp.source + '”, assigned to ' + product + '. ' + (skipped ? skipped + ' rows had no title or body and were skipped. ' : '') + 'Review them and publish when you are ready.' } }));
        this.toast(done + ' reviews imported'); }
    }, 120);
  }
  renderVals() { const v = this.baseVals(); const extra = this.extraVals ? this.extraVals(v) : {}; const az = this.analyticsVals ? this.analyticsVals(v) : {}; const lu = this.liveUI ? this.liveUI(v) : {}; const l2 = this.liveUI2 ? this.liveUI2(v) : {}; const pv = this.productVals ? this.productVals(v) : {}; const sv = this.settingsVals ? this.settingsVals(v) : {}; const mv = this.metaVals ? this.metaVals(v) : {}; const bz = this.bizVals ? this.bizVals(v) : {}; delete v._ctx; return { ...v, ...extra, ...az, ...lu, ...l2, ...pv, ...sv, ...mv, ...bz }; }
}

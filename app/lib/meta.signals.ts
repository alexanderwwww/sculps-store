/**
 * The signal layer around the Meta pixel. Pure functions only — no database,
 * no fetch, no Worker globals — so every decision in here can be tested
 * without a browser or a network.
 *
 * Three jobs:
 *
 *   1. The event ladder. Four custom rungs above Meta's standard events, each
 *      one a stronger sign that this visitor is a buyer. The rung decisions
 *      live here; the sending lives in meta.server.ts.
 *   2. Meta's two cookies, `_fbp` and `_fbc`, in Meta's exact formats. A
 *      malformed value is worse than no value: Meta silently drops the whole
 *      user_data block rather than telling us.
 *   3. The bot filter that stands in front of the Conversions API.
 */

/* ------------------------------------------------------------ the ladder */

/**
 * The rungs, weakest to strongest.
 *
 * "Cart" is deliberately absent. Adding something to the cart is already sent
 * as Meta's own `AddToCart` from both halves (cart.add.tsx server-side,
 * cart.tsx browser-side, one shared id). A second custom event for the same
 * act would be the same visitor counted twice in the same optimisation
 * window, which is exactly the noise this whole exercise is trying to remove.
 */
export const LADDER_RUNGS = ["Engaged", "Considered", "HotLead", "CardStarted"] as const;
export type LadderRung = (typeof LADDER_RUNGS)[number];

export function isLadderRung(value: unknown): value is LadderRung {
  return typeof value === "string" && (LADDER_RUNGS as readonly string[]).includes(value);
}

/** The thresholds for Considered. Written once, tested, never retyped. */
export const CONSIDERED_SCROLL = 60;
export const CONSIDERED_SECONDS = 30;

/** The ledger cookie: which rungs this session has already sent. */
export const RUNG_COOKIE = "kerberos_rungs";
/** A session's ladder is a day's worth of ladder. Longer is a different visit. */
export const RUNG_COOKIE_MAX_AGE = 86400;

export function parseRungCookie(header: string | null): Set<LadderRung> {
  const out = new Set<LadderRung>();
  if (!header) return out;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key !== RUNG_COOKIE) continue;
    for (const name of decodeURIComponent(rest.join("=")).split(",")) {
      if (isLadderRung(name)) out.add(name);
    }
  }
  return out;
}

export function rungCookie(fired: Iterable<LadderRung>, secure: boolean): string {
  const list = [...new Set(fired)].join(",");
  return `${RUNG_COOKIE}=${list}; Path=/; SameSite=Lax; Max-Age=${RUNG_COOKIE_MAX_AGE}${secure ? "; Secure" : ""}`;
}

export interface RungDecision {
  send: boolean;
  /** why, in words, for the client_events log and for tests */
  reason: string;
}

/**
 * Whether a rung fires.
 *
 * Every rung is once per session. Considered is the only one with a gate, and
 * its numbers come from the `visits` row the /seen heartbeat writes — the
 * browser is never asked how long it has been there, because a browser that
 * wants to lie about that can.
 */
export function decideRung(input: {
  rung: LadderRung;
  already: Set<LadderRung>;
  /** active seconds from the visits row */
  seconds: number;
  /** deepest scroll, 0–100, from the visits row */
  scrollMax: number;
}): RungDecision {
  if (input.already.has(input.rung)) return { send: false, reason: "already sent this session" };
  if (input.rung === "Considered") {
    if (!input.already.has("Engaged")) return { send: false, reason: "no Engaged signal yet" };
    if (input.scrollMax < CONSIDERED_SCROLL) return { send: false, reason: `scroll ${input.scrollMax} < ${CONSIDERED_SCROLL}` };
    if (input.seconds < CONSIDERED_SECONDS) return { send: false, reason: `seconds ${input.seconds} < ${CONSIDERED_SECONDS}` };
  }
  return { send: true, reason: "ok" };
}

/* ------------------------------------------------------- _fbp and _fbc */

/**
 * Meta's formats, and they are not negotiable:
 *
 *   _fbp  fb.1.<creation time in ms>.<random number>
 *   _fbc  fb.1.<creation time in ms>.<fbclid exactly as it arrived>
 *
 * The `1` is the subdomain index for a cookie set on the root domain, which
 * is where ours is set. Anything that does not match is treated as absent and
 * replaced, because a malformed cookie sent to the Conversions API poisons the
 * whole user_data block.
 */
const FBP_RE = /^fb\.1\.\d{10,}\.\d+$/;
const FBC_RE = /^fb\.1\.\d{10,}\.[A-Za-z0-9._-]+$/;

export function isValidFbp(value: string | null | undefined): boolean {
  return !!value && FBP_RE.test(value);
}

export function isValidFbc(value: string | null | undefined): boolean {
  return !!value && FBC_RE.test(value);
}

/** Meta's own click ids are URL-safe base64. Anything else is not one. */
export function cleanFbclid(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 512) return null;
  return /^[A-Za-z0-9._-]+$/.test(trimmed) ? trimmed : null;
}

export function newFbp(now = Date.now(), random?: number): string {
  // Ten digits of randomness, which is the shape the pixel's own generator
  // produces. crypto when it is there, Math.random when it is not.
  let n = random;
  if (n === undefined) {
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const bytes = new Uint32Array(1);
      crypto.getRandomValues(bytes);
      n = bytes[0] % 10_000_000_000;
    } else {
      n = Math.floor(Math.random() * 10_000_000_000);
    }
  }
  return `fb.1.${now}.${n}`;
}

export function newFbc(fbclid: string, now = Date.now()): string | null {
  const clean = cleanFbclid(fbclid);
  return clean ? `fb.1.${now}.${clean}` : null;
}

/* --------------------------------------------------------- the bot filter */

/**
 * Obvious machines, and nothing cleverer than that.
 *
 * The rule Alex set is conservative on purpose: a heuristic that drops one
 * real buyer costs more than a hundred crawler events cost. So this is a list
 * of things that say, in their own user agent, that they are not a person —
 * plus the empty user agent, which no browser sends.
 *
 * Purchase is never filtered anywhere, whatever this returns: a card was
 * charged, so a person existed.
 */
const BOT_RE =
  /(bot\b|bots?\/|crawler|crawl\b|spider|slurp|scrapy|curl\/|wget\/|python-requests|python-urllib|go-http-client|java\/|okhttp|libwww-perl|axios\/|node-fetch|headlesschrome|phantomjs|puppeteer|playwright|lighthouse|pingdom|uptimerobot|gtmetrix|semrush|ahrefs|mj12|dotbot|petalbot|bytespider|yandex|baiduspider|duckduckbot|applebot|facebookexternalhit|facebot|twitterbot|linkedinbot|whatsapp|telegrambot|discordbot|slackbot|embedly|preview|monitoring|statuscake|datadog|newrelic|checkly)/i;

export function isBotUserAgent(ua: string | null | undefined): boolean {
  if (!ua || !ua.trim()) return true;
  return BOT_RE.test(ua);
}

/** The one gate in front of the Conversions API. */
export function shouldSendToCapi(name: string, ua: string | null | undefined): boolean {
  if (name === "Purchase") return true;
  return !isBotUserAgent(ua);
}

/* ------------------------------------------------------- the browser half */

/**
 * The storefront's reporter.
 *
 * It watches for the acts that mean somebody is actually shopping, posts them
 * to /rung, and — only if the server says the rung fires — calls fbq with the
 * id the server used. Nothing is decided here: the page reports, the Worker
 * judges. That is what keeps "once per session" and the Considered thresholds
 * honest when the same tab is open for an hour.
 *
 * What counts as Engaged, and why each one:
 *   - a bundle tier touched — the single strongest pre-cart signal on a
 *     one-product page, because it is the moment price is being weighed;
 *   - a gallery thumbnail opened — they want to see the thing properly;
 *   - an answer expanded — they have an objection and are looking for the
 *     answer to it rather than leaving;
 *   - a video played — the most expensive attention on the page.
 *
 * Considered is not measured here at all. The page only asks; the seconds and
 * the scroll depth come from the /seen heartbeat's own row on the server.
 *
 * Every failure is swallowed. This script exists to feed an ad account, and
 * an ad account is never worth an error on a customer's screen.
 */
export function ladderScript(): string {
  return `(function(){
if(window.__kbRung)return;
var sent={},pending={};
function post(name,variantId){
  if(sent[name]||pending[name])return;pending[name]=1;
  // On the built-in workers.dev address the store is chosen by ?store=, so
  // carry it or the rung is judged against a different shop.
  var m=location.search.match(/[?&]store=([^&]*)/);
  var to='/rung'+(m?'?store='+m[1]:'');
  fetch(to,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({rung:name,variantId:variantId||null})})
    .then(function(r){return r.json()})
    .then(function(j){
      pending[name]=0;
      if(!j||!j.fire)return;
      sent[name]=1;
      if(window.fbq)fbq(j.verb||'trackCustom',j.name,j.data||{},{eventID:j.eventId});
    })
    .catch(function(){pending[name]=0});
}
window.__kbRung=post;
var engagedAt=0;
function engage(el){
  if(sent.Engaged)return;
  var v=null;
  try{var n=el&&el.closest?el.closest('[data-variant]'):null;if(n)v=n.getAttribute('data-variant')}catch(e){}
  if(!engagedAt)engagedAt=Date.now();
  post('Engaged',v);
}
var SEL='[data-variant],[data-engage],.cb-tier,.cb-gal__thumb,[role="radio"],summary,[aria-expanded]';
document.addEventListener('click',function(e){
  var t=e.target;if(!t||!t.closest)return;
  var hit=t.closest(SEL);if(hit)engage(hit);
},true);
// Media events do not bubble, but they do reach a capturing listener.
document.addEventListener('play',function(e){engage(e.target)},true);
/*
 * Considered. The page only nudges: it waits until its own rough view of the
 * visit could possibly pass the gate, then asks the server, which answers
 * from the heartbeat's numbers. It stops asking as soon as one is sent.
 */
var start=Date.now(),deep=0;
function depth(){var h=document.documentElement,s=h.scrollHeight-innerHeight;
  if(s<=0)return 100;return Math.min(100,Math.round((scrollY+innerHeight)/h.scrollHeight*100))}
addEventListener('scroll',function(){var d=depth();if(d>deep)deep=d},{passive:true});
var tries=0;
var timer=setInterval(function(){
  if(sent.Considered||tries>30){clearInterval(timer);return}
  if(!sent.Engaged)return;
  var d=depth();if(d>deep)deep=d;
  if(deep<${CONSIDERED_SCROLL})return;
  if((Date.now()-start)/1000<${CONSIDERED_SECONDS})return;
  tries++;post('Considered',null);
},10000);
})();`;
}

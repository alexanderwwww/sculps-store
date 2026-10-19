/*
 * What the agent may do on its own, and what waits for Alex.
 *
 * The model says whether a click is final, but the harness never relies on
 * that alone: a button whose own name says post, send, buy, delete, save … is
 * final whatever the model declared. Words, not selectors, so the same rules
 * hold on every site; a site profile can only ADD words (finalWords,
 * priceWords), never take the gate away.
 *
 *   clickKind({name, role}, declared, profile)  -> null | kind
 *   enterIsFinal(target, profile)               -> boolean (Enter in a field)
 *   navigateKind(url)                           -> null | kind
 *   secretField(info)                           -> null | reason (never typed into)
 *   priceField(name, profile)                   -> boolean
 *   detectWall(page, profile)                   -> null | {kind:"login"|"captcha", reason}
 *
 * kinds: publish, send, buy, delete, save, offer, submit, price, other
 */

const norm = (s) => String(s || "").toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9'$ ]+/g, " ").replace(/\s+/g, " ").trim();

const KINDS = [
  ["buy", /\b(buy|buy now|purchase|pay|pay now|checkout|check out|place order|complete (order|purchase)|confirm (order|purchase|payment))\b/],
  ["delete", /\b(delete|remove listing|remove item|deactivate|unlist|archive|cancel order)\b|^remove$/],
  ["publish", /\b(post|publish|list it|list item|list now|list this|go live|relist)\b/],
  ["send", /^(send|send message|send reply|reply and send|send offer)\b|\bsend$/],
  ["offer", /\b(accept|decline|counter|make offer|send offer|mark as (sold|shipped|dispatched)|refund|issue refund)\b/],
  ["save", /^(save|save changes|save draft|update|update listing|update price|apply changes|confirm)\b/],
  ["submit", /^(submit|continue to (payment|checkout))\b/],
];

/** null when the click is not final; else its kind. */
export function clickKind(target, declared, profile) {
  const name = norm(target && target.name);
  const extra = (profile && Array.isArray(profile.finalWords) ? profile.finalWords : []).map(norm).filter(Boolean);
  for (const w of extra) if (name === w || name.startsWith(w + " ")) return "other";
  for (const [kind, re] of KINDS) if (re.test(name)) return kind;
  const d = String(declared || "none").toLowerCase();
  if (d && d !== "none") return ["publish", "send", "buy", "delete", "price", "other"].includes(d) ? d : "other";
  return null;
}

/** Enter in a field submits it (a chat box sends, a form posts) unless it is a search box. */
export function enterIsFinal(target) {
  if (!target) return true;
  const role = String(target.role || "").toLowerCase();
  const name = norm(target.name);
  const type = String(target.type || "").toLowerCase();
  if (role === "searchbox" || type === "search") return false;
  if (/\bsearch\b/.test(name) || /\bsearch\b/.test(norm(target.placeholder))) return false;
  if (role === "combobox" && !target.multiline) return false;
  return true;
}

export function navigateKind(url) {
  let path = "";
  try { const u = new URL(url); path = (u.pathname + u.search).toLowerCase(); } catch { path = String(url || "").toLowerCase(); }
  if (/checkout|payment|purchase|\/buy\b|\/pay\b/.test(path)) return "buy";
  if (/\/delete|\/remove|\/unlist|\/deactivate/.test(path)) return "delete";
  return null;
}

/** Fields ultracursor never types into, whatever the task says. */
export function secretField(info) {
  if (!info) return null;
  const type = String(info.type || "").toLowerCase();
  const ac = String(info.autocomplete || "").toLowerCase();
  const label = norm([info.name, info.id, info.fieldName, info.placeholder, info.label].join(" "));
  if (type === "password") return "a password field";
  if (/current-password|new-password|one-time-code/.test(ac)) return "a password or one-time-code field";
  if (/\bcc-(number|csc|exp)/.test(ac)) return "a card field";
  if (/\b(password|passcode|cvc|cvv|security code|card number|cardnumber|one time code|otp|2fa|verification code)\b/.test(label)) return "a password, code or card field";
  return null;
}

export function priceField(name, profile) {
  const n = norm(name);
  if (/\b(price|amount|cost)\b|\$/.test(n)) return true;
  const extra = (profile && Array.isArray(profile.priceWords) ? profile.priceWords : []).map(norm).filter(Boolean);
  return extra.some((w) => n.includes(w));
}

const CAPTCHA_FRAMES = /recaptcha|hcaptcha|challenges\.cloudflare\.com|turnstile|arkoselabs|funcaptcha|captcha-delivery\.com|geo\.captcha|perimeterx|px-captcha|datadome/i;
const CAPTCHA_TEXT = /verify (that )?you(?:'| a)re (a )?human|verify you are human|are you a robot|press (&|and) hold|security check|unusual (activity|traffic)|complete the captcha|i'?m not a robot/i;
const LOGIN_PATH = /\/(login|log-in|signin|sign-in|sign_in|accounts\/login|auth\/login)(\/|$|\?)/i;

/**
 * Is a sign-in wall or a captcha in front of the work? Looks only at the
 * main frame's URL, iframe sources and visible text: no site knowledge.
 */
export async function detectWall(page, profile) {
  let url = "";
  try { url = page.url(); } catch { return null; }
  const pats = (profile && profile.login && Array.isArray(profile.login.urlPatterns) ? profile.login.urlPatterns : []);
  let info = null;
  try {
    info = await page.evaluate(() => {
      const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 2 && r.height > 2 && s.visibility !== "hidden" && s.display !== "none"; };
      const pw = Array.from(document.querySelectorAll('input[type="password"]')).some(vis);
      const frames = Array.from(document.querySelectorAll("iframe")).map((f) => f.src || "").filter(Boolean);
      const text = (document.body ? document.body.innerText || "" : "").slice(0, 4000);
      return { pw, frames, text };
    });
  } catch { return null; }
  const frame = info.frames.find((s) => CAPTCHA_FRAMES.test(s));
  if (frame) return { kind: "captcha", reason: `captcha frame ${frame.slice(0, 80)}` };
  if (CAPTCHA_TEXT.test(info.text)) return { kind: "captcha", reason: "the page asks to verify you are human" };
  let path = "";
  try { const u = new URL(url); path = u.pathname + u.search; } catch { path = url; }
  if (LOGIN_PATH.test(path)) return { kind: "login", reason: `sign-in page ${path.slice(0, 60)}` };
  for (const p of pats) { try { if (new RegExp(p, "i").test(url)) return { kind: "login", reason: `sign-in page (${p})` }; } catch { /* bad pattern */ } }
  if (info.pw) return { kind: "login", reason: "a password field is on the page" };
  return null;
}

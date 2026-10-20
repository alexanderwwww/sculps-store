/**
 * The probe (build 41): what GMGN's trade panel really looks like on Alex's Mac, reported and
 * NEVER touched. GMGN is Cloudflare-blocked from Claude's sandbox, so its trade-panel DOM has
 * never been seen; the real trader stays in PROBE until Claude has read one of these reports
 * and written selectors from it into R2 real.json (Claude's step, not Alex's).
 *
 * Read only: page.evaluate reads and ariaSnapshot. No click, fill, type, press or hover, and
 * the page a probe opens records every trusted input (recorder below) so a report proves it.
 *
 *   gmgnTradeProbe(page) -> {url, frames, tradeBox, controls, presets, slippage, priority,
 *                            antiMev, tpsl, balance, aria, hash}
 *   walletProbe(page)    -> {walletKind: 'gmgn'|'phantom'|'unknown', walletAddr, evidence}
 */
import crypto from "node:crypto";

/**
 * Runs inside the page (or one frame of it). Finds the trade box: the smallest element holding
 * an amount input, a control named like buy and (when the page has one) a control named like
 * sell, so the Buy/Sell tabs fall inside it. Lists every visible interactive element with the
 * role and accessible name getByRole would match. `mark` is used by the executor only (its own
 * tab): it tags the box so its locators stay inside it. The probe passes mark = false.
 */
export function pageScan(arg) {
  const mark = !!(arg && arg.mark);
  const MARK = "data-uc-box";
  const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
  const vis = (el) => {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) !== 0;
  };
  const rectOf = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const byId = (id) => (id ? document.getElementById(id) : null);
  const roleOf = (el) => {
    const r = clean(el.getAttribute("role")).split(" ")[0];
    if (r) return r;
    const t = el.tagName.toLowerCase(), ty = (el.getAttribute("type") || "text").toLowerCase();
    if (t === "button" || t === "summary") return "button";
    if (t === "a" && el.hasAttribute("href")) return "link";
    if (t === "select") return el.multiple ? "listbox" : "combobox";
    if (t === "textarea" || el.isContentEditable) return "textbox";
    if (t === "input") {
      if (["button", "submit", "reset", "image"].includes(ty)) return "button";
      if (ty === "checkbox") return "checkbox";
      if (ty === "radio") return "radio";
      if (ty === "range") return "slider";
      if (ty === "number") return "spinbutton";
      if (ty === "search") return "searchbox";
      return "textbox";
    }
    return "";
  };
  const nameOf = (el) => {
    const al = clean(el.getAttribute("aria-label"));
    if (al) return al;
    const lb = clean(el.getAttribute("aria-labelledby"));
    if (lb) { const t = clean(lb.split(" ").map((i) => byId(i)?.textContent || "").join(" ")); if (t) return t; }
    const t = el.tagName.toLowerCase();
    if (t === "input" || t === "textarea" || t === "select") {
      const ty = (el.getAttribute("type") || "").toLowerCase();
      if (["button", "submit", "reset"].includes(ty)) return clean(el.value);
      const lab = (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) || el.closest("label");
      if (lab) { const x = clean(lab.textContent); if (x) return x; }
      return clean(el.getAttribute("title") || el.getAttribute("placeholder"));
    }
    return clean(el.innerText || el.textContent) || clean(el.getAttribute("title"));
  };
  const pathOf = (el) => {
    const parts = [];
    for (let e = el; e && e.nodeType === 1 && e !== document.body; e = e.parentElement) {
      const tag = e.tagName.toLowerCase(), sib = [...(e.parentElement?.children || [])].filter((x) => x.tagName === e.tagName);
      parts.unshift(sib.length > 1 ? `${tag}:nth-of-type(${sib.indexOf(e) + 1})` : tag);
    }
    return ["body", ...parts].join(" > ");
  };
  const ROLES = new Set(["button", "link", "textbox", "searchbox", "spinbutton", "combobox", "listbox", "checkbox", "radio", "switch", "slider", "tab", "menuitem", "menuitemradio", "menuitemcheckbox", "option"]);
  const all = [...document.querySelectorAll("button, a[href], input, select, textarea, summary, [role], [tabindex], [contenteditable]")]
    .filter((el) => (el.getAttribute("type") || "").toLowerCase() !== "hidden" && vis(el) && ROLES.has(roleOf(el)));
  const amount = all.filter((el) => ["textbox", "spinbutton"].includes(roleOf(el)));
  const named = (re, roles) => all.filter((el) => roles.includes(roleOf(el)) && re.test(nameOf(el)));
  const buys = named(/\bbuy\b/i, ["button", "tab"]), sells = named(/\bsell\b/i, ["button", "tab"]);
  let box = null;
  if (buys.length) {
    for (const inp of amount) {
      for (let a = inp.parentElement; a && a !== document.documentElement; a = a.parentElement) {
        if (!buys.some((b) => a.contains(b))) continue;
        if (sells.length && !sells.some((b) => a.contains(b))) continue;
        const r = a.getBoundingClientRect();
        if (!box || r.width * r.height < box.area) box = { el: a, area: r.width * r.height };
        break;
      }
    }
  }
  if (mark) { for (const e of document.querySelectorAll(`[${MARK}]`)) e.removeAttribute(MARK); if (box) box.el.setAttribute(MARK, "1"); }
  // the box's hidden controls too (the Sell tab's 100% and Sell may be hidden on the Buy tab):
  // reported with hidden: true, never resolved by getByRole until they show
  const hidden = box ? [...box.el.querySelectorAll("button, input, select, textarea, [role]")].filter((el) => !all.includes(el) && (el.getAttribute("type") || "").toLowerCase() !== "hidden" && ROLES.has(roleOf(el))) : [];
  const controls = [...all.slice(0, 400), ...hidden.slice(0, 100)].map((el) => ({
    role: roleOf(el), name: nameOf(el).slice(0, 80), tag: el.tagName.toLowerCase(), type: el.getAttribute("type") || null,
    placeholder: el.getAttribute("placeholder") || null, value: "value" in el && typeof el.value === "string" ? el.value.slice(0, 40) : null,
    disabled: !!(el.disabled || el.getAttribute("aria-disabled") === "true"),
    checked: el.getAttribute("aria-checked") || el.getAttribute("aria-selected") || (el.type === "checkbox" ? String(el.checked) : null),
    rect: rectOf(el), inTradeBox: !!(box && box.el.contains(el)), hidden: !all.includes(el),
  }));
  // what the panel says about itself, as text: slippage, priority, anti-MEV, TP/SL, balance, wallet
  const texts = [...document.querySelectorAll("body *")].filter((el) => el.children.length === 0 || ROLES.has(roleOf(el))).map((el) => clean(el.innerText || el.textContent)).filter((t) => t && t.length <= 80);
  const uniq = (xs) => [...new Set(xs)].slice(0, 12);
  const find = (re) => uniq(texts.filter((t) => re.test(t)));
  const ADDR = /^[1-9A-HJ-NP-Za-km-z]{3,8}\s*(?:…|\.{2,3})\s*[1-9A-HJ-NP-Za-km-z]{3,8}$|^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  return {
    url: location.href, title: document.title,
    box: box ? { rect: rectOf(box.el), path: pathOf(box.el), tag: box.el.tagName.toLowerCase() } : null,
    controls,
    slippage: find(/slippage/i), priority: find(/priority|\bprio\b|\bgas\b|\bfee\b/i), antiMev: find(/\bmev\b/i),
    tpsl: find(/\bTP\b|\bSL\b|take profit|stop loss|auto ?sell/i), balance: find(/balance|\bbal\b/i),
    addrs: uniq(texts.filter((t) => ADDR.test(t))), phantom: find(/phantom/i), connect: find(/^connect( wallet)?$|log ?in|sign ?in/i),
  };
}

/** Installed before the page loads: every TRUSTED input on the probe's page is counted. */
export function inputRecorder() {
  window.__ucTrusted = [];
  for (const t of ["pointerdown", "mousedown", "mouseup", "click", "dblclick", "keydown", "keyup", "beforeinput", "input", "change", "touchstart", "wheel"]) {
    window.addEventListener(t, (e) => { if (e.isTrusted) window.__ucTrusted.push(t); }, true);
  }
}

const num = (s) => { const m = /(-?\d+(?:\.\d+)?)/.exec(String(s || "").replace(/,/g, "")); return m ? Number(m[1]) : null; };
const pct = (xs) => { for (const t of xs || []) { const m = /(\d+(?:\.\d+)?)\s*%/.exec(t); if (m) return Number(m[1]) / 100; } return null; };
const PRESET = /^(\d+(?:\.\d+)?\s*(?:SOL)?|\d+(?:\.\d+)?\s*%|max)$/i;
/** Digits change with every balance and price; the hash is over the layout, not the numbers. */
const shape = (s) => String(s || "").replace(/\d+(?:[.,]\d+)*/g, "#");

/** The probe's fingerprint: the trade box's roles and names (numbers masked) and the wallet kind. */
export function probeHash(rep) {
  const box = (rep.controls || []).filter((c) => c.inTradeBox && !c.hidden).map((c) => `${c.role}|${shape(c.name)}`);
  const body = JSON.stringify({ box: [...new Set(box)].sort(), presets: (rep.presets || []).map(shape).sort(), wallet: rep.walletKind || "unknown" });
  return crypto.createHash("sha256").update(body).digest("hex").slice(0, 16);
}

/** Every frame of the page, read; the frame holding the trade box wins. */
export async function gmgnTradeProbe(page) {
  const frames = page.frames();
  const scans = [];
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    let s = null;
    try { s = await f.evaluate(pageScan, { mark: false }); } catch (e) { s = { error: String(e.message || e).slice(0, 120) }; }
    scans.push({ i, f, s });
  }
  const hit = scans.find((x) => x.s && x.s.box) || null;
  const main = scans[0] && scans[0].s && !scans[0].s.error ? scans[0].s : {};
  const s = hit ? hit.s : main;
  let aria = null;
  if (hit) {
    try { aria = (await hit.f.locator(hit.s.box.path).first().ariaSnapshot({ timeout: 3000 })).slice(0, 6000); } catch (e) { aria = `aria snapshot failed: ${String(e.message || e).slice(0, 100)}`; }
  }
  const controls = scans.flatMap((x) => (x.s && x.s.controls ? x.s.controls.map((c) => ({ ...c, frame: x.i })) : []));
  const box = controls.filter((c) => c.inTradeBox);
  const presets = box.filter((c) => c.role === "button" && PRESET.test(c.name)).map((c) => (c.hidden ? `${c.name} (hidden)` : c.name));
  const slipCtl = box.find((c) => /slippage/i.test(c.name));
  return {
    url: page.url(),
    frames: scans.map((x) => ({ index: x.i, url: x.f.url().slice(0, 160), name: x.f.name() || null, box: !!(x.s && x.s.box), error: x.s && x.s.error || null })),
    tradeBox: hit ? { frame: hit.i, rect: hit.s.box.rect, path: hit.s.box.path, tag: hit.s.box.tag } : null,
    controls,
    presets,
    slippage: { texts: s.slippage || [], pct: pct(slipCtl ? [slipCtl.name, slipCtl.value] : s.slippage), control: slipCtl ? { role: slipCtl.role, name: slipCtl.name, value: slipCtl.value } : null },
    priority: { texts: s.priority || [] },
    antiMev: { texts: s.antiMev || [], control: box.find((c) => /mev/i.test(c.name)) || null },
    tpsl: { texts: s.tpsl || [] },
    balance: { texts: s.balance || [], sol: num((s.balance || []).find((t) => /sol/i.test(t))) },
    aria,
    scan: scans.map((x) => (x.s ? { addrs: x.s.addrs || [], phantom: x.s.phantom || [], connect: x.s.connect || [] } : null)),
  };
}

/**
 * Which wallet would sign. GMGN's own trading wallet shows its address on the page and needs no
 * popup; Phantom shows itself by name (and as an extension target) and opens a popup for every
 * buy and sell. Evidence is reported as read, for Claude to judge; nothing here is a guess
 * dressed as a fact: no evidence is 'unknown'.
 */
export async function walletProbe(page, rep = null, cdpTargets = null) {
  const r = rep || await gmgnTradeProbe(page);
  const addrs = [...new Set((r.scan || []).flatMap((x) => (x ? x.addrs : [])))];
  const phantomText = [...new Set((r.scan || []).flatMap((x) => (x ? x.phantom : [])))];
  const connect = [...new Set((r.scan || []).flatMap((x) => (x ? x.connect : [])))];
  const ext = (cdpTargets || []).filter((t) => /^chrome-extension:\/\//.test(t.url || "") && /phantom/i.test(`${t.title} ${t.url}`));
  const evidence = [...addrs.map((a) => `address shown: ${a}`), ...phantomText.map((t) => `page says: ${t}`), ...ext.map((t) => `extension target: ${t.title}`), ...connect.map((t) => `page says: ${t}`)];
  const walletKind = phantomText.length || ext.length ? "phantom" : addrs.length ? "gmgn" : "unknown";
  return { walletKind, walletAddr: addrs[0] || null, evidence: evidence.slice(0, 12) };
}

/** The report's verdict: ok only with a trade box holding an amount input, a known wallet and zero inputs. */
export function judge(rep) {
  const why = [];
  const box = (rep.controls || []).filter((c) => c.inTradeBox);
  if (!rep.tradeBox) why.push("no trade box found (amount input + Buy control)");
  if (rep.tradeBox && !box.some((c) => ["textbox", "spinbutton"].includes(c.role))) why.push("no amount input in the trade box");
  if (rep.inputs) why.push(`${rep.inputs} trusted input(s) recorded on the probe page`);
  if (rep.walletKind === "unknown") why.push("wallet kind unknown");
  return { ok: why.length === 0, why: why.join("; ") || "ok" };
}

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

/**
 * build 45: GMGN's "Instant trade" floating window, read in the page (or one frame). Seen on
 * Alex's Mac (build 44 probe): one div whose text reads "1 0 Buy P1 P2 P3 0.01618 0.1 0.5 1 Auto
 * 0.00001 <0.01 Red. Adv. Sell % P1 P2 P3 0 <TOKEN> 0 10% 25% 50% 100% ... Bal Bought Sold PnL
 * Sell All". Its presets are clickable DIVs (no button role), and one click on one buys or sells
 * at once, so the window is found by its own words, never by a preset's text alone:
 *   window   the smallest visible element holding the texts Buy, Sell All, Bought, Sold, PnL and
 *            a 100%; two such elements that do not contain each other = ambiguous (not found)
 *   buy row  numbers (^\d+(\.\d+)?$) after the window's "Buy" and before its "Sell ..." header,
 *            that the page draws as clickable (cursor: pointer on it or a parent in the window)
 *   sell row percentages (^\d+%$) after the "Sell ..." header
 *   toggle   an element whose text or aria-label is "Instant trade" (trimmed)
 *   chips    the header's balance: a number in the top 90 px next to an icon that names SOL
 * `mark` (the executor's own tab only) tags the window and, when exactly one matches, the target
 * {section: 'buy'|'sell', text} so a locator can reach it. The probe passes mark = false.
 */
export function instantScan(arg) {
  const mark = !!(arg && arg.mark), target = arg && arg.target;
  const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
  const vis = (el) => {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) !== 0;
  };
  const rectOf = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const pathOf = (el) => {
    const parts = [];
    for (let e = el; e && e.nodeType === 1 && e !== document.body; e = e.parentElement) {
      const tag = e.tagName.toLowerCase(), sib = [...(e.parentElement?.children || [])].filter((x) => x.tagName === e.tagName);
      parts.unshift(sib.length > 1 ? `${tag}:nth-of-type(${sib.indexOf(e) + 1})` : tag);
    }
    return ["body", ...parts].join(" > ");
  };
  for (const a of ["data-uc-instant", "data-uc-target"]) for (const e of document.querySelectorAll(`[${a}]`)) e.removeAttribute(a);
  // a text owner: a visible element with its own (direct) text; its text is its innerText
  const owners = [];
  for (const el of document.querySelectorAll("body *")) {
    if (["SCRIPT", "STYLE", "NOSCRIPT"].includes(el.tagName)) continue;
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim())) continue;
    if (!vis(el)) continue;
    const t = clean(el.innerText || el.textContent);
    if (t && t.length <= 40) owners.push({ el, t });
  }
  const ancestors = (el) => { const s = new Set(); for (let a = el.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) s.add(a); return s; };
  const NEED = [(t) => t === "Buy", (t) => t === "Sell All", (t) => t === "Bought", (t) => t === "Sold", (t) => t === "PnL", (t) => t === "100%"];
  let cands = null;
  for (const want of NEED) {
    const s = new Set();
    for (const o of owners) if (want(o.t)) for (const a of ancestors(o.el)) s.add(a);
    cands = cands === null ? s : new Set([...cands].filter((x) => s.has(x)));
  }
  const minimal = [...(cands || [])].filter((c) => vis(c) && ![...cands].some((d) => d !== c && c.contains(d)));
  const toggles = [...document.querySelectorAll("body *")].filter((el) => vis(el) && (clean(el.getAttribute("aria-label")) === "Instant trade" || (clean(el.innerText) === "Instant trade" && ![...el.children].some((c) => clean(c.innerText) === "Instant trade"))));
  const toggle = toggles.length ? { count: toggles.length, tag: toggles[0].tagName.toLowerCase(), role: toggles[0].getAttribute("role") || (toggles[0].tagName === "BUTTON" ? "button" : null), text: toggles[0].textContent.slice(0, 40), rect: rectOf(toggles[0]) } : null;
  // the header's balance chip (GMGN's built-in wallet): a number high on the page beside a SOL icon
  const solIcon = (el) => !!el && [...el.querySelectorAll("img, svg, i, span, use")].some((x) => /\bsol\b|solana/i.test(`${x.getAttribute("alt") || ""} ${x.getAttribute("src") || ""} ${x.getAttribute("class") || ""} ${x.getAttribute("aria-label") || ""} ${x.getAttribute("href") || ""} ${x.getAttribute("xlink:href") || ""}`));
  const chips = owners.filter((o) => /^\d+(\.\d+)?$/.test(o.t) && o.el.getBoundingClientRect().top < 90 && (solIcon(o.el.parentElement) || solIcon(o.el.parentElement?.parentElement)))
    .slice(0, 4).map((o) => ({ text: o.t, rect: rectOf(o.el) }));
  const base = { candidates: minimal.length, toggle, chips };
  if (minimal.length !== 1) return { ...base, open: false, why: minimal.length ? `${minimal.length} elements look like the Instant-trade window` : "no Instant-trade window on the page" };
  const win = minimal[0];
  const inWin = owners.filter((o) => win.contains(o.el));
  const before = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  const buyH = inWin.find((o) => o.t === "Buy");
  const sellH = inWin.find((o) => /^Sell\b/.test(o.t) && o.t !== "Sell All" && buyH && before(buyH.el, o.el));
  const pointer = (el) => { for (let e = el, i = 0; e && i < 4 && win.contains(e); e = e.parentElement, i++) if (getComputedStyle(e).cursor === "pointer") return true; return false; };
  const buyRow = inWin.filter((o) => buyH && sellH && before(buyH.el, o.el) && before(o.el, sellH.el) && /^\d+(\.\d+)?$/.test(o.t));
  const sellRow = inWin.filter((o) => sellH && before(sellH.el, o.el) && /^\d+%$/.test(o.t));
  const buyPresets = buyRow.filter((o) => pointer(o.el)).map((o) => o.t);
  // build 52: the wallet's SOL GMGN prints on the Buy header line (Alex's screenshot: "0.13028"),
  // a number on the Buy header's line that is not a clickable preset
  const bt = buyH ? buyH.el.getBoundingClientRect() : null;
  const winSolO = bt ? inWin.find((o) => /^\d+\.\d+$/.test(o.t) && !pointer(o.el) && Math.abs(o.el.getBoundingClientRect().top - bt.top) < 12) : null;
  const winSol = winSolO ? Number(winSolO.t) : null;
  const sellPcts = sellRow.filter((o) => pointer(o.el)).map((o) => o.t);
  let targetCount = null;
  if (mark) {
    win.setAttribute("data-uc-instant", "1");
    if (target && typeof target.text === "string") {
      const row = target.section === "sell" ? sellRow : buyRow;
      const hits = row.filter((o) => o.t === target.text && pointer(o.el));
      targetCount = hits.length;
      if (hits.length === 1) hits[0].el.setAttribute("data-uc-target", "1");
    }
  }
  return {
    ...base, open: true, rect: rectOf(win), path: pathOf(win), tag: win.tagName.toLowerCase(), text: clean(win.innerText).slice(0, 400),
    buyHeader: !!buyH, sellHeader: sellH ? sellH.t : null,
    buyPresets, sellPcts, winSol, notClickable: [...buyRow, ...sellRow].filter((o) => !pointer(o.el)).map((o) => o.t).slice(0, 12),
    targetCount,
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
  const ins = rep.instant && rep.instant.open ? { buy: (rep.instant.buyPresets || []).map(shape), sell: rep.instant.sellPcts || [], sellHeader: rep.instant.sellHeader || null } : null;
  const body = JSON.stringify({ box: [...new Set(box)].sort(), presets: (rep.presets || []).map(shape).sort(), wallet: rep.walletKind || "unknown", ...(ins ? { instant: ins } : {}) });
  return crypto.createHash("sha256").update(body).digest("hex").slice(0, 16);
}

/** Every frame of the page, read; the frame holding the trade box wins. */
/** An answer, or `fallback` when the page does not give one in `ms`. A busy GMGN page can hold a page.evaluate for minutes. */
const bound = (promise, ms, fallback) => { let t; return Promise.race([promise, new Promise((r) => { t = setTimeout(() => r(fallback), ms); })]).finally(() => clearTimeout(t)); };
export const SCAN_MS = 5_000, FULL_SCAN_MS = 12_000;

export async function gmgnTradeProbe(page) {
  const frames = page.frames();
  // every frame at once: a page full of frames that never answer costs one wait, not one per frame
  const scans = await Promise.all(frames.map(async (f, i) => {
    // build 53: the cheap Instant-trade scan first, every page call bounded. When the Instant window
    // is up with its buy presets and Sell 100%, the heavy whole-page scan is skipped: on GMGN's real
    // page it ran past the 90 s limit (builds 50 and 52 never got a report on Alex's Mac).
    let ins = null;
    try { ins = await bound(f.evaluate(instantScan, { mark: false }), SCAN_MS, { open: false, why: `scan timed out after ${SCAN_MS / 1000} s` }); } catch (e) { ins = { open: false, why: `scan failed: ${String(e.message || e).slice(0, 100)}` }; }
    const quick = !!(ins && ins.open && (ins.buyPresets || []).length && (ins.sellPcts || []).includes("100%"));
    let s = null;
    if (quick) s = { skipped: "instant window up: full page scan not needed" };
    else { try { s = await bound(f.evaluate(pageScan, { mark: false }), FULL_SCAN_MS, { error: `page scan timed out after ${FULL_SCAN_MS / 1000} s` }); } catch (e) { s = { error: String(e.message || e).slice(0, 120) }; } }
    return { i, f, s, ins };
  }));
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
  // build 45: the Instant-trade window, from the frame that has exactly one (else the main frame's answer)
  const iw = scans.filter((x) => x.ins && x.ins.open);
  const mainIns = (scans[0] && scans[0].ins) || { open: false, why: "not scanned" };
  const instant = iw.length === 1 ? { frame: iw[0].i, ...iw[0].ins }
    : { ...mainIns, open: false, frame: null, ...(iw.length > 1 ? { why: `${iw.length} frames show an Instant-trade window` } : {}) };
  instant.toggle = scans.map((x) => x.ins && x.ins.toggle).find(Boolean) || null;
  instant.chips = scans.flatMap((x) => (x.ins && x.ins.chips) || []);
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
    instant,
    scan: scans.map((x) => (x.s ? { addrs: x.s.addrs || [], phantom: x.s.phantom || [], connect: x.s.connect || [], chips: (x.ins && x.ins.chips) || [] } : null)),
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
  const ext = (cdpTargets || []).filter((t) => /phantom/i.test(`${t.title} ${t.url}`) && /^chrome-extension:\/\//.test(t.url || ""));
  // build 45: GMGN's built-in wallet shows no address, only its SOL balance in the header
  let chips = [...new Set((r.scan || []).flatMap((x) => (x && x.chips ? x.chips.map((c) => c.text) : [])))];
  // build 52: a 0 (still loading) header chip gives way to the SOL the Instant-trade window shows
  const win = r.instant && r.instant.open && r.instant.winSol > 0 ? String(r.instant.winSol) : null;
  if (win && !chips.some((c) => Number(c) > 0)) chips = [win];
  const evidence = [...addrs.map((a) => `address shown: ${a}`), ...chips.map((c) => `header balance chip: ${c} SOL`), ...phantomText.map((t) => `page says: ${t}`), ...ext.map((t) => `extension target: ${t.title}`), ...connect.map((t) => `page says: ${t}`)];
  const walletKind = phantomText.length || ext.length ? "phantom" : addrs.length || chips.length ? "gmgn" : "unknown";
  return { walletKind, walletAddr: addrs[0] || null, chipSol: chips.length === 1 ? Number(chips[0]) : null, evidence: evidence.slice(0, 12) };
}

/** The report's verdict: ok only with a trade box holding an amount input, a known wallet and zero inputs. */
export function judge(rep) {
  const why = [];
  const box = (rep.controls || []).filter((c) => c.inTradeBox);
  const ins = rep.instant && rep.instant.open && (rep.instant.buyPresets || []).length && (rep.instant.sellPcts || []).includes("100%");
  if (!rep.tradeBox && !ins) why.push("no trade box found (amount input + Buy control) and no Instant-trade window (buy presets + Sell 100%)");
  if (rep.tradeBox && !box.some((c) => ["textbox", "spinbutton"].includes(c.role))) why.push("no amount input in the trade box");
  if (rep.inputs) why.push(`${rep.inputs} trusted input(s) recorded on the probe page`);
  if (rep.walletKind === "unknown") why.push("wallet kind unknown");
  return { ok: why.length === 0, why: why.join("; ") || "ok" };
}

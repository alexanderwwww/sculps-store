// Aquarius's hands inside a tab. Each function is injected on its own with chrome.scripting.executeScript({ func }),
// so each one is self-contained and uses nothing outside itself.

/** The page as a short list of what can be read and touched, each with a ref (data-aq-ref) to act on. */
export function aqLook(full) {
  const max = full ? 1200 : 300, out = [];
  let n = Number(document.documentElement.getAttribute("data-aq-n") || 0);
  const vis = (el) => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
  const name = (el) => (el.getAttribute("aria-label") || el.labels?.[0]?.innerText || el.placeholder || el.innerText || el.value || el.title || el.alt || "").replace(/\s+/g, " ").trim().slice(0, 100);
  const role = (el) => {
    const t = el.tagName.toLowerCase(), r = el.getAttribute("role");
    if (r) return r;
    if (t === "a") return "link"; if (t === "button" || (t === "input" && /^(submit|button|reset)$/.test(el.type))) return "button";
    if (t === "select") return "combobox"; if (t === "textarea" || el.isContentEditable) return "textbox";
    if (t === "input") return el.type === "checkbox" ? "checkbox" : el.type === "radio" ? "radio" : "textbox";
    if (/^h[1-6]$/.test(t)) return "heading"; return t;
  };
  const sel = "a[href],button,input:not([type=hidden]),textarea,select,[role=button],[role=link],[role=textbox],[contenteditable=true],h1,h2,h3";
  for (const el of document.querySelectorAll(sel)) {
    if (out.length >= max) break;
    if (!vis(el) || el.closest("#__aq_magic,#__aq_card")) continue;
    let ref = el.getAttribute("data-aq-ref");
    if (!ref) { ref = "a" + (++n); el.setAttribute("data-aq-ref", ref); }
    const r = role(el), nm = name(el);
    out.push(r === "heading" ? `heading "${nm}"` : `${r} "${nm}" [ref=${ref}]${el.type === "password" ? " (password)" : ""}`);
  }
  document.documentElement.setAttribute("data-aq-n", String(n));
  return { url: location.href, title: document.title, lines: out };
}

/** What a ref is, where it is, and whether it is a secret or money field. */
export function aqInfo(ref) {
  const el = document.querySelector(`[data-aq-ref="${String(ref).replace(/[^a-z0-9]/gi, "")}"]`);
  if (!el) return null;
  el.scrollIntoView({ block: "center", inline: "nearest" });
  const r = el.getBoundingClientRect();
  const label = [el.name, el.id, el.getAttribute("aria-label"), el.placeholder, el.getAttribute("autocomplete"), el.labels?.[0]?.innerText].join(" ");
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, type: (el.type || "").toLowerCase(), label,
    name: (el.innerText || el.getAttribute("aria-label") || el.value || el.title || "").replace(/\s+/g, " ").trim().slice(0, 100),
    url: location.href };
}

/** Types instantly: native value setter + input events for fields, insertText for contenteditable. */
export function aqType(ref, text, clear) {
  const el = document.querySelector(`[data-aq-ref="${String(ref).replace(/[^a-z0-9]/gi, "")}"]`);
  if (!el) return "missing";
  if ((el.type || "").toLowerCase() === "password") return "secret";
  el.focus();
  if (el.isContentEditable) {
    if (clear) { document.execCommand("selectAll"); document.execCommand("delete"); }
    document.execCommand("insertText", false, text);
  } else {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const set = Object.getOwnPropertyDescriptor(proto, "value").set;
    set.call(el, (clear ? "" : el.value) + text);
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
  return "ok";
}

export function aqClick(ref) {
  const el = document.querySelector(`[data-aq-ref="${String(ref).replace(/[^a-z0-9]/gi, "")}"]`);
  if (!el) return "missing";
  el.click();
  return "ok";
}

export function aqPress(key) {
  const el = document.activeElement || document.body;
  if (key === "Enter" && el && el.form) { if (el.form.requestSubmit) el.form.requestSubmit(); else el.form.submit(); return "submitted"; }
  for (const type of ["keydown", "keypress", "keyup"]) el.dispatchEvent(new KeyboardEvent(type, { key, code: key, bubbles: true, cancelable: true }));
  return "ok";
}

export function aqReadText(ref) {
  const el = ref ? document.querySelector(`[data-aq-ref="${String(ref).replace(/[^a-z0-9]/gi, "")}"]`) : document.body;
  return el ? el.innerText : null;
}

export function aqSelect(ref, option) {
  const el = document.querySelector(`[data-aq-ref="${String(ref).replace(/[^a-z0-9]/gi, "")}"]`);
  if (!el || el.tagName !== "SELECT") return "missing";
  const o = [...el.options].find((x) => x.text.trim() === option || x.value === option);
  if (!o) return "no such option";
  el.value = o.value; el.dispatchEvent(new Event("change", { bubbles: true })); return "ok";
}

/** The Approve / Deny card, on the page Alex is looking at. Choice lands in window.__aqChoice. */
export function aqCard(title, what) {
  document.getElementById("__aq_card")?.remove();
  window.__aqChoice = null;
  const d = document.createElement("div"); d.id = "__aq_card";
  d.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:2147483647;background:#0e1430;color:#eef6ff;font:14px -apple-system,Helvetica,Arial,sans-serif;padding:16px 18px;border-radius:16px;border:1.5px solid #f2c14e;box-shadow:0 10px 40px rgba(0,0,0,.45);max-width:360px";
  const h = document.createElement("div"); h.textContent = "🧞 Aquarius asks · " + title; h.style.cssText = "font-weight:700;margin-bottom:6px;color:#f2c14e";
  const t = document.createElement("div"); t.textContent = what; t.style.cssText = "opacity:.9;margin-bottom:12px;word-break:break-word";
  const row = document.createElement("div"); row.style.cssText = "display:flex;gap:8px";
  const mk = (label, bg, v) => { const b = document.createElement("button"); b.textContent = label; b.setAttribute("data-aq-choice", v);
    b.style.cssText = `flex:1;border:0;border-radius:10px;padding:9px;font-weight:700;cursor:pointer;color:#0e1430;background:${bg}`;
    b.onclick = () => { window.__aqChoice = v; d.remove(); }; return b; };
  row.append(mk("Approve", "#f2c14e", "approve"), mk("Deny", "#9fb3d9", "deny"));
  d.append(h, t, row); document.documentElement.appendChild(d);
  return true;
}
export function aqCardChoice() { return window.__aqChoice || null; }
export function aqCardClear() { document.getElementById("__aq_card")?.remove(); return true; }

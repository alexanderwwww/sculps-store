// Aquarius on claude.ai: the floating genie (shadow DOM), his voice (wake word "Aquarius") and his typing into the chat.
import { CONFIG } from "./config.js";
import { mountGenie } from "../../page/genie.js";
import { parseWake, decide } from "../../page/wake.js";
import { aqMagic } from "./magic.js";

if (window.top === window && !window.__aquarius) {
  window.__aquarius = true;
  const get = (k) => chrome.storage.local.get(k);
  let host = null, genie = null, drift = null, rec = null;

  /* ---------------- the genie ---------------- */
  async function show() {
    const s = await get(["on", "hiddenUntil", "suit", "listen"]);
    const visible = s.on !== false && !(s.hiddenUntil > Date.now());
    if (!visible) { hide(); return; }
    if (!host) {
      host = document.createElement("div"); host.id = "aquarius-genie";
      host.style.cssText = "position:fixed;left:0;top:0;width:260px;height:320px;z-index:2147483646;pointer-events:none;contain:layout";
      const root = host.attachShadow({ mode: "open" });
      (document.body || document.documentElement).appendChild(host);
      genie = mountGenie(root, { build: CONFIG.build, suit: !!s.suit, listen: s.listen !== false }, { post: onGenie });
      startDrift();
    }
    genie.receive({ type: "state", suit: !!s.suit, listen: s.listen !== false });
    voice(s.listen !== false);
  }
  function hide() { if (host) { genie.destroy(); host.remove(); host = genie = null; cancelAnimationFrame(drift); } voice(false); }
  async function onGenie(m) {
    if (m.type !== "action") return;
    if (m.name === "off") { await chrome.storage.local.set({ on: false }); hide(); }
    if (m.name === "hide") { await chrome.storage.local.set({ hiddenUntil: Date.now() + 3600e3 }); hide(); setTimeout(show, 3600e3 + 500); }
    if (m.name === "suit") await chrome.storage.local.set({ suit: m.suit });
    if (m.name === "listen") { await chrome.storage.local.set({ listen: m.listen }); voice(m.listen); }
  }
  // He drifts slowly around the edges of the window; a menu that is open holds him still.
  function startDrift() {
    let p = Math.random(), last = performance.now(), frames = 0;
    const step = (now) => {
      drift = requestAnimationFrame(step);
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (!host) return;
      const st = genie.state(); if ((++frames % 8) === 0) host.dataset.aq = JSON.stringify(st); // read by the tests, nothing else
      if (st.menuOpen) return;
      const W = Math.max(300, innerWidth - 260), H = Math.max(40, innerHeight - 320 - 170), per = 2 * (W + H); // never down over the composer
      p = (p + (CONFIG.driftPx ?? 14) * dt / per) % 1;
      let d = p * per, x, y;
      if (d < W) { x = d; y = 0; } else if ((d -= W) < H) { x = W; y = d; } else if ((d -= H) < W) { x = W - d; y = H; } else { x = 0; y = H - (d - W); }
      host.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
    };
    drift = requestAnimationFrame(step);
  }

  /* ---------------- typing into the chat ---------------- */
  // Read from the live page every time, never cached: the composer is re-rendered when a chat changes.
  function composer() {
    const c = [...document.querySelectorAll('[contenteditable="true"][role="textbox"], div.ProseMirror[contenteditable="true"], [contenteditable="true"]')]
      .filter((el) => !el.closest("#aquarius-genie") && el.getBoundingClientRect().width > 100);
    return c.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0] || null;
  }
  function sendButton(box) {
    const all = [...document.querySelectorAll('button[aria-label="Send message"], button[aria-label="Send Message"], button[aria-label*="Send" i], button[type="submit"]')];
    const ok = all.filter((b) => !b.disabled && b.getAttribute("aria-disabled") !== "true" && b.getBoundingClientRect().width > 0);
    if (!box || ok.length < 2) return ok[0] || null;
    const r = box.getBoundingClientRect(); // the one nearest the composer
    return ok.sort((a, b) => dist(a, r) - dist(b, r))[0];
  }
  const dist = (el, r) => { const q = el.getBoundingClientRect(); return Math.hypot(q.left - r.right, q.top - r.bottom); };
  const chatQueue = []; let chatting = false;
  async function typeIntoChat(text) {
    chatQueue.push(text); if (chatting) return; chatting = true;
    try {
      while (chatQueue.length) {
        const t = chatQueue[0];
        let box = null;
        for (let i = 0; i < 120; i++) { box = composer(); if (box && !box.innerText.trim()) break; box = null; await new Promise((r) => setTimeout(r, 1000)); } // never over Alex's own typing
        if (!box) return;
        box.focus();
        const r = box.getBoundingClientRect();
        aqMagic(r.left + 40, r.top + r.height / 2, {});
        document.execCommand("insertText", false, t);
        if (!box.innerText.includes(t.slice(0, 20))) box.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertText", data: t, bubbles: true, cancelable: true }));
        genie && genie.receive({ type: "working", on: true });
        let btn = null;
        for (let i = 0; i < 30 && !btn; i++) { await new Promise((r) => setTimeout(r, 100)); btn = sendButton(box); }
        if (btn) { const b = btn.getBoundingClientRect(); aqMagic(b.left + b.width / 2, b.top + b.height / 2, { pitch: 1.5 }); btn.click(); }
        else box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
        setTimeout(() => genie && genie.receive({ type: "working", on: false }), 900);
        chatQueue.shift();
      }
    } finally { chatting = false; }
  }

  /* ---------------- his ears ---------------- */
  // Chrome's webkitSpeechRecognition sends the audio to Google to be transcribed (it is not on-device).
  function voice(on) {
    const SR = window.webkitSpeechRecognition || window.SpeechRecognition;
    if (!on || !SR) { if (rec) { rec.onend = null; try { rec.abort(); } catch {} rec = null; } return; }
    if (rec) return;
    // Conversation mode (Alex, build 3): after "Aquarius, …" he keeps listening WITHOUT the name
    // for CONVO_MS after each thing Alex says, so they can talk normally. "that's all" / "stop listening" ends it.
    let heard = "", woke = false, quiet = 0, denied = false, convoUntil = 0;
    const CONVO_MS = CONFIG.convoMs || 120000;
    const start = () => { try { rec.start(); } catch {} };
    rec = new SR(); rec.continuous = true; rec.interimResults = true; rec.lang = CONFIG.lang || "en-US";
    rec.onresult = (e) => {
      heard = ""; for (let i = 0; i < e.results.length; i++) heard += e.results[i][0].transcript + " ";
      if (decide(heard, convoUntil, Date.now(), CONVO_MS).act === "ignore") return;
      if (!woke) { woke = true; genie && genie.receive({ type: "listening" }); }
      clearTimeout(quiet);
      quiet = setTimeout(() => { // 1.5 s of quiet: act on what was said
        const d = decide(heard, convoUntil, Date.now(), CONVO_MS); woke = false; convoUntil = d.convoUntil;
        if (d.act === "send") { genie && genie.receive({ type: "sent" }); typeIntoChat(`🧞 Aquarius (from Alex's voice): ${d.cmd}`); }
        else genie && genie.receive({ type: "cancel" });
        try { rec.abort(); } catch {} // a fresh session, so the old words are never sent twice
      }, 1500);
    };
    rec.onerror = (e) => { if (e.error === "not-allowed" || e.error === "service-not-allowed") { denied = true; genie && genie.receive({ type: "say", text: "I can't hear you yet: allow the microphone for claude.ai." , face: "worried" }); } };
    rec.onend = () => { if (rec && !denied) setTimeout(start, 250); };
    start();
  }
  window.__aqParseWake = parseWake;

  /* ---------------- messages from the worker ---------------- */
  chrome.runtime.onMessage.addListener((m) => {
    if (m.type === "wake") show();
    if (!genie && m.type !== "chat") return;
    if (m.type === "say") genie.receive({ type: "say", text: m.text, face: m.face, suit: m.suit });
    if (m.type === "working") genie.receive({ type: "working", on: m.on });
    if (m.type === "chat") typeIntoChat(m.text);
  });
  chrome.storage.onChanged.addListener((c) => { if (c.on || c.hiddenUntil || c.listen || c.suit) show(); });
  setInterval(() => { chrome.runtime.sendMessage({ type: "tick" }).catch(() => {}); }, CONFIG.tickMs || 3000);
  setInterval(() => { if (!host) show(); }, 60000);
  window.__aqGenie = () => genie; // tests read his state
  show();
}

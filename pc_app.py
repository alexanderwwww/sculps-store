"""
Mine Solver — definitive edition.
python pc_app.py   |   double-click start.bat

Seed reader is built around a PERSISTENT capture session:
  • opens a real Chrome window you can log into / navigate
  • captures seeds from WebSocket frames, HTTP JSON, request bodies,
    React / Vue / Angular state, localStorage, the DOM and raw page text
  • every candidate is scored so the most trustworthy source wins
  • hit GRAB any time to pull the latest — works on the hard sites too
"""

import collections
import glob
import json
import os
import queue
import re
import socket
import threading
import time
import uuid
import webbrowser

from flask import Flask, jsonify, render_template, request
from playwright.sync_api import sync_playwright

from solver import MinesweeperSolver

app  = Flask(__name__)
jobs = collections.defaultdict(lambda: {"status": "pending", "log": [], "result": None, "grid": None})

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")


# ─────────────────────────────────────────────────────────────────────────────
# Validators + scored candidate pool helpers
# ─────────────────────────────────────────────────────────────────────────────

_HEX = re.compile(r"^[0-9a-fA-F]+$")


def _valid(field, v, trusted):
    """Return a cleaned value if it's plausible for `field`, else None.
    `trusted` (high score / exact key match) loosens the format rules."""
    v = ("" if v is None else str(v)).strip()
    if not v:
        return None
    if field == "serverHash":
        return v if (_HEX.match(v) and len(v) == 64) else None
    if field == "serverSeed":
        if _HEX.match(v) and 16 <= len(v) <= 128:
            return v
        if trusted and re.match(r"^[A-Za-z0-9]{16,128}$", v):
            return v
        return None
    if field == "clientSeed":
        if trusted and 1 <= len(v) <= 80:
            return v
        if re.match(r"^[A-Za-z0-9_\-]{3,80}$", v):
            return v
        return None
    if field == "nonce":
        return v if (v.isdigit() and 1 <= len(v) <= 12) else None
    return None


# Flat JSON key spellings → field  (value is the seed/hash/nonce itself)
_SERVER_K = {"serverseed", "server_seed"}
_HASH_K   = {"serverseedhash", "server_seed_hash", "serverhash",
             "hashedserverseed", "server_seed_hashed", "seedhash"}
_CLIENT_K = {"clientseed", "client_seed"}
_NONCE_K  = {"nonce", "betnumber", "bet_number", "gamenumber",
             "game_number", "round", "roundid", "round_id"}

# Container keys whose VALUE is an object holding the seed (Stake-style:
#   serverSeed: { seed: "...", seedHash: "..." }
#   previousServerSeed: { seed: "...", nonce: 99 }   ← the revealed/unhashed seed
_SERVER_CONTAINER = {"serverseed", "server_seed", "activeserverseed", "active_server_seed",
                     "previousserverseed", "previous_server_seed", "serverseedpair",
                     "activeserverseedpair", "nextserverseed", "next_server_seed",
                     "currentserverseed", "serverseeddetails"}
_CLIENT_CONTAINER = {"clientseed", "client_seed", "activeclientseed",
                     "active_client_seed", "clientseedpair", "clientseeddetails"}
# Child keys found INSIDE a seed container object
_CHILD_SEED = {"seed", "unhashed", "unhashedseed", "revealed", "revealedseed",
               "value", "plain", "plainseed"}
_CHILD_HASH = {"seedhash", "hash", "hashedseed", "hashed", "seedhashed", "hashedvalue"}


def _norm(k):
    return re.sub(r"[-\s]", "", str(k).lower())


# Raw-text regexes (for WebSocket frames / request bodies / non-JSON blobs)
_TEXT_PATTERNS = {
    "serverHash": [re.compile(r"(?:server[_\s]?seed[_\s]?hash|hashed[_\s]?server[_\s]?seed)"
                              r"\W{0,4}([0-9a-fA-F]{64})", re.I)],
    "serverSeed": [re.compile(r"server[_\s]?seed(?!\W{0,4}hash)\W{0,4}([0-9A-Za-z]{16,128})", re.I)],
    "clientSeed": [re.compile(r"client[_\s]?seed\W{0,4}([0-9A-Za-z_\-]{1,80})", re.I)],
    "nonce":      [re.compile(r"nonce\W{0,4}(\d{1,12})", re.I),
                   re.compile(r"bet\s*(?:id|number|no|#)\W{0,4}(\d{1,12})", re.I)],
}


def _short(url):
    try:
        u = re.sub(r"^https?://", "", url)
        return (u[:46] + "…") if len(u) > 47 else u
    except Exception:
        return str(url)[:47]


def _relevant(url):
    u = (url or "").lower()
    return any(t in u for t in ("seed", "fair", "bet", "game", "mine",
                                "graphql", "play", "round", "provab", "verify", "casino"))


def _chrome_path():
    """On this Linux container Playwright's browser lives in /opt/pw-browsers.
    On Windows return None so Playwright uses its own installed Chromium."""
    for pat in ("/opt/pw-browsers/chromium-*/chrome-linux/chrome",
                "/opt/pw-browsers/chromium_headless_shell-*/chrome-linux/headless_shell"):
        m = glob.glob(pat)
        if m:
            return m[0]
    return None


# ─────────────────────────────────────────────────────────────────────────────
# In-page JS scanner — React/Vue/Angular state, window globals, storage, DOM, text
# Returns {fields:[{field,value,score,src}, ...]} so Python can merge with scores.
# ─────────────────────────────────────────────────────────────────────────────

SEED_JS = r"""
() => {
  const out = [];
  const isHex = s => /^[0-9a-fA-F]{16,128}$/.test(s);
  const is64  = s => /^[0-9a-fA-F]{64}$/.test(s);
  const isNon = s => /^\d{1,12}$/.test(s);
  const push  = (field, value, score, src) => {
    value = (value == null ? '' : String(value)).trim();
    if (value) out.push({field, value, score, src});
  };
  const SK=['serverseed','server_seed'],
        HK=['serverseedhash','server_seed_hash','serverhash','hashedserverseed','seedhash'],
        CK=['clientseed','client_seed'],
        NK=['nonce','betnumber','bet_number','gamenumber','game_number','round','roundid','round_id'],
        SCON=['serverseed','server_seed','activeserverseed','previousserverseed','serverseedpair',
              'activeserverseedpair','nextserverseed','currentserverseed','serverseeddetails'],
        CCON=['clientseed','client_seed','activeclientseed','clientseedpair','clientseeddetails'],
        CSEED=['seed','unhashed','unhashedseed','revealed','revealedseed','value','plain','plainseed'],
        CHASH=['seedhash','hash','hashedseed','hashed','seedhashed','hashedvalue'];
  const norm = k => String(k).toLowerCase().replace(/[-\s]/g,'');

  function dig(obj, src, score, depth, seen, ctx) {
    if (depth > 7 || !obj || typeof obj !== 'object') return;
    if (seen.has(obj)) return; seen.add(obj);
    if (Array.isArray(obj)) { for (let i=0;i<Math.min(obj.length,50);i++) dig(obj[i],src,score,depth+1,seen,ctx); return; }
    for (const k in obj) {
      let v; try { v = obj[k]; } catch(e) { continue; }
      const nk = norm(k), sv = (v==null?'':String(v));
      if      (SK.includes(nk)) push('serverSeed', sv, score, src+'.'+k);
      else if (HK.includes(nk)) push('serverHash', sv, score, src+'.'+k);
      else if (CK.includes(nk)) push('clientSeed', sv, score, src+'.'+k);
      else if (NK.includes(nk)) push('nonce',      sv, score, src+'.'+k);
      if      (ctx==='server') { if (CSEED.includes(nk)) push('serverSeed',sv,score,src+'.'+k); else if (CHASH.includes(nk)) push('serverHash',sv,score,src+'.'+k); }
      else if (ctx==='client') { if (CSEED.includes(nk)) push('clientSeed',sv,score,src+'.'+k); }
      if (v && typeof v === 'object') {
        let child = ctx;
        if (SCON.includes(nk)) child='server'; else if (CCON.includes(nk)) child='client';
        dig(v, src+'.'+k, score, depth+1, seen, child);
      }
    }
  }

  // ── window globals ──
  const SKIP = new Set(['window','self','document','frames','parent','top','chrome','webkit',
    'CSS','performance','console','history','location','navigator','screen','indexedDB','crypto',
    'localStorage','sessionStorage','external','clientInformation','styleMedia','trustedTypes','visualViewport']);
  for (const key in window) {
    if (SKIP.has(key) || /^(webkit|on)/.test(key)) continue;
    let v; try { v = window[key]; } catch(e) { continue; }
    if (v && typeof v === 'object') { try { dig(v, 'win.'+key, 64, 0, new WeakSet()); } catch(e){} }
  }

  // ── React fiber / Vue / Angular component state ──
  try {
    let n = 0;
    for (const el of document.querySelectorAll('*')) {
      if (n++ > 4000) break;
      for (const k in el) {
        if (k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance')) {
          let f = el[k], hop = 0;
          while (f && hop < 30) {
            try { if (f.memoizedProps) dig(f.memoizedProps, 'react.props', 66, 0, new WeakSet()); } catch(e){}
            try { if (f.memoizedState) dig(f.memoizedState, 'react.state', 66, 0, new WeakSet()); } catch(e){}
            f = f.return; hop++;
          }
        } else if (k === '__vueParentComponent' || k === '__vue__') {
          try {
            const c = el[k];
            dig(c.props || {}, 'vue.props', 66, 0, new WeakSet());
            dig(c.setupState || c.data || c.ctx || {}, 'vue.state', 66, 0, new WeakSet());
          } catch(e){}
        } else if (k === '__ngContext__') {
          try { dig(el[k], 'ng.ctx', 64, 0, new WeakSet()); } catch(e){}
        }
      }
    }
  } catch(e){}

  // ── localStorage / sessionStorage ──
  for (const st of [window.localStorage, window.sessionStorage]) {
    try {
      for (let i=0;i<st.length;i++) {
        const k = st.key(i), v = st.getItem(k)||'', nk = norm(k);
        try { dig(JSON.parse(v), 'storage.'+k, 52, 0, new WeakSet()); } catch(e){}
        if (isHex(v)) {
          if (nk.includes('server') && nk.includes('hash')) push('serverHash', v, 50, 'ls:'+k);
          else if (nk.includes('server'))                   push('serverSeed', v, 50, 'ls:'+k);
          else if (nk.includes('client'))                   push('clientSeed', v, 50, 'ls:'+k);
        }
        if (isNon(v) && nk.includes('nonce')) push('nonce', v, 50, 'ls:'+k);
      }
    } catch(e){}
  }

  // ── DOM inputs + elements that mention seed/hash/nonce ──
  function labelFor(el) {
    let t = '';
    try { if (el.id) { const l = document.querySelector('label[for="'+CSS.escape(el.id)+'"]'); if (l) t += ' '+l.textContent; } } catch(e){}
    for (const sel of ['label','[class*="label"]','[class*="field"]','[class*="row"]','[class*="item"]','[class*="seed"]']) {
      try { const p = el.closest(sel); if (p) { t += ' '+p.textContent; break; } } catch(e){}
    }
    t += ' '+(el.placeholder||'')+' '+(el.name||'')+' '+(el.id||'')+' '+((el.getAttribute&&el.getAttribute('aria-label'))||'');
    return t.toLowerCase();
  }
  const domSel = 'input,textarea,[contenteditable],code,[class*="seed" i],[class*="hash" i],[class*="nonce" i],[id*="seed" i]';
  for (const el of document.querySelectorAll(domSel)) {
    let val = (el.value || (el.getAttribute && el.getAttribute('value')) || el.textContent || '').trim();
    if (!val || val.length < 3 || val.length > 200) continue;
    const lbl = labelFor(el);
    if      (lbl.includes('server') && lbl.includes('hash') && is64(val))            push('serverHash', val, 58, 'dom:hash');
    else if (lbl.includes('server') && lbl.includes('seed') && isHex(val))           push('serverSeed', val, 58, 'dom:server');
    else if (lbl.includes('client') && lbl.includes('seed') && val.length<=80)       push('clientSeed', val, 58, 'dom:client');
    else if (lbl.includes('nonce') && isNon(val))                                    push('nonce',      val, 56, 'dom:nonce');
  }

  // ── raw text patterns + last-resort harvest ──
  const txt = ((document.body && document.body.innerText) || '').slice(0, 200000);
  const tp = [
    {f:'serverHash', re:/(?:server[_\s]?seed[_\s]?hash|hashed[_\s]?server[_\s]?seed)\W{0,4}([0-9a-fA-F]{64})/i, sc:42},
    {f:'serverSeed', re:/server[_\s]?seed(?!\W{0,4}hash)\W{0,4}([0-9a-fA-F]{16,128})/i, sc:40},
    {f:'clientSeed', re:/client[_\s]?seed\W{0,4}([0-9A-Za-z_\-]{3,80})/i, sc:40},
    {f:'nonce',      re:/nonce\W{0,4}(\d{1,12})/i, sc:40},
  ];
  for (const {f,re,sc} of tp) { const m = txt.match(re); if (m) push(f, m[1], sc, 'text'); }
  const h64 = txt.match(/\b[0-9a-f]{64}\b/i); if (h64) push('serverHash', h64[0], 12, 'harvest64');

  return {fields: out};
}
"""


# Buttons to click to open fairness / seed modals (tried in order)
FAIRNESS_SELECTORS = [
    "button:has-text('Fairness')", "button:has-text('Provably Fair')",
    "button:has-text('Verify')",   "button:has-text('Seeds')",
    "button:has-text('Seed')",     "a:has-text('Fairness')",
    "a:has-text('Provably Fair')", "a:has-text('Verify')",
    "[aria-label*='fair' i]",      "[title*='fair' i]",
    "[aria-label*='provable' i]",  "[title*='provable' i]",
    "[aria-label*='seed' i]",      "[title*='seed' i]",
    "[class*='fairness']",         "[class*='provabl']",
    "[class*='seed-btn']",         "[class*='verify']",
    "[data-testid*='fair']",       "[data-testid*='seed']",
]


# ─────────────────────────────────────────────────────────────────────────────
# Persistent capture session (its own thread owns the Playwright browser)
# ─────────────────────────────────────────────────────────────────────────────

class CaptureSession(threading.Thread):
    def __init__(self):
        super().__init__(daemon=True)
        self.cmds   = queue.Queue()
        self.pool   = {}                                # field -> (value, score, src)
        self.events = collections.deque(maxlen=200)
        self.url    = ""
        self.alive  = False
        self.ws_count = 0
        self.req_count = 0
        self._p = self._browser = self._ctx = self._page = None
        self.start()

    # ── candidate recording ──
    def record(self, field, value, score, src):
        val = _valid(field, value, trusted=score >= 60)
        if not val:
            return
        cur = self.pool.get(field)
        if cur is None or score > cur[1]:
            self.pool[field] = (val, score, src)
            self.events.append(f"{field} ← {src} ({score})")

    def dig(self, obj, src, score, depth=0, ctx=None):
        if depth > 7 or obj is None:
            return
        if isinstance(obj, dict):
            for k, v in obj.items():
                nk = _norm(k)
                # flat keys whose value is the seed itself
                if   nk in _SERVER_K: self.record("serverSeed", v, score, f"{src}.{k}")
                elif nk in _HASH_K:   self.record("serverHash", v, score, f"{src}.{k}")
                elif nk in _CLIENT_K: self.record("clientSeed", v, score, f"{src}.{k}")
                elif nk in _NONCE_K:  self.record("nonce",      v, score, f"{src}.{k}")
                # generic child keys, only meaningful inside a seed container
                if ctx == "server":
                    if   nk in _CHILD_SEED: self.record("serverSeed", v, score, f"{src}.{k}")
                    elif nk in _CHILD_HASH: self.record("serverHash", v, score, f"{src}.{k}")
                elif ctx == "client":
                    if nk in _CHILD_SEED:   self.record("clientSeed", v, score, f"{src}.{k}")
                if isinstance(v, (dict, list)):
                    child = ctx
                    if   nk in _SERVER_CONTAINER: child = "server"
                    elif nk in _CLIENT_CONTAINER: child = "client"
                    self.dig(v, f"{src}.{k}", score, depth + 1, child)
        elif isinstance(obj, list):
            for it in obj[:40]:
                self.dig(it, src, score, depth + 1, ctx)

    def _json_blobs(self, text):
        blobs, dec, i, n = [], json.JSONDecoder(), 0, len(text)
        while i < n and len(blobs) < 40:
            if text[i] in "{[":
                try:
                    _, end = dec.raw_decode(text, i)
                    blobs.append(text[i:end]); i = end; continue
                except Exception:
                    pass
            i += 1
        return blobs

    def scan_text(self, text, src, score):
        if not text:
            return
        if len(text) > 600000:
            text = text[:600000]
        for blob in self._json_blobs(text):
            try:
                self.dig(json.loads(blob), src, score)
            except Exception:
                pass
        for field, pats in _TEXT_PATTERNS.items():
            for pat in pats:
                m = pat.search(text)
                if m:
                    self.record(field, m.group(1), max(score - 15, 20), src + ":re")

    # ── Playwright event handlers (fire while the loop is pumped) ──
    def _on_response(self, resp):
        try:
            ct = (resp.headers or {}).get("content-type", "")
            url = resp.url
            is_json = "json" in ct or "graphql" in url
            if not (is_json or _relevant(url)):
                return
            rt = ""
            try: rt = resp.request.resource_type
            except Exception: pass
            if not (is_json or rt in ("xhr", "fetch")):
                return
            if is_json:
                try:
                    self.dig(resp.json(), "http:" + _short(url), 90); return
                except Exception:
                    pass
            self.scan_text(resp.text(), "http:" + _short(url), 86)
        except Exception:
            pass

    def _on_request(self, req):
        try:
            if req.method == "POST" or req.resource_type in ("xhr", "fetch"):
                pd = req.post_data
                if pd:
                    self.req_count += 1
                    self.scan_text(pd, "req:" + _short(req.url), 85)
        except Exception:
            pass

    def _frame(self, ws_url, frame):
        try:
            payload = getattr(frame, "payload", frame)
            if isinstance(payload, (bytes, bytearray)):
                payload = payload.decode("utf-8", "ignore")
            if isinstance(payload, str) and payload:
                self.scan_text(payload, "ws:" + _short(ws_url), 100)
        except Exception:
            pass

    def _on_ws(self, ws):
        self.ws_count += 1
        self.events.append("ws ↔ " + _short(ws.url))
        try:
            ws.on("framereceived", lambda f: self._frame(ws.url, f))
            ws.on("framesent",     lambda f: self._frame(ws.url, f))
        except Exception:
            pass

    def _wire_page(self, page):
        try:
            page.on("websocket", self._on_ws)
        except Exception:
            pass

    # ── command handling (runs on the worker thread) ──
    def run(self):
        try:
            with sync_playwright() as p:
                self._p = p
                while True:
                    try:
                        cmd = self.cmds.get(timeout=0.2)
                    except queue.Empty:
                        cmd = None
                    if cmd is not None:
                        action, payload, rq = cmd
                        try:
                            res = self._handle(action, payload)
                        except Exception as e:
                            res = {"error": str(e)}
                        if rq is not None:
                            rq.put(res)
                    # keep the event loop alive so WS / HTTP handlers keep firing
                    if self.alive and self._page:
                        try:
                            self._page.wait_for_timeout(80)
                        except Exception:
                            self.alive = False
        except Exception as e:
            self.events.append("session crashed: " + str(e)[:120])

    def _handle(self, action, payload):
        if action == "open":  return self._open(payload)
        if action == "grab":  return self._grab()
        if action == "close":
            self._teardown(); return {"ok": True}
        return {"error": "unknown action"}

    def _teardown(self):
        for obj in (self._ctx, self._browser):
            try:
                if obj: obj.close()
            except Exception:
                pass
        self._ctx = self._browser = self._page = None
        self.alive = False

    def _open(self, url):
        if not url.startswith("http"):
            url = "https://" + url
        self._teardown()
        self.pool = {}; self.events.clear()
        self.ws_count = self.req_count = 0
        self._browser = self._p.chromium.launch(
            headless=False,
            executable_path=_chrome_path(),
            args=["--ignore-certificate-errors", "--start-maximized",
                  "--disable-blink-features=AutomationControlled"],
        )
        self._ctx = self._browser.new_context(
            no_viewport=True, ignore_https_errors=True, user_agent=UA)
        # context-level network capture covers every page + popup
        self._ctx.on("response", self._on_response)
        self._ctx.on("request",  self._on_request)
        self._ctx.on("page",     self._wire_page)
        self._page = self._ctx.new_page()
        self._wire_page(self._page)
        self.url = url; self.alive = True
        try:
            self._page.goto(url, wait_until="domcontentloaded", timeout=45000)
        except Exception as e:
            self.events.append("load: " + str(e)[:90])
        # let initial XHR / WebSocket traffic flow
        try:
            self._page.wait_for_timeout(2500)
        except Exception:
            pass
        return self.snapshot()

    def _try_modal(self):
        if not self._page:
            return
        for sel in FAIRNESS_SELECTORS:
            try:
                el = self._page.query_selector(sel)
                if el and el.is_visible():
                    el.click(); self._page.wait_for_timeout(800); return True
            except Exception:
                pass
        return False

    def _grab(self):
        if self.alive and self._ctx:
            # if we still don't have the key pair, try to surface a fairness modal
            if not (self.pool.get("serverSeed") or self.pool.get("serverHash")) \
               or not self.pool.get("clientSeed"):
                try: self._try_modal()
                except Exception: pass
            # scan every page + every frame (seeds often live in an iframe / popup)
            for pg in list(self._ctx.pages):
                for fr in pg.frames:
                    try:
                        res = fr.evaluate(SEED_JS)
                        for c in (res or {}).get("fields", []):
                            self.record(c["field"], c["value"], c["score"], "js:" + c["src"])
                    except Exception:
                        pass
        return self.snapshot()

    def snapshot(self):
        out = {"found": False, "alive": self.alive, "url": self.url,
               "serverSeed": "", "serverHash": "", "clientSeed": "", "nonce": "",
               "sources": {}, "ws": self.ws_count, "reqs": self.req_count,
               "events": list(self.events)[-30:]}
        for f in ("serverSeed", "serverHash", "clientSeed", "nonce"):
            cur = self.pool.get(f)
            if cur:
                out[f] = cur[0]
                out["sources"][f] = {"src": cur[2], "score": cur[1]}
                out["found"] = True
        return out


_SESSION = None
_SLOCK = threading.Lock()


def get_session():
    global _SESSION
    with _SLOCK:
        if _SESSION is None:
            _SESSION = CaptureSession()
        return _SESSION


def _send(action, payload, timeout):
    rq = queue.Queue()
    get_session().cmds.put((action, payload, rq))
    try:
        return rq.get(timeout=timeout)
    except queue.Empty:
        return {"error": f"{action} timed out"}


# ─────────────────────────────────────────────────────────────────────────────
# UNIVERSAL BOARD SCANNER (for the SCAN URL / AUTO PLAY tabs)
# ─────────────────────────────────────────────────────────────────────────────

BOARD_JS = r"""
() => {
  function looksLikeMineCoords(a){if(!Array.isArray(a)||a.length<1||a.length>2000)return false;const s=a[0];if(!s||typeof s!=='object')return false;return('row'in s&&'col'in s)||('row'in s&&'column'in s)||('x'in s&&'y'in s)||('r'in s&&'c'in s);}
  function looksLikeCellArray(a){if(!Array.isArray(a)||a.length<9||a.length>10000)return false;const s=a[0];if(!s||typeof s!=='object')return false;return'mine'in s||'isMine'in s||'hasMine'in s||'bomb'in s||'value'in s;}
  function looksLike2DGrid(a){if(!Array.isArray(a)||a.length<3)return false;if(!Array.isArray(a[0])||a[0].length<3)return false;const c=a[0][0];return c&&typeof c==='object'&&('mine'in c||'isMine'in c||'value'in c||'type'in c);}
  function extractMines(obj,p,d){
    if(d>4||!obj||typeof obj!=='object')return null;
    if(looksLikeMineCoords(obj))return obj.map(m=>({row:m.row??m.y??m.r,col:m.col??m.column??m.x??m.c}));
    if(looksLikeCellArray(obj)){const cols=obj.cols||obj.width||Math.round(Math.sqrt(obj.length));return obj.reduce((a,c,i)=>{if(c&&(c.mine||c.isMine||c.hasMine||c.bomb||c.value===-1||c.value===9))a.push({row:Math.floor(i/cols),col:i%cols});return a;},[]);}
    if(looksLike2DGrid(obj)){const m=[];for(let r=0;r<obj.length;r++)for(let c=0;c<obj[r].length;c++){const cell=obj[r][c];if(cell&&(cell.mine||cell.isMine||cell.value===-1||cell.value===9||cell.type==='mine'))m.push({row:r,col:c});}if(m.length)return m;}
    for(const k of['mines','bombs','mineList','board','cells','grid','tiles','field','data','map']){if(k in obj){const r=extractMines(obj[k],p+'.'+k,d+1);if(r&&r.length)return r;}}
    return null;
  }
  const skip=new Set(['window','self','document','top','parent','frames','chrome','webkit','CSS','performance','console','history','location','navigator','screen','crypto','indexedDB','localStorage','sessionStorage']);
  for(const key of Object.keys(window)){if(skip.has(key)||key.startsWith('__')||key.startsWith('webkit'))continue;try{const m=extractMines(window[key],key,0);if(m&&m.length)return{found:true,source:'js:'+key,mines:m};}catch(e){}}
  function findGrid(){const sels=['.cell','td','[class*="cell"]','[class*="tile"]','[class*="square"]','[class*="block"]'];for(const s of sels){const els=Array.from(document.querySelectorAll(s));if(els.length<9||els.length>10000)continue;const rects=els.slice(0,10).map(e=>e.getBoundingClientRect());const w=Math.round(rects[0].width),h=Math.round(rects[0].height);if(w<5||h<5)continue;if(rects.every(r=>Math.abs(r.width-w)<3&&Math.abs(r.height-h)<3))return{els,sel:s,cellW:w,cellH:h};}return null;}
  function cellState(el){const cls=(el.className||'').toLowerCase(),text=el.textContent.trim();if(cls.includes('mine')||cls.includes('bomb')||text==='💣')return{type:'mine'};if(cls.includes('flag')||text==='🚩')return{type:'flag'};const n=parseInt(text);if(!isNaN(n)&&n>=0&&n<=8&&text!=='')return{type:'number',value:n};if(cls.includes('closed')||cls.includes('hidden')||cls.includes('unrev')||cls.includes('covered'))return{type:'unknown'};if(cls.includes('open')||cls.includes('reveal')||cls.includes('blank')||cls.includes('empty'))return{type:'empty'};const bg=window.getComputedStyle(el).backgroundColor,m=bg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);if(m){const b=(+m[1]+ +m[2]+ +m[3])/3;return{type:b>160?'empty':'unknown'};}return{type:'unknown'};}
  const grid=findGrid();if(!grid)return{found:false,reason:'no grid'};
  const{els,sel,cellW,cellH}=grid;
  let rows=0,cols=0;const cells=[];
  const attrPairs=[['data-x','data-y'],['data-col','data-row'],['data-column','data-row'],['data-c','data-r']];
  let usedAttrs=null;for(const[xa,ya]of attrPairs){if(els[0].getAttribute(xa)!==null){usedAttrs=[xa,ya];break;}}
  if(usedAttrs){const[xa,ya]=usedAttrs;for(const el of els){const c=parseInt(el.getAttribute(xa)),r=parseInt(el.getAttribute(ya));if(isNaN(r)||isNaN(c))continue;rows=Math.max(rows,r+1);cols=Math.max(cols,c+1);cells.push({row:r,col:c,...cellState(el)});}}
  else{const rects=els.map(el=>({el,rect:el.getBoundingClientRect()})).filter(({rect:r})=>r.width>0);const topV=[...new Set(rects.map(({rect:r})=>Math.round(r.top/(cellH*.8))*Math.round(cellH*.8)))].sort((a,b)=>a-b);const leftV=[...new Set(rects.map(({rect:r})=>Math.round(r.left/(cellW*.8))*Math.round(cellW*.8)))].sort((a,b)=>a-b);for(const{el,rect:r}of rects){const row=topV.findIndex(t=>Math.abs(t-Math.round(r.top/(cellH*.8))*Math.round(cellH*.8))<3);const col=leftV.findIndex(l=>Math.abs(l-Math.round(r.left/(cellW*.8))*Math.round(cellW*.8))<3);if(row<0||col<0)continue;rows=Math.max(rows,row+1);cols=Math.max(cols,col+1);cells.push({row,col,...cellState(el)});}}
  const mines=cells.filter(c=>c.type==='mine');
  return{found:true,source:'dom:'+sel,rows,cols,cells,mines:mines.length?mines:null};
}
"""


def build_grid(rows, cols, numbers, mine_set, flagged, unknown_set, safe_set=None):
    safe_set = safe_set or set()
    grid = []
    for r in range(rows):
        row = []
        for c in range(cols):
            coord = (r, c)
            if   coord in mine_set:    row.append({"type": "mine"})
            elif coord in flagged:     row.append({"type": "flag"})
            elif coord in numbers:     row.append({"type": "number", "value": numbers[coord]})
            elif coord in safe_set:    row.append({"type": "safe"})
            elif coord in unknown_set: row.append({"type": "unknown"})
            else:                      row.append({"type": "empty"})
        grid.append(row)
    return grid


def cells_to_board(cell_list):
    numbers, unknown, mine_set, flagged = {}, [], set(), set()
    for cell in cell_list:
        r, c, t = cell.get("row", 0), cell.get("col", 0), cell.get("type", "unknown")
        if   t == "mine":   mine_set.add((r, c))
        elif t == "flag":   flagged.add((r, c))
        elif t == "number": numbers[(r, c)] = cell.get("value", 0)
        elif t == "empty":  numbers[(r, c)] = 0
        else:               unknown.append((r, c))
    return numbers, unknown, mine_set, flagged


def run_job(job_id, url):
    def log(msg): jobs[job_id]["log"].append(msg)
    if not url.startswith("http"): url = "https://" + url
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=False, slow_mo=100,
                executable_path=_chrome_path(),
                args=["--ignore-certificate-errors", "--start-maximized"],
            )
            ctx  = browser.new_context(no_viewport=True, ignore_https_errors=True)
            page = ctx.new_page()
            log(f"Opening {url}")
            page.goto(url, wait_until="networkidle", timeout=30000)
            page.wait_for_timeout(1500)

            log("Scanning page for board data...")
            result = page.evaluate(BOARD_JS)
            if not result or not result.get("found"):
                log(f"Board not detected: {(result or {}).get('reason','unknown')}")
                jobs[job_id]["status"] = "error"; browser.close(); return

            log(f"Board detected ({result.get('source','')})")
            rows = result.get("rows", 0); cols = result.get("cols", 0)
            cell_list = result.get("cells", [])
            if rows == 0 and cell_list:
                rows = max(c["row"] for c in cell_list) + 1
                cols = max(c["col"] for c in cell_list) + 1

            numbers, unknown, mine_set, flagged = cells_to_board(cell_list)
            log(f"Board: {rows}×{cols} — {len(cell_list)} cells")

            if mine_set:
                log(f"Mines visible: {len(mine_set)}")
                jobs[job_id]["grid"] = build_grid(rows, cols, numbers, mine_set, flagged, set(unknown))
                jobs[job_id]["result"] = "scanned"; jobs[job_id]["status"] = "done"
                page.wait_for_timeout(3000); browser.close(); return

            log(f"Using deduction solver ({len(unknown)} unknown cells)")
            xa, ya = "data-x", "data-y"
            for a, b in [("data-x", "data-y"), ("data-col", "data-row"), ("data-column", "data-row")]:
                if page.query_selector(f"[{a}]"):
                    xa, ya = a, b; break

            def click(r, c):
                el = page.query_selector(f"[{xa}='{c}'][{ya}='{r}']")
                if el: el.click()
            def flag(r, c):
                el = page.query_selector(f"[{xa}='{c}'][{ya}='{r}']")
                if el: el.click(button="right")

            if not numbers and unknown:
                start = (rows // 2, cols // 2); log(f"First click: {start}"); click(*start)
                page.wait_for_timeout(700)

            solver = MinesweeperSolver(rows, cols); moves = guesses = stall = 0
            while stall < 3:
                r2 = page.evaluate(BOARD_JS)
                if not r2 or not r2.get("found"): break
                rows = r2.get("rows", rows); cols = r2.get("cols", cols)
                numbers, unknown, mine_set, flagged = cells_to_board(r2.get("cells", []))
                solver.update(numbers, flagged)
                safe, dmines = solver.solve()
                safe   = [c for c in safe   if c in unknown]
                dmines = [c for c in dmines if c not in flagged]
                jobs[job_id]["grid"] = build_grid(rows, cols, numbers, mine_set | set(dmines), flagged, set(unknown), set(safe))
                if not unknown: log(f"Cleared! {moves} moves."); jobs[job_id]["result"] = "win"; break
                if dmines:
                    for coord in dmines: log(f"Flag {coord}"); flag(*coord); moves += 1
                    stall = 0; continue
                if safe:
                    for coord in safe: log(f"Click safe {coord}"); click(*coord); moves += 1
                    stall = 0; continue
                guess = solver.best_guess(unknown)
                if guess: guesses += 1; log(f"Guess {guess}"); click(*guess); moves += 1; stall += 1
                else: break
                page.wait_for_timeout(100)

            log(f"Done — {moves} moves, {guesses} guesses")
            jobs[job_id]["status"] = "done"
            if not jobs[job_id]["result"]: jobs[job_id]["result"] = "done"
            page.wait_for_timeout(3000); browser.close()
    except Exception as e:
        jobs[job_id]["log"].append(f"ERROR: {e}"); jobs[job_id]["status"] = "error"


# ─────────────────────────────────────────────────────────────────────────────
# Flask routes
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("pc.html")


@app.route("/seeds/open", methods=["POST"])
def seeds_open():
    url = (request.json or {}).get("url", "").strip()
    if not url:
        return jsonify({"error": "No URL"}), 400
    return jsonify(_send("open", url, timeout=75))


@app.route("/seeds/grab", methods=["POST"])
def seeds_grab():
    return jsonify(_send("grab", None, timeout=45))


@app.route("/seeds/close", methods=["POST"])
def seeds_close():
    return jsonify(_send("close", None, timeout=20))


@app.route("/parse-html", methods=["POST"])
def parse_html_route():
    """Extract seeds from raw HTML that the user pasted."""
    html = (request.json or {}).get("html", "")
    if not html:
        return jsonify({"error": "No HTML provided"}), 400

    # Strip tags to get visible text, preserving spaces
    import re as _re
    text = _re.sub(r"<[^>]+>", " ", html)
    text = _re.sub(r"&nbsp;", " ", text)
    text = _re.sub(r"&#x?[0-9a-fA-F]+;", " ", text)
    text = _re.sub(r"\s+", " ", text)

    pool = {}

    def best(field, val, score, src):
        v = _valid(field, val, trusted=score >= 60)
        if not v:
            return
        cur = pool.get(field)
        if cur is None or score > cur[1]:
            pool[field] = (v, score, src)

    # 1) look for JSON blobs embedded in the HTML (script tags / data attributes)
    for blob in re.findall(r'\{[^<]{20,}\}', html)[:80]:
        try:
            obj = json.loads(blob)
            # use a lightweight dig
            def _dig(o, src, depth=0):
                if depth > 5 or not isinstance(o, dict):
                    return
                for k, v in o.items():
                    nk = _norm(k)
                    sv = str(v or "")
                    if   nk in _SERVER_K: best("serverSeed", sv, 90, src+"."+k)
                    elif nk in _HASH_K:   best("serverHash", sv, 90, src+"."+k)
                    elif nk in _CLIENT_K: best("clientSeed", sv, 90, src+"."+k)
                    elif nk in _NONCE_K:  best("nonce",      sv, 90, src+"."+k)
                    # nested seed containers
                    if nk in _SERVER_CONTAINER and isinstance(v, dict):
                        for ck, cv in v.items():
                            cnk = _norm(ck)
                            if cnk in _CHILD_SEED: best("serverSeed", str(cv), 85, src+"."+k+"."+ck)
                            if cnk in _CHILD_HASH: best("serverHash", str(cv), 85, src+"."+k+"."+ck)
                    if nk in _CLIENT_CONTAINER and isinstance(v, dict):
                        for ck, cv in v.items():
                            if _norm(ck) in _CHILD_SEED: best("clientSeed", str(cv), 85, src+"."+k+"."+ck)
                    if isinstance(v, (dict, list)):
                        _dig(v, src, depth+1)
            _dig(obj, "json")
        except Exception:
            pass

    # 2) named text patterns on the stripped text
    named = [
        ("serverHash", re.compile(r"(?:server[_\s]?seed[_\s]?hash|hashed[_\s]?server[_\s]?seed)\W{0,6}([0-9a-fA-F]{64})", re.I), 70),
        ("serverSeed", re.compile(r"server[_\s]?seed(?!\W{0,6}hash)\W{0,6}([0-9a-fA-F]{16,128})", re.I), 68),
        ("clientSeed", re.compile(r"client[_\s]?seed\W{0,6}([0-9A-Za-z_\-]{3,80})", re.I), 68),
        ("nonce",      re.compile(r"nonce\W{0,6}(\d{1,12})", re.I), 64),
        ("nonce",      re.compile(r"bet\s*(?:id|number|no|#)\W{0,6}(\d{1,12})", re.I), 60),
    ]
    for field, pat, score in named:
        m = pat.search(text)
        if m:
            best(field, m.group(1), score, "text-pattern")

    # 3) last resort — first 64-char hex block = likely hash
    m64 = re.search(r'\b([0-9a-fA-F]{64})\b', text)
    if m64:
        best("serverHash", m64.group(1), 20, "harvest64")

    if not pool:
        return jsonify({"found": False})

    out = {"found": True, "sources": {}}
    for f in ("serverSeed", "serverHash", "clientSeed", "nonce"):
        if f in pool:
            out[f] = pool[f][0]
            out["sources"][f] = {"src": pool[f][2], "score": pool[f][1]}
    return jsonify(out)


@app.route("/read-seeds", methods=["POST"])  # legacy one-shot: open + settle + grab
def read_seeds_route():
    url = (request.json or {}).get("url", "").strip()
    if not url:
        return jsonify({"error": "No URL"}), 400
    _send("open", url, timeout=75)
    time.sleep(3)
    return jsonify(_send("grab", None, timeout=45))


@app.route("/scan", methods=["POST"])
def scan():
    url = (request.json or {}).get("url", "").strip()
    if not url:
        return jsonify({"error": "No URL"}), 400
    job_id = str(uuid.uuid4())
    jobs[job_id] = {"status": "running", "log": [], "result": None, "grid": None}
    threading.Thread(target=run_job, args=(job_id, url), daemon=True).start()
    return jsonify({"job_id": job_id})


@app.route("/status/<job_id>")
def status(job_id):
    job = jobs.get(job_id)
    if not job:
        return jsonify({"error": "not found"}), 404
    return jsonify(job)


if __name__ == "__main__":
    PORT = int(os.environ.get("PORT", 5000))
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80)); ip = s.getsockname()[0]
    except Exception:
        ip = "127.0.0.1"
    finally:
        s.close()
    print(f"\n{'='*52}\n  💀  MINE SOLVER — definitive edition\n{'='*52}")
    print(f"  PC:    http://localhost:{PORT}")
    print(f"  Phone: http://{ip}:{PORT}\n{'='*52}\n")
    threading.Timer(1.2, lambda: webbrowser.open(f"http://localhost:{PORT}")).start()
    app.run(host="0.0.0.0", port=PORT, debug=False)

"""
Mine Solver — definitive edition.
python pc_app.py   |   double-click start.bat
"""

import json, os, socket, threading, uuid, webbrowser
from collections import defaultdict
from flask import Flask, jsonify, render_template, request
from playwright.sync_api import sync_playwright
from solver import MinesweeperSolver

app   = Flask(__name__)
jobs  = defaultdict(lambda: {"status":"pending","log":[],"result":None,"grid":None})

# ─────────────────────────────────────────────────────────────────────────────
# SEED READER — comprehensive, multi-strategy
# ─────────────────────────────────────────────────────────────────────────────

# JS injected into the page — scans everything: React fiber, window globals,
# localStorage/sessionStorage, DOM inputs, hex-string harvest.
SEED_JS = r"""
() => {
  const R = {serverSeed:'',serverHash:'',clientSeed:'',nonce:'',found:false,sources:[]};

  const is64hex = s => /^[0-9a-f]{64}$/i.test((s||'').trim());
  const isHex   = s => /^[0-9a-f]{16,}$/i.test((s||'').trim());
  const isNonce = s => /^\d{1,10}$/.test((s||'').trim());

  function put(field, val, src) {
    val = (val||'').toString().trim();
    if (!val || R[field]) return;
    R[field] = val; R.found = true; R.sources.push(field+'@'+src);
  }

  // ── STRATEGY 1: window globals + deep nested scan ──
  function digObject(obj, path, depth) {
    if (depth > 5 || !obj || typeof obj !== 'object') return;
    const serverK  = ['serverseed','server_seed'];
    const hashK    = ['serverseedhash','server_seed_hash','serverhash','hashedserverseed'];
    const clientK  = ['clientseed','client_seed'];
    const nonceK   = ['nonce','betnumber','bet_number','gamenumber','game_number','roundnumber','round'];
    for (const [k, v] of Object.entries(obj)) {
      const lk = k.toLowerCase();
      const sv = String(v||'');
      if (serverK.some(x=>lk===x) && isHex(sv))    put('serverSeed', sv, path+'.'+k);
      if (hashK.some(x=>lk===x)   && isHex(sv))    put('serverHash', sv, path+'.'+k);
      if (clientK.some(x=>lk===x) && sv.length>3)  put('clientSeed', sv, path+'.'+k);
      if (nonceK.some(x=>lk===x)  && isNonce(sv))  put('nonce', sv, path+'.'+k);
      // Recurse
      if (v && typeof v==='object') digObject(v, path+'.'+k, depth+1);
    }
  }
  const SKIP = new Set(['window','self','document','frames','parent','top','chrome',
    'webkit','CSS','performance','console','history','location','navigator','screen',
    'indexedDB','crypto','Infinity','NaN','undefined']);
  for (const key of Object.keys(window)) {
    if (SKIP.has(key) || key.startsWith('__') || key.startsWith('webkit')) continue;
    try { digObject(window[key], 'win.'+key, 0); } catch(e) {}
  }

  // ── STRATEGY 2: React / Next.js fiber ──
  function fiberScan(el, d) {
    if (d>4||!el) return;
    const fk = Object.keys(el).find(k=>k.startsWith('__reactFiber')||k.startsWith('__reactInternals'));
    if (fk) try { fibDig(el[fk], 0); } catch(e) {}
    for (const c of (el.children||[])) fiberScan(c, d+1);
  }
  function fibDig(f, d) {
    if (d>25||!f) return;
    try {
      const mp = f.memoizedProps; const ms = f.memoizedState;
      if (mp) digObject(mp, 'fiber.props', 0);
      if (ms) {
        if (ms.memoizedState) digObject(ms.memoizedState,'fiber.state',0);
        if (ms.queue?.lastRenderedState) digObject(ms.queue.lastRenderedState,'fiber.qstate',0);
      }
    } catch(e){}
    try { fibDig(f.child,d+1); } catch(e){}
    try { fibDig(f.sibling,d+1); } catch(e){}
  }
  try {
    const targets = [
      document.querySelector('[class*="fair"],[class*="seed"],[class*="provable"],[class*="game"]'),
      document.querySelector('main'), document.body
    ];
    for (const t of targets) if (t) fiberScan(t, 0);
  } catch(e){}

  // ── STRATEGY 3: localStorage + sessionStorage ──
  for (const st of [window.localStorage, window.sessionStorage]) {
    try {
      for (let i=0; i<st.length; i++) {
        const k=st.key(i), v=st.getItem(k)||'';
        const lk=(k||'').toLowerCase();
        try { digObject(JSON.parse(v), 'storage.'+k, 0); } catch(e){}
        if (isHex(v)) {
          if (lk.includes('server')&&!lk.includes('hash')) put('serverSeed',v,'storage:'+k);
          else if (lk.includes('hash')||is64hex(v))        put('serverHash',v,'storage:'+k);
          else if (lk.includes('client'))                  put('clientSeed',v,'storage:'+k);
        }
        if (isNonce(v) && lk.includes('nonce')) put('nonce',v,'storage:'+k);
      }
    } catch(e){}
  }

  // ── STRATEGY 4: DOM inputs & labels ──
  function nearLabel(el) {
    for (const sel of ['label','[class*="label"]','[class*="title"]','[class*="field"]','[class*="row"]']) {
      const p = el.closest(sel); if (p) return p.textContent.replace(el.value||'','').toLowerCase();
    }
    if (el.id) { const l=document.querySelector(`label[for="${el.id}"]`); if(l) return l.textContent.toLowerCase(); }
    return (el.placeholder||el.name||el.id||'').toLowerCase();
  }
  for (const el of document.querySelectorAll('input,textarea,[readonly],[contenteditable]')) {
    const val = (el.value||el.textContent||'').trim();
    if (!val||val.length<4) continue;
    const lbl = nearLabel(el);
    if ((lbl.includes('server')&&!lbl.includes('hash'))&&isHex(val)) put('serverSeed',val,'input:server');
    else if ((lbl.includes('hash')||lbl.includes('hashed'))&&isHex(val)) put('serverHash',val,'input:hash');
    else if (lbl.includes('client')&&val.length>4) put('clientSeed',val,'input:client');
    else if ((lbl.includes('nonce')||lbl.includes('bet'))&&isNonce(val)) put('nonce',val,'input:nonce');
  }

  // ── STRATEGY 5: Full-page text harvest ──
  const bodyText = document.body.innerText;
  // Named captures: "Server Seed: <value>" patterns
  const patterns = [
    {field:'serverSeed', re:/server\s*seed\s*[:\-\|]\s*([0-9a-f]{20,})/i},
    {field:'serverHash', re:/(?:server\s*seed\s*)?hash\s*[:\-\|]\s*([0-9a-f]{64})/i},
    {field:'clientSeed', re:/client\s*seed\s*[:\-\|]\s*([^\s,\n]{4,64})/i},
    {field:'nonce',      re:/nonce\s*[:\-\|]\s*(\d{1,10})/i},
    {field:'nonce',      re:/bet\s*(?:id|no|number|#)\s*[:\-\|]\s*(\d{1,10})/i},
  ];
  for (const {field,re} of patterns) {
    const m = bodyText.match(re);
    if (m) put(field, m[1], 'text-pattern');
  }
  // Fallback: first 64-char hex in page = likely server hash
  const m64 = bodyText.match(/\b[0-9a-f]{64}\b/i);
  if (m64) put('serverHash', m64[0], 'hex-harvest-64');
  // Any long hex = possible server seed
  const mHex = bodyText.match(/\b[0-9a-f]{32,63}\b/i);
  if (mHex) put('serverSeed', mHex[0], 'hex-harvest');

  return R;
}
"""

# Buttons to click to open fairness/seed modals (tried in order)
FAIRNESS_SELECTORS = [
    # text-based
    "button:has-text('Fairness')", "button:has-text('Provably Fair')",
    "button:has-text('Verify')",   "button:has-text('Seeds')",
    "a:has-text('Fairness')",      "a:has-text('Provably Fair')",
    # aria / title
    "[aria-label*='fair' i]",      "[title*='fair' i]",
    "[aria-label*='provable' i]",  "[title*='provable' i]",
    "[aria-label*='seed' i]",      "[title*='seed' i]",
    # class fragments
    "[class*='fairness']",  "[class*='Fairness']",
    "[class*='provable']",  "[class*='Provably']",
    "[class*='seed-btn']",  "[class*='verify']",
    # common icon buttons (shield, lock)
    "button svg[class*='shield']",  "button svg[class*='lock']",
    "[data-testid*='fair']",        "[data-testid*='seed']",
]


def try_open_fairness_modal(page):
    """Try every known pattern to open the fairness/seeds modal."""
    for sel in FAIRNESS_SELECTORS:
        try:
            el = page.query_selector(sel)
            if el and el.is_visible():
                el.click()
                page.wait_for_timeout(900)
                return True
        except Exception:
            pass
    return False


def read_seeds_from_page(url: str) -> dict:
    if not url.startswith("http"):
        url = "https://" + url

    captured = {}  # seeds captured from network responses

    def on_response(response):
        try:
            ct = response.headers.get("content-type", "")
            if "json" not in ct:
                return
            body = response.json()
            _dig_json_for_seeds(body, captured)
        except Exception:
            pass

    def _dig_json_for_seeds(obj, out, depth=0):
        if depth > 6 or not obj:
            return
        if isinstance(obj, dict):
            for k, v in obj.items():
                lk = k.lower()
                sv = str(v or "")
                if lk in ("serverseed","server_seed") and len(sv) > 16:
                    if len(sv) == 64:
                        out.setdefault("serverHash", sv)
                    else:
                        out.setdefault("serverSeed", sv)
                elif lk in ("serverseedhash","server_seed_hash","serverhash") and len(sv) == 64:
                    out.setdefault("serverHash", sv)
                elif lk in ("clientseed","client_seed") and sv:
                    out.setdefault("clientSeed", sv)
                elif lk in ("nonce","betnumber","bet_number","gamenumber","game_number") and sv.isdigit():
                    out.setdefault("nonce", sv)
                if isinstance(v, (dict, list)):
                    _dig_json_for_seeds(v, out, depth + 1)
        elif isinstance(obj, list):
            for item in obj[:20]:
                _dig_json_for_seeds(item, out, depth + 1)

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=False,
                slow_mo=60,
                args=["--ignore-certificate-errors", "--start-maximized",
                      "--disable-blink-features=AutomationControlled"],
            )
            ctx = browser.new_context(
                no_viewport=True,
                ignore_https_errors=True,
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                ),
            )
            page = ctx.new_page()

            # Intercept ALL JSON responses for seed data
            page.on("response", on_response)

            page.goto(url, wait_until="networkidle", timeout=30000)
            page.wait_for_timeout(2000)

            # First scan — maybe seeds are already visible
            seeds = page.evaluate(SEED_JS)
            _merge(seeds, captured)

            # Try opening fairness/seed modal if we didn't get everything
            if not _have_enough(seeds):
                opened = try_open_fairness_modal(page)
                if opened:
                    page.wait_for_timeout(1200)
                    seeds = page.evaluate(SEED_JS)
                    _merge(seeds, captured)

            # Still missing — scroll and re-scan (some sites lazy-load seed UI)
            if not _have_enough(seeds):
                page.mouse.wheel(0, 400)
                page.wait_for_timeout(800)
                seeds = page.evaluate(SEED_JS)
                _merge(seeds, captured)

            # Final merge: prefer network-captured values (most reliable)
            for k, v in captured.items():
                if v and not seeds.get(k):
                    seeds[k] = v
                    seeds["found"] = True
                    seeds.setdefault("sources", []).append(k + "@network")

            browser.close()
            return seeds

    except Exception as e:
        return {"found": False, "error": str(e)}


def _have_enough(s):
    return bool(s.get("serverSeed") or s.get("serverHash")) and bool(s.get("clientSeed"))


def _merge(seeds, network):
    for k, v in network.items():
        if v and not seeds.get(k):
            seeds[k] = v
            seeds["found"] = True


# ─────────────────────────────────────────────────────────────────────────────
# UNIVERSAL BOARD SCANNER (unchanged from previous version)
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


# ─────────────────────────────────────────────────────────────────────────────
# Board helpers
# ─────────────────────────────────────────────────────────────────────────────

def build_grid(rows, cols, numbers, mine_set, flagged, unknown_set, safe_set=None):
    safe_set = safe_set or set()
    grid = []
    for r in range(rows):
        row = []
        for c in range(cols):
            coord = (r, c)
            if coord in mine_set:         row.append({"type":"mine"})
            elif coord in flagged:        row.append({"type":"flag"})
            elif coord in numbers:        row.append({"type":"number","value":numbers[coord]})
            elif coord in safe_set:       row.append({"type":"safe"})
            elif coord in unknown_set:    row.append({"type":"unknown"})
            else:                         row.append({"type":"empty"})
        grid.append(row)
    return grid


def cells_to_board(cell_list):
    numbers, unknown, mine_set, flagged = {}, [], set(), set()
    for cell in cell_list:
        r, c, t = cell.get("row",0), cell.get("col",0), cell.get("type","unknown")
        if   t == "mine":    mine_set.add((r,c))
        elif t == "flag":    flagged.add((r,c))
        elif t == "number":  numbers[(r,c)] = cell.get("value",0)
        elif t == "empty":   numbers[(r,c)] = 0
        else:                unknown.append((r,c))
    return numbers, unknown, mine_set, flagged


# ─────────────────────────────────────────────────────────────────────────────
# Board scan + auto-solve job
# ─────────────────────────────────────────────────────────────────────────────

def run_job(job_id, url):
    def log(msg): jobs[job_id]["log"].append(msg)
    if not url.startswith("http"): url = "https://" + url
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=False, slow_mo=100,
                args=["--ignore-certificate-errors","--start-maximized"],
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
            rows = result.get("rows",0); cols = result.get("cols",0)
            cell_list = result.get("cells",[])
            if rows==0 and cell_list:
                rows = max(c["row"] for c in cell_list)+1
                cols = max(c["col"] for c in cell_list)+1

            numbers, unknown, mine_set, flagged = cells_to_board(cell_list)
            log(f"Board: {rows}×{cols} — {len(cell_list)} cells")

            if mine_set:
                log(f"Mines visible: {len(mine_set)}")
                jobs[job_id]["grid"] = build_grid(rows,cols,numbers,mine_set,flagged,set(unknown))
                jobs[job_id]["result"] = "scanned"; jobs[job_id]["status"] = "done"
                page.wait_for_timeout(3000); browser.close(); return

            log(f"Using deduction solver ({len(unknown)} unknown cells)")
            # Detect coord attrs for clicking
            xa, ya = "data-x", "data-y"
            for a,b in [("data-x","data-y"),("data-col","data-row"),("data-column","data-row")]:
                if page.query_selector(f"[{a}]"):
                    xa, ya = a, b; break

            def click(r,c):
                el = page.query_selector(f"[{xa}='{c}'][{ya}='{r}']")
                if el: el.click()
            def flag(r,c):
                el = page.query_selector(f"[{xa}='{c}'][{ya}='{r}']")
                if el: el.click(button="right")

            if not numbers and unknown:
                start=(rows//2,cols//2); log(f"First click: {start}"); click(*start)
                page.wait_for_timeout(700)

            solver=MinesweeperSolver(rows,cols); moves=guesses=stall=0
            while stall<3:
                r2=page.evaluate(BOARD_JS)
                if not r2 or not r2.get("found"): break
                rows=r2.get("rows",rows); cols=r2.get("cols",cols)
                numbers,unknown,mine_set,flagged=cells_to_board(r2.get("cells",[]))
                solver.update(numbers,flagged)
                safe,dmines=solver.solve()
                safe=[c for c in safe if c in unknown]
                dmines=[c for c in dmines if c not in flagged]
                jobs[job_id]["grid"]=build_grid(rows,cols,numbers,mine_set|set(dmines),flagged,set(unknown),set(safe))
                if not unknown: log(f"Cleared! {moves} moves."); jobs[job_id]["result"]="win"; break
                if dmines:
                    for coord in dmines: log(f"Flag {coord}"); flag(*coord); moves+=1
                    stall=0; continue
                if safe:
                    for coord in safe: log(f"Click safe {coord}"); click(*coord); moves+=1
                    stall=0; continue
                guess=solver.best_guess(unknown)
                if guess: guesses+=1; log(f"Guess {guess}"); click(*guess); moves+=1; stall+=1
                else: break
                page.wait_for_timeout(100)

            log(f"Done — {moves} moves, {guesses} guesses")
            jobs[job_id]["status"]="done"
            if not jobs[job_id]["result"]: jobs[job_id]["result"]="done"
            page.wait_for_timeout(3000); browser.close()
    except Exception as e:
        jobs[job_id]["log"].append(f"ERROR: {e}"); jobs[job_id]["status"]="error"


# ─────────────────────────────────────────────────────────────────────────────
# Flask
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/")
def index(): return render_template("pc.html")

@app.route("/read-seeds", methods=["POST"])
def read_seeds_route():
    url=(request.json or {}).get("url","").strip()
    if not url: return jsonify({"error":"No URL"}), 400
    return jsonify(read_seeds_from_page(url))

@app.route("/scan", methods=["POST"])
def scan():
    url=(request.json or {}).get("url","").strip()
    if not url: return jsonify({"error":"No URL"}), 400
    job_id=str(uuid.uuid4())
    jobs[job_id]={"status":"running","log":[],"result":None,"grid":None}
    threading.Thread(target=run_job, args=(job_id,url), daemon=True).start()
    return jsonify({"job_id":job_id})

@app.route("/status/<job_id>")
def status(job_id):
    job=jobs.get(job_id)
    if not job: return jsonify({"error":"not found"}), 404
    return jsonify(job)

if __name__=="__main__":
    PORT=int(os.environ.get("PORT",5000))
    s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM)
    try: s.connect(("8.8.8.8",80)); ip=s.getsockname()[0]
    except: ip="127.0.0.1"
    finally: s.close()
    print(f"\n{'='*52}\n  💀  MINE SOLVER — definitive edition\n{'='*52}")
    print(f"  PC:    http://localhost:{PORT}")
    print(f"  Phone: http://{ip}:{PORT}\n{'='*52}\n")
    threading.Timer(1.2,lambda: webbrowser.open(f"http://localhost:{PORT}")).start()
    app.run(host="0.0.0.0",port=PORT,debug=False)

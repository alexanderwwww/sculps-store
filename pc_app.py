"""
Mine Solver — universal edition.
Works on any minesweeper website — no hardcoded site profiles.
"""

import threading, uuid, webbrowser, os, socket
from collections import defaultdict
from flask import Flask, jsonify, render_template, request
from playwright.sync_api import sync_playwright
from solver import MinesweeperSolver

app = Flask(__name__)
jobs = defaultdict(lambda: {"status": "pending", "log": [], "result": None, "grid": None})

# ---------------------------------------------------------------------------
# Universal board scanner — runs INSIDE the page's JavaScript context
# ---------------------------------------------------------------------------
UNIVERSAL_JS = """
() => {
  // ── Step 1: Deep-scan window object for mine arrays ──
  function looksLikeMineCoords(arr) {
    if (!Array.isArray(arr) || arr.length < 1 || arr.length > 2000) return false;
    const s = arr[0];
    if (!s || typeof s !== 'object') return false;
    return ('row' in s && 'col' in s) || ('row' in s && 'column' in s) ||
           ('x' in s && 'y' in s) || ('r' in s && 'c' in s);
  }
  function looksLikeCellArray(arr) {
    if (!Array.isArray(arr) || arr.length < 9 || arr.length > 10000) return false;
    const s = arr[0];
    if (!s || typeof s !== 'object') return false;
    return 'mine' in s || 'isMine' in s || 'hasMine' in s || 'bomb' in s || 'value' in s;
  }
  function looksLike2DGrid(arr) {
    if (!Array.isArray(arr) || arr.length < 3) return false;
    if (!Array.isArray(arr[0]) || arr[0].length < 3) return false;
    const cell = arr[0][0];
    return cell && typeof cell === 'object' &&
           ('mine' in cell || 'isMine' in cell || 'value' in cell || 'type' in cell);
  }

  function extractMines(obj, path, depth) {
    if (depth > 4 || !obj || typeof obj !== 'object') return null;
    if (looksLikeMineCoords(obj)) {
      return obj.map(m => ({row: m.row ?? m.y ?? m.r, col: m.col ?? m.column ?? m.x ?? m.c}));
    }
    if (looksLikeCellArray(obj)) {
      const cols = obj.cols || obj.width || Math.round(Math.sqrt(obj.length));
      return obj.reduce((acc, cell, i) => {
        if (cell && (cell.mine || cell.isMine || cell.hasMine || cell.bomb || cell.value === -1 || cell.value === 9))
          acc.push({row: Math.floor(i / cols), col: i % cols});
        return acc;
      }, []);
    }
    if (looksLike2DGrid(obj)) {
      const mines = [];
      for (let r = 0; r < obj.length; r++)
        for (let c = 0; c < obj[r].length; c++) {
          const cell = obj[r][c];
          if (cell && (cell.mine || cell.isMine || cell.value === -1 || cell.value === 9 || cell.type === 'mine'))
            mines.push({row: r, col: c});
        }
      if (mines.length) return mines;
    }
    const interesting = ['mines','bombs','mineList','board','cells','grid','tiles','field','data','map'];
    for (const k of interesting) {
      if (k in obj) {
        const r = extractMines(obj[k], path+'.'+k, depth+1);
        if (r && r.length) return r;
      }
    }
    return null;
  }

  const skip = new Set(['window','self','document','top','parent','frames',
    'chrome','webkit','CSS','performance','console','history','location',
    'navigator','screen','crypto','indexedDB','localStorage','sessionStorage']);
  for (const key of Object.keys(window)) {
    if (skip.has(key) || key.startsWith('__') || key.startsWith('webkit')) continue;
    try {
      const mines = extractMines(window[key], key, 0);
      if (mines && mines.length) return {found: true, source: 'js:'+key, mines};
    } catch(e) {}
  }

  // ── Step 2: DOM scan — universal cell detector ──
  // Find all elements forming a regular grid (same size, many of them)
  function findGrid() {
    const selectors = ['.cell','td','[class*="cell"]','[class*="tile"]',
                       '[class*="square"]','[class*="block"]','[class*="box"]'];
    for (const sel of selectors) {
      const els = Array.from(document.querySelectorAll(sel));
      if (els.length < 9 || els.length > 10000) continue;
      const rects = els.slice(0, 10).map(e => e.getBoundingClientRect());
      const w = Math.round(rects[0].width), h = Math.round(rects[0].height);
      if (w < 5 || h < 5) continue;
      const allSame = rects.every(r => Math.abs(r.width-w) < 3 && Math.abs(r.height-h) < 3);
      if (allSame) return {els, sel, cellW: w, cellH: h};
    }
    return null;
  }

  function cellState(el) {
    const cls = (el.className || '').toLowerCase();
    const text = el.textContent.trim();
    const title = (el.title || el.getAttribute('aria-label') || '').toLowerCase();

    // Mine / bomb
    if (cls.includes('mine') || cls.includes('bomb') || text === '💣' ||
        title.includes('mine') || title.includes('bomb') ||
        el.querySelector('img[src*="mine"],img[src*="bomb"]'))
      return {type: 'mine'};

    // Flag
    if (cls.includes('flag') || text === '🚩' ||
        el.querySelector('img[src*="flag"]'))
      return {type: 'flag'};

    // Number
    const n = parseInt(text);
    if (!isNaN(n) && n >= 0 && n <= 8 && text !== '') return {type:'number', value:n};

    // Closed / unrevealed — common class fragments
    if (cls.includes('closed') || cls.includes('hidden') || cls.includes('unrev') ||
        cls.includes('covered') || cls.includes('unopen') || cls.includes('cover'))
      return {type: 'unknown'};

    // Opened / revealed empty
    if (cls.includes('open') || cls.includes('reveal') || cls.includes('blank') || cls.includes('empty'))
      return {type: 'empty'};

    // Visual fallback: compare computed background brightness
    const bg = window.getComputedStyle(el).backgroundColor;
    const m = bg.match(/rgb\\((\\d+),\\s*(\\d+),\\s*(\\d+)\\)/);
    if (m) {
      const brightness = (parseInt(m[1]) + parseInt(m[2]) + parseInt(m[3])) / 3;
      return {type: brightness > 160 ? 'empty' : 'unknown'};
    }
    return {type: 'unknown'};
  }

  const grid = findGrid();
  if (!grid) return {found: false, reason: 'no grid found in DOM'};

  const {els, sel, cellW, cellH} = grid;
  const rects = els.map(el => ({el, rect: el.getBoundingClientRect()}));

  // Assign row/col from data attributes or bounding-box position
  let rows = 0, cols = 0;
  const cells = [];

  // Try data attributes first
  const attrPairs = [['data-x','data-y'],['data-col','data-row'],
                     ['data-column','data-row'],['data-c','data-r']];
  let usedAttrs = null;
  for (const [xa,ya] of attrPairs) {
    if (els[0].getAttribute(xa) !== null) { usedAttrs = [xa,ya]; break; }
  }

  if (usedAttrs) {
    const [xa,ya] = usedAttrs;
    for (const {el} of rects) {
      const c = parseInt(el.getAttribute(xa)), r = parseInt(el.getAttribute(ya));
      if (isNaN(r) || isNaN(c)) continue;
      rows = Math.max(rows, r+1); cols = Math.max(cols, c+1);
      cells.push({row:r, col:c, ...cellState(el)});
    }
  } else {
    // BBox method
    const allRects = rects.filter(({rect:r}) => r.width > 0);
    const topVals  = [...new Set(allRects.map(({rect:r}) => Math.round(r.top  / (cellH*.8)) * Math.round(cellH*.8)))].sort((a,b)=>a-b);
    const leftVals = [...new Set(allRects.map(({rect:r}) => Math.round(r.left / (cellW*.8)) * Math.round(cellW*.8)))].sort((a,b)=>a-b);
    for (const {el, rect:r} of allRects) {
      const row = topVals.findIndex(t  => Math.abs(t  - Math.round(r.top  / (cellH*.8)) * Math.round(cellH*.8)) < 3);
      const col = leftVals.findIndex(l => Math.abs(l  - Math.round(r.left / (cellW*.8)) * Math.round(cellW*.8)) < 3);
      if (row < 0 || col < 0) continue;
      rows = Math.max(rows, row+1); cols = Math.max(cols, col+1);
      cells.push({row, col, ...cellState(el)});
    }
  }

  const mines = cells.filter(c => c.type === 'mine');
  return {found: true, source: 'dom:'+sel, rows, cols, cells,
          mines: mines.length ? mines : null};
}
"""

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def build_grid(rows, cols, numbers, mine_set, flagged, unknown_set, safe_set=None):
    grid = []
    safe_set = safe_set or set()
    for r in range(rows):
        row = []
        for c in range(cols):
            coord = (r, c)
            if coord in mine_set:
                row.append({"type": "mine"})
            elif coord in flagged:
                row.append({"type": "flag"})
            elif coord in numbers:
                row.append({"type": "number", "value": numbers[coord]})
            elif coord in safe_set:
                row.append({"type": "safe"})
            elif coord in unknown_set:
                row.append({"type": "unknown"})
            else:
                row.append({"type": "empty"})
        grid.append(row)
    return grid


def cells_to_board(cell_list, rows, cols):
    """Convert flat cell list from JS scan into numbers/unknown/mine sets."""
    numbers, unknown, mine_set, flagged = {}, [], set(), set()
    for cell in cell_list:
        r, c = cell.get("row", 0), cell.get("col", 0)
        t = cell.get("type", "unknown")
        if t == "mine":
            mine_set.add((r, c))
        elif t == "flag":
            flagged.add((r, c))
        elif t == "number":
            numbers[(r, c)] = cell.get("value", 0)
        elif t == "empty":
            numbers[(r, c)] = 0
        elif t == "unknown":
            unknown.append((r, c))
    return numbers, unknown, mine_set, flagged


# ---------------------------------------------------------------------------
# Universal click helpers (also auto-detect how to click)
# ---------------------------------------------------------------------------

def make_clicker(page, coord_info):
    """Returns click(r,c) and flag(r,c) functions for the detected grid."""
    method = coord_info.get("method", "attr")
    xa = coord_info.get("xAttr", "data-x")
    ya = coord_info.get("yAttr", "data-y")
    sel = coord_info.get("selector", ".cell")

    def click(r, c):
        if method == "attr":
            el = page.query_selector(f"[{xa}='{c}'][{ya}='{r}']")
        else:
            el = None  # fallback: re-scan and click by position
        if el:
            el.click()

    def flag(r, c):
        if method == "attr":
            el = page.query_selector(f"[{xa}='{c}'][{ya}='{r}']")
        else:
            el = None
        if el:
            el.click(button="right")

    return click, flag


# ---------------------------------------------------------------------------
# Main scan + solve job
# ---------------------------------------------------------------------------

def run_job(job_id, url):
    def log(msg):
        jobs[job_id]["log"].append(msg)

    if not url.startswith("http"):
        url = "https://" + url

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=False,
                slow_mo=100,
                args=["--ignore-certificate-errors", "--start-maximized"],
            )
            ctx = browser.new_context(no_viewport=True, ignore_https_errors=True)
            page = ctx.new_page()

            log(f"Opening {url}")
            page.goto(url, wait_until="networkidle", timeout=30000)
            page.wait_for_timeout(1500)

            log("Scanning page for mine data...")
            result = page.evaluate(UNIVERSAL_JS)

            if not result or not result.get("found"):
                reason = result.get("reason", "unknown") if result else "script error"
                log(f"Could not detect board: {reason}")
                log("Try clicking a cell first, then scanning again.")
                jobs[job_id]["status"] = "error"
                browser.close()
                return

            source = result.get("source", "?")
            log(f"Board detected via {source}")

            rows = result.get("rows", 0)
            cols = result.get("cols", 0)
            cell_list = result.get("cells", [])

            if rows == 0 and cell_list:
                rows = max(c["row"] for c in cell_list) + 1
                cols = max(c["col"] for c in cell_list) + 1

            log(f"Board: {rows}×{cols} — {len(cell_list)} cells")

            numbers, unknown, mine_set, flagged = cells_to_board(cell_list, rows, cols)

            # If mines already visible (game over state) — just show the grid
            if mine_set:
                log(f"Mine positions visible on page: {len(mine_set)} mines")
                grid = build_grid(rows, cols, numbers, mine_set, flagged, set(unknown))
                jobs[job_id]["grid"] = grid
                jobs[job_id]["result"] = "scanned"
                jobs[job_id]["status"] = "done"
                page.wait_for_timeout(3000)
                browser.close()
                return

            # No mines visible — use constraint solver + auto-play
            log(f"Mines not visible — using deduction solver ({len(unknown)} unknown cells)")

            # Detect coordinate system for clicking
            coord_info = {"method": "attr", "selector": result.get("source","").split(":")[-1]}
            # Detect attribute pair used
            if cell_list:
                for xa, ya in [("data-x","data-y"),("data-col","data-row"),("data-column","data-row")]:
                    test = page.query_selector(f"[{xa}]")
                    if test:
                        coord_info["xAttr"] = xa
                        coord_info["yAttr"] = ya
                        break

            click, flag = make_clicker(page, coord_info)

            # First click: center
            if not numbers and unknown:
                start = (rows // 2, cols // 2)
                log(f"Opening center {start}")
                click(*start)
                page.wait_for_timeout(700)

            solver = MinesweeperSolver(rows, cols)
            moves = guesses = 0
            stall = 0

            while stall < 3:
                # Re-scan board
                result2 = page.evaluate(UNIVERSAL_JS)
                if not result2 or not result2.get("found"):
                    break

                rows  = result2.get("rows", rows)
                cols  = result2.get("cols", cols)
                cells2 = result2.get("cells", [])
                numbers, unknown, mine_set, flagged = cells_to_board(cells2, rows, cols)

                # Update live grid
                solver.update(numbers, flagged)
                safe_coords, deduced_mines = solver.solve()
                safe_coords    = [c for c in safe_coords    if c in unknown]
                deduced_mines  = [c for c in deduced_mines  if c not in flagged]

                grid = build_grid(rows, cols, numbers, mine_set | set(deduced_mines),
                                  flagged, set(unknown), set(safe_coords))
                jobs[job_id]["grid"] = grid

                if not unknown:
                    log(f"Board cleared! {moves} moves.")
                    jobs[job_id]["result"] = "win"
                    break

                if deduced_mines:
                    for coord in deduced_mines:
                        log(f"Flag mine {coord}")
                        flag(*coord)
                        moves += 1
                    stall = 0
                    continue

                if safe_coords:
                    for coord in safe_coords:
                        log(f"Click safe {coord}")
                        click(*coord)
                        moves += 1
                    stall = 0
                    continue

                # No deduction — guess
                guess = solver.best_guess(unknown)
                if guess:
                    guesses += 1
                    log(f"Guess {guess}")
                    click(*guess)
                    moves += 1
                    stall += 1
                else:
                    break

                page.wait_for_timeout(120)

            log(f"Done — {moves} moves, {guesses} guesses")
            jobs[job_id]["status"] = "done"
            if not jobs[job_id]["result"]:
                jobs[job_id]["result"] = "done"
            page.wait_for_timeout(3000)
            browser.close()

    except Exception as e:
        jobs[job_id]["log"].append(f"ERROR: {e}")
        jobs[job_id]["status"] = "error"


# ---------------------------------------------------------------------------
# Flask routes
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return render_template("pc.html")

@app.route("/scan", methods=["POST"])
def scan():
    url = (request.json or {}).get("url", "").strip()
    if not url:
        return jsonify({"error": "No URL provided"}), 400
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
    except: ip = "127.0.0.1"
    finally: s.close()
    print(f"\n{'='*50}\n  💀 Mine Solver\n{'='*50}")
    print(f"  PC:    http://localhost:{PORT}")
    print(f"  Phone: http://{ip}:{PORT}\n{'='*50}\n")
    threading.Timer(1.2, lambda: webbrowser.open(f"http://localhost:{PORT}")).start()
    app.run(host="0.0.0.0", port=PORT, debug=False)

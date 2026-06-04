"""
Mine Solver — PC / Localhost edition.
Run: python pc_app.py   (or double-click start.bat)
Opens at http://localhost:5000
"""

import threading
import uuid
import webbrowser
from collections import defaultdict

from flask import Flask, jsonify, render_template, request
from playwright.sync_api import sync_playwright

from solver import MinesweeperSolver

app = Flask(__name__)
jobs = defaultdict(lambda: {"status": "pending", "log": [], "result": None, "grid": None})


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def ms_number(tokens):
    for t in tokens:
        if t.startswith("hd_type"):
            try:
                v = int(t[len("hd_type"):])
                if 0 <= v <= 8:
                    return v
            except ValueError:
                pass
    return None


def get_profile(url):
    if "minesweeper.online" in url:
        return {
            "cell_selector": ".cell",
            "coord": ("data-x", "data-y"),
            "closed":   lambda c: "hd_closed" in c or "hd_question" in c,
            "flagged":  lambda c: "hd_flag" in c,
            "number":   ms_number,
            "mine_cls": "hd_mine",
            "win_sel":  "#top_area_face",
            "win_cls":  "face_win",
            "lose_cls": "face_lose",
        }
    if "cardgames.io" in url:
        return {
            "cell_selector": ".cell",
            "coord": ("data-col", "data-row"),
            "closed":   lambda c: "closed" in c and "flag" not in c,
            "flagged":  lambda c: "flag" in c,
            "number":   lambda c: next((i for i in range(9) if f"open{i}" in c or f"num{i}" in c), None),
            "mine_cls": "mine",
            "win_sel":  None, "win_cls": "win", "lose_cls": "lose",
        }
    return None


def read_board(page, profile, col_attr, row_attr, sel):
    cells = page.query_selector_all(sel)
    numbers, flagged, unknown, mines_visible = {}, set(), [], set()
    max_r = max_c = -1

    for cell in cells:
        x = cell.get_attribute(col_attr)
        y = cell.get_attribute(row_attr)
        if x is None or y is None:
            continue
        col, row = int(x), int(y)
        max_r, max_c = max(max_r, row), max(max_c, col)
        cls = (cell.get_attribute("class") or "").split()

        if profile:
            if profile["flagged"](cls):
                flagged.add((row, col))
            elif profile.get("mine_cls") and profile["mine_cls"] in cls:
                mines_visible.add((row, col))
            else:
                n = profile["number"](cls)
                if n is not None:
                    numbers[(row, col)] = n
                elif profile["closed"](cls):
                    unknown.append((row, col))
        else:
            cs = " ".join(cls)
            if "flag" in cs:
                flagged.add((row, col))
            elif "mine" in cs or "bomb" in cs:
                mines_visible.add((row, col))
            elif any(f"type{i}" in cs or f"open{i}" in cs for i in range(9)):
                for i in range(9):
                    if f"type{i}" in cs or f"open{i}" in cs:
                        numbers[(row, col)] = i
                        break
            elif "closed" in cs or "hidden" in cs:
                unknown.append((row, col))

    rows = max_r + 1 if max_r >= 0 else 0
    cols = max_c + 1 if max_c >= 0 else 0
    game_over = won = False
    if profile and profile.get("win_sel"):
        face = page.query_selector(profile["win_sel"])
        if face:
            fc = face.get_attribute("class") or ""
            if profile["lose_cls"] in fc:
                game_over = True
            elif profile["win_cls"] in fc:
                game_over = won = True

    return rows, cols, numbers, flagged, unknown, mines_visible, game_over, won


# ---------------------------------------------------------------------------
# JS variable scan — tries to read mine positions from the page's own code
# ---------------------------------------------------------------------------

SCAN_SCRIPT = """
() => {
    // ── Try common global JS variable names ──
    const candidates = [
        window.game, window.Game, window.minesweeper, window.Minesweeper,
        window.board, window.Board, window.grid, window.Grid,
        window.gameState, window.state, window.level
    ];

    for (const obj of candidates) {
        if (!obj) continue;
        // Direct mines array  e.g. game.mines = [{row,col}, ...]
        if (Array.isArray(obj.mines)) return {found: true, source: 'js_var.mines', mines: obj.mines};
        // 2D grid array  e.g. board[row][col].mine === true
        if (Array.isArray(obj) && obj[0] && Array.isArray(obj[0])) {
            const found = [];
            for (let r = 0; r < obj.length; r++)
                for (let c = 0; c < obj[r].length; c++)
                    if (obj[r][c] && (obj[r][c].mine || obj[r][c].isMine || obj[r][c].bomb))
                        found.push({row: r, col: c});
            if (found.length) return {found: true, source: 'js_2d_grid', mines: found};
        }
        // Flat cells array  e.g. game.cells[i].mine
        if (Array.isArray(obj.cells)) {
            const cols = obj.cols || obj.width || obj.columns || Math.round(Math.sqrt(obj.cells.length));
            const found = [];
            obj.cells.forEach((cell, i) => {
                if (cell && (cell.mine || cell.isMine || cell.bomb || cell.hasMine))
                    found.push({row: Math.floor(i / cols), col: i % cols});
            });
            if (found.length) return {found: true, source: 'js_cells', mines: found};
        }
    }

    // ── Try DOM: look for hidden mine classes ──
    const selectors = [
        '.mine', '.cell-mine', '.is-mine', '[data-mine="true"]',
        '.hd_mine', '.bomb', '[data-type="mine"]'
    ];
    for (const sel of selectors) {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) {
            const found = [];
            els.forEach(el => {
                const x = el.getAttribute('data-x') || el.getAttribute('data-col') || el.getAttribute('data-column');
                const y = el.getAttribute('data-y') || el.getAttribute('data-row');
                if (x !== null && y !== null)
                    found.push({row: parseInt(y), col: parseInt(x)});
            });
            if (found.length) return {found: true, source: 'dom:' + sel, mines: found};
        }
    }

    // ── Try reading from page source (mine seed / game seed in script tags) ──
    const scripts = Array.from(document.querySelectorAll('script'));
    for (const s of scripts) {
        const m = s.textContent.match(/mines?\\s*[=:]\\s*(\\[[^\\]]+\\])/i);
        if (m) {
            try {
                const parsed = JSON.parse(m[1]);
                if (Array.isArray(parsed) && parsed.length)
                    return {found: true, source: 'script_tag', raw: m[1], mines: parsed};
            } catch(e) {}
        }
    }

    return {found: false};
}
"""


# ---------------------------------------------------------------------------
# Route: scan a URL for mine positions
# ---------------------------------------------------------------------------

def run_scan(job_id, url):
    def log(msg):
        jobs[job_id]["log"].append(msg)

    if not url.startswith("http"):
        url = "https://" + url

    try:
        profile = get_profile(url)
        col_attr, row_attr = profile["coord"] if profile else ("data-x", "data-y")
        sel = profile["cell_selector"] if profile else ".cell"

        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=False,
                slow_mo=80,
                args=["--ignore-certificate-errors", "--start-maximized"],
            )
            ctx = browser.new_context(no_viewport=True, ignore_https_errors=True)
            page = ctx.new_page()

            log(f"Opening {url} ...")
            page.goto(url, wait_until="networkidle", timeout=30000)
            page.wait_for_timeout(1500)

            # 1) Try JS variable scan first
            log("Scanning page JavaScript for mine data...")
            js_result = page.evaluate(SCAN_SCRIPT)

            if js_result and js_result.get("found"):
                mines_list = js_result["mines"]
                log(f"Found {len(mines_list)} mine positions via {js_result['source']}")

                # Build grid bounds from DOM
                rows, cols, numbers, flagged, unknown, _, _, _ = read_board(
                    page, profile, col_attr, row_attr, sel)
                if rows == 0:
                    rows = max((m["row"] for m in mines_list), default=0) + 1
                    cols = max((m["col"] for m in mines_list), default=0) + 1

                mine_set = {(m["row"], m["col"]) for m in mines_list if "row" in m and "col" in m}

                grid = build_grid(rows, cols, numbers, mine_set, flagged, set(unknown))
                jobs[job_id]["grid"] = grid
                jobs[job_id]["result"] = "scanned"
                log(f"Done — {len(mine_set)} mines on {rows}x{cols} board")
                jobs[job_id]["status"] = "done"
                page.wait_for_timeout(3000)
                browser.close()
                return

            # 2) JS scan found nothing — fall back to auto-solver (plays the game)
            log("No mine data found in JS — switching to auto-solver mode...")
            _play(page, profile, col_attr, row_attr, sel, job_id, log)
            browser.close()

    except Exception as e:
        jobs[job_id]["log"].append(f"ERROR: {e}")
        jobs[job_id]["status"] = "error"


def build_grid(rows, cols, numbers, mine_set, flagged, unknown_set):
    """Serialise board state into a list-of-lists for the frontend."""
    grid = []
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
            elif coord in unknown_set:
                row.append({"type": "unknown"})
            else:
                row.append({"type": "empty"})
        grid.append(row)
    return grid


def _play(page, profile, col_attr, row_attr, sel, job_id, log):
    """Auto-play the board using the constraint solver."""
    def click(r, c):
        cell = page.query_selector(f"[{col_attr}='{c}'][{row_attr}='{r}']")
        if cell:
            cell.click()

    def flag(r, c):
        cell = page.query_selector(f"[{col_attr}='{c}'][{row_attr}='{r}']")
        if cell:
            cell.click(button="right")

    rows, cols, numbers, flagged, unknown, _, go, won = read_board(
        page, profile, col_attr, row_attr, sel)

    if rows == 0:
        log("ERROR: Could not read the board.")
        jobs[job_id]["status"] = "error"
        return

    log(f"Board: {rows}x{cols} | {len(unknown)} hidden cells")

    if not numbers and unknown:
        start = (rows // 2, cols // 2)
        log(f"First click: center {start}")
        click(*start)
        page.wait_for_timeout(700)

    solver = MinesweeperSolver(rows, cols)
    moves = guesses = 0

    while True:
        rows, cols, numbers, flagged, unknown, mines_vis, go, won = read_board(
            page, profile, col_attr, row_attr, sel)

        if go:
            jobs[job_id]["result"] = "win" if won else "lose"
            log("WIN — cleared the board!" if won else "Hit a mine (bad luck guess).")
            break

        if not unknown:
            jobs[job_id]["result"] = "win"
            log(f"Cleared! {moves} moves.")
            break

        # If mines became visible (game over reveal), show grid
        if mines_vis:
            all_mines = mines_vis | {c for c in flagged}
            grid = build_grid(rows, cols, numbers, all_mines, set(), set(unknown))
            jobs[job_id]["grid"] = grid

        solver.update(numbers, flagged)
        safe, deduced_mines = solver.solve()
        safe = [c for c in safe if c in unknown]
        deduced_mines = [c for c in deduced_mines if c not in flagged]

        if deduced_mines:
            for coord in deduced_mines:
                log(f"Flag mine {coord}")
                flag(*coord)
                moves += 1
            continue

        if safe:
            for coord in safe:
                log(f"Click safe {coord}")
                click(*coord)
                moves += 1
            continue

        guess = solver.best_guess(unknown)
        if guess:
            guesses += 1
            log(f"Guess {guess}")
            click(*guess)
            moves += 1
        else:
            break

        page.wait_for_timeout(80)

    log(f"Done — {moves} moves, {guesses} guesses.")
    jobs[job_id]["status"] = "done"
    page.wait_for_timeout(3000)


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
    threading.Thread(target=run_scan, args=(job_id, url), daemon=True).start()
    return jsonify({"job_id": job_id})


@app.route("/status/<job_id>")
def status(job_id):
    job = jobs.get(job_id)
    if not job:
        return jsonify({"error": "not found"}), 404
    return jsonify(job)


if __name__ == "__main__":
    import os, socket
    PORT = int(os.environ.get("PORT", 5000))
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = "127.0.0.1"
    finally:
        s.close()

    print(f"\n{'='*50}\n  💀 Mine Solver running!\n{'='*50}")
    print(f"  PC:     http://localhost:{PORT}")
    print(f"  Phone:  http://{ip}:{PORT}\n{'='*50}\n")

    threading.Timer(1.2, lambda: webbrowser.open(f"http://localhost:{PORT}")).start()
    app.run(host="0.0.0.0", port=PORT, debug=False)

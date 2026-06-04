"""
Mine Solver — PC / Localhost edition.

Difference from the phone version (app.py):
  * Opens a REAL visible Chrome window and solves the board live on screen.
  * Auto-opens the dashboard in your browser when you start it.
  * Uses Playwright's SYNC api (more reliable on Windows).

RUN:
    python pc_app.py
(or just double-click start.bat on Windows)

Then a dashboard opens at http://localhost:5000 — paste a minesweeper URL,
hit "Solve It", and watch a Chrome window play the game by itself.
"""

import threading
import uuid
import webbrowser
from collections import defaultdict

from flask import Flask, jsonify, render_template, request
from playwright.sync_api import sync_playwright

from solver import MinesweeperSolver

app = Flask(__name__)

# job_id -> {status, log, result}
jobs = defaultdict(lambda: {"status": "pending", "log": [], "result": None})


# ---------------------------------------------------------------------------
# Site profiles (how to read each site's board from the DOM)
# ---------------------------------------------------------------------------

def ms_number(tokens):
    """minesweeper.online uses hd_type0 (empty) .. hd_type8.
    hd_type10/11 etc. = mine/exploded, which are NOT board numbers."""
    for t in tokens:
        if t.startswith("hd_type"):
            try:
                v = int(t[len("hd_type"):])
            except ValueError:
                continue
            if 0 <= v <= 8:
                return v
    return None


PROFILES = {
    "minesweeper.online": {
        "cell_selector": ".cell",
        "coord": ("data-x", "data-y"),
        "closed":   lambda c: "hd_closed" in c or "hd_question" in c,
        "flagged":  lambda c: "hd_flag" in c,
        "number":   ms_number,
        "win_sel":  "#top_area_face",
        "win_cls":  "face_win",
        "lose_cls": "face_lose",
    },
    "cardgames.io": {
        "cell_selector": ".cell",
        "coord": ("data-col", "data-row"),
        "closed":   lambda c: "closed" in c and "flag" not in c,
        "flagged":  lambda c: "flag" in c,
        "number":   lambda c: next((i for i in range(9) if f"open{i}" in c or f"num{i}" in c), None),
        "win_sel":  None, "win_cls": "win", "lose_cls": "lose",
    },
    "google.com": {
        "cell_selector": "[data-row][data-col]",
        "coord": ("data-col", "data-row"),
        "closed":   lambda c: "cell" in c and "open" not in c and "flag" not in c,
        "flagged":  lambda c: "flag" in c,
        "number":   lambda c: next((i for i in range(9) if f"num_{i}" in c or f"n{i}" in c), None),
        "win_sel":  None, "win_cls": "win", "lose_cls": "lose",
    },
}


def get_profile(url):
    for key, p in PROFILES.items():
        if key in url:
            return p
    return None


# ---------------------------------------------------------------------------
# The solver loop (sync Playwright, visible browser)
# ---------------------------------------------------------------------------

def read_board(page, profile, col_attr, row_attr, sel):
    cells = page.query_selector_all(sel)
    numbers, flagged, unknown = {}, set(), []
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

    return rows, cols, numbers, flagged, unknown, game_over, won


def run_solver(job_id, url):
    def log(msg):
        jobs[job_id]["log"].append(msg)

    if not url.startswith("http"):
        url = "https://" + url

    try:
        profile = get_profile(url)
        log(f"Site profile: {'matched' if profile else 'generic fallback'}")
        col_attr, row_attr = profile["coord"] if profile else ("data-x", "data-y")
        sel = profile["cell_selector"] if profile else ".cell"

        with sync_playwright() as p:
            # headless=False -> a real Chrome window pops up so you can watch it play
            browser = p.chromium.launch(
                headless=False,
                slow_mo=120,  # slow enough to watch the moves happen
                args=["--ignore-certificate-errors", "--start-maximized"],
            )
            ctx = browser.new_context(no_viewport=True, ignore_https_errors=True)
            page = ctx.new_page()

            log(f"Opening {url} ...")
            page.goto(url, wait_until="networkidle", timeout=30000)
            page.wait_for_timeout(1500)

            def click(r, c):
                cell = page.query_selector(f"[{col_attr}='{c}'][{row_attr}='{r}']")
                if cell:
                    cell.click()

            def flag(r, c):
                cell = page.query_selector(f"[{col_attr}='{c}'][{row_attr}='{r}']")
                if cell:
                    cell.click(button="right")

            rows, cols, numbers, flagged, unknown, go, won = read_board(
                page, profile, col_attr, row_attr, sel)

            if rows == 0:
                log("ERROR: Could not read the board. This site may not be supported.")
                jobs[job_id]["status"] = "error"
                page.wait_for_timeout(2000)
                browser.close()
                return

            log(f"Board detected: {rows} x {cols}  ({len(unknown)} hidden cells)")

            if not numbers and unknown:
                start = (rows // 2, cols // 2)
                log(f"First click in the center {start}")
                click(*start)
                page.wait_for_timeout(700)

            solver = MinesweeperSolver(rows, cols)
            moves = guesses = 0

            while True:
                rows, cols, numbers, flagged, unknown, go, won = read_board(
                    page, profile, col_attr, row_attr, sel)

                if go:
                    jobs[job_id]["result"] = "win" if won else "lose"
                    log("WIN! Cleared without hitting a mine." if won
                        else "Hit a mine (an unavoidable guess went wrong).")
                    break

                if not unknown:
                    jobs[job_id]["result"] = "win"
                    log(f"Board cleared! {moves} moves.")
                    break

                solver.update(numbers, flagged)
                safe, mines = solver.solve()
                safe = [c for c in safe if c in unknown]
                mines = [c for c in mines if c not in flagged]

                if mines:
                    for coord in mines:
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
                    log(f"Guess {guess} ({len(numbers)} clues read, none certain)")
                    click(*guess)
                    moves += 1
                else:
                    log("No moves left.")
                    break

            log(f"Done — {moves} moves, {guesses} guesses.")
            jobs[job_id]["status"] = "done"
            page.wait_for_timeout(4000)  # leave the window up a moment to admire
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


@app.route("/solve", methods=["POST"])
def solve():
    url = (request.json or {}).get("url", "").strip()
    if not url:
        return jsonify({"error": "Please paste a minesweeper URL."}), 400

    job_id = str(uuid.uuid4())
    jobs[job_id] = {"status": "running", "log": [], "result": None}
    threading.Thread(target=run_solver, args=(job_id, url), daemon=True).start()
    return jsonify({"job_id": job_id})


@app.route("/status/<job_id>")
def status(job_id):
    job = jobs.get(job_id)
    if not job:
        return jsonify({"error": "not found"}), 404
    return jsonify(job)


if __name__ == "__main__":
    URL = "http://localhost:5000"
    print("\n" + "=" * 50)
    print("  Mine Solver (PC edition) is starting...")
    print("=" * 50)
    print(f"\n  Opening dashboard at {URL}")
    print("  A Chrome window will pop up when you hit 'Solve It'.\n")
    print("  Keep this window open while using it.")
    print("  Close it (Ctrl+C) when you're done.\n")
    print("=" * 50 + "\n")

    # Auto-open the dashboard in the default browser shortly after startup
    threading.Timer(1.2, lambda: webbrowser.open(URL)).start()

    app.run(host="127.0.0.1", port=5000, debug=False)

"""
Minesweeper Solver Web App
Run: python app.py
Then open http://<your-computer-ip>:5000 on your iPhone (same WiFi)
"""

import asyncio
import glob
import threading
import uuid
from collections import defaultdict

from flask import Flask, jsonify, render_template, request

from solver import MinesweeperSolver

app = Flask(__name__)

# In-memory job store: job_id -> {status, log, screenshot}
jobs: dict = defaultdict(lambda: {"status": "pending", "log": [], "screenshot": None})


# ---------------------------------------------------------------------------
# Solver runner (runs in background thread)
# ---------------------------------------------------------------------------

NUM_CLASSES = {
    "hd_type1": 1, "hd_type2": 2, "hd_type3": 3, "hd_type4": 4,
    "hd_type5": 5, "hd_type6": 6, "hd_type7": 7, "hd_type8": 8,
    "hd_opened": 0,
}

PROFILES = {
    "minesweeper.online": {
        "cell_selector": ".cell",
        "coord": ("data-x", "data-y"),
        "closed":   lambda c: "hd_closed" in c or "hd_question" in c,
        "flagged":  lambda c: "hd_flag" in c,
        "number":   lambda c: next((v for k, v in NUM_CLASSES.items() if k in c), None),
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
        "win_sel":  None,
        "win_cls":  "win",
        "lose_cls": "lose",
    },
    "google.com": {
        "cell_selector": "[data-row][data-col]",
        "coord": ("data-col", "data-row"),
        "closed":   lambda c: "cell" in c and "open" not in c and "flag" not in c,
        "flagged":  lambda c: "flag" in c,
        "number":   lambda c: next((i for i in range(9) if f"num_{i}" in c or f"n{i}" in c), None),
        "win_sel":  None,
        "win_cls":  "win",
        "lose_cls": "lose",
    },
}


def get_profile(url):
    for key, p in PROFILES.items():
        if key in url:
            return p
    return None


async def _run_solver(job_id: str, url: str):
    from playwright.async_api import async_playwright

    def log(msg):
        jobs[job_id]["log"].append(msg)

    try:
        candidates = glob.glob("/opt/pw-browsers/chromium-*/chrome-linux/chrome")
        exe = candidates[0] if candidates else None

        profile = get_profile(url)
        log(f"Profile: {'matched' if profile else 'generic fallback'}")

        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                executable_path=exe,
                args=["--ignore-certificate-errors", "--disable-web-security", "--no-sandbox"],
            )
            ctx = await browser.new_context(
                viewport={"width": 1280, "height": 900},
                ignore_https_errors=True,
            )
            page = await ctx.new_page()

            log(f"Loading {url} ...")
            await page.goto(url, wait_until="networkidle", timeout=30000)
            await asyncio.sleep(1.5)

            # Read board
            col_attr, row_attr = profile["coord"] if profile else ("data-x", "data-y")
            sel = profile["cell_selector"] if profile else ".cell"

            async def read_board():
                cells = await page.query_selector_all(sel)
                numbers, flagged, unknown = {}, set(), []
                max_r = max_c = -1
                for cell in cells:
                    x = await cell.get_attribute(col_attr)
                    y = await cell.get_attribute(row_attr)
                    if x is None or y is None:
                        continue
                    col, row = int(x), int(y)
                    max_r = max(max_r, row)
                    max_c = max(max_c, col)
                    cls = (await cell.get_attribute("class") or "").split()
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
                    face = await page.query_selector(profile["win_sel"])
                    if face:
                        fc = await face.get_attribute("class") or ""
                        if profile["lose_cls"] in fc:
                            game_over = True
                        elif profile["win_cls"] in fc:
                            game_over = True
                            won = True
                return rows, cols, numbers, flagged, unknown, game_over, won

            async def click(r, c):
                cell = await page.query_selector(f"[{col_attr}='{c}'][{row_attr}='{r}']")
                if cell:
                    await cell.click()

            async def flag(r, c):
                cell = await page.query_selector(f"[{col_attr}='{c}'][{row_attr}='{r}']")
                if cell:
                    await cell.click(button="right")

            rows, cols, numbers, flagged, unknown, go, won = await read_board()
            if rows == 0:
                log("ERROR: Could not read board. Site may not be supported yet.")
                jobs[job_id]["status"] = "error"
                await browser.close()
                return

            log(f"Board: {rows}x{cols} | {len(unknown)} hidden cells")

            if not numbers and unknown:
                start = (rows // 2, cols // 2)
                log(f"Opening center cell {start}")
                await click(*start)
                await asyncio.sleep(0.7)

            solver = MinesweeperSolver(rows, cols)
            moves = guesses = 0

            while True:
                rows, cols, numbers, flagged, unknown, go, won = await read_board()

                if go:
                    result = "WIN!" if won else "Hit a mine (bad luck on a guess)"
                    log(f"{result} — {moves} moves, {guesses} guesses")
                    break

                if not unknown:
                    log(f"Board cleared! {moves} moves, {guesses} guesses")
                    break

                solver.update(numbers, flagged)
                safe, mines = solver.solve()
                safe  = [c for c in safe  if c in unknown]
                mines = [c for c in mines if c not in flagged]

                if mines:
                    for coord in mines:
                        log(f"Flag mine at {coord}")
                        await flag(*coord)
                        moves += 1
                        await asyncio.sleep(0.1)
                    continue

                if safe:
                    for coord in safe:
                        log(f"Click safe {coord}")
                        await click(*coord)
                        moves += 1
                        await asyncio.sleep(0.1)
                    continue

                guess = solver.best_guess(unknown)
                if guess:
                    guesses += 1
                    log(f"Guess {guess} (no safe deduction)")
                    await click(*guess)
                    moves += 1
                    await asyncio.sleep(0.15)
                else:
                    log("No moves left.")
                    break

                await asyncio.sleep(0.05)

            # Take final screenshot
            screenshot = await page.screenshot(full_page=False)
            import base64
            jobs[job_id]["screenshot"] = base64.b64encode(screenshot).decode()
            jobs[job_id]["status"] = "done"
            await browser.close()

    except Exception as e:
        jobs[job_id]["log"].append(f"ERROR: {e}")
        jobs[job_id]["status"] = "error"


def run_solver_thread(job_id: str, url: str):
    asyncio.run(_run_solver(job_id, url))


# ---------------------------------------------------------------------------
# Flask routes
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/solve", methods=["POST"])
def solve():
    url = request.json.get("url", "").strip()
    if not url:
        return jsonify({"error": "No URL provided"}), 400
    if not url.startswith("http"):
        url = "https://" + url

    job_id = str(uuid.uuid4())
    jobs[job_id] = {"status": "running", "log": [], "screenshot": None}

    t = threading.Thread(target=run_solver_thread, args=(job_id, url), daemon=True)
    t.start()

    return jsonify({"job_id": job_id})


@app.route("/status/<job_id>")
def status(job_id):
    job = jobs.get(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    return jsonify(job)


if __name__ == "__main__":
    import socket
    hostname = socket.gethostname()
    try:
        local_ip = socket.gethostbyname(hostname)
    except Exception:
        local_ip = "0.0.0.0"
    print(f"\n  Open on your iPhone: http://{local_ip}:5000\n")
    app.run(host="0.0.0.0", port=5000, debug=False)

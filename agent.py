"""
Universal Minesweeper solver agent.

Works on any minesweeper website by detecting the board from the DOM.
Includes built-in profiles for popular sites + a fallback auto-detector.

SETUP (run once):
    pip install playwright
    playwright install chromium

USAGE:
    python agent.py --url "https://minesweeper.online/"
    python agent.py --url "https://minesweeper.online/game/6130956827"
    python agent.py --url "https://cardgames.io/minesweeper/"
    python agent.py --url "https://www.google.com/search?q=minesweeper"
    python agent.py --url "ANY_MINESWEEPER_URL"  --slow 300
"""

import argparse
import asyncio
import glob
import random
from typing import Dict, List, Optional, Set, Tuple

from playwright.async_api import Page, async_playwright

from solver import MinesweeperSolver

Coord = Tuple[int, int]


# ---------------------------------------------------------------------------
# Site profiles — each defines how to read cells from a specific site's DOM
# ---------------------------------------------------------------------------

PROFILES = {
    "minesweeper.online": {
        "match": "minesweeper.online",
        "cell_selector": ".cell",
        "coord": ("data-x", "data-y"),   # (col_attr, row_attr)
        "states": {
            "closed":   lambda cls: "hd_closed" in cls or "hd_question" in cls,
            "flagged":  lambda cls: "hd_flag" in cls,
            "number":   lambda cls: next(
                (i for i in range(9) if f"hd_type{i}" in cls or (i == 0 and "hd_opened" in cls)),
                None
            ),
        },
        "win_selector":  "#top_area_face",
        "win_class":     "face_win",
        "lose_class":    "face_lose",
    },
    "cardgames.io": {
        "match": "cardgames.io",
        "cell_selector": ".cell",
        "coord": ("data-col", "data-row"),
        "states": {
            "closed":  lambda cls: "closed" in cls and "flag" not in cls,
            "flagged": lambda cls: "flag" in cls,
            "number":  lambda cls: next(
                (i for i in range(9) if f"open{i}" in cls or f"num{i}" in cls),
                None
            ),
        },
        "win_selector":  ".status-bar",
        "win_class":     "win",
        "lose_class":    "lose",
    },
    "google": {
        "match": "google.com",
        "cell_selector": "[data-row][data-col]",
        "coord": ("data-col", "data-row"),
        "states": {
            "closed":  lambda cls: "cell" in cls and "open" not in cls and "flag" not in cls,
            "flagged": lambda cls: "flag" in cls,
            "number":  lambda cls: next(
                (i for i in range(9) if f"num_{i}" in cls or f"n{i}" in cls),
                None
            ),
        },
        "win_selector":  None,
        "win_class":     "win",
        "lose_class":    "lose",
    },
}


def get_profile(url: str) -> Optional[dict]:
    for name, profile in PROFILES.items():
        if profile["match"] in url:
            return profile
    return None


# ---------------------------------------------------------------------------
# Board reading
# ---------------------------------------------------------------------------

async def read_board(page: Page, profile: Optional[dict]):
    """
    Parse the current board state.
    If no profile matches, tries multiple common selector patterns.
    """
    selector = profile["cell_selector"] if profile else ".cell, [class*='cell'], td"
    cells = await page.query_selector_all(selector)

    if not cells:
        return 0, 0, {}, set(), [], False, False

    numbers: Dict[Coord, int] = {}
    flagged: Set[Coord] = set()
    unknown: List[Coord] = []
    max_r = max_c = -1

    col_attr, row_attr = profile["coord"] if profile else ("data-x", "data-y")

    for cell in cells:
        x = await cell.get_attribute(col_attr)
        y = await cell.get_attribute(row_attr)
        if x is None or y is None:
            continue

        col, row = int(x), int(y)
        max_r = max(max_r, row)
        max_c = max(max_c, col)

        class_attr = (await cell.get_attribute("class") or "").split()

        if profile:
            states = profile["states"]
            if states["flagged"](class_attr):
                flagged.add((row, col))
            else:
                num = states["number"](class_attr)
                if num is not None:
                    numbers[(row, col)] = num
                elif states["closed"](class_attr):
                    unknown.append((row, col))
        else:
            # Generic fallback: guess from class names
            cls_str = " ".join(class_attr)
            if "flag" in cls_str:
                flagged.add((row, col))
            elif any(f"open{i}" in cls_str or f"type{i}" in cls_str or f"num{i}" in cls_str
                     for i in range(9)):
                for i in range(9):
                    if f"open{i}" in cls_str or f"type{i}" in cls_str or f"num{i}" in cls_str:
                        numbers[(row, col)] = i
                        break
            elif "closed" in cls_str or "hidden" in cls_str or "unrev" in cls_str:
                unknown.append((row, col))

    rows = max_r + 1 if max_r >= 0 else 0
    cols = max_c + 1 if max_c >= 0 else 0

    # Game state
    game_over = won = False
    if profile and profile.get("win_selector"):
        face = await page.query_selector(profile["win_selector"])
        if face:
            face_class = await face.get_attribute("class") or ""
            if profile["lose_class"] in face_class:
                game_over = True
            elif profile["win_class"] in face_class:
                game_over = True
                won = True

    return rows, cols, numbers, flagged, unknown, game_over, won


async def click_cell(page: Page, row: int, col: int, col_attr: str, row_attr: str):
    cell = await page.query_selector(f"[{col_attr}='{col}'][{row_attr}='{row}']")
    if cell:
        await cell.click()


async def flag_cell(page: Page, row: int, col: int, col_attr: str, row_attr: str):
    cell = await page.query_selector(f"[{col_attr}='{col}'][{row_attr}='{row}']")
    if cell:
        await cell.click(button="right")


# ---------------------------------------------------------------------------
# Game loop
# ---------------------------------------------------------------------------

async def play_game(page: Page, url: str, slow_ms: int = 150):
    await page.wait_for_load_state("networkidle")
    await asyncio.sleep(1.5)

    profile = get_profile(url)
    if profile:
        print(f"Profile matched: {profile['match']}")
    else:
        print("No profile matched — using generic detector")

    col_attr, row_attr = profile["coord"] if profile else ("data-x", "data-y")

    rows, cols, numbers, flagged, unknown, game_over, won = await read_board(page, profile)

    if rows == 0:
        print("Could not read board. The site may use canvas rendering or load JS late.")
        print("Try adding --wait 3 to give the page more time.")
        return

    print(f"Board detected: {rows} rows x {cols} cols | {len(unknown)} unknown cells")

    # Open a cell near the center to start (sites guarantee no mine on first click)
    if not numbers and unknown:
        start = (rows // 2, cols // 2)
        print(f"First click: {start}")
        await click_cell(page, *start, col_attr, row_attr)
        await asyncio.sleep(0.7)

    solver = MinesweeperSolver(rows, cols)
    moves = guesses = 0

    while True:
        rows, cols, numbers, flagged, unknown, game_over, won = await read_board(page, profile)

        if game_over:
            print(f"{'WIN!' if won else 'Hit a mine.'} ({moves} moves, {guesses} guesses)")
            return

        if not unknown:
            print(f"Board cleared! ({moves} moves, {guesses} guesses)")
            return

        solver.update(numbers, flagged)
        safe, mines = solver.solve()

        safe  = [c for c in safe  if c in unknown]
        mines = [c for c in mines if c not in flagged]

        if mines:
            for coord in mines:
                print(f"  FLAG  {coord}")
                await flag_cell(page, *coord, col_attr, row_attr)
                moves += 1
                if slow_ms:
                    await asyncio.sleep(slow_ms / 1000)
            continue

        if safe:
            for coord in safe:
                print(f"  SAFE  {coord}")
                await click_cell(page, *coord, col_attr, row_attr)
                moves += 1
                if slow_ms:
                    await asyncio.sleep(slow_ms / 1000)
            continue

        # Probabilistic guess when logic is exhausted
        guess = solver.best_guess(unknown)
        if guess:
            guesses += 1
            print(f"  GUESS {guess}")
            await click_cell(page, *guess, col_attr, row_attr)
            moves += 1
            if slow_ms:
                await asyncio.sleep(slow_ms / 1000)
        else:
            print("No moves available — done.")
            break

        await asyncio.sleep(0.1)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

async def main():
    parser = argparse.ArgumentParser(description="Universal Minesweeper solver")
    parser.add_argument("--url", required=True, help="URL of the minesweeper game")
    parser.add_argument("--slow", type=int, default=150,
                        help="Delay between moves in ms (default 150). Use 300+ for dramatic effect")
    parser.add_argument("--wait", type=int, default=0,
                        help="Extra seconds to wait for page to load before solving")
    parser.add_argument("--headless", action="store_true",
                        help="Run without visible browser window")
    args = parser.parse_args()

    # Find installed Chromium
    candidates = glob.glob("/opt/pw-browsers/chromium-*/chrome-linux/chrome")
    exe = candidates[0] if candidates else None

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=args.headless,
            executable_path=exe,
            args=["--ignore-certificate-errors", "--disable-web-security"],
        )
        ctx = await browser.new_context(
            viewport={"width": 1280, "height": 900},
            ignore_https_errors=True,
        )
        page = await ctx.new_page()

        print(f"Opening: {args.url}")
        await page.goto(args.url, wait_until="networkidle",
                        timeout=30000)

        if args.wait:
            print(f"Waiting {args.wait}s for page to settle...")
            await asyncio.sleep(args.wait)

        await play_game(page, args.url, slow_ms=args.slow)

        await asyncio.sleep(3)
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())

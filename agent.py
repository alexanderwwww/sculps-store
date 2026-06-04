"""
Minesweeper solver agent for minesweeper.online

Usage:
    pip install playwright && playwright install chromium

    # Play a new beginner game (visible browser, so your friends can watch)
    python agent.py

    # Play the exact shared game link
    python agent.py --url https://minesweeper.online/game/6130849347

    # Expert difficulty, slow so it looks dramatic
    python agent.py --difficulty expert --slow 300
"""

import argparse
import asyncio
import random
from typing import Dict, List, Set, Tuple, Optional

from playwright.async_api import async_playwright, Page
from solver import MinesweeperSolver

Coord = Tuple[int, int]

# minesweeper.online cell class → number value
NUM_CLASSES = {
    "hd_type1": 1, "hd_type2": 2, "hd_type3": 3, "hd_type4": 4,
    "hd_type5": 5, "hd_type6": 6, "hd_type7": 7, "hd_type8": 8,
    "hd_opened": 0,
}

DIFFICULTY_URLS = {
    "beginner":     "https://minesweeper.online/",
    "intermediate": "https://minesweeper.online/game/intermediate",
    "expert":       "https://minesweeper.online/game/expert",
}


async def read_board(page: Page):
    """Read board state from DOM. Returns parsed board info."""

    cells = await page.query_selector_all(".cell")

    numbers: Dict[Coord, int] = {}
    flagged: Set[Coord] = set()
    unknown: List[Coord] = []

    max_r = max_c = 0

    for cell in cells:
        x = await cell.get_attribute("data-x")
        y = await cell.get_attribute("data-y")
        if x is None or y is None:
            continue

        col, row = int(x), int(y)
        max_r = max(max_r, row)
        max_c = max(max_c, col)

        classes = (await cell.get_attribute("class") or "").split()

        if "hd_flag" in classes:
            flagged.add((row, col))
        elif "hd_closed" in classes or "hd_question" in classes:
            unknown.append((row, col))
        else:
            for cls, num in NUM_CLASSES.items():
                if cls in classes:
                    numbers[(row, col)] = num
                    break

    rows = max_r + 1 if max_r else 0
    cols = max_c + 1 if max_c else 0

    # Detect win / loss via the face button
    face = await page.query_selector("#top_area_face")
    game_over = won = False
    if face:
        face_class = await face.get_attribute("class") or ""
        if "face_lose" in face_class:
            game_over = True
        elif "face_win" in face_class:
            game_over = True
            won = True

    return rows, cols, numbers, flagged, unknown, game_over, won


async def click_cell(page: Page, row: int, col: int):
    cell = await page.query_selector(f"[data-x='{col}'][data-y='{row}']")
    if cell:
        await cell.click()


async def flag_cell(page: Page, row: int, col: int):
    cell = await page.query_selector(f"[data-x='{col}'][data-y='{row}']")
    if cell:
        await cell.click(button="right")


async def play_game(page: Page, slow_mo: int = 0):
    await page.wait_for_load_state("networkidle")
    await asyncio.sleep(1.5)

    rows, cols, numbers, flagged, unknown, game_over, won = await read_board(page)
    if rows == 0:
        print("ERROR: Could not read board. Dumping page HTML for debug:")
        print(await page.content())
        return

    print(f"Board: {rows}x{cols} | Unknown: {len(unknown)}")

    # First click: center cell (site guarantees no mine on first click)
    if not numbers:
        center_r, center_c = rows // 2, cols // 2
        print(f"Opening center ({center_r}, {center_c}) to start")
        await click_cell(page, center_r, center_c)
        await asyncio.sleep(0.6)

    solver = MinesweeperSolver(rows, cols)
    moves = 0
    guesses = 0

    while True:
        rows, cols, numbers, flagged, unknown, game_over, won = await read_board(page)

        if game_over:
            status = "WIN" if won else "BOOM (mine hit)"
            print(f"{status} — {moves} moves, {guesses} guesses")
            return

        if not unknown:
            print(f"Board cleared! {moves} moves, {guesses} guesses")
            return

        solver.update(numbers, flagged)
        safe, mines = solver.solve()

        # Filter to only still-unknown cells
        safe  = [c for c in safe  if c in unknown]
        mines = [c for c in mines if c not in flagged]

        if mines:
            for coord in mines:
                print(f"  FLAG mine  {coord}")
                await flag_cell(page, *coord)
                moves += 1
                if slow_mo:
                    await asyncio.sleep(slow_mo / 1000)
            continue

        if safe:
            for coord in safe:
                print(f"  CLICK safe {coord}")
                await click_cell(page, *coord)
                moves += 1
                if slow_mo:
                    await asyncio.sleep(slow_mo / 1000)
            continue

        # No deterministic move — probabilistic guess
        guess = solver.best_guess(unknown)
        if guess:
            guesses += 1
            print(f"  GUESS      {guess}  (no safe deduction)")
            await click_cell(page, *guess)
            moves += 1
            if slow_mo:
                await asyncio.sleep(slow_mo / 1000)
        else:
            print("No moves left — exiting")
            break

        await asyncio.sleep(0.15)


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", help="Specific game URL")
    parser.add_argument("--difficulty", default="beginner",
                        choices=["beginner", "intermediate", "expert"])
    parser.add_argument("--headless", action="store_true")
    parser.add_argument("--slow", type=int, default=150,
                        help="Delay between moves in ms (default 150 — visible but fast)")
    args = parser.parse_args()

    url = args.url or DIFFICULTY_URLS[args.difficulty]

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=args.headless,
            slow_mo=0,  # we handle our own delay per move
        )
        ctx = await browser.new_context(viewport={"width": 1280, "height": 800})
        page = await ctx.new_page()

        print(f"Opening: {url}")
        await page.goto(url)
        await play_game(page, slow_mo=args.slow)

        print("Press Enter to close browser...")
        input()
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())

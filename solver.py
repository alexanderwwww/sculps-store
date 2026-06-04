"""
Minesweeper constraint-based solver.

The core logic: model each numbered cell as a constraint
  {set_of_unknown_neighbors} = mine_count
Then apply set operations to deduce safe/mine cells.
"""

from dataclasses import dataclass, field
from typing import Set, Tuple, List, Optional
import random

Coord = Tuple[int, int]


@dataclass
class Constraint:
    cells: Set[Coord]
    count: int  # how many mines are in `cells`

    def is_trivially_safe(self) -> bool:
        return self.count == 0

    def is_trivially_mines(self) -> bool:
        return len(self.cells) == self.count


class MinesweeperSolver:
    def __init__(self, rows: int, cols: int):
        self.rows = rows
        self.cols = cols
        # Board states: None=unknown, True=mine, False=safe/revealed
        self.known: dict[Coord, bool] = {}
        # Numbers on revealed cells
        self.numbers: dict[Coord, int] = {}

    def update(self, numbers: dict[Coord, int], flagged: Set[Coord]):
        """Feed current board state into solver."""
        self.numbers = numbers
        for coord in flagged:
            self.known[coord] = True

    def _neighbors(self, r: int, c: int) -> List[Coord]:
        result = []
        for dr in (-1, 0, 1):
            for dc in (-1, 0, 1):
                if dr == 0 and dc == 0:
                    continue
                nr, nc = r + dr, c + dc
                if 0 <= nr < self.rows and 0 <= nc < self.cols:
                    result.append((nr, nc))
        return result

    def _build_constraints(self) -> List[Constraint]:
        constraints = []
        for (r, c), num in self.numbers.items():
            unknown_neighbors = set()
            mine_count = num
            for n in self._neighbors(r, c):
                if self.known.get(n) is True:
                    mine_count -= 1  # already flagged mine
                elif self.known.get(n) is False or n in self.numbers:
                    pass  # already revealed safe
                else:
                    unknown_neighbors.add(n)
            if unknown_neighbors or mine_count > 0:
                constraints.append(Constraint(unknown_neighbors, mine_count))
        return constraints

    def solve(self) -> Tuple[List[Coord], List[Coord]]:
        """
        Returns (safe_to_click, mines_found).
        Applies constraint propagation + subset reasoning.
        """
        safe: Set[Coord] = set()
        mines: Set[Coord] = set()

        changed = True
        while changed:
            changed = False
            constraints = self._build_constraints()

            for c in constraints:
                if c.count < 0 or c.count > len(c.cells):
                    continue
                if c.is_trivially_safe():
                    for cell in c.cells:
                        if cell not in safe:
                            safe.add(cell)
                            changed = True
                if c.is_trivially_mines():
                    for cell in c.cells:
                        if cell not in mines:
                            mines.add(cell)
                            self.known[cell] = True
                            changed = True

            # Subset reasoning: if A ⊂ B then B\A has (B.count - A.count) mines
            for i, a in enumerate(constraints):
                for b in constraints[i + 1:]:
                    if a.cells and a.cells < b.cells:
                        diff = Constraint(b.cells - a.cells, b.count - a.count)
                        if diff.count < 0:
                            continue
                        if diff.is_trivially_safe():
                            for cell in diff.cells:
                                if cell not in safe:
                                    safe.add(cell)
                                    changed = True
                        if diff.is_trivially_mines():
                            for cell in diff.cells:
                                if cell not in mines:
                                    mines.add(cell)
                                    self.known[cell] = True
                                    changed = True
                    elif b.cells and b.cells < a.cells:
                        diff = Constraint(a.cells - b.cells, a.count - b.count)
                        if diff.count < 0:
                            continue
                        if diff.is_trivially_safe():
                            for cell in diff.cells:
                                if cell not in safe:
                                    safe.add(cell)
                                    changed = True
                        if diff.is_trivially_mines():
                            for cell in diff.cells:
                                if cell not in mines:
                                    mines.add(cell)
                                    self.known[cell] = True
                                    changed = True

            # Mark safe cells as known
            for cell in safe:
                self.known[cell] = False

        return list(safe), list(mines)

    def best_guess(self, unknown_cells: List[Coord]) -> Optional[Coord]:
        """
        When no deterministic move exists, pick lowest-probability mine cell.
        Naive approach: constrained cells vs frontier vs interior.
        """
        if not unknown_cells:
            return None

        constrained: Set[Coord] = set()
        for c in self._build_constraints():
            constrained.update(c.cells)

        # Prefer cells NOT adjacent to any number (inner unknown = lower risk on avg)
        interior = [cell for cell in unknown_cells if cell not in constrained]
        if interior:
            return random.choice(interior)

        return random.choice(unknown_cells)

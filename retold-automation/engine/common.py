# -*- coding: utf-8 -*-
"""
common.py — tiny shared helpers for the RETOLD production engine.

This file has ZERO third-party dependencies on purpose, so every other engine
module can import it and still be "independently runnable" with nothing but a
stock Python 3.11 install.

What lives here:
  * load_env()  -> reads the single .env at the repo root into os.environ
  * log()       -> one consistent, timestamped console line for the owner
  * REPO_ROOT   -> absolute path to /.../retold-automation
  * RETOLD brand colours (used by the QR + PDF fallback code)
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
# engine/common.py  ->  engine/  ->  retold-automation/
REPO_ROOT = Path(__file__).resolve().parent.parent
ENGINE_DIR = REPO_ROOT / "engine"
SAMPLES_DIR = REPO_ROOT / "samples"
TEMPLATES_DIR = REPO_ROOT / "templates"

# ---------------------------------------------------------------------------
# RETOLD brand palette (shared contract)
# ---------------------------------------------------------------------------
CREAM = "#F4EDDB"
FOREST = "#1F4934"
GOLD = "#C7A44B"


def _hex_to_rgb01(hex_color: str):
    """'#C7A44B' -> (0.78, 0.64, 0.29) floats in 0..1 for PDF colour ops."""
    h = hex_color.lstrip("#")
    return tuple(int(h[i : i + 2], 16) / 255.0 for i in (0, 2, 4))


# ---------------------------------------------------------------------------
# .env loader (no python-dotenv dependency required)
# ---------------------------------------------------------------------------
_ENV_LOADED = False


def load_env(env_path: Path | None = None) -> None:
    """Load KEY=VALUE lines from the repo-root .env into os.environ.

    * Existing real environment variables always win (we never clobber them).
    * Missing .env is fine — the engine simply relies on whatever is already
      in the environment (and --mock needs no keys at all).
    Safe to call many times; only does the work once.
    """
    global _ENV_LOADED
    if _ENV_LOADED:
        return
    _ENV_LOADED = True

    path = env_path or (REPO_ROOT / ".env")
    if not path.exists():
        return

    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        # Real env beats .env so `KEY=... python ...` overrides work.
        if key and key not in os.environ:
            os.environ[key] = value


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
def log(msg: str, level: str = "INFO") -> None:
    """Print one timestamped line. Kept intentionally plain so a non-technical
    owner can read the console output like a progress diary."""
    ts = time.strftime("%H:%M:%S")
    print(f"[{ts}] {level:<5} | {msg}", file=sys.stderr, flush=True)


def env(key: str, default: str | None = None) -> str | None:
    """Convenience: load .env (once) then read a variable."""
    load_env()
    return os.environ.get(key, default)

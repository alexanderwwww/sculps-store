"""
AETOS · the brain — a disciplined robot scalper for GMGN (Solana).

Philosophy (the rules the user set, encoded):
  - Tiny fixed bets ($5–10). Never average down. Never chase.
  - Take the 80 cents: exit winners on momentum fade, don't wait for perfect.
  - Cut losers FAST. Hard stop always. Time-stop stale trades.
  - Only touch tokens that pass the safety gauntlet (honeypot/rug/holders/liquidity).
  - 3 losses in a row -> cooldown. Daily loss cap -> stop for the day.
  - PAPER mode by default. LIVE only after the user types ARM.
  - On live buys, attach server-side TP/SL (condition_orders) so GMGN's servers
    hold the safety exits even if this computer sleeps.
"""

import json
import os
import time
import threading
import traceback
from collections import deque

from gmgn_client import GmgnClient, ApiError, SOL_MINT, USDC_MINT

CHAIN = "sol"
LAMPORTS = 1_000_000_000
# valid, well-known address usable for paper-mode route quotes
PAPER_QUOTE_WALLET = "11111111111111111111111111111111"

DEFAULT_SETTINGS = {
    "trade_size_usd": 5.0,        # per trade
    "max_positions": 2,
    "take_profit_pct": 25.0,      # hard TP (local)
    "soft_take_pct": 10.0,        # "the 80 cents": min profit to allow momentum-fade exit
    "fade_from_peak_pct": 6.0,    # exit if price falls this far from peak while in soft-profit
    "stop_loss_pct": 18.0,
    "server_tp_pct": 30.0,        # server-side backstop TP (condition_orders)
    "server_sl_pct": 25.0,        # server-side backstop SL
    "max_hold_min": 12.0,
    "daily_loss_cap_usd": 15.0,
    "loss_streak_pause": 3,       # consecutive losses -> cooldown
    "cooldown_min": 45.0,
    "min_liquidity_usd": 20000.0,
    "max_rug_ratio": 0.10,
    "max_top10_pct": 35.0,
    "min_volume_1m_usd": 3000.0,
    "min_swaps_1m": 15,
    "min_score": 3.0,
    "slippage": 15,
    "exit_slippage": 25,
    "rug_exit_slippage": 50,
    "entry_gap_sec": 45,          # min seconds between entries
    "paper_start_usd": 100.0,
}

# ---------- tolerant field helpers (API shapes vary) ----------

def pick(d, *keys, default=None):
    if not isinstance(d, dict):
        return default
    for k in keys:
        if k in d and d[k] is not None:
            return d[k]
    return default

def fnum(v, default=None):
    try:
        if v is None: return default
        if isinstance(v, bool): return default
        return float(v)
    except (TypeError, ValueError):
        return default

def fbool(v):
    """True if value clearly means yes/true/1."""
    if isinstance(v, bool): return v
    if isinstance(v, (int, float)): return v == 1
    if isinstance(v, str): return v.strip().lower() in ("yes", "true", "1")
    return False

def rows_of(data):
    """Unwrap list payloads that may arrive as {rank:[..]}/{list:[..]}/[..]."""
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for k in ("rank", "list", "tokens", "data", "items", "rows", "holdings"):
            v = data.get(k)
            if isinstance(v, list):
                return v
    return []


class Brain:
    def __init__(self, base_dir, config, log_fn=None):
        self.base = base_dir
        self.config = config              # {api_key, wallet, mode: paper|live, armed: bool}
        self.settings = dict(DEFAULT_SETTINGS)
        self.settings.update(config.get("settings") or {})

        self._log_buf = deque(maxlen=400)
        self._ext_log = log_fn
        self.client = None

        self.running = False
        self._thread = None
        self._stop_evt = threading.Event()
        self._lock = threading.RLock()

        # runtime
        self.positions = {}               # token -> position dict
        self.trades = deque(maxlen=200)   # closed trades
        self.blacklist = {}               # token -> until_ts
        self.loss_streak = 0
        self.cooldown_until = 0.0
        self.last_entry_ts = 0.0
        self.daily = {"date": self._today(), "pnl": 0.0, "wins": 0, "losses": 0}
        self.paper_balance = float(self.settings["paper_start_usd"])
        self.live_sol_balance = None
        self.sol_price = None
        self._sol_price_ts = 0.0
        self.halted_reason = None
        self.last_scan_ts = 0.0
        self.scan_note = "idle"
        self.equity_hist = deque(maxlen=2000)   # (ts, equity_usd) for the live chart

        self._load_state()
        self._init_client()

    # ---------- infra ----------

    def log(self, level, msg):
        entry = {"ts": time.time(), "level": level, "msg": str(msg)[:400]}
        self._log_buf.append(entry)
        if self._ext_log:
            try: self._ext_log(level, msg)
            except Exception: pass

    def _today(self):
        return time.strftime("%Y-%m-%d")

    def _state_path(self):
        return os.path.join(self.base, "state.json")

    def _load_state(self):
        try:
            with open(self._state_path(), "r", encoding="utf-8") as f:
                s = json.load(f)
            self.paper_balance = float(s.get("paper_balance", self.paper_balance))
            self.daily = s.get("daily", self.daily)
            self.trades = deque(s.get("trades", []), maxlen=200)
            self.blacklist = {k: float(v) for k, v in (s.get("blacklist") or {}).items()}
            self.loss_streak = int(s.get("loss_streak", 0))
            # positions are NOT restored into active management for live safety;
            # paper positions restore fine.
            if self.config.get("mode", "paper") == "paper":
                self.positions = s.get("positions") or {}
        except FileNotFoundError:
            pass
        except Exception as e:
            self.log("warn", f"state load failed: {e}")

    def save_state(self):
        try:
            tmp = self._state_path() + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump({
                    "paper_balance": self.paper_balance,
                    "daily": self.daily,
                    "trades": list(self.trades),
                    "blacklist": self.blacklist,
                    "loss_streak": self.loss_streak,
                    "positions": self.positions,
                }, f)
            os.replace(tmp, self._state_path())
        except Exception as e:
            self.log("warn", f"state save failed: {e}")

    def _init_client(self):
        api_key = self.config.get("api_key")
        if not api_key:
            self.client = None
            return
        pem = None
        pk_path = os.path.join(self.base, "gmgn_private.pem")
        if os.path.exists(pk_path):
            with open(pk_path, "r", encoding="utf-8") as f:
                pem = f.read()
        self.client = GmgnClient(api_key, private_key_pem=pem, log=self.log)

    def reconfigure(self, config):
        with self._lock:
            prev_mode = self.config.get("mode")
            self.config = config
            self.settings.update(config.get("settings") or {})
            self._init_client()
            # switching modes must not carry positions across (paper<->live)
            if config.get("mode") != prev_mode and self.positions:
                for tok, p in list(self.positions.items()):
                    if p.get("mode") == "live":
                        self.log("warn", f"mode switch: DROPPING tracked live position {p.get('symbol')} "
                                          f"— close it manually in GMGN if still open")
                self.positions = {}

    # ---------- lifecycle ----------

    def start(self):
        with self._lock:
            if self.running:
                return True, "already running"
            if not self.client:
                return False, "Finish setup first (API key missing)"
            if self.config.get("mode") == "live":
                if not self.config.get("armed"):
                    return False, "LIVE mode requires ARM confirmation"
                if not self.config.get("wallet"):
                    return False, "LIVE mode requires your wallet address"
            # if a previous loop thread is still winding down, tell it to quit
            if self._thread and self._thread.is_alive():
                self._stop_evt.set()
            self.halted_reason = None
            evt = threading.Event()          # fresh event per generation
            self._stop_evt = evt
            self.running = True
            self._thread = threading.Thread(target=self._loop, args=(evt,), daemon=True)
            self._thread.start()
            self.log("info", f"engine started ({self.config.get('mode','paper').upper()})")
            return True, "started"

    def stop(self):
        self._stop_evt.set()
        self.running = False
        self.log("info", "engine stopped")
        self.save_state()

    def panic(self):
        """Sell everything now, then stop."""
        self.log("warn", "PANIC: closing all positions")
        with self._lock:
            for token in list(self.positions.keys()):
                try:
                    self._exit(token, reason="panic", slippage=self.settings["rug_exit_slippage"])
                except Exception as e:
                    self.log("error", f"panic exit {token[:8]}: {e}")
        self.stop()

    # ---------- main loop ----------

    def _loop(self, evt):
        tick = 0
        while not evt.is_set():
            try:
                self._roll_day()
                self._manage_positions()
                if tick % 5 == 0 and not evt.is_set():   # reconcile live holdings periodically
                    self._reconcile_live()
                if tick % 5 == 0 and not evt.is_set():   # scan every ~20s (tick = 4s)
                    self._scan_and_enter()
                if tick % 15 == 0:
                    self.save_state()
                    self._refresh_balance()
            except ApiError as e:
                if e.is_rate_limit and e.reset_at:
                    wait = max(0, e.reset_at - time.time()) + 1
                    self.log("warn", f"rate limit: pausing {int(wait)}s")
                    evt.wait(min(wait, 300))
                else:
                    self.log("error", f"api: {e}")
            except Exception as e:
                self.log("error", f"loop: {e} | {traceback.format_exc().splitlines()[-1]}")
            tick += 1
            evt.wait(4)
        self.save_state()

    def _roll_day(self):
        if self.daily.get("date") != self._today():
            self.daily = {"date": self._today(), "pnl": 0.0, "wins": 0, "losses": 0}
            if self.halted_reason == "daily_cap":
                self.halted_reason = None
                self.log("info", "new day: daily cap reset")

    # ---------- market data ----------

    def _get_sol_price(self):
        now = time.time()
        if self.sol_price and now - self._sol_price_ts < 60:
            return self.sol_price
        price = None
        try:
            info = self.client.token_info(CHAIN, SOL_MINT)
            price = fnum(pick(info, "price", "usd_price", "price_usd"))
            if price is None and isinstance(pick(info, "price"), dict):
                price = fnum(pick(info["price"], "price", "usd"))
        except Exception as e:
            self.log("warn", f"sol price via token_info failed: {e}")
        if price is None:
            try:
                q = self.client.quote(CHAIN, self.config.get("wallet") or PAPER_QUOTE_WALLET,
                                      SOL_MINT, USDC_MINT, LAMPORTS, 5)
                out = fnum(pick(q, "output_amount", "out_amount"))
                if out: price = out / 1e6  # USDC 6 decimals
            except Exception as e:
                self.log("warn", f"sol price via quote failed: {e}")
        if price and 1 < price < 100000:
            self.sol_price = price
            self._sol_price_ts = now
        elif self.sol_price is None:
            self.sol_price = 200.0
            self.log("warn", "using fallback SOL price $200 (data unavailable)")
        return self.sol_price

    def _refresh_balance(self):
        if self.config.get("mode") != "live" or not self.config.get("wallet"):
            return
        try:
            data = self.client.wallet_holdings(CHAIN, self.config["wallet"])
            for row in rows_of(data):
                tok = pick(row, "token_address", "address", "token")
                if isinstance(tok, dict):
                    tok = pick(tok, "address", "token_address")
                if tok == SOL_MINT or pick(row, "symbol") in ("SOL", "WSOL"):
                    bal = fnum(pick(row, "balance", "amount", "ui_amount"))
                    if bal is not None:
                        self.live_sol_balance = bal
                        return
        except Exception as e:
            self.log("warn", f"balance refresh: {e}")

    # ---------- scanning + entry ----------

    def _blocked(self):
        now = time.time()
        if self.halted_reason:
            return self.halted_reason
        if now < self.cooldown_until:
            return f"cooldown {int((self.cooldown_until - now)/60)+1}m"
        if self.daily["pnl"] <= -abs(self.settings["daily_loss_cap_usd"]):
            self.halted_reason = "daily_cap"
            self.log("warn", "DAILY LOSS CAP hit — halting entries for today")
            return "daily_cap"
        if len(self.positions) >= int(self.settings["max_positions"]):
            return "max positions"
        if now - self.last_entry_ts < self.settings["entry_gap_sec"]:
            return "entry gap"
        return None

    def _scan_and_enter(self):
        self.last_scan_ts = time.time()
        blocked = self._blocked()
        if blocked:
            self.scan_note = blocked
            return
        self.scan_note = "scanning"
        try:
            data = self.client.trending(CHAIN, interval="1m")
        except ApiError as e:
            if e.is_rate_limit: raise
            self.log("warn", f"trending failed on 1m, trying 5m: {e.error or e.api_message}")
            data = self.client.trending(CHAIN, interval="5m")

        candidates = []
        for row in rows_of(data)[:40]:
            c = self._parse_candidate(row)
            if c: candidates.append(c)
        if not candidates:
            self.scan_note = "no parseable candidates"
            return

        candidates.sort(key=lambda c: c["score"], reverse=True)
        for c in candidates[:6]:
            if c["score"] < self.settings["min_score"]:
                break
            if c["token"] in self.positions or time.time() < self.blacklist.get(c["token"], 0):
                continue
            if self._deep_check(c):
                self._enter(c)
                return  # one entry per scan

    def _parse_candidate(self, row):
        token = pick(row, "address", "token_address", "contract_address", "ca")
        if isinstance(token, dict):
            token = pick(token, "address")
        if not token or token == SOL_MINT:
            return None
        symbol = pick(row, "symbol", "token_symbol", "name", default="?")
        price = fnum(pick(row, "price", "usd_price", "price_usd"))
        liq = fnum(pick(row, "liquidity", "liquidity_usd", "pool_liquidity"), 0)
        vol = fnum(pick(row, "volume", "volume_1m", "volume_usd", "vol"), 0)
        swaps = fnum(pick(row, "swaps", "swaps_1m", "txs", "tx_count"), 0)
        chg1m = fnum(pick(row, "price_change_percent1m", "price_change_1m", "change_1m",
                          "price_change_percent", "price_change"), 0)
        chg5m = fnum(pick(row, "price_change_percent5m", "price_change_5m", "change_5m"), 0)
        holders = fnum(pick(row, "holder_count", "holders"), 0)
        smart = fnum(pick(row, "smart_buy_24h", "smartmoney", "smart_degen_count"), 0)

        # hard pre-filters from the rank row
        if liq and liq < self.settings["min_liquidity_usd"]:
            return None
        if vol < self.settings["min_volume_1m_usd"]:
            return None
        if swaps < self.settings["min_swaps_1m"]:
            return None
        if chg1m is not None and chg1m < -2:   # falling knife
            return None
        if chg1m is not None and chg1m > 80:   # already vertical — we're late
            return None

        score = 0.0
        if chg1m: score += max(min(chg1m / 5.0, 3.0), -3.0)
        if chg5m: score += max(min(chg5m / 15.0, 2.0), -2.0)
        if vol: score += min(vol / 20000.0, 2.0)
        if swaps: score += min(swaps / 60.0, 1.5)
        if smart: score += min(smart / 3.0, 2.0)
        if holders and holders > 300: score += 0.5

        return {"token": token, "symbol": str(symbol)[:12], "price": price,
                "liquidity": liq, "score": round(score, 2), "row": row}

    def _deep_check(self, c):
        """Security gauntlet. Any clear red flag -> reject + blacklist."""
        token = c["token"]
        try:
            sec = self.client.token_security(CHAIN, token) or {}
        except ApiError as e:
            if e.is_rate_limit: raise
            self.log("warn", f"{c['symbol']}: security check failed ({e.error}) — skipping token")
            return False

        flat = dict(sec)
        for v in list(sec.values()):
            if isinstance(v, dict):
                flat.update(v)

        if fbool(pick(flat, "is_honeypot", "honeypot")):
            self._reject(token, c, "HONEYPOT")
            return False
        rug = fnum(pick(flat, "rug_ratio", "rugged_ratio"), 0) or 0
        if rug > self.settings["max_rug_ratio"]:
            self._reject(token, c, f"rug_ratio {rug:.2f}")
            return False
        # only enforce authority flags when clearly present and bad
        if fbool(pick(flat, "is_mintable", "mintable", "mint_authority")):
            self._reject(token, c, "mint authority live")
            return False
        if fbool(pick(flat, "is_freezable", "freezable", "freeze_authority")):
            self._reject(token, c, "freeze authority live")
            return False
        renounced = pick(flat, "renounced", "is_renounced", "renounce")
        if renounced is not None and not fbool(renounced) and not isinstance(renounced, str):
            # ambiguous shapes: only reject on explicit False
            if renounced is False:
                self._reject(token, c, "not renounced")
                return False
        top10 = fnum(pick(flat, "top_10_holder_rate", "top10_holder_rate", "top_10_rate"))
        if top10 is not None:
            pct = top10 * 100 if top10 <= 1 else top10
            if pct > self.settings["max_top10_pct"]:
                self._reject(token, c, f"top10 {pct:.0f}%")
                return False

        liq = c["liquidity"]
        if not liq:
            try:
                pool = self.client.token_pool_info(CHAIN, token) or {}
                liq = fnum(pick(pool, "liquidity", "liquidity_usd", "pool_liquidity"), 0)
            except Exception:
                liq = 0
        if liq < self.settings["min_liquidity_usd"]:
            self._reject(token, c, f"liquidity ${liq:,.0f}")
            return False
        c["liquidity"] = liq
        return True

    def _reject(self, token, c, why):
        self.blacklist[token] = time.time() + 7200
        self.log("info", f"skip {c['symbol']}: {why}")

    # ---------- entering ----------

    def _enter(self, c):
        mode = self.config.get("mode", "paper")
        sol_price = self._get_sol_price()
        usd = float(self.settings["trade_size_usd"])
        lamports = int(usd / sol_price * LAMPORTS)
        token, symbol = c["token"], c["symbol"]
        wallet = self.config.get("wallet") or PAPER_QUOTE_WALLET

        tokens_raw, entry_usd, decimals = None, usd, None
        try:
            q = self.client.quote(CHAIN, wallet, SOL_MINT, token, lamports, self.settings["slippage"]) or {}
            tokens_raw = fnum(pick(q, "output_amount", "out_amount"))
            decimals = fnum(pick(q, "output_token_decimals", "out_decimals"))
        except ApiError as e:
            if e.is_rate_limit:
                raise
            self.log("warn", f"{symbol}: quote failed ({e.error or e.api_message}); using scan price fill")
        except Exception as e:
            self.log("warn", f"{symbol}: quote failed ({e}); using scan price fill")

        # if we can neither count tokens nor price it, we could never value/exit it safely -> skip
        if tokens_raw is None and c["price"] is None:
            self.log("warn", f"{symbol}: no fill quote and no scan price — skipping (cannot value position)")
            self.blacklist[token] = time.time() + 1800
            return

        if mode == "live":
            ok = self._live_buy(c, lamports)
            if not ok:
                return
        else:
            if self.paper_balance < usd:
                self.log("warn", "paper balance too low; stopping entries")
                self.halted_reason = "paper_broke"
                return
            self.paper_balance -= usd

        pos = {
            "token": token, "symbol": symbol, "mode": mode,
            "opened": time.time(),
            "cost_usd": usd,
            "lamports_in": lamports,
            "tokens_raw": tokens_raw,          # may be None -> price-based tracking
            "decimals": decimals,
            "entry_price": c["price"],         # may be None
            "peak_value": usd,
            "last_value": usd,
            "entry_liquidity": c["liquidity"],
            "server_protected": self.config.get("_server_protected", False),
        }
        with self._lock:
            self.positions[token] = pos
        self.last_entry_ts = time.time()
        self.log("trade", f"BUY {symbol} ${usd:.2f} (score {c['score']}, liq ${c['liquidity']:,.0f}) [{mode}]")
        self.save_state()

    def _live_buy(self, c, lamports):
        s = self.settings
        base = {
            "chain": CHAIN,
            "from_address": self.config["wallet"],
            "input_token": SOL_MINT,
            "output_token": c["token"],
            "input_amount": str(lamports),
            "slippage": s["slippage"],
            "is_anti_mev": True,
        }
        cond = [
            {"order_type": "profit_stop", "side": "sell",
             "price_scale": str(int(100 + s["server_tp_pct"])), "sell_ratio": "100"},
            {"order_type": "profit_stop", "side": "sell",
             "price_scale": str(int(100 - s["server_sl_pct"])), "sell_ratio": "100"},
        ]
        self.config["_server_protected"] = False
        try:
            res = self.client.swap({**base, "condition_orders": cond, "sell_ratio_type": "buy_amount"})
            self.config["_server_protected"] = True
        except ApiError as e:
            if e.is_rate_limit:
                raise
            # AMBIGUOUS failure (network drop, 5xx, no error code) = the buy MIGHT have
            # gone through. Retrying a plain swap here risks a DOUBLE BUY. Abort instead.
            ambiguous = (e.status == 0) or (e.status is not None and e.status >= 500) or (e.code is None)
            if ambiguous:
                self.log("error", f"BUY {c['symbol']}: swap outcome UNKNOWN ({e.error or e.api_message}). "
                                  f"Not retrying (double-buy risk). Check GMGN.")
                return False
            # definitive rejection (e.g. condition_orders shape) -> the buy did NOT happen; plain retry is safe
            self.log("warn", f"server TP/SL rejected ({e.error or e.api_message}); retrying plain buy")
            try:
                res = self.client.swap(base)
            except ApiError as e2:
                if e2.is_rate_limit:
                    raise
                self.log("error", f"BUY {c['symbol']} failed: {e2.error or e2.api_message}")
                return False
        order_id = pick(res or {}, "order_id", "id")
        return self._confirm_order(order_id, "BUY", c["symbol"])

    def _confirm_order(self, order_id, side, symbol):
        if not order_id:
            self.log("warn", f"{side} {symbol}: no order_id in response; assuming submitted")
            return True
        for _ in range(6):
            self._stop_evt.wait(5)
            try:
                od = self.client.query_order(order_id, CHAIN) or {}
            except ApiError as e:
                if e.is_rate_limit: raise
                continue
            status = str(pick(od, "status", default="")).lower()
            if status == "confirmed":
                self.log("info", f"{side} {symbol}: confirmed")
                return True
            if status in ("failed", "expired"):
                self.log("error", f"{side} {symbol}: {status}")
                return False
        self.log("warn", f"{side} {symbol}: confirmation timeout; treating as filled — verify in GMGN")
        return True

    # ---------- managing positions ----------

    def _position_value(self, pos):
        """Current USD value of the position. Multiple fallbacks."""
        wallet = self.config.get("wallet") or PAPER_QUOTE_WALLET
        sol_price = self._get_sol_price()
        # preferred: reverse route quote with real token amount
        if pos.get("tokens_raw"):
            try:
                q = self.client.quote(CHAIN, wallet, pos["token"], SOL_MINT,
                                      int(pos["tokens_raw"]), self.settings["exit_slippage"]) or {}
                out = fnum(pick(q, "output_amount", "out_amount"))
                if out:
                    return out / LAMPORTS * sol_price
            except ApiError as e:
                if e.is_rate_limit: raise
            except Exception:
                pass
        # fallback: token price movement
        try:
            info = self.client.token_info(CHAIN, pos["token"]) or {}
            price = fnum(pick(info, "price", "usd_price", "price_usd"))
            if price and pos.get("entry_price"):
                return pos["cost_usd"] * (price / pos["entry_price"])
            liq = fnum(pick(info, "liquidity", "liquidity_usd"))
            if liq is not None:
                pos["_last_liq"] = liq
        except Exception:
            pass
        return pos.get("last_value", pos["cost_usd"])

    def _record_equity(self):
        """Equity curve point for the live chart."""
        open_value = sum(p.get("last_value", p["cost_usd"]) for p in self.positions.values())
        if self.config.get("mode") == "live":
            equity = round(self.daily.get("pnl", 0.0) + sum(
                p.get("last_value", p["cost_usd"]) - p["cost_usd"] for p in self.positions.values()), 2)
        else:
            equity = round(self.paper_balance + open_value, 2)
        if not self.equity_hist or abs(self.equity_hist[-1][1] - equity) > 0.001 \
                or time.time() - self.equity_hist[-1][0] > 30:
            self.equity_hist.append((time.time(), equity))

    def _manage_positions(self):
        self._record_equity()
        if not self.positions:
            return
        s = self.settings
        for token, pos in list(self.positions.items()):
            try:
                value = self._position_value(pos)
                pos["last_value"] = value
                pos["peak_value"] = max(pos.get("peak_value", value), value)
                pnl_pct = (value / pos["cost_usd"] - 1) * 100
                pos["pnl_pct"] = round(pnl_pct, 2)
                held_min = (time.time() - pos["opened"]) / 60
                peak_dd = (1 - value / pos["peak_value"]) * 100 if pos["peak_value"] else 0

                # refresh liquidity so the rug guard runs for healthy positions too
                if time.time() - pos.get("_liq_ts", 0) > 12:
                    try:
                        info = self.client.token_info(CHAIN, token) or {}
                        lq = fnum(pick(info, "liquidity", "liquidity_usd", "pool_liquidity"))
                        if lq is not None:
                            pos["_last_liq"] = lq
                        pos["_liq_ts"] = time.time()
                    except ApiError:
                        raise
                    except Exception:
                        pass

                # rug guard: liquidity collapse vs entry
                liq_now = pos.get("_last_liq")
                if liq_now is not None and pos.get("entry_liquidity"):
                    if liq_now < pos["entry_liquidity"] * 0.4:
                        self._exit(token, "RUG GUARD (liquidity -60%)", s["rug_exit_slippage"])
                        continue

                if pnl_pct >= s["take_profit_pct"]:
                    self._exit(token, f"take profit +{pnl_pct:.0f}%", s["exit_slippage"]); continue
                if pnl_pct >= s["soft_take_pct"] and peak_dd >= s["fade_from_peak_pct"]:
                    self._exit(token, f"take the 80c (+{pnl_pct:.0f}%, fading)", s["exit_slippage"]); continue
                if pnl_pct <= -s["stop_loss_pct"]:
                    self._exit(token, f"stop loss {pnl_pct:.0f}%", s["exit_slippage"]); continue
                if held_min >= s["max_hold_min"] and pnl_pct > -5:
                    self._exit(token, f"time stop ({held_min:.0f}m)", s["exit_slippage"]); continue
            except ApiError:
                raise
            except Exception as e:
                self.log("warn", f"manage {pos['symbol']}: {e}")

    def _exit(self, token, reason, slippage):
        # atomically claim the position so the loop + panic thread can't both sell it
        with self._lock:
            pos = self.positions.pop(token, None)
        if not pos:
            return
        value = pos.get("last_value", pos["cost_usd"])

        if pos["mode"] == "live":
            params = {
                "chain": CHAIN,
                "from_address": self.config["wallet"],
                "input_token": token,
                "output_token": SOL_MINT,
                "input_amount": "0",
                "input_amount_bps": "10000",   # sell 100% of holdings
                "slippage": slippage,
                "is_anti_mev": True,
            }
            try:
                res = self.client.swap(params)
                ok = self._confirm_order(pick(res or {}, "order_id", "id"), "SELL", pos["symbol"])
            except ApiError as e:
                ok = False
                if e.is_rate_limit:
                    # transient — put it back so we retry next tick, don't book anything
                    with self._lock:
                        self.positions[token] = pos
                    raise
                self.log("error", f"SELL {pos['symbol']} failed: {e.error or e.api_message}")
            if not ok:
                # sell not confirmed — restore the position; the manage loop retries next tick.
                self.log("error", f"SELL {pos['symbol']} NOT confirmed — keeping position, will retry")
                with self._lock:
                    self.positions[token] = pos
                return
            self._cleanup_server_orders(token, pos["symbol"])
        else:
            self.paper_balance += value

        pnl = value - pos["cost_usd"]
        self.daily["pnl"] += pnl
        if pnl >= 0:
            self.daily["wins"] += 1
            self.loss_streak = 0
        else:
            self.daily["losses"] += 1
            self.loss_streak += 1
            self.blacklist[token] = time.time() + 7200
            if self.loss_streak >= int(self.settings["loss_streak_pause"]):
                self.cooldown_until = time.time() + self.settings["cooldown_min"] * 60
                self.log("warn", f"{self.loss_streak} losses in a row — cooling down {self.settings['cooldown_min']:.0f}m")
                self.loss_streak = 0

        self.trades.appendleft({
            "ts": time.time(), "symbol": pos["symbol"], "token": token,
            "pnl_usd": round(pnl, 2), "pnl_pct": pos.get("pnl_pct", 0),
            "reason": reason, "mode": pos["mode"],
            "held_min": round((time.time() - pos["opened"]) / 60, 1),
        })
        self.log("trade", f"SELL {pos['symbol']} {reason} -> {'+' if pnl>=0 else ''}{pnl:.2f}$")
        self.save_state()

    def _cleanup_server_orders(self, token, symbol):
        """After a live sell, cancel any lingering server-side TP/SL for this token
        so GMGN can't try to sell tokens we no longer hold."""
        if not self.config.get("_server_protected"):
            return
        try:
            orders = rows_of(self.client.strategy_orders(CHAIN))
        except Exception as e:
            self.log("warn", f"{symbol}: couldn't list server orders to clean up ({e})")
            return
        for od in orders:
            otok = pick(od, "token", "output_token", "input_token", "token_address")
            oid = pick(od, "order_id", "id", "strategy_id")
            if otok == token and oid:
                try:
                    self.client.cancel_strategy_order({"chain": CHAIN, "order_id": oid})
                    self.log("info", f"{symbol}: cancelled leftover server order {str(oid)[:8]}")
                except Exception as e:
                    self.log("warn", f"{symbol}: cancel server order failed ({e})")

    def _reconcile_live(self):
        """For live positions, if the wallet no longer holds the token, the server-side
        TP/SL already sold it. Finalize locally instead of trying to sell again."""
        if self.config.get("mode") != "live" or not self.positions or not self.config.get("wallet"):
            return
        try:
            data = self.client.wallet_holdings(CHAIN, self.config["wallet"])
        except Exception as e:
            self.log("warn", f"reconcile: holdings fetch failed ({e})")
            return
        held = set()
        for row in rows_of(data):
            tok = pick(row, "token_address", "address", "token")
            if isinstance(tok, dict):
                tok = pick(tok, "address", "token_address")
            bal = fnum(pick(row, "balance", "amount", "ui_amount"), 0) or 0
            if tok and bal > 0:
                held.add(tok)
        for token in list(self.positions.keys()):
            pos = self.positions[token]
            if pos.get("mode") != "live":
                continue
            if token not in held and (time.time() - pos["opened"]) > 30:
                self.log("info", f"{pos['symbol']}: no longer in wallet — server TP/SL closed it; finalizing")
                self._finalize_closed(token, pos)

    def _finalize_closed(self, token, pos):
        """Book a position that was already closed on-chain (by server TP/SL), no swap."""
        with self._lock:
            if token not in self.positions:
                return
            self.positions.pop(token, None)
        value = pos.get("last_value", pos["cost_usd"])
        pnl = value - pos["cost_usd"]
        self.daily["pnl"] += pnl
        if pnl >= 0:
            self.daily["wins"] += 1; self.loss_streak = 0
        else:
            self.daily["losses"] += 1; self.loss_streak += 1
            self.blacklist[token] = time.time() + 7200
        self.trades.appendleft({
            "ts": time.time(), "symbol": pos["symbol"], "token": token,
            "pnl_usd": round(pnl, 2), "pnl_pct": pos.get("pnl_pct", 0),
            "reason": "server TP/SL (auto)", "mode": "live",
            "held_min": round((time.time() - pos["opened"]) / 60, 1),
        })
        self._cleanup_server_orders(token, pos["symbol"])
        self.log("trade", f"CLOSED {pos['symbol']} via server TP/SL -> {'+' if pnl>=0 else ''}{pnl:.2f}$")
        self.save_state()

    # ---------- state for UI ----------

    def snapshot(self):
        mode = self.config.get("mode", "paper")
        return {
            "running": self.running,
            "mode": mode,
            "armed": bool(self.config.get("armed")),
            "scan_note": self.scan_note,
            "halted": self.halted_reason,
            "cooldown_until": self.cooldown_until if self.cooldown_until > time.time() else 0,
            "paper_balance": round(self.paper_balance, 2),
            "live_sol_balance": self.live_sol_balance,
            "sol_price": self.sol_price,
            "daily": self.daily,
            "loss_streak": self.loss_streak,
            "positions": [
                {k: v for k, v in p.items() if not k.startswith("_") and k != "row"}
                for p in self.positions.values()
            ],
            "trades": list(self.trades)[:40],
            "log": list(self._log_buf)[-80:],
            "settings": self.settings,
            "equity_hist": self._equity_points(120),
        }

    def _equity_points(self, max_points):
        pts = list(self.equity_hist)
        if len(pts) <= max_points:
            return pts
        step = len(pts) / max_points
        return [pts[int(i * step)] for i in range(max_points - 1)] + [pts[-1]]

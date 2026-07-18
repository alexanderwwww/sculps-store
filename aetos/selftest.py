"""
AETOS self-test — run: python selftest.py
1) Crypto: signing message format matches GMGN's official signer (fixed vectors)
   and Ed25519 signatures verify against the public key.
2) Brain: full paper cycle with a fake market — enter on a good token,
   reject scams, take profit on a pump, stop-loss on a dump, cooldown on streak.
"""

import base64
import os
import sys
import tempfile
import time

BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE)

from gmgn_client import build_message, json_compact  # noqa: E402
import brain as brain_mod  # noqa: E402
from brain import Brain  # noqa: E402

PASS, FAIL = 0, 0


def check(name, cond, extra=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  OK   {name}")
    else:
        FAIL += 1
        print(f"  FAIL {name} {extra}")


# ---------- 1. crypto ----------

print("\n[1/2] Crypto")

m1 = build_message("/v1/trade/query_order",
                   {"order_id": "abc-123", "chain": "sol",
                    "timestamp": 1784300000, "client_id": "9a2b3c4d-1111-2222-3333-444455556666"},
                   "", 1784300000)
check("signed-GET message format",
      m1 == "/v1/trade/query_order:chain=sol&client_id=9a2b3c4d-1111-2222-3333-444455556666&order_id=abc-123&timestamp=1784300000::1784300000",
      m1)

body = json_compact({"chain": "sol", "input_amount": "25000000", "slippage": 15, "is_anti_mev": True})
check("JSON body compact like JS", body == '{"chain":"sol","input_amount":"25000000","slippage":15,"is_anti_mev":true}', body)

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey  # noqa: E402
key = Ed25519PrivateKey.generate()
sig = key.sign(m1.encode())
try:
    key.public_key().verify(sig, m1.encode())
    check("Ed25519 sign/verify roundtrip", True)
except Exception as e:
    check("Ed25519 sign/verify roundtrip", False, str(e))
check("signature is base64-able", bool(base64.b64encode(sig)))


# ---------- 2. brain with fake market ----------

print("\n[2/2] Brain (paper simulation)")


class FakeClient:
    """Scriptable market: GOOD pumps then fades; SCAM is a honeypot; DUMP crashes."""

    def __init__(self):
        self.t0 = time.time()
        self.price_mult = {"GOODtoken1111111111111111111111111111111": 1.0,
                           "DUMPtoken1111111111111111111111111111111": 1.0}

    def trending(self, chain, interval="1m", **_):
        return {"rank": [
            {"address": "GOODtoken1111111111111111111111111111111", "symbol": "GOOD",
             "price": 0.001 * self.price_mult["GOODtoken1111111111111111111111111111111"],
             "liquidity": 50000, "volume": 30000, "swaps": 80,
             "price_change_percent1m": 8, "price_change_percent5m": 25,
             "holder_count": 500, "smart_buy_24h": 4},
            {"address": "SCAMtoken1111111111111111111111111111111", "symbol": "SCAM",
             "price": 0.5, "liquidity": 90000, "volume": 90000, "swaps": 200,
             "price_change_percent1m": 12, "price_change_percent5m": 40,
             "holder_count": 900, "smart_buy_24h": 9},
        ]}

    def token_security(self, chain, address):
        if address.startswith("SCAM"):
            return {"is_honeypot": "yes", "rug_ratio": 0.6}
        return {"is_honeypot": "no", "rug_ratio": 0.01, "top_10_holder_rate": 0.2,
                "is_mintable": "no", "is_freezable": "no"}

    def token_pool_info(self, chain, address):
        return {"liquidity": 50000}

    def token_info(self, chain, address):
        if address == brain_mod.SOL_MINT:
            return {"price": 200.0}
        mult = self.price_mult.get(address, 1.0)
        return {"price": 0.001 * mult, "liquidity": 50000}

    def quote(self, chain, from_addr, inp, out, amount, slippage):
        # buy: SOL -> token ; sell/value: token -> SOL
        if inp == brain_mod.SOL_MINT:
            usd = amount / 1e9 * 200.0
            tokens = usd / (0.001 * self.price_mult.get(out, 1.0))
            return {"output_amount": int(tokens * 1e6), "output_token_decimals": 6}
        usd = (amount / 1e6) * 0.001 * self.price_mult.get(inp, 1.0)
        return {"output_amount": int(usd / 200.0 * 1e9)}

    def user_info(self):
        return {"ok": True}

    def wallet_holdings(self, *a, **k):
        return {"holdings": []}


tmp = tempfile.mkdtemp()
b = Brain(tmp, {"mode": "paper", "api_key": "test", "settings": {"entry_gap_sec": 0}})
b.client = FakeClient()

start_bal = b.paper_balance
b._scan_and_enter()
check("entered GOOD token", "GOODtoken1111111111111111111111111111111" in b.positions)
check("rejected SCAM (honeypot blacklisted)", "SCAMtoken1111111111111111111111111111111" in b.blacklist)
check("paper balance debited", b.paper_balance < start_bal)

# pump +40% -> hard take profit
b.client.price_mult["GOODtoken1111111111111111111111111111111"] = 1.40
b._manage_positions()
check("took profit on pump", len(b.positions) == 0 and len(b.trades) == 1)
check("profit banked", b.trades[0]["pnl_usd"] > 0 and b.paper_balance > start_bal - 0.01)
check("win counted", b.daily["wins"] == 1)

# re-enter, then crash -30% -> stop loss
b.client.price_mult["GOODtoken1111111111111111111111111111111"] = 1.0
b.blacklist.pop("GOODtoken1111111111111111111111111111111", None)
b.last_entry_ts = 0
b._scan_and_enter()
check("re-entered for loss test", len(b.positions) == 1)
b.client.price_mult["GOODtoken1111111111111111111111111111111"] = 0.70
b._manage_positions()
check("stop loss fired", len(b.positions) == 0 and b.trades[0]["pnl_usd"] < 0)
check("loss counted + token blacklisted", b.daily["losses"] == 1
      and "GOODtoken1111111111111111111111111111111" in b.blacklist)

# soft take: +12% then fades 7% from peak -> "take the 80 cents"
b.client.price_mult["DUMPtoken1111111111111111111111111111111"] = 1.0
b.positions["DUMPtoken1111111111111111111111111111111"] = {
    "token": "DUMPtoken1111111111111111111111111111111", "symbol": "DUMP", "mode": "paper",
    "opened": time.time(), "cost_usd": 5.0, "lamports_in": 25000000,
    "tokens_raw": 5000 * 1e6, "decimals": 6, "entry_price": 0.001,
    "peak_value": 5.0, "last_value": 5.0, "entry_liquidity": 50000,
}
b.paper_balance -= 5.0
b.client.price_mult["DUMPtoken1111111111111111111111111111111"] = 1.20
b._manage_positions()   # records peak at +20%
b.client.price_mult["DUMPtoken1111111111111111111111111111111"] = 1.12
b._manage_positions()   # +12% but fading >6% from peak -> exit
check("'take the 80c' momentum exit", "DUMPtoken1111111111111111111111111111111" not in b.positions,
      f"positions={list(b.positions)}")
check("80c exit was profitable", b.trades[0]["pnl_usd"] > 0)

# loss streak -> cooldown
b.loss_streak = 2
b.daily["losses"] = 2
tok = "COOLtoken1111111111111111111111111111111"
b.positions[tok] = {"token": tok, "symbol": "COOL", "mode": "paper", "opened": time.time(),
                    "cost_usd": 5.0, "lamports_in": 25000000, "tokens_raw": None, "decimals": None,
                    "entry_price": 0.001, "peak_value": 5.0, "last_value": 4.0, "entry_liquidity": 50000}
b._exit(tok, "test loss", 25)
check("3rd loss triggers cooldown", b.cooldown_until > time.time())
check("scan blocked during cooldown", b._blocked() is not None)

# daily cap halts
b.cooldown_until = 0
b.daily["pnl"] = -999
check("daily cap halts entries", b._blocked() == "daily_cap")


# ---------- 3. live-path safety (the fixes) ----------

print("\n[3/3] Live-path safety")


class ApiErr(Exception):
    def __init__(self, status=400, code=1, error="X", is_rl=False):
        self.status, self.code, self.error, self.api_message = status, code, error, "err"
        self.is_rate_limit = is_rl


import gmgn_client as gc  # noqa: E402
gc_ApiError = gc.ApiError


class LiveClient(FakeClient):
    def __init__(self):
        super().__init__()
        self.swap_calls = 0
        self.confirm_status = "confirmed"
        self.swap_mode = "ok"   # ok | ambiguous | reject
        self.holdings = []

    def swap(self, params):
        self.swap_calls += 1
        if self.swap_mode == "ambiguous":
            raise gc_ApiError("POST", "/v1/trade/swap", 0, code=None, error=None, message="network: timeout")
        if self.swap_mode == "reject":
            raise gc_ApiError("POST", "/v1/trade/swap", 400, code=40003, error="BAD_PARAM", message="bad")
        return {"order_id": "oid-1", "status": "pending"}

    def query_order(self, order_id, chain):
        return {"status": self.confirm_status}

    def wallet_holdings(self, *a, **k):
        return {"holdings": self.holdings}

    def strategy_orders(self, *a, **k):
        return []

    def cancel_strategy_order(self, *a, **k):
        return {}


tmp2 = tempfile.mkdtemp()
lb = Brain(tmp2, {"mode": "live", "api_key": "k", "wallet": "So11111111111111111111111111111111111111112",
                  "armed": True, "settings": {"entry_gap_sec": 0}})
lc = LiveClient()
lb.client = lc

# double-buy guard: ambiguous swap error must NOT create a position
lc.swap_mode = "ambiguous"
c = lb._parse_candidate(lc.trending("sol")["rank"][0])
ok_buy = lb._live_buy(c, 25000000)
check("ambiguous BUY error -> no fill (no double-buy)", ok_buy is False and lc.swap_calls == 1)

# definitive rejection -> plain retry attempted (2 calls), still no position
lc.swap_calls = 0; lc.swap_mode = "reject"
ok_buy2 = lb._live_buy(c, 25000000)
check("rejected BUY retries plain once then fails", ok_buy2 is False and lc.swap_calls == 2)

# failed SELL must KEEP the position (not book PnL)
lc.swap_mode = "ok"; lc.confirm_status = "failed"
tok = "LIVEtoken111111111111111111111111111111111"
lb.positions[tok] = {"token": tok, "symbol": "LIVE", "mode": "live", "opened": time.time(),
                     "cost_usd": 5.0, "lamports_in": 25000000, "tokens_raw": 5000*1e6, "decimals": 6,
                     "entry_price": 0.001, "peak_value": 6.0, "last_value": 6.0, "entry_liquidity": 50000}
before_trades = len(lb.trades)
lb._exit(tok, "test", 25)
check("failed SELL keeps position", tok in lb.positions and len(lb.trades) == before_trades)

# confirmed SELL closes it and books the trade
lc.confirm_status = "confirmed"
lb._exit(tok, "take profit", 25)
check("confirmed SELL closes + books", tok not in lb.positions and len(lb.trades) == before_trades + 1)

# reconcile: wallet no longer holds it -> finalize as server-TP/SL close
tok2 = "GONEtoken111111111111111111111111111111111"
lb.positions[tok2] = {"token": tok2, "symbol": "GONE", "mode": "live", "opened": time.time()-60,
                      "cost_usd": 5.0, "lamports_in": 25000000, "tokens_raw": 5000*1e6, "decimals": 6,
                      "entry_price": 0.001, "peak_value": 7.0, "last_value": 7.0, "entry_liquidity": 50000}
lc.holdings = []  # not held anymore
n_before = len(lb.trades)
lb._reconcile_live()
check("reconcile finalizes vanished position", tok2 not in lb.positions and len(lb.trades) == n_before + 1)

# mode switch drops live positions (no cross-contamination)
tok3 = "KEEPtoken111111111111111111111111111111111"
lb.positions[tok3] = {"token": tok3, "symbol": "KEEP", "mode": "live", "opened": time.time(),
                      "cost_usd": 5.0, "tokens_raw": None, "decimals": None, "entry_price": 0.001,
                      "peak_value": 5.0, "last_value": 5.0, "entry_liquidity": 50000, "lamports_in": 1}
lb.reconfigure({"mode": "paper", "api_key": "k", "settings": {}})
check("mode switch clears live positions", tok3 not in lb.positions)

# fresh stop event per start generation (no stale-thread resurrection)
e1 = lb._stop_evt
lb.config = {"mode": "paper", "api_key": "k", "settings": {}}
lb.client = lc
lb.start(); time.sleep(0.1); lb.stop()
e2 = lb._stop_evt
check("start() uses a fresh stop event", e1 is not e2 and e2.is_set())

print(f"\nResult: {PASS} passed, {FAIL} failed")
sys.exit(1 if FAIL else 0)

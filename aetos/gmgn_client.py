"""
AETOS · GMGN OpenAPI client
Faithful Python port of the official gmgn-cli OpenApiClient (v1.5.2).

Auth modes:
  exist  (market/token data): X-APIKEY + timestamp + client_id query params
  signed (swap/orders/holdings): exist + X-Signature (Ed25519 over
         "{sub_path}:{sorted_query}:{body}:{timestamp}")

The private key NEVER leaves this machine — it only signs messages locally.
"""

import json
import time
import uuid
import base64
import threading
import urllib.request
import urllib.error
from urllib.parse import quote

from cryptography.hazmat.primitives import serialization

HOST = "https://openapi.gmgn.ai"
USER_AGENT = "aetos/2.0"

# JS encodeURIComponent leaves these unescaped (RFC3986 unreserved + !*'())
_JS_SAFE = "-_.!~*'()"

SOL_MINT = "So11111111111111111111111111111111111111112"
USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"


class ApiError(Exception):
    def __init__(self, method, path, status, code=None, error=None, message=None, reset_at=None):
        self.method, self.path, self.status = method, path, status
        self.code, self.error, self.api_message = code, error, message
        self.reset_at = reset_at  # unix seconds, from x-ratelimit-reset
        super().__init__(f"{method} {path} failed: HTTP {status} code={code} error={error} message={message}")

    @property
    def is_rate_limit(self):
        return self.status == 429 or self.error in ("RATE_LIMIT_EXCEEDED", "RATE_LIMIT_BANNED", "ERROR_RATE_LIMIT_BLOCKED")


def js_encode(s):
    """Match JS encodeURIComponent exactly."""
    return quote(str(s), safe=_JS_SAFE)


def build_sorted_query(params):
    """Match signer.js buildMessage: keys sorted; array values sorted and repeated."""
    parts = []
    for k in sorted(params.keys()):
        ek = js_encode(k)
        v = params[k]
        if isinstance(v, (list, tuple)):
            for item in sorted(v, key=str):
                parts.append(f"{ek}={js_encode(item)}")
        else:
            parts.append(f"{ek}={js_encode(v)}")
    return "&".join(parts)


def build_message(sub_path, query, body_str, timestamp):
    return f"{sub_path}:{build_sorted_query(query)}:{body_str}:{timestamp}"


def json_compact(obj):
    """Match JSON.stringify: compact separators, keys in insertion order."""
    return json.dumps(obj, separators=(",", ":"), ensure_ascii=False)


class _Bucket:
    """Leaky bucket: rate=20/s, capacity=20 (mirrors GMGN's shared limiter)."""

    def __init__(self, rate=20.0, capacity=20.0):
        self.rate, self.capacity = rate, capacity
        self.tokens = capacity
        self.ts = time.monotonic()
        self.lock = threading.Lock()

    def take(self, weight):
        while True:
            with self.lock:
                now = time.monotonic()
                self.tokens = min(self.capacity, self.tokens + (now - self.ts) * self.rate)
                self.ts = now
                if self.tokens >= weight:
                    self.tokens -= weight
                    return
                need = (weight - self.tokens) / self.rate
            time.sleep(min(need, 1.0))


class GmgnClient:
    def __init__(self, api_key, private_key_pem=None, host=HOST, log=None):
        self.api_key = api_key
        self.host = host.rstrip("/")
        self.log = log or (lambda *_: None)
        self._bucket = _Bucket()
        self._banned_until = 0.0
        self._pk = None
        if private_key_pem:
            self._pk = serialization.load_pem_private_key(
                private_key_pem.encode() if isinstance(private_key_pem, str) else private_key_pem,
                password=None,
            )

    # ---------- low-level ----------

    def _sign(self, message):
        if self._pk is None:
            raise ApiError("SIGN", "-", 0, message="Private key required for this call (swap/orders/holdings)")
        sig = self._pk.sign(message.encode("utf-8"))  # Ed25519: raw bytes, no prehash
        return base64.b64encode(sig).decode()

    def _request(self, method, sub_path, query_extra, body=None, signed=False, weight=1, timeout=20):
        # honor an active ban window instead of digging the hole deeper
        now = time.time()
        if now < self._banned_until:
            raise ApiError(method, sub_path, 429, error="RATE_LIMIT_BANNED",
                           message=f"local cooldown until {int(self._banned_until)}", reset_at=int(self._banned_until))
        self._bucket.take(weight)

        ts = int(time.time())
        query = dict(query_extra or {})
        query["timestamp"] = ts
        query["client_id"] = str(uuid.uuid4())

        body_str = None
        headers = {
            "X-APIKEY": self.api_key,
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
        }
        if signed:
            body_str = json_compact(body) if body is not None else ""
            headers["X-Signature"] = self._sign(build_message(sub_path, query, body_str, ts))
            send_body = body_str if body_str else None
        else:
            send_body = json_compact(body) if body is not None else None

        qs = "&".join(f"{js_encode(k)}={js_encode(v)}" for k, v in query.items())
        url = f"{self.host}{sub_path}?{qs}"

        req = urllib.request.Request(url, method=method, headers=headers,
                                     data=send_body.encode("utf-8") if send_body else None)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as res:
                status = res.status
                text = res.read().decode("utf-8", "replace")
                reset_hdr = res.headers.get("x-ratelimit-reset")
        except urllib.error.HTTPError as e:
            status = e.code
            text = e.read().decode("utf-8", "replace") if e.fp else ""
            reset_hdr = e.headers.get("x-ratelimit-reset") if e.headers else None
        except Exception as e:
            raise ApiError(method, sub_path, 0, message=f"network: {e}")

        reset_at = None
        if reset_hdr:
            try:
                reset_at = int(reset_hdr)
            except ValueError:
                pass

        try:
            payload = json.loads(text)
        except Exception:
            raise ApiError(method, sub_path, status, message=f"non-JSON response: {text[:200]}", reset_at=reset_at)

        if payload.get("code") != 0:
            err = ApiError(method, sub_path, status, code=payload.get("code"),
                           error=payload.get("error"), message=payload.get("message"), reset_at=reset_at)
            if err.is_rate_limit:
                until = reset_at or (time.time() + 30)
                self._banned_until = max(self._banned_until, float(until))
                self.log("warn", f"rate limited on {sub_path}; cooling down until {int(until)}")
            raise err
        return payload.get("data")

    def _exist(self, method, sub_path, query, body=None, weight=1):
        return self._request(method, sub_path, query, body=body, signed=False, weight=weight)

    def _signed(self, method, sub_path, query, body, weight=1):
        return self._request(method, sub_path, query, body=body, signed=True, weight=weight)

    # ---------- data (exist auth) ----------

    def token_info(self, chain, address):
        return self._exist("GET", "/v1/token/info", {"chain": chain, "address": address})

    def token_security(self, chain, address):
        return self._exist("GET", "/v1/token/security", {"chain": chain, "address": address})

    def token_pool_info(self, chain, address):
        return self._exist("GET", "/v1/token/pool_info", {"chain": chain, "address": address})

    def token_top_holders(self, chain, address, **extra):
        return self._exist("GET", "/v1/market/token_top_holders", {"chain": chain, "address": address, **extra})

    def trending(self, chain, interval="1m", **extra):
        return self._exist("GET", "/v1/market/rank", {"chain": chain, "interval": interval, **extra})

    def quote(self, chain, from_address, input_token, output_token, input_amount, slippage):
        return self._exist("GET", "/v1/trade/quote", {
            "chain": chain, "from_address": from_address, "input_token": input_token,
            "output_token": output_token, "input_amount": str(input_amount), "slippage": slippage,
        }, weight=2)

    def user_info(self):
        return self._exist("GET", "/v1/user/info", {})

    def smart_money(self, chain=None, limit=None):
        q = {}
        if chain: q["chain"] = chain
        if limit is not None: q["limit"] = limit
        return self._exist("GET", "/v1/user/smartmoney", q)

    # ---------- trading (signed auth) ----------

    def swap(self, params):
        """POST /v1/trade/swap — params must already be in API shape."""
        return self._signed("POST", "/v1/trade/swap", {}, params, weight=5)

    def query_order(self, order_id, chain):
        return self._signed("GET", "/v1/trade/query_order", {"order_id": order_id, "chain": chain}, None)

    def wallet_holdings(self, chain, wallet_address, **extra):
        return self._signed("GET", "/v1/user/wallet_holdings",
                            {"chain": chain, "wallet_address": wallet_address, **extra}, None)

    def strategy_orders(self, chain, **extra):
        return self._signed("GET", "/v1/trade/strategy/orders", {"chain": chain, **extra}, None)

    def cancel_strategy_order(self, params):
        return self._signed("POST", "/v1/trade/strategy/cancel", {}, params)


# ---------- key management ----------

def generate_keypair(private_path):
    """Generate Ed25519 keypair; write private PEM to disk; return public PEM string."""
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    key = Ed25519PrivateKey.generate()
    priv_pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    )
    with open(private_path, "wb") as f:
        f.write(priv_pem)
    pub_pem = key.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    return pub_pem.decode()


def load_public_pem(private_path):
    with open(private_path, "rb") as f:
        key = serialization.load_pem_private_key(f.read(), password=None)
    return key.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()

"""
XTRADE — GMGN scalper · desktop app entry point.

Stability model (this file's whole job):
  - EVERY bridge method is wrapped: it can never raise across the JS bridge,
    never block forever (network test capped at 15s), always returns JSON.
  - Everything is logged to xtrade.log; hard crashes write crash.log.
  - A watchdog restarts the engine thread if it ever dies while "running".
  - Global socket timeout so no network call can hang the process.
"""

import json
import os
import socket
import sys
import threading
import time
import traceback
import webbrowser

BASE = os.path.dirname(os.path.abspath(__file__))
if BASE not in sys.path:
    sys.path.insert(0, BASE)

socket.setdefaulttimeout(15)  # nothing network-y may hang forever

from brain import Brain, DEFAULT_SETTINGS  # noqa: E402
import gmgn_client  # noqa: E402

CONFIG_PATH = os.path.join(BASE, "config.json")
PRIVKEY_PATH = os.path.join(BASE, "gmgn_private.pem")
LOG_PATH = os.path.join(BASE, "xtrade.log")
CRASH_PATH = os.path.join(BASE, "crash.log")

_log_lock = threading.Lock()


def flog(level, msg):
    """Append to xtrade.log (size-capped) — our black box recorder."""
    line = f"{time.strftime('%Y-%m-%d %H:%M:%S')} [{level}] {msg}\n"
    try:
        with _log_lock:
            try:
                if os.path.getsize(LOG_PATH) > 1_500_000:
                    with open(LOG_PATH, "r", encoding="utf-8", errors="replace") as f:
                        tail = f.read()[-400_000:]
                    with open(LOG_PATH, "w", encoding="utf-8") as f:
                        f.write(tail)
            except OSError:
                pass
            with open(LOG_PATH, "a", encoding="utf-8") as f:
                f.write(line)
    except Exception:
        pass
    try:
        print(line, end="")
    except Exception:
        pass


def crash(where, exc):
    detail = f"{time.strftime('%Y-%m-%d %H:%M:%S')} CRASH in {where}\n{''.join(traceback.format_exception(exc))}\n"
    try:
        with open(CRASH_PATH, "a", encoding="utf-8") as f:
            f.write(detail)
    except Exception:
        pass
    flog("crash", f"{where}: {exc}")


def load_config():
    cfg = {"mode": "live", "armed": False, "api_key": "", "wallet": "", "settings": {}}
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            cfg.update(json.load(f))
    except FileNotFoundError:
        pass
    except Exception as e:
        flog("warn", f"config load failed: {e}")
    cfg["mode"] = "live"      # live-only build
    cfg["armed"] = False      # ARM must be re-typed every session
    return cfg


def save_config(cfg):
    out = {k: v for k, v in cfg.items() if not k.startswith("_")}
    out["armed"] = False
    tmp = CONFIG_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
    os.replace(tmp, CONFIG_PATH)


def bridge(fn):
    """Every bridge method: never raises, always returns a JSON-able dict."""
    def wrapper(self, arg=None):
        try:
            return fn(self, arg)
        except Exception as e:
            crash(fn.__name__, e)
            return {"ok": False, "msg": f"{fn.__name__} error: {e}"}
    wrapper.__name__ = fn.__name__
    return wrapper


def run_with_timeout(fn, seconds):
    """Run fn() in a worker; (ok, result|error_str). Never blocks past `seconds`."""
    box = {}

    def worker():
        try:
            box["r"] = fn()
            box["ok"] = True
        except Exception as e:
            box["r"] = e
            box["ok"] = False

    t = threading.Thread(target=worker, daemon=True)
    t.start()
    t.join(seconds)
    if t.is_alive():
        return False, f"timed out after {seconds}s (network/firewall?)"
    if not box.get("ok"):
        e = box.get("r")
        detail = getattr(e, "api_message", None) or getattr(e, "error", None) or str(e)
        return False, str(detail)
    return True, box.get("r")


class Api:
    """Bridge exposed to the UI (pywebview js_api / http fallback)."""

    def __init__(self):
        self.config = load_config()
        self.brain = Brain(BASE, self.config, log_fn=flog)
        self.window = None
        self._watchdog = threading.Thread(target=self._watch, daemon=True)
        self._watchdog.start()
        flog("info", "XTRADE started")

    def _watch(self):
        """If the engine should be running but its thread died, resurrect it."""
        while True:
            time.sleep(10)
            try:
                b = self.brain
                if b.running and (b._thread is None or not b._thread.is_alive()):
                    flog("warn", "watchdog: engine thread died — restarting")
                    b.running = False
                    ok, msg = b.start()
                    flog("info", f"watchdog restart: {ok} {msg}")
            except Exception as e:
                crash("watchdog", e)

    # ---- state ----

    @bridge
    def get_state(self, _=None):
        snap = self.brain.snapshot()
        snap["has_api_key"] = bool(self.config.get("api_key"))
        snap["has_private_key"] = os.path.exists(PRIVKEY_PATH)
        snap["has_wallet"] = bool(self.config.get("wallet"))
        return snap

    # ---- engine ----

    @bridge
    def start(self, _=None):
        ok, msg = self.brain.start()
        return {"ok": ok, "msg": msg}

    @bridge
    def stop(self, _=None):
        self.brain.stop()
        return {"ok": True, "msg": "stopped"}

    @bridge
    def panic(self, _=None):
        # panic must not hang the UI either
        threading.Thread(target=self.brain.panic, daemon=True).start()
        return {"ok": True, "msg": "panic: selling all + stopping"}

    # ---- mode / arm ----

    @bridge
    def set_mode(self, arg=None):
        arg = arg or {}
        if arg.get("mode") != "live":
            return {"ok": False, "msg": "This build is live-only."}
        if (arg.get("confirm") or "").strip().upper() != "ARM":
            return {"ok": False, "msg": "Type ARM exactly to go live."}
        if not self.config.get("api_key"):
            return {"ok": False, "msg": "Connect first: API key missing."}
        if not os.path.exists(PRIVKEY_PATH):
            return {"ok": False, "msg": "Connect first: signing key missing."}
        if not self.config.get("wallet"):
            return {"ok": False, "msg": "Connect first: wallet address missing."}
        self.config["mode"] = "live"
        self.config["armed"] = True
        save_config(self.config)
        self.config["armed"] = True  # keep armed in-memory for this session
        self.brain.reconfigure(self.config)
        flog("info", "ARMED for live trading")
        return {"ok": True, "msg": "ARMED"}

    # ---- settings ----

    @bridge
    def save_settings(self, arg=None):
        arg = arg or {}
        clean = {}
        for k, v in arg.items():
            if k in DEFAULT_SETTINGS:
                try:
                    clean[k] = float(v)
                except (TypeError, ValueError):
                    continue
        if "trade_size_usd" in clean:
            clean["trade_size_usd"] = max(1.0, min(clean["trade_size_usd"], 100.0))
        if "max_positions" in clean:
            clean["max_positions"] = int(max(1, min(clean["max_positions"], 5)))
        if "stop_loss_pct" in clean:
            clean["stop_loss_pct"] = max(3.0, min(clean["stop_loss_pct"], 50.0))
        self.config.setdefault("settings", {}).update(clean)
        save_config(self.config)
        self.brain.reconfigure(self.config)
        return {"ok": True, "msg": "saved"}

    # ---- setup ----

    @bridge
    def keygen(self, _=None):
        if os.path.exists(PRIVKEY_PATH):
            pub = gmgn_client.load_public_pem(PRIVKEY_PATH)
            return {"ok": True, "public_pem": pub, "msg": "existing key reused"}
        pub = gmgn_client.generate_keypair(PRIVKEY_PATH)
        flog("info", "keypair generated")
        return {"ok": True, "public_pem": pub, "msg": "key generated"}

    @bridge
    def save_setup(self, arg=None):
        arg = arg or {}
        api_key = (arg.get("api_key") or "").strip()
        wallet = (arg.get("wallet") or "").strip()
        if api_key:
            self.config["api_key"] = api_key
        if wallet:
            if not (32 <= len(wallet) <= 44) or not wallet.isalnum():
                return {"ok": False, "msg": "That wallet address doesn't look like a Solana address."}
            self.config["wallet"] = wallet
        if not self.config.get("api_key"):
            return {"ok": False, "msg": "Paste your GMGN API key first."}
        save_config(self.config)
        self.brain.reconfigure(self.config)
        if not self.brain.client:
            return {"ok": False, "msg": "Client init failed — check xtrade.log"}

        # HARD 15s cap — this can never freeze the UI again
        ok, res = run_with_timeout(lambda: self.brain.client.user_info(), 15)
        if ok:
            flog("info", "GMGN connection test OK")
            return {"ok": True, "msg": "Connected to your GMGN ✓"}
        flog("warn", f"GMGN connection test failed: {res}")
        return {"ok": False, "msg": f"GMGN test failed: {res}"}

    # ---- window ----

    @bridge
    def minimize(self, _=None):
        if self.window:
            self.window.minimize()
        return {"ok": True}

    @bridge
    def quit(self, _=None):
        flog("info", "quit requested")

        def shutdown():
            try:
                self.brain.stop()
            except Exception as e:
                crash("quit.stop", e)
            try:
                if self.window:
                    self.window.destroy()
            except Exception:
                pass
            time.sleep(1.5)
            os._exit(0)  # guarantee the process actually ends

        threading.Thread(target=shutdown, daemon=True).start()
        return {"ok": True}


# ---------- browser fallback server ----------

def run_browser_mode(api):
    import secrets
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

    token = secrets.token_urlsafe(24)
    with open(os.path.join(BASE, "ui.html"), "r", encoding="utf-8") as f:
        html = f.read()
    html = html.replace("</head>", f"<script>window.__XTRADE_TOKEN='{token}';</script></head>", 1)
    html = html.replace(
        "{method:'POST', headers:{'Content-Type':'application/json'},",
        "{method:'POST', headers:{'Content-Type':'application/json','X-Xtrade-Token':window.__XTRADE_TOKEN||''},", 1)

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def _send(self, code, body, ctype="application/json"):
            data = body.encode("utf-8") if isinstance(body, str) else body
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            if self.path in ("/", "/index.html"):
                self._send(200, html, "text/html; charset=utf-8")
            else:
                self._send(404, "{}")

        def do_POST(self):
            if not self.path.startswith("/api/"):
                return self._send(404, "{}")
            if self.headers.get("X-Xtrade-Token") != token:
                return self._send(403, json.dumps({"ok": False, "msg": "forbidden"}))
            name = self.path[5:]
            if not hasattr(api, name) or name.startswith("_") or name in ("window", "config", "brain"):
                return self._send(404, json.dumps({"ok": False, "msg": "unknown"}))
            try:
                n = int(self.headers.get("Content-Length") or 0)
                payload = json.loads(self.rfile.read(n) or b"{}") if n else {}
                arg = payload.get("arg")
            except Exception:
                arg = None
            try:
                result = getattr(api, name)(arg)
            except Exception as e:
                crash(f"http.{name}", e)
                result = {"ok": False, "msg": str(e)}
            self._send(200, json.dumps(result))

    srv = ThreadingHTTPServer(("127.0.0.1", 8737), H)
    flog("info", "browser mode on http://127.0.0.1:8737")
    if not os.environ.get("XTRADE_NO_OPEN"):
        threading.Timer(0.8, lambda: webbrowser.open("http://127.0.0.1:8737")).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        api.quit()


def main():
    try:
        api = Api()
    except Exception as e:
        crash("startup", e)
        raise
    if "--browser" not in sys.argv:
        try:
            import webview  # pywebview
            with open(os.path.join(BASE, "ui.html"), "r", encoding="utf-8") as f:
                html = f.read()
            win = webview.create_window(
                "XTRADE", html=html,
                width=420, height=860,
                min_size=(380, 700),
                frameless=True, easy_drag=True,
                transparent=False, on_top=False,
                background_color="#0B0B0F",
                js_api=api,
            )
            api.window = win
            webview.start()
            flog("info", "window closed")
            api.brain.stop()
            return
        except Exception as e:
            crash("pywebview", e)
            flog("warn", "falling back to browser mode")
    run_browser_mode(api)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        crash("main", e)
        sys.exit(1)

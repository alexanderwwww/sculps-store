"""
AETOS — GMGN scalper · desktop app entry point.

Runs as a native frameless window shaped like an iPhone (pywebview / Edge WebView2).
Falls back to the default browser if pywebview is unavailable (--browser to force).

Safety model:
  - PAPER mode by default (simulated fills, real market data).
  - LIVE mode requires: trading-enabled API key, wallet address, typing ARM.
  - The Ed25519 private key is generated and stored ONLY on this computer.
"""

import json
import os
import sys
import threading
import webbrowser

BASE = os.path.dirname(os.path.abspath(__file__))
if BASE not in sys.path:
    sys.path.insert(0, BASE)

from brain import Brain, DEFAULT_SETTINGS  # noqa: E402
import gmgn_client  # noqa: E402

CONFIG_PATH = os.path.join(BASE, "config.json")
PRIVKEY_PATH = os.path.join(BASE, "gmgn_private.pem")


def resource(name):
    """Locate bundled resource (works from source and PyInstaller onefile)."""
    if hasattr(sys, "_MEIPASS"):
        p = os.path.join(sys._MEIPASS, name)
        if os.path.exists(p):
            return p
    return os.path.join(BASE, name)


def load_config():
    cfg = {"mode": "paper", "armed": False, "api_key": "", "wallet": "", "settings": {}}
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            cfg.update(json.load(f))
    except FileNotFoundError:
        pass
    except Exception as e:
        print(f"[aetos] config load failed: {e}")
    cfg["armed"] = False  # never persist armed across restarts
    return cfg


def save_config(cfg):
    out = {k: v for k, v in cfg.items() if not k.startswith("_")}
    out["armed"] = False  # ARM must be re-typed every session
    tmp = CONFIG_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
    os.replace(tmp, CONFIG_PATH)


class Api:
    """Bridge exposed to the UI (pywebview js_api / http fallback)."""

    def __init__(self):
        self.config = load_config()
        self.brain = Brain(BASE, self.config, log_fn=lambda lvl, msg: print(f"[{lvl}] {msg}"))
        self.window = None  # set by pywebview path

    # ---- state ----

    def get_state(self, _=None):
        snap = self.brain.snapshot()
        snap["has_api_key"] = bool(self.config.get("api_key"))
        snap["has_private_key"] = os.path.exists(PRIVKEY_PATH)
        snap["has_wallet"] = bool(self.config.get("wallet"))
        return snap

    # ---- engine ----

    def start(self, _=None):
        ok, msg = self.brain.start()
        return {"ok": ok, "msg": msg}

    def stop(self, _=None):
        self.brain.stop()
        return {"ok": True, "msg": "stopped"}

    def panic(self, _=None):
        self.brain.panic()
        return {"ok": True, "msg": "panic done"}

    # ---- mode ----

    def set_mode(self, arg=None):
        arg = arg or {}
        mode = arg.get("mode", "paper")
        if mode == "live":
            if arg.get("confirm") != "ARM":
                return {"ok": False, "msg": "Type ARM exactly to enable LIVE mode."}
            if not self.config.get("api_key"):
                return {"ok": False, "msg": "Setup first: API key missing."}
            if not os.path.exists(PRIVKEY_PATH):
                return {"ok": False, "msg": "Setup first: signing key missing."}
            if not self.config.get("wallet"):
                return {"ok": False, "msg": "Add your wallet address in Setup first."}
            was_running = self.brain.running
            if was_running:
                self.brain.stop()
            self.config["mode"] = "live"
            self.config["armed"] = True
            save_config(self.config)
            self.brain.reconfigure(self.config)
            return {"ok": True, "msg": "LIVE armed. Press START when ready."}
        # paper
        if self.brain.running:
            self.brain.stop()
        self.config["mode"] = "paper"
        self.config["armed"] = False
        save_config(self.config)
        self.brain.reconfigure(self.config)
        return {"ok": True, "msg": "PAPER mode."}

    # ---- settings ----

    def save_settings(self, arg=None):
        arg = arg or {}
        clean = {}
        for k, v in arg.items():
            if k in DEFAULT_SETTINGS:
                try:
                    clean[k] = float(v)
                except (TypeError, ValueError):
                    continue
        # sanity clamps
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

    def keygen(self, _=None):
        if os.path.exists(PRIVKEY_PATH):
            pub = gmgn_client.load_public_pem(PRIVKEY_PATH)
            return {"ok": True, "public_pem": pub, "msg": "existing key reused"}
        pub = gmgn_client.generate_keypair(PRIVKEY_PATH)
        return {"ok": True, "public_pem": pub, "msg": "key generated"}

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
        # test with a harmless read call
        try:
            self.brain.client.user_info()
            return {"ok": True, "msg": "Connected to GMGN. You're good — press START (paper mode)."}
        except Exception as e:
            detail = getattr(e, "api_message", None) or getattr(e, "error", None) or str(e)
            return {"ok": False, "msg": f"GMGN said: {detail}"}

    # ---- window ----

    def minimize(self, _=None):
        try:
            if self.window:
                self.window.minimize()
        except Exception:
            pass
        return {"ok": True}

    def quit(self, _=None):
        try:
            self.brain.stop()
        finally:
            if self.window:
                try:
                    self.window.destroy()
                except Exception:
                    pass
            else:
                os._exit(0)
        return {"ok": True}


# ---------- browser fallback server ----------

def run_browser_mode(api):
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

    with open(resource("ui.html"), "r", encoding="utf-8") as f:
        html = f.read()

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
            name = self.path[5:]
            if not hasattr(api, name) or name.startswith("_"):
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
                result = {"ok": False, "msg": str(e)}
            self._send(200, json.dumps(result))

    srv = ThreadingHTTPServer(("127.0.0.1", 8737), H)
    print("[aetos] browser mode: http://127.0.0.1:8737")
    threading.Timer(0.8, lambda: webbrowser.open("http://127.0.0.1:8737")).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        api.quit()


def main():
    api = Api()
    if "--browser" not in sys.argv:
        try:
            import webview  # pywebview
            with open(resource("ui.html"), "r", encoding="utf-8") as f:
                html = f.read()
            win = webview.create_window(
                "AETOS", html=html,
                width=430, height=880,
                frameless=True, easy_drag=False,
                transparent=True, on_top=False,
                background_color="#000000",
                js_api=api,
            )
            api.window = win
            webview.start()
            api.brain.stop()
            return
        except Exception as e:
            print(f"[aetos] native window unavailable ({e}); falling back to browser mode")
    run_browser_mode(api)


if __name__ == "__main__":
    main()

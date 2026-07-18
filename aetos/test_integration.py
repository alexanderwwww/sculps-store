"""
XTRADE integration test — boots the real app (browser mode, headless) and
exercises every bridge endpoint with a hard wall-clock budget per call.
Proves: no endpoint hangs, bad input never crashes, auth token enforced,
and a GMGN connection test against an unreachable/invalid key returns a
clean error within its 15s cap instead of freezing.

Run:  python test_integration.py
"""

import json
import os
import subprocess
import sys
import time
import urllib.request
import urllib.error

BASE = os.path.dirname(os.path.abspath(__file__))
URL = "http://127.0.0.1:8737"
PASS = FAIL = 0


def check(name, cond, extra=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  OK   {name}")
    else:
        FAIL += 1
        print(f"  FAIL {name} {extra}")


def call(name, arg=None, token=None, timeout=20):
    t0 = time.time()
    req = urllib.request.Request(
        f"{URL}/api/{name}", method="POST",
        headers={"Content-Type": "application/json", **({"X-Xtrade-Token": token} if token else {})},
        data=json.dumps({"arg": arg}).encode(),
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read()), time.time() - t0
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}"), time.time() - t0


def main():
    env = dict(os.environ, XTRADE_NO_OPEN="1")
    proc = subprocess.Popen([sys.executable, os.path.join(BASE, "aetos.py"), "--browser"],
                            env=env, cwd=BASE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        # wait for server + grab the injected token from the served page
        token = None
        for _ in range(40):
            time.sleep(0.25)
            try:
                with urllib.request.urlopen(URL, timeout=3) as r:
                    page = r.read().decode()
                marker = "__XTRADE_TOKEN='"
                token = page.split(marker, 1)[1].split("'", 1)[0]
                break
            except Exception:
                continue
        check("server boots + serves UI with session token", bool(token))
        if not token:
            return

        # auth enforced
        st, _, _ = call("get_state")
        check("bridge rejects calls without token (403)", st == 403)

        st, body, dt = call("get_state", token=token)
        check("get_state returns full snapshot fast", st == 200 and "daily" in body and dt < 3, f"dt={dt:.1f}")

        # start without setup must refuse cleanly, not crash
        st, body, dt = call("start", token=token)
        check("start without setup refuses cleanly", st == 200 and body.get("ok") is False, str(body)[:80])

        # garbage input never crashes any endpoint
        for name in ("set_mode", "save_settings", "save_setup", "panic", "stop"):
            st, body, dt = call(name, arg={"junk": ["x"] * 5, "mode": 123}, token=token)
            check(f"{name} survives garbage input", st == 200 and isinstance(body, dict) and dt < 18,
                  f"dt={dt:.1f} {str(body)[:60]}")

        # keygen produces a PEM
        st, body, _ = call("keygen", token=token)
        check("keygen returns PEM public key", body.get("ok") and "BEGIN PUBLIC KEY" in (body.get("public_pem") or ""))

        # save_setup with a fake key: must come back with a clean error <= 17s (the 15s cap)
        st, body, dt = call("save_setup", arg={"api_key": "gmgn_fake_key_123",
                                               "wallet": "So11111111111111111111111111111111111111112"},
                            token=token)
        check("connection test caps at 15s + clean error", st == 200 and body.get("ok") is False and dt < 18,
              f"dt={dt:.1f} msg={str(body.get('msg'))[:60]}")

        # ARM without valid connection parts still coherent
        st, body, _ = call("set_mode", arg={"mode": "live", "confirm": "ARM"}, token=token)
        check("ARM path returns coherent verdict", st == 200 and isinstance(body.get("ok"), bool))

        # state still healthy after all the abuse
        st, body, dt = call("get_state", token=token)
        check("state still healthy after abuse", st == 200 and "daily" in body and dt < 3)

        # log file exists (black box recorder working)
        check("xtrade.log written", os.path.exists(os.path.join(BASE, "xtrade.log")))
    finally:
        proc.terminate()
        try:
            proc.wait(5)
        except Exception:
            proc.kill()

    print(f"\nIntegration: {PASS} passed, {FAIL} failed")
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    main()

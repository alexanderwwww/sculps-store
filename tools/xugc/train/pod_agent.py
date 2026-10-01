#!/usr/bin/env python3
"""
The little server that runs on the rented GPU and does what XUGC asks, nothing else.

Python standard library only, so it starts the moment the pod boots.

  PUT  /in/<name>        save an input file (a video, a start image, a script). Big files arrive in
                         chunks: header X-Append: 0 starts the file, 1 adds to it, X-Final: 1 finishes it.
  POST /run              {"script": "train.sh" | "generate.sh", "env": {...}}  start a job
  GET  /status           {"running", "exit", "log"}   the last lines of the log
  GET  /out              {"files": [{"name", "size"}]}
  GET  /out/<name>       download a result (supports Range, so big files come in pieces)
  POST /stop             kill the job

Every request needs the X-Token header (a random token only XUGC knows).

THE DEADLINE: when MAX_MINUTES have passed since boot, this process deletes its own
pod through RunPod's API (RunPod gives every pod a RUNPOD_API_KEY and RUNPOD_POD_ID).
That is the last line of defence: it works even if the app on the Mac has crashed,
the laptop is shut, or the job is hung. Money cannot run past it.
"""
import http.server, json, os, pathlib, signal, subprocess, threading, time, urllib.request

ROOT = pathlib.Path(os.environ.get("AGENT_ROOT", "/workspace/job"))
PORT = int(os.environ.get("AGENT_PORT", "8000"))
IN, OUT, LOG = ROOT / "in", ROOT / "out", ROOT / "log.txt"
TOKEN = os.environ.get("AGENT_TOKEN", "")
MAX_MINUTES = float(os.environ.get("MAX_MINUTES", "120"))
BOOT = time.time()
STATE = {"proc": None, "exit": None, "script": None}
ALLOWED = {"train.sh", "generate.sh"}


def delete_self(reason):
    pod, key = os.environ.get("RUNPOD_POD_ID"), os.environ.get("RUNPOD_API_KEY")
    print(f"[agent] deleting this pod: {reason}", flush=True)
    if pod and key:
        try:
            req = urllib.request.Request(f"https://rest.runpod.io/v1/pods/{pod}", method="DELETE", headers={"Authorization": f"Bearer {key}"})
            urllib.request.urlopen(req, timeout=20).read()
        except Exception as e:  # nothing more can be done from in here
            print(f"[agent] delete failed: {e}", flush=True)
    os._exit(0)


def deadline_watch():
    tick = float(os.environ.get("AGENT_TICK", "15"))
    while True:
        time.sleep(tick)
        if time.time() - BOOT > MAX_MINUTES * 60:
            delete_self(f"deadline of {MAX_MINUTES} minutes reached")


def safe(name):
    name = os.path.basename(name)
    return name if name and not name.startswith(".") else None


class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def ok(self):
        if TOKEN and self.headers.get("X-Token") != TOKEN:
            self.send_response(401); self.end_headers(); return False
        return True

    def send_json(self, obj, code=200):
        b = json.dumps(obj).encode()
        self.send_response(code); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)

    def do_PUT(self):
        if not self.ok(): return
        parts = self.path.strip("/").split("/")
        name = safe(parts[-1]) if len(parts) == 2 and parts[0] == "in" else None
        if not name: return self.send_json({"error": "PUT /in/<name>"}, 400)
        n = int(self.headers.get("Content-Length", "0"))
        if n > 400_000_000: return self.send_json({"error": "chunk too large"}, 413)
        IN.mkdir(parents=True, exist_ok=True)
        tmp = IN / (name + ".part")
        append = self.headers.get("X-Append", "0") == "1"
        with open(tmp, "ab" if append else "wb") as f:
            left = n
            while left > 0:
                chunk = self.rfile.read(min(1 << 20, left))
                if not chunk: break
                f.write(chunk); left -= len(chunk)
        if left > 0:
            return self.send_json({"error": "short body"}, 400)
        if self.headers.get("X-Final", "1") == "1":
            os.replace(tmp, IN / name)
        self.send_json({"ok": True, "bytes": n, "size": (IN / name if (IN / name).exists() else tmp).stat().st_size})

    def do_GET(self):
        if not self.ok(): return
        if self.path == "/status":
            p = STATE["proc"]
            running = p is not None and p.poll() is None
            if p is not None and not running: STATE["exit"] = p.returncode
            tail = ""
            if LOG.exists(): tail = LOG.read_text(errors="replace")[-3000:]
            return self.send_json({"running": running, "exit": STATE["exit"], "script": STATE["script"], "log": tail, "minutes": round((time.time() - BOOT) / 60, 1)})
        parts = self.path.strip("/").split("/")
        if len(parts) == 2 and parts[0] == "out" and safe(parts[1]) and (OUT / safe(parts[1])).is_file():
            f = OUT / safe(parts[1]); size = f.stat().st_size
            start, end, code = 0, size - 1, 200
            rng = self.headers.get("Range")
            if rng and rng.startswith("bytes="):
                a, _, b = rng[6:].partition("-")
                start = int(a or 0); end = min(int(b), size - 1) if b else size - 1; code = 206
            if start > end or start >= size:
                self.send_response(416); self.end_headers(); return
            with open(f, "rb") as fh:
                fh.seek(start); data = fh.read(end - start + 1)
            self.send_response(code); self.send_header("Content-Length", str(len(data)))
            if code == 206: self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            self.end_headers(); self.wfile.write(data); return
        if self.path == "/out":
            return self.send_json({"files": [{"name": p.name, "size": p.stat().st_size} for p in sorted(OUT.glob("*")) if p.is_file()] if OUT.exists() else []})
        self.send_json({"error": "not found"}, 404)

    def do_POST(self):
        if not self.ok(): return
        n = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(n) or b"{}")
        if self.path == "/run":
            script = body.get("script")
            if script not in ALLOWED: return self.send_json({"error": "not an allowed script"}, 400)
            if STATE["proc"] is not None and STATE["proc"].poll() is None: return self.send_json({"error": "already running"}, 409)
            OUT.mkdir(parents=True, exist_ok=True)
            env = dict(os.environ); env.update({str(k): str(v) for k, v in (body.get("env") or {}).items()}); env["JOB_ROOT"] = str(ROOT)
            LOG.write_text("")
            f = open(LOG, "ab")
            STATE.update(proc=subprocess.Popen(["bash", str(IN / script)], stdout=f, stderr=subprocess.STDOUT, env=env, cwd=str(ROOT), start_new_session=True), exit=None, script=script)
            return self.send_json({"started": script})
        if self.path == "/stop":
            p = STATE["proc"]
            if p is not None and p.poll() is None: os.killpg(os.getpgid(p.pid), signal.SIGTERM)
            return self.send_json({"stopped": True})
        self.send_json({"error": "not found"}, 404)


if __name__ == "__main__":
    for d in (IN, OUT): d.mkdir(parents=True, exist_ok=True)
    threading.Thread(target=deadline_watch, daemon=True).start()
    print(f"[agent] up; deadline in {MAX_MINUTES} minutes", flush=True)
    http.server.ThreadingHTTPServer(("0.0.0.0", PORT), H).serve_forever()

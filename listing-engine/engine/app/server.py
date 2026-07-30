"""Local web app.

    python -m engine app

Serves a dashboard on 127.0.0.1 only. It is not exposed to the network and has
no auth, which is correct for a single-user local tool — but it means you should
not port-forward it or bind it elsewhere.

Everything the CLI does, with buttons: harvest photos, record the rights grant,
render locally with ffmpeg (free), build AI prompt packs, assemble the reel, and
preview the result in the page.
"""

from __future__ import annotations

import json
import mimetypes
import os
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from ..config import Config
from ..db import Store
from .jobs import Job, JobRunner

UI_HTML = Path(__file__).parent / "ui.html"


class AppState:
    """Shared server state. One Store per thread — sqlite can't cross threads."""

    def __init__(self, cfg: Config, inbox: Path, out: Path, packs: Path):
        self.cfg = cfg
        self.inbox = inbox
        self.out = out
        self.packs = packs
        for d in (inbox, out, packs):
            d.mkdir(parents=True, exist_ok=True)
        self.jobs = JobRunner(workers=2)
        self._local = threading.local()

    def store(self) -> Store:
        if getattr(self._local, "store", None) is None:
            self._local.store = Store(self.cfg.db_path)
        return self._local.store

    # --- reads ---------------------------------------------------------------

    def properties(self) -> list[dict]:
        store = self.store()
        rows = []
        for d in sorted(p for p in self.inbox.iterdir() if p.is_dir()):
            photos = [f for f in d.iterdir()
                      if f.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}]
            grant = store.get_grant(d.name)
            rights = (d / "RIGHTS.txt")
            reels = sorted(self.out.glob(f"{d.name}_*.mp4"))
            rows.append({
                "name": d.name,
                "photos": len(photos),
                "has_grant": bool(grant),
                "grant_by": (grant or {}).get("supplied_by", ""),
                "spec_only": rights.exists() and "SPEC_ONLY" in rights.read_text(),
                "reels": [r.name for r in reels],
                "pack": (self.packs / d.name / "prompts.txt").exists(),
            })
        return rows

    def summary(self) -> dict:
        store = self.store()
        return {
            "leads": store.counts_by_stage(),
            "sends_today": store.sends_today(),
            "manual_today": store.manual_touches_today(),
            "active_jobs": self.jobs.active(),
        }


# --- job bodies ---------------------------------------------------------------

def _job_harvest(state: AppState, url: str, name: str):
    def run(job: Job):
        from ..sources.site_photos import SitePhotoHarvester
        h = SitePhotoHarvester(contact_url=state.cfg.sender.reply_to
                               or "mailto:unknown", max_images=12)
        res = h.harvest(url, state.inbox / name)
        return {"saved": len(res.saved), "skipped": len(res.skipped)}
    return run


def _job_render(state: AppState, name: str):
    def run(job: Job):
        from ..produce.assemble import ReelSettings, assemble_reel
        from ..produce.intake import build_job, load_grant
        from ..produce.motion import RenderSettings, render_shots

        grant = load_grant(state.store(), name)
        p = state.cfg.produce
        j = build_job(grant=grant, property_ref=name, client=name,
                      photo_dir=state.inbox / name, aspect=p.aspect,
                      shot_seconds=p.shot_seconds)
        rs = RenderSettings(aspect=j.aspect, width=p.width, fps=p.fps)
        clips = render_shots(j.shots, state.cfg.work_dir / name, rs)
        ow, oh = rs.out_size
        reel = assemble_reel(
            clips, state.out / f"{name}_{j.aspect.replace(':', 'x')}.mp4",
            shots=j.shots,
            settings=ReelSettings(width=ow, height=oh, fps=p.fps,
                                  crossfade=p.crossfade_seconds, font=p.font),
        )
        return {"reel": reel.name}
    return run


def _job_pack(state: AppState, name: str):
    def run(job: Job):
        from ..produce.i2v import pack_property
        from ..produce.intake import find_photos
        photos = find_photos(state.inbox / name)[:6]
        out = pack_property(photos, state.packs / name,
                            aspect=state.cfg.produce.aspect)
        return {"pack": str(out.name), "prompts": len(photos)}
    return run


# --- HTTP ---------------------------------------------------------------------

class Handler(BaseHTTPRequestHandler):
    state: AppState  # injected

    server_version = "ListingEngine"

    def log_message(self, fmt, *args):  # quieter console
        pass

    # -- helpers --
    def _json(self, obj, code: int = 200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if not length:
            return {}
        try:
            return json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            return {}

    def _safe_media(self, rel: str) -> Path | None:
        """Resolve a media path, refusing anything outside the output dir."""
        root = self.state.out.resolve()
        candidate = (root / unquote(rel)).resolve()
        try:
            candidate.relative_to(root)
        except ValueError:
            return None
        return candidate if candidate.is_file() else None

    # -- routes --
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/":
            html = UI_HTML.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(html)))
            self.end_headers()
            self.wfile.write(html)
            return

        if path == "/api/state":
            return self._json({
                "summary": self.state.summary(),
                "properties": self.state.properties(),
                "jobs": self.state.jobs.recent(),
                "config": {
                    "aspect": self.state.cfg.produce.aspect,
                    "inbox": str(self.state.inbox),
                    "out": str(self.state.out),
                },
            })

        if path.startswith("/media/"):
            target = self._safe_media(path[len("/media/"):])
            if not target:
                return self._json({"error": "not found"}, 404)
            ctype = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
            data = target.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Accept-Ranges", "none")
            self.end_headers()
            self.wfile.write(data)
            return

        if path.startswith("/api/pack/"):
            name = unquote(path[len("/api/pack/"):])
            f = self.state.packs / name / "prompts.txt"
            if not f.exists():
                return self._json({"error": "no pack"}, 404)
            return self._json({"text": f.read_text()})

        return self._json({"error": "not found"}, 404)

    def do_POST(self):
        path = urlparse(self.path).path
        body = self._read_json()
        st = self.state

        if path == "/api/harvest":
            url = (body.get("url") or "").strip()
            name = (body.get("name") or "").strip()
            if not url:
                return self._json({"error": "url required"}, 400)
            if not name:
                name = urlparse(url).netloc.replace(".", "-") or "site"
            name = _safe_name(name)
            job = st.jobs.submit("harvest", name, _job_harvest(st, url, name))
            return self._json(job.as_dict())

        if path == "/api/grant":
            name = _safe_name((body.get("name") or "").strip())
            note = (body.get("note") or "").strip()
            by = (body.get("supplied_by") or "").strip()
            if not (name and note and by):
                return self._json(
                    {"error": "name, supplied_by and note are all required — "
                              "the note is the evidence of rights"}, 400)
            from ..produce.intake import record_grant
            try:
                record_grant(st.store(), property_ref=name, supplied_by=by,
                             supplied_via=body.get("via") or "web",
                             confirmation_note=note,
                             portfolio_permission=bool(body.get("portfolio_ok")))
            except Exception as exc:
                return self._json({"error": str(exc)}, 400)
            return self._json({"ok": True})

        if path == "/api/render":
            name = _safe_name((body.get("name") or "").strip())
            job = st.jobs.submit("render", name, _job_render(st, name))
            return self._json(job.as_dict())

        if path == "/api/pack":
            name = _safe_name((body.get("name") or "").strip())
            job = st.jobs.submit("pack", name, _job_pack(st, name))
            return self._json(job.as_dict())

        return self._json({"error": "not found"}, 404)


def _safe_name(name: str) -> str:
    """Property refs become folder names — keep them boring."""
    cleaned = "".join(c for c in name if c.isalnum() or c in "-_ ").strip()
    return cleaned.replace(" ", "-")[:80] or "untitled"


def serve(cfg: Config, *, inbox: Path, out: Path, packs: Path,
          port: int = 8765, open_browser: bool = True) -> None:
    state = AppState(cfg, inbox, out, packs)
    handler = type("BoundHandler", (Handler,), {"state": state})
    # Loopback only. This app has no auth by design.
    httpd = ThreadingHTTPServer(("127.0.0.1", port), handler)
    url = f"http://127.0.0.1:{port}/"
    print(f"Listing Engine running at {url}")
    print("  inbox:  ", inbox)
    print("  output: ", out)
    print("Ctrl-C to stop.")
    if open_browser and not os.environ.get("LISTING_ENGINE_NO_BROWSER"):
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nstopping…")
    finally:
        state.jobs.shutdown()
        httpd.server_close()

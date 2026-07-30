"""Local web app: routes, path-traversal guard, and the rights gate in the UI."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from engine.app.jobs import JobRunner
from engine.app.server import AppState, Handler, _safe_name
from engine.config import Config, ProduceSettings, SenderIdentity
from engine.produce.ffmpeg import ffmpeg_bin


def make_cfg(tmp: Path) -> Config:
    cfg = Config(sender=SenderIdentity(
        "Alex", "a@b.com", "a@b.com",
        "Sculps Media LLC, 447 Broadway 2FL, New York, NY 10013"))
    cfg.db_path = tmp / "engine.db"
    cfg.work_dir = tmp / "work"
    cfg.produce = ProduceSettings(width=360, fps=24, shot_seconds=1.2,
                                  crossfade_seconds=0.3)
    return cfg


def make_photo(path: Path, size: str = "1600x1200") -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([ffmpeg_bin(), "-hide_banner", "-loglevel", "error", "-y",
                    "-f", "lavfi", "-i", f"testsrc2=size={size}",
                    "-frames:v", "1", str(path)], check=True)
    return path


class JobRunnerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.r = JobRunner(workers=2)

    def tearDown(self) -> None:
        self.r.shutdown()

    def test_successful_job_records_result(self):
        job = self.r.submit("t", "ok", lambda j: {"n": 1})
        self._wait(job.id)
        self.assertEqual(self.r.get(job.id).status, "done")
        self.assertEqual(self.r.get(job.id).result, {"n": 1})

    def test_failing_job_surfaces_the_message(self):
        def boom(j):
            raise ValueError("no photo-rights grant on file")
        job = self.r.submit("t", "bad", boom)
        self._wait(job.id)
        got = self.r.get(job.id)
        self.assertEqual(got.status, "error")
        self.assertIn("grant", got.error)

    def test_recent_is_newest_first(self):
        a = self.r.submit("t", "a", lambda j: 1)
        b = self.r.submit("t", "b", lambda j: 2)
        self._wait(a.id); self._wait(b.id)
        self.assertEqual(self.r.recent()[0]["label"], "b")

    def _wait(self, job_id: str, timeout: float = 5.0):
        import time
        end = time.time() + timeout
        while time.time() < end:
            j = self.r.get(job_id)
            if j and j.status in ("done", "error"):
                return
            time.sleep(0.02)
        self.fail("job did not finish")


class SafeNameTests(unittest.TestCase):
    def test_path_separators_stripped(self):
        self.assertNotIn("/", _safe_name("../../etc/passwd"))
        self.assertNotIn("..", _safe_name("../../etc"))

    def test_spaces_become_hyphens(self):
        self.assertEqual(_safe_name("Nashville 2BR Loft"), "Nashville-2BR-Loft")

    def test_empty_falls_back(self):
        self.assertEqual(_safe_name("///"), "untitled")


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.tmp = tempfile.TemporaryDirectory()
        d = Path(cls.tmp.name)
        cls.cfg = make_cfg(d)
        cls.state = AppState(cls.cfg, d / "inbox", d / "out", d / "packs")
        make_photo(d / "inbox" / "nash-loft" / "a.jpg")
        make_photo(d / "inbox" / "nash-loft" / "b.jpg")
        # Separate property for the grant test, so tests don't leak state into
        # each other via execution order.
        make_photo(d / "inbox" / "austin-loft" / "a.jpg")
        (d / "out" / "nash-loft_9x16.mp4").write_bytes(b"\x00\x00fake")
        # A file outside the media root, for the traversal test.
        (d / "secret.txt").write_text("do not serve me")

        handler = type("H", (Handler,), {"state": cls.state})
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        cls.port = cls.httpd.server_address[1]
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.httpd.shutdown()
        cls.state.jobs.shutdown()
        cls.httpd.server_close()
        cls.tmp.cleanup()

    def url(self, path: str) -> str:
        return f"http://127.0.0.1:{self.port}{path}"

    def get(self, path: str):
        with urllib.request.urlopen(self.url(path), timeout=5) as r:
            return r.status, r.read()

    def post(self, path: str, body: dict):
        req = urllib.request.Request(
            self.url(path), data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json"}, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    # --- routes ---

    def test_index_serves_ui(self):
        status, body = self.get("/")
        self.assertEqual(status, 200)
        self.assertIn(b"Listing Engine", body)

    def test_ui_has_no_external_requests(self):
        """The app must work offline — no CDN scripts or fonts."""
        _, body = self.get("/")
        text = body.decode()
        for bad in ("https://cdn", "http://cdn", "googleapis", "unpkg", "jsdelivr"):
            self.assertNotIn(bad, text)

    def test_state_lists_properties(self):
        status, body = self.get("/api/state")
        self.assertEqual(status, 200)
        data = json.loads(body)
        names = [p["name"] for p in data["properties"]]
        self.assertIn("nash-loft", names)
        prop = next(p for p in data["properties"] if p["name"] == "nash-loft")
        self.assertEqual(prop["photos"], 2)

    def test_media_served(self):
        status, body = self.get("/media/nash-loft_9x16.mp4")
        self.assertEqual(status, 200)
        self.assertEqual(body, b"\x00\x00fake")

    def test_media_path_traversal_refused(self):
        for attack in ("/media/../secret.txt", "/media/..%2Fsecret.txt",
                       "/media/%2e%2e%2fsecret.txt"):
            with self.subTest(attack=attack):
                try:
                    status, body = self.get(attack)
                except urllib.error.HTTPError as e:
                    status, body = e.code, e.read()
                self.assertNotIn(b"do not serve me", body)

    def test_grant_requires_evidence(self):
        status, body = self.post("/api/grant", {"name": "austin-loft"})
        self.assertEqual(status, 400)
        self.assertIn("note", body["error"])

    def test_grant_recorded_then_property_shows_granted(self):
        _, before = self.get("/api/state")
        prop = next(p for p in json.loads(before)["properties"]
                    if p["name"] == "austin-loft")
        self.assertFalse(prop["has_grant"])

        status, body = self.post("/api/grant", {
            "name": "austin-loft", "supplied_by": "host@example.com",
            "note": "I own the rights to these photos."})
        self.assertEqual(status, 200)
        _, after = self.get("/api/state")
        prop = next(p for p in json.loads(after)["properties"]
                    if p["name"] == "austin-loft")
        self.assertTrue(prop["has_grant"])

    def test_harvest_requires_url(self):
        status, body = self.post("/api/harvest", {})
        self.assertEqual(status, 400)

    def test_harvest_of_blocked_platform_fails_the_job(self):
        status, body = self.post("/api/harvest",
                                 {"url": "https://www.airbnb.com/rooms/1",
                                  "name": "nope"})
        self.assertEqual(status, 200)  # job accepted...
        import time
        end = time.time() + 5
        while time.time() < end:
            job = self.state.jobs.get(body["id"])
            if job and job.status in ("done", "error"):
                break
            time.sleep(0.05)
        job = self.state.jobs.get(body["id"])
        self.assertEqual(job.status, "error")  # ...then refuses
        self.assertIn("airbnb.com", job.error.lower())

    def test_unknown_route_404(self):
        try:
            status, _ = self.get("/api/nope")
        except urllib.error.HTTPError as e:
            status = e.code
        self.assertEqual(status, 404)


if __name__ == "__main__":
    unittest.main(verbosity=2)

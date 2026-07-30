"""Production pipeline: truthfulness refusals, real render, real assembly."""

from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from engine.db import Store
from engine.models import Shot
from engine.produce.assemble import ReelSettings, TextRenderUnavailable, assemble_reel
from engine.produce.ffmpeg import ffmpeg_bin, has_filter, image_size
from engine.produce.intake import build_job, record_grant
from engine.produce.motion import (
    REFUSED_MOVES,
    FabricationRefused,
    RenderSettings,
    render_shot,
    render_shots,
    suggest_moves,
)


# Some ffmpeg builds (notably the imageio-ffmpeg fallback binary) ship without
# drawtext. Text behaviour differs by build, so the tests assert both paths.
HAS_DRAWTEXT = has_filter("drawtext")


def make_photo(path: Path, size: str = "2400x1600") -> Path:
    """Synthesise a stand-in photograph."""
    path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [ffmpeg_bin(), "-hide_banner", "-loglevel", "error", "-y",
         "-f", "lavfi", "-i", f"testsrc2=size={size}", "-frames:v", "1", str(path)],
        check=True,
    )
    return path


def duration(path: Path) -> float:
    out = subprocess.run([ffmpeg_bin(), "-hide_banner", "-i", str(path)],
                         capture_output=True, text=True).stderr
    import re
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", out)
    assert m, out
    return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))


def dimensions(path: Path) -> tuple[int, int]:
    out = subprocess.run([ffmpeg_bin(), "-hide_banner", "-i", str(path)],
                         capture_output=True, text=True).stderr
    import re
    m = re.search(r"Video:.*?,\s*(\d{2,5})x(\d{2,5})", out)
    assert m, out
    return int(m.group(1)), int(m.group(2))


class TruthfulnessTests(unittest.TestCase):
    """Moves that would fabricate geometry must be refused, not degraded."""

    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.d = Path(self.tmp.name)
        self.photo = make_photo(self.d / "room.jpg")

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_all_refused_moves_raise(self):
        for move in REFUSED_MOVES:
            with self.subTest(move=move), self.assertRaises(FabricationRefused):
                render_shot(Shot(source_image=str(self.photo), move=move),
                            self.d / "x.mp4")

    def test_unknown_move_raises_value_error(self):
        with self.assertRaises(ValueError):
            render_shot(Shot(source_image=str(self.photo), move="jazz_hands"),
                        self.d / "x.mp4")

    def test_refusal_happens_before_any_output_written(self):
        out = self.d / "nope.mp4"
        with self.assertRaises(FabricationRefused):
            render_shot(Shot(source_image=str(self.photo), move="walkthrough"), out)
        self.assertFalse(out.exists())


class RenderTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.d = Path(self.tmp.name)
        self.photo = make_photo(self.d / "room.jpg")

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_renders_correct_aspect_and_duration(self):
        st = RenderSettings(aspect="9:16", width=720, fps=24)
        out = render_shot(
            Shot(source_image=str(self.photo), move="push_in", seconds=2.0),
            self.d / "s.mp4", st)
        self.assertTrue(out.exists())
        self.assertEqual(dimensions(out), (720, 1280))
        self.assertAlmostEqual(duration(out), 2.0, delta=0.15)

    def test_all_allowed_moves_render(self):
        st = RenderSettings(aspect="4:5", width=540, fps=24)
        from engine.produce.motion import MOVES
        for move in MOVES:
            with self.subTest(move=move):
                out = render_shot(
                    Shot(source_image=str(self.photo), move=move, seconds=1.0),
                    self.d / f"{move}.mp4", st)
                self.assertTrue(out.exists() and out.stat().st_size > 1000)

    def test_motion_actually_moves(self):
        """A push-in must change the frame; otherwise it's a still, not a shot."""
        st = RenderSettings(aspect="9:16", width=540, fps=24)
        clip = render_shot(
            Shot(source_image=str(self.photo), move="push_in", seconds=2.0),
            self.d / "m.mp4", st)
        first, last = self.d / "f0.png", self.d / "f1.png"
        for path, sel in ((first, "eq(n\\,0)"), (last, "eq(n\\,45)")):
            subprocess.run(
                [ffmpeg_bin(), "-hide_banner", "-loglevel", "error", "-y",
                 "-i", str(clip), "-vf", f"select='{sel}'", "-vsync", "0",
                 "-frames:v", "1", str(path)], check=True)
        self.assertNotEqual(first.read_bytes(), last.read_bytes())

    def test_missing_source_raises(self):
        with self.assertRaises(FileNotFoundError):
            render_shot(Shot(source_image=str(self.d / "ghost.jpg")), self.d / "x.mp4")

    def test_suggest_moves_varies(self):
        moves = suggest_moves(5)
        self.assertEqual(len(moves), 5)
        self.assertGreater(len(set(moves)), 2, "shot list should not be repetitive")

    def test_portrait_source_still_yields_correct_output_aspect(self):
        tall = make_photo(self.d / "tall.jpg", size="1200x2400")
        st = RenderSettings(aspect="9:16", width=540, fps=24)
        out = render_shot(Shot(source_image=str(tall), move="tilt_down", seconds=1.0),
                          self.d / "t.mp4", st)
        self.assertEqual(dimensions(out), (540, 960))


class AssembleTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.d = Path(self.tmp.name)
        self.photos = [make_photo(self.d / f"p{i}.jpg") for i in range(3)]
        self.st = RenderSettings(aspect="9:16", width=540, fps=24)
        self.shots = [
            Shot(source_image=str(p), move=m, seconds=2.0)
            for p, m in zip(self.photos, suggest_moves(3))
        ]
        self.clips = render_shots(self.shots, self.d / "clips", self.st)

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_assembles_with_expected_length(self):
        rs = ReelSettings(width=540, height=960, fps=24, crossfade=0.5)
        out = assemble_reel(self.clips, self.d / "reel.mp4",
                            shots=self.shots, settings=rs)
        self.assertTrue(out.exists())
        # 3 clips x 2.0s, overlapping twice by 0.5s => 5.0s
        self.assertAlmostEqual(duration(out), 5.0, delta=0.25)
        self.assertEqual(dimensions(out), (540, 960))

    def test_end_card(self):
        rs = ReelSettings(width=540, height=960, fps=24, crossfade=0.5)
        if HAS_DRAWTEXT:
            out = assemble_reel(self.clips, self.d / "reel_ec.mp4", shots=self.shots,
                                settings=rs, end_card="Book direct")
            self.assertTrue(out.exists() and out.stat().st_size > 5000)
        else:
            # Explicitly requested text must fail loudly, not vanish.
            with self.assertRaises(TextRenderUnavailable):
                assemble_reel(self.clips, self.d / "reel_ec.mp4", shots=self.shots,
                              settings=rs, end_card="Book direct")

    def test_staged_shot_disclosure_is_mandatory(self):
        """Staged shots either carry the label or don't ship at all."""
        shots = list(self.shots)
        shots[1] = Shot(source_image=shots[1].source_image, move=shots[1].move,
                        seconds=2.0, virtually_staged=True)
        rs = ReelSettings(width=540, height=960, fps=24, crossfade=0.5)
        out_path = self.d / "staged.mp4"
        if HAS_DRAWTEXT:
            out = assemble_reel(self.clips, out_path, shots=shots, settings=rs)
            self.assertTrue(out.exists() and out.stat().st_size > 5000)
        else:
            with self.assertRaises(TextRenderUnavailable):
                assemble_reel(self.clips, out_path, shots=shots, settings=rs)
            self.assertFalse(out_path.exists(),
                             "must not ship a staged shot without its disclosure")

    def test_cosmetic_caption_degrades_instead_of_failing(self):
        """A plain label is cosmetic — it may be dropped, but must not break the render."""
        shots = [Shot(source_image=s.source_image, move=s.move, seconds=2.0,
                      label="Living room") for s in self.shots]
        rs = ReelSettings(width=540, height=960, fps=24, crossfade=0.5)
        out = assemble_reel(self.clips, self.d / "labels.mp4", shots=shots,
                            settings=rs)
        self.assertTrue(out.exists() and out.stat().st_size > 5000)

    def test_crossfade_longer_than_shot_is_rejected(self):
        rs = ReelSettings(width=540, height=960, fps=24, crossfade=5.0)
        with self.assertRaises(ValueError):
            assemble_reel(self.clips, self.d / "bad.mp4", shots=self.shots, settings=rs)

    def test_empty_clip_list_rejected(self):
        with self.assertRaises(ValueError):
            assemble_reel([], self.d / "bad.mp4")


class GrantTests(unittest.TestCase):
    """No deliverable without a recorded rights grant."""

    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.d = Path(self.tmp.name)
        self.store = Store(self.d / "t.db")
        self.photo_dir = self.d / "inbox" / "nashville-2br"
        make_photo(self.photo_dir / "a.jpg")
        make_photo(self.photo_dir / "b.jpg")

    def tearDown(self) -> None:
        self.store.close()
        self.tmp.cleanup()

    def test_build_job_without_grant_refuses(self):
        with self.assertRaises(ValueError) as ctx:
            build_job(self.store, property_ref="nashville-2br",
                      client="Acme", photo_dir=self.photo_dir)
        self.assertIn("grant", str(ctx.exception).lower())

    def test_build_job_with_grant_succeeds(self):
        record_grant(self.store, property_ref="nashville-2br",
                     supplied_by="host@example.com", supplied_via="email",
                     confirmation_note="I own the rights to these photos.")
        job = build_job(self.store, property_ref="nashville-2br",
                        client="Acme", photo_dir=self.photo_dir)
        self.assertEqual(len(job.shots), 2)
        job.validate()

    def test_empty_confirmation_note_refused(self):
        with self.assertRaises(ValueError):
            record_grant(self.store, property_ref="x", supplied_by="a@b.com",
                         supplied_via="email", confirmation_note="   ")

    def test_batch_skips_properties_without_grant(self):
        from engine.config import Config, ProduceSettings, SenderIdentity
        from engine.produce.batch import run_batch

        cfg = Config(sender=SenderIdentity("A", "a@b.com", "a@b.com", "x" * 20))
        cfg.produce = ProduceSettings(width=540, fps=24, shot_seconds=1.5)
        cfg.work_dir = self.d / "work"
        res = run_batch(self.store, cfg, self.d / "inbox", self.d / "out")
        self.assertEqual(len(res.produced), 0)
        self.assertEqual(len(res.skipped), 1)
        self.assertIn("grant", res.skipped[0][1])

    def test_batch_produces_when_granted(self):
        from engine.config import Config, ProduceSettings, SenderIdentity
        from engine.produce.batch import run_batch

        record_grant(self.store, property_ref="nashville-2br",
                     supplied_by="host@example.com", supplied_via="email",
                     confirmation_note="Rights confirmed by host.")
        cfg = Config(sender=SenderIdentity("A", "a@b.com", "a@b.com", "x" * 20))
        cfg.produce = ProduceSettings(width=540, fps=24, shot_seconds=1.5,
                                      crossfade_seconds=0.4)
        cfg.work_dir = self.d / "work"
        res = run_batch(self.store, cfg, self.d / "inbox", self.d / "out")
        self.assertEqual(res.failed, [])
        self.assertEqual(len(res.produced), 1)
        self.assertTrue(Path(res.produced[0]).exists())


class SourceGuardTests(unittest.TestCase):
    def test_blocked_platforms_refused(self):
        from engine.sources.base import BlockedSourceError, assert_source_allowed
        for url in ("https://www.airbnb.com/s/homes",
                    "https://api.vrbo.com/listings",
                    "https://booking.com/x"):
            with self.subTest(url=url), self.assertRaises(BlockedSourceError):
                assert_source_allowed(url)

    def test_permitted_source_allowed(self):
        from engine.sources.base import assert_source_allowed
        assert_source_allowed("https://data.nashville.gov/resource/abcd-1234.json")


if __name__ == "__main__":
    unittest.main(verbosity=2)

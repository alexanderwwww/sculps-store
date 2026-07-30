"""Manual outreach queue: caps, no-follow-up rule, and that it never sends."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from engine.db import Store
from engine.outreach.manual import (
    AIRBNB_TEMPLATES,
    ManualOutreachError,
    ManualQueue,
    bridge_note,
)


class ManualQueueTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.tmp.name) / "t.db")
        self.q = ManualQueue(self.store, max_per_day=3)

    def tearDown(self) -> None:
        self.store.close()
        self.tmp.cleanup()

    def test_builds_queue_within_daily_cap(self):
        handles = [(f"https://example.com/rooms/{i}", f"L{i}") for i in range(10)]
        items = self.q.build(handles)
        self.assertEqual(len(items), 3)

    def test_second_message_to_same_handle_refused(self):
        h = "https://example.com/rooms/1"
        self.q.mark_sent(h)
        with self.assertRaises(ManualOutreachError) as ctx:
            self.q.check(h)
        self.assertIn("already contacted", str(ctx.exception))

    def test_already_contacted_handles_dropped_from_queue(self):
        h = "https://example.com/rooms/1"
        self.q.mark_sent(h)
        items = self.q.build([(h, "one"), ("https://example.com/rooms/2", "two")])
        self.assertEqual([i.handle for i in items], ["https://example.com/rooms/2"])

    def test_daily_cap_blocks_further_sends(self):
        for i in range(3):
            self.q.mark_sent(f"https://example.com/rooms/{i}")
        self.assertEqual(self.q.remaining_today(), 0)
        with self.assertRaises(ManualOutreachError) as ctx:
            self.q.check("https://example.com/rooms/99")
        self.assertIn("daily cap", str(ctx.exception))

    def test_queue_empty_once_cap_used(self):
        for i in range(3):
            self.q.mark_sent(f"https://example.com/rooms/{i}")
        self.assertEqual(self.q.build([("https://example.com/rooms/50", "")]), [])

    def test_message_text_varies_across_session(self):
        handles = [(f"https://example.com/rooms/{i}", "") for i in range(3)]
        q = ManualQueue(self.store, max_per_day=10)
        msgs = [i.message for i in q.build(handles)]
        self.assertGreater(len(set(msgs)), 1, "identical text at volume reads as a bot")

    def test_templates_contain_no_links(self):
        """Links in Airbnb messages are a specifically named policy violation."""
        for t in AIRBNB_TEMPLATES:
            with self.subTest(t=t[:30]):
                self.assertNotIn("http", t.lower())
                self.assertNotIn("www.", t.lower())
                self.assertNotIn(".com", t.lower())

    def test_templates_are_short(self):
        for t in AIRBNB_TEMPLATES:
            with self.subTest(t=t[:30]):
                self.assertLess(len(t.split()), 70, "too long for a booking inbox")

    def test_module_has_no_transport(self):
        """The manual path must be structurally incapable of sending."""
        import inspect

        from engine.outreach import manual
        src = inspect.getsource(manual)
        for forbidden in ("requests.", "smtplib", "urllib.request",
                          "webdriver", "playwright", "def send("):
            with self.subTest(forbidden=forbidden):
                self.assertNotIn(forbidden, src)

    def test_bridge_note_points_off_platform(self):
        note = bridge_note()
        self.assertIn("import-csv", note)
        self.assertIn("campaign", note)


class ChannelSeparationTests(unittest.TestCase):
    """Manual touches must not silently consume the email pipeline's budget."""

    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.tmp.name) / "t.db")

    def tearDown(self) -> None:
        self.store.close()
        self.tmp.cleanup()

    def test_manual_touches_are_tracked_separately_from_email(self):
        self.store.record_manual_touch("https://example.com/rooms/1", "airbnb_message")
        self.assertEqual(self.store.sends_today(), 0)
        self.assertEqual(self.store.manual_touches_today(), 1)

    def test_channel_filter(self):
        self.store.record_manual_touch("a", "airbnb_message")
        self.store.record_manual_touch("b", "instagram_dm")
        self.assertEqual(self.store.manual_touches_today("airbnb_message"), 1)
        self.assertEqual(self.store.manual_touches_today("instagram_dm"), 1)
        self.assertEqual(self.store.manual_touches_today(), 2)

    def test_email_sends_record_channel(self):
        self.store.record_send("a@b.com", "c", 0, "s", "inbox")
        row = self.store.conn.execute("SELECT channel FROM sends").fetchone()
        self.assertEqual(row["channel"], "email")


if __name__ == "__main__":
    unittest.main(verbosity=2)

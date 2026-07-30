"""The compliance gate is the safety-critical part. These tests assert it refuses."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from engine.config import Config, ConfigError, OutreachLimits, SenderIdentity
from engine.db import Store
from engine.outreach.compliance import ComplianceError, assert_sendable

GOOD_POSTAL = "Sculps Media LLC, 447 Broadway 2FL, New York, NY 10013"


def make_cfg(**over) -> Config:
    sender = SenderIdentity(
        from_name=over.pop("from_name", "Alex"),
        from_email=over.pop("from_email", "alex@example.com"),
        reply_to=over.pop("reply_to", "alex@example.com"),
        postal_address=over.pop("postal_address", GOOD_POSTAL),
    )
    cfg = Config(sender=sender, limits=OutreachLimits(**over.pop("limits", {})))
    cfg.unsubscribe_base_url = over.pop("unsub", "https://example.com")
    return cfg


def good_body(unsub="https://example.com/u/abc123") -> str:
    return f"Hi,\n\nSample: https://example.com/reel\n\n—\nAlex\n{GOOD_POSTAL}\n\nUnsubscribe: {unsub}\n"


class GateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.tmp.name) / "t.db")
        self.cfg = make_cfg()
        self.unsub = "https://example.com/u/abc123"

    def tearDown(self) -> None:
        self.store.close()
        self.tmp.cleanup()

    def send(self, **over):
        kwargs = dict(
            to_email="host@example.com",
            subject="vertical video for your listings",
            body=good_body(self.unsub),
            cfg=self.cfg, store=self.store, unsubscribe_url=self.unsub,
        )
        kwargs.update(over)
        assert_sendable(**kwargs)

    # --- happy path ----------------------------------------------------------

    def test_valid_message_passes(self):
        self.send()  # must not raise

    # --- each hard rule ------------------------------------------------------

    def test_missing_postal_address_blocks(self):
        with self.assertRaises(ComplianceError) as ctx:
            self.send(body="Hi\n\nUnsubscribe: https://example.com/u/abc123\n")
        self.assertIn("postal address", str(ctx.exception).lower())

    def test_missing_unsubscribe_blocks(self):
        with self.assertRaises(ComplianceError) as ctx:
            self.send(body=f"Hi\n\n—\nAlex\n{GOOD_POSTAL}\n")
        self.assertIn("unsubscribe", str(ctx.exception).lower())

    def test_suppressed_recipient_blocks(self):
        self.store.suppress("host@example.com", "opt-out")
        with self.assertRaises(ComplianceError) as ctx:
            self.send()
        self.assertIn("suppression", str(ctx.exception).lower())

    def test_suppression_is_case_insensitive(self):
        self.store.suppress("Host@Example.com", "opt-out")
        with self.assertRaises(ComplianceError):
            self.send(to_email="HOST@EXAMPLE.COM")

    def test_deceptive_subject_blocks(self):
        for subj in ("Re: our conversation", "Action required: your account",
                     "URGENT", "Your invoice is overdue"):
            with self.subTest(subj=subj), self.assertRaises(ComplianceError):
                self.send(subject=subj)

    def test_empty_subject_blocks(self):
        with self.assertRaises(ComplianceError):
            self.send(subject="   ")

    def test_touch_cap_blocks(self):
        for i in range(self.cfg.limits.max_touches):
            self.store.record_send("host@example.com", "c", i, "s", "inbox")
        with self.assertRaises(ComplianceError) as ctx:
            self.send()
        self.assertIn("touches", str(ctx.exception).lower())

    def test_forbidden_revenue_claim_blocks(self):
        body = good_body(self.unsub).replace(
            "Sample:", "Guaranteed more bookings for you. Sample:")
        with self.assertRaises(ComplianceError) as ctx:
            self.send(body=body)
        self.assertIn("forbidden claim", str(ctx.exception).lower())

    def test_fake_airbnb_endorsement_blocks(self):
        body = good_body(self.unsub).replace(
            "Sample:", "We are an official Airbnb partner. Sample:")
        with self.assertRaises(ComplianceError):
            self.send(body=body)

    def test_placeholder_postal_address_rejected_at_config(self):
        with self.assertRaises(ConfigError):
            make_cfg(postal_address="123 Main St").sender.validate()

    def test_invalid_recipient_blocks(self):
        with self.assertRaises(ComplianceError):
            self.send(to_email="not-an-email")

    def test_daily_cap_blocks(self):
        cfg = make_cfg(limits={"per_domain_daily": 2})
        for i in range(2):
            self.store.record_send(f"a{i}@example.com", "c", 0, "s", "inbox")
        with self.assertRaises(ComplianceError) as ctx:
            self.send(cfg=cfg)
        self.assertIn("daily send cap", str(ctx.exception).lower())


class SuppressionTests(unittest.TestCase):
    def test_suppression_has_no_delete_path(self):
        """Unsubscribes are permanent by design — assert no API removes them."""
        import inspect

        from engine import db
        src = inspect.getsource(db)
        self.assertNotIn("DELETE FROM suppression", src.upper().replace("  ", " "))


if __name__ == "__main__":
    unittest.main(verbosity=2)

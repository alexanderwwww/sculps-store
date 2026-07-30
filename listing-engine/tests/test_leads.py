"""Normalisation, dedupe and provenance enforcement."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from engine.db import Store
from engine.models import Lead, LeadStage, Segment
from engine.pipeline.normalize import (
    clean_email,
    clean_phone,
    dedupe_key,
    normalize,
    normalize_name,
)


def lead(**over) -> Lead:
    base = dict(business_name="Acme Stays LLC", source="csv:test",
                source_url="https://example.com/list", state="TN")
    base.update(over)
    return Lead(**base)


class NormalizeTests(unittest.TestCase):
    def test_email_cleaning(self):
        self.assertEqual(clean_email("  Host@Example.COM "), "host@example.com")
        self.assertEqual(clean_email("a@b.com; c@d.com"), "a@b.com")
        self.assertIsNone(clean_email("not-an-email"))
        self.assertIsNone(clean_email(""))
        self.assertIsNone(clean_email(None))

    def test_role_addresses_dropped(self):
        for e in ("noreply@x.com", "no-reply@x.com", "postmaster@x.com",
                  "abuse@x.com"):
            with self.subTest(e=e):
                self.assertIsNone(clean_email(e))

    def test_phone_cleaning(self):
        self.assertEqual(clean_phone("+1 (615) 555-0147"), "(615) 555-0147")
        self.assertEqual(clean_phone("6155550147"), "(615) 555-0147")
        self.assertIsNone(clean_phone("555"))

    def test_company_suffixes_stripped_for_matching(self):
        self.assertEqual(normalize_name("Acme Stays LLC"),
                         normalize_name("Acme Stays, Inc."))
        self.assertEqual(normalize_name("Blue Door Property Management"),
                         normalize_name("Blue Door"))

    def test_non_us_state_dropped(self):
        self.assertIsNone(normalize(lead(state="ZZ")))
        self.assertIsNone(normalize(lead(state=None)))

    def test_target_state_filter(self):
        self.assertIsNone(normalize(lead(state="CA"), ["TN", "TX"]))
        self.assertIsNotNone(normalize(lead(state="TN"), ["TN", "TX"]))

    def test_segment_inference(self):
        self.assertEqual(normalize(lead(business_name="Blue Door Property Management")).segment,
                         Segment.PROPERTY_MANAGER)
        self.assertEqual(normalize(lead(business_name="Hilltop Realty Group")).segment,
                         Segment.AGENT)
        self.assertEqual(normalize(lead(business_name="Jane Doe")).segment,
                         Segment.HOST)

    def test_explicit_segment_not_overridden(self):
        l = lead(business_name="Jane Doe", segment=Segment.PROPERTY_MANAGER)
        self.assertEqual(normalize(l).segment, Segment.PROPERTY_MANAGER)

    def test_stage_reflects_contactability(self):
        self.assertEqual(normalize(lead(email="a@b.com")).stage, LeadStage.ENRICHED)
        self.assertEqual(normalize(lead()).stage, LeadStage.NEW)

    def test_dedupe_key_prefers_email(self):
        a = normalize(lead(business_name="Acme Stays LLC", email="x@y.com"))
        b = normalize(lead(business_name="Totally Different", email="x@y.com"))
        self.assertEqual(a.dedupe_key, b.dedupe_key)

    def test_dedupe_key_falls_back_to_name_and_state(self):
        a = normalize(lead(business_name="Acme Stays LLC"))
        b = normalize(lead(business_name="Acme Stays, Inc."))
        self.assertEqual(a.dedupe_key, b.dedupe_key)
        c = normalize(lead(business_name="Acme Stays LLC", state="TX"))
        self.assertNotEqual(a.dedupe_key, c.dedupe_key)


class ProvenanceTests(unittest.TestCase):
    def test_lead_without_provenance_rejected(self):
        with self.assertRaises(ValueError) as ctx:
            Lead(business_name="X", source="", source_url="").validate()
        self.assertIn("provenance", str(ctx.exception))

    def test_csv_without_source_url_rejected(self):
        from engine.sources.csv_import import CsvSource
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "l.csv"
            p.write_text("business_name,email\nAcme,a@b.com\n")
            with self.assertRaises(ValueError):
                list(CsvSource(p).fetch())

    def test_csv_with_source_url_accepted(self):
        from engine.sources.csv_import import CsvSource
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "l.csv"
            p.write_text("business_name,email,state\nAcme Stays,a@b.com,TN\n")
            leads = list(CsvSource(p, default_source_url="conf list 2026").fetch())
            self.assertEqual(len(leads), 1)
            self.assertEqual(leads[0].email, "a@b.com")


class StoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.tmp.name) / "t.db")

    def tearDown(self) -> None:
        self.store.close()
        self.tmp.cleanup()

    def test_duplicate_insert_returns_false(self):
        a = normalize(lead(email="x@y.com"))
        self.assertTrue(self.store.upsert_lead(a))
        self.assertFalse(self.store.upsert_lead(a))
        self.assertEqual(len(self.store.leads()), 1)

    def test_same_email_different_name_deduped(self):
        self.assertTrue(self.store.upsert_lead(normalize(lead(email="x@y.com"))))
        self.assertFalse(self.store.upsert_lead(
            normalize(lead(business_name="Other Co", email="x@y.com"))))

    def test_reimport_does_not_reset_touches(self):
        l = normalize(lead(email="x@y.com"))
        self.store.upsert_lead(l)
        self.store.bump_touch(l.dedupe_key)
        self.store.upsert_lead(normalize(lead(email="x@y.com")))
        self.assertEqual(self.store.leads()[0].touches, 1)

    def test_suppress_marks_lead(self):
        l = normalize(lead(email="x@y.com"))
        self.store.upsert_lead(l)
        self.store.suppress("x@y.com", "opt-out")
        self.assertTrue(self.store.is_suppressed("x@y.com"))
        self.assertEqual(self.store.leads()[0].stage, LeadStage.SUPPRESSED)

    def test_state_filter_query(self):
        self.store.upsert_lead(normalize(lead(email="a@y.com", state="TN")))
        self.store.upsert_lead(normalize(lead(email="b@y.com", state="TX")))
        self.assertEqual(len(self.store.leads(state="TN")), 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)

"""Spec-work path: site harvesting guardrails and truthful i2v prompts."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from engine.produce.i2v import (
    MOVE_PHRASES,
    FabricatingPrompt,
    I2VRequest,
    PromptPackProvider,
    assert_prompt_truthful,
    build_prompt,
    pack_property,
)
from engine.sources.base import BlockedSourceError
from engine.sources.site_photos import SitePhotoHarvester

# The exact prompt from the reel (PLAN.md §1).
REEL_PROMPT = (
    "Cinematic real estate walkthrough, smooth steady gimbal-style camera gliding "
    "forward through a modern apartment interior. Warm natural light streaming "
    "through large windows, soft golden hour glow. Camera moves slowly from the "
    "entryway into the open-plan living room, past a stylish sofa and coffee "
    "table, gliding toward the kitchen with clean countertops, then drifting down "
    "a hallway into a cozy bedroom with crisp white linens, finishing in a "
    "spa-like bathroom with soft ambient lighting."
)


class PromptTruthfulnessTests(unittest.TestCase):
    def test_the_reel_prompt_is_refused(self):
        with self.assertRaises(FabricatingPrompt) as ctx:
            assert_prompt_truthful(REEL_PROMPT)
        msg = str(ctx.exception)
        self.assertIn("walkthrough", msg.lower() + REEL_PROMPT.lower())
        self.assertIn("misrepresent", msg)

    def test_each_fabricating_phrase_caught(self):
        cases = [
            "cinematic walkthrough of the property",
            "camera glides down the hallway into the bedroom",
            "moving from the entryway through the apartment",
            "add a sofa and some plants to the room",
            "remove the damage on the wall",
            "replace the window view with a sea view",
        ]
        for text in cases:
            with self.subTest(text=text), self.assertRaises(FabricatingPrompt):
                assert_prompt_truthful(text)

    def test_all_built_prompts_pass_our_own_checker(self):
        for move in MOVE_PHRASES:
            with self.subTest(move=move):
                assert_prompt_truthful(build_prompt(move))

    def test_built_prompt_forbids_leaving_the_room(self):
        p = build_prompt("drift_in")
        self.assertIn("never travels into another room", p)
        self.assertIn("Do not add, remove, or alter", p)

    def test_room_hint_does_not_license_travel(self):
        p = build_prompt("pan_left", room_hint="living room")
        self.assertIn("this exact living room", p)
        assert_prompt_truthful(p)

    def test_unknown_move_rejected(self):
        with self.assertRaises(ValueError):
            build_prompt("fly_through_the_house")


class PromptPackTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.d = Path(self.tmp.name)

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_pack_writes_prompts_and_manifest(self):
        photos = [self.d / f"p{i}.jpg" for i in range(3)]
        for p in photos:
            p.write_bytes(b"x")
        out = pack_property(photos, self.d / "pack")
        self.assertTrue((out / "prompts.txt").exists())
        self.assertTrue((out / "manifest.json").exists())
        text = (out / "prompts.txt").read_text()
        self.assertEqual(text.count("###"), 3)

    def test_provider_refuses_a_fabricating_prompt(self):
        prov = PromptPackProvider(self.d / "pack")
        with self.assertRaises(FabricatingPrompt):
            prov.submit(I2VRequest(image=self.d / "a.jpg", prompt=REEL_PROMPT))

    def test_every_packed_prompt_is_truthful(self):
        photos = [self.d / f"p{i}.jpg" for i in range(5)]
        for p in photos:
            p.write_bytes(b"x")
        out = pack_property(photos, self.d / "pack")
        import json
        for item in json.loads((out / "manifest.json").read_text()):
            assert_prompt_truthful(item["prompt"])


class HarvesterGuardTests(unittest.TestCase):
    def setUp(self) -> None:
        self.h = SitePhotoHarvester(contact_url="https://example.com/about")

    def test_contact_url_required(self):
        with self.assertRaises(ValueError):
            SitePhotoHarvester(contact_url="")

    def test_booking_platforms_refused(self):
        with tempfile.TemporaryDirectory() as td:
            for url in ("https://www.airbnb.com/rooms/123",
                        "https://www.vrbo.com/1234",
                        "https://www.booking.com/hotel/x.html"):
                with self.subTest(url=url), self.assertRaises(BlockedSourceError):
                    self.h.harvest(url, td)

    def test_user_agent_identifies_and_carries_contact(self):
        ua = self.h.session.headers["User-Agent"]
        self.assertIn("ListingEngine", ua)
        self.assertIn("https://example.com/about", ua)

    def test_image_extraction_from_html(self):
        html = """
        <meta property="og:image" content="/img/hero.jpg">
        <img src="https://cdn.example.com/photos/living-room.jpg">
        <img data-src="/photos/kitchen.png">
        <img src="/img/logo.png">
        <img src="/img/visa-icon.png">
        <div style="background:url('/photos/bedroom.webp')"></div>
        <img src="data:image/gif;base64,R0lGOD">
        """
        urls = self.h._extract_image_urls(html, "https://operator.example/listing")
        joined = " ".join(urls)
        self.assertIn("hero.jpg", joined)
        self.assertIn("living-room.jpg", joined)
        self.assertIn("kitchen.png", joined)
        self.assertIn("bedroom.webp", joined)
        # chrome and data URIs filtered out
        self.assertNotIn("logo.png", joined)
        self.assertNotIn("visa-icon", joined)
        self.assertNotIn("data:image", joined)

    def test_relative_urls_resolved_against_page(self):
        urls = self.h._extract_image_urls(
            '<img src="/photos/a.jpg">', "https://operator.example/listing/1")
        self.assertEqual(urls, ["https://operator.example/photos/a.jpg"])

    def test_srcset_takes_largest(self):
        urls = self.h._extract_image_urls(
            '<img srcset="/a-small.jpg 1x, /a-large.jpg 2x">',
            "https://operator.example/")
        self.assertIn("a-large.jpg", urls[0])

    def test_duplicates_collapsed(self):
        html = ('<img src="/photos/a.jpg"><img src="/photos/a.jpg">'
                '<img data-src="/photos/a.jpg">')
        urls = self.h._extract_image_urls(html, "https://operator.example/")
        self.assertEqual(len(urls), 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)

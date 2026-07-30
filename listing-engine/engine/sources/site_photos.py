"""Harvest property photos from an operator's own public website.

This is the answer to "we need photos before we can make the video". Serious
short-term-rental operators — the expensive-property segment worth targeting —
almost all run a direct-booking site. Those photos are:

* on **their** domain, not a booking platform's
* published by the rights holder themselves
* usually the same high-resolution set they give Airbnb

So we can collect them, build a spec video, and send it to the person who owns
the photos. That's ordinary spec work: agencies have always mocked up a pitch
using the prospect's own materials. The rights holder is the audience, the work
is never published, and it's deleted on request.

Guardrails, enforced here:

* ``robots.txt`` is honoured. If a site disallows the path, we skip it.
* Rate-limited and identified by a real User-Agent with a contact URL.
* Booking platforms stay blocked — ``assert_source_allowed`` runs on every URL,
  so pointing this at Airbnb fails rather than quietly working.
* Everything harvested is tagged ``SPEC_ONLY``. ``produce`` refuses to mark a
  spec asset as portfolio-cleared without a written grant.
"""

from __future__ import annotations

import re
import time
import urllib.robotparser
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests

from .base import assert_source_allowed

TIMEOUT = 20
DEFAULT_UA = ("ListingEngine/0.1 (spec-work photo harvester; "
              "contact: {contact}) requests/2")

# Big enough to be a real property photo rather than an icon or a logo.
MIN_BYTES = 60_000

IMG_SRC_RE = re.compile(
    r"""<img[^>]+(?:data-src|data-lazy-src|srcset|src)\s*=\s*["']([^"']+)["']""",
    re.I,
)
OG_IMAGE_RE = re.compile(
    r"""<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']""", re.I)
CSS_URL_RE = re.compile(r"""url\((['"]?)([^'")]+\.(?:jpe?g|png|webp))\1\)""", re.I)

IMAGE_EXT_RE = re.compile(r"\.(jpe?g|png|webp)(\?|$)", re.I)

# Paths that are usually chrome rather than the property.
SKIP_HINTS = ("logo", "icon", "favicon", "sprite", "avatar", "badge",
              "placeholder", "banner-ad", "payment", "stripe", "visa",
              "mastercard", "tripadvisor", "trustpilot")


class RobotsDisallowed(RuntimeError):
    """The site's robots.txt tells us not to fetch this path."""


@dataclass
class HarvestResult:
    site: str
    saved: list[Path] = field(default_factory=list)
    skipped: list[tuple[str, str]] = field(default_factory=list)
    rights: str = "SPEC_ONLY"

    def summary(self) -> str:
        return f"{self.site}: saved={len(self.saved)} skipped={len(self.skipped)}"


class SitePhotoHarvester:
    """Fetch property photos from a business's own public website."""

    def __init__(self, contact_url: str, *, delay: float = 1.5,
                 max_images: int = 12, respect_robots: bool = True):
        if not contact_url:
            raise ValueError(
                "contact_url is required — automated fetching identifies itself. "
                "Use your site or a mailto: you actually monitor."
            )
        self.contact_url = contact_url
        self.delay = delay
        self.max_images = max_images
        self.respect_robots = respect_robots
        self.session = requests.Session()
        self.session.headers["User-Agent"] = DEFAULT_UA.format(contact=contact_url)

    # --- robots ---------------------------------------------------------------

    def _robots(self, url: str) -> urllib.robotparser.RobotFileParser | None:
        if not self.respect_robots:
            return None
        parts = urlparse(url)
        rp = urllib.robotparser.RobotFileParser()
        rp.set_url(f"{parts.scheme}://{parts.netloc}/robots.txt")
        try:
            rp.read()
        except Exception:
            # No reachable robots.txt is treated as "no rules published".
            return None
        return rp

    def _allowed(self, rp, url: str) -> bool:
        if rp is None:
            return True
        try:
            return rp.can_fetch(self.session.headers["User-Agent"], url)
        except Exception:
            return True

    # --- harvest --------------------------------------------------------------

    def harvest(self, page_url: str, out_dir: str | Path) -> HarvestResult:
        assert_source_allowed(page_url)
        result = HarvestResult(site=page_url)

        rp = self._robots(page_url)
        if not self._allowed(rp, page_url):
            raise RobotsDisallowed(
                f"{page_url} is disallowed by that site's robots.txt. Skipping — "
                "a site that asks not to be crawled is a site we don't crawl."
            )

        resp = self.session.get(page_url, timeout=TIMEOUT)
        resp.raise_for_status()
        html = resp.text

        urls = self._extract_image_urls(html, page_url)
        out = Path(out_dir)
        out.mkdir(parents=True, exist_ok=True)

        for i, img_url in enumerate(urls):
            if len(result.saved) >= self.max_images:
                break
            try:
                assert_source_allowed(img_url)
            except Exception as exc:
                result.skipped.append((img_url, str(exc)[:80]))
                continue
            if not self._allowed(rp, img_url):
                result.skipped.append((img_url, "robots.txt disallow"))
                continue

            time.sleep(self.delay)
            try:
                r = self.session.get(img_url, timeout=TIMEOUT)
                r.raise_for_status()
            except Exception as exc:
                result.skipped.append((img_url, f"fetch failed: {exc}"))
                continue

            if len(r.content) < MIN_BYTES:
                result.skipped.append((img_url, f"too small ({len(r.content)}B)"))
                continue

            ext = self._ext_for(img_url, r.headers.get("Content-Type", ""))
            path = out / f"{i:02d}{ext}"
            path.write_bytes(r.content)
            result.saved.append(path)

        # Provenance travels with the photos, so nobody later mistakes a spec
        # harvest for material we were given.
        (out / "RIGHTS.txt").write_text(
            "SPEC_ONLY\n"
            f"source: {page_url}\n"
            "These photos were published by the business on its own website and\n"
            "were collected to build a pitch for that same business.\n"
            "Permitted:  private spec video sent to the rights holder.\n"
            "Forbidden:  portfolio use, advertising, or any public posting until\n"
            "            the owner grants permission in writing (record-grant\n"
            "            --portfolio-ok). Delete on request.\n"
        )
        return result

    def _extract_image_urls(self, html: str, base: str) -> list[str]:
        found: list[str] = []
        seen: set[str] = set()

        def add(raw: str) -> None:
            # srcset gives "url 1x, url 2x" — take the largest declared.
            candidate = raw.split(",")[-1].strip().split(" ")[0] if " " in raw or "," in raw else raw
            candidate = candidate.strip()
            if not candidate or candidate.startswith("data:"):
                return
            absolute = urljoin(base, candidate)
            if not IMAGE_EXT_RE.search(absolute):
                return
            low = absolute.lower()
            if any(h in low for h in SKIP_HINTS):
                return
            if absolute in seen:
                return
            seen.add(absolute)
            found.append(absolute)

        for m in OG_IMAGE_RE.finditer(html):
            add(m.group(1))
        for m in IMG_SRC_RE.finditer(html):
            add(m.group(1))
        for m in CSS_URL_RE.finditer(html):
            add(m.group(2))
        return found

    @staticmethod
    def _ext_for(url: str, content_type: str) -> str:
        m = IMAGE_EXT_RE.search(url)
        if m:
            return "." + m.group(1).lower().replace("jpeg", "jpg")
        if "png" in content_type:
            return ".png"
        if "webp" in content_type:
            return ".webp"
        return ".jpg"

"""Email templates.

The offer is a free first video, which is what makes the outreach clean: the
prospect hands us the photos, and that handover *is* the rights grant we need
(PLAN.md §4, COMPLIANCE.md §4). Nothing here promises a result we haven't measured.

Every template ends with the identity + opt-out footer. ``render`` appends it, so
a template author can't forget it.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..config import Config
from ..models import Lead, Segment

FOOTER = """\
—
{from_name}
{postal_address}

Not interested? {unsubscribe_url} — one click, and I won't contact you again.
"""


@dataclass
class Message:
    subject: str
    body: str


# Step 0 = first touch, then follow-ups. Keep them short; the ask is small.
SEQUENCES: dict[Segment, list[tuple[str, str]]] = {
    Segment.PROPERTY_MANAGER: [
        (
            "vertical video for {business_name}'s listings",
            """Hi{name_suffix},

I make short vertical videos for short-term rental listings — the kind that run on
Instagram, TikTok and a direct-booking page. I build them from the photos you
already have, so there's no shoot to schedule.

Here's a recent one: {portfolio_url}

If it's useful: send me photos of one unit and I'll make the first video free.
If you like it we can talk about the rest of your portfolio. If not, you keep the
video and we're done.

Worth a try on one property?""",
        ),
        (
            "one free video, one unit",
            """Hi{name_suffix},

Following up on this once. The offer is one unit, photos you already have, first
video free: {portfolio_url}

If it's not a fit, no problem — just say so and I'll close the loop.""",
        ),
        (
            "last note from me",
            """Hi{name_suffix},

Last one from me. If vertical video for {business_name} is ever worth a look,
this is what I do: {portfolio_url}

I'll leave it there. Good luck with the season.""",
        ),
    ],
    Segment.AGENT: [
        (
            "vertical listing videos from photos you already have",
            """Hi{name_suffix},

I turn listing photos into short vertical videos for Instagram and TikTok — built
from the photos already in the listing, so nothing extra to shoot.

Sample: {portfolio_url}

Send me one listing's photos and I'll do the first video free. If it earns a
place in your marketing, we go from there.""",
        ),
        (
            "re your listings — one free video",
            """Hi{name_suffix},

Quick follow-up: first video free, one listing, your existing photos.
{portfolio_url}

Not a fit? Tell me and I'll stop.""",
        ),
    ],
    Segment.HOST: [
        (
            "a short video for your rental, from your own photos",
            """Hi{name_suffix},

I make short vertical videos for rental listings out of the photos hosts already
have — good for Instagram, TikTok, and a direct-booking page.

Example: {portfolio_url}

Happy to do the first one free if you send me your photos. No shoot needed.""",
        ),
    ],
}


def render(lead: Lead, step: int, cfg: Config, unsubscribe_url: str,
           portfolio_url: str) -> Message:
    """Render step ``step`` of the sequence for ``lead``.

    Raises IndexError when the sequence for that segment is exhausted — which is
    the signal to stop, not to loop back to step 0.
    """
    seq = SEQUENCES.get(lead.segment) or SEQUENCES[Segment.HOST]
    subject_tpl, body_tpl = seq[step]

    fields = {
        "business_name": lead.business_name,
        "name_suffix": "",  # filled when we have a real first name; never guessed
        "from_name": cfg.sender.from_name,
        "portfolio_url": portfolio_url,
    }
    subject = subject_tpl.format(**fields)
    body = body_tpl.format(**fields).rstrip() + "\n\n" + FOOTER.format(
        from_name=cfg.sender.from_name,
        postal_address=cfg.sender.postal_address,
        unsubscribe_url=unsubscribe_url,
    )
    return Message(subject=subject, body=body)


def sequence_length(segment: Segment) -> int:
    return len(SEQUENCES.get(segment) or SEQUENCES[Segment.HOST])

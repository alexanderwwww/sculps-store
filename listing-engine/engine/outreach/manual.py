"""Human-sent outreach for channels that must not be automated.

Airbnb's inbox is the main case. Two facts set the design:

1. **Airbnb's Off-Platform Policy explicitly names what this pitch is.** It
   prohibits "including links that take people off the Airbnb platform in
   listings or messages" and "soliciting or facilitating any off-Airbnb
   transaction". A message offering paid video work is both. Penalties run to
   listing/account suspension — and they apply to the *host* who engages too.

2. **Automating it is the part that ends the account.** A bot driving a logged-in
   Airbnb session is exactly what platform anti-automation detects, and a ban
   removes the channel you were prospecting through.

So this module does not send anything. It prints one message at a time for you to
paste by hand, records that you sent it, and caps the volume. That keeps a human
in the loop and reduces the surface — it does **not** make the outreach compliant.
Nothing here can make a commercial pitch through Airbnb's inbox policy-clean,
because the solicitation itself is the violation. Use it knowing that.

The realistic play is in ``bridge_note()``: use the listing to identify the
operating business, then reach that business off-platform, where automation and
links are both fine.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from ..db import Store

# Airbnb's inbox is not email. Long pitches get ignored; keep it under ~60 words.
# Deliberately link-free: links in messages are a specifically named violation,
# and stripping them is the one part of the surface we can actually reduce.
AIRBNB_TEMPLATES: list[str] = [
    (
        "Hi — I'm a video editor. I make short vertical videos for rental "
        "listings out of photos the host already has, for Instagram and TikTok. "
        "Yours looks like it would cut well. Happy to make one for you free so "
        "you can see it. If that's of interest, let me know the best way to send "
        "it over."
    ),
    (
        "Hi — quick note: I edit short vertical videos for rental listings using "
        "the host's own photos. No shoot needed. I'd do the first one free if "
        "you'd like to see what it looks like. Just let me know where to send it."
    ),
]

MAX_PER_DAY = 10          # low on purpose; volume is what triggers review
MAX_PER_HANDLE = 1        # one message per listing. A follow-up is spam.

DISCLAIMER = """\
⚠  Airbnb's Off-Platform Policy prohibits soliciting off-Airbnb transactions and
   putting off-platform links in messages. This pitch is a solicitation, so it is
   off-policy however it's worded. Risk is listing/account suspension — for the
   host who replies as well as for you. Sending is your call; send it by hand,
   keep the volume low, and never automate it.
"""


class ManualOutreachError(Exception):
    pass


@dataclass
class QueueItem:
    handle: str               # listing URL or a stable reference you choose
    label: str = ""           # e.g. "Nashville 2BR downtown"
    message: str = ""
    step: int = 0


@dataclass
class ManualQueue:
    """Builds a hand-worked send list and records what actually went out."""

    store: Store
    channel: str = "airbnb_message"
    max_per_day: int = MAX_PER_DAY
    max_per_handle: int = MAX_PER_HANDLE
    templates: list[str] = field(default_factory=lambda: list(AIRBNB_TEMPLATES))

    def remaining_today(self) -> int:
        return max(0, self.max_per_day - self.store.manual_touches_today(self.channel))

    def check(self, handle: str) -> None:
        """Raise if this handle or today's budget is exhausted."""
        if self.store.manual_touch_count(handle) >= self.max_per_handle:
            raise ManualOutreachError(
                f"already contacted {handle!r} "
                f"({self.max_per_handle} max). A follow-up in a host's booking "
                "inbox is spam — leave it."
            )
        if self.remaining_today() <= 0:
            raise ManualOutreachError(
                f"daily cap reached ({self.max_per_day} on {self.channel}). "
                "Volume is what gets accounts reviewed. Continue tomorrow."
            )

    def build(self, handles: list[tuple[str, str]]) -> list[QueueItem]:
        """Prepare a session's worth of messages.

        ``handles`` is a list of (handle, label). Items that fail ``check`` are
        dropped, so the queue you get is what you can actually send today.
        """
        out: list[QueueItem] = []
        for i, (handle, label) in enumerate(handles):
            if len(out) >= self.remaining_today():
                break
            try:
                self.check(handle)
            except ManualOutreachError:
                continue
            # Vary phrasing across a session; identical text at volume reads as
            # a bot to both the host and to platform review.
            msg = self.templates[i % len(self.templates)]
            out.append(QueueItem(handle=handle, label=label, message=msg))
        return out

    def mark_sent(self, handle: str, label: str = "", step: int = 0,
                  outcome: str = "") -> None:
        self.store.record_manual_touch(handle, self.channel, step=step,
                                       label=label, outcome=outcome)


def bridge_note(listing_ref: str = "the listing") -> str:
    """The move that actually scales, printed alongside the queue."""
    return (
        f"Bridge: {listing_ref} usually names the operator — a business name, a\n"
        "  'Managed by …' line, or a professional host profile. Search that name;\n"
        "  most run a website or an Instagram business account. Contacting the\n"
        "  business there is ordinary B2B outreach: you can automate it, links are\n"
        "  fine, and nobody's listing is at risk. Feed those into `import-csv` and\n"
        "  run them through `campaign` instead."
    )

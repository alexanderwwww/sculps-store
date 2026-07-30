"""Hard compliance gate for outbound email.

Every message passes through :func:`assert_sendable` before any transport sees it.
Failures raise :class:`ComplianceError`. There is deliberately no "warn and send
anyway" path and no override flag — if you need to relax a rule, you have to edit
this file, which is a code review rather than a runtime accident.

Requirements come from CAN-SPAM (15 U.S.C. §7704) and from COMPLIANCE.md §3.
"""

from __future__ import annotations

import re

from ..config import Config
from ..db import Store

MIN_POSTAL_LEN = 12

# Subject-line patterns that misrepresent the nature of the message. CAN-SPAM
# prohibits deceptive subject lines; these are the ones that get used by accident
# because they "perform well".
DECEPTIVE_SUBJECT_PATTERNS = (
    r"\bre\s*:", r"\bfwd?\s*:",            # faking an existing thread
    r"\byour (order|invoice|payment|account)\b",
    r"\b(refund|overdue|past due)\b",
    r"\baction required\b",
    r"\burgent\b",
    r"\bwinner\b", r"\byou'?ve won\b",
    r"\bfree money\b",
    r"\bguaranteed\b",
)

# Claims we will not make about results (COMPLIANCE.md §5).
# Note the trailing `s?` on the outcome nouns — "more bookings" is the phrasing
# that actually gets written, and an unpluralised pattern silently misses it.
FORBIDDEN_BODY_PATTERNS = (
    r"\bguarantee(d|s)?\b.{0,40}\b(booking|revenue|occupancy|income)s?\b",
    r"\b(double|triple|10x|5x)\b.{0,30}\b(booking|revenue|occupancy|income)s?\b",
    r"\bairbnb\s+(approved|endorsed|partner|official)\b",
    r"\b(certified|official)\s+airbnb\b",
)


class ComplianceError(Exception):
    """Raised when a message or recipient fails a hard rule. Never caught to skip."""


def _has_unsubscribe(body: str, unsubscribe_url: str | None) -> bool:
    if unsubscribe_url and unsubscribe_url in body:
        return True
    return bool(re.search(r"\bunsubscribe\b", body, re.I)) and "http" in body.lower()


def assert_sendable(
    *,
    to_email: str,
    subject: str,
    body: str,
    cfg: Config,
    store: Store,
    unsubscribe_url: str | None = None,
    campaign: str = "default",
) -> None:
    """Raise ComplianceError unless this exact message is legal and permitted."""
    problems: list[str] = []

    # 1. Truthful, complete sender identity.
    try:
        cfg.sender.validate()
    except Exception as exc:
        problems.append(f"sender identity: {exc}")

    # 2. Recipient sanity.
    e = (to_email or "").strip().lower()
    if not re.match(r"^[^@\s]+@[^@\s.]+\.[^@\s]+$", e):
        problems.append(f"recipient {to_email!r} is not a valid address")

    # 3. Suppression list — permanent, checked every single send.
    if e and store.is_suppressed(e):
        problems.append(
            f"{e} is on the suppression list; unsubscribes are permanent "
            "(COMPLIANCE.md §3)"
        )

    # 4. Touch cap.
    if e and store.touch_count(e) >= cfg.limits.max_touches:
        problems.append(
            f"{e} has already had {store.touch_count(e)} touches "
            f"(cap {cfg.limits.max_touches}); stop contacting this prospect"
        )

    # 5. Subject line present and not deceptive.
    subj = (subject or "").strip()
    if not subj:
        problems.append("empty subject line")
    for pat in DECEPTIVE_SUBJECT_PATTERNS:
        if re.search(pat, subj, re.I):
            problems.append(
                f"subject {subj!r} matches deceptive pattern /{pat}/ — CAN-SPAM "
                "prohibits misleading subject lines"
            )

    # 6. Physical postal address in the body.
    postal = (cfg.sender.postal_address or "").strip()
    if not postal or len(postal) < MIN_POSTAL_LEN:
        problems.append("configured postal_address is too short to be real")
    elif _normalise_ws(postal) not in _normalise_ws(body):
        problems.append(
            "body does not contain your physical postal address; CAN-SPAM requires "
            "it in every commercial message"
        )

    # 7. Working unsubscribe.
    if not _has_unsubscribe(body, unsubscribe_url):
        problems.append(
            "body has no unsubscribe link; CAN-SPAM requires a clear, working "
            "opt-out in every commercial message"
        )

    # 8. No forbidden performance claims.
    for pat in FORBIDDEN_BODY_PATTERNS:
        if re.search(pat, body, re.I):
            problems.append(
                f"body matches forbidden claim pattern /{pat}/ (COMPLIANCE.md §5)"
            )

    # 9. Daily volume, to protect deliverability and stay out of spam-trap range.
    sent_today = store.sends_today()
    if sent_today >= cfg.limits.per_domain_daily:
        problems.append(
            f"daily send cap reached ({sent_today}/{cfg.limits.per_domain_daily})"
        )

    if problems:
        raise ComplianceError(
            f"refusing to send to {to_email!r} in campaign {campaign!r}:\n  - "
            + "\n  - ".join(problems)
        )


def _normalise_ws(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip().lower()


def unsubscribe_url_for(cfg: Config, email: str) -> str:
    """Build the per-recipient opt-out URL.

    The token is derived from the address so the endpoint can suppress without a
    lookup table, but it is not a secret — treat the endpoint as public and
    idempotent.
    """
    import hashlib

    if not cfg.unsubscribe_base_url:
        raise ComplianceError(
            "outreach.unsubscribe_base_url is not configured. You cannot send "
            "commercial email without a working opt-out mechanism."
        )
    token = hashlib.sha256(f"{email.strip().lower()}".encode()).hexdigest()[:24]
    base = cfg.unsubscribe_base_url.rstrip("/")
    return f"{base}/u/{token}"

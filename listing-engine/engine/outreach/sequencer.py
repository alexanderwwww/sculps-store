"""Campaign runner.

Order of operations matters: render → compliance gate → transport → record. The
gate sits between rendering and sending so nothing can reach a transport without
passing it.

``dry_run=True`` is the default. It runs every check and prints what *would* go
out, without a transport or an API key. Use it until the output looks right.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

from ..config import Config
from ..db import Store
from ..models import Lead, LeadStage, Segment
from . import templates
from .compliance import ComplianceError, assert_sendable, unsubscribe_url_for
from .transport import Transport, resolve_transport


@dataclass
class RunReport:
    attempted: int = 0
    sent: int = 0
    blocked: int = 0
    skipped: int = 0
    errors: list[str] = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if self.errors is None:
            self.errors = []

    def summary(self) -> str:
        return (f"attempted={self.attempted} sent={self.sent} "
                f"blocked={self.blocked} skipped={self.skipped}")


def run_campaign(
    cfg: Config,
    store: Store,
    *,
    campaign: str,
    portfolio_url: str,
    limit: int = 25,
    dry_run: bool = True,
    segment: Segment | None = None,
    transport: Transport | None = None,
) -> RunReport:
    report = RunReport()

    if not portfolio_url:
        raise ValueError(
            "portfolio_url is required. The first touch leads with real work — "
            "build the rights-clean portfolio first (PLAN.md Phase 0)."
        )

    candidates = [
        l for l in store.leads(with_email=True, limit=limit * 4)
        if l.stage in (LeadStage.ENRICHED, LeadStage.CONTACTED)
        and (segment is None or l.segment == segment)
    ]

    tx = transport if (transport or dry_run) else resolve_transport(cfg)

    for lead in candidates:
        if report.sent >= limit:
            break
        assert lead.email is not None

        step = store.touch_count(lead.email)
        if step >= templates.sequence_length(lead.segment):
            report.skipped += 1
            continue

        report.attempted += 1
        try:
            unsub = unsubscribe_url_for(cfg, lead.email)
            msg = templates.render(lead, step, cfg, unsub, portfolio_url)

            assert_sendable(
                to_email=lead.email, subject=msg.subject, body=msg.body,
                cfg=cfg, store=store, unsubscribe_url=unsub, campaign=campaign,
            )
        except ComplianceError as exc:
            report.blocked += 1
            report.errors.append(str(exc))
            continue

        if dry_run:
            print(f"\n--- [dry-run] to: {lead.email} (step {step}) ---")
            print(f"Subject: {msg.subject}\n")
            print(msg.body)
            report.sent += 1
            continue

        assert tx is not None
        try:
            tx.send(to_email=lead.email, subject=msg.subject, body=msg.body, cfg=cfg)
        except Exception as exc:  # transport failures are not compliance failures
            report.errors.append(f"transport failed for {lead.email}: {exc}")
            continue

        store.record_send(lead.email, campaign, step, msg.subject,
                          inbox=cfg.sender.from_email)
        store.bump_touch(lead.dedupe_key)
        report.sent += 1

        # Spacing protects deliverability more than any copy tweak does.
        time.sleep(cfg.limits.min_seconds_between_sends)

    return report


def handle_unsubscribe(store: Store, email: str, reason: str = "recipient opt-out") -> None:
    """Suppress an address. Idempotent, and there is no undo by design."""
    store.suppress(email, reason)

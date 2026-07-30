"""Email transports.

Only a real API key activates a real transport. There is no silent fallback that
looks like it sent something — an unconfigured transport raises.
"""

from __future__ import annotations

from typing import Protocol

import requests

from ..config import Config

TIMEOUT = 30


class Transport(Protocol):
    def send(self, *, to_email: str, subject: str, body: str, cfg: Config) -> str:
        """Send one message. Returns a provider message id. Raises on failure."""
        ...


class ResendTransport:
    """https://resend.com/docs/api-reference/emails/send-email"""

    endpoint = "https://api.resend.com/emails"

    def __init__(self, api_key: str):
        self.api_key = api_key

    def send(self, *, to_email: str, subject: str, body: str, cfg: Config) -> str:
        resp = requests.post(
            self.endpoint,
            headers={"Authorization": f"Bearer {self.api_key}",
                     "Content-Type": "application/json"},
            json={
                "from": f"{cfg.sender.from_name} <{cfg.sender.from_email}>",
                "reply_to": cfg.sender.reply_to,
                "to": [to_email],
                "subject": subject,
                "text": body,
            },
            timeout=TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json().get("id", "")


class ConsoleTransport:
    """Prints instead of sending. For tests and local runs."""

    def __init__(self) -> None:
        self.outbox: list[dict[str, str]] = []

    def send(self, *, to_email: str, subject: str, body: str, cfg: Config) -> str:
        self.outbox.append({"to": to_email, "subject": subject, "body": body})
        print(f"[console] -> {to_email}: {subject}")
        return f"console-{len(self.outbox)}"


def resolve_transport(cfg: Config) -> Transport:
    key = cfg.email_api_key
    if not key:
        raise RuntimeError(
            "No email transport configured. Set LISTING_ENGINE_EMAIL_API_KEY to "
            "send for real, or run with --dry-run."
        )
    return ResendTransport(key)

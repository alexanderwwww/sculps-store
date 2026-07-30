"""Configuration loading.

Config lives in a TOML file (default ``config.toml``, see ``config.example.toml``).
Secrets are read from the environment, never from the config file, so the config
can be committed if you want to.
"""

from __future__ import annotations

import os
import tomllib
from dataclasses import dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


class ConfigError(Exception):
    """Raised when configuration is missing or invalid."""


@dataclass
class SenderIdentity:
    """Identity block that must appear in every outbound message (CAN-SPAM)."""

    from_name: str
    from_email: str
    reply_to: str
    postal_address: str

    def validate(self) -> None:
        missing = [f for f in ("from_name", "from_email", "reply_to", "postal_address")
                   if not str(getattr(self, f, "") or "").strip()]
        if missing:
            raise ConfigError(
                f"sender identity incomplete: {', '.join(missing)}. "
                "A truthful from-address and a real physical postal address are "
                "legally required in every commercial email (CAN-SPAM)."
            )
        if "@" not in self.from_email or "@" not in self.reply_to:
            raise ConfigError("from_email and reply_to must be email addresses")
        # A postal address that is obviously a placeholder is worse than none,
        # because it looks compliant while failing the requirement.
        lowered = self.postal_address.lower()
        for placeholder in ("your address", "123 main st", "todo", "xxx", "changeme"):
            if placeholder in lowered:
                raise ConfigError(
                    f"postal_address looks like a placeholder ({self.postal_address!r}). "
                    "It must be a real address where you can receive mail."
                )


@dataclass
class OutreachLimits:
    per_inbox_daily: int = 25
    per_domain_daily: int = 50
    max_touches: int = 4
    min_seconds_between_sends: int = 45


@dataclass
class ProduceSettings:
    aspect: str = "9:16"
    width: int = 1080
    fps: int = 30
    shot_seconds: float = 4.0
    crossfade_seconds: float = 0.5
    depth_backend: str = "none"  # "none" | "external"
    font: str = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


@dataclass
class Config:
    sender: SenderIdentity
    limits: OutreachLimits = field(default_factory=OutreachLimits)
    produce: ProduceSettings = field(default_factory=ProduceSettings)
    target_states: list[str] = field(default_factory=list)
    db_path: Path = REPO_ROOT / "data" / "engine.db"
    work_dir: Path = REPO_ROOT / "work"
    unsubscribe_base_url: str = ""

    # --- secrets, environment only -------------------------------------------
    @property
    def email_api_key(self) -> str | None:
        return os.environ.get("LISTING_ENGINE_EMAIL_API_KEY")

    @property
    def google_places_key(self) -> str | None:
        return os.environ.get("LISTING_ENGINE_GOOGLE_PLACES_KEY")

    @staticmethod
    def load(path: str | Path = "config.toml") -> "Config":
        p = Path(path)
        if not p.is_absolute():
            p = REPO_ROOT / p
        if not p.exists():
            raise ConfigError(
                f"no config at {p}. Copy config.example.toml to config.toml and fill it in."
            )
        with p.open("rb") as fh:
            raw = tomllib.load(fh)

        sender = SenderIdentity(**raw.get("sender", {}))
        cfg = Config(
            sender=sender,
            limits=OutreachLimits(**raw.get("limits", {})),
            produce=ProduceSettings(**raw.get("produce", {})),
            target_states=[s.upper() for s in raw.get("targeting", {}).get("states", [])],
            unsubscribe_base_url=raw.get("outreach", {}).get("unsubscribe_base_url", ""),
        )
        if "db_path" in raw.get("paths", {}):
            cfg.db_path = Path(raw["paths"]["db_path"])
        if "work_dir" in raw.get("paths", {}):
            cfg.work_dir = Path(raw["paths"]["work_dir"])
        return cfg

"""SQLite persistence for leads, sends and the suppression list.

The suppression list is deliberately append-only: there is no delete path. An
unsubscribe is permanent (COMPLIANCE.md §3).
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from .models import Lead, LeadStage, Segment, utcnow

SCHEMA = """
CREATE TABLE IF NOT EXISTS leads (
    dedupe_key    TEXT PRIMARY KEY,
    business_name TEXT NOT NULL,
    source        TEXT NOT NULL,
    source_url    TEXT NOT NULL,
    email         TEXT,
    phone         TEXT,
    website       TEXT,
    city          TEXT,
    state         TEXT,
    unit_count    INTEGER,
    segment       TEXT NOT NULL DEFAULT 'unknown',
    stage         TEXT NOT NULL DEFAULT 'new',
    touches       INTEGER NOT NULL DEFAULT 0,
    notes         TEXT DEFAULT '',
    created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage);
CREATE INDEX IF NOT EXISTS idx_leads_state ON leads(state);
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_email ON leads(email) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS suppression (
    email      TEXT PRIMARY KEY,
    reason     TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sends (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    email      TEXT NOT NULL,
    campaign   TEXT NOT NULL,
    step       INTEGER NOT NULL,
    subject    TEXT NOT NULL,
    inbox      TEXT NOT NULL,
    sent_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sends_email ON sends(email);
CREATE INDEX IF NOT EXISTS idx_sends_sent_at ON sends(sent_at);

CREATE TABLE IF NOT EXISTS grants (
    property_ref         TEXT PRIMARY KEY,
    supplied_by          TEXT NOT NULL,
    supplied_via         TEXT NOT NULL,
    rights_confirmed     INTEGER NOT NULL,
    confirmation_note    TEXT NOT NULL,
    portfolio_permission INTEGER NOT NULL DEFAULT 0,
    received_at          TEXT NOT NULL
);
"""


class Store:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(self.path)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(SCHEMA)
        self.conn.commit()

    def close(self) -> None:
        self.conn.close()

    def __enter__(self) -> "Store":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    # --- leads ---------------------------------------------------------------

    def upsert_lead(self, lead: Lead) -> bool:
        """Insert a lead. Returns True if newly inserted, False if a duplicate.

        Duplicates are matched on ``dedupe_key`` first, then on email. Existing
        rows are never overwritten by a later import — the first provenance wins,
        and touch counts must not be reset by a re-import.
        """
        lead.validate()
        row = lead.to_row()
        try:
            self.conn.execute(
                """INSERT INTO leads (dedupe_key, business_name, source, source_url,
                        email, phone, website, city, state, unit_count, segment,
                        stage, touches, notes, created_at)
                   VALUES (:dedupe_key, :business_name, :source, :source_url,
                        :email, :phone, :website, :city, :state, :unit_count, :segment,
                        :stage, :touches, :notes, :created_at)""",
                row,
            )
            self.conn.commit()
            return True
        except sqlite3.IntegrityError:
            return False

    def leads(self, stage: LeadStage | None = None, state: str | None = None,
              with_email: bool = False, limit: int | None = None) -> list[Lead]:
        sql = "SELECT * FROM leads WHERE 1=1"
        params: list[object] = []
        if stage is not None:
            sql += " AND stage = ?"
            params.append(stage.value)
        if state:
            sql += " AND state = ?"
            params.append(state.upper())
        if with_email:
            sql += " AND email IS NOT NULL AND email != ''"
        sql += " ORDER BY created_at"
        if limit:
            sql += f" LIMIT {int(limit)}"
        rows = self.conn.execute(sql, params).fetchall()
        return [self._to_lead(r) for r in rows]

    @staticmethod
    def _to_lead(r: sqlite3.Row) -> Lead:
        return Lead(
            business_name=r["business_name"], source=r["source"],
            source_url=r["source_url"], email=r["email"], phone=r["phone"],
            website=r["website"], city=r["city"], state=r["state"],
            unit_count=r["unit_count"], segment=Segment(r["segment"]),
            stage=LeadStage(r["stage"]), dedupe_key=r["dedupe_key"],
            touches=r["touches"], notes=r["notes"] or "", created_at=r["created_at"],
        )

    def set_stage(self, dedupe_key: str, stage: LeadStage) -> None:
        self.conn.execute("UPDATE leads SET stage = ? WHERE dedupe_key = ?",
                          (stage.value, dedupe_key))
        self.conn.commit()

    def bump_touch(self, dedupe_key: str) -> None:
        self.conn.execute(
            "UPDATE leads SET touches = touches + 1, stage = ? WHERE dedupe_key = ?",
            (LeadStage.CONTACTED.value, dedupe_key))
        self.conn.commit()

    def counts_by_stage(self) -> dict[str, int]:
        rows = self.conn.execute(
            "SELECT stage, COUNT(*) AS n FROM leads GROUP BY stage").fetchall()
        return {r["stage"]: r["n"] for r in rows}

    # --- suppression (append-only) -------------------------------------------

    def suppress(self, email: str, reason: str) -> None:
        e = email.strip().lower()
        self.conn.execute(
            "INSERT OR IGNORE INTO suppression (email, reason, created_at) VALUES (?,?,?)",
            (e, reason, utcnow()))
        self.conn.execute(
            "UPDATE leads SET stage = ? WHERE lower(email) = ?",
            (LeadStage.SUPPRESSED.value, e))
        self.conn.commit()

    def is_suppressed(self, email: str) -> bool:
        r = self.conn.execute("SELECT 1 FROM suppression WHERE email = ?",
                              (email.strip().lower(),)).fetchone()
        return r is not None

    # --- sends ---------------------------------------------------------------

    def record_send(self, email: str, campaign: str, step: int, subject: str,
                    inbox: str) -> None:
        self.conn.execute(
            """INSERT INTO sends (email, campaign, step, subject, inbox, sent_at)
               VALUES (?,?,?,?,?,?)""",
            (email.strip().lower(), campaign, step, subject, inbox, utcnow()))
        self.conn.commit()

    def touch_count(self, email: str) -> int:
        r = self.conn.execute("SELECT COUNT(*) AS n FROM sends WHERE email = ?",
                              (email.strip().lower(),)).fetchone()
        return int(r["n"])

    def sends_today(self, inbox: str | None = None) -> int:
        sql = "SELECT COUNT(*) AS n FROM sends WHERE date(sent_at) = date('now')"
        params: list[object] = []
        if inbox:
            sql += " AND inbox = ?"
            params.append(inbox)
        return int(self.conn.execute(sql, params).fetchone()["n"])

    # --- grants --------------------------------------------------------------

    def record_grant(self, grant) -> None:  # engine.models.PhotoGrant
        grant.validate()
        self.conn.execute(
            """INSERT OR REPLACE INTO grants (property_ref, supplied_by, supplied_via,
                   rights_confirmed, confirmation_note, portfolio_permission, received_at)
               VALUES (?,?,?,?,?,?,?)""",
            (grant.property_ref, grant.supplied_by, grant.supplied_via,
             int(grant.rights_confirmed), grant.confirmation_note,
             int(grant.portfolio_permission), grant.received_at))
        self.conn.commit()

    def get_grant(self, property_ref: str) -> dict | None:
        r = self.conn.execute("SELECT * FROM grants WHERE property_ref = ?",
                              (property_ref,)).fetchone()
        return dict(r) if r else None

"""In-process background jobs.

Renders take tens of seconds, so the UI can't block on them. This is a small
thread-pool with observable status — no broker, no extra dependency, and it dies
with the server, which is correct for a local single-user tool.
"""

from __future__ import annotations

import threading
import traceback
import uuid
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable

MAX_KEPT = 200


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@dataclass
class Job:
    id: str
    kind: str
    label: str
    status: str = "queued"          # queued | running | done | error
    detail: str = ""
    result: Any = None
    error: str = ""
    created_at: str = field(default_factory=_now)
    finished_at: str = ""

    def as_dict(self) -> dict:
        return {
            "id": self.id, "kind": self.kind, "label": self.label,
            "status": self.status, "detail": self.detail,
            "result": self.result, "error": self.error,
            "created_at": self.created_at, "finished_at": self.finished_at,
        }


class JobRunner:
    def __init__(self, workers: int = 2):
        self._pool = ThreadPoolExecutor(max_workers=max(1, workers))
        self._jobs: OrderedDict[str, Job] = OrderedDict()
        self._lock = threading.Lock()

    def submit(self, kind: str, label: str, fn: Callable[[Job], Any]) -> Job:
        job = Job(id=uuid.uuid4().hex[:12], kind=kind, label=label)
        with self._lock:
            self._jobs[job.id] = job
            while len(self._jobs) > MAX_KEPT:
                self._jobs.popitem(last=False)
        self._pool.submit(self._run, job, fn)
        return job

    def _run(self, job: Job, fn: Callable[[Job], Any]) -> None:
        job.status = "running"
        try:
            job.result = fn(job)
            job.status = "done"
        except Exception as exc:
            job.status = "error"
            # Keep the message useful; the pipeline raises with real explanations
            # (compliance refusals, missing grants) that the UI should surface.
            job.error = str(exc) or exc.__class__.__name__
            job.detail = traceback.format_exc(limit=3)
        finally:
            job.finished_at = _now()

    def get(self, job_id: str) -> Job | None:
        with self._lock:
            return self._jobs.get(job_id)

    def recent(self, limit: int = 40) -> list[dict]:
        with self._lock:
            jobs = list(self._jobs.values())
        return [j.as_dict() for j in reversed(jobs[-limit:])]

    def active(self) -> int:
        with self._lock:
            return sum(1 for j in self._jobs.values()
                       if j.status in ("queued", "running"))

    def shutdown(self) -> None:
        self._pool.shutdown(wait=False)

"""
Live scan progress: one task per (phase, service, region), persisted on the scan row and pushed
to browsers as `scan.progress` events.

Why persist AND push:
  - push (WebSocket) makes the grid update the instant a unit finishes;
  - persist (scans.progress JSON) means a page reload, a second browser tab, or a Celery worker in
    another process all see the same state. The WebSocket is an accelerator, never the source of truth.

Why a task list instead of a single percentage:
  a percentage that jumps 20 -> 90 tells you nothing. A grid that says "RDS in ap-south-1: AccessDenied"
  tells you exactly which blind spot the scan has, while it is still running.
"""
from __future__ import annotations

import logging
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Iterable, Optional

from sqlalchemy import update

from app.database import engine
from app.models.scan import Scan
from app.utils.events import bus

logger = logging.getLogger(__name__)

SERVICE_LABELS = {
    "iam": "IAM", "s3": "S3", "ec2": "EC2", "rds": "RDS", "lambda": "Lambda",
    "dynamodb": "DynamoDB", "secretsmanager": "Secrets Manager", "graph": "Attack graph",
}
FLUSH_EVERY = 0.25  # seconds; bounds DB writes + socket messages on accounts with many regions


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class ScanProgress:
    def __init__(self, scan_id: str, account_id: Optional[str] = None):
        self.scan_id = str(scan_id)
        self.account_id = account_id
        self.tasks: dict[str, dict] = {}
        self.stage = "queued"          # queued -> discovering -> analyzing -> completed | failed
        self.started_at = _now()
        self._lock = threading.Lock()
        self._last_flush = 0.0
        self._dirty = False

    # ─── task registry ─────────────────────────────────────────────────────
    @staticmethod
    def key(phase: str, service: str, region: str) -> str:
        return f"{phase}:{service}:{region}"

    def add(self, phase: str, service: str, region: str) -> str:
        k = self.key(phase, service, region)
        self.tasks[k] = {"id": k, "phase": phase, "service": service, "label": SERVICE_LABELS.get(service, service),
                         "region": region, "status": "queued", "findings": None, "warnings": 0, "error": None,
                         "started_at": None, "finished_at": None, "duration_ms": None}
        return k

    def add_many(self, items: Iterable[tuple[str, str, str]]):
        for phase, service, region in items:
            self.add(phase, service, region)

    # ─── transitions ───────────────────────────────────────────────────────
    def start(self, k: str):
        with self._lock:
            t = self.tasks[k]
            t["status"], t["started_at"] = "running", _now()
            t["_t0"] = time.monotonic()
        self.flush()

    def finish(self, k: str, findings: Optional[int] = None, warnings: int = 0):
        self._end(k, "partial" if warnings else "done", findings=findings, warnings=warnings)

    def fail(self, k: str, error: str):
        self._end(k, "failed", error=error[:300])

    def _end(self, k: str, status: str, **fields):
        with self._lock:
            t = self.tasks[k]
            t0 = t.pop("_t0", None)
            t.update(status=status, finished_at=_now(),
                     duration_ms=int((time.monotonic() - t0) * 1000) if t0 else None, **fields)
        self.flush()

    def set_stage(self, stage: str):
        with self._lock:
            self.stage = stage
        self.flush(force=True)

    # ─── views ─────────────────────────────────────────────────────────────
    def snapshot(self) -> dict:
        with self._lock:
            tasks = [{k: v for k, v in t.items() if not k.startswith("_")} for t in self.tasks.values()]
            stage = self.stage
        finished = sum(1 for t in tasks if t["status"] in ("done", "partial", "failed"))
        running = sum(1 for t in tasks if t["status"] == "running")
        total = len(tasks) or 1
        # running tasks count as half-done so the bar moves while long calls are in flight
        percent = 100 if stage == "completed" else min(99, int((finished + running * 0.5) / total * 100))
        return {
            "scan_id": self.scan_id, "account_id": self.account_id, "stage": stage, "percent": percent,
            "started_at": self.started_at, "updated_at": _now(),
            "totals": {"tasks": len(tasks), "finished": finished, "running": running,
                       "failed": sum(1 for t in tasks if t["status"] == "failed"),
                       "partial": sum(1 for t in tasks if t["status"] == "partial"),
                       "findings": sum(t["findings"] or 0 for t in tasks)},
            "regions": sorted({t["region"] for t in tasks if t["region"] != "global"}),
            "tasks": tasks,
        }

    # ─── persistence + push ────────────────────────────────────────────────
    def flush(self, force: bool = False):
        now = time.monotonic()
        with self._lock:
            if not force and now - self._last_flush < FLUSH_EVERY:
                self._dirty = True
                return
            self._last_flush, self._dirty = now, False
        snap = self.snapshot()
        try:
            with engine.begin() as conn:
                conn.execute(update(Scan.__table__).where(Scan.__table__.c.id == uuid.UUID(self.scan_id))
                             .values(progress=snap))
        except Exception as e:  # progress is best-effort; it must never fail the scan
            logger.warning("progress write failed: %s", e)
        bus.publish("scan.progress", "Scan progress", f"{snap['percent']}%", link="/scans",
                    scan_id=self.scan_id, progress=snap)

    def flush_pending(self):
        if self._dirty:
            self.flush(force=True)

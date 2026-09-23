"""
In-process scan scheduler for SCAN_EXECUTOR=background (no Redis/Celery needed).

Every SCAN_INTERVAL_MINUTES it runs the same pipeline as the "Start scan" button, so the
dashboard stays current without anyone clicking. With SCAN_EXECUTOR=celery, Celery beat owns
scheduling instead and this loop does not start.

  - Due time is measured from the last scan's start, so restarting the API does not trigger a scan
    storm (and a fresh install with no scans gets its first one right away).
  - Skips (and logs once) while AWS credentials don't work, instead of filling Scan History with
    failed rows every interval.
  - claim_scan() already refuses to start a second concurrent scan, so a manual scan and a
    scheduled one can't overlap.
"""
import asyncio
import logging
from datetime import datetime, timedelta

from app.config import settings
from app.database import SessionLocal
from app.models.scan import Scan
from app.tasks.scan_tasks import run_full_scan
from app.utils.aws_client import get_aws_account_id, reset_sessions

logger = logging.getLogger(__name__)
RETRY_WHEN_DISCONNECTED = timedelta(minutes=5)


def enabled() -> bool:
    return (settings.SCAN_EXECUTOR != "celery" and bool(settings.SCHEDULED_SCANS_ENABLED)
            and int(settings.SCAN_INTERVAL_MINUTES) > 0)


def _seconds_until_due(interval: timedelta) -> float:
    db = SessionLocal()
    try:
        last = db.query(Scan).order_by(Scan.started_at.desc()).first()
    finally:
        db.close()
    if not last or not last.started_at:
        return 0
    return max(0.0, (last.started_at + interval - datetime.utcnow()).total_seconds())


async def scan_loop():
    interval = timedelta(minutes=int(settings.SCAN_INTERVAL_MINUTES))
    logger.info("Scheduled scans on: every %s min (set SCHEDULED_SCANS_ENABLED=false to turn off)",
                settings.SCAN_INTERVAL_MINUTES)
    warned = False
    while True:
        try:
            await asyncio.sleep(await asyncio.to_thread(_seconds_until_due, interval))
            reset_sessions()   # pick up refreshed SSO/role credentials
            if not await asyncio.to_thread(get_aws_account_id):
                if not warned:
                    logger.warning("Scheduled scan skipped: AWS not connected (see GET /api/v1/account/preflight). "
                                   "Retrying every %d min.", RETRY_WHEN_DISCONNECTED.seconds // 60)
                    warned = True
                await asyncio.sleep(RETRY_WHEN_DISCONNECTED.total_seconds())
                continue
            warned = False
            logger.info("Scheduled scan starting")
            await asyncio.to_thread(run_full_scan, triggered_by="scheduler")
        except asyncio.CancelledError:
            raise
        except Exception:  # never let one bad run kill the scheduler
            logger.exception("Scheduled scan loop error; retrying in 5 min")
            await asyncio.sleep(RETRY_WHEN_DISCONNECTED.total_seconds())

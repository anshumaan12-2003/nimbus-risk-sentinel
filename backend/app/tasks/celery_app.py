from celery import Celery
from datetime import timedelta
from app.config import settings

celery_app = Celery(
    "nimbus",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["app.tasks.scan_tasks", "app.tasks.alert_tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    worker_prefetch_multiplier=1,
)

# ─── Periodic Tasks (Beat Scheduler) ─────────────────────────────────────
celery_app.conf.beat_schedule = {
    "scheduled-scan": {
        "task": "app.tasks.scan_tasks.run_full_scan_task",
        "schedule": timedelta(minutes=int(settings.SCAN_INTERVAL_MINUTES)),
        "kwargs": {"triggered_by": "scheduler"},
    },
}

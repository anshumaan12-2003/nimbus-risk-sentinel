"""
Nimbus Risk Sentinel — Async Alerting Tasks
"""

import logging
from app.tasks.celery_app import celery_app
from app.utils.slack_notifier import SlackNotifier
from app.config import settings

logger = logging.getLogger("nimbus.tasks.alerts")


@celery_app.task(name="app.tasks.alert_tasks.dispatch_slack_drift_alert")
def dispatch_slack_drift_alert(drift_data: dict, webhook_url: str = None):
    target_url = webhook_url or getattr(settings, "SLACK_WEBHOOK_URL", "")
    if not target_url:
        logger.warning("No SLACK_WEBHOOK_URL set — skipping Slack dispatch.")
        return {"status": "skipped", "reason": "No webhook URL configured"}

    payload = SlackNotifier.format_drift_blocks(drift_data)
    success, msg = SlackNotifier.send_webhook(target_url, payload)

    logger.info(f"Slack drift alert dispatch result: success={success}, message={msg}")
    return {"status": "success" if success else "failed", "message": msg}

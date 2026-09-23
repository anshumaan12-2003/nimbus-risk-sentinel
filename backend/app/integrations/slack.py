import requests
import logging
from app.config import settings

logger = logging.getLogger(__name__)

def send_slack_alert(finding):
    """
    Dispatch a CRITICAL security finding alert to Slack via webhook.
    """
    if not getattr(settings, 'SLACK_ENABLED', False):
        return False

    webhook_url = settings.SLACK_WEBHOOK_URL
    if not webhook_url or "your/webhook/url" in webhook_url:
        logger.info("SLACK_WEBHOOK_URL not configured or disabled. Skipping Slack alert.")
        return False

    title = finding.get("title", "Unknown Finding")
    rule_id = finding.get("rule_id", "N/A")
    resource = finding.get("resource_name", "N/A")
    severity = finding.get("severity", "CRITICAL")
    
    payload = {
        "blocks": [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": f"🚨 CRITICAL SECURITY ALERT: {rule_id}",
                    "emoji": True
                }
            },
            {
                "type": "section",
                "fields": [
                    {
                        "type": "mrkdwn",
                        "text": f"*Severity:*\n{severity}"
                    },
                    {
                        "type": "mrkdwn",
                        "text": f"*Resource:*\n`{resource}`"
                    }
                ]
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"*Description:*\n{title}"
                }
            },
            {
                "type": "divider"
            }
        ]
    }

    try:
        response = requests.post(webhook_url, json=payload, timeout=10)
        response.raise_for_status()
        logger.info(f"Successfully dispatched Slack alert for {rule_id}.")
        return True
    except Exception as e:
        logger.error(f"Failed to send Slack alert: {e}")
        return False

"""
Breachpath Cloud Recon — Slack Block Kit Alert Dispatcher
Formats and transmits real-time posture drift and security alert payloads to Slack.
"""

import json
import logging
import urllib.request
import urllib.error
from typing import Dict, Any, Optional, Tuple

logger = logging.getLogger("nimbus.slack")


class SlackNotifier:
    """Dispatches formatted Block Kit security notifications to Slack incoming webhooks."""

    @staticmethod
    def format_drift_blocks(drift_report: Dict[str, Any], dashboard_url: str = "http://localhost:3000") -> Dict[str, Any]:
        status = drift_report.get("status", "STABLE")
        delta = drift_report.get("risk_score_delta", 0)
        curr_score = drift_report.get("current_risk_score", 0)
        summary = drift_report.get("summary", {})
        
        status_emoji = "🚨" if status == "DEGRADED" else "✅" if status == "IMPROVED" else "ℹ️"
        delta_str = f"+{delta}" if delta > 0 else str(delta)

        blocks = [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": f"{status_emoji} Breachpath: Infrastructure Drift Detected [{status}]",
                    "emoji": True,
                },
            },
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*Risk Score:* `{curr_score}/100` ({delta_str} pts)"},
                    {"type": "mrkdwn", "text": f"*Scan ID:* `{drift_report.get('current_scan_id', 'N/A')[:8]}`"},
                    {"type": "mrkdwn", "text": f"*New Risks:* `{summary.get('new_count', 0)}`"},
                    {"type": "mrkdwn", "text": f"*Remediated:* `{summary.get('resolved_count', 0)}`"},
                ],
            },
            {"type": "divider"},
        ]

        # Highlight new findings if present
        new_findings = drift_report.get("new_findings", [])
        if new_findings:
            new_text = "*Newly Discovered Vulnerabilities:*\n"
            for f in new_findings[:4]:
                sev = f.get("severity", "HIGH")
                sev_icon = "🔴" if sev == "CRITICAL" else "🟠" if sev == "HIGH" else "🟡"
                new_text += f"{sev_icon} *[{f.get('rule_id')}]* {f.get('title')} (`{f.get('resource_name', 'asset')}`)\n"
            blocks.append({
                "type": "section",
                "text": {"type": "mrkdwn", "text": new_text},
            })

        # Regressions warning
        regressed = drift_report.get("regressed_findings", [])
        if regressed:
            reg_text = f"⚠️ *Regressions Alert:* {len(regressed)} previously resolved vulnerability reappeared!"
            blocks.append({
                "type": "section",
                "text": {"type": "mrkdwn", "text": reg_text},
            })

        # Action button
        blocks.append({
            "type": "actions",
            "elements": [
                {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "Inspect Drift in Dashboard", "emoji": True},
                    "url": f"{dashboard_url}/drift",
                    "style": "primary",
                }
            ],
        })

        return {"blocks": blocks}

    @classmethod
    def send_webhook(cls, webhook_url: str, payload: Dict[str, Any]) -> Tuple[bool, str]:
        """Transmits JSON payload to Slack webhook URL synchronously."""
        if not webhook_url:
            return False, "Slack Webhook URL is not configured."

        try:
            req = urllib.request.Request(
                webhook_url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=10) as response:
                if response.status == 200:
                    return True, "Slack alert delivered successfully."
                return False, f"Slack responded with status {response.status}"
        except urllib.error.HTTPError as e:
            logger.error(f"Slack HTTP error: {e.code} - {e.reason}")
            return False, f"HTTP Error {e.code}: {e.reason}"
        except Exception as e:
            logger.error(f"Failed to send Slack alert: {str(e)}")
            return False, str(e)


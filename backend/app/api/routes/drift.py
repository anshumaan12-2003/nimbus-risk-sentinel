"""
Breachpath Cloud Recon — Drift Detection & Alerting REST API Routes
"""

from typing import List, Optional
from urllib.parse import urlparse
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.auth.deps import admin
from app.database import get_db
from app.models.scan import Scan, ScanStatus
from app.models.finding import Finding
from app.intelligence.drift_detector import DriftDetector
from app.utils.slack_notifier import SlackNotifier
from app.config import settings

router = APIRouter(prefix="/drift", tags=["Drift Detection & Alerting"])


@router.get("/latest")
def get_latest_drift(db: Session = Depends(get_db)):
    """
    Computes posture drift between the most recent completed scan
    and the one preceding it.
    """
    completed_scans = (
        db.query(Scan)
        .filter(Scan.status == ScanStatus.COMPLETED)
        .order_by(desc(Scan.started_at))
        .limit(2)
        .all()
    )

    if not completed_scans:
        # Return initial baseline drift response
        return {
            "status": "STABLE",
            "risk_score_delta": 0,
            "current_risk_score": 0,
            "previous_risk_score": 0,
            "summary": {
                "new_count": 0,
                "resolved_count": 0,
                "regressed_count": 0,
                "persisting_count": 0,
                "total_drift_events": 0,
            },
            "new_findings": [],
            "resolved_findings": [],
            "regressed_findings": [],
            "message": "No completed scans found. Run your first scan to generate an initial posture baseline.",
        }

    curr_scan = completed_scans[0]
    prev_scan = completed_scans[1] if len(completed_scans) > 1 else None

    curr_findings = db.query(Finding).filter(Finding.scan_id == curr_scan.id).all()
    prev_findings = (
        db.query(Finding).filter(Finding.scan_id == prev_scan.id).all()
        if prev_scan
        else []
    )

    # Resolved history fingerprints
    resolved_findings = (
        db.query(Finding)
        .filter(Finding.status == "RESOLVED")
        .all()
    )
    resolved_fps = [DriftDetector._fingerprint(f) for f in resolved_findings]

    curr_score = int(curr_scan.risk_score or 0)
    prev_score = int(prev_scan.risk_score or 0) if prev_scan else 0

    report = DriftDetector.calculate_drift(
        current_scan_id=str(curr_scan.id),
        previous_scan_id=str(prev_scan.id) if prev_scan else "baseline",
        current_findings=curr_findings,
        previous_findings=prev_findings,
        resolved_history_fingerprints=resolved_fps,
        current_risk_score=curr_score,
        previous_risk_score=prev_score,
    )

    return report.to_dict()


@router.get("/timeline")
def get_drift_timeline(limit: int = Query(10, ge=1, le=50), db: Session = Depends(get_db)):
    """
    Returns sequential historical drift metrics across successive scans.
    """
    scans = (
        db.query(Scan)
        .filter(Scan.status == ScanStatus.COMPLETED)
        .order_by(desc(Scan.started_at))
        .limit(limit + 1)
        .all()
    )

    timeline = []
    for i in range(len(scans) - 1):
        curr_scan = scans[i]
        prev_scan = scans[i + 1]

        curr_findings = db.query(Finding).filter(Finding.scan_id == curr_scan.id).all()
        prev_findings = db.query(Finding).filter(Finding.scan_id == prev_scan.id).all()

        report = DriftDetector.calculate_drift(
            current_scan_id=str(curr_scan.id),
            previous_scan_id=str(prev_scan.id),
            current_findings=curr_findings,
            previous_findings=prev_findings,
            current_risk_score=int(curr_scan.risk_score or 0),
            previous_risk_score=int(prev_scan.risk_score or 0),
        )

        timeline.append({
            "timestamp": curr_scan.completed_at.isoformat() if curr_scan.completed_at else curr_scan.started_at.isoformat(),
            "scan_id": str(curr_scan.id),
            "account_id": curr_scan.account_id,
            "region": curr_scan.region,
            **report.to_dict(),
        })

    return timeline


@router.post("/webhook/test", dependencies=[Depends(admin)])
def test_slack_webhook(payload: dict = Body(...)):
    """
    Dispatches a test Block Kit alert to a specified Slack Webhook URL.
    """
    webhook_url = payload.get("webhook_url") or getattr(settings, "SLACK_WEBHOOK_URL", "")
    if not webhook_url:
        raise HTTPException(status_code=400, detail="Missing webhook_url in request payload or environment.")
    # the server makes this request: only allow Slack, never an arbitrary internal URL (SSRF)
    if urlparse(webhook_url).scheme != "https" or urlparse(webhook_url).hostname != "hooks.slack.com":
        raise HTTPException(status_code=422, detail="webhook_url must be an https://hooks.slack.com/ URL.")

    # Create realistic test drift data
    sample_drift = {
        "status": "DEGRADED",
        "risk_score_delta": 14,
        "current_risk_score": 84,
        "previous_risk_score": 70,
        "current_scan_id": "test-scn-9048a1",
        "summary": {
            "new_count": 2,
            "resolved_count": 1,
            "regressed_count": 0,
            "total_drift_events": 3,
        },
        "new_findings": [
            {
                "rule_id": "S3-001",
                "title": "S3 Bucket Public Read/Write ACL Enabled",
                "severity": "CRITICAL",
                "service": "s3",
                "resource_name": "customer-finance-records-2026",
            },
            {
                "rule_id": "EC2-001",
                "title": "Security Group Ingress Allows 0.0.0.0/0 on SSH Port 22",
                "severity": "HIGH",
                "service": "ec2",
                "resource_name": "bastion-host-ingress-sg",
            }
        ],
    }

    slack_blocks = SlackNotifier.format_drift_blocks(sample_drift)
    success, message = SlackNotifier.send_webhook(webhook_url, slack_blocks)

    if not success:
        raise HTTPException(status_code=502, detail=f"Failed delivering alert to Slack: {message}")

    return {
        "status": "success",
        "message": "Slack Block Kit alert delivered successfully!",
        "payload_sent": slack_blocks,
    }

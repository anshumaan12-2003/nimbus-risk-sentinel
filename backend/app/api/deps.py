"""Shared query helpers: 'current posture' == findings of the latest COMPLETED scan."""
from typing import Optional
from sqlalchemy.orm import Session
from app.models.scan import Scan, ScanStatus


def latest_completed_scan(db: Session) -> Optional[Scan]:
    return (db.query(Scan).filter(Scan.status == ScanStatus.COMPLETED)
            .order_by(Scan.completed_at.desc()).first())

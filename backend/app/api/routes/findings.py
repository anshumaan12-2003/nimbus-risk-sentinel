from datetime import datetime, timezone
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.api.deps import latest_completed_scan
from app.auth.deps import engineer
from app.models.user import User
from app.database import get_db
from app.models.finding import Finding, FindingStatus, Severity
from app.schemas.finding import FindingResponse, FindingStats
from app.utils.events import bus

router = APIRouter(prefix="/findings", tags=["Findings"])


def _scoped(db: Session, scan_id: Optional[UUID], scope: str):
    """scope=latest (default): current posture only. scope=all: every historical row."""
    q = db.query(Finding).options(joinedload(Finding.resource))
    if scan_id:
        return q.filter(Finding.scan_id == scan_id)
    if scope == "latest":
        latest = latest_completed_scan(db)
        return q.filter(Finding.scan_id == latest.id) if latest else q.filter(False)
    return q


@router.get("", response_model=list[FindingResponse])
def list_findings(severity: Optional[Severity] = None, status: Optional[FindingStatus] = None,
                  service: Optional[str] = None, scan_id: Optional[UUID] = None,
                  scope: Literal["latest", "all"] = "latest",
                  limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0),
                  db: Session = Depends(get_db)):
    q = _scoped(db, scan_id, scope)
    if severity:
        q = q.filter(Finding.severity == severity)
    if status:
        q = q.filter(Finding.status == status)
    if service:
        q = q.filter(Finding.service == service)
    return q.order_by(Finding.risk_score.desc()).offset(offset).limit(limit).all()


@router.get("/stats", response_model=FindingStats)
def get_finding_stats(scan_id: Optional[UUID] = None, db: Session = Depends(get_db)):
    rows = _scoped(db, scan_id, "latest").all()
    latest = latest_completed_scan(db)
    by = lambda sev: sum(1 for f in rows if f.severity == sev)
    return FindingStats(
        total=len(rows), critical=by(Severity.CRITICAL), high=by(Severity.HIGH),
        medium=by(Severity.MEDIUM), low=by(Severity.LOW),
        open=sum(1 for f in rows if f.status == FindingStatus.OPEN),
        resolved=sum(1 for f in rows if f.status == FindingStatus.RESOLVED),
        # account-level score from the scan (not max of one finding)
        risk_score=int(latest.risk_score) if latest and latest.risk_score else 0,
    )


@router.get("/{finding_id}", response_model=FindingResponse)
def get_finding(finding_id: UUID, db: Session = Depends(get_db)):
    f = db.query(Finding).options(joinedload(Finding.resource)).filter(Finding.id == finding_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="Finding not found")
    return f


@router.patch("/{finding_id}/status")
def update_finding_status(finding_id: UUID, status: FindingStatus, assigned_to: Optional[str] = None,
                          user: User = Depends(engineer), db: Session = Depends(get_db)):
    f = db.query(Finding).filter(Finding.id == finding_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="Finding not found")
    f.status = status
    if assigned_to is not None:
        f.assigned_to = assigned_to
    f.resolved_at = datetime.now(timezone.utc) if status == FindingStatus.RESOLVED else None
    db.commit()
    bus.publish("workflow.moved", f"{f.rule_id} → {status.value}", f"{f.resource_name or ''} · by {user.name}", link="/workflow")
    return {"message": f"Finding status updated to {status.value}", "finding_id": str(finding_id)}

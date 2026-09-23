from typing import Optional
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth.deps import engineer
from app.config import settings
from app.database import get_db
from app.models.inventory import InventorySnapshot
from app.models.scan import Scan, ScanStatus
from app.models.user import User
from app.schemas.scan import ScanDetail, ScanResponse, ScanTriggerRequest
from app.tasks.scan_tasks import claim_scan, run_full_scan

router = APIRouter(prefix="/scans", tags=["Scans"])


@router.post("/trigger", response_model=ScanResponse, status_code=202)
def trigger_scan(background_tasks: BackgroundTasks, request: ScanTriggerRequest = ScanTriggerRequest(),
                 user: User = Depends(engineer), db: Session = Depends(get_db)):
    """Queue a scan (engineer+). 409 if one is already running (prevents double-clicks stacking scans)."""
    scan = claim_scan(db, user.email, request.regions)
    if scan is None:
        raise HTTPException(status_code=409, detail="A scan is already running")
    if settings.SCAN_EXECUTOR == "celery":
        from app.tasks.scan_tasks import run_full_scan_task
        run_full_scan_task.delay(scan_id=str(scan.id), regions=request.regions, triggered_by=user.email)
    else:
        background_tasks.add_task(run_full_scan, scan_id=str(scan.id), regions=request.regions, triggered_by=user.email)
    return scan


@router.get("", response_model=list[ScanResponse])
def list_scans(limit: int = 20, offset: int = 0, db: Session = Depends(get_db)):
    return db.query(Scan).order_by(Scan.started_at.desc()).offset(offset).limit(limit).all()


@router.get("/latest", response_model=Optional[ScanResponse])
def get_latest_scan(db: Session = Depends(get_db)):
    return (db.query(Scan).filter(Scan.status == ScanStatus.COMPLETED)
            .order_by(Scan.completed_at.desc()).first())


@router.get("/active", response_model=Optional[ScanDetail])
def get_active_scan(db: Session = Depends(get_db)):
    return db.query(Scan).filter(Scan.status.in_([ScanStatus.PENDING, ScanStatus.RUNNING])).first()


@router.get("/{scan_id}", response_model=ScanDetail)
def get_scan(scan_id: UUID, db: Session = Depends(get_db)):
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    return scan


@router.get("/{scan_id}/progress")
def get_scan_progress(scan_id: UUID, db: Session = Depends(get_db)):
    """Per service x region task grid. Live while the scan runs; kept afterwards as a coverage record."""
    scan = db.query(Scan).filter(Scan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    return scan.progress or {"scan_id": str(scan_id), "stage": scan.status.value.lower(), "percent":
                             100 if scan.status == ScanStatus.COMPLETED else 0, "tasks": [], "regions": [],
                             "legacy": True}


@router.get("/{scan_id}/warnings")
def get_scan_warnings(scan_id: UUID, db: Session = Depends(get_db)):
    """Which AWS API calls failed (usually AccessDenied) — i.e. what the dashboard is blind to."""
    snap = db.query(InventorySnapshot).filter(InventorySnapshot.scan_id == scan_id).first()
    return {"scan_id": str(scan_id), "warnings": snap.warnings if snap else [],
            "asset_counts": (snap.data or {}).get("counts", {}) if snap else {}}

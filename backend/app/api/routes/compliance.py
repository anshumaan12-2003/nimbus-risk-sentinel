from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import latest_completed_scan
from app.database import get_db
from app.intelligence.compliance_map import CONTROLS, FRAMEWORKS
from app.models.finding import Finding, FindingStatus
from app.models.inventory import InventorySnapshot

router = APIRouter(prefix="/compliance", tags=["Compliance"])

SERVICE_SCANNERS = {"iam": "IAMScanner", "s3": "S3Scanner", "ec2": "EC2Scanner", "rds": "RDSScanner"}


def _evaluate(db: Session):
    scan = latest_completed_scan(db)
    if not scan:
        return None, []
    failing_rules: dict[str, list[str]] = {}
    for f in db.query(Finding).filter(Finding.scan_id == scan.id,
                                      Finding.status.in_([FindingStatus.OPEN, FindingStatus.IN_PROGRESS])).all():
        failing_rules.setdefault(f.rule_id, []).append(str(f.id))
    snap = db.query(InventorySnapshot).filter(InventorySnapshot.scan_id == scan.id).first()
    blind = {w["service"] for w in (snap.warnings if snap else []) if w.get("call") == "scan"}

    controls = []
    for cid, title, service, rules, fw in CONTROLS:
        ids = [fid for r in rules for fid in failing_rules.get(r, [])]
        if SERVICE_SCANNERS[service] in blind:
            status = "NOT_EVALUATED"
        else:
            status = "FAIL" if ids else "PASS"
        controls.append({"id": cid, "title": title, "service": service, "rules": rules,
                         "frameworks": fw, "status": status, "failing_finding_ids": ids})
    return scan, controls


@router.get("")
def get_compliance_benchmarks(db: Session = Depends(get_db)):
    """Framework scores computed from the latest scan (same shape the UI already renders)."""
    scan, controls = _evaluate(db)
    out = []
    for key, meta in FRAMEWORKS.items():
        mapped = [c for c in controls if key in c["frameworks"]]
        evaluated = [c for c in mapped if c["status"] != "NOT_EVALUATED"]
        passing = sum(1 for c in evaluated if c["status"] == "PASS")
        failing = len(evaluated) - passing
        score = round(100 * passing / len(evaluated)) if evaluated else 0
        status = ("NO_DATA" if not evaluated else "COMPLIANT" if failing == 0
                  else "NEAR_COMPLIANT" if score >= 85 else "ACTION_REQUIRED" if score >= 70 else "HIGH_RISK")
        out.append({**meta, "score": score, "passingRules": passing, "failingRules": failing,
                    "notEvaluated": len(mapped) - len(evaluated), "status": status,
                    "scan_id": str(scan.id) if scan else None})
    return out


@router.get("/controls")
def get_controls(db: Session = Depends(get_db)):
    """Per-control pass/fail with the finding ids that break each control."""
    scan, controls = _evaluate(db)
    return {"scan_id": str(scan.id) if scan else None, "controls": controls}

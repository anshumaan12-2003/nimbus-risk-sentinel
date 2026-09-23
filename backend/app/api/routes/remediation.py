"""
Remediation API — four-eyes by design.

  POST /remediation/dry-run                    engineer+   preview the exact AWS change (no writes)
  POST /remediation/requests                   engineer+   freeze the dry-run + justification, ask for approval
  GET  /remediation/requests?status=PENDING    viewer+
  POST /remediation/requests/{id}/approve      approver+   a DIFFERENT person approves -> AWS is changed + verified
  POST /remediation/requests/{id}/reject       approver+
  POST /remediation/requests/{id}/cancel       the requester (or an admin)
  GET  /remediation/audit-trail                viewer+     who requested, who approved, what changed, rollback

Why no direct "apply": a single compromised or careless account should not be able to change
production. The actor recorded in the audit log is the signed-in user from the token, never a
string sent by the browser.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.auth.deps import approver, engineer, viewer
from app.config import settings
from app.database import get_db
from app.models.audit_log import AuditLog
from app.models.finding import Finding, FindingStatus
from app.models.remediation_request import RemediationRequest, RequestStatus
from app.models.user import Role, User
from app.remediation.aws_remediators import RemediationNotSupported, get_remediator_for_finding
from app.utils.events import bus

router = APIRouter(prefix="/remediation", tags=["Auto-Remediation"])


def _now():
    return datetime.now(timezone.utc)


def _resolve(payload: dict, db: Session):
    finding: Optional[Finding] = None
    if payload.get("finding_id"):
        try:
            fid = uuid.UUID(str(payload["finding_id"]))
        except ValueError:
            raise HTTPException(422, "finding_id must be a UUID")
        finding = (db.query(Finding).options(joinedload(Finding.resource))
                   .filter(Finding.id == fid).first())
        if not finding:
            raise HTTPException(404, "Finding not found")
    if finding:
        return finding, finding.rule_id, finding.resource.resource_id, finding.region
    if not payload.get("rule_id") or not payload.get("resource_id"):
        raise HTTPException(422, "Provide finding_id, or rule_id + resource_id")
    return None, payload["rule_id"], payload["resource_id"], payload.get("region")


def _aws_error(e: Exception) -> HTTPException:
    if isinstance(e, ClientError):
        err = e.response.get("Error", {})
        return HTTPException(502, f"AWS {err.get('Code')}: {err.get('Message')}")
    return HTTPException(502, f"AWS error: {e}")


def _out(r: RemediationRequest) -> dict:
    return {c.name: (getattr(r, c.name).isoformat() if isinstance(getattr(r, c.name), datetime)
                     else getattr(r, c.name).value if hasattr(getattr(r, c.name), "value")
                     else getattr(r, c.name)) for c in RemediationRequest.__table__.columns}


@router.post("/dry-run")
def dry_run_remediation(payload: dict = Body(...), _: User = Depends(engineer), db: Session = Depends(get_db)):
    finding, rule_id, resource_id, region = _resolve(payload, db)
    try:
        diff = get_remediator_for_finding(rule_id, resource_id, region).dry_run()
        return {"status": "ready_for_review", "supported": True, "apply_enabled": settings.REMEDIATION_ENABLED,
                "two_person_rule": settings.REMEDIATION_TWO_PERSON_RULE, "dry_run": diff}
    except RemediationNotSupported as e:
        return {"status": "manual_required", "supported": False, "apply_enabled": False, "dry_run": {
            "rule_id": rule_id, "resource_id": resource_id, "action": "Manual remediation required",
            "before_state": {"status": "Finding open"}, "after_state": {"guidance": str(e)},
            "risk_reduction": "Closes on next scan once fixed", "estimated_downtime": "Depends on change",
            "remediation_cmd": (finding.remediation_cmd if finding else None) or "", "rollback_cmd": ""}}
    except (ClientError, BotoCoreError) as e:
        raise _aws_error(e)


@router.post("/requests", status_code=201)
def create_request(payload: dict = Body(...), user: User = Depends(engineer), db: Session = Depends(get_db)):
    finding, rule_id, resource_id, region = _resolve(payload, db)
    dup = db.query(RemediationRequest).filter(RemediationRequest.rule_id == rule_id,
                                              RemediationRequest.resource_id == resource_id,
                                              RemediationRequest.status == RequestStatus.PENDING).first()
    if dup:
        raise HTTPException(409, f"A request for this fix is already waiting for approval (by {dup.requested_by}).")
    try:
        diff = get_remediator_for_finding(rule_id, resource_id, region).dry_run()
    except RemediationNotSupported as e:
        raise HTTPException(400, f"Nimbus cannot apply this fix automatically: {e}")
    except (ClientError, BotoCoreError) as e:
        raise _aws_error(e)
    req = RemediationRequest(
        finding_id=str(finding.id) if finding else None, rule_id=rule_id, resource_id=resource_id,
        resource_name=finding.resource_name if finding else None, region=region,
        severity=(finding.severity.value if finding and hasattr(finding.severity, "value") else None),
        title=finding.title if finding else None, dry_run=diff,
        justification=(payload.get("justification") or "").strip()[:2000] or None,
        requested_by_id=user.id, requested_by=user.email)
    db.add(req)
    if finding and finding.status == FindingStatus.OPEN:
        finding.status = FindingStatus.IN_PROGRESS
    db.commit()
    bus.publish("remediation.requested", f"Approval needed: {rule_id}", f"{req.resource_name or resource_id} · by {user.name}",
                severity="MEDIUM", link="/approvals", request_id=req.id)
    return _out(req)


@router.get("/requests")
def list_requests(status: Optional[RequestStatus] = None, limit: int = 100,
                  _: User = Depends(viewer), db: Session = Depends(get_db)):
    q = db.query(RemediationRequest)
    if status:
        q = q.filter(RemediationRequest.status == status)
    return [_out(r) for r in q.order_by(RemediationRequest.created_at.desc()).limit(min(limit, 500)).all()]


def _pending(db: Session, request_id: str) -> RemediationRequest:
    req = db.get(RemediationRequest, request_id)
    if not req:
        raise HTTPException(404, "Request not found")
    if req.status != RequestStatus.PENDING:
        raise HTTPException(409, f"Request is already {req.status.value.lower()}.")
    return req


@router.post("/requests/{request_id}/approve")
def approve_request(request_id: str, payload: dict = Body(default={}), user: User = Depends(approver),
                    db: Session = Depends(get_db)):
    req = _pending(db, request_id)
    self_approval = req.requested_by_id == user.id
    if self_approval and settings.REMEDIATION_TWO_PERSON_RULE:
        raise HTTPException(403, "Four-eyes rule: someone other than the requester must approve this change.")
    if not settings.REMEDIATION_ENABLED:
        raise HTTPException(403, "Remediation writes are disabled on the server. Set REMEDIATION_ENABLED=true "
                                 "(and AWS_REMEDIATION_ROLE_ARN) to allow approved fixes to run.")
    actor = user.email
    note = (payload.get("note") or "").strip()[:2000] or None
    try:
        ok, message, entry = get_remediator_for_finding(req.rule_id, req.resource_id, req.region).apply(actor)
    except RemediationNotSupported as e:
        raise HTTPException(400, str(e))
    except (ClientError, BotoCoreError) as e:
        log = AuditLog(rule_id=req.rule_id, resource_id=req.resource_id, action_executed="failed",
                       executed_by=actor, requested_by=req.requested_by, request_id=req.id,
                       status="FAILED", result_message=str(e)[:1000])
        db.add(log)
        db.flush()
        req.status, req.result_message, req.audit_log_id = RequestStatus.FAILED, str(e)[:1000], log.id
        req.decided_by_id, req.decided_by, req.decided_at, req.decision_note = user.id, actor, _now(), note
        db.commit()
        raise _aws_error(e)

    log = AuditLog(rule_id=req.rule_id, resource_id=req.resource_id,
                   action_executed=entry.get("action_executed", "unknown"), executed_by=actor,
                   requested_by=req.requested_by, request_id=req.id,
                   status=("VERIFIED_RESOLVED" if ok else "VERIFY_FAILED"),
                   result_message=message + (" (self-approved: two-person rule is off)" if self_approval else ""),
                   rollback_command=entry.get("rollback", {}), timestamp=_now())
    db.add(log)
    db.flush()
    req.status = RequestStatus.APPLIED if ok else RequestStatus.FAILED
    req.result_message, req.audit_log_id = message, log.id
    req.decided_by_id, req.decided_by, req.decided_at, req.decision_note = user.id, actor, _now(), note
    if ok and req.finding_id:
        finding = db.get(Finding, uuid.UUID(req.finding_id))
        if finding:
            finding.status, finding.resolved_at = FindingStatus.RESOLVED, _now()
    db.commit()
    if not ok:
        raise HTTPException(500, message)
    bus.publish("remediation.applied", f"{req.rule_id} remediated", f"{req.resource_name or req.resource_id} · "
                f"requested by {req.requested_by}, approved by {actor}", link="/approvals", request_id=req.id)
    return {"status": "success", "message": message, "audit_id": log.id, "rollback": entry.get("rollback"),
            "request": _out(req)}


@router.post("/requests/{request_id}/reject")
def reject_request(request_id: str, payload: dict = Body(default={}), user: User = Depends(approver),
                   db: Session = Depends(get_db)):
    req = _pending(db, request_id)
    note = (payload.get("note") or "").strip()[:2000]
    if not note:
        raise HTTPException(422, "Add a note so the requester knows why.")
    req.status, req.decided_by_id, req.decided_by, req.decided_at, req.decision_note = \
        RequestStatus.REJECTED, user.id, user.email, _now(), note
    db.commit()
    bus.publish("remediation.rejected", f"Rejected: {req.rule_id}", f"{req.resource_name or req.resource_id} · {note[:80]}",
                severity="MEDIUM", link="/approvals", request_id=req.id)
    return _out(req)


@router.post("/requests/{request_id}/cancel")
def cancel_request(request_id: str, user: User = Depends(engineer), db: Session = Depends(get_db)):
    req = _pending(db, request_id)
    if req.requested_by_id != user.id and user.role != Role.ADMIN:
        raise HTTPException(403, "Only the requester or an admin can withdraw a request.")
    req.status, req.decided_by_id, req.decided_by, req.decided_at = RequestStatus.CANCELLED, user.id, user.email, _now()
    db.commit()
    return _out(req)


@router.get("/audit-trail")
def get_remediation_audit_trail(limit: int = 100, _: User = Depends(viewer), db: Session = Depends(get_db)):
    rows = db.query(AuditLog).order_by(AuditLog.timestamp.desc()).limit(limit).all()
    return [{"id": r.id, "rule_id": r.rule_id, "resource_id": r.resource_id, "action_executed": r.action_executed,
             "executed_by": r.executed_by, "requested_by": r.requested_by, "request_id": r.request_id,
             "timestamp": r.timestamp.isoformat() if r.timestamp else None,
             "status": r.status, "result_message": r.result_message, "rollback_command": r.rollback_command}
            for r in rows]

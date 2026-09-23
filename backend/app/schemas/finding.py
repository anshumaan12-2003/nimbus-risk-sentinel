from pydantic import BaseModel, model_validator
from typing import Optional
from datetime import datetime
from uuid import UUID
from app.models.finding import Severity, FindingStatus


class FindingBase(BaseModel):
    rule_id: str
    title: str
    description: str
    recommendation: Optional[str] = None
    severity: Severity
    risk_score: int
    service: str
    region: Optional[str] = None
    resource_name: Optional[str] = None


class FindingResponse(FindingBase):
    id: UUID
    scan_id: UUID
    # AWS identifier (ARN / sg-id / instance id) — what remediation & the UI actually need.
    # Previously this exposed the internal DB row UUID, which broke dry-run/apply.
    resource_id: str
    resource_pk: Optional[UUID] = None
    status: FindingStatus
    assigned_to: Optional[str] = None
    remediation_cmd: Optional[str] = None
    detected_at: datetime
    resolved_at: Optional[datetime] = None

    class Config:
        from_attributes = True

    @model_validator(mode="before")
    @classmethod
    def _from_orm(cls, obj):
        if hasattr(obj, "__table__"):  # SQLAlchemy Finding row
            data = {c.name: getattr(obj, c.name) for c in obj.__table__.columns}
            data["resource_pk"] = obj.resource_id
            data["resource_id"] = obj.resource.resource_id if obj.resource is not None else str(obj.resource_id)
            return data
        return obj


class FindingFilter(BaseModel):
    severity: Optional[Severity] = None
    status: Optional[FindingStatus] = None
    service: Optional[str] = None
    scan_id: Optional[UUID] = None


class FindingStats(BaseModel):
    total: int
    critical: int
    high: int
    medium: int
    low: int
    open: int
    resolved: int
    risk_score: int
    by_service: dict[str, int] = {}   # open findings per service, e.g. {"s3": 4, "iam": 7}

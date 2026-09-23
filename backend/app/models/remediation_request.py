"""Four-eyes remediation: an engineer requests a fix (with the dry-run diff frozen at request time),
a *different* approver approves it, and only then does Nimbus call AWS."""
import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Column, DateTime, Enum as SAEnum, String, Text

from app.database import Base


class RequestStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPLIED = "APPLIED"        # approved and AWS change verified
    FAILED = "FAILED"          # approved but AWS rejected / verification failed
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"    # withdrawn by the requester


class RemediationRequest(Base):
    __tablename__ = "remediation_requests"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    finding_id = Column(String(36), nullable=True, index=True)
    rule_id = Column(String(50), nullable=False)
    resource_id = Column(String(500), nullable=False)
    resource_name = Column(String(500), nullable=True)
    region = Column(String(50), nullable=True)
    severity = Column(String(20), nullable=True)
    title = Column(String(500), nullable=True)
    dry_run = Column(JSON, nullable=False)
    justification = Column(Text, nullable=True)
    status = Column(SAEnum(RequestStatus, name="remediation_request_status"), nullable=False,
                    default=RequestStatus.PENDING, index=True)
    requested_by_id = Column(String(36), nullable=False)
    requested_by = Column(String(320), nullable=False)
    decided_by_id = Column(String(36), nullable=True)
    decided_by = Column(String(320), nullable=True)
    decision_note = Column(Text, nullable=True)
    result_message = Column(Text, nullable=True)
    audit_log_id = Column(String(36), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    decided_at = Column(DateTime(timezone=True), nullable=True)

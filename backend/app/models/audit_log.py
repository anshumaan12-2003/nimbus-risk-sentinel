from sqlalchemy import Column, String, DateTime, Text, JSON
from datetime import datetime, timezone
from app.database import Base
import uuid

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    rule_id = Column(String, nullable=False)
    resource_id = Column(String, nullable=False)
    action_executed = Column(String, nullable=False)
    executed_by = Column(String, nullable=False, default="system")   # the approver whose click changed AWS
    requested_by = Column(String, nullable=True)                       # the engineer who asked for it
    request_id = Column(String(36), nullable=True)
    status = Column(String, nullable=False)
    result_message = Column(Text, nullable=True)
    rollback_command = Column(JSON, nullable=True)
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

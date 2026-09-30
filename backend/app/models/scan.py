import uuid
from sqlalchemy import JSON, Column, Integer, String, DateTime, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base
from app.utils.clock import utcnow_naive
import enum


class ScanStatus(str, enum.Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class Scan(Base):
    __tablename__ = "scans"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    status = Column(SAEnum(ScanStatus), default=ScanStatus.PENDING, nullable=False)
    account_id = Column(String(255), nullable=True)
    region = Column(String(100), nullable=True)
    triggered_by = Column(String(255), default="manual")
    total_findings = Column(Integer, nullable=False, default=0)
    critical_count = Column(Integer, nullable=False, default=0)
    high_count = Column(Integer, nullable=False, default=0)
    medium_count = Column(Integer, nullable=False, default=0)
    low_count = Column(Integer, nullable=False, default=0)
    risk_score = Column(Integer, nullable=False, default=0)
    error_message = Column(String(1000), nullable=True)
    started_at = Column(DateTime, default=utcnow_naive)
    completed_at = Column(DateTime, nullable=True)
    # live progress: per service x region task list (see app/tasks/progress.py)
    progress = Column(JSON, nullable=True)

    # Relationships
    findings = relationship("Finding", back_populates="scan", cascade="all, delete-orphan")
    resources = relationship("Resource", back_populates="scan", cascade="all, delete-orphan")

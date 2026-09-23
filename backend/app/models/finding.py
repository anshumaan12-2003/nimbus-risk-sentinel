import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Integer, ForeignKey, Text, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base
import enum


class Severity(str, enum.Enum):
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    INFO = "INFO"


class FindingStatus(str, enum.Enum):
    OPEN = "OPEN"
    IN_PROGRESS = "IN_PROGRESS"
    RESOLVED = "RESOLVED"
    ACCEPTED = "ACCEPTED"


class Finding(Base):
    __tablename__ = "findings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scan_id = Column(UUID(as_uuid=True), ForeignKey("scans.id"), nullable=False)
    resource_id = Column(UUID(as_uuid=True), ForeignKey("resources.id"), nullable=False)

    # Rule info
    rule_id = Column(String(50), nullable=False)       # e.g., "S3-001"
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    recommendation = Column(Text, nullable=True)
    remediation_cmd = Column(Text, nullable=True)

    # Risk
    severity = Column(SAEnum(Severity), nullable=False)
    risk_score = Column(Integer, default=0)            # 0-100

    # Status
    status = Column(SAEnum(FindingStatus), default=FindingStatus.OPEN, nullable=False)
    assigned_to = Column(String(255), nullable=True)

    # Metadata
    service = Column(String(50), nullable=False)       # s3, iam, ec2, rds
    region = Column(String(100), nullable=True)
    resource_name = Column(String(255), nullable=True)

    detected_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)

    # Relationships
    scan = relationship("Scan", back_populates="findings")
    resource = relationship("Resource", back_populates="findings")

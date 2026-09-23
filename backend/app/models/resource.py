import uuid
from sqlalchemy import Column, String, DateTime, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class Resource(Base):
    __tablename__ = "resources"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scan_id = Column(UUID(as_uuid=True), ForeignKey("scans.id"), nullable=False)
    resource_arn = Column(String(500), nullable=True)
    resource_id = Column(String(255), nullable=False)
    resource_type = Column(String(100), nullable=False)  # s3, iam_user, ec2, rds
    name = Column(String(255), nullable=True)
    region = Column(String(100), nullable=True)
    account_id = Column(String(255), nullable=True)
    tags = Column(JSON, default=dict)
    metadata_ = Column("metadata", JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    scan = relationship("Scan", back_populates="resources")
    findings = relationship("Finding", back_populates="resource", cascade="all, delete-orphan")

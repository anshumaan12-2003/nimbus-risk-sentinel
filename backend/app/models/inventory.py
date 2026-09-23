import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, DateTime, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class InventorySnapshot(Base):
    """Full asset inventory captured during a scan (not just resources with findings).

    Stored as one JSON document per scan: the attack graph, compliance coverage and
    the Topology page are all derived from it, so they reflect the real account.
    """
    __tablename__ = "inventory_snapshots"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scan_id = Column(UUID(as_uuid=True), ForeignKey("scans.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    data = Column(JSON, nullable=False, default=dict)
    warnings = Column(JSON, nullable=False, default=list)   # e.g. AccessDenied per API call
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

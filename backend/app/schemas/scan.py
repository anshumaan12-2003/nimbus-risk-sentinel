from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from uuid import UUID
from app.models.scan import ScanStatus


class ScanTriggerRequest(BaseModel):
    regions: Optional[list[str]] = None


class ScanResponse(BaseModel):
    id: UUID
    status: ScanStatus
    account_id: Optional[str] = None
    region: Optional[str] = None
    triggered_by: str
    total_findings: str
    critical_count: str
    high_count: str
    medium_count: str
    low_count: str
    risk_score: str
    error_message: Optional[str] = None
    started_at: datetime
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ScanDetail(ScanResponse):
    """Single-scan views carry the progress grid; the list endpoint stays light."""
    progress: Optional[dict] = None

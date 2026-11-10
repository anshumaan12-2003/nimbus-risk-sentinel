from pydantic import BaseModel, ConfigDict
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
    total_findings: int
    critical_count: int
    high_count: int
    medium_count: int
    low_count: int
    risk_score: int
    error_message: Optional[str] = None
    started_at: datetime
    completed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class ScanDetail(ScanResponse):
    """Single-scan views carry the progress grid; the list endpoint stays light."""
    progress: Optional[dict] = None

from fastapi import APIRouter, Depends, HTTPException, Body
from typing import Dict, Any
from app.auth.deps import get_current_user
from app.config import settings
from app.intelligence.copilot import copilot_engine
from app.models.user import User
from app.utils.ratelimit import SlidingWindow
import logging

_limiter = SlidingWindow(limit=settings.COPILOT_REQUESTS_PER_MINUTE, window_seconds=60)


def rate_limited(user: User = Depends(get_current_user)) -> User:
    """Copilot calls cost money (Gemini) — cap them per user."""
    if not _limiter.hit(user.id):
        raise HTTPException(429, f"Copilot limit reached ({settings.COPILOT_REQUESTS_PER_MINUTE}/min). "
                                 f"Try again in {_limiter.retry_after(user.id)}s.")
    return user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/copilot", tags=["AI Copilot"])

@router.post("/explain", dependencies=[Depends(rate_limited)])
def explain_finding(payload: Dict[str, Any] = Body(...)):
    """
    Leverages AI Copilot to explain a finding in plain English
    and provide business context.
    """
    try:
        explanation = copilot_engine.explain_finding(payload)
        return {"status": "success", "explanation": explanation}
    except Exception as e:
        logger.error(f"Failed to explain finding: {e}")
        raise HTTPException(status_code=500, detail="AI Copilot is currently unavailable.")

@router.post("/remediate", dependencies=[Depends(rate_limited)])
def generate_remediation(payload: Dict[str, Any] = Body(...)):
    """
    Generates exact infrastructure-as-code or CLI commands
    to remediate the security finding.
    """
    format = payload.get("format", "cli")
    try:
        script = copilot_engine.generate_remediation_script(payload, format=format)
        return {"status": "success", "script": script}
    except Exception as e:
        logger.error(f"Failed to generate remediation: {e}")
        raise HTTPException(status_code=500, detail="AI Copilot is currently unavailable.")



# ─── Grounded chat ──────────────────────────────────────────────────────────
from fastapi import Depends  # noqa: E402
from sqlalchemy.orm import Session, joinedload  # noqa: E402
from app.api.deps import latest_completed_scan  # noqa: E402
from app.database import get_db  # noqa: E402
from app.models.finding import Finding, FindingStatus  # noqa: E402

SEV_ORDER = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3, "INFO": 4}


def _posture_context(db: Session) -> tuple[str, str]:
    """Compact, factual context for the model + an honest non-AI fallback answer."""
    scan = latest_completed_scan(db)
    if not scan:
        msg = "There is no completed scan yet, so I have no data about your account. Run a scan first."
        return "No completed scan.", msg
    rows = (db.query(Finding).options(joinedload(Finding.resource))
            .filter(Finding.scan_id == scan.id, Finding.status != FindingStatus.RESOLVED).all())
    rows.sort(key=lambda f: (SEV_ORDER.get(f.severity.value, 9), -(f.risk_score or 0)))
    counts: dict[str, int] = {}
    for f in rows:
        counts[f.severity.value] = counts.get(f.severity.value, 0) + 1
    lines = [f"- [{f.severity.value}] {f.rule_id} {f.title} | resource={f.resource.resource_id} | region={f.region} "
             f"| status={f.status.value} | fix: {(f.remediation_cmd or f.recommendation or '')[:220]}" for f in rows[:25]]
    ctx = (f"Account: {scan.account_id} | Scan completed: {scan.completed_at} | Regions: {scan.region}\n"
           f"Risk score: {scan.risk_score}/100 | Open findings by severity: {counts or 'none'}\n"
           f"Top open findings:\n" + ("\n".join(lines) or "(none)"))
    top = rows[:5]
    fallback = (f"I'm working from scan facts only right now (AI isn't available), so here's the straight summary.\n\n"
                f"Account `{scan.account_id}` · risk **{scan.risk_score}/100** · open findings: "
                + (", ".join(f"{v} {k.lower()}" for k, v in sorted(counts.items(), key=lambda kv: SEV_ORDER.get(kv[0], 9))) or "none")
                + ("\n\n**Fix first:**\n" + "\n".join(f"1. `{f.rule_id}` {f.title} — `{f.resource_name or f.resource.resource_id}`" for f in top) if top else ""))
    return ctx, fallback


@router.post("/chat", dependencies=[Depends(rate_limited)])
def chat(payload: Dict[str, Any] = Body(...), db: Session = Depends(get_db)):
    question = (payload.get("question") or "").strip()
    if not question:
        raise HTTPException(status_code=422, detail="question is required")
    ctx, fallback = _posture_context(db)
    answer, ai_used = copilot_engine.chat(question, payload.get("history") or [], ctx, fallback)
    return {"answer": answer, "ai": ai_used}

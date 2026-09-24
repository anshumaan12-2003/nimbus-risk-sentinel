"""Vesper, the assistant: streamed answers grounded in the latest scan, with saved conversations.

POST /assistant/chat streams Server-Sent Events:
  meta   {conversation_id, title}            once, before any text
  delta  {text}                              the answer, piece by piece
  done   {message_id, ai, citations, scan_completed_at}
  error  {detail}
Conversations belong to one user; every read and write is scoped to the signed-in user (404 otherwise).
"""
import json
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import latest_completed_scan
from app.api.routes.copilot import _posture_context, rate_limited
from app.auth.deps import get_current_user
from app.database import SessionLocal, get_db
from app.intelligence.copilot import copilot_engine
from app.models.assistant import AssistantMessage, Conversation
from app.models.finding import Finding
from app.models.user import User

router = APIRouter(prefix="/assistant", tags=["Vesper assistant"])

RULE_ID = re.compile(r"\b(?:IAM|S3|EC2|RDS)-\d{3}\b")


class PageContext(BaseModel):
    page: Optional[str] = Field(None, max_length=60)          # e.g. "findings"
    finding_id: Optional[str] = Field(None, max_length=36)


class ChatIn(BaseModel):
    question: str = Field(..., min_length=1, max_length=4000)
    conversation_id: Optional[str] = None
    context: Optional[PageContext] = None


class TitleIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)


class RatingIn(BaseModel):
    rating: Literal[-1, 0, 1]


def _iso(dt: Optional[datetime]) -> Optional[str]:
    if not dt:
        return None
    return (dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)).isoformat()


def _msg(m: AssistantMessage) -> dict[str, Any]:
    return {"id": m.id, "role": m.role, "text": m.text, "citations": m.citations or [], "ai": m.ai,
            "rating": m.rating, "created_at": _iso(m.created_at)}


def _own(db: Session, user: User, conversation_id: str) -> Conversation:
    c = db.get(Conversation, conversation_id)
    if not c or c.user_id != user.id:
        raise HTTPException(404, "Conversation not found")
    return c


@router.get("/conversations")
def list_conversations(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (db.query(Conversation).filter(Conversation.user_id == user.id)
            .order_by(Conversation.updated_at.desc()).limit(50).all())
    return [{"id": c.id, "title": c.title, "updated_at": _iso(c.updated_at), "messages": len(c.messages)} for c in rows]


@router.get("/conversations/{conversation_id}")
def get_conversation(conversation_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = _own(db, user, conversation_id)
    return {"id": c.id, "title": c.title, "updated_at": _iso(c.updated_at), "messages": [_msg(m) for m in c.messages]}


@router.patch("/conversations/{conversation_id}")
def rename_conversation(conversation_id: str, body: TitleIn, user: User = Depends(get_current_user),
                        db: Session = Depends(get_db)):
    c = _own(db, user, conversation_id)
    c.title = body.title.strip()
    db.commit()
    return {"id": c.id, "title": c.title}


@router.delete("/conversations/{conversation_id}", status_code=204)
def delete_conversation(conversation_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(_own(db, user, conversation_id))
    db.commit()


@router.patch("/messages/{message_id}")
def rate_message(message_id: str, body: RatingIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    m = db.get(AssistantMessage, message_id)
    if not m or m.role != "assistant" or m.conversation.user_id != user.id:
        raise HTTPException(404, "Message not found")
    m.rating = body.rating or None
    db.commit()
    return _msg(m)


def _page_context(db: Session, ctx: Optional[PageContext]) -> str:
    if not ctx:
        return ""
    lines = []
    if ctx.page:
        lines.append(f"The user is on the {ctx.page} page.")
    if ctx.finding_id:
        try:
            f = db.get(Finding, uuid.UUID(ctx.finding_id))   # findings use a UUID column
        except ValueError:
            f = None                                          # a malformed id is ignored, not an error
        if f:
            lines.append(f"They have this finding open: [{f.rule_id}] {f.title} | severity={f.severity.value} "
                         f"| resource={f.resource_name or ''} | region={f.region} | risk={f.risk_score} "
                         f"| why: {(f.description or '')[:400]}")
    return ("\n=== WHAT THE USER IS LOOKING AT ===\n" + "\n".join(lines)) if lines else ""


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@router.post("/chat")
def chat(body: ChatIn, user: User = Depends(rate_limited), db: Session = Depends(get_db)):
    question = body.question.strip()
    if not question:
        raise HTTPException(422, "question is required")

    if body.conversation_id:
        convo = _own(db, user, body.conversation_id)
    else:
        convo = Conversation(user_id=user.id, title=(question[:57] + "…") if len(question) > 60 else question)
        db.add(convo)
        db.flush()
    history = [{"role": m.role, "text": m.text} for m in convo.messages]
    db.add(AssistantMessage(conversation_id=convo.id, role="user", text=question))
    convo.updated_at = datetime.now(timezone.utc)
    db.commit()

    posture, fallback = _posture_context(db)
    context = posture + _page_context(db, body.context)
    scan = latest_completed_scan(db)
    scan_at = _iso(scan.completed_at) if scan else None
    convo_id, title = convo.id, convo.title

    def events():
        yield _sse("meta", {"conversation_id": convo_id, "title": title})
        parts: list[str] = []
        ai = False
        try:
            for piece in copilot_engine.chat_stream(question, history, context, fallback):
                if "ai" in piece:
                    ai = piece["ai"]
                else:
                    parts.append(piece["delta"])
                    yield _sse("delta", {"text": piece["delta"]})
        except Exception:  # never leave the reader with a spinner
            yield _sse("error", {"detail": "Vesper couldn't finish this answer. Try again."})
        text = "".join(parts).strip()
        citations = list(dict.fromkeys(RULE_ID.findall(text)))
        # The request's session is already closed while the body streams, so save with a fresh one.
        s = SessionLocal()
        try:
            m = AssistantMessage(conversation_id=convo_id, role="assistant", text=text, citations=citations, ai=ai)
            s.add(m)
            c = s.get(Conversation, convo_id)
            if c:
                c.updated_at = datetime.now(timezone.utc)
            s.commit()
            yield _sse("done", {"message_id": m.id, "ai": ai, "citations": citations, "scan_completed_at": scan_at})
        finally:
            s.close()

    return StreamingResponse(events(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

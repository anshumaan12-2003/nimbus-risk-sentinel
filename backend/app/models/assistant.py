"""Vesper, the assistant: saved conversations per user.

A conversation belongs to exactly one user; nobody else can read it (not even admins), because
questions can quote sensitive findings. Messages keep the rule ids they cited and the reader's
thumbs up/down, so answers can be audited and improved.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database import Base


def _now():
    return datetime.now(timezone.utc)


class Conversation(Base):
    __tablename__ = "assistant_conversations"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(120), nullable=False, default="New conversation")
    created_at = Column(DateTime(timezone=True), default=_now)
    updated_at = Column(DateTime(timezone=True), default=_now, index=True)

    messages = relationship("AssistantMessage", back_populates="conversation", cascade="all, delete-orphan",
                            order_by="AssistantMessage.created_at")


class AssistantMessage(Base):
    __tablename__ = "assistant_messages"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    conversation_id = Column(String(36), ForeignKey("assistant_conversations.id", ondelete="CASCADE"),
                             nullable=False, index=True)
    role = Column(String(16), nullable=False)             # "user" | "assistant"
    text = Column(Text, nullable=False, default="")
    citations = Column(JSON, nullable=True)                # rule ids the answer referred to, e.g. ["RDS-001"]
    ai = Column(Boolean, nullable=True)                    # False = factual fallback (AI off or failed)
    rating = Column(Integer, nullable=True)                # 1 / -1 from the reader, None = not rated
    created_at = Column(DateTime(timezone=True), default=_now)

    conversation = relationship("Conversation", back_populates="messages")

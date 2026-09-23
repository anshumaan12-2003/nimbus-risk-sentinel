"""Users, roles and refresh sessions.

Roles are ordered: viewer < engineer < approver < admin. Each role includes the ones below it.
  viewer    read everything
  engineer  + run scans, triage findings, dry-run and *request* remediation
  approver  + approve / reject remediation requests (which applies the fix)
  admin     + manage users
"""
import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Enum as SAEnum, ForeignKey, Integer, String

from app.database import Base


def _now():
    return datetime.now(timezone.utc)


class Role(str, enum.Enum):
    VIEWER = "viewer"
    ENGINEER = "engineer"
    APPROVER = "approver"
    ADMIN = "admin"

    @property
    def rank(self) -> int:
        return ROLE_RANK[self]


ROLE_RANK = {Role.VIEWER: 0, Role.ENGINEER: 1, Role.APPROVER: 2, Role.ADMIN: 3}


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(320), nullable=False, unique=True, index=True)   # stored lower-cased
    name = Column(String(200), nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(SAEnum(Role, values_callable=lambda e: [m.value for m in e], name="user_role"),
                  nullable=False, default=Role.VIEWER)
    is_active = Column(Boolean, nullable=False, default=True)
    # Bumped on password change / role change / deactivation -> every issued token dies immediately
    token_version = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), default=_now)
    last_login_at = Column(DateTime(timezone=True), nullable=True)


class RefreshSession(Base):
    """One row per signed-in browser. Only a SHA-256 of the refresh token is stored, so a DB leak
    does not hand out live sessions. Rotated on every refresh; reuse of an old token revokes the family."""
    __tablename__ = "refresh_sessions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    family_id = Column(String(36), nullable=False, index=True)
    token_hash = Column(String(64), nullable=False, unique=True, index=True)
    created_at = Column(DateTime(timezone=True), default=_now)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    rotated_at = Column(DateTime(timezone=True), nullable=True)   # set when replaced by a newer token
    user_agent = Column(String(300), nullable=True)

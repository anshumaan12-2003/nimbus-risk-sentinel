"""FastAPI dependencies: who is calling, and are they allowed to."""
from __future__ import annotations

import jwt
from fastapi import Depends, HTTPException, WebSocket, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.auth.security import decode_access_token
from app.database import SessionLocal, get_db
from app.models.user import ROLE_RANK, Role, User

_bearer = HTTPBearer(auto_error=False)


def _unauthorized(detail: str = "Not signed in"):
    return HTTPException(status.HTTP_401_UNAUTHORIZED, detail, headers={"WWW-Authenticate": "Bearer"})


def user_from_token(token: str, db: Session) -> User:
    try:
        claims = decode_access_token(token)
    except jwt.ExpiredSignatureError:
        raise _unauthorized("Session expired")
    except jwt.InvalidTokenError:
        raise _unauthorized("Invalid token")
    user = db.get(User, claims["sub"])
    # token_version check: role change / password change / deactivation kills old tokens at once
    if not user or not user.is_active or user.token_version != claims.get("ver"):
        raise _unauthorized("Session revoked")
    return user


def get_current_user(creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
                     db: Session = Depends(get_db)) -> User:
    if not creds or creds.scheme.lower() != "bearer":
        raise _unauthorized()
    return user_from_token(creds.credentials, db)


def require_role(minimum: Role):
    """Dependency factory: `Depends(require_role(Role.ENGINEER))`. Roles are hierarchical."""
    def checker(user: User = Depends(get_current_user)) -> User:
        if ROLE_RANK[user.role] < ROLE_RANK[minimum]:
            raise HTTPException(status.HTTP_403_FORBIDDEN,
                                f"Requires the {minimum.value} role (you are {user.role.value}).")
        return user
    checker.__name__ = f"require_{minimum.value}"
    return checker


viewer = require_role(Role.VIEWER)
engineer = require_role(Role.ENGINEER)
approver = require_role(Role.APPROVER)
admin = require_role(Role.ADMIN)


def websocket_user(websocket: WebSocket) -> User | None:
    """Browsers cannot set headers on a WebSocket, so the access token comes as ?token=.
    It is short-lived (15 min) and only checked at connect time."""
    token = websocket.query_params.get("token")
    if not token:
        return None
    db = SessionLocal()
    try:
        return user_from_token(token, db)
    except HTTPException:
        return None
    finally:
        db.close()

"""
Authentication.
  GET  /auth/status           is first-run setup needed?
  POST /auth/setup            create the first admin (only while there are zero users)
  POST /auth/login            email + password -> access token (body) + refresh cookie
  POST /auth/refresh          refresh cookie -> new access token, cookie rotated
  POST /auth/logout           revoke this browser's session
  GET  /auth/me               who am I
  POST /auth/change-password  signs out every other session
"""
from __future__ import annotations

import hmac
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.auth.security import (create_access_token, hash_password, hash_token, new_refresh_token,
                               password_problem, verify_password)
from app.config import settings
from app.database import get_db
from app.models.user import RefreshSession, Role, User
from app.schemas.auth import (ChangePasswordRequest, LoginRequest, SetupRequest, TokenResponse, UserOut)
from app.utils.ratelimit import SlidingWindow

router = APIRouter(prefix="/auth", tags=["Auth"])

COOKIE = "nimbus_rt"
COOKIE_PATH = "/api/v1/auth"
# 5 failed logins per email+IP in 15 minutes, then locked out for the rest of the window
_failed_logins = SlidingWindow(limit=5, window_seconds=15 * 60)


def _utcnow():
    return datetime.now(timezone.utc)


def _aware(dt: datetime | None) -> datetime | None:
    return dt.replace(tzinfo=timezone.utc) if dt and dt.tzinfo is None else dt   # SQLite drops tzinfo


def _set_cookie(response: Response, token: str):
    response.set_cookie(COOKIE, token, max_age=settings.REFRESH_TOKEN_DAYS * 86400, httponly=True,
                        secure=settings.COOKIE_SECURE, samesite=settings.COOKIE_SAMESITE, path=COOKIE_PATH)


def _clear_cookie(response: Response):
    response.delete_cookie(COOKIE, path=COOKIE_PATH, secure=settings.COOKIE_SECURE,
                           httponly=True, samesite=settings.COOKIE_SAMESITE)


def _issue(db: Session, user: User, request: Request, response: Response, family_id: str | None = None) -> TokenResponse:
    token, digest = new_refresh_token()
    db.add(RefreshSession(user_id=user.id, family_id=family_id or str(uuid.uuid4()), token_hash=digest,
                          expires_at=_utcnow() + timedelta(days=settings.REFRESH_TOKEN_DAYS),
                          user_agent=(request.headers.get("user-agent") or "")[:300]))
    db.commit()
    _set_cookie(response, token)
    access, ttl = create_access_token(user)
    return TokenResponse(access_token=access, expires_in=ttl, user=UserOut.model_validate(user))


@router.get("/status")
def auth_status(db: Session = Depends(get_db)):
    return {"setup_required": db.query(User).count() == 0,
            "setup_token_required": bool(settings.SETUP_TOKEN),
            "password_min_length": settings.PASSWORD_MIN_LENGTH,
            "two_person_rule": settings.REMEDIATION_TWO_PERSON_RULE}


@router.post("/setup", response_model=TokenResponse, status_code=201)
def setup_first_admin(body: SetupRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    if db.query(User).count() > 0:
        raise HTTPException(status.HTTP_409_CONFLICT, "Setup is already complete. Sign in instead.")
    if settings.SETUP_TOKEN and not hmac.compare_digest(body.setup_token or "", settings.SETUP_TOKEN):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Setup token is incorrect.")
    if problem := password_problem(body.password):
        raise HTTPException(422, problem)
    user = User(email=body.email, name=body.name.strip(), password_hash=hash_password(body.password),
                role=Role.ADMIN, last_login_at=_utcnow())
    db.add(user)
    db.commit()
    return _issue(db, user, request, response)


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    key = f"{body.email}|{request.client.host if request.client else '-'}"
    if _failed_logins.blocked(key):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                            f"Too many failed sign-ins. Try again in {_failed_logins.retry_after(key) // 60 + 1} minutes.")
    user = db.query(User).filter(User.email == body.email).first()
    ok, new_hash = verify_password(body.password, user.password_hash if user else None)
    if not ok or not user or not user.is_active:
        _failed_logins.hit(key)
        # one message for every failure: do not reveal which emails exist or are disabled
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Email or password is incorrect.")
    _failed_logins.reset(key)
    if new_hash:
        user.password_hash = new_hash
    user.last_login_at = _utcnow()
    return _issue(db, user, request, response)


@router.post("/refresh", response_model=TokenResponse)
def refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    token = request.cookies.get(COOKIE)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in")
    sess = db.query(RefreshSession).filter(RefreshSession.token_hash == hash_token(token)).first()
    if not sess:
        _clear_cookie(response)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session not found")
    rotated = _aware(sess.rotated_at)
    if rotated and (_utcnow() - rotated).total_seconds() <= settings.REFRESH_REUSE_GRACE_SECONDS:
        # Two tabs refreshed with the same cookie within seconds: benign race, not theft.
        # Issue a sibling session in the same family instead of signing everyone out.
        user = db.get(User, sess.user_id)
        if user and user.is_active:
            return _issue(db, user, request, response, family_id=sess.family_id)
    if sess.revoked_at is not None:
        # A rotated token came back after the grace window: someone else holds a copy.
        # Kill the whole family.
        db.query(RefreshSession).filter(RefreshSession.family_id == sess.family_id,
                                        RefreshSession.revoked_at.is_(None)).update({"revoked_at": _utcnow()})
        db.commit()
        _clear_cookie(response)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session reuse detected — signed out everywhere for this login")
    user = db.get(User, sess.user_id)
    if _aware(sess.expires_at) < _utcnow() or not user or not user.is_active:
        sess.revoked_at = _utcnow()
        db.commit()
        _clear_cookie(response)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired")
    sess.revoked_at = sess.rotated_at = _utcnow()   # rotate
    return _issue(db, user, request, response, family_id=sess.family_id)


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    token = request.cookies.get(COOKIE)
    if token:
        sess = db.query(RefreshSession).filter(RefreshSession.token_hash == hash_token(token)).first()
        if sess and sess.revoked_at is None:
            sess.revoked_at = _utcnow()
            db.commit()
    _clear_cookie(response)
    response.status_code = 204
    return response


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.post("/change-password", response_model=TokenResponse)
def change_password(body: ChangePasswordRequest, request: Request, response: Response,
                    user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ok, _ = verify_password(body.current_password, user.password_hash)
    if not ok:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect.")
    if problem := password_problem(body.new_password):
        raise HTTPException(422, problem)
    user.password_hash = hash_password(body.new_password)
    user.token_version += 1
    db.query(RefreshSession).filter(RefreshSession.user_id == user.id,
                                    RefreshSession.revoked_at.is_(None)).update({"revoked_at": _utcnow()})
    db.commit()
    return _issue(db, user, request, response)

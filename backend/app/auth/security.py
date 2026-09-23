"""
Password hashing, access tokens and refresh tokens.

Design (and why):
  * Argon2id via pwdlib — memory-hard, the OWASP first choice; verify_and_update re-hashes old
    hashes transparently if parameters are raised later.
  * Access token: HS256 JWT, 15 minutes, kept only in browser memory (never localStorage, so an
    XSS bug cannot read a long-lived credential out of storage).
  * Refresh token: 256-bit random string in an httpOnly cookie scoped to /api/v1/auth. Only its
    SHA-256 is stored. Rotated on every refresh; presenting an already-rotated token means it was
    stolen, so the whole session family is revoked.
  * Every request re-loads the user: a role change or deactivation takes effect on the next call,
    not when the token expires (token_version is bumped and checked).
"""
from __future__ import annotations

import hashlib
import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from pwdlib import PasswordHash

from app.config import settings

logger = logging.getLogger(__name__)
_hasher = PasswordHash.recommended()
_DUMMY_HASH = _hasher.hash(secrets.token_urlsafe(24))   # equalises login timing for unknown emails

ISSUER = "nimbus-risk-sentinel"
WEAK_SECRETS = {"change-me-in-production-super-secret-key", "generate-with-openssl-rand-hex-32", "", "secret"}


def check_secret_key():
    weak = settings.SECRET_KEY in WEAK_SECRETS or len(settings.SECRET_KEY) < 32
    if not weak:
        return
    msg = ("SECRET_KEY is missing or a placeholder. Anyone who knows it can mint admin tokens. "
           "Generate one with `openssl rand -hex 32` and put it in backend/.env.")
    if settings.DEBUG:
        logger.warning("%s (allowed because DEBUG=true)", msg)
    else:
        raise RuntimeError(msg)


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> tuple[bool, str | None]:
    """Returns (ok, new_hash_if_rehash_needed). Constant-ish time even when the user does not exist."""
    if not password_hash:
        _hasher.verify(password, _DUMMY_HASH)
        return False, None
    try:
        return _hasher.verify_and_update(password, password_hash)
    except Exception:
        return False, None


def password_problem(password: str) -> str | None:
    if len(password or "") < settings.PASSWORD_MIN_LENGTH:
        return f"Password must be at least {settings.PASSWORD_MIN_LENGTH} characters."
    if len(password) > 256:
        return "Password must be at most 256 characters."
    return None


def generate_password() -> str:
    return secrets.token_urlsafe(15)   # ~20 chars, shown once to the admin


def create_access_token(user) -> tuple[str, int]:
    ttl = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    now = datetime.now(timezone.utc)
    claims = {"sub": user.id, "email": user.email, "role": user.role.value, "ver": user.token_version,
              "typ": "access", "iss": ISSUER, "iat": now, "exp": now + ttl, "jti": uuid.uuid4().hex}
    return jwt.encode(claims, settings.SECRET_KEY, algorithm=settings.ALGORITHM), int(ttl.total_seconds())


def decode_access_token(token: str) -> dict:
    claims = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM], issuer=ISSUER,
                        options={"require": ["exp", "sub", "iss"]})
    if claims.get("typ") != "access":
        raise jwt.InvalidTokenError("wrong token type")
    return claims


def new_refresh_token() -> tuple[str, str]:
    token = secrets.token_urlsafe(32)
    return token, hash_token(token)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()

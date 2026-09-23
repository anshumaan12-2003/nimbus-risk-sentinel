"""User management. Listing is open to every signed-in user (the Remediation board needs assignees);
changes are admin-only. Guard rails: you cannot lock yourself out, and the last admin cannot be removed."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth.deps import admin, viewer
from app.auth.security import generate_password, hash_password, password_problem
from app.database import get_db
from app.models.user import RefreshSession, Role, User
from app.schemas.auth import UserCreate, UserOut, UserUpdate

router = APIRouter(prefix="/users", tags=["Users"])


def _revoke_sessions(db: Session, user: User):
    user.token_version += 1
    db.query(RefreshSession).filter(RefreshSession.user_id == user.id, RefreshSession.revoked_at.is_(None)) \
        .update({"revoked_at": datetime.now(timezone.utc)})


def _active_admins(db: Session) -> int:
    return db.query(User).filter(User.role == Role.ADMIN, User.is_active.is_(True)).count()


@router.get("", response_model=list[UserOut])
def list_users(_: User = Depends(viewer), db: Session = Depends(get_db)):
    return db.query(User).order_by(User.is_active.desc(), User.name).all()


@router.post("", status_code=201)
def create_user(body: UserCreate, _: User = Depends(admin), db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(409, "A user with that email already exists.")
    temp = None
    password = body.password
    if not password:
        password = temp = generate_password()
    elif problem := password_problem(password):
        raise HTTPException(422, problem)
    user = User(email=body.email, name=body.name.strip(), role=body.role, password_hash=hash_password(password))
    db.add(user)
    db.commit()
    return {"user": UserOut.model_validate(user).model_dump(mode="json"), "temporary_password": temp}


@router.patch("/{user_id}", response_model=UserOut)
def update_user(user_id: str, body: UserUpdate, me: User = Depends(admin), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    demoting = body.role is not None and body.role != Role.ADMIN and user.role == Role.ADMIN
    disabling = body.is_active is False and user.is_active
    if user.id == me.id and (demoting or disabling):
        raise HTTPException(400, "You cannot demote or deactivate yourself. Ask another admin.")
    if (demoting or (disabling and user.role == Role.ADMIN)) and _active_admins(db) <= 1:
        raise HTTPException(400, "This is the last active admin.")
    if body.name is not None:
        user.name = body.name.strip()
    if (body.role is not None and body.role != user.role) or disabling or body.is_active is True:
        _revoke_sessions(db, user)   # new permissions apply on the very next request
    if body.role is not None:
        user.role = body.role
    if body.is_active is not None:
        user.is_active = body.is_active
    db.commit()
    return user


@router.post("/{user_id}/reset-password")
def reset_password(user_id: str, _: User = Depends(admin), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    temp = generate_password()
    user.password_hash = hash_password(temp)
    _revoke_sessions(db, user)
    db.commit()
    return {"temporary_password": temp}

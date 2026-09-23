from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.models.user import Role


class _Email(BaseModel):
    email: str

    @field_validator("email")
    @classmethod
    def normalise(cls, v: str) -> str:
        v = (v or "").strip().lower()
        if "@" not in v or len(v) > 320 or v.startswith("@") or v.endswith("@"):
            raise ValueError("Enter a valid email address")
        return v


class LoginRequest(_Email):
    password: str = Field(min_length=1, max_length=256)


class SetupRequest(_Email):
    name: str = Field(min_length=1, max_length=200)
    password: str
    setup_token: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    role: Role
    is_active: bool
    created_at: Optional[datetime] = None
    last_login_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut


class UserCreate(_Email):
    name: str = Field(min_length=1, max_length=200)
    role: Role = Role.VIEWER
    password: Optional[str] = None      # omitted -> a one-time password is generated and returned


class UserUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    role: Optional[Role] = None
    is_active: Optional[bool] = None

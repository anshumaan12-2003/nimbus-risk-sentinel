import os
from typing import Optional

try:
    from pydantic_settings import BaseSettings
except ImportError:
    try:
        from pydantic import BaseSettings
    except ImportError:
        class BaseSettings:
            def __init__(self, **kwargs):
                for k, v in self.__class__.__dict__.items():
                    if not k.startswith("_") and not callable(v) and not isinstance(v, property):
                        env_val = os.getenv(k)
                        if env_val is not None:
                            setattr(self, k, env_val)
                        else:
                            setattr(self, k, v)
                for k, v in kwargs.items():
                    setattr(self, k, v)


class Settings(BaseSettings):
    # App
    APP_NAME: str = "Breachpath Cloud Recon"
    APP_VERSION: str = "1.3.0"
    DEBUG: bool = True

    # Database
    DATABASE_URL: str = "sqlite:///./nimbus.db"

    # Redis / Celery
    REDIS_URL: str = "redis://redis:6379/0"
    CELERY_BROKER_URL: str = "redis://redis:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://redis:6379/0"

    # AWS
    AWS_ACCESS_KEY_ID: Optional[str] = None
    AWS_SECRET_ACCESS_KEY: Optional[str] = None
    AWS_SESSION_TOKEN: Optional[str] = None    # only for temporary (STS/SSO) keys; they expire
    AWS_DEFAULT_REGION: str = "us-east-1"
    AWS_ROLE_ARN: Optional[str] = None
    AWS_EXTERNAL_ID: Optional[str] = None      # required on the cross-account role trust policy
    AWS_PROFILE: Optional[str] = None          # use a named/SSO profile instead of static keys

    # Remediation safety: dry-runs always work; real writes need this set to true
    REMEDIATION_ENABLED: bool = False
    AWS_REMEDIATION_ROLE_ARN: Optional[str] = None  # separate write role (least privilege)

    # Attack graph: tag keys/values or name hints that mark "crown jewel" data stores
    CROWN_JEWEL_TAG_KEYS: str = "data-classification,DataClassification,sensitivity,crown-jewel"
    CROWN_JEWEL_NAME_HINTS: str = "prod,finance,customer,payment,pii,backup,billing"

    # Execution: "background" (in-process, zero infra) or "celery" (Redis + worker + beat)
    SCAN_EXECUTOR: str = "background"
    # Events: "memory" (single API process) or "redis" (needed when Celery workers emit events)
    EVENTS_BACKEND: str = "memory"

    # Real-time events
    FRONTEND_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173"

    # AI Copilot
    AI_API_KEY: Optional[str] = None
    AI_PROVIDER: str = "gemini"  # 'gemini' or 'openai'
    AI_MODEL: str = "gemini-flash-latest"   # override with any current Gemini model id
    AWS_REGIONS: str = "us-east-1"

    # Auth
    SECRET_KEY: str = "change-me-in-production-super-secret-key"   # openssl rand -hex 32
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15      # short: lives only in browser memory
    REFRESH_TOKEN_DAYS: int = 7                # httpOnly cookie, rotated on every use
    REFRESH_REUSE_GRACE_SECONDS: int = 30      # two tabs refreshing at once is not an attack
    COOKIE_SECURE: bool = False                # true behind HTTPS
    COOKIE_SAMESITE: str = "strict"            # "lax" if the UI and API are on different sites
    PASSWORD_MIN_LENGTH: int = 12
    SETUP_TOKEN: Optional[str] = None          # if set, first-admin setup requires it
    # Four-eyes: the approver must be a different person from the requester.
    # Set false only for a one-person personal account; audit rows then say "self-approved".
    REMEDIATION_TWO_PERSON_RULE: bool = True
    COPILOT_REQUESTS_PER_MINUTE: int = 20      # per user; Gemini calls cost money

    # Scan
    SCAN_INTERVAL_MINUTES: int = 15
    # Re-scan automatically every SCAN_INTERVAL_MINUTES. With SCAN_EXECUTOR=celery, Celery beat does this
    # instead; with "background" the API process runs its own scheduler. 0/false disables it.
    SCHEDULED_SCANS_ENABLED: bool = True

    # Slack
    SLACK_WEBHOOK_URL: Optional[str] = None
    SLACK_ENABLED: bool = False

    @property
    def crown_tag_keys(self) -> list[str]:
        return [k.strip() for k in self.CROWN_JEWEL_TAG_KEYS.split(",") if k.strip()]

    @property
    def crown_name_hints(self) -> list[str]:
        return [k.strip().lower() for k in self.CROWN_JEWEL_NAME_HINTS.split(",") if k.strip()]

    @property
    def frontend_origins(self) -> list[str]:
        return [o.strip() for o in self.FRONTEND_ORIGINS.split(",") if o.strip()]

    @property
    def aws_regions_list(self) -> list[str]:
        return [r.strip() for r in self.AWS_REGIONS.split(",") if r.strip()]

    class Config:
        env_file = (".env", "../.env")
        extra = "ignore"


settings = Settings()

"""
AWS session factory.

Credential resolution order (first match wins):
  1. AWS_ROLE_ARN            -> STS AssumeRole (optionally with AWS_EXTERNAL_ID), auto-refreshing
  2. AWS_PROFILE             -> named / SSO profile from ~/.aws/config  (recommended for local dev)
  3. AWS_ACCESS_KEY_ID/SECRET -> static keys (least preferred; rotate often)
  4. default provider chain  -> env vars, instance profile, ECS task role, etc.

Why a cached Session instead of boto3.client(...) everywhere:
  - one STS call per process instead of one per client (AssumeRole is rate limited)
  - RefreshableCredentials renew the 1h role session automatically during long scans
  - adaptive retry mode backs off on API throttling instead of failing the scan
"""
from __future__ import annotations

import threading
from typing import Any, Optional

try:
    import boto3
    from botocore.config import Config
    from botocore.credentials import RefreshableCredentials
    from botocore.session import get_session
except ImportError:  # pragma: no cover
    boto3 = None

from app.config import settings

_BOTO_CONFIG = Config(retries={"max_attempts": 10, "mode": "adaptive"}, connect_timeout=5, read_timeout=30) if boto3 else None
_lock = threading.Lock()
_sessions: dict[str, Any] = {}


def _base_session():
    if settings.AWS_PROFILE:
        return boto3.Session(profile_name=settings.AWS_PROFILE)
    if settings.AWS_ACCESS_KEY_ID and settings.AWS_SECRET_ACCESS_KEY:
        return boto3.Session(
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            aws_session_token=settings.AWS_SESSION_TOKEN or None,
        )
    return boto3.Session()


def credential_mode() -> str:
    """Which branch of the resolution order above is in effect (never includes secrets)."""
    if settings.AWS_ROLE_ARN:
        return "assume-role"
    if settings.AWS_PROFILE:
        return "profile"
    if settings.AWS_ACCESS_KEY_ID and settings.AWS_SECRET_ACCESS_KEY:
        return "temporary-keys" if settings.AWS_SESSION_TOKEN else "static-keys"
    return "default-chain"


def _assumed_session(role_arn: str, session_name: str):
    base = _base_session()

    def refresh():
        kwargs = {"RoleArn": role_arn, "RoleSessionName": session_name, "DurationSeconds": 3600}
        if settings.AWS_EXTERNAL_ID:
            kwargs["ExternalId"] = settings.AWS_EXTERNAL_ID
        creds = base.client("sts", config=_BOTO_CONFIG).assume_role(**kwargs)["Credentials"]
        return {
            "access_key": creds["AccessKeyId"],
            "secret_key": creds["SecretAccessKey"],
            "token": creds["SessionToken"],
            "expiry_time": creds["Expiration"].isoformat(),
        }

    refreshable = RefreshableCredentials.create_from_metadata(
        metadata=refresh(), refresh_using=refresh, method="sts-assume-role"
    )
    botocore_session = get_session()
    botocore_session._credentials = refreshable  # documented pattern for refreshable sessions
    return boto3.Session(botocore_session=botocore_session)


def get_session_for(purpose: str = "scan"):
    """purpose='scan' uses the read-only identity; purpose='remediate' uses the write role if configured."""
    if boto3 is None:
        raise RuntimeError("boto3 is not installed in this environment.")
    role = settings.AWS_REMEDIATION_ROLE_ARN if purpose == "remediate" and settings.AWS_REMEDIATION_ROLE_ARN else settings.AWS_ROLE_ARN
    key = f"{purpose}:{role or 'base'}"
    with _lock:
        if key not in _sessions:
            _sessions[key] = _assumed_session(role, f"Nimbus-{purpose}") if role else _base_session()
        return _sessions[key]


def reset_sessions():
    """Drop cached sessions (used by tests and after credential changes)."""
    with _lock:
        _sessions.clear()


def get_aws_client(service: str, region: Optional[str] = None, purpose: str = "scan") -> Any:
    region = region or settings.AWS_DEFAULT_REGION
    session = get_session_for(purpose)
    with _lock:  # boto3 Session.client() is not thread-safe; the returned clients are
        return session.client(service, region_name=region, config=_BOTO_CONFIG)


def get_aws_account_id() -> Optional[str]:
    try:
        return get_aws_client("sts").get_caller_identity()["Account"]
    except Exception:
        return None


# Backward-compatible alias used by remediators
get_boto3_client = get_aws_client
